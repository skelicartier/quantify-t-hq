// @vitest-environment node
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CRASH_LIMIT, restartDelayMs } from "../../scripts/data/host";
import { WALKER, codeOf, startStack, until, type Stack } from "./helpers";

/**
 * The host with the real worker thread under tsx: routing, deadlines, crash isolation, the
 * engine whitelist, streams, and the rule that no exception may leave a host function.
 */
describe("the Data host and its worker", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack({ deadlineMs: 400, modules: [] });
  }, 60_000);
  afterAll(async () => {
    await stack.stop();
  });

  it("routes /data requests to the worker and keeps the sender's own routes", async () => {
    const echo = await stack.ask("GET", "/data/_test/echo?x=1&y=two");
    expect(echo.status).toBe(200);
    expect(echo.json).toMatchObject({
      ok: true,
      path: "/data/_test/echo",
      query: { x: "1", y: "two" },
      state: "ready",
    });
    const posted = await stack.ask("POST", "/data/_test/echo", { by: WALKER, hello: 1 });
    expect(posted.json).toMatchObject({ ok: true, by: WALKER, body: { hello: 1 } });
    const status = await stack.ask("GET", "/data/status");
    expect(status.json).toMatchObject({
      ok: true,
      data: { state: "ready", crashes: 0, modules: [] },
      sender: { sending: null, sent_today: 0 },
    });
    expect((await stack.ask("GET", "/status")).json).toMatchObject({ ok: true, sent_today: 0 });
    const unknown = await stack.ask("GET", "/data/files");
    expect(unknown.status).toBe(404);
    expect(codeOf(unknown)).toBe("module_missing");
    const outside = await stack.ask("GET", "/nothing");
    expect(codeOf(outside)).toBe("no_such_route");
    const refused = await stack.ask("POST", "/data/_test/refuse", { by: WALKER });
    expect(refused.status).toBe(418);
    expect(refused.json).toMatchObject({
      ok: false,
      error: { code: "teapot", message: "Refused on purpose." },
    });
    const thrown = await stack.ask("POST", "/data/_test/throw", { by: WALKER });
    expect(thrown.status).toBe(500);
    expect(codeOf(thrown)).toBe("failed");
    const noStaff = await stack.ask("POST", "/data/_test/echo", {});
    expect(noStaff.status).toBe(400);
    expect(codeOf(noStaff)).toBe("invalid");
  });

  it("replays a creating POST with the same attempt", async () => {
    const attempt = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const first = await stack.ask("POST", "/data/_test/attempt", { by: WALKER, attempt });
    const again = await stack.ask("POST", "/data/_test/attempt", { by: WALKER, attempt });
    const other = await stack.ask("POST", "/data/_test/attempt", { by: WALKER });
    expect(first.json?.stamp).toBeTypeOf("string");
    expect(again.json?.stamp).toBe(first.json?.stamp);
    expect(other.json?.stamp).not.toBe(first.json?.stamp);
    expect(existsSync(join(stack.dir, "data", "attempts.jsonl"))).toBe(true);
  });

  it("gives data_slow at the deadline while Mail merge keeps answering in under 100 ms", async () => {
    const started = Date.now();
    const hang = stack.ask("POST", "/data/_test/hang", { by: WALKER, ms: 1_500 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const before = Date.now();
    const sender = await stack.ask("GET", "/status");
    expect(sender.status).toBe(200);
    expect(Date.now() - before).toBeLessThan(100);
    const slow = await hang;
    expect(slow.status).toBe(503);
    expect(codeOf(slow)).toBe("data_slow");
    expect(Date.now() - started).toBeLessThan(1_400);
    // The worker finishes its loop and is itself again.
    await until(
      async () => (await stack.ask("GET", "/data/_test/echo")).status === 200,
      "the worker to answer again",
      5_000,
    );
  }, 15_000);

  it("survives a crash: 503 data_restarting for the request, then ready again", async () => {
    const crash = await stack.ask("POST", "/data/_test/crash", { by: WALKER });
    expect(crash.status).toBe(503);
    expect(codeOf(crash)).toBe("data_restarting");
    expect(["restarting", "ready"]).toContain(stack.data.state());
    await stack.data.ready(20_000);
    expect(stack.data.status().crashes).toBe(1);
    expect((await stack.ask("GET", "/data/_test/echo")).status).toBe(200);
  }, 30_000);

  it("stops after five crashes in ten minutes, and restarts on request", async () => {
    for (let count = stack.data.status().crashes; count < CRASH_LIMIT; count += 1) {
      await stack.ask("POST", "/data/_test/crash", { by: WALKER });
      if (count + 1 < CRASH_LIMIT) await stack.data.ready(20_000);
    }
    await until(() => stack.data.state() === "stopped", "the stopped state", 5_000);
    const stopped = await stack.ask("GET", "/data/overview");
    expect(stopped.status).toBe(503);
    expect(codeOf(stopped)).toBe("data_stopped");
    expect((await stack.ask("GET", "/data/status")).json).toMatchObject({
      data: { state: "stopped", crashes: CRASH_LIMIT },
    });
    // Mail merge is untouched throughout.
    expect((await stack.ask("GET", "/lists")).json).toMatchObject({ ok: true, lists: [] });
    const restarted = await stack.ask("POST", "/data/restart", { by: WALKER });
    expect(restarted.json).toMatchObject({ ok: true, state: "starting" });
    await stack.data.ready(20_000);
    expect((await stack.ask("GET", "/data/overview")).status).toBe(200);
    const notStopped = await stack.ask("POST", "/data/restart", { by: WALKER });
    expect(notStopped.status).toBe(409);
    expect(codeOf(notStopped)).toBe("not_stopped");
  }, 60_000);

  it("lets the worker make only the four engine calls", async () => {
    const status = await stack.ask("POST", "/data/_test/engine", {
      by: WALKER,
      call: "status",
      args: {},
    });
    expect(status.json).toMatchObject({ ok: true, allowed: true });
    expect((status.json?.answer as Record<string, unknown>).counts).toMatchObject({ lists: 0 });
    for (const call of ["deleteList", "startMailing", "setKey", "clearKey", "constructor", ""]) {
      const refused = await stack.ask("POST", "/data/_test/engine", { by: WALKER, call, args: {} });
      expect(refused.status, call).toBe(400);
      expect(refused.json?.error).toEqual({
        code: "invalid",
        message: "That call is not allowed.",
      });
    }
    const stops = await stack.ask("POST", "/data/_test/engine", {
      by: WALKER,
      call: "addStops",
      args: { emails: "asha@peak.example", reason: "asked" },
    });
    expect(stops.json).toMatchObject({ allowed: true, answer: { added: 1, already: 0 } });
    expect(stack.engine.status().counts.stopped).toBe(1);
    const removed = await stack.ask("POST", "/data/_test/engine", {
      by: WALKER,
      call: "removeStop",
      args: { email: "asha@peak.example" },
    });
    expect(removed.json).toMatchObject({ answer: { removed: "asha@peak.example" } });
    const missing = await stack.ask("POST", "/data/_test/engine", {
      by: WALKER,
      call: "removeStop",
      args: { email: "nobody@peak.example" },
    });
    expect(missing.status).toBe(404);
    expect(codeOf(missing)).toBe("not_found");
    const rows = Array.from({ length: 5_002 }, (_, index) => `P${index},p${index}@fund.example`);
    const tooMany = await stack.ask("POST", "/data/_test/engine", {
      by: WALKER,
      call: "importList",
      args: { name: "Too many", file_name: "x.csv", text: `Name,Email\n${rows.join("\n")}\n` },
    });
    expect(tooMany.status).toBe(400);
    expect(codeOf(tooMany)).toBe("too_many");
    const imported = await stack.ask("POST", "/data/_test/engine", {
      by: WALKER,
      call: "importList",
      args: { name: "Small", file_name: "s.csv", text: "Name,Email\nAsha,asha@peak.example\n" },
    });
    expect(imported.json).toMatchObject({ answer: { list: { name: "Small", people: 1 } } });
    expect(stack.engine.status().counts.lists).toBe(1);
  });

  it("streams a part in and a file out, within the limits", async () => {
    const part = Buffer.alloc(1_000, 7);
    const received = await stack.raw(stack.socket, "POST", "/data/uploads/up-1/parts/3", {
      bytes: part,
    });
    expect(received.json).toEqual({ ok: true, received: 3, bytes: 1_000 });
    const target = join(stack.dir, "data", "tmp", "_test-up-1-3");
    expect(statSync(target).size).toBe(1_000);
    expect(existsSync(`${target}.writing`)).toBe(false);
    const tooLarge = await stack.raw(stack.socket, "POST", "/data/uploads/up-1/parts/4", {
      bytes: Buffer.alloc(3_145_729),
    });
    expect(tooLarge.status).toBe(413);
    expect(codeOf(tooLarge)).toBe("part_too_large");
    const empty = await stack.raw(stack.socket, "POST", "/data/uploads/up-1/parts/5");
    expect(empty.status).toBe(400);
    expect(codeOf(empty)).toBe("part_refused");

    const build = await stack.ask("POST", "/data/builds", {
      by: WALKER,
      kind: "test_zip",
      files: 2,
    });
    const buildId = (build.json?.build as { build_id: string }).build_id;
    await until(
      async () =>
        ((await stack.ask("GET", `/data/builds/${buildId}`)).json?.build as { state: string })
          .state === "ready",
      "the build to be ready",
    );
    const bytes = await stack.ask("GET", `/data/builds/${buildId}/bytes`);
    expect(bytes.status).toBe(200);
    expect(bytes.headers["content-type"]).toBe("application/zip");
    expect(Number(bytes.headers["content-length"])).toBe(bytes.bytes.length);
    expect(bytes.headers["x-data-name"]).toBe(encodeURIComponent("Walk files.zip"));
    expect(bytes.bytes.subarray(0, 4).toString("hex")).toBe("504b0304");
    const notThere = await stack.ask("GET", "/data/builds/nope/bytes");
    expect(notThere.status).toBe(404);
    expect(codeOf(notThere)).toBe("not_found");
    const noSuchKind = await stack.ask("POST", "/data/builds", { by: WALKER, kind: "nothing" });
    expect(noSuchKind.json).toMatchObject({
      ok: false,
      error: { code: "invalid", message: "No such download." },
    });
  }, 20_000);
});

