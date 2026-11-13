// @vitest-environment node
import { appendFileSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DataStore, OutsideStoreError } from "../../scripts/data/store";

let root: string;
let store: DataStore;

beforeEach(() => {
  root = join(mkdtempSync(join(tmpdir(), "hqds-")), "data");
  store = new DataStore(root);
});
afterEach(() => rmSync(join(root, ".."), { recursive: true, force: true }));

describe("the Data store", () => {
  it("makes its folder 0700 and its files 0600, written beside and renamed into place", () => {
    expect(statSync(root).mode & 0o777).toBe(0o700);
    store.writeJson("files/index.json", { format: 1, files: [] });
    expect(statSync(join(root, "files")).mode & 0o777).toBe(0o700);
    expect(statSync(join(root, "files", "index.json")).mode & 0o777).toBe(0o600);
    expect(readdirSync(join(root, "files"))).toEqual(["index.json"]); // no .writing left behind
    expect(store.readJson("files/index.json", null)).toEqual({ format: 1, files: [] });
    store.writeJson("files/index.json", { format: 1, files: ["a"] });
    expect(store.readJson<{ files: string[] }>("files/index.json", { files: [] }).files).toEqual([
      "a",
    ]);
  });

  it("keeps an unreadable file for a person to look at and answers the fallback", () => {
    store.writeText("leads/edits.json", "{ not json");
    expect(store.readJson("leads/edits.json", { fallback: true })).toEqual({ fallback: true });
    expect(existsSync(join(root, "leads", "edits.json"))).toBe(false);
    expect(readdirSync(join(root, "leads")).some((name) => name.includes(".unreadable-"))).toBe(
      true,
    );
  });

  it("refuses any path outside its root", () => {
    expect(() => store.path("../settings.json")).toThrow(OutsideStoreError);
    expect(() => store.path("files", "..", "..", "lists")).toThrow(OutsideStoreError);
    expect(() => store.writeJson("../stop-list.json", [])).toThrow(OutsideStoreError);
    expect(() => store.readText("/etc/passwd")).toThrow(OutsideStoreError);
    expect(() => store.remove("..")).toThrow(OutsideStoreError);
    expect(store.path("files", "blobs", "ab", "abc")).toBe(
      join(root, "files", "blobs", "ab", "abc"),
    );
    expect(store.path(".")).toBe(root);
  });

  it("appends lines 0600 and skips a torn last line until it is whole", () => {
    store.appendLine("replies/replies.jsonl", { reply_id: "r1" });
    store.appendLine("replies/replies.jsonl", { reply_id: "r2" });
    expect(statSync(join(root, "replies", "replies.jsonl")).mode & 0o777).toBe(0o600);
    appendFileSync(join(root, "replies", "replies.jsonl"), '{"reply_id":"r3"');
    expect(
      store.readLines<{ reply_id: string }>("replies/replies.jsonl").map((l) => l.reply_id),
    ).toEqual(["r1", "r2"]);
    const first = store.readLinesFrom<{ reply_id: string }>("replies/replies.jsonl", 0);
    expect(first.lines).toHaveLength(2);
    // The offset stops before the torn line, so the next read sees it complete.
    appendFileSync(join(root, "replies", "replies.jsonl"), ',"late":true}\n');
    const next = store.readLinesFrom<{ reply_id: string; late?: boolean }>(
      "replies/replies.jsonl",
      first.offset,
    );
    expect(next.lines).toEqual([{ reply_id: "r3", late: true }]);
    expect(store.readLinesFrom("replies/replies.jsonl", next.offset).lines).toEqual([]);
  });

  it("lists, stats and removes inside the root", () => {
    store.ensureDir("tmp");
    store.writeText("tmp/a.bin", "a");
    store.writeText("tmp/b.bin", "bb");
    expect(store.list("tmp", ".bin").sort()).toEqual(["a", "b"]);
    expect(store.list("nowhere")).toEqual([]);
    expect(store.stat("tmp/b.bin")?.size).toBe(2);
    expect(store.stat("tmp/c.bin")).toBeNull();
    store.remove("tmp");
    expect(store.exists("tmp")).toBe(false);
  });
});
