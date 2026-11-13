/**
 * A file coming in, in parts: the portal begins an upload (name, size, folder), sends
 * each 3 MiB part through the host's stream route (the host writes it to disk; the worker
 * only says where), then finishes it. Finishing joins the parts in order while hashing
 * them (SHA-256), reads the kind from the first bytes, keeps the bytes once under
 * `files/blobs/<aa>/<sha256>`, and decides what it is: added, a new version, the same bytes
 * already here (a duplicate), or a name already taken in that folder with other bytes.
 * The last two wait for the person's choice. Unfinished uploads are removed after a day.
 */

import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  statfsSync,
} from "node:fs";
import { dirname } from "node:path";

import { Refused } from "../../mail-merge/engine";
import type { Answer, Ctx, DataCore, StreamResult } from "../core";
import { LIMITS, clean, cleanText, isUuid, wholeNumber } from "../guard";
import type { Staff } from "../protocol";
import { syncFolder, writeAll } from "../store";
import { sniff, type Sniffed } from "./sniff";
import { readsText, type TextJobs } from "./text-jobs";
import { blobName, cleanName, type FileMeta, type FolderRecord, type Vault } from "./vault";

export const MAX_FILE_BYTES = 262_144_000;
export const PART_BYTES = 3_145_728;
export const MAX_PARTS = 84;
export const DROP_MAX_FILES = 500;
export const DROP_MAX_BYTES = 2 * 1024 * 1024 * 1024;
export const DISK_FLOOR_BYTES = 5 * 1024 * 1024 * 1024;
const KEEP_MS = 24 * 60 * 60 * 1_000;

export const TOO_LARGE = "That file is over 250 MB. Split it, or keep it outside HQ.";
export const DISK_FULL = "This Mac would have under 5 GB free; the file was not added.";

export type Outcome = "added" | "version_added" | "duplicate" | "name_taken" | "skipped";

export type UploadMeta = {
  upload_id: string;
  name: string;
  size: number;
  parts: number;
  part_bytes: number;
  folder_id: string;
  relative_path: string;
  file_id: string | null;
  note: string;
  by: Staff;
  started_at: string;
  received: number[];
  state: "receiving" | "assembling" | "awaiting_choice" | "done" | "cancelled";
  pending?: {
    sha256: string;
    kind: Sniffed["kind"];
    mime: string;
    clash: "duplicate" | "name";
    existing_file_id: string;
    folder_id: string;
    title: string;
  };
};

const pad = (index: number) => String(index).padStart(4, "0");

export class Uploads {
  readonly #core: DataCore;
  readonly #vault: Vault;
  readonly #text: TextJobs;
  readonly #uploads = new Map<string, UploadMeta>();
  /** Test routes only: the id a new file from this upload is given, so a walk can link to it. */
  readonly #pins = new Map<string, string>();
  /** Tests (and the stand-in) set this to try the 5 GB floor without filling a disk. */
  freeBytesOverride: number | null = null;

  pin(upload_id: string, file_id: string): void {
    this.#pins.set(upload_id, file_id);
  }

  constructor(core: DataCore, vault: Vault, text: TextJobs) {
    this.#core = core;
    this.#vault = vault;
    this.#text = text;
  }

  // ------------------------------------------------------------------ keeping uploads

