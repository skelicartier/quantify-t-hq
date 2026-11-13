/**
 * A list of people, read from a spreadsheet's CSV export.
 *
 * Every column is kept under a key made from its heading. The column of addresses is
 * found by its heading or, failing that, by what is in it. Every row of the file is
 * accounted for: it is on the list, or it is left out with the reason beside it.
 */

import { parseCsv } from "../../src/lib/crm/csv";
import { columnKey } from "./template";

export type ListColumn = {
  key: string;
  label: string;
  /** Worked out from another column rather than read from the file. */
  derived?: boolean;
};

export type ListRow = {
  id: string;
  email: string;
  /** For the "To" line: a full name where the file has one. */
  name: string;
  values: Record<string, string>;
};

export type LeftOut = { line: number; reason: string; value: string };

export type ImportedList = {
  columns: ListColumn[];
  email_column: string;
  rows: ListRow[];
  left_out: LeftOut[];
};

export class ImportRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportRefused";
  }
}

export const MAX_ROWS = 50_000;

const EMAIL_HEADINGS = new Set([
  "email",
  "e_mail",
  "email_address",
  "e_mail_address",
  "mail",
  "work_email",
  "business_email",
  "contact_email",
  "primary_email",
  "investor_email",
  "email_id",
]);
const FIRST_NAME_KEYS = ["first_name", "firstname", "first", "given_name", "forename"];
const LAST_NAME_KEYS = ["last_name", "lastname", "last", "surname", "family_name"];
const FULL_NAME_KEYS = ["full_name", "name", "contact_name", "contact", "investor_name", "person"];
const HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "sir", "shri", "smt"]);

const ADDRESS = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;

/** Lower-cased and trimmed, or "" when the text is not one plausible address. */
export function normaliseEmail(raw: string): string {
  const text = raw.trim().toLowerCase();
  if (!text || text.length > 254) return "";
  if (!/^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(text)) return "";
  const [local = "", domain = ""] = text.split("@");
  if (!local || local.length > 64 || local.startsWith(".") || local.endsWith(".")) return "";
  if (text.includes("..")) return "";
  const labels = domain.split(".");
  if (labels.some((label) => !label || label.startsWith("-") || label.endsWith("-"))) return "";
  if (!/^[a-z]{2,}$/.test(labels[labels.length - 1] ?? "")) return "";
  return text;
}

/** The first address in a cell: a sheet often holds "a@x.com; b@x.com" or "Name <a@x.com>". */
function addressIn(cell: string): string {
  const whole = normaliseEmail(cell);
  if (whole) return whole;
  const found = ADDRESS.exec(cell);
  return found ? normaliseEmail(found[0]) : "";
}

function uniqueKeys(header: readonly string[]): ListColumn[] {
  const taken = new Set<string>();
  return header.map((label, index) => {
    const base = columnKey(label) || `column_${index + 1}`;
    let key = base;
    for (let copy = 2; taken.has(key); copy += 1) key = `${base}_${copy}`;
    taken.add(key);
    return { key, label: label || `Column ${index + 1}` };
  });
}

function emailColumn(columns: readonly ListColumn[], rows: readonly string[][]): number {
  const byHeading = columns.findIndex((column) => EMAIL_HEADINGS.has(column.key));
  if (byHeading >= 0) return byHeading;
  // No heading says so: the column most of whose cells are addresses.
  let best = -1;
  let bestShare = 0;
  const sample = rows.slice(0, 500);
  columns.forEach((_column, index) => {
    const filled = sample.filter((cells) => (cells[index] ?? "").trim() !== "");
    if (filled.length === 0) return;
    const share = filled.filter((cells) => addressIn(cells[index] ?? "")).length / filled.length;
    if (share > bestShare) {
      best = index;
      bestShare = share;
    }
  });
  return bestShare >= 0.5 ? best : -1;
}

