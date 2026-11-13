/**
 * The backup zip (spec §3.10): every file's current version under its folder path, the
 * older versions under `_versions`, Data's own records (the JSON and JSONL), and Mail
 * merge's lists, mailings, written log, stop list, settings and tests log, with a SHA-256
 * manifest and a README. Never `provider.key`, `provider-status.json` or the socket: Mail
 * merge's side is an allow-list, so nothing new in that folder can slip in.
 *
 * Stored, not compressed, written a file at a time (the vault's bytes are never rewritten,
 * so they are copied straight; the records, which may be appended to while the zip is
 * made, are read whole first and written as they were at that moment). Refused before
 * anything is written when the disk would have under 5 GB left after it.
 */

import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Refused } from "../../mail-merge/engine";
import type { BuildHandle, BuildInput } from "../builds";
import type { DataCore } from "../core";
import { localDay } from "../days";
import { ZIP_MAX_ENTRIES, ZipLimitError, ZipWriter, zipEntryName } from "../zip";
import { readVault } from "./vault-index";

export const DISK_FLOOR_BYTES = 5 * 1024 * 1024 * 1024;
export const DISK_FULL =
  "This Mac would have under 5 GB free after the backup, so it was not made. Free some space and try again.";

/** Mail merge's own files that go in, and only these. */
const MERGE_FILES = ["written.jsonl", "stop-list.json", "settings.json", "tests.jsonl"] as const;
const MERGE_FOLDERS = [
  { folder: "lists", endings: [".json"] },
  { folder: "mailings", endings: [".json", ".log"] },
] as const;
/** Never, whatever the folder holds. */
export const NEVER_IN_BACKUP = new Set(["provider.key", "provider-status.json", "engine.sock"]);

/** Data's folders that are not records: the bytes (zipped from Files), the uploads, the read text. */
const DATA_SKIP = new Set(["tmp", "files/blobs", "files/uploads", "files/text"]);

type Entry =
  | { name: string; kind: "blob"; path: string; bytes: number; sha256: string }
  | { name: string; kind: "record"; path: string; bytes: number };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function longDay(day: string): string {
  const [year = "", month = "", date = ""] = day.split("-");
  return `${Number(date)} ${MONTHS[Number(month) - 1] ?? ""} ${year}`;
}

function numbered(name: string, copy: number): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return `${name} (${copy})`;
  return `${name.slice(0, dot)} (${copy})${name.slice(dot)}`;
}

/** A regular file's size, or null for anything else (a folder, a link, a socket, nothing). */
function fileSize(path: string): number | null {
  try {
    const stat = lstatSync(path);
    return stat.isFile() ? stat.size : null;
  } catch {
    return null;
  }
}

function walkRecords(root: string, at: string, out: string[]): void {
  let names: string[];
  try {
    names = readdirSync(join(root, at));
  } catch {
    return;
  }
  for (const name of names.sort()) {
    const rel = at ? `${at}/${name}` : name;
    if (DATA_SKIP.has(rel)) continue;
    const path = join(root, rel);
    let stat;
    try {
      stat = lstatSync(path);
    } catch {
      continue;
    }
    if (stat.isDirectory()) walkRecords(root, rel, out);
    else if (stat.isFile() && (name.endsWith(".json") || name.endsWith(".jsonl"))) out.push(rel);
  }
}