  #dir(upload_id: string): string {
    return `files/uploads/${upload_id}`;
  }

  #save(meta: UploadMeta): void {
    this.#core.store.writeJson(`${this.#dir(meta.upload_id)}/meta.json`, meta);
  }

  #drop(meta: UploadMeta): void {
    this.#uploads.delete(meta.upload_id);
    this.#core.store.remove(this.#dir(meta.upload_id));
  }

  #must(upload_id: string): UploadMeta {
    const meta = this.#uploads.get(upload_id);
    if (!meta)
      throw new Refused(404, "not_found", "That upload is no longer here. Add the file again.");
    return meta;
  }

  /** At start: read what was coming in; remove what is a day old or broken. */
  open(): void {
    const store = this.#core.store;
    store.ensureDir("files/uploads");
    const cutoff = Date.parse(this.#core.now()) - KEEP_MS;
    let removed = 0;
    for (const id of store.list("files/uploads")) {
      const meta = store.readJson<UploadMeta | null>(`files/uploads/${id}/meta.json`, null);
      const old = !meta || !(Date.parse(meta.started_at) >= cutoff);
      if (!meta || old || meta.state === "done" || meta.state === "cancelled") {
        if (meta?.pending?.clash === "name") this.#removeUnreferenced(meta.pending.sha256);
        store.remove(`files/uploads/${id}`);
        removed += 1;
        continue;
      }
      if (meta.state === "assembling") {
        // The worker stopped while joining: the parts are kept until the bytes are, so it can be finished again.
        store.remove(`files/uploads/${id}/joined`);
        meta.state = "receiving";
        this.#save(meta);
      }
      this.#uploads.set(meta.upload_id, meta);
    }
    if (removed > 0) this.#core.log(`${removed} unfinished upload(s) removed`);
  }

  freeBytes(): number {
    if (this.freeBytesOverride !== null) return this.freeBytesOverride;
    try {
      const stats = statfsSync(this.#core.store.root);
      return Number(stats.bavail) * Number(stats.bsize);
    } catch {
      return Number.MAX_SAFE_INTEGER;
    }
  }

  checkRoom(size: number): void {
    if (this.freeBytes() - size < DISK_FLOOR_BYTES) throw new Refused(507, "disk_full", DISK_FULL);
  }

  // ------------------------------------------------------------------ begin, parts

  begin(body: Record<string, unknown>, by: Staff): Answer {
    const name = cleanName(body.name, LIMITS.file_name);
    if (!name) throw new Refused(400, "invalid", "The file has no name.");
    const size = wholeNumber(body.size, -1);
    if (size < 0) throw new Refused(400, "invalid", "The file's size was not given.");
    if (size === 0) throw new Refused(400, "empty", "That file is empty.");
    if (size > MAX_FILE_BYTES) throw new Refused(400, "too_large", TOO_LARGE);
    const open = [...this.#uploads.values()].filter((meta) => meta.state === "receiving");
    if (open.length + 1 > DROP_MAX_FILES)
      throw new Refused(
        400,
        "too_many",
        `That is ${open.length + 1} files; add 500 at most at a time.`,
      );
    if (open.reduce((sum, meta) => sum + meta.size, 0) + size > DROP_MAX_BYTES)
      throw new Refused(400, "too_many", "That is over 2 GB at once; add fewer files at a time.");
    if (this.#vault.count() >= 20_000)
      throw new Refused(400, "too_many", "Data holds 20,000 files at most.");
    this.checkRoom(size);
    const file_id = clean(body.file_id, 64) || null;
    let folder_id = clean(body.folder_id, 64);
    if (file_id) {
      const file = this.#vault.mustFile(file_id);
      if (file.trashed)
        throw new Refused(
          409,
          "invalid",
          "That file is in the trash. Restore it to add a version.",
        );
      folder_id = file.folder_id;
    }
    if (!folder_id) folder_id = this.#vault.inbox().folder_id;
    if (!this.#vault.folder(folder_id))
      throw new Refused(404, "not_found", "That folder is no longer here.");
    const meta: UploadMeta = {
      upload_id: randomUUID(),
      name,
      size,
      parts: Math.ceil(size / PART_BYTES),
      part_bytes: PART_BYTES,
      folder_id,
      relative_path: clean(body.relative_path, 1_000)
        .replace(/[\u0000-\u001f]/g, "")
        .replace(/\\/g, "/"),
      file_id,
      note: cleanText(body.note, LIMITS.title),
      by,
      started_at: this.#core.now(),
      received: [],
      state: "receiving",
    };
    this.#uploads.set(meta.upload_id, meta);
    this.#save(meta);
    return { upload_id: meta.upload_id, part_bytes: meta.part_bytes, parts: meta.parts };
  }

  #expected(meta: UploadMeta, index: number): number {
    return Math.min(meta.part_bytes, meta.size - index * meta.part_bytes);
  }

  /** Where the host writes one part, and what to say once it is there. A part sent twice replaces itself. */
  part(ctx: Ctx): StreamResult {
    const meta = this.#must(ctx.params[0]!);
    const index = Number(ctx.params[1]);
    if (meta.state !== "receiving")
      throw new Refused(409, "invalid", "That upload is not taking parts any more.");
    if (!Number.isSafeInteger(index) || index < 0 || index >= meta.parts)
      throw new Refused(400, "part_refused", "That part could not be read.");
    const name = `${this.#dir(meta.upload_id)}/part-${pad(index)}`;
    const expected = this.#expected(meta, index);
    return {
      receive: { target: this.#core.store.path(name), max_bytes: expected },
      written: (bytes) => {
        if (bytes !== expected) {
          this.#core.store.remove(name);
          throw new Refused(400, "part_refused", "That part could not be read.");
        }
        if (!meta.received.includes(index)) meta.received.push(index);
        this.#save(meta);
        return { received: index };
      },
    };
  }

  // ------------------------------------------------------------------ finish

  async finish(upload_id: string, by: Staff): Promise<Answer> {
    const meta = this.#must(upload_id);
    if (meta.state === "awaiting_choice" && meta.pending) return this.#pendingAnswer(meta);
    if (meta.state !== "receiving") throw new Refused(409, "invalid", "That upload is finished.");
    const store = this.#core.store;
    const missing: number[] = [];
    for (let index = 0; index < meta.parts; index += 1) {
      const stat = store.stat(`${this.#dir(meta.upload_id)}/part-${pad(index)}`);
      if (!stat || stat.size !== this.#expected(meta, index)) missing.push(index + 1);
    }
    if (missing.length > 0)
      throw new Refused(
        400,
        "incomplete",
        `Not every part arrived: ${missing.length} of ${meta.parts} are missing. Try again.`,
      );
    meta.state = "assembling";
    this.#save(meta);
    const joined = store.path(this.#dir(meta.upload_id), "joined");
    try {
      rmSync(joined, { force: true });
      const hash = createHash("sha256");
      let head: Uint8Array = new Uint8Array();
      let total = 0;
      const fd = openSync(joined, "w", 0o600);
      try {
        for (let index = 0; index < meta.parts; index += 1) {
          const bytes = readFileSync(store.path(this.#dir(meta.upload_id), `part-${pad(index)}`));
          hash.update(bytes);
          writeAll(fd, bytes);
          if (index === 0) head = bytes.subarray(0, 8_192);
          total += bytes.length;
          await this.#core.yield();
        }
        // On the disk before anything points at it: the index never names a blob cut short.
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      if (total !== meta.size) {
        this.#drop(meta);
        throw new Refused(400, "incomplete", "The file did not arrive whole. Try again.");
      }
      const answer = this.#decide(meta, joined, hash.digest("hex"), sniff(head, meta.name), by);
      // Only now are the parts let go: until here it could always be finished again.
      this.#removeParts(meta);
      return answer;
    } catch (error) {
      // A join that broke (a full disk, a file gone meanwhile) leaves the upload as it was
      // before finishing, its parts all there: it can be finished again, or cancelled.
      if (this.#uploads.get(meta.upload_id) === meta && meta.state === "assembling") {
        rmSync(joined, { force: true });
        meta.state = "receiving";
        try {
          this.#save(meta);
        } catch {
          // held in memory; a restart puts an "assembling" upload back to receiving too
        }
      }
      throw error;
    }
  }

  /** The parts of an upload whose bytes are kept now (it waits for a choice, or is done). */
  #removeParts(meta: UploadMeta): void {
    try {
      for (let index = 0; index < meta.parts; index += 1)
        this.#core.store.remove(`${this.#dir(meta.upload_id)}/part-${pad(index)}`);
    } catch {
      // they go with the upload's folder when it is dropped
    }
  }

  #decide(meta: UploadMeta, joined: string, sha256: string, sniffed: Sniffed, by: Staff): Answer {
    const vault = this.#vault;
    if (meta.file_id) {
      const file = vault.mustFile(meta.file_id);
      if (vault.current(file).sha256 === sha256) {
        rmSync(joined, { force: true });
        return this.#await(meta, sha256, sniffed, "duplicate", file, file.folder_id, file.title);
      }
      this.#keep(joined, sha256);
      const version = this.#addVersion(file, meta, sha256, sniffed, by);
      this.#drop(meta);
      return this.#versionAnswer(file, version);
    }
    const duplicate = vault.findDuplicate(sha256);
    const folder = this.#target(meta, by);
    const title = cleanName(meta.name, LIMITS.title) || "Untitled";
    if (duplicate) {
      rmSync(joined, { force: true });
      return this.#await(meta, sha256, sniffed, "duplicate", duplicate, folder.folder_id, title);
    }
    this.#keep(joined, sha256);
    const clash = vault.findByTitle(folder.folder_id, title);
    if (clash) return this.#await(meta, sha256, sniffed, "name", clash, folder.folder_id, title);
    const file = this.#addFile(meta, sha256, sniffed, folder.folder_id, title, by);
    this.#drop(meta);
    return { outcome: "added", file: vault.row(file), message: "Added." };
  }

  /** The open folder, with a dropped folder's shape below it (at most four levels in all). */
  #target(meta: UploadMeta, by: Staff): FolderRecord {
    const folders = meta.relative_path.split("/").slice(0, -1).filter(Boolean);
    const base = this.#vault.folder(meta.folder_id) ?? this.#vault.inbox();
    if (folders.length === 0) return base;
    return this.#vault.ensureFolderPath(folders, base.folder_id, by) ?? base;
  }

  #await(
    meta: UploadMeta,
    sha256: string,
    sniffed: Sniffed,
    clash: "duplicate" | "name",
    existing: FileMeta,
    folder_id: string,
    title: string,
  ): Answer {
    meta.state = "awaiting_choice";
    meta.pending = {
      sha256,
      kind: sniffed.kind,
      mime: sniffed.mime,
      clash,
      existing_file_id: existing.file_id,
      folder_id,
      title,
    };
    this.#save(meta);
    return this.#pendingAnswer(meta);
  }

  #pendingAnswer(meta: UploadMeta): Answer {
    const pending = meta.pending!;
    const existing = this.#vault.file(pending.existing_file_id);
    const row = existing ? this.#vault.row(existing) : null;
    if (pending.clash === "duplicate")
      return {
        outcome: "duplicate",
        upload_id: meta.upload_id,
        ...(row ? { existing: row } : {}),
        message: `Already here as “${row?.title ?? pending.title}” in ${row?.folder_path ?? "Files"}. Not added again.`,
      };
    return {
      outcome: "name_taken",
      upload_id: meta.upload_id,
      ...(row ? { existing: row } : {}),
      message: `A file named “${pending.title}” is already in this folder.`,
    };
  }

  // ------------------------------------------------------------------ the person's choice

  resolve(upload_id: string, choiceValue: unknown, by: Staff): Answer {
    const meta = this.#must(upload_id);
    const pending = meta.pending;
    if (meta.state !== "awaiting_choice" || !pending)
      throw new Refused(409, "invalid", "That upload has nothing to choose.");
    const choice = clean(choiceValue, 20);
    const vault = this.#vault;
    if (choice === "skip") {
      if (pending.clash === "name") this.#removeUnreferenced(pending.sha256);
      this.#drop(meta);
      return { outcome: "skipped", message: "Skipped: not added." };
    }
    if (!this.#core.store.exists(blobName(pending.sha256))) {
      this.#drop(meta);
      throw new Refused(409, "invalid", "Those bytes are no longer here. Add the file again.");
    }
    const sniffed: Sniffed = { kind: pending.kind, mime: pending.mime };
    if (pending.clash === "duplicate") {
      if (choice !== "anyway")
        throw new Refused(400, "invalid", "Choose to add it anyway, or skip it.");
      if (meta.file_id) {
        const file = vault.mustFile(meta.file_id);
        const version = this.#addVersion(file, meta, pending.sha256, sniffed, by);
        this.#drop(meta);
        return this.#versionAnswer(file, version);
      }
      const folder = vault.folder(pending.folder_id) ?? vault.inbox();
      const title = vault.uniqueTitle(folder.folder_id, pending.title);
      const file = this.#addFile(meta, pending.sha256, sniffed, folder.folder_id, title, by);
      this.#drop(meta);
      return {
        outcome: "added",
        file: vault.row(file),
        message: title === pending.title ? "Added." : `Added as “${title}”.`,
      };
    }
    if (choice === "version") {
      const file = vault.file(pending.existing_file_id);
      if (!file || file.trashed)
        throw new Refused(409, "invalid", "That file is no longer here; keep both instead.");
      const version = this.#addVersion(file, meta, pending.sha256, sniffed, by);
      this.#drop(meta);
      return this.#versionAnswer(file, version);
    }
    if (choice === "both") {
      const folder = vault.folder(pending.folder_id) ?? vault.inbox();
      const title = vault.uniqueTitle(folder.folder_id, pending.title);
      const file = this.#addFile(meta, pending.sha256, sniffed, folder.folder_id, title, by);
      this.#drop(meta);
      return { outcome: "added", file: vault.row(file), message: `Added as “${title}”.` };
    }
    throw new Refused(400, "invalid", "Choose a new version, keep both, or skip it.");
  }

  cancel(upload_id: string): Answer {
    const meta = this.#uploads.get(upload_id);
    if (!meta) return { cancelled: false };
    if (meta.pending?.clash === "name") this.#removeUnreferenced(meta.pending.sha256);
    this.#drop(meta);
    return { cancelled: true };
  }

  // ------------------------------------------------------------------ the bytes, kept once

  /** Move the joined file (synced already) into place under its hash, or drop it when those bytes are kept already. */
  #keep(joined: string, sha256: string): void {
    const store = this.#core.store;
    store.ensureDir(`files/blobs/${sha256.slice(0, 2)}`);
    const target = store.path(blobName(sha256));
    if (store.exists(blobName(sha256))) rmSync(joined, { force: true });
    else {
      renameSync(joined, target);
      syncFolder(dirname(target));
    }
  }

  /** Keep bytes in memory under their hash (a file another module puts in). */
  keepBytes(bytes: Uint8Array): string {
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const store = this.#core.store;
    if (store.exists(blobName(sha256))) return sha256;
    store.ensureDir(`files/blobs/${sha256.slice(0, 2)}`);
    const beside = store.path("files", `incoming-${randomUUID()}`);
    const fd = openSync(beside, "w", 0o600);
    try {
      writeAll(fd, bytes);
      fsyncSync(fd);
    } catch (error) {
      closeSync(fd);
      rmSync(beside, { force: true });
      throw error;
    }
    closeSync(fd);
    const target = store.path(blobName(sha256));
    renameSync(beside, target);
    syncFolder(dirname(target));
    return sha256;
  }

  #removeUnreferenced(sha256: string): void {
    if (this.#vault.referenced(sha256)) return;
    this.#core.store.remove(blobName(sha256));
  }

  #addFile(
    meta: UploadMeta,
    sha256: string,
    sniffed: Sniffed,
    folder_id: string,
    title: string,
    by: Staff,
  ): FileMeta {
    const version = this.#vault.newVersion({
      sha256,
      bytes: statSync(this.#core.store.path(blobName(sha256))).size,
      kind: sniffed.kind,
      mime: sniffed.mime,
      original_name: meta.name,
      by,
      note: meta.note,
      n: 1,
      text: readsText(sniffed.kind) ? "pending" : "not_applicable",
    });
    const file = this.#vault.addFile({
      folder_id,
      title,
      came_from: meta.relative_path.includes("/") ? meta.relative_path : "",
      version,
      by,
      file_id: this.#pins.get(meta.upload_id),
    });
    this.#pins.delete(meta.upload_id);
    if (version.text === "pending") this.#text.queue(sha256, sniffed.kind);
    return file;
  }

  #addVersion(file: FileMeta, meta: UploadMeta, sha256: string, sniffed: Sniffed, by: Staff) {
    const version = this.#vault.newVersion({
      sha256,
      bytes: statSync(this.#core.store.path(blobName(sha256))).size,
      kind: sniffed.kind,
      mime: sniffed.mime,
      original_name: meta.name,
      by,
      note: meta.note,
      n: this.#vault.nextVersionNumber(file),
      text: readsText(sniffed.kind) ? "pending" : "not_applicable",
    });
    this.#vault.addVersion(file, version, by);
    if (version.text === "pending") this.#text.queue(sha256, sniffed.kind);
    return version;
  }

  #versionAnswer(file: FileMeta, version: { n: number }): Answer {
    return {
      outcome: "version_added",
      file: this.#vault.row(file),
      message: `Added as version ${version.n} of “${file.title}”.`,
    };
  }

  /** Whether an id names an upload here (for the parts route to answer properly). */
  has(upload_id: string): boolean {
    return isUuid(upload_id) && this.#uploads.has(upload_id);
  }
}
