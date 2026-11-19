/**
 * The CA's pack (ws-notes/duties/spec.md §9.9): one zip per press, made under core's `tmp/`
 * through the builds and never kept in Files, since it holds statements. Folders for the
 * statements, bills, sales invoices, the stipend sheet, TDS challans, GST returns and FIRAs,
 * and at the top an index with each file's SHA-256, the month's bills, the ledger map, the
 * month's lines and a README. Without the Owner flag there is no `Bank statements/`, no
 * `Stipend sheet/` and no lines file, and the README says so.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { Refused } from "../../mail-merge/engine";
import { dayWords } from "../../../src/lib/data/labels-company";
import { minorInput, periodWords } from "../../../src/lib/data/labels-duties";
import { CLOSE_ITEMS, accountLabel } from "../../../src/lib/data/labels-statements";
import type { BuildHandle, BuildInput } from "../builds";
import type { DataCore } from "../core";
import { localDay } from "../days";
import {
  periodEnd,
  periodOf,
  type CategoryView,
  type MoneyLookup,
  type PeoplePay,
} from "../duties-contracts";
import type { FilesService } from "../files/index";
import type { StatementsInside } from "../statements/index";
import { FILES_FOLDER } from "../statements/limits";
import { toCsv } from "../text";
import { ZipLimitError, ZipWriter, zipEntryName } from "../zip";
import type { Close } from "./types";

export type PackSources = {
  close: Close;
  statements: StatementsInside | null;
  money: MoneyLookup | null;
  people: PeoplePay | null;
  files: FilesService | null;
};

const FOLDERS = {
  statements: "Bank statements",
  bills: "Purchase bills",
  sales: "Sales invoices",
  stipends: "Stipend sheet",
  challans: "TDS challans",
  gst: "GST returns",
  firas: "FIRAs",
} as const;

type Entry =
  | { name: string; what: string; day: string; path: string }
  | { name: string; what: string; day: string; bytes: Uint8Array };

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const csvBytes = (text: string) => new TextEncoder().encode(`﻿${text}`);

/** What the pack would hold, without making it: the plan the zip and the page both use. */
export function planPack(
  core: DataCore,
  period: string,
  owner: boolean,
  sources: PackSources,
  made: { day: string; by: string },
): Entry[] {
  const entries: Entry[] = [];
  const taken = new Set<string>();
  const claim = (name: string) => {
    const base = zipEntryName(name);
    let unique = base;
    for (let copy = 2; taken.has(unique.toLowerCase()); copy += 1) {
      const slash = base.lastIndexOf("/");
      const dot = base.lastIndexOf(".");
      unique =
        dot > slash ? `${base.slice(0, dot)} (${copy})${base.slice(dot)}` : `${base} (${copy})`;
    }
    taken.add(unique.toLowerCase());
    return unique;
  };
  const first = `${period}-01`;
  const end = periodEnd(period);
  const { close, statements, money, people, files } = sources;

  // Bank statements: the Owner's pack only.
  if (owner && statements) {
    const book = statements.book;
    for (const statement of book.statements) {
      if (statement.withdrawn || statement.from > end || statement.to < first) continue;
      entries.push({
        name: claim(`${FOLDERS.statements}/${book.fileName(statement, "file")}`),
        what: "Bank statement, as the bank gave it",
        day: statement.to,
        path: core.store.path(FILES_FOLDER, statement.file.stored),
      });
      if (statement.copy)
        entries.push({
          name: claim(`${FOLDERS.statements}/${book.fileName(statement, "copy")}`),
          what: "The bank's own PDF of the statement",
          day: statement.to,
          path: core.store.path(FILES_FOLDER, statement.copy.stored),
        });
    }
  }

  // Money's files, and the files attached to the rows by hand.
  const fromFiles = (folder: string, fileId: string, what: string, name?: string) => {
    const version = files?.versionPath(fileId) ?? null;
    if (!version) return;
    entries.push({
      name: claim(`${folder}/${name ?? version.original_name}`),
      what,
      day: end,
      path: version.path,
    });
  };
  let pack: ReturnType<MoneyLookup["packFiles"]> | null = null;
  try {
    pack = money?.packFiles(period) ?? null;
  } catch {
    pack = null;
  }
  if (pack) {
    for (const file of pack.bills)
      fromFiles(file.folder || FOLDERS.bills, file.file_id, "Purchase bill", file.name);
    for (const file of pack.export_invoices)
      fromFiles(file.folder || FOLDERS.sales, file.file_id, "Export invoice", file.name);
    for (const file of pack.challans)
      fromFiles(file.folder || FOLDERS.challans, file.file_id, "TDS challan", file.name);
    for (const file of pack.firas)
      fromFiles(file.folder || FOLDERS.firas, file.file_id, "FIRA", file.name);
  }
  for (const id of close.items.sales_invoices.file_ids)
    fromFiles(FOLDERS.sales, id, "Sales invoice, attached");
  for (const id of close.items.gst_returns.file_ids)
    fromFiles(FOLDERS.gst, id, "GST return, attached");
  const none: [keyof Close["items"], string][] = [
    ["sales_invoices", FOLDERS.sales],
    ["bills", FOLDERS.bills],
    ["tds_challans", FOLDERS.challans],
    ["gst_returns", FOLDERS.gst],
    ["firas", FOLDERS.firas],
  ];
  for (const [key, folder] of none)
    if (close.items[key].state === "none_this_month" || close.items[key].state === "not_registered")
      entries.push({
        name: claim(
          `${folder}/${close.items[key].state === "not_registered" ? "not registered" : "none this month"}.txt`,
        ),
        what: `${CLOSE_ITEMS[key]}: ${close.items[key].state === "not_registered" ? "not registered" : "none this month"}`,
        day: end,
        bytes: new TextEncoder().encode(
          `${CLOSE_ITEMS[key]} for ${periodWords(period)}: ${close.items[key].state === "not_registered" ? "the company is not registered for GST" : "none this month"}.${close.items[key].note ? ` ${close.items[key].note}` : ""}\n`,
        ),
      });

  // The stipend sheet: the Owner's pack only.
  if (owner && people) {
    const paid = people.paid(first, end);
    entries.push({
      name: claim(`${FOLDERS.stipends}/stipends ${period}.csv`),
      what: "Stipend sheet: every payment of the month",
      day: end,
      bytes: csvBytes(
        toCsv(
          [
            "Paid on",
            "Name",
            "Kind",
            "For month",
            "Amount",
            "Currency",
            "Reference",
            "Tax deducted",
            "Tax treatment",
          ],
          paid.map((pay) => [
            pay.paid_on,
            pay.name,
            pay.kind,
            pay.period,
            minorInput(pay.amount_minor),
            pay.currency,
            pay.reference,
            pay.tds_deducted_minor === null ? "" : minorInput(pay.tds_deducted_minor),
            "CA to confirm",
          ]),
        ),
      ),
    });
  }

  // The registers at the top.
  let categories: CategoryView[] = [];
  try {
    categories = money?.categories() ?? statements?.categories() ?? [];
  } catch {
    categories = [];
  }
  const named = new Map(categories.map((category) => [category.category_id, category]));
  if (money) {
    let bills: ReturnType<MoneyLookup["bills"]> = [];
    try {
      bills = money.bills({ from: first, to: end });
    } catch {
      bills = [];
    }
    entries.push({
      name: claim(`bills ${period}.csv`),
      what: "Purchase register: the month's bills",
      day: end,
      bytes: csvBytes(
        toCsv(
          [
            "Invoice day",
            "Vendor",
            "Invoice number",
            "Currency",
            "Total",
            "Payable",
            "Open",
            "Category",
            "Ledger",
            "Pay by",
          ],
          bills.map((bill) => {
            const category = bill.category_id ? named.get(bill.category_id) : undefined;
            return [
              bill.invoice_on,
              bill.vendor_name,
              bill.invoice_number,
              bill.currency,
              minorInput(bill.total_minor),
              minorInput(bill.payable_minor),
              minorInput(bill.open_minor),
              category?.name ?? "",
              category?.ledger ?? "",
              bill.pay_by ?? "",
            ];
          }),
        ),
      ),
    });
  }
  entries.push({
    name: claim("ledger map.csv"),
    what: "Each category and the CA's ledger it maps to",
    day: end,
    bytes: csvBytes(
      toCsv(
        ["Category", "Kind", "Ledger", "Schedule III line"],
        categories
          .filter((category) => !category.retired)
          .map((category) => [
            category.name,
            category.kind,
            category.ledger,
            category.schedule_line,
          ]),
      ),
    ),
  });
  if (owner && statements) {
    const rows: string[][] = [];
    for (const account of statements.book.accounts)
      for (const line of statements.book.linesOf(account.account_id)) {
        if (line.withdrawn || periodOf(line.posted_on) !== period) continue;
        const category = line.category_id ? named.get(line.category_id) : undefined;
        rows.push([
          line.posted_on,
          accountLabel(account),
          line.narration,
          line.reference,
          line.direction === "debit" ? minorInput(line.amount_minor) : "",
          line.direction === "credit" ? minorInput(line.amount_minor) : "",
          account.currency,
          category?.name ?? "",
          category?.ledger ?? "",
        ]);
      }
    rows.sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? ""));
    entries.push({
      name: claim(`lines ${period}.csv`),
      what: "Every statement line of the month, with its category and ledger",
      day: end,
      bytes: csvBytes(
        toCsv(
          [
            "Day",
            "Account",
            "Narration",
            "Reference",
            "Out",
            "In",
            "Currency",
            "Category",
            "Ledger",
          ],
          rows,
        ),
      ),
    });
  }
  entries.push({
    name: claim("README.txt"),
    what: "What this pack is",
    day: made.day,
    bytes: new TextEncoder().encode(
      [
        `Made on ${dayWords(made.day)} by ${made.by} for ${periodWords(period)}.`,
        "",
        "Not the books of account: vouchers and a summary for the person who keeps them.",
        "index.csv lists every file here with its SHA-256, to check none changed.",
        owner
          ? "Bank statements, the stipend sheet and the lines file are in it: the Owner made this pack. Keep it as private as this Mac."
          : "Bank statements, the stipend sheet and the lines file are left out: only the Owner's pack holds them.",
        "",
      ].join("\n"),
    ),
  });
  return entries;
}

