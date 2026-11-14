/**
 * The closing's own limits (ws-notes/company/spec.md §9.3), and the small readers pilots,
 * diligence and the closing share: a whole amount of money, a typed day not after today,
 * and a copy kept in Files. `guard.ts` holds the limits every module shares and is not
 * edited this batch, so the ones new to C4 live here.
 */

import { Refused } from "../../mail-merge/engine";
import type { DataCore } from "../core";
import { LIMITS, clean, isDay } from "../guard";
import type { FileRow, FilesService } from "../leads/contracts";
import type { Staff } from "../protocol";

export const CLOSING_LIMITS = {
  holder_name: 200,
  email: 254,
  address: 400,
  backers: 200,
  backer_name: 200,
  fee_note: 300,
  what: 200,
  serial: 40,
  reference: 80,
  by_name: 120,
  words: 400,
  folio: 40,
  certificate: 40,
  note: 2_000,
  bank: 120,
  notes: 4_000,
} as const;

/** How many of each Data keeps (§9.3 "Totals"). */
export const CLOSE_TOTALS = { pilots: 500, diligence: 500, trials: 500, closings: 500 } as const;

export const MAX_MONEY = 1_000_000_000_000;

/** A copy comes in one JSON request as base64: at most 3 MiB, under the service's 6 MB. */
export const COPY_MAX_BYTES = 3 * 1024 * 1024;

export const FOLDERS = {
  fundraising: ["10 Fundraising and investors"],
  capTable: ["04 Cap table and share issues"],
  diligence: ["06 Contracts and NDAs", "Diligence"],
} as const;

export const invalid = (sentence: string): Refused => new Refused(400, "invalid", sentence);

/**
 * A whole amount as typed ("2500000", "25,00,000", 25_00_000): null when blank, a refusal
 * with the sentence when it is not a whole number from 1 to a trillion.
 */
export function wholeAmount(value: unknown, sentence: string, min = 1): number | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === "number" ? String(value) : clean(value, 40).replace(/[,\s_]/g, "");
  if (!text) return null;
  if (!/^\d+$/.test(text)) throw invalid(sentence);
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > MAX_MONEY) throw invalid(sentence);
  return parsed;
}

/** "INR" or "USD"; anything else is refused. */
export function currencyOf(value: unknown): "INR" | "USD" {
  const text = clean(value, 3).toUpperCase();
  if (text === "INR" || text === "USD") return text;
  throw invalid("Choose INR or USD.");
}

/** A typed day, not after today; null when blank and `optional`. */
export function pastDay(value: unknown, today: string, optional = false): string | null {
  const text = clean(value, 10);
  if (!text && optional) return null;
  if (!isDay(text)) throw invalid("That is not a day.");
  if (text > today) throw invalid("That day has not come yet.");
  return text;
}

/** A typed day, any day; null when blank. */
export function anyDay(value: unknown): string | null {
  const text = clean(value, 10);
  if (!text) return null;
  if (!isDay(text)) throw invalid("That is not a day.");
  return text;
}

/** A checkbox or a boolean in a body: true, "true", "on", "1", "yes". */
export function ticked(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const text = clean(value, 8).toLowerCase();
  return text === "true" || text === "on" || text === "1" || text === "yes";
}

/** One of a table's keys, or a refusal with the sentence. */
export function keyOf<T extends string>(
  value: unknown,
  keys: readonly T[],
  sentence: string,
  fallback?: T,
): T {
  const text = clean(value, 40);
  if (!text && fallback !== undefined) return fallback;
  if ((keys as readonly string[]).includes(text)) return text as T;
  throw invalid(sentence);
}

/**
 * A copy the record keeps (§2 rule 12, the waitlist's proof copy the model): `file_id`
 * for a file already in Files, or `content` (base64) and `name` put into the folder.
 * Null when neither was given. Without Files: 409 `files_missing`.
 */
export async function keepCopy(
  core: DataCore,
  body: Record<string, unknown>,
  prefix: string,
  place: { folder: readonly string[]; title: string; note: string; by: Staff },
): Promise<FileRow | null> {
  const fileId = clean(body[`${prefix}file_id`], 64);
  const content =
    typeof body[`${prefix}content`] === "string" ? String(body[`${prefix}content`]) : "";
  if (!fileId && !content) return null;
  const files = core.need<FilesService>("files");
  if (!files)
    throw new Refused(
      409,
      "files_missing",
      "Files is not set up here yet, so a copy cannot be kept.",
    );
  if (fileId) {
    const file = files.fileRow(fileId);
    if (!file || file.trashed_at) throw new Refused(404, "not_found", "That file is not in Files.");
    return file;
  }
  const bytes = Buffer.from(content, "base64");
  if (bytes.length === 0) throw new Refused(400, "empty", "That file is empty.");
  if (bytes.length > COPY_MAX_BYTES)
    throw new Refused(
      400,
      "too_large",
      "That copy is over 3 MB. Put it in Files, then attach it from there.",
    );
  const original =
    clean(body[`${prefix}name`], LIMITS.file_name).replace(/[\\/]/g, "_") || "Saved copy";
  return files.putFile({
    folderPath: [...place.folder],
    title: place.title.slice(0, LIMITS.title),
    originalName: original,
    bytes: new Uint8Array(bytes),
    by: place.by,
    note: place.note,
  });
}

/** "Data holds 500 closings at most." */
export function full(count: number, limit: number, what: string): void {
  if (count >= limit)
    throw new Refused(409, "full", `Data holds ${limit.toLocaleString("en-GB")} ${what} at most.`);
}
