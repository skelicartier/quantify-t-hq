/**
 * Keeping a copy in Files (ws-notes/company/spec.md §2 rule 12), as the waitlist's proof
 * copy does: either a file already in Files (`file_id`, not in the trash) or the bytes as
 * base64 (`content` and `name`, at most 3 MiB), put into a named folder through the files
 * service. Used by meetings (signed minutes), members (certificates) and agreements (signed
 * copies); members and agreements import it from here, so either can be left out cleanly.
 * Also the "which file" choices the forms list, read from Files' own index.
 */

import { Refused } from "../../mail-merge/engine";
import { readVault } from "../backup/vault-index";
import type { DataCore } from "../core";
import { LIMITS, clean } from "../guard";
import type { FileRow, FilesService } from "../leads/contracts";
import type { Staff } from "../protocol";
import { DEFAULT_FOLDERS } from "../../../src/lib/data/labels";

type Input = Record<string, unknown>;

/** A copy comes in one JSON request: base64 grows it by a third, under the service's 6 MB. */
export const COPY_MAX_BYTES = 3 * 1024 * 1024;
const FILES_SHOWN = 500;

export const FILES_MISSING = "Files is not set up here yet, so a copy cannot be kept.";

/** A default folder's name by its key ("meetings" → "02 Board and shareholder meetings"). */
export function folderNamed(key: string, fallback: string): string {
  return DEFAULT_FOLDERS.find((folder) => folder.key === key)?.name ?? fallback;
}

/** Whether the request carries a copy at all. */
export function copyGiven(input: Input): boolean {
  return (
    Boolean(clean(input.file_id, 64)) || (typeof input.content === "string" && input.content !== "")
  );
}

/**
 * Checks a copy before anything else is written: the file is in Files, or the bytes are
 * there and small enough. Throws the sentence the page shows.
 */
export function checkCopy(core: DataCore, input: Input): void {
  const files = core.need<FilesService>("files");
  if (!files) throw new Refused(409, "files_missing", FILES_MISSING);
  const fileId = clean(input.file_id, 64);
  if (fileId) {
    const row = files.fileRow(fileId);
    if (!row || row.trashed_at) throw new Refused(404, "not_found", "That file is not in Files.");
    return;
  }
  const content = typeof input.content === "string" ? input.content : "";
  if (!content) throw new Refused(400, "empty", "Choose the copy first.");
  const bytes = Buffer.from(content, "base64");
  if (bytes.length === 0) throw new Refused(400, "empty", "That file is empty.");
  if (bytes.length > COPY_MAX_BYTES)
    throw new Refused(
      400,
      "too_large",
      "That copy is over 3 MB. Put it in Files, then choose it from there.",
    );
}

/** Keeps the copy (after `checkCopy`): the file chosen, or the bytes put into the folder. */
export async function keepCopy(
  core: DataCore,
  input: Input,
  place: { folder: string[]; title: string; note: string },
  by: Staff,
): Promise<FileRow> {
  checkCopy(core, input);
  const files = core.need<FilesService>("files")!;
  const fileId = clean(input.file_id, 64);
  if (fileId) return files.fileRow(fileId)!;
  const bytes = Buffer.from(String(input.content), "base64");
  const original = clean(input.name, LIMITS.file_name).replace(/[\\/]/g, "_") || "Signed copy.pdf";
  return files.putFile({
    folderPath: place.folder,
    title: place.title.slice(0, LIMITS.title),
    originalName: original,
    bytes: new Uint8Array(bytes),
    by,
    note: place.note,
  });
}

/** The files a form may choose from, by folder then title; [] without Files. */
export function fileChoices(core: DataCore): { file_id: string; title: string; folder: string }[] {
  if (!core.need<FilesService>("files")) return [];
  return readVault(core.store)
    .filter((file) => !file.trashed)
    .map((file) => ({ file_id: file.file_id, title: file.title, folder: file.folder.join(" › ") }))
    .sort((a, b) => a.folder.localeCompare(b.folder) || a.title.localeCompare(b.title))
    .slice(0, FILES_SHOWN);
}

/** A file's title and where it is, for a record's page; null when it is gone or trashed. */
export function fileLink(
  core: DataCore,
  fileId: string | null,
): { file_id: string; title: string } | null {
  if (!fileId) return null;
  const row = core.need<FilesService>("files")?.fileRow(fileId) ?? null;
  return row && !row.trashed_at ? { file_id: row.file_id, title: row.title } : null;
}
