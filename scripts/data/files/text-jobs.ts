/**
 * The words inside files, read in the background one file at a time so search can find
 * them: a PDF's text through `unpdf` (a page at a time, yielding between pages), a CSV's
 * exact row and column counts, and the text of a text file. What was read is kept per
 * content: `files/text/<sha256>.txt` (at most 2 MB) and `files/text/<sha256>.json` (its
 * state, pages, rows and columns).
 *
 * A file that crashes the reader must not crash it again: the worker marks a poison pill
 * before reading and clears it after, so after a death mid-read the next start marks that
 * file "Could not be read" and moves on.
 */

import { closeSync, openSync, readSync } from "node:fs";

import type { FileKind, TextState } from "../../../src/lib/data/labels";
import type { DataCore, Job } from "../core";
import { PoisonedError } from "../core";
import { decode } from "../text";
import { blobName, type Vault } from "./vault";

export const TEXT_LIMIT_CHARS = 2 * 1024 * 1024;
export const PDF_MAX_BYTES = 100 * 1024 * 1024;
export const PDF_MAX_PAGES = 1_000;
export const CSV_ROW_CAP = 1_000_000;
const READ_BUDGET_MS = 120_000;
const CHUNK = 4 * 1024 * 1024;
const CACHE_CHARS = 128 * 1024 * 1024;
/** Only with the test routes on: a file holding these words crashes the reader, as a bad PDF might. */
export const CRASH_MARK = "HQ-WALK-CRASH-READER";

export type TextRecord = {
  state: TextState;
  pages: number | null;
  rows: number | null;
  columns: number | null;
  read_at: string | null;
  reading?: true;
};

type Read = { record: TextRecord; text: string };

export function readsText(kind: FileKind): boolean {
  return kind === "pdf" || kind === "csv" || kind === "text";
}

/**
 * A CSV's rows and columns, counted exactly over its bytes as the sender's reader would
 * read it: quoted commas and line breaks stay inside their cell, blank lines do not count,
 * and the first row is the header. Works on any size, a chunk at a time.
 */
export class CsvCounter {
  #quoted = false;
  #quoteSeen = false;
  #previousCr = false;
  #content = false;
  rows = 0;

  push(bytes: Uint8Array): void {
    for (let index = 0; index < bytes.length; index += 1) this.#byte(bytes[index]!);
  }

  #endRow(): void {
    if (this.#content) this.rows += 1;
    this.#content = false;
  }

  #byte(byte: number): void {
    if (this.#quoted) {
      if (this.#quoteSeen) {
        this.#quoteSeen = false;
        if (byte === 0x22) {
          this.#content = true; // a doubled quote: one quote inside the cell
          return;
        }
        this.#quoted = false; // the cell's closing quote; this byte is outside it
      } else if (byte === 0x22) {
        this.#quoteSeen = true;
        return;
      } else {
        if (byte !== 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) this.#content = true;
        return;
      }
    }
    if (byte === 0x0a && this.#previousCr) {
      this.#previousCr = false;
      return;
    }
    this.#previousCr = false;
    if (byte === 0x22) {
      this.#quoted = true;
      return;
    }
    if (byte === 0x0d) {
      this.#previousCr = true;
      this.#endRow();
      return;
    }
    if (byte === 0x0a) {
      this.#endRow();
      return;
    }
    if (byte !== 0x2c && byte !== 0x20 && byte !== 0x09) this.#content = true;
  }

  /** The non-blank rows, the header included. */
  finish(): number {
    this.#quoteSeen = false;
    this.#quoted = false;
    this.#endRow();
    return this.rows;
  }
}

export class TextJobs {
  readonly #core: DataCore;
  readonly #vault: Vault;
  readonly #queue: { sha256: string; kind: FileKind }[] = [];
  readonly #queued = new Set<string>();
  readonly #cache = new Map<string, string>();
  #cacheChars = 0;
  #running = false;
  #job: Job | null = null;

  constructor(core: DataCore, vault: Vault) {
    this.#core = core;
    this.#vault = vault;
  }

  /** How many files are waiting to be read or being read now. */
  pending(): number {
    return this.#queued.size;
  }

