/**
 * The Data worker thread: every read, write, index and job of the Data section runs here,
 * so none of it can stall or stop Mail merge's send loop on the main thread. The host
 * starts it with `workerData` (the folder, whether test routes are on), sends it requests
 * as messages, and starts it again if it dies.
 */

import { randomUUID } from "node:crypto";
import { isMainThread, parentPort, workerData } from "node:worker_threads";

import { Refused } from "../mail-merge/engine";
import { registerBuilds } from "./builds";
import { DataCore, MODULES } from "./core";
import { clean, wholeNumber } from "./guard";
import { registerOverview } from "./overview";
import { ENGINE_CALLS, type EngineCall, type ToWorker, type WorkerData } from "./protocol";

if (isMainThread || !parentPort) throw new Error("worker.ts runs only as a worker thread");

const port = parentPort;
const data = workerData as WorkerData;
const core = new DataCore({
  dir: data.dir,
  testRoutes: data.testRoutes,
  post: (message) => port.postMessage(message),
});

port.on("message", (message: ToWorker) => {
  if (message.type === "stop") {
    core.close();
    setImmediate(() => process.exit(0));
    return;
  }
  core.handle(message);
});

/** Routes only the stand-in and the tests see: ways to break the worker on purpose. */
function registerTestRoutes(): void {
  core.route("POST", "/data/_test/crash", () => {
    // No answer: the host sees the exit and tells the request so.
    process.exit(2);
  });
  core.route("POST", "/data/_test/hang", (ctx) => {
    const ms = Math.min(120_000, Math.max(0, wholeNumber(ctx.body.ms, 2_000)));
    const end = Date.now() + ms;
    while (Date.now() < end) {
      // a busy loop: nothing else in this thread runs
    }
    return { hung_ms: ms };
  });
  core.route("POST", "/data/_test/throw", () => {
    throw new Error("thrown on purpose");
  });
  core.route("POST", "/data/_test/refuse", () => {
    throw new Refused(418, "teapot", "Refused on purpose.");
  });
  core.route("GET", "/data/_test/echo", (ctx) => ({
    path: ctx.path,
    params: ctx.params,
    query: Object.fromEntries(ctx.query.entries()),
    state: core.state,
  }));
  core.route("POST", "/data/_test/echo", (ctx) => ({
    path: ctx.path,
    body: ctx.body,
    by: ctx.staff(),
  }));
  core.route("POST", "/data/_test/attempt", (ctx) => {
    ctx.staff();
    return { stamp: randomUUID() };
  });
  core.route("POST", "/data/_test/engine", async (ctx) => {
    const call = clean(ctx.body.call, 40) as EngineCall;
    const args =
      ctx.body.args && typeof ctx.body.args === "object" && !Array.isArray(ctx.body.args)
        ? (ctx.body.args as Record<string, unknown>)
        : {};
    // The worker side does not check the name on purpose: the host's whitelist is what is tested.
    return { allowed: ENGINE_CALLS.includes(call), answer: await core.engine(call, args) };
  });
  core.route("POST", "/data/_test/need", (ctx) => ({
    found: core.need(clean(ctx.body.name, 40)) !== null,
  }));
  core.route("GET", "/data/_test/day", () => ({ day: core.day(), now: core.now() }));
  // A part coming in, when no files module is there to take it: kept under tmp/.
  if (!core.answers("POST", "/data/uploads/x/parts/0"))
    core.stream("POST", "/data/uploads/:id/parts/:n", (ctx) => {
      const target = core.store.path("tmp", `_test-${ctx.params[0]}-${ctx.params[1]}`);
      return {
        receive: { target, max_bytes: 3_145_728 },
        written: (bytes) => ({ received: Number(ctx.params[1]), bytes }),
      };
    });
}

core.setStarting("Opening Data");
core.open();
await core.loadModules(
  data.modules ? MODULES.filter((name) => data.modules!.includes(name)) : MODULES,
  (name) => import(`./${name}/index`),
);
registerOverview(core);
registerBuilds(core);
if (data.testRoutes) registerTestRoutes();
core.ready();