/** What goes in, in order, with sizes: the plan the free-space check and the zip both use. */
export function planBackup(core: DataCore): Entry[] {
  const entries: Entry[] = [];
  const taken = new Set<string>();
  const claim = (name: string): string => {
    let unique = name;
    for (let copy = 2; taken.has(unique.toLowerCase()); copy += 1) {
      const slash = name.lastIndexOf("/");
      unique = `${name.slice(0, slash + 1)}${numbered(name.slice(slash + 1), copy)}`;
    }
    taken.add(unique.toLowerCase());
    return unique;
  };

  // Files: the current version under its folder, the older ones beside it under _versions.
  for (const file of readVault(core.store)) {
    const where = file.trashed ? ["files", "_trash", ...file.folder] : ["files", ...file.folder];
    const title = file.title || "Untitled";
    for (const version of file.versions) {
      const path = core.store.path(version.blob);
      const bytes = fileSize(path);
      if (bytes === null) continue;
      const name =
        version.current && !file.trashed
          ? claim(zipEntryName(...where, title))
          : claim(
              zipEntryName(
                "files",
                "_versions",
                ...(file.trashed ? ["_trash"] : []),
                ...file.folder,
                title,
                `v${version.n} ${version.original_name || title}`,
              ),
            );
      entries.push({ name, kind: "blob", path, bytes, sha256: version.sha256 });
    }
  }

  // Data's own records.
  const records: string[] = [];
  walkRecords(core.store.root, "", records);
  for (const rel of records) {
    const path = join(core.store.root, rel);
    const bytes = fileSize(path);
    if (bytes !== null)
      entries.push({ name: claim(zipEntryName("data", rel)), kind: "record", path, bytes });
  }

  // Mail merge's files: an allow-list, never the key.
  const merge = (rel: string) => {
    const base = rel.split("/").pop() ?? rel;
    if (NEVER_IN_BACKUP.has(base)) return;
    const path = join(core.dir, rel);
    const bytes = fileSize(path);
    if (bytes !== null)
      entries.push({ name: claim(zipEntryName("mail-merge", rel)), kind: "record", path, bytes });
  };
  for (const { folder, endings } of MERGE_FOLDERS) {
    let names: string[] = [];
    try {
      names = readdirSync(join(core.dir, folder)).sort();
    } catch {
      names = [];
    }
    for (const name of names)
      if (endings.some((ending) => name.endsWith(ending))) merge(`${folder}/${name}`);
  }
  for (const name of MERGE_FILES) merge(name);
  return entries;
}

const sha256Of = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

export async function makeBackup(
  core: DataCore,
  handle: BuildHandle,
  input: BuildInput,
  freeBytes: () => number,
): Promise<{ name: string; type: string }> {
  core.sender.poll();
  const entries = planBackup(core);
  if (entries.length + 2 > ZIP_MAX_ENTRIES)
    throw new Refused(
      400,
      "too_many",
      `That is ${entries.length.toLocaleString("en-GB")} files; a backup zip holds 5,000. Empty the trash or download folders on their own.`,
    );
  const size = entries.reduce((sum, entry) => sum + entry.bytes + 2 * entry.name.length + 76, 0);
  if (freeBytes() - size < DISK_FLOOR_BYTES) throw new Refused(507, "disk_full", DISK_FULL);

  const day = localDay(core.now());
  const name = `HQ Data backup ${day}.zip`;
  handle.setName(name);
  handle.setProgress(0, entries.length);
  const zip = new ZipWriter(handle.path);
  const manifest: string[] = [];
  try {
    for (const [done, entry] of entries.entries()) {
      if (entry.kind === "blob") {
        await zip.addFile(entry.name, entry.path);
        manifest.push(`${entry.sha256}  ${entry.name}`);
      } else {
        // As it is now: a log appended to while the zip is made is taken whole at this moment.
        let bytes: Uint8Array;
        try {
          bytes = readFileSync(entry.path);
        } catch {
          continue;
        }
        await zip.addBytes(entry.name, bytes);
        manifest.push(`${sha256Of(bytes)}  ${entry.name}`);
      }
      handle.setProgress(done + 1, entries.length);
      if (done % 20 === 0) await core.yield();
    }
    const readme = new TextEncoder().encode(
      [
        `Made on ${longDay(day)} by ${input.by.name}. Not encrypted: keep it on an encrypted disk.`,
        "",
        "What is in it:",
        "- files/: every file in Data's Files, the current version under its folder.",
        "- files/_versions/: the older versions, as v<n> and the name each was added with.",
        "- files/_trash/: files in the trash, in the folder they came from.",
        "- data/: Data's own records (folders, leads, replies, waitlist, investors, key dates).",
        "- mail-merge/: Mail merge's lists, mailings, written log, stop list, settings and tests log.",
        "- manifest-sha256.txt: the SHA-256 of every file here, to check none changed.",
        "",
        "Mail merge's provider key is never in a backup: set it again in Mail merge's Setup.",
        "",
      ].join("\n"),
    );
    await zip.addBytes("README.txt", readme);
    manifest.push(`${sha256Of(readme)}  README.txt`);
    await zip.addBytes("manifest-sha256.txt", new TextEncoder().encode(`${manifest.join("\n")}\n`));
    await zip.finish();
  } catch (error) {
    await zip.abort();
    if (error instanceof ZipLimitError) throw new Refused(400, "too_many", error.message);
    throw error;
  }
  core.log(`backup made: ${entries.length} files`);
  return { name, type: "application/zip" };
}
