/**
 * A zip written to disk a file at a time, stored (not compressed), so a folder of
 * documents or a whole backup can be made without holding it in memory.
 *
 * Each entry's local header carries its size and CRC, so no data descriptors are needed:
 * a file is read once for its CRC and once more to copy its bytes. Stored zips open
 * everywhere, and nothing here can be fed a zip bomb. Limits: 5,000 entries and 2 GiB in
 * all, which keeps every field inside the plain zip format (no Zip64).
 */

import { createReadStream, createWriteStream, statSync, type WriteStream } from "node:fs";
import { once } from "node:events";
import { crc32 } from "node:zlib";

export const ZIP_MAX_ENTRIES = 5_000;
export const ZIP_MAX_BYTES = 2 * 1024 * 1024 * 1024;

export class ZipLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipLimitError";
  }
}

type Central = { name: Uint8Array; crc: number; size: number; offset: number };

/** DOS date and time, which zip stores (two-second resolution); written in UTC. */
function dosStamp(at: Date): { time: number; date: number } {
  const time =
    (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | Math.floor(at.getUTCSeconds() / 2);
  const date =
    ((at.getUTCFullYear() - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate();
  return { time, date };
}

/** The CRC-32 of a file on disk, read in pieces. */
export async function crcOfFile(path: string): Promise<number> {
  let crc = 0;
  for await (const chunk of createReadStream(path)) crc = crc32(chunk as Uint8Array, crc);
  return crc >>> 0;
}

export class ZipWriter {
  readonly #out: WriteStream;
  readonly #stamp: { time: number; date: number };
  readonly #centrals: Central[] = [];
  readonly #names = new Set<string>();
  #offset = 0;
  #finished = false;

  constructor(path: string, at = new Date()) {
    this.#out = createWriteStream(path, { mode: 0o600 });
    this.#stamp = dosStamp(at);
  }

  get entries(): number {
    return this.#centrals.length;
  }

  /** Bytes written so far, headers included. */
  get bytes(): number {
    return this.#offset;
  }

  async #write(bytes: Uint8Array): Promise<void> {
    if (!this.#out.write(bytes)) await once(this.#out, "drain");
    this.#offset += bytes.length;
  }

  #header(name: Uint8Array, crc: number, size: number): Uint8Array {
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // names are UTF-8
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, this.#stamp.time, true);
    local.setUint16(12, this.#stamp.date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    return new Uint8Array(local.buffer);
  }

  async #begin(entryName: string, crc: number, size: number): Promise<Uint8Array> {
    if (this.#finished) throw new Error("the zip is finished");
    if (this.#centrals.length >= ZIP_MAX_ENTRIES)
      throw new ZipLimitError(
        `A zip holds ${ZIP_MAX_ENTRIES.toLocaleString("en-GB")} files at most.`,
      );
    const name = new TextEncoder().encode(entryName);
    if (name.length === 0 || name.length > 65_535) throw new Error("a zip entry needs a name");
    if (this.#names.has(entryName)) throw new Error(`"${entryName}" is already in the zip`);
    if (this.#offset + 30 + name.length + size + 46 + name.length + 22 > ZIP_MAX_BYTES)
      throw new ZipLimitError("A zip holds 2 GB at most.");
    this.#names.add(entryName);
    this.#centrals.push({ name, crc, size, offset: this.#offset });
    // The local header, then the name, then (by the caller) the bytes.
    await this.#write(this.#header(name, crc, size));
    await this.#write(name);
    return name;
  }

  /** A file on disk, read twice: once for its CRC, once to copy it in. */
  async addFile(entryName: string, path: string): Promise<{ crc: number; size: number }> {
    const size = statSync(path).size;
    const crc = await crcOfFile(path);
    await this.#begin(entryName, crc, size);
    let copied = 0;
    for await (const chunk of createReadStream(path)) {
      const bytes = chunk as Uint8Array;
      copied += bytes.length;
      if (copied > size) throw new Error(`"${entryName}" grew while it was being zipped`);
      await this.#write(bytes);
    }
    if (copied !== size) throw new Error(`"${entryName}" shrank while it was being zipped`);
    return { crc, size };
  }

  /** Bytes already in memory: a manifest, an index. */
  async addBytes(entryName: string, bytes: Uint8Array): Promise<{ crc: number; size: number }> {
    const crc = crc32(bytes) >>> 0;
    await this.#begin(entryName, crc, bytes.length);
    await this.#write(bytes);
    return { crc, size: bytes.length };
  }

  /** The central directory and the end record; the file is complete once this resolves. */
  async finish(): Promise<{ entries: number; bytes: number }> {
    if (this.#finished) throw new Error("the zip is finished");
    this.#finished = true;
    const start = this.#offset;
    for (const entry of this.#centrals) {
      const central = new DataView(new ArrayBuffer(46));
      central.setUint32(0, 0x02014b50, true);
      central.setUint16(4, 20, true);
      central.setUint16(6, 20, true);
      central.setUint16(8, 0x0800, true);
      central.setUint16(10, 0, true);
      central.setUint16(12, this.#stamp.time, true);
      central.setUint16(14, this.#stamp.date, true);
      central.setUint32(16, entry.crc, true);
      central.setUint32(20, entry.size, true);
      central.setUint32(24, entry.size, true);
      central.setUint16(28, entry.name.length, true);
      central.setUint32(42, entry.offset, true);
      await this.#write(new Uint8Array(central.buffer));
      await this.#write(entry.name);
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, this.#centrals.length, true);
    end.setUint16(10, this.#centrals.length, true);
    end.setUint32(12, this.#offset - start, true);
    end.setUint32(16, start, true);
    await this.#write(new Uint8Array(end.buffer));
    this.#out.end();
    await once(this.#out, "finish");
    return { entries: this.#centrals.length, bytes: this.#offset };
  }

  /** Give up: close the file so it can be removed. */
  async abort(): Promise<void> {
    this.#finished = true;
    this.#out.destroy();
    await once(this.#out, "close").catch(() => undefined);
  }
}

/** A zip entry name from a path inside the zip: forward slashes, no leading slash. */
export function zipEntryName(...parts: string[]): string {
  return parts
    .flatMap((part) => part.split("/"))
    .map((part) => part.replace(/[\\\u0000-\u001f]/g, "_").trim())
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}