export async function makePack(
  core: DataCore,
  handle: BuildHandle,
  input: BuildInput,
  sources: (period: string) => PackSources,
): Promise<{ name: string; type: string }> {
  const period = String(input.body.period ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
    throw new Refused(400, "invalid", "Choose the month the pack is for.");
  const owner = input.body.owner === true;
  const day = localDay(core.now());
  const entries = planPack(core, period, owner, sources(period), { day, by: input.by.name });
  const name = `CA pack ${period}.zip`;
  handle.setName(name);
  handle.setProgress(0, entries.length + 1);
  const zip = new ZipWriter(handle.path);
  const index: string[][] = [];
  try {
    for (const [done, entry] of entries.entries()) {
      let bytes: Uint8Array;
      if ("path" in entry) {
        try {
          bytes = readFileSync(entry.path);
        } catch {
          continue;
        }
      } else bytes = entry.bytes;
      await zip.addBytes(entry.name, bytes);
      const slash = entry.name.lastIndexOf("/");
      index.push([
        slash < 0 ? "" : entry.name.slice(0, slash),
        entry.name.slice(slash + 1),
        entry.what,
        entry.day,
        sha256(bytes),
      ]);
      handle.setProgress(done + 1, entries.length + 1);
      if (done % 20 === 0) await core.yield();
    }
    await zip.addBytes(
      "index.csv",
      csvBytes(toCsv(["Folder", "File", "What it is", "Day", "SHA-256"], index)),
    );
    await zip.finish();
  } catch (error) {
    await zip.abort();
    if (error instanceof ZipLimitError) throw new Refused(400, "too_many", error.message);
    throw error;
  }
  core.log(`pack made: ${entries.length} files`);
  return { name, type: "application/zip" };
}