describe("the host's back-off and its callbacks", () => {
  it("waits 1 s, then 5 s, then 30 s before starting the worker again", () => {
    expect(restartDelayMs(1)).toBe(1_000);
    expect(restartDelayMs(2)).toBe(5_000);
    expect(restartDelayMs(3)).toBe(30_000);
    expect(restartDelayMs(4)).toBe(30_000);
    expect(CRASH_LIMIT).toBe(5);
  });

  it("survives an injected throw in every callback and still answers", async () => {
    const thrown = new Set<string>();
    const seen = new Set<string>();
    let arm = false;
    const stack = await startStack({
      deadlineMs: 300,
      modules: [],
      inject: (point) => {
        seen.add(point);
        if (!arm || thrown.has(point)) return;
        thrown.add(point);
        throw new Error(`fault at ${point}`);
      },
    });
    try {
      arm = true;
      // Each of these trips a different callback once; the server must answer JSON every time.
      const answers = [
        await stack.ask("GET", "/data/_test/echo"), // request (throws before the worker is asked)
        await stack.ask("GET", "/data/_test/echo"), // message (the answer is dropped → data_slow at the deadline)
        await stack.ask("GET", "/data/_test/echo"), // deadline? no: this one answers
        await stack.ask("GET", "/data/status"), // status
        await stack.ask("POST", "/data/restart", { by: WALKER }), // restart
        await stack.ask("GET", "/data/builds/x/bytes"), // stream
        await stack.ask("POST", "/data/_test/engine", { by: WALKER, call: "status", args: {} }), // engine
        await stack.raw(stack.socket, "POST", "/data/uploads/u/parts/0", {
          bytes: Buffer.alloc(10),
        }), // receive
      ];
      for (const answer of answers) {
        expect(answer.json).not.toBeNull();
        expect(answer.json?.ok === true || typeof codeOf(answer) === "string").toBe(true);
      }
      // A crash with a fault in the exit callback: the host neither throws nor dies.
      await stack.ask("POST", "/data/_test/crash", { by: WALKER });
      await new Promise((resolve) => setTimeout(resolve, 400));
      const afterExitFault = await stack.ask("GET", "/data/status");
      expect(afterExitFault.status).toBe(200);
      expect(seen.has("exit")).toBe(true);
      // Faults are spent; a plain crash now goes through the whole cycle again.
      arm = false;
      expect((await stack.ask("GET", "/status")).status).toBe(200);
      expect(thrown.size).toBeGreaterThanOrEqual(6);
    } finally {
      await stack.stop();
    }
  }, 60_000);
});

