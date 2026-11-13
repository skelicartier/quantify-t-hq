// @vitest-environment node
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DataCore } from "../../scripts/data/core";
import { TextJobs } from "../../scripts/data/files/text-jobs";
import { PART_BYTES, Uploads } from "../../scripts/data/files/uploads";
import { Vault, blobName } from "../../scripts/data/files/vault";
import { DataStore } from "../../scripts/data/store";
import { WALKER } from "./helpers";

/**
 * What survives a crash, a power cut or a full disk: a log's torn last line never swallows
 * the next one, a short write never replaces a good file, a stored file's bytes are on the
 * disk before the index names them, and an upload that breaks while joining keeps its parts.
 * The disk's failures are injected; every byte is invented.
 */

const real = vi.hoisted(() => ({}) as { fs: typeof import("node:fs") });
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  real.fs = actual;
  return {
    ...actual,
    writeSync: vi.fn(actual.writeSync),
    openSync: vi.fn(actual.openSync),
    fsyncSync: vi.fn(actual.fsyncSync),
    renameSync: vi.fn(actual.renameSync),
  };
});

let dir: string;
beforeEach(() => {
  dir = real.fs.mkdtempSync(join(tmpdir(), "hqdd-"));
});
afterEach(() => {
  vi.mocked(fs.writeSync).mockImplementation(real.fs.writeSync);
  vi.mocked(fs.openSync).mockImplementation(real.fs.openSync);
  vi.mocked(fs.fsyncSync).mockImplementation(real.fs.fsyncSync);
  vi.mocked(fs.renameSync).mockImplementation(real.fs.renameSync);
  vi.clearAllMocks();
  real.fs.rmSync(dir, { recursive: true, force: true });
});

describe("a log", () => {
  it("cuts a torn last line off before the next line goes on, so neither is lost", () => {
    const store = new DataStore(join(dir, "data"));
    store.appendLine("replies/replies.jsonl", { reply_id: "r1" });
    // A power cut part-way through the next append.
    real.fs.appendFileSync(join(dir, "data", "replies", "replies.jsonl"), '{"reply_id":"r2","ki');
    store.appendLine("replies/replies.jsonl", { reply_id: "r3", kind: "take_back" });
    expect(store.readLines<{ reply_id: string }>("replies/replies.jsonl")).toEqual([
      { reply_id: "r1" },
      { reply_id: "r3", kind: "take_back" },
    ]);
    // A log that is nothing but a fragment is cut back to nothing.
    real.fs.writeFileSync(join(dir, "data", "replies", "torn.jsonl"), '{"reply_id":"r');
    store.appendLine("replies/torn.jsonl", { reply_id: "r4" });
    expect(store.readText("replies/torn.jsonl")).toBe('{"reply_id":"r4"}\n');
  });
});

describe("a whole file", () => {
  it("is written whole when the disk takes the bytes a few at a time", () => {
    const store = new DataStore(join(dir, "data"));
    vi.mocked(fs.writeSync).mockImplementation(((
      fd: number,
      buffer: Uint8Array,
      offset: number,
      length: number,
    ) =>
      real.fs.writeSync(
        fd,
        buffer,
        offset,
        Math.max(1, Math.floor(length / 3)),
      )) as typeof fs.writeSync);
    const index = { format: 1, files: Array.from({ length: 200 }, (_, n) => `file-${n}`) };
    store.writeJson("files/index.json", index);
    store.appendLine("files/activity.jsonl", { verb: "Added", n: 1 });
    expect(store.readJson("files/index.json", null)).toEqual(index);
    expect(store.readLines("files/activity.jsonl")).toEqual([{ verb: "Added", n: 1 }]);
    // The disk really did take them a few at a time.
    expect(vi.mocked(fs.writeSync).mock.calls.length).toBeGreaterThan(10);
  });

  it("never replaces the good file when the disk fills part-way", () => {
    const store = new DataStore(join(dir, "data"));
    store.writeJson("leads/edits.json", { kept: true });
    let calls = 0;
    vi.mocked(fs.writeSync).mockImplementation(((
      fd: number,
      buffer: Uint8Array,
      offset: number,
      length: number,
    ) => {
      calls += 1;
      if (calls > 1) throw Object.assign(new Error("no space left on device"), { code: "ENOSPC" });
      return real.fs.writeSync(fd, buffer, offset, Math.floor(length / 2));
    }) as typeof fs.writeSync);
    expect(() =>
      store.writeJson("leads/edits.json", { kept: false, more: "x".repeat(500) }),
    ).toThrow("no space left on device");
    vi.mocked(fs.writeSync).mockImplementation(real.fs.writeSync);
    expect(store.readJson("leads/edits.json", null)).toEqual({ kept: true });
    expect(real.fs.readdirSync(join(dir, "data", "leads"))).toEqual(["edits.json"]);
  });
});

/** The files module's parts, in this thread: the store, the vault and the uploads. */
function openFiles(): { core: DataCore; vault: Vault; uploads: Uploads } {
  const core = new DataCore({ dir, post: () => undefined, log: () => undefined });
  const vault = new Vault(core);
  vault.open();
  const uploads = new Uploads(core, vault, new TextJobs(core, vault));
  uploads.open();
  return { core, vault, uploads };
}

