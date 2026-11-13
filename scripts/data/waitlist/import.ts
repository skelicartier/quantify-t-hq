/**
 * "Bring in the old waitlist file" (spec §3.11): the founder's CSV with the header
 * `joined_on,full_name,title,company,firm_type,city,country,email,how_joined,proof,status,notes`
 * becomes one firm per row at Joined, keeping its date, how they joined and the proof. A
 * firm already on the waitlist is skipped, so bringing the same file in twice adds none.
 */

import { Refused } from "../../mail-merge/engine";
import { LIMITS, SECRET_MESSAGE, clean, isDay, looksSecret, normaliseEmail } from "../guard";
import { readCsv, rowRecord } from "../text";

export type OldRow = {
  line: number;
  email: string;
  joined_on: string;
  full_name: string;
  title: string;
  company: string;
  firm_type: string;
  city: string;
  country: string;
  how_joined: string;
  proof: string;
  notes: string;
};

export type OldFile = { rows: OldRow[]; refused: { line: number; reason: string }[] };

/** Besides `email`, at least one of these says it is the old waitlist and not some other list. */
const OLD_COLUMNS = ["joined_on", "company", "how_joined", "proof"] as const;
const MAX_ROWS = 5_000;

/** Read the old file's text; refusals are per line, and a file without its columns is refused whole. */
export function readOldFile(text: string): OldFile {
  const table = readCsv(text.replace(/^\ufeff/, ""));
  const keys = table.keys;
  if (!keys.includes("email") || !OLD_COLUMNS.some((key) => keys.includes(key)))
    throw new Refused(
      400,
      "invalid",
      "That file does not have the old waitlist's columns: joined_on, full_name, title, company, firm_type, city, country, email, how_joined, proof, status, notes.",
    );
  if (table.rows.length > MAX_ROWS)
    throw new Refused(400, "too_many", "That file has more than 5,000 rows; split it.");
  const rows: OldRow[] = [];
  const refused: { line: number; reason: string }[] = [];
  table.rows.forEach((cells, index) => {
    const line = index + 2;
    if (cells.every((cell) => !cell.trim())) return;
    const record = rowRecord(keys, cells);
    const email = normaliseEmail(clean(record.email, LIMITS.email));
    if (!email) {
      refused.push({ line, reason: "No address, or not an email address" });
      return;
    }
    const value = (key: string, limit: number = LIMITS.title) => clean(record[key], limit);
    const row: OldRow = {
      line,
      email,
      joined_on: isDay(value("joined_on", 10)) ? value("joined_on", 10) : "",
      full_name: value("full_name", LIMITS.name) || value("name", LIMITS.name),
      title: value("title"),
      company: value("company") || value("firm"),
      firm_type: value("firm_type"),
      city: value("city"),
      country: value("country"),
      how_joined: value("how_joined"),
      proof: value("proof", LIMITS.words),
      notes: value("notes", LIMITS.notes),
    };
    if (Object.values(row).some((cell) => typeof cell === "string" && looksSecret(cell))) {
      refused.push({ line, reason: SECRET_MESSAGE });
      return;
    }
    rows.push(row);
  });
  return { rows, refused };
}