function firstOf(values: Readonly<Record<string, string>>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = (values[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

/** The name for the "To" line, from whichever name columns a row has. */
export function displayName(values: Readonly<Record<string, string>>): string {
  const full =
    firstOf(values, FULL_NAME_KEYS) ||
    [firstOf(values, FIRST_NAME_KEYS), firstOf(values, LAST_NAME_KEYS)].filter(Boolean).join(" ");
  return full.slice(0, 120);
}

/** "Dr. Asha Rao" is "Asha": the first word that is not a title. */
function givenName(full: string): string {
  const words = full.split(/\s+/).filter(Boolean);
  const first = words.find((word) => !HONORIFICS.has(word.replace(/\./g, "").toLowerCase()));
  return first ?? "";
}

/**
 * The separator a file uses. A spreadsheet set to a continental locale writes semicolons,
 * and "Unicode text" is tabs; both still call the file a CSV. Counted on the heading row,
 * outside quotes.
 */
function separatorOf(text: string): "," | ";" | "\t" {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (const char of source) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === "\n" || char === "\r")) break;
    else if (!quoted && (char === "," || char === ";" || char === "\t")) counts[char] += 1;
  }
  if (counts[","] >= counts[";"] && counts[","] >= counts["\t"]) return ",";
  return counts[";"] >= counts["\t"] ? ";" : "\t";
}

/** The same file with commas for its separator, so one reader reads them all. */
function asCommas(text: string, separator: ";" | "\t"): string {
  let out = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (char === '"') {
      quoted = !quoted;
      out += char;
    } else if (!quoted && char === separator) out += ",";
    else if (!quoted && char === ",") {
      // A bare comma inside a cell would split it: quote the cell from here to its end.
      let end = index;
      while (end < text.length && !/[\n\r]/.test(text[end]!) && text[end] !== separator) end += 1;
      let start = out.length;
      while (start > 0 && !/[\n\r,]/.test(out[start - 1]!)) start -= 1;
      out = `${out.slice(0, start)}"${out.slice(start).replace(/"/g, '""')}${text
        .slice(index, end)
        .replace(/"/g, '""')}"`;
      index = end - 1;
    } else out += char;
  }
  return out;
}

export function importCsv(text: string): ImportedList {
  const separator = separatorOf(text);
  const table = parseCsv(separator === "," ? text : asCommas(text, separator));
  if (table.header.length === 0 || table.header.every((name) => name === ""))
    throw new ImportRefused("The file has no heading row. The first row names the columns.");
  if (table.rows.length === 0)
    throw new ImportRefused("The file has a heading row and nobody under it.");
  if (table.rows.length > MAX_ROWS)
    throw new ImportRefused(
      `The file has ${table.rows.length.toLocaleString("en-GB")} rows; a list holds ${MAX_ROWS.toLocaleString("en-GB")}. Split it into two files.`,
    );
  const columns = uniqueKeys(table.header);
  const at = emailColumn(columns, table.rows);
  if (at < 0)
    throw new ImportRefused(
      "No column of email addresses was found. Name the column Email and try again.",
    );
  const hasFirstName = columns.some((column) => FIRST_NAME_KEYS.includes(column.key));
  const fullNameColumn = columns.find((column) => FULL_NAME_KEYS.includes(column.key));
  const deriveFirstName = !hasFirstName && fullNameColumn !== undefined;

  const rows: ListRow[] = [];
  const leftOut: LeftOut[] = [];
  const seen = new Set<string>();
  table.rows.forEach((cells, index) => {
    // Line 1 is the heading row; the file's blank lines were dropped by the reader.
    const line = index + 2;
    const raw = (cells[at] ?? "").trim();
    if (!raw) {
      leftOut.push({ line, reason: "No address", value: "" });
      return;
    }
    const email = addressIn(raw);
    if (!email) {
      leftOut.push({ line, reason: "Not an address", value: raw.slice(0, 120) });
      return;
    }
    if (seen.has(email)) {
      leftOut.push({ line, reason: "Already in this file", value: email });
      return;
    }
    seen.add(email);
    const values: Record<string, string> = {};
    columns.forEach((column, position) => {
      values[column.key] = (cells[position] ?? "").trim();
    });
    values.email = email;
    if (deriveFirstName) values.first_name = givenName(firstOf(values, FULL_NAME_KEYS));
    rows.push({ id: `r${rows.length + 1}`, email, name: displayName(values), values });
  });
  if (rows.length === 0)
    throw new ImportRefused(
      `None of the ${table.rows.length.toLocaleString("en-GB")} rows has a usable address in the "${columns[at]!.label}" column.`,
    );
  const listed: ListColumn[] = columns.map((column) => ({ ...column }));
  if (!listed.some((column) => column.key === "email"))
    listed.push({ key: "email", label: "Email", derived: true });
  if (deriveFirstName)
    listed.push({
      key: "first_name",
      label: `First name (from ${fullNameColumn!.label})`,
      derived: true,
    });
  return { columns: listed, email_column: columns[at]!.label, rows, left_out: leftOut };
}