  /** At start: everything left waiting or half-read, again; a file that crashed the reader, not again. */
  resume(): void {
    for (const file of this.#vault.files())
      for (const version of file.versions)
        if (version.text === "pending" || version.text === "reading")
          this.queue(version.sha256, version.kind);
  }

  queue(sha256: string, kind: FileKind): void {
    if (!readsText(kind)) return;
    const key = `text:${sha256}`;
    if (this.#core.pills.poisoned(key)) {
      // It was being read when the worker died: say so, once, and never read it again.
      this.#apply(
        sha256,
        { state: "failed", pages: null, rows: null, columns: null, read_at: this.#core.now() },
        "",
      );
      this.#core.pills.forget(key);
      this.#core.log("a file crashed the reader last time; it is marked could not be read");
      return;
    }
    if (this.#queued.has(sha256)) return;
    this.#queued.add(sha256);
    this.#queue.push({ sha256, kind });
    if (this.#job) this.#job.setTotal(this.#job.total + 1);
    if (!this.#running) void this.#run();
  }

  async #run(): Promise<void> {
    this.#running = true;
    this.#job = this.#core.startJob(
      "reading",
      this.#queue.length,
      "Reading the words inside files",
    );
    try {
      for (let next = this.#queue.shift(); next; next = this.#queue.shift()) {
        await this.#core.yield();
        try {
          await this.#readOne(next.sha256, next.kind);
        } catch (error) {
          this.#core.log(`a text job failed: ${error instanceof Error ? error.name : "error"}`);
        }
        this.#queued.delete(next.sha256);
        this.#job.advance();
      }
    } finally {
      this.#job?.finish();
      this.#job = null;
      this.#running = false;
    }
  }

  async #readOne(sha256: string, kind: FileKind): Promise<void> {
    if (!this.#core.store.exists(blobName(sha256))) return;
    if (!this.#vault.referenced(sha256)) return;
    this.#apply(
      sha256,
      { state: "reading", pages: null, rows: null, columns: null, read_at: null, reading: true },
      null,
    );
    let read: Read;
    try {
      read = await this.#core.pills.guard(`text:${sha256}`, () => this.#read(sha256, kind));
    } catch (error) {
      if (!(error instanceof PoisonedError))
        this.#core.log(
          `a file could not be read: ${error instanceof Error ? error.name : "error"}`,
        );
      read = {
        record: {
          state: "failed",
          pages: null,
          rows: null,
          columns: null,
          read_at: this.#core.now(),
        },
        text: "",
      };
    }
    this.#apply(sha256, read.record, read.text);
  }

  /** Record what was read, for every version with these bytes. `text` null leaves the words alone. */
  #apply(sha256: string, record: TextRecord, text: string | null): void {
    const store = this.#core.store;
    if (text !== null) {
      if (text) store.writeText(`files/text/${sha256}.txt`, text);
      else store.remove(`files/text/${sha256}.txt`);
      this.#forget(sha256);
    }
    store.writeJson(`files/text/${sha256}.json`, record);
    for (const version of this.#vault.versionsOf(sha256)) {
      version.text = record.state;
      version.pages = record.pages;
      version.rows = record.rows;
      version.columns = record.columns;
    }
    this.#vault.save();
  }

