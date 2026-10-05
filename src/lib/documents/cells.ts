import type { ExportColumnType } from "@/lib/exports";
import { dateTimeInZone } from "@/lib/time-zone";

export type Cell = string | number | boolean | null;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseInstant(value: string): Date | null {
  // A bare date is a calendar day, not midnight somewhere: read it as UTC.
  const text = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
  const at = Date.parse(text);
  return Number.isNaN(at) ? null : new Date(at);
}

const pad = (value: number) => String(value).padStart(2, "0");

/** "1,200.00" — grouped, two decimals; the currency sits in its own column. */
export function formatMoney(value: number): string {
  return value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * How a cell reads in a document: dates spelled out, times in UTC and said so (a file is
 * shared across zones; the screen that made it may read in another), yes and no for a flag.
 */
export function displayCell(value: Cell, type: ExportColumnType): string {
  if (value === null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (type === "money" && typeof value === "number") return formatMoney(value);
  if (type === "percent" && typeof value === "number") return `${Number(value.toFixed(2))}%`;
  if (type === "number" && typeof value === "number") return value.toLocaleString("en-GB");
  if ((type === "date" || type === "datetime") && typeof value === "string") {
    const at = parseInstant(value);
    if (!at) return value;
    const day = `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}`;
    const dateOnly = type === "date" || /^\d{4}-\d{2}-\d{2}$/.test(value);
    return dateOnly ? day : `${day}, ${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())} UTC`;
  }
  return String(value);
}

/**
 * A spreadsheet's serial number for a date or an instant (UTC): days since 30 December
 * 1899, the epoch Excel and every program that reads its files count from.
 */
export function spreadsheetSerial(value: string, type: ExportColumnType): number | null {
  const at = parseInstant(value);
  if (!at) return null;
  const days = at.getTime() / 86_400_000 + 25_569;
  return type === "date" || /^\d{4}-\d{2}-\d{2}$/.test(value) ? Math.floor(days) : days;
}

/**
 * "1 Oct 2026, 08:02 UTC" for the line that says when a file was made — in the reader's
 * zone when one is given ("13:32 IST"), as the printed page's footer is.
 */
export function stampLabel(iso: string, zone = ""): string {
  return dateTimeInZone(parseInstant(iso) ?? new Date(), zone);
}

export function isNumericType(type: ExportColumnType): boolean {
  return type === "number" || type === "money" || type === "percent";
}
