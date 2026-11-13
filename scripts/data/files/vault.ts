/**
 * The vault: folders, files, versions, stars, tags, notes, review dates and the trash, in
 * one `files/index.json` that is rewritten whole (written beside, synced, renamed) after
 * every change, plus one activity line per change in `files/activity.jsonl`.
 *
 * The bytes live apart, once per content: `files/blobs/<aa>/<sha256>`, never rewritten.
 * Two files with the same bytes share them; "Delete forever" removes bytes only when no
 * other version anywhere still names them. Everything here is synchronous and runs in the
 * worker, which serialises every write, so two presses never interleave.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import { DEFAULT_FOLDERS, type FileKind, type TextState } from "../../../src/lib/data/labels";
import type { DataCore } from "../core";
import { addDays } from "../days";
import { LIMITS, clean, cleanText, isDay } from "../guard";
import type { Staff } from "../protocol";

export const MAX_DEPTH = 4;
export const MAX_FILES = 20_000;
export const MAX_FOLDERS = 500;
export const PAGE = 100;
export const BULK_MAX = 500;
/** Review dates this close (or past) are "Review due"; the overview's Due takes 14 days. */
export const REVIEW_WINDOW_DAYS = 30;
export const DUE_WINDOW_DAYS = 14;

export type FolderRecord = {
  folder_id: string;
  name: string;
  parent_id: string | null;
  default_key: string | null;
  created_at: string;
  created_by: Staff;
};

export type Folder = FolderRecord & {
  hint: string;
  depth: number;
  /** Files directly in it, not in the trash. */
  files: number;
  bytes: number;
  /** Its names from the top, joined: "08 Finance, tax and audit › Bank". */
  path: string;
  /** Folders directly inside it. */
  children: number;
};

export type Version = {
  version_id: string;
  n: number;
  sha256: string;
  bytes: number;
  kind: FileKind;
  mime: string;
  original_name: string;
  added_at: string;
  added_by: Staff;
  note: string;
  text: TextState;
  pages: number | null;
  rows: number | null;
  columns: number | null;
};

export type FileMeta = {
  file_id: string;
  title: string;
  folder_id: string;
  tags: string[];
  notes: string;
  starred: boolean;
  review_by: string | null;
  current: string;
  versions: Version[];
  came_from: string;
  trashed: { at: string; by: Staff; from_folder_id: string } | null;
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
};

export type FileRow = {
  file_id: string;
  title: string;
  original_name: string;
  folder_id: string;
  folder_path: string;
  kind: FileKind;
  bytes: number;
  tags: string[];
  starred: boolean;
  review_by: string | null;
  versions: number;
  /** The current version's number. */
  current_n: number;
  updated_at: string;
  updated_by_name: string;
  trashed_at: string | null;
  trashed_by_name: string | null;
  /** Where a file in the trash came from. */
  was_in: string | null;
  match?: { where: "name" | "tags" | "notes" | "text"; snippet: string };
};

export type Activity = { file_id: string; verb: string; detail: string; by: Staff; at: string };

export type ChangeKind =
  "added" | "version_added" | "current_changed" | "trashed" | "restored" | "deleted";
export type ChangeListener = (event: { kind: ChangeKind; file_id: string }) => void;

type Index = { format: 1; folders: FolderRecord[]; files: FileMeta[] };

const SYSTEM: Staff = { staff_id: "system", name: "Data" };
const USER_FOLDER_HINT = "Nothing in this folder yet.";

export function blobName(sha256: string): string {
  return `files/blobs/${sha256.slice(0, 2)}/${sha256}`;
}

/** "Report.pdf" → "Report (2).pdf": the name with a number before its extension. */
export function numbered(name: string, copy: number): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return `${name} (${copy})`;
  return `${name.slice(0, dot)} (${copy})${name.slice(dot)}`;
}

const sameName = (a: string, b: string) =>
  a.localeCompare(b, "en", { sensitivity: "accent" }) === 0;
const byName = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

/** A folder or file name as typed: trimmed, no slashes or control characters. */
export function cleanName(value: unknown, limit: number): string {
  return clean(value, limit * 2)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[/\\]/g, "-")
    .trim()
    .slice(0, limit);
}