  async #read(sha256: string, kind: FileKind): Promise<Read> {
    const path = this.#core.store.path(blobName(sha256));
    if (this.#core.testRoutes) {
      const head = this.head(sha256, 65_536);
      if (Buffer.from(head).includes(CRASH_MARK)) process.exit(3);
    }
    if (kind === "pdf") return this.#readPdf(sha256);
    if (kind === "csv") return this.#readCsv(path, sha256);
    return this.#readPlain(sha256);
  }

  async #readPdf(sha256: string): Promise<Read> {
    const size = this.#core.store.stat(blobName(sha256))?.size ?? 0;
    const now = () => this.#core.now();
    if (size > PDF_MAX_BYTES)
      return {
        record: { state: "too_large", pages: null, rows: null, columns: null, read_at: now() },
        text: "",
      };
    const bytes = this.#core.store.readBytes(blobName(sha256));
    if (!bytes) throw new Error("the stored bytes are missing");
    const { getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0 });
    const pages = pdf.numPages;
    try {
      if (pages > PDF_MAX_PAGES)
        return {
          record: { state: "too_large", pages, rows: null, columns: null, read_at: now() },
          text: "",
        };
      const started = Date.now();
      let text = "";
      for (let number = 1; number <= pages; number += 1) {
        const page = await pdf.getPage(number);
        const content = await page.getTextContent();
        const words = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .replace(/[ \t]+/g, " ")
          .trim();
        if (words) text += `${words}\n`;
        page.cleanup();
        await this.#core.yield();
        if (text.length >= TEXT_LIMIT_CHARS) break;
        if (Date.now() - started > READ_BUDGET_MS)
          return {
            record: { state: "too_large", pages, rows: null, columns: null, read_at: now() },
            text: "",
          };
      }
      text = text.slice(0, TEXT_LIMIT_CHARS);
      return {
        record: {
          state: text.trim() ? "read" : "none",
          pages,
          rows: null,
          columns: null,
          read_at: now(),
        },
        text,
      };
    } finally {
      await pdf.loadingTask?.destroy?.().catch(() => undefined);
    }
  }

  async #readCsv(path: string, sha256: string): Promise<Read> {
    const head = this.head(sha256, TEXT_LIMIT_CHARS);
    const text = decode(head).slice(0, TEXT_LIMIT_CHARS);
    let rows: number;
    if ((head[0] === 0xff && head[1] === 0xfe) || (head[0] === 0xfe && head[1] === 0xff)) {
      // UTF-16: count over the decoded whole, as the reader would see it.
      const all = this.#core.store.readBytes(blobName(sha256)) ?? new Uint8Array();
      const counter = new CsvCounter();
      counter.push(new TextEncoder().encode(decode(all)));
      rows = counter.finish();
    } else {
      const counter = new CsvCounter();
      const fd = openSync(path, "r");
      try {
        const buffer = Buffer.alloc(CHUNK);
        for (let position = 0; ;) {
          const got = readSync(fd, buffer, 0, CHUNK, position);
          if (got === 0) break;
          counter.push(buffer.subarray(0, got));
          position += got;
          if (counter.rows > CSV_ROW_CAP) break;
          await this.#core.yield();
        }
      } finally {
        closeSync(fd);
      }
      rows = counter.finish();
    }
    const header = headerOf(text);
    return {
      record: {
        state: "read",
        pages: null,
        rows: Math.min(CSV_ROW_CAP, Math.max(0, rows - 1)),
        columns: header.length,
        read_at: this.#core.now(),
      },
      text,
    };
  }

  async #readPlain(sha256: string): Promise<Read> {
    const text = decode(this.head(sha256, TEXT_LIMIT_CHARS)).slice(0, TEXT_LIMIT_CHARS);
    return {
      record: {
        state: text.trim() ? "read" : "none",
        pages: null,
        rows: null,
        columns: null,
        read_at: this.#core.now(),
      },
      text,
    };
  }

  /** The first bytes of stored content, cut where a character would be split. */
  head(sha256: string, max: number): Uint8Array {
    const path = this.#core.store.path(blobName(sha256));
    let fd: number;
    try {
      fd = openSync(path, "r");
    } catch {
      return new Uint8Array();
    }
    try {
      const buffer = Buffer.alloc(max);
      let read = 0;
      while (read < max) {
        const got = readSync(fd, buffer, read, max - read, read);
        if (got === 0) break;
        read += got;
      }
      return trimToCharacter(buffer.subarray(0, read), read === max);
    } finally {
      closeSync(fd);
    }
  }

  /** The words kept for search; "" when none were read. */
  textOf(sha256: string): string {
    const cached = this.#cache.get(sha256);
    if (cached !== undefined) return cached;
    const text = this.#core.store.readText(`files/text/${sha256}.txt`);
    if (this.#cacheChars + text.length <= CACHE_CHARS) {
      this.#cache.set(sha256, text);
      this.#cacheChars += text.length;
    }
    return text;
  }

  #forget(sha256: string): void {
    const cached = this.#cache.get(sha256);
    if (cached === undefined) return;
    this.#cacheChars -= cached.length;
    this.#cache.delete(sha256);
  }
}

/** The header cells of a CSV's text: its first non-blank row. */
export function headerOf(text: string): string[] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else if (char === "\r" || char === "\n") {
      cells.push(cell);
      if (cells.some((value) => value.trim() !== "")) return cells.map((value) => value.trim());
      cells.length = 0;
      cell = "";
    } else cell += char;
  }
  cells.push(cell);
  return cells.some((value) => value.trim() !== "") ? cells.map((value) => value.trim()) : [];
}

/** Bytes cut at the sample's edge so a multi-byte UTF-8 character is not split. */
function trimToCharacter(bytes: Uint8Array, cut: boolean): Uint8Array {
  if (!cut) return bytes;
  const end = bytes.length;
  for (let back = 1; back <= 3 && end - back >= 0; back += 1) {
    const byte = bytes[end - back]!;
    if ((byte & 0xc0) === 0x80) continue;
    if (byte >= 0xc0) return bytes.subarray(0, end - back);
    break;
  }
  return bytes;
}
