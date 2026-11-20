/**
 * U4's test kit (ws-notes/security/spec.md §9.8): a zip built by hand, so the tests can make
 * every shape the XLSX reader must refuse, and a workbook the writer stored re-packed with
 * deflate, so the reader's inflate path runs. Every question is invented.
 */

import { crc32, deflateRawSync } from "node:zlib";

export type ZipPart = {
  name: string;
  data: Uint8Array | string;
  /** 0 stored, 8 deflate (the default), anything else written as it is. */
  method?: number;
  flags?: number;
  /** Write 0xFFFFFFFF as the sizes, as Zip64 does. */
  zip64?: boolean;
};

/** A zip built by hand, so the tests can make every shape the reader must refuse. */
export function zipOf(parts: readonly ZipPart[]): Uint8Array {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const part of parts) {
    const raw = Buffer.from(typeof part.data === "string" ? part.data : part.data);
    const method = part.method ?? 8;
    const body = method === 8 ? deflateRawSync(raw) : raw;
    const name = Buffer.from(part.name, "utf8");
    const crc = crc32(raw) >>> 0;
    const size = part.zip64 ? 0xffffffff : raw.length;
    const packed = part.zip64 ? 0xffffffff : body.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(part.flags ?? 0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    chunks.push(local, name, body);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(part.flags ?? 0, 8);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed, 20);
    entry.writeUInt32LE(size, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += 30 + name.length + body.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Math.min(parts.length, 0xffff), 8);
  end.writeUInt16LE(Math.min(parts.length, 0xffff), 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...chunks, directory, end]));
}

/** A stored zip (as `ZipWriter` writes one) re-packed with every entry deflated. */
export function deflated(bytes: Uint8Array): Uint8Array {
  const view = Buffer.from(bytes);
  const parts: ZipPart[] = [];
  let at = 0;
  while (at + 30 <= view.length && view.readUInt32LE(at) === 0x04034b50) {
    const size = view.readUInt32LE(at + 18);
    const nameLength = view.readUInt16LE(at + 26);
    const extraLength = view.readUInt16LE(at + 28);
    const name = view.subarray(at + 30, at + 30 + nameLength).toString("utf8");
    const start = at + 30 + nameLength + extraLength;
    parts.push({ name, data: new Uint8Array(view.subarray(start, start + size)), method: 8 });
    at = start + size;
  }
  return zipOf(parts);
}
