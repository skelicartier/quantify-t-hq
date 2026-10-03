/**
 * A small CSV writer for files made in the browser from what is already on the page — the
 * rows an import left out, with the reason beside each. Nothing is fetched: the rows came
 * from the person's own file a moment ago.
 *
 * A cell a spreadsheet would run as a formula is defused the way the service's exports
 * are (`export_routes.safe_cell`): a leading quote, which a spreadsheet shows as text.
 */

const FORMULA_LEADS = ["=", "+", "-", "@", "\t", "\r"];

export function csvCell(value: string | number): string {
  let text = String(value);
  if (FORMULA_LEADS.some((lead) => text.startsWith(lead))) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(
  header: readonly string[],
  rows: readonly (readonly (string | number)[])[],
): string {
  return `${[header, ...rows].map((cells) => cells.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/** Hand text to the browser as a file to keep. Client-only. */
export function downloadText(filename: string, text: string): void {
  // A byte-order mark first, so a spreadsheet on any machine reads é and ₹ as written.
  const url = URL.createObjectURL(new Blob(["﻿", text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.replace(/[^A-Za-z0-9._-]/g, "_");
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
