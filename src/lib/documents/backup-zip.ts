import "server-only";

import { createHash } from "node:crypto";

import type { Backup } from "@/lib/api/backup";
import { zipStored } from "@/lib/documents/zip";

/**
 * A backup as one file to keep: a CSV per kind of record and a README that says what is in
 * it, who made it, who approved it, what it leaves out, and a SHA-256 for each file so a
 * copy can be checked against the day it was made.
 *
 * Cells are written as the service's exports write them (`export_routes.safe_cell`): a
 * value a spreadsheet would run as a formula starts with an apostrophe, a flag is yes or
 * no, and nothing is an empty cell. Each CSV starts with a byte-order mark.
 */

const FORMULA_LEADS = /^[=+\-@\t\r]/;

function csvCell(value: string | number | boolean | null): string {
  if (value === null) return "";
  let text = typeof value === "boolean" ? (value ? "yes" : "no") : String(value);
  if (FORMULA_LEADS.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csv(file: Backup["files"][number]): string {
  const lines = [
    file.columns.map((column) => csvCell(column.key)).join(","),
    ...file.table.map((row) => row.map(csvCell).join(",")),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function backupFilename(generatedAt: string): string {
  const stamp = generatedAt.slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
  return `hq-backup-${stamp}.zip`;
}

export function buildBackupZip(backup: Backup, company: string): Uint8Array {
  const encoder = new TextEncoder();
  const entries = backup.files.map((file) => ({
    name: `${file.name}.csv`,
    data: encoder.encode(csv(file)),
    title: file.title,
    rows: file.table.length,
  }));
  const sha = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
  const width = Math.max(...entries.map((entry) => entry.name.length));
  const readme = [
    `A backup of everything ${company || "the company"} keeps in HQ.`,
    "",
    `Made by:      ${backup.made_by}`,
    `Approved by:  ${backup.approved_by || "no second Owner existed, so it was made at once"}`,
    `Made at:      ${backup.generated_at} (UTC)`,
    `What for:     ${backup.reason}`,
    `Records:      ${backup.rows.toLocaleString("en-GB")}`,
    "",
    "Files (rows, then the SHA-256 of the file as written):",
    ...entries.map(
      (entry) =>
        `  ${entry.name.padEnd(width)}  ${String(entry.rows).padStart(7)}  ${sha(entry.data)}  ${entry.title}`,
    ),
    "",
    "Not in this file:",
    ...backup.excluded.map((line) => `  - ${line}`),
    "",
    "How the cells are written: dates and times are UTC; money has its currency in its own",
    "column and figures are never added across currencies; a value a spreadsheet would run",
    "as a formula starts with an apostrophe; yes and no are flags. Record IDs are kept, so",
    "rows in one file can be matched to another (a deal's company, an activity's record).",
    "",
    "This backup is recorded in HQ's audit log and in its export ledger.",
    "",
  ].join("\r\n");
  return zipStored(
    [
      { name: "README.txt", data: encoder.encode(readme) },
      ...entries.map(({ name, data }) => ({ name, data })),
    ],
    new Date(backup.generated_at),
  );
}
