// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32 } from "node:zlib";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ZipWriter, crcOfFile, zipEntryName } from "../../scripts/data/zip";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hqzip-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** The CRC and size of every entry, read from the central directory. */
function centralDirectory(zip: Buffer): Map<string, { crc: number; size: number }> {
  const end = zip.length - 22;
  expect(zip.readUInt32LE(end)).toBe(0x06054b50);
  const count = zip.readUInt16LE(end + 10);
  let cursor = zip.readUInt32LE(end + 16);
  const entries = new Map<string, { crc: number; size: number }>();
  for (let index = 0; index < count; index += 1) {
    expect(zip.readUInt32LE(cursor)).toBe(0x02014b50);
    const crc = zip.readUInt32LE(cursor + 16);
    const size = zip.readUInt32LE(cursor + 24);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    entries.set(name, { crc, size });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

describe("the streaming stored zip", () => {
  it("is accepted by the system's unzip, with every CRC and a manifest that match", async () => {
    const big = randomBytes(200_000 + 123);
    writeFileSync(join(dir, "deck.pdf"), big);
    const note = new TextEncoder().encode("Registered office: an invented address.\n");
    const manifest = `${sha256(big)}  10 Fundraising and investors/deck.pdf\n${sha256(note)}  note ✓.txt\n`;
    const zipPath = join(dir, "out.zip");
    const zip = new ZipWriter(zipPath, new Date("2026-11-10T06:00:00.000Z"));
    const first = await zip.addFile("10 Fundraising and investors/deck.pdf", join(dir, "deck.pdf"));
    await zip.addBytes("note ✓.txt", note);
    await zip.addBytes("manifest-sha256.txt", new TextEncoder().encode(manifest));
    const done = await zip.finish();
    expect(done.entries).toBe(3);
    expect(first).toEqual({ crc: crc32(big) >>> 0, size: big.length });
    expect(await crcOfFile(join(dir, "deck.pdf"))).toBe(crc32(big) >>> 0);

    const tested = execFileSync("unzip", ["-t", zipPath], { encoding: "utf8" });
    expect(tested).toMatch(/No errors detected/);
    const outDeck = execFileSync("unzip", ["-p", zipPath, "10 Fundraising and investors/deck.pdf"]);
    expect(Buffer.compare(outDeck, big)).toBe(0);
    const outManifest = execFileSync("unzip", ["-p", zipPath, "manifest-sha256.txt"], {
      encoding: "utf8",
    });
    expect(outManifest).toBe(manifest);
    // Info-ZIP on this Mac cannot be handed a UTF-8 name as an argument (the zip's names are
    // UTF-8 and flagged so); a wildcard reaches the one with the tick.
    const patterns: Record<string, string> = {
      "10 Fundraising and investors/deck.pdf": "10 Fundraising and investors/deck.pdf",
      "note ✓.txt": "note*.txt",
    };
    for (const line of manifest.trim().split("\n")) {
      const [hash, name] = line.split("  ") as [string, string];
      expect(sha256(execFileSync("unzip", ["-p", zipPath, patterns[name] ?? name]))).toBe(hash);
    }

    const central = centralDirectory(readFileSync(zipPath));
    expect(central.get("10 Fundraising and investors/deck.pdf")).toEqual({
      crc: crc32(big) >>> 0,
      size: big.length,
    });
    expect(central.get("note ✓.txt")).toEqual({ crc: crc32(note) >>> 0, size: note.length });
    expect(done.bytes).toBe(readFileSync(zipPath).length);
  });

  it("refuses a second entry with the same name and anything after finish", async () => {
    const zip = new ZipWriter(join(dir, "dup.zip"));
    await zip.addBytes("a.txt", new TextEncoder().encode("a"));
    await expect(zip.addBytes("a.txt", new TextEncoder().encode("b"))).rejects.toThrow(/already/);
    await zip.finish();
    await expect(zip.addBytes("c.txt", new TextEncoder().encode("c"))).rejects.toThrow(/finished/);
  });

  it("names entries safely", () => {
    expect(zipEntryName("10 Fundraising and investors", "deck.pdf")).toBe(
      "10 Fundraising and investors/deck.pdf",
    );
    expect(zipEntryName("../../etc", "passwd")).toBe("etc/passwd");
    expect(zipEntryName("a\\b", "c\u0000d")).toBe("a_b/c_d");
  });
});
