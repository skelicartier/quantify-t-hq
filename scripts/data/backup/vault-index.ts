/**
 * Every file and version in Files, read from the files module's own `files/index.json`
 * (read only: the vault rewrites it whole after every change, and the worker serialises
 * every write, so a read here is never half of one). The files service answers one file
 * at a time and cannot list them all, which a backup and a "which file" select need.
 * The bytes are where the vault keeps them: `files/blobs/<aa>/<sha256>`, once per content.
 */

import type { DataStore } from "../store";

type FolderRecord = { folder_id: string; name: string; parent_id: string | null };
type VersionRecord = {
  version_id: string;
  n: number;
  sha256: string;
  bytes: number;
  original_name: string;
};
type FileRecord = {
  file_id: string;
  title: string;
  folder_id: string;
  current: string;
  versions: VersionRecord[];
  trashed: { from_folder_id: string } | null;
};

export type VaultVersion = {
  n: number;
  sha256: string;
  bytes: number;
  original_name: string;
  current: boolean;
  /** Where the bytes are, inside Data's folder. */
  blob: string;
};

export type VaultFile = {
  file_id: string;
  title: string;
  /** Its folder's names from the top: ["08 Finance, tax and audit", "Bank"]. */
  folder: string[];
  trashed: boolean;
  versions: VaultVersion[];
};

export function blobOf(sha256: string): string {
  return `files/blobs/${sha256.slice(0, 2)}/${sha256}`;
}

/** Every file, trashed ones too, with its versions oldest first; [] when Files has none. */
export function readVault(store: DataStore): VaultFile[] {
  // Read only, and never moved aside when unreadable: the file is the files module's own.
  let index: { folders?: FolderRecord[]; files?: FileRecord[] } = {};
  try {
    const text = store.readText("files/index.json");
    if (text) index = JSON.parse(text) as typeof index;
  } catch {
    index = {};
  }
  const folders = new Map<string, FolderRecord>();
  for (const folder of Array.isArray(index.folders) ? index.folders : [])
    if (typeof folder?.folder_id === "string") folders.set(folder.folder_id, folder);
  const pathOf = (folderId: string): string[] => {
    const names: string[] = [];
    const seen = new Set<string>();
    let at: FolderRecord | undefined = folders.get(folderId);
    while (at && !seen.has(at.folder_id) && names.length < 10) {
      seen.add(at.folder_id);
      names.unshift(at.name);
      at = at.parent_id ? folders.get(at.parent_id) : undefined;
    }
    return names;
  };
  const files: VaultFile[] = [];
  for (const file of Array.isArray(index.files) ? index.files : []) {
    if (typeof file?.file_id !== "string" || !Array.isArray(file.versions)) continue;
    files.push({
      file_id: file.file_id,
      title: file.title,
      folder: pathOf(file.trashed?.from_folder_id ?? file.folder_id),
      trashed: file.trashed !== null && file.trashed !== undefined,
      versions: [...file.versions]
        .filter((version) => typeof version?.sha256 === "string")
        .sort((a, b) => a.n - b.n)
        .map((version) => ({
          n: version.n,
          sha256: version.sha256,
          bytes: version.bytes,
          original_name: version.original_name,
          current: version.version_id === file.current,
          blob: blobOf(version.sha256),
        })),
    });
  }
  return files;
}