/** Begin an upload and put its parts where the host would have written them. */
function put(
  files: { core: DataCore; uploads: Uploads },
  name: string,
  bytes: Uint8Array,
  fileId?: string,
): string {
  const begun = files.uploads.begin(
    { name, size: bytes.length, ...(fileId ? { file_id: fileId } : {}) },
    WALKER,
  );
  const id = String(begun.upload_id);
  for (let index = 0; index * PART_BYTES < bytes.length; index += 1)
    real.fs.writeFileSync(
      files.core.store.path(`files/uploads/${id}/part-${String(index).padStart(4, "0")}`),
      bytes.subarray(index * PART_BYTES, (index + 1) * PART_BYTES),
    );
  return id;
}

describe("a stored file", () => {
  it("is synced to the disk before it is renamed into place and named in the index", async () => {
    const files = openFiles();
    try {
      const opened = new Map<number, string>();
      const seen: string[] = [];
      vi.mocked(fs.openSync).mockImplementation(((path: fs.PathLike, ...rest: never[]) => {
        const fd = (real.fs.openSync as (...args: unknown[]) => number)(path, ...rest);
        opened.set(fd, String(path));
        return fd;
      }) as typeof fs.openSync);
      vi.mocked(fs.fsyncSync).mockImplementation((fd: number) => {
        seen.push(`sync ${opened.get(fd) ?? fd}`);
        real.fs.fsyncSync(fd);
      });
      vi.mocked(fs.renameSync).mockImplementation((from: fs.PathLike, to: fs.PathLike) => {
        seen.push(`rename ${String(from)} > ${String(to)}`);
        real.fs.renameSync(from, to);
      });
      const bytes = new Uint8Array(PART_BYTES + 10).fill(0xff);
      const id = put(files, "statement.bin", bytes);
      const answer = await files.uploads.finish(id, WALKER);
      expect(answer.outcome).toBe("added");
      const sha256 = files.vault.files()[0]!.versions[0]!.sha256;
      const joined = files.core.store.path(`files/uploads/${id}/joined`);
      const blob = files.core.store.path(blobName(sha256));
      const index = files.core.store.path("files/index.json");
      const renamed = seen.indexOf(`rename ${joined} > ${blob}`);
      expect(renamed).toBeGreaterThan(-1);
      expect(seen.indexOf(`sync ${joined}`)).toBeGreaterThan(-1);
      expect(seen.indexOf(`sync ${joined}`)).toBeLessThan(renamed);
      // The blob's folder too, then the index that names it.
      expect(
        seen.indexOf(`sync ${files.core.store.path("files/blobs", sha256.slice(0, 2))}`),
      ).toBeGreaterThan(renamed);
      expect(seen.lastIndexOf(`rename ${index}.writing > ${index}`)).toBeGreaterThan(renamed);
      expect(real.fs.readFileSync(blob).equals(Buffer.from(bytes))).toBe(true);

      // Bytes another module puts in: synced before the rename as well.
      seen.length = 0;
      const sha = files.uploads.keepBytes(new TextEncoder().encode("invented,csv\n1,2\n"));
      const kept = seen.findIndex(
        (step) =>
          step.startsWith("rename ") && step.endsWith(` > ${files.core.store.path(blobName(sha))}`),
      );
      expect(kept).toBeGreaterThan(0);
      expect(seen[kept - 1]).toMatch(/^sync .*incoming-/);
    } finally {
      files.core.close();
    }
  });
});

describe("an upload that breaks while its parts are joined", () => {
  it("keeps its parts and can be finished again, or cancelled", async () => {
    const files = openFiles();
    try {
      const first = await files.uploads.finish(
        put(files, "deck.bin", new Uint8Array(100).fill(0xfe)),
        WALKER,
      );
      const fileId = (first.file as { file_id: string }).file_id;
      // A new version is coming in when the file is deleted forever: the join cannot finish.
      const id = put(files, "deck.bin", new Uint8Array(200).fill(0xfd), fileId);
      files.vault.trash(fileId, WALKER);
      files.vault.deleteForever(fileId);
      await expect(files.uploads.finish(id, WALKER)).rejects.toMatchObject({ code: "not_found" });
      expect(files.core.store.exists(`files/uploads/${id}/part-0000`)).toBe(true);
      expect(files.core.store.exists(`files/uploads/${id}/joined`)).toBe(false);
      // Not "That upload is finished.": it is as it was before finishing.
      await expect(files.uploads.finish(id, WALKER)).rejects.toMatchObject({ code: "not_found" });
      expect(files.uploads.cancel(id)).toEqual({ cancelled: true });
      expect(files.core.store.exists(`files/uploads/${id}`)).toBe(false);
    } finally {
      files.core.close();
    }
  });

  it("is whole again after the worker died part-way through joining it", async () => {
    const before = openFiles();
    const bytes = new Uint8Array(PART_BYTES * 2 + 5).fill(0xfc);
    const id = put(before, "bank statement.bin", bytes);
    // The worker dies after the first part is joined: nothing after that point ever runs.
    before.core.yield = () => new Promise<void>(() => undefined);
    void before.uploads.finish(id, WALKER);
    await new Promise((resolve) => setTimeout(resolve, 20));
    before.core.close();
    // The next start finds it part-way joined, puts it back to receiving, and it finishes.
    const after = openFiles();
    try {
      const answer = await after.uploads.finish(id, WALKER);
      expect(answer).toMatchObject({ outcome: "added", message: "Added." });
      const version = after.vault.files()[0]!.versions[0]!;
      expect(version.bytes).toBe(bytes.length);
      expect(real.fs.readFileSync(after.core.store.path(blobName(version.sha256))).length).toBe(
        bytes.length,
      );
    } finally {
      after.core.close();
    }
  });
});
