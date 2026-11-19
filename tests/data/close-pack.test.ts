// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { WALKER, startStack, until, type Stack } from "./helpers";

/**
 * The CA's pack (ws-notes/duties/spec.md §9.9, §9.12): the Owner's zip with its statement,
 * stipend sheet, lines file and an index whose every SHA-256 matches; an Admin's zip with no
 * statement, no stipend sheet and no lines file, whose README says so. Made through the
 * builds, never kept in Files. Everything in it is invented.
 */

let stack: Stack;
let out = "";
const by = WALKER;

const entries = (zip: string): string[] =>
  execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" }).split("\n").filter(Boolean);
const entry = (zip: string, name: string): Buffer => execFileSync("unzip", ["-p", zip, name]);

async function pack(owner: boolean): Promise<string> {
  const started = await stack.ask("POST", "/data/builds", {
    kind: "ca_pack",
    period: "2026-10",
    owner,
    by,
  });
  expect(started.status).toBe(200);
  const buildId = String((started.json!.build as { build_id: string }).build_id);
  let build: Record<string, unknown> = {};
  await until(async () => {
    build = (await stack.ask("GET", `/data/builds/${buildId}`)).json!.build as Record<
      string,
      unknown
    >;
    return build.state !== "building";
  }, "the pack");
  expect(build).toMatchObject({ state: "ready", name: "CA pack 2026-10.zip" });
  const file = await stack.raw(stack.socket, "GET", `/data/builds/${buildId}/bytes`);
  const path = join(out, `pack-${String(owner)}.zip`);
  writeFileSync(path, file.bytes);
  execFileSync("unzip", ["-tq", path]);
  return path;
}

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), "hqd-pack-"));
  stack = await startStack({ modules: ["files", "numbers", "statements", "close"] });
  await stack.ask("POST", "/data/_test/close/seed", { by, statements: true });
  await stack.ask("POST", "/data/close/2026-10/items/gst_returns", { by, state: "not_registered" });
  await stack.ask("POST", "/data/close/2026-10/items/tds_challans", {
    by,
    state: "none_this_month",
  });
}, 60_000);
afterAll(async () => {
  await stack.stop();
  rmSync(out, { recursive: true, force: true });
});

describe("the CA's pack", () => {
  it("holds the statement, the stipend sheet and the lines in the Owner's zip, each in the index", async () => {
    const zip = await pack(true);
    const names = entries(zip);
    expect(names).toEqual(
      expect.arrayContaining([
        "Bank statements/Walk Bank current 2026-08-01 to 2026-10-31.csv",
        "Stipend sheet/stipends 2026-10.csv",
        "GST returns/not registered.txt",
        "TDS challans/none this month.txt",
        "bills 2026-10.csv",
        "ledger map.csv",
        "lines 2026-10.csv",
        "README.txt",
        "index.csv",
      ]),
    );
    expect(entry(zip, "Stipend sheet/stipends 2026-10.csv").toString()).toContain(
      "2026-10-31,Walk Intern One,intern,2026-10,15000,INR,WALK-UTR-0015,,CA to confirm",
    );
    expect(entry(zip, "lines 2026-10.csv").toString()).toContain(
      "NEFT WALK LEGAL LLP WALK-INV-0007",
    );
    expect(entry(zip, "bills 2026-10.csv").toString()).toContain(
      "2026-10-02,Walk Legal LLP,WALK-INV-0007,INR,11800,11800,11800",
    );
    const index = entry(zip, "index.csv").toString().replace(/^﻿/, "").trim().split("\r\n");
    expect(index[0]).toBe("Folder,File,What it is,Day,SHA-256");
    expect(index.length - 1).toBe(names.length - 1);
    for (const row of index.slice(1)) {
      const cells = row
        .match(/("([^"]|"")*"|[^,]*)(,|$)/g)!
        .map((cell) => cell.replace(/,$/, "").replace(/^"|"$/g, ""));
      const [folder = "", file = "", , , sha = ""] = cells;
      const name = folder ? `${folder}/${file}` : file;
      expect(createHash("sha256").update(entry(zip, name)).digest("hex"), name).toBe(sha);
    }
    expect(entry(zip, "README.txt").toString()).toContain(
      "Not the books of account: vouchers and a summary for the person who keeps them.",
    );
  });

  it("leaves the statement, the stipend sheet and the lines out of an Admin's zip, and says so", async () => {
    const zip = await pack(false);
    const names = entries(zip);
    expect(names.some((name) => name.startsWith("Bank statements/"))).toBe(false);
    expect(names.some((name) => name.startsWith("Stipend sheet/"))).toBe(false);
    expect(names.some((name) => name.startsWith("lines "))).toBe(false);
    for (const name of names) {
      const bytes = entry(zip, name);
      expect(
        bytes.includes("Walk Intern One") ||
          bytes.includes("WALK-UTR-0015") ||
          bytes.includes("NEFT"),
        name,
      ).toBe(false);
    }
    expect(entry(zip, "README.txt").toString()).toContain(
      "Bank statements, the stipend sheet and the lines file are left out: only the Owner's pack holds them.",
    );
    // Never kept in Files.
    const files = (await stack.ask("GET", "/data/files?view=recent")).json;
    expect(JSON.stringify(files)).not.toContain("CA pack");
  });
});