describe("a worker that stops answering", () => {
  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it("is stopped and started again like a crash, while Mail merge answers fast throughout", async () => {
    // Deadlines and the ping's wait are short here; the service's own are 30 s and 10 s.
    const stack = await startStack({ deadlineMs: 300, probeMs: 300, modules: [] });
    try {
      let polling = true;
      let slowest = 0;
      let asked = 0;
      const sender = (async () => {
        while (polling) {
          const before = Date.now();
          const answer = await stack.ask("GET", "/status");
          expect(answer.status).toBe(200);
          slowest = Math.max(slowest, Date.now() - before);
          asked += 1;
          await pause(25);
        }
      })();
      // A loop that never yields: without help it would hold the worker for a minute.
      const hang = await stack.ask("POST", "/data/_test/hang", { by: WALKER, ms: 60_000 });
      expect(hang.status).toBe(503);
      expect(codeOf(hang)).toBe("data_slow");
      await until(() => stack.data.state() !== "ready", "the stuck worker to be stopped", 5_000);
      await stack.data.ready(20_000);
      expect(stack.data.status().crashes).toBe(1);
      expect((await stack.ask("GET", "/data/_test/echo")).status).toBe(200);
      polling = false;
      await sender;
      expect(asked).toBeGreaterThan(5);
      expect(slowest).toBeLessThan(200);
    } finally {
      await stack.stop();
    }
  }, 30_000);

  it("is left alone when it answers the ping, and restarted on request when it does not", async () => {
    const stack = await startStack({ deadlineMs: 300, probeMs: 60_000, modules: [] });
    try {
      // Slow but alive: the deadline passes, the worker answers the ping once its loop ends.
      const slow = await stack.ask("POST", "/data/_test/hang", { by: WALKER, ms: 500 });
      expect(codeOf(slow)).toBe("data_slow");
      await until(
        async () => (await stack.ask("GET", "/data/_test/echo")).status === 200,
        "the worker to answer again",
        5_000,
      );
      expect(stack.data.status().crashes).toBe(0);
      expect(codeOf(await stack.ask("POST", "/data/restart", { by: WALKER }))).toBe("not_stopped");
      // Stuck: it still says ready (the ping waits a minute here), and Restart Data acts.
      const stuck = await stack.ask("POST", "/data/_test/hang", { by: WALKER, ms: 60_000 });
      expect(codeOf(stuck)).toBe("data_slow");
      expect(stack.data.state()).toBe("ready");
      const restarted = await stack.ask("POST", "/data/restart", { by: WALKER });
      expect(restarted.json).toMatchObject({ ok: true, state: "restarting" });
      await stack.data.ready(20_000);
      expect(stack.data.status().crashes).toBe(1);
      expect((await stack.ask("GET", "/data/_test/echo")).status).toBe(200);
    } finally {
      await stack.stop();
    }
  }, 30_000);
});