/** Tags typed with a comma between them: trimmed, de-duplicated, never a key. */
export function cleanTags(value: unknown): string[] {
  const list = Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item : ""))
    : typeof value === "string"
      ? value.split(",")
      : [];
  const tags: string[] = [];
  for (const raw of list) {
    const tag = cleanText(raw, LIMITS.tag);
    if (!tag || tags.some((seen) => sameName(seen, tag))) continue;
    tags.push(tag);
  }
  if (tags.length > LIMITS.tags)
    throw new Refused(400, "invalid", `A file takes ${LIMITS.tags} tags at most.`);
  return tags;
}

export class Vault {
  readonly #core: DataCore;
  #index: Index = { format: 1, folders: [], files: [] };
  readonly #files = new Map<string, FileMeta>();
  readonly #folders = new Map<string, FolderRecord>();
  readonly #activity = new Map<string, Activity[]>();
  readonly #listeners = new Set<ChangeListener>();

  constructor(core: DataCore) {
    this.#core = core;
  }

  // ------------------------------------------------------------------ opening and saving

  /** Read the index, or make the default folders on the first run. */
  open(): void {
    const store = this.#core.store;
    store.ensureDir("files");
    const read = store.readJson<Partial<Index>>("files/index.json", {});
    this.#index = {
      format: 1,
      folders: Array.isArray(read.folders) ? read.folders : [],
      files: Array.isArray(read.files) ? read.files : [],
    };
    let made = 0;
    const now = this.#core.now();
    for (const folder of DEFAULT_FOLDERS) {
      if (this.#index.folders.some((record) => record.default_key === folder.key)) continue;
      this.#index.folders.push({
        folder_id: randomUUID(),
        name: folder.name,
        parent_id: null,
        default_key: folder.key,
        created_at: now,
        created_by: SYSTEM,
      });
      made += 1;
    }
    for (const folder of this.#index.folders) this.#folders.set(folder.folder_id, folder);
    for (const file of this.#index.files) this.#files.set(file.file_id, file);
    if (made > 0 || !store.exists("files/index.json")) this.save();
    for (const line of store.readLines<Activity>("files/activity.jsonl")) {
      if (typeof line?.file_id !== "string") continue;
      const list = this.#activity.get(line.file_id) ?? [];
      list.push(line);
      this.#activity.set(line.file_id, list);
    }
  }

  save(): void {
    this.#index.folders = [...this.#folders.values()];
    this.#index.files = [...this.#files.values()];
    this.#core.store.writeJson("files/index.json", this.#index);
  }

  // ------------------------------------------------------------------ changes and activity

  onChange(listener: ChangeListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  emit(kind: ChangeKind, file_id: string): void {
    for (const listener of this.#listeners) {
      try {
        listener({ kind, file_id });
      } catch (error) {
        this.#core.log(`a files listener failed: ${error instanceof Error ? error.name : "error"}`);
      }
    }
  }

  log(file_id: string, verb: string, detail: string, by: Staff): void {
    const line: Activity = { file_id, verb, detail, by, at: this.#core.now() };
    this.#core.store.appendLine("files/activity.jsonl", line);
    const list = this.#activity.get(file_id) ?? [];
    list.push(line);
    this.#activity.set(file_id, list);
  }

  /** A file's activity, newest first. */
  activity(file_id: string): Activity[] {
    return [...(this.#activity.get(file_id) ?? [])].reverse();
  }

  // ------------------------------------------------------------------ folders

  folder(folder_id: string): FolderRecord | null {
    return this.#folders.get(folder_id) ?? null;
  }

  inbox(): FolderRecord {
    const found = [...this.#folders.values()].find((folder) => folder.default_key === "inbox");
    if (!found) throw new Error("the inbox folder is missing");
    return found;
  }

  /** The folders from the top down to this one. */
  pathOf(folder_id: string): FolderRecord[] {
    const path: FolderRecord[] = [];
    let at = this.#folders.get(folder_id) ?? null;
    for (let guard = 0; at && guard < 32; guard += 1) {
      path.unshift(at);
      at = at.parent_id ? (this.#folders.get(at.parent_id) ?? null) : null;
    }
    return path;
  }

  depthOf(folder_id: string): number {
    return this.pathOf(folder_id).length;
  }

  folderPath(folder_id: string): string {
    return this.pathOf(folder_id)
      .map((folder) => folder.name)
      .join(" › ");
  }

  #children(parent_id: string | null): FolderRecord[] {
    return [...this.#folders.values()].filter((folder) => folder.parent_id === parent_id);
  }

  /** How many levels a folder holds below itself (0 for one with no subfolders). */
  #height(folder_id: string): number {
    const children = this.#children(folder_id);
    return children.length === 0
      ? 0
      : 1 + Math.max(...children.map((child) => this.#height(child.folder_id)));
  }

  #sortedChildren(parent_id: string | null): FolderRecord[] {
    const children = this.#children(parent_id);
    if (parent_id !== null) return children.sort((a, b) => byName(a.name, b.name));
    const order = (folder: FolderRecord) => {
      const index = DEFAULT_FOLDERS.findIndex((item) => item.key === folder.default_key);
      return index < 0 ? DEFAULT_FOLDERS.length : index;
    };
    return children.sort((a, b) => order(a) - order(b) || byName(a.name, b.name));
  }

  #view(folder: FolderRecord, counts: Map<string, { files: number; bytes: number }>): Folder {
    const hint =
      DEFAULT_FOLDERS.find((item) => item.key === folder.default_key)?.hint ?? USER_FOLDER_HINT;
    const count = counts.get(folder.folder_id) ?? { files: 0, bytes: 0 };
    return {
      ...folder,
      hint,
      depth: this.depthOf(folder.folder_id),
      files: count.files,
      bytes: count.bytes,
      path: this.folderPath(folder.folder_id),
      children: this.#children(folder.folder_id).length,
    };
  }

  #counts(): Map<string, { files: number; bytes: number }> {
    const counts = new Map<string, { files: number; bytes: number }>();
    for (const file of this.#files.values()) {
      if (file.trashed) continue;
      const count = counts.get(file.folder_id) ?? { files: 0, bytes: 0 };
      count.files += 1;
      count.bytes += this.current(file).bytes;
      counts.set(file.folder_id, count);
    }
    return counts;
  }

  /** Every folder in tree order: the defaults in number order, subfolders after their parent. */
  folderList(): Folder[] {
    const counts = this.#counts();
    const out: Folder[] = [];
    const walk = (parent: string | null) => {
      for (const folder of this.#sortedChildren(parent)) {
        out.push(this.#view(folder, counts));
        walk(folder.folder_id);
      }
    };
    walk(null);
    return out;
  }

  folderView(folder_id: string): Folder | null {
    const folder = this.#folders.get(folder_id);
    return folder ? this.#view(folder, this.#counts()) : null;
  }

  subfolders(folder_id: string): Folder[] {
    const counts = this.#counts();
    return this.#sortedChildren(folder_id).map((folder) => this.#view(folder, counts));
  }

  #checkFolderName(name: string, parent_id: string | null, except: string | null): void {
    if (!name) throw new Refused(400, "invalid", "Give the folder a name.");
    const taken = this.#children(parent_id).find(
      (folder) => folder.folder_id !== except && sameName(folder.name, name),
    );
    if (taken)
      throw new Refused(409, "name_taken", `A folder named “${taken.name}” is already here.`);
  }

  createFolder(nameValue: unknown, parentValue: unknown, by: Staff): FolderRecord {
    const name = cleanName(nameValue, LIMITS.folder);
    const parent_id = typeof parentValue === "string" && parentValue ? parentValue : null;
    if (parent_id && !this.#folders.has(parent_id))
      throw new Refused(404, "not_found", "That folder is no longer here.");
    if (parent_id && this.depthOf(parent_id) >= MAX_DEPTH)
      throw new Refused(400, "too_deep", `Folders nest ${MAX_DEPTH} deep at most.`);
    if (this.#folders.size >= MAX_FOLDERS)
      throw new Refused(400, "too_many", `Data holds ${MAX_FOLDERS} folders at most.`);
    guardFree(name);
    this.#checkFolderName(name, parent_id, null);
    const folder: FolderRecord = {
      folder_id: randomUUID(),
      name,
      parent_id,
      default_key: null,
      created_at: this.#core.now(),
      created_by: by,
    };
    this.#folders.set(folder.folder_id, folder);
    this.save();
    return folder;
  }

  renameFolder(folder_id: string, nameValue: unknown): FolderRecord {
    const folder = this.#mustFolder(folder_id);
    const name = cleanName(nameValue, LIMITS.folder);
    guardFree(name);
    this.#checkFolderName(name, folder.parent_id, folder.folder_id);
    folder.name = name;
    this.save();
    return folder;
  }

  moveFolder(folder_id: string, parentValue: unknown): FolderRecord {
    const folder = this.#mustFolder(folder_id);
    const parent_id = typeof parentValue === "string" && parentValue ? parentValue : null;
    if (parent_id) {
      this.#mustFolder(parent_id);
      if (this.pathOf(parent_id).some((step) => step.folder_id === folder_id))
        throw new Refused(400, "invalid", "A folder cannot go inside itself.");
    }
    const depth = (parent_id ? this.depthOf(parent_id) : 0) + 1 + this.#height(folder_id);
    if (depth > MAX_DEPTH)
      throw new Refused(400, "too_deep", `Folders nest ${MAX_DEPTH} deep at most.`);
    this.#checkFolderName(folder.name, parent_id, folder.folder_id);
    folder.parent_id = parent_id;
    this.save();
    return folder;
  }

  deleteFolder(folder_id: string): void {
    const folder = this.#mustFolder(folder_id);
    if (folder.default_key)
      throw new Refused(
        409,
        "default_folder",
        "The folders Data starts with cannot be deleted. Rename it instead.",
      );
    const holds =
      this.#children(folder_id).length > 0 ||
      [...this.#files.values()].some((file) => !file.trashed && file.folder_id === folder_id);
    if (holds)
      throw new Refused(
        409,
        "not_empty",
        "Only an empty folder can be deleted. Move its files and folders out first.",
      );
    this.#folders.delete(folder_id);
    this.save();
  }

  #mustFolder(folder_id: string): FolderRecord {
    const folder = this.#folders.get(folder_id);
    if (!folder) throw new Refused(404, "not_found", "That folder is no longer here.");
    return folder;
  }

  /**
   * The folder at these names below `under` (the top when null), made as needed. Past four
   * levels the rest of the names are left off: the file lands in the deepest one allowed.
   */
  ensureFolderPath(names: readonly string[], under: string | null, by: Staff): FolderRecord | null {
    let parent: FolderRecord | null = under ? this.#mustFolder(under) : null;
    let made = false;
    for (const raw of names) {
      const name = cleanName(raw, LIMITS.folder);
      if (!name) continue;
      if (parent && this.depthOf(parent.folder_id) >= MAX_DEPTH) break;
      const parentId: string | null = parent ? parent.folder_id : null;
      const found = this.#children(parentId).find((folder) => sameName(folder.name, name));
      if (found) {
        parent = found;
        continue;
      }
      if (this.#folders.size >= MAX_FOLDERS)
        throw new Refused(400, "too_many", `Data holds ${MAX_FOLDERS} folders at most.`);
      const folder: FolderRecord = {
        folder_id: randomUUID(),
        name,
        parent_id: parentId,
        default_key: null,
        created_at: this.#core.now(),
        created_by: by,
      };
      this.#folders.set(folder.folder_id, folder);
      parent = folder;
      made = true;
    }
    if (made) this.save();
    return parent;
  }

  // ------------------------------------------------------------------ files

  file(file_id: string): FileMeta | null {
    return this.#files.get(file_id) ?? null;
  }

  mustFile(file_id: string): FileMeta {
    const file = this.#files.get(file_id);
    if (!file) throw new Refused(404, "not_found", "That file is no longer here.");
    return file;
  }

  files(): readonly FileMeta[] {
    return [...this.#files.values()];
  }

  count(): number {
    return this.#files.size;
  }

  current(file: FileMeta): Version {
    return (
      file.versions.find((version) => version.version_id === file.current) ?? file.versions.at(-1)!
    );
  }

  row(file: FileMeta): FileRow {
    const current = this.current(file);
    const fromFolder = file.trashed ? file.trashed.from_folder_id : file.folder_id;
    return {
      file_id: file.file_id,
      title: file.title,
      original_name: current.original_name,
      folder_id: file.folder_id,
      folder_path: this.folderPath(file.folder_id) || this.inbox().name,
      kind: current.kind,
      bytes: current.bytes,
      tags: [...file.tags],
      starred: file.starred,
      review_by: file.review_by,
      versions: file.versions.length,
      current_n: current.n,
      updated_at: file.updated_at,
      updated_by_name: file.updated_by.name,
      trashed_at: file.trashed?.at ?? null,
      trashed_by_name: file.trashed?.by.name ?? null,
      was_in: file.trashed ? this.folderPath(fromFolder) || this.inbox().name : null,
    };
  }

  /** The same bytes in any version of a file not in the trash. */
  findDuplicate(sha256: string): FileMeta | null {
    let any: FileMeta | null = null;
    for (const file of this.#files.values()) {
      if (file.trashed) continue;
      if (this.current(file).sha256 === sha256) return file;
      if (!any && file.versions.some((version) => version.sha256 === sha256)) any = file;
    }
    return any;
  }

  /** A file of that name in that folder, not in the trash. */
  findByTitle(folder_id: string, title: string, except: string | null = null): FileMeta | null {
    for (const file of this.#files.values())
      if (
        !file.trashed &&
        file.file_id !== except &&
        file.folder_id === folder_id &&
        sameName(file.title, title)
      )
        return file;
    return null;
  }

  uniqueTitle(folder_id: string, title: string): string {
    if (!this.findByTitle(folder_id, title)) return title;
    for (let copy = 2; copy < 10_000; copy += 1) {
      const next = numbered(title, copy);
      if (!this.findByTitle(folder_id, next)) return next;
    }
    return `${title} ${randomUUID().slice(0, 8)}`;
  }

  /** Whether any version of any file (the trash included) names these bytes. */
  referenced(sha256: string): boolean {
    for (const file of this.#files.values())
      if (file.versions.some((version) => version.sha256 === sha256)) return true;
    return false;
  }

  /** Every version that names these bytes: a text job updates them all. */
  versionsOf(sha256: string): Version[] {
    const found: Version[] = [];
    for (const file of this.#files.values())
      for (const version of file.versions) if (version.sha256 === sha256) found.push(version);
    return found;
  }

  newVersion(input: {
    sha256: string;
    bytes: number;
    kind: FileKind;
    mime: string;
    original_name: string;
    by: Staff;
    note: string;
    n: number;
    text: TextState;
  }): Version {
    // A version with bytes already read takes what was read.
    const known = this.versionsOf(input.sha256).find((version) =>
      ["read", "none", "failed", "too_large"].includes(version.text),
    );
    return {
      version_id: randomUUID(),
      n: input.n,
      sha256: input.sha256,
      bytes: input.bytes,
      kind: input.kind,
      mime: input.mime,
      original_name: input.original_name,
      added_at: this.#core.now(),
      added_by: input.by,
      note: input.note,
      text: known ? known.text : input.text,
      pages: known?.pages ?? null,
      rows: known?.rows ?? null,
      columns: known?.columns ?? null,
    };
  }

  addFile(input: {
    folder_id: string;
    title: string;
    came_from: string;
    version: Version;
    by: Staff;
    file_id?: string | undefined;
  }): FileMeta {
    if (this.#files.size >= MAX_FILES)
      throw new Refused(400, "too_many", "Data holds 20,000 files at most.");
    const now = this.#core.now();
    const file: FileMeta = {
      file_id: input.file_id && !this.#files.has(input.file_id) ? input.file_id : randomUUID(),
      title: input.title,
      folder_id: input.folder_id,
      tags: [],
      notes: "",
      starred: false,
      review_by: null,
      current: input.version.version_id,
      versions: [input.version],
      came_from: input.came_from,
      trashed: null,
      created_at: now,
      created_by: input.by,
      updated_at: now,
      updated_by: input.by,
    };
    this.#files.set(file.file_id, file);
    this.save();
    this.log(file.file_id, "Added", input.version.original_name, input.by);
    this.emit("added", file.file_id);
    return file;
  }

  addVersion(file: FileMeta, version: Version, by: Staff): void {
    file.versions.push(version);
    file.current = version.version_id;
    file.updated_at = this.#core.now();
    file.updated_by = by;
    this.save();
    this.log(file.file_id, `Added version ${version.n}`, version.note, by);
    this.emit("version_added", file.file_id);
  }

  nextVersionNumber(file: FileMeta): number {
    return Math.max(0, ...file.versions.map((version) => version.n)) + 1;
  }

  makeCurrent(file_id: string, version_id: string, by: Staff): FileMeta {
    const file = this.mustFile(file_id);
    const version = file.versions.find((item) => item.version_id === version_id);
    if (!version) throw new Refused(404, "not_found", "That version is no longer here.");
    if (file.current === version_id) return file;
    file.current = version_id;
    file.updated_at = this.#core.now();
    file.updated_by = by;
    this.save();
    this.log(file.file_id, `Made version ${version.n} current`, "", by);
    this.emit("current_changed", file.file_id);
    return file;
  }

  /**
   * One change to one file, each field checked and each logged: the name, the folder, the
   * tags, the notes, the review date and the star. Fields not given are left as they are.
   */
  update(file_id: string, body: Record<string, unknown>, by: Staff): FileMeta {
    const file = this.mustFile(file_id);
    const lines: [verb: string, detail: string][] = [];
    if ("folder_id" in body) {
      const folder_id = clean(body.folder_id, 64);
      if (folder_id !== file.folder_id) {
        this.#mustFolder(folder_id);
        const clash = this.findByTitle(folder_id, file.title, file.file_id);
        if (clash)
          throw new Refused(
            409,
            "name_taken",
            `A file named “${clash.title}” is already in that folder.`,
          );
        lines.push([`Moved from ${this.folderPath(file.folder_id)}`, this.folderPath(folder_id)]);
        file.folder_id = folder_id;
      }
    }
    if ("title" in body) {
      const title = cleanName(body.title, LIMITS.title);
      guardFree(title);
      if (!title) throw new Refused(400, "invalid", "Give the file a name.");
      if (title !== file.title) {
        const clash = this.findByTitle(file.folder_id, title, file.file_id);
        if (clash)
          throw new Refused(
            409,
            "name_taken",
            `A file named “${clash.title}” is already in this folder.`,
          );
        lines.push([`Renamed from “${file.title}”`, title]);
        file.title = title;
      }
    }
    if ("tags" in body) {
      const tags = cleanTags(body.tags);
      if (tags.join("\u0000") !== file.tags.join("\u0000")) {
        lines.push(["Tags changed", tags.join(", ") || "None"]);
        file.tags = tags;
      }
    }
    if ("notes" in body) {
      const notes = cleanText(body.notes, LIMITS.notes);
      if (notes !== file.notes) {
        lines.push(["Notes changed", ""]);
        file.notes = notes;
      }
    }
    if ("review_by" in body) {
      const raw = clean(body.review_by, 10);
      if (raw && !isDay(raw)) throw new Refused(400, "invalid", "That date is not a date.");
      const review_by = raw || null;
      if (review_by !== file.review_by) {
        lines.push(["Review date set", review_by ?? "None set"]);
        file.review_by = review_by;
      }
    }
    if ("starred" in body) {
      const starred = body.starred === true || body.starred === "true";
      if (starred !== file.starred) {
        lines.push([starred ? "Starred" : "Unstarred", ""]);
        file.starred = starred;
      }
    }
    if (lines.length === 0) return file;
    file.updated_at = this.#core.now();
    file.updated_by = by;
    this.save();
    for (const [verb, detail] of lines) this.log(file.file_id, verb, detail, by);
    return file;
  }

  trash(file_id: string, by: Staff): FileMeta {
    const file = this.mustFile(file_id);
    if (file.trashed) return file;
    file.trashed = { at: this.#core.now(), by, from_folder_id: file.folder_id };
    this.save();
    this.log(file.file_id, "Moved to the trash", "", by);
    this.emit("trashed", file.file_id);
    return file;
  }

  restore(file_id: string, by: Staff): FileMeta {
    const file = this.mustFile(file_id);
    if (!file.trashed) return file;
    const back = this.#folders.has(file.trashed.from_folder_id)
      ? file.trashed.from_folder_id
      : this.inbox().folder_id;
    file.folder_id = back;
    if (this.findByTitle(back, file.title, file.file_id))
      file.title = this.uniqueTitle(back, file.title);
    file.trashed = null;
    file.updated_at = this.#core.now();
    file.updated_by = by;
    this.save();
    this.log(file.file_id, "Restored", this.folderPath(back), by);
    this.emit("restored", file.file_id);
    return file;
  }

  /** Gone for good: the record, and the bytes no other version still names. */
  deleteForever(file_id: string): { bytes_freed: number } {
    const file = this.mustFile(file_id);
    if (!file.trashed)
      throw new Refused(409, "not_in_trash", "Only a file in the trash can be deleted forever.");
    this.#files.delete(file_id);
    this.save();
    let freed = 0;
    for (const sha of new Set(file.versions.map((version) => version.sha256))) {
      if (this.referenced(sha)) continue;
      freed += this.#core.store.stat(blobName(sha))?.size ?? 0;
      this.#core.store.remove(blobName(sha));
      this.#core.store.remove(`files/text/${sha}.txt`);
      this.#core.store.remove(`files/text/${sha}.json`);
    }
    this.emit("deleted", file_id);
    return { bytes_freed: freed };
  }

  trashed(): FileMeta[] {
    return [...this.#files.values()].filter((file) => file.trashed);
  }

  emptyTrash(confirm: unknown): { deleted: number; bytes_freed: number } {
    const inTrash = this.trashed();
    const typed = Number(String(confirm ?? "").replace(/[\s,]/g, ""));
    if (!Number.isSafeInteger(typed) || typed !== inTrash.length)
      throw new Refused(
        400,
        "unconfirmed",
        `Type ${inTrash.length.toLocaleString("en-GB")} to delete ${inTrash.length.toLocaleString("en-GB")} ${inTrash.length === 1 ? "file" : "files"} forever.`,
      );
    let freed = 0;
    for (const file of inTrash) freed += this.deleteForever(file.file_id).bytes_freed;
    return { deleted: inTrash.length, bytes_freed: freed };
  }

  bulk(
    idsValue: unknown,
    changeValue: unknown,
    value: unknown,
    by: Staff,
  ): { changed: number; skipped: number } {
    const ids = (
      Array.isArray(idsValue) ? idsValue : typeof idsValue === "string" ? idsValue.split(",") : []
    )
      .map((id) => clean(id, 64))
      .filter(Boolean);
    if (ids.length === 0) throw new Refused(400, "invalid", "Choose the files first.");
    if (ids.length > BULK_MAX) throw new Refused(400, "too_many", "Choose 500 at most.");
    const change = clean(changeValue, 20);
    if (!["move", "star", "unstar", "tag", "untag", "trash"].includes(change))
      throw new Refused(400, "invalid", "That change is not one Files makes.");
    if (change === "move") this.#mustFolder(clean(value, 64));
    const tag = change === "tag" || change === "untag" ? cleanText(value, LIMITS.tag) : "";
    if ((change === "tag" || change === "untag") && !tag)
      throw new Refused(400, "invalid", "Choose the tag first.");
    let changed = 0;
    let skipped = 0;
    for (const id of new Set(ids)) {
      const file = this.#files.get(id);
      if (!file || (file.trashed && change !== "trash")) {
        skipped += 1;
        continue;
      }
      try {
        if (change === "trash") {
          if (file.trashed) skipped += 1;
          else {
            this.trash(id, by);
            changed += 1;
          }
          continue;
        }
        const before = JSON.stringify([file.folder_id, file.starred, file.tags]);
        if (change === "move") this.update(id, { folder_id: clean(value, 64) }, by);
        if (change === "star") this.update(id, { starred: true }, by);
        if (change === "unstar") this.update(id, { starred: false }, by);
        if (change === "tag")
          this.update(
            id,
            { tags: file.tags.some((t) => sameName(t, tag)) ? file.tags : [...file.tags, tag] },
            by,
          );
        if (change === "untag")
          this.update(id, { tags: file.tags.filter((t) => !sameName(t, tag)) }, by);
        if (JSON.stringify([file.folder_id, file.starred, file.tags]) === before) skipped += 1;
        else changed += 1;
      } catch (error) {
        if (!(error instanceof Refused)) throw error;
        skipped += 1;
      }
    }
    return { changed, skipped };
  }

  /** Every tag in use on a file not in the trash, in order. */
  tags(): string[] {
    const seen: string[] = [];
    for (const file of this.#files.values()) {
      if (file.trashed) continue;
      for (const tag of file.tags) if (!seen.some((other) => sameName(other, tag))) seen.push(tag);
    }
    return seen.sort((a, b) => byName(a, b));
  }

  /** Files whose review date is past or within `days` of today, not in the trash. */
  reviewDue(today: string, days: number): FileMeta[] {
    const until = addDays(today, days);
    return [...this.#files.values()]
      .filter((file) => !file.trashed && file.review_by !== null && file.review_by <= until)
      .sort(
        (a, b) => (a.review_by ?? "").localeCompare(b.review_by ?? "") || byName(a.title, b.title),
      );
  }
}

/** The secret guard on a name: a key pasted as a file name travels into zips and prints. */
function guardFree(text: string): void {
  cleanText(text, text.length || 1);
}

export { SYSTEM };
