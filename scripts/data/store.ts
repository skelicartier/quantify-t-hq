/**
 * What Data keeps, as files under one folder the person's account alone can read:
 * `<Mail merge folder>/data/`. Modules each take a subfolder of it (`files/`, `leads/`,
 * …); nothing of Data's is ever written into Mail merge's own `lists/` or `mailings/`.
 *
 * A whole file is replaced by writing beside it, syncing, then renaming over it, so a
 * crash or a power cut leaves the old file or the new one and never half of either. Logs
 * are appended a line at a time and synced. Folders are 0700 and files 0600. Every path is
 * resolved and must stay inside the root: a name that climbs out is refused, not joined.
 */

import {
  appendFileSync,
  chmodSync,
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  ftruncateSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
  type Stats,
} from "node:fs";
import { dirname, resolve, sep } from "node:path";

/**
 * Every byte onto a file, or a throw: `writeSync` may write fewer bytes than it is given
 * (a full disk), so it is called again for the rest, and no progress at all is an error.
 */
export function writeAll(fd: number, data: string | Uint8Array): void {
  const bytes = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  let written = 0;
  while (written < bytes.length) {
    const count = writeSync(fd, bytes, written, bytes.length - written);
    if (!(count > 0)) throw new Error("the disk took none of the bytes");
    written += count;
  }
}

/** Sync a folder, so a rename into it outlasts a power cut; a system that cannot is let be. */
export function syncFolder(dir: string): void {
  let fd: number | null = null;
  try {
    fd = openSync(dir, "r");
    fsyncSync(fd);
  } catch {
    // Some file systems refuse to sync a folder; the file itself was synced already.
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

/**
 * A log a crash left with half a line at its end: cut back to its last whole line, so the
 * next line appended is not joined onto the fragment (and lost with it when read).
 */
function mendTornEnd(fd: number): void {
  const size = fstatSync(fd).size;
  if (size === 0) return;
  const last = Buffer.alloc(1);
  readSync(fd, last, 0, 1, size - 1);
  if (last[0] === 0x0a) return;
  const chunk = Buffer.alloc(64 * 1024);
  let end = size;
  let keep = 0;
  while (end > 0) {
    const start = Math.max(0, end - chunk.length);
    const got = readSync(fd, chunk, 0, end - start, start);
    const newline = chunk.subarray(0, got).lastIndexOf(0x0a);
    if (newline >= 0) {
      keep = start + newline + 1;
      break;
    }
    end = start;
  }
  ftruncateSync(fd, keep);
}

export class OutsideStoreError extends Error {
  constructor(name: string) {
    super(`"${name}" is outside the Data folder`);
    this.name = "OutsideStoreError";
  }
}

export class DataStore {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
    chmodSync(this.root, 0o700);
  }

  /** The absolute path of a name inside the root; a name that escapes it is refused. */
  path(...parts: string[]): string {
    const full = resolve(this.root, ...parts);
    if (full !== this.root && !full.startsWith(this.root + sep))
      throw new OutsideStoreError(parts.join("/"));
    return full;
  }

  /** Make a folder (and its parents) inside the root, 0700. */
  ensureDir(name: string): string {
    const dir = this.path(name);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
    return dir;
  }

  exists(name: string): boolean {
    return existsSync(this.path(name));
  }

  stat(name: string): Stats | null {
    const file = this.path(name);
    try {
      return statSync(file);
    } catch {
      return null;
    }
  }

  readJson<T>(name: string, fallback: T): T {
    const file = this.path(name);
    if (!existsSync(file)) return fallback;
    try {
      return JSON.parse(readFileSync(file, "utf8")) as T;
    } catch {
      // Unreadable is not "empty": keep the bytes for a person to look at.
      renameSync(file, `${file}.unreadable-${Date.now()}`);
      return fallback;
    }
  }

  /** The whole file, written beside, synced, then renamed into place. */
  writeJson(name: string, value: unknown): void {
    this.writeText(name, JSON.stringify(value));
  }

  writeText(name: string, text: string): void {
    const file = this.path(name);
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const beside = `${file}.writing`;
    const fd = openSync(beside, "w", 0o600);
    try {
      // Whole or not at all: a short write throws here, and the good file stays as it was.
      writeAll(fd, text);
      fsyncSync(fd);
    } catch (error) {
      closeSync(fd);
      rmSync(beside, { force: true });
      throw error;
    }
    closeSync(fd);
    chmodSync(beside, 0o600);
    renameSync(beside, file);
  }

  readText(name: string): string {
    const file = this.path(name);
    return existsSync(file) ? readFileSync(file, "utf8") : "";
  }

  readBytes(name: string): Uint8Array | null {
    const file = this.path(name);
    return existsSync(file) ? readFileSync(file) : null;
  }

  /**
   * One JSON line onto a log, synced before anything else happens. A torn last line (a
   * crash part-way through an append) is cut off first, so this line stands on its own.
   */
  appendLine(name: string, value: unknown): void {
    const file = this.path(name);
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const fd = openSync(file, "a+", 0o600);
    try {
      mendTornEnd(fd);
      writeAll(fd, `${JSON.stringify(value)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }

  /** Every whole line of a log; a last line cut short by a crash is skipped. */
  readLines<T>(name: string): T[] {
    return this.readLinesFrom<T>(name, 0).lines;
  }

  /**
   * The whole lines of a log from a byte offset on. A final line without its newline is
   * held back: the offset returned stops before it, so the next read sees it complete.
   */
  readLinesFrom<T>(name: string, offset: number): { lines: T[]; offset: number } {
    const file = this.path(name);
    const stat = this.stat(name);
    if (!stat || stat.size <= offset)
      return { lines: [], offset: stat ? Math.min(offset, stat.size) : 0 };
    const fd = openSync(file, "r");
    let bytes: Buffer;
    try {
      bytes = Buffer.alloc(stat.size - offset);
      let read = 0;
      while (read < bytes.length) {
        const got = readSync(fd, bytes, read, bytes.length - read, offset + read);
        if (got === 0) break;
        read += got;
      }
      bytes = bytes.subarray(0, read);
    } finally {
      closeSync(fd);
    }
    const lastNewline = bytes.lastIndexOf(0x0a);
    if (lastNewline < 0) return { lines: [], offset };
    const whole = bytes.subarray(0, lastNewline + 1).toString("utf8");
    const lines: T[] = [];
    for (const line of whole.split("\n")) {
      if (!line.trim()) continue;
      try {
        lines.push(JSON.parse(line) as T);
      } catch {
        // A line that is not JSON is somebody else's problem to look at; the log goes on.
      }
    }
    return { lines, offset: offset + lastNewline + 1 };
  }

  remove(name: string): void {
    rmSync(this.path(name), { force: true, recursive: true });
  }

  /** File names in a folder with this ending, without the ending; [] if no folder. */
  list(folder: string, ending = ""): string[] {
    const dir = this.path(folder);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((name) => name.endsWith(ending))
      .map((name) => (ending ? name.slice(0, -ending.length) : name));
  }

  /** Append bytes to a file, 0600; for a part of an upload or a build being made. */
  appendBytes(name: string, bytes: Uint8Array): void {
    appendFileSync(this.path(name), bytes, { mode: 0o600 });
  }
}
