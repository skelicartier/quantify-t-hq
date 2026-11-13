// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MergeEngine } from "../../scripts/mail-merge/engine";
import { createMergeServer } from "../../scripts/mail-merge/server";
import { codeOf, rawCall } from "./helpers";

/**
 * `createMergeServer(engine, false)` with no extra routes is the sender as it was: every
 * one of its 32 routes still answers, the refusals read the same, and nothing under /data
 * exists. (`tests/mail-merge/*` hold the behaviour of each route; this holds the table.)
 */
let dir: string;
let server: Server;
let socket: string;
let engine: MergeEngine;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "hqmm-"));
  engine = new MergeEngine({ dir });
  server = createMergeServer(engine, false);
  socket = join(dir, "s");
  await new Promise<void>((resolve) => server.listen(socket, resolve));
});
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
});

const ROUTES: [method: "GET" | "POST", path: string][] = [
  ["GET", "/status"],
  ["POST", "/provider-key"],
  ["POST", "/provider-key/clear"],
  ["POST", "/provider/check"],
  ["POST", "/settings"],
  ["GET", "/lists"],
  ["POST", "/lists/import"],
  ["GET", "/lists/x"],
  ["POST", "/lists/x/rename"],
  ["POST", "/lists/x/delete"],
  ["POST", "/lists/x/rows"],
  ["POST", "/lists/x/rows/r1/update"],
  ["POST", "/lists/x/rows/r1/remove"],
  ["GET", "/stops"],
  ["POST", "/stops/add"],
  ["POST", "/stops/remove"],
  ["POST", "/stops/sync"],
  ["GET", "/mailings"],
  ["POST", "/mailings"],
  ["GET", "/mailings/x"],
  ["GET", "/mailings/x/people"],
  ["POST", "/mailings/x/pick"],
  ["POST", "/mailings/x/people"],
  ["GET", "/mailings/x/outcomes"],
  ["POST", "/mailings/x/update"],
  ["POST", "/mailings/x/duplicate"],
  ["POST", "/mailings/x/delete"],
  ["POST", "/mailings/x/test"],
  ["POST", "/mailings/x/start"],
  ["POST", "/mailings/x/pause"],
  ["POST", "/mailings/x/resume"],
  ["POST", "/mailings/x/cancel"],
];

describe("the sender with no extra routes", () => {
  it("answers all 32 routes as before", async () => {
    expect(ROUTES).toHaveLength(32);
    for (const [method, path] of ROUTES) {
      const answer = await rawCall(
        socket,
        method,
        path,
        method === "POST" ? { json: {} } : undefined,
      );
      expect(answer.json, `${method} ${path}`).not.toBeNull();
      expect(codeOf(answer), `${method} ${path}`).not.toBe("no_such_route");
      expect(answer.headers["content-type"]).toBe("application/json");
    }
    expect((await rawCall(socket, "GET", "/status")).json).toMatchObject({
      ok: true,
      sent_today: 0,
      counts: { lists: 0, people: 0, mailings: 0, stopped: 0 },
    });
    const imported = await rawCall(socket, "POST", "/lists/import", {
      json: { name: "Seed", file_name: "seed.csv", text: "Name,Email\nAsha,asha@peak.example\n" },
    });
    expect(imported.json).toMatchObject({ ok: true, list: { name: "Seed", people: 1 } });
    expect(((await rawCall(socket, "GET", "/lists")).json?.lists as unknown[]).length).toBe(1);
  });

  it("refuses as before: unknown paths, browsers, bad bodies, and anything under /data", async () => {
    const nothing = await rawCall(socket, "GET", "/nothing");
    expect(nothing.status).toBe(404);
    expect(nothing.json).toEqual({
      ok: false,
      error: { code: "no_such_route", message: "Nothing answers there." },
    });
    expect((await rawCall(socket, "POST", "/lists/x/rename")).json).toEqual({
      ok: false,
      error: { code: "not_found", message: "That list is no longer here." },
    });
    const browser = await rawCall(socket, "GET", "/status", undefined, {
      origin: "http://evil.example",
    });
    expect(browser.status).toBe(403);
    expect(codeOf(browser)).toBe("not_from_here");
    const malformed = await rawCall(socket, "POST", "/settings", { text: "not json" });
    expect(malformed.status).toBe(400);
    expect(codeOf(malformed)).toBe("malformed");
    for (const path of ["/data/status", "/data/overview", "/data"]) {
      const data = await rawCall(socket, "GET", path);
      expect(data.status, path).toBe(404);
      expect(codeOf(data), path).toBe("no_such_route");
    }
    expect(codeOf(await rawCall(socket, "POST", "/data/restart", { json: {} }))).toBe(
      "no_such_route",
    );
  });
});
