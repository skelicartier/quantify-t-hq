/**
 * The Data host: the small, defensive part of Data that lives on the main thread beside
 * Mail merge's send loop. It routes `/data/...` requests to the worker thread, streams
 * bytes in and out, runs the four engine calls the worker may ask for, and keeps the
 * worker alive: started again after a crash (1 s, 5 s, then 30 s), left off after five
 * crashes in ten minutes, and started once more from `POST /data/restart`. A worker that
 * lets a request's deadline pass is asked whether it is there (`ping`); if it says nothing
 * within ten seconds it is stuck (a loop that never yields), so it is stopped and that
 * counts as a crash, back-off and all. `POST /data/restart` stops it at once in that time.
 *
 * Its rules: no parsing, no synchronous file I/O, every callback in `try`, and no
 * exception may leave a host function. Nothing here may stop or slow the send loop.
 */

import { createReadStream, createWriteStream } from "node:fs";
import { appendFile, readFile, rename, rm, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join, resolve as resolvePath, sep } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Worker } from "node:worker_threads";

import { MergeEngine, Refused } from "../mail-merge/engine";
import { BrevoProvider, type MailProvider } from "../mail-merge/provider";
import type { JsonRoute, Route, StreamRoute } from "../mail-merge/server";
import {
  ENGINE_CALLS,
  HOST_MESSAGES,
  PART_BYTES,
  SHARE_MAX_BYTES,
  type DataState,
  type EngineCall,
  type FromWorker,
  type ModuleState,
  type Progress,
  type RefusalBody,
  type SendFile,
  type ShareMail,
  type ShareResult,
  type ToWorker,
  type WorkerData,
} from "./protocol";

export const CRASH_LIMIT = 5;
export const CRASH_WINDOW_MS = 10 * 60 * 1_000;
const DEFAULT_DEADLINE_MS = 30_000;
const DEFAULT_BUILD_DEADLINE_MS = 55_000;
/** After a missed deadline, how long the worker has to answer a ping before it is called stuck. */
const DEFAULT_PROBE_MS = 10_000;
/** The send by email route: an answer lost there may mean the mail went. */
const SHARE_PATH = /\/share\/email$/;
/** A send by email may wait on the provider; the worker gives up at 60 s, the portal at 70 s. */
const SHARE_REQUEST_DEADLINE_MS = 65_000;
const NO_KEY = "No provider key is set in Mail merge's Setup, so nothing can be sent.";
const STOP_WAIT_MS = 3_000;
const IMPORT_ROW_CAP = 5_000;

/** How long to wait before the worker is started again: 1 s, then 5 s, then 30 s. */
export function restartDelayMs(crashes: number): number {
  if (crashes <= 1) return 1_000;
  if (crashes === 2) return 5_000;
  return 30_000;
}

export type StartDataOptions = {
  /** Mail merge's folder; Data keeps its own things under `<dir>/data`. */
  dir: string;
  engine: MergeEngine;
  workerUrl?: URL;
  execArgv?: string[];
  /** Routes only a stand-in or a test should have (`/data/_test/...`). */
  testRoutes?: boolean;
  /** Test knob: load only these modules (default: every one in `MODULES` that exists). */
  modules?: readonly string[];
  /** The provider "Send by email" uses, given the key; the stand-in hands in its own. */
  shareProvider?: (key: string) => MailProvider;
  /** Test knobs: never set by the service itself. */
  deadlineMs?: number;
  buildDeadlineMs?: number;
  probeMs?: number;
  restartDelaysMs?: readonly number[];
  /** A fault injector: called at the start of every callback, named; a test makes it throw. */
  inject?: (point: string) => void;
  log?: boolean;
};

export type DataStatus = {
  state: DataState;
  detail: string;
  progress: Progress;
  started_at: string | null;
  crashes: number;
  modules: ModuleState[];
};

export type DataHandle = {
  /** The routes for `createMergeServer(engine, log, routes)`. */
  routes: Route[];
  state(): DataState;
  status(): DataStatus;
  /** Resolves once the worker says it is ready; rejects when it stops or time runs out. */
  ready(timeoutMs?: number): Promise<void>;
  /** Start the worker again after it was left off; refused while it runs. */
  restart(): { state: DataState };
  stop(): Promise<void>;
  shareProvider: (key: string) => MailProvider;
  /** The key for "Send by email", read on the main thread; the worker never reads it. */
  providerKey(): Promise<string>;
};

type Reply =
  | { kind: "answer"; status: number; body: Record<string, unknown> }
  | { kind: "file"; file: SendFile };

type Pending = {
  resolve: (reply: Reply) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
  /** The request's path: a send by email that loses its answer may have gone. */
  path: string;
  /** For a part coming in: where the host puts the bytes once the worker says. */
  onReceive?: ((target: string, maxBytes: number) => Promise<number>) | undefined;
  /** Which part it is, echoed to the worker once written. */
  part?: { upload_id: string; index: number } | undefined;
  receiving: boolean;
};

const ID = "([A-Za-z0-9-]{1,64})";

function refusalOf(error: unknown): RefusalBody {
  if (error instanceof Refused)
    return { status: error.status, code: error.code, message: error.message };
  return { status: 500, code: "failed", message: "Data could not do that just now." };
}

function sendJson(response: ServerResponse, status: number, body: Record<string, unknown>): void {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

function refuse(response: ServerResponse, error: unknown): void {
  const refusal = refusalOf(error);
  sendJson(response, refusal.status, {
    ok: false,
    error: { code: refusal.code, message: refusal.message },
  });
}

class DataHost {
  readonly #options: StartDataOptions;
  readonly #engine: MergeEngine;
  readonly #workerUrl: URL;
  readonly #execArgv: string[];
  readonly #pending = new Map<number, Pending>();
  readonly #readyWaiters: { resolve: () => void; reject: (error: Error) => void }[] = [];
  #worker: Worker | null = null;
  #state: DataState = "starting";
  #detail = "Starting";
  #progress: Progress = null;
  #modules: ModuleState[] = [];
  #startedAt: string | null = null;
  #crashes: number[] = [];
  #restartTimer: NodeJS.Timeout | null = null;
  #stopping = false;
  /** A deadline passed and the worker has said nothing since. */
  #missed = false;
  /** The wait for the worker's `pong` after a missed deadline. */
  #probe: NodeJS.Timeout | null = null;
  /** A worker being stopped because it does not answer: nothing it says counts any more. */
  #ending: Worker | null = null;
  #nextId = 1;

  readonly shareProvider: (key: string) => MailProvider;

  constructor(options: StartDataOptions) {
    this.#options = options;
    this.#engine = options.engine;
    this.#workerUrl = options.workerUrl ?? new URL("./worker.ts", import.meta.url);
    this.#execArgv = options.execArgv ?? ["--import", "tsx"];
    this.shareProvider = options.shareProvider ?? ((key: string) => new BrevoProvider(key));
  }

  /** The key for "Send by email", read here on the main thread; the worker never sees the file. */
  async providerKey(): Promise<string> {
    // Read only when the engine says a key is set and only when a send by email asks.
    try {
      if (!this.#engine.status().provider.key_set) return "";
      return (await readFile(`${this.#options.dir}/provider.key`, "utf8")).trim();
    } catch {
      return "";
    }
  }

  // ------------------------------------------------------------------ small helpers

  #log(line: string): void {
    if (this.#options.log !== false) console.log(`[data] ${line}`);
  }

  #inject(point: string): void {
    this.#options.inject?.(point);
  }

  /** What a request gets while the worker is not there to answer it. */
  #notReady(): Refused {
    if (this.#state === "stopped")
      return new Refused(503, "data_stopped", HOST_MESSAGES.data_stopped);
    if (this.#state === "restarting")
      return new Refused(503, "data_restarting", HOST_MESSAGES.data_restarting);
    const count = (value: number) => value.toLocaleString("en-GB");
    const message = this.#detail
      ? this.#progress
        ? `${this.#detail}: ${count(this.#progress.done)} of ${count(this.#progress.total)}.`
        : `${this.#detail}.`
      : HOST_MESSAGES.data_starting;
    return new Refused(503, "data_starting", message);
  }

  // ------------------------------------------------------------------ the worker

  start(): void {
    this.#spawn();
  }

  #spawn(): void {
    try {
      this.#inject("spawn");
      const workerData: WorkerData = {
        dir: this.#options.dir,
        testRoutes: this.#options.testRoutes === true,
        ...(this.#options.modules ? { modules: [...this.#options.modules] } : {}),
      };
      const worker = new Worker(this.#workerUrl, {
        execArgv: this.#execArgv,
        workerData,
        resourceLimits: { maxOldGenerationSizeMb: 1536, stackSizeMb: 8 },
      });
      this.#worker = worker;
      this.#state = this.#crashes.length > 0 ? "restarting" : "starting";
      this.#detail = this.#state === "restarting" ? "" : "Starting";
      this.#progress = null;
      worker.on("message", (message: FromWorker) => this.#onMessage(worker, message));
      worker.on("error", (error: Error) => this.#onError(error));
      worker.on("exit", (code: number) => this.#onExit(worker, code));
    } catch (error) {
      // Could not even start a thread: that is a crash like any other.
      this.#log(`worker could not start: ${error instanceof Error ? error.name : "error"}`);
      this.#worker = null;
      this.#afterExit();
    }
  }

  #onError(error: Error): void {
    try {
      this.#inject("error");
      this.#log(`worker error: ${error.name}`);
    } catch {
      // nothing may leave a host callback
    }
  }

  #onExit(worker: Worker, code: number): void {
    // The bookkeeping comes first and outside any try: whatever else fails, a dead worker
    // is never kept as the live one.
    if (worker !== this.#worker) return;
    this.#worker = null;
    this.#ending = null;
    this.#heard();
    try {
      this.#inject("exit");
      this.#log(this.#stopping ? "worker stopped" : `worker exited with code ${code}`);
    } catch {
      // nothing may leave a host callback
    }
    if (this.#stopping) return;
    try {
      this.#afterExit();
    } catch (error) {
      // The crash could not even be recorded: come back in a second and say so.
      this.#log(`after the exit: ${error instanceof Error ? error.name : "error"}`);
      this.#state = "restarting";
      this.#restartTimer = setTimeout(() => this.#spawnAgain(), 1_000);
    }
  }

  /** The restart timer's work: whatever a hook does, the worker is started again. */
  #spawnAgain(): void {
    this.#restartTimer = null;
    try {
      this.#inject("timer");
    } catch {
      // nothing may leave a host callback
    }
    if (!this.#stopping) this.#spawn();
  }

  /** Every request in flight hears so; the worker comes back, or is left off. */
  #afterExit(): void {
    const now = Date.now();
    this.#crashes = [...this.#crashes.filter((at) => now - at < CRASH_WINDOW_MS), now];
    const restarting = new Refused(503, "data_restarting", HOST_MESSAGES.data_restarting);
    for (const [id, pending] of this.#pending) {
      clearTimeout(pending.timer);
      this.#pending.delete(id);
      pending.reject(lostAnswer(pending, restarting));
    }
    this.#modules = [];
    this.#startedAt = null;
    if (this.#crashes.length >= CRASH_LIMIT) {
      this.#state = "stopped";
      this.#detail = "Stopped after five errors in ten minutes";
      this.#progress = null;
      this.#log(`stopped after ${CRASH_LIMIT} exits in ten minutes; Mail merge is unaffected`);
      const stopped = new Error("Data stopped after an error");
      for (const waiter of this.#readyWaiters.splice(0)) waiter.reject(stopped);
      return;
    }
    this.#state = "restarting";
    this.#detail = "";
    this.#progress = null;
    const delays = this.#options.restartDelaysMs;
    const delay = delays
      ? (delays[Math.min(this.#crashes.length - 1, delays.length - 1)] ?? 1_000)
      : restartDelayMs(this.#crashes.length);
    this.#log(`starting the worker again in ${delay / 1_000} s`);
    this.#restartTimer = setTimeout(() => this.#spawnAgain(), delay);
  }

  restart(): { state: DataState } {
    this.#inject("restart");
    const worker = this.#worker;
    if (this.#state === "ready" && worker && this.#missed) {
      // It says ready but let a deadline pass and has said nothing since: stop it and start again.
      this.#endStuck(worker);
      return { state: this.#state };
    }
    if (this.#state !== "stopped") throw new Refused(409, "not_stopped", HOST_MESSAGES.not_stopped);
    this.#crashes = [];
    this.#spawn();
    return { state: this.#state };
  }

  async stop(): Promise<void> {
    this.#stopping = true;
    if (this.#restartTimer) clearTimeout(this.#restartTimer);
    this.#restartTimer = null;
    this.#heard();
    const worker = this.#worker;
    const stopping = new Refused(503, "data_restarting", "Data is stopping.");
    for (const [id, pending] of this.#pending) {
      clearTimeout(pending.timer);
      this.#pending.delete(id);
      pending.reject(lostAnswer(pending, stopping));
    }
    for (const waiter of this.#readyWaiters.splice(0)) waiter.reject(new Error("Data is stopping"));
    if (!worker) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        void worker.terminate().then(
          () => resolve(),
          () => resolve(),
        );
      }, STOP_WAIT_MS);
      worker.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      try {
        worker.postMessage({ type: "stop" } satisfies ToWorker);
      } catch {
        clearTimeout(timer);
        void worker.terminate().then(
          () => resolve(),
          () => resolve(),
        );
      }
    });
    this.#worker = null;
  }

  // ------------------------------------------------------------------ is it there?

  /** Anything at all from the live worker: it is not stuck. */
  #heard(): void {
    this.#missed = false;
    if (this.#probe) clearTimeout(this.#probe);
    this.#probe = null;
  }

  /** A request's deadline passed: ask the worker whether it is there; silence means stuck. */
  #missedDeadline(worker: Worker): void {
    try {
      if (worker !== this.#worker || worker === this.#ending) return;
      this.#missed = true;
      if (this.#probe) return;
      const probe = setTimeout(() => {
        try {
          if (this.#probe === probe) this.#probe = null;
          if (this.#missed && worker === this.#worker && worker !== this.#ending)
            this.#endStuck(worker);
        } catch {
          // nothing may leave a host callback
        }
      }, this.#options.probeMs ?? DEFAULT_PROBE_MS);
      probe.unref();
      this.#probe = probe;
      this.#post(worker, { type: "ping" } satisfies ToWorker);
    } catch {
      // nothing may leave a host callback
    }
  }

  /** A worker that does not answer is stopped; its exit is a crash like any other. */
  #endStuck(worker: Worker): void {
    this.#ending = worker;
    this.#heard();
    this.#state = "restarting";
    this.#detail = "";
    this.#progress = null;
    this.#log("the worker stopped answering, so it is being started again");
    void worker.terminate().catch(() => undefined);
  }

  // ------------------------------------------------------------------ messages

  #onMessage(worker: Worker, message: FromWorker): void {
    if (worker === this.#worker && worker !== this.#ending) this.#heard();
    try {
      this.#inject("message");
      if (worker !== this.#worker || worker === this.#ending) return;
      switch (message.type) {
        case "state": {
          const wasReady = this.#state === "ready";
          if (message.state === "ready") {
            this.#state = "ready";
            this.#startedAt = new Date().toISOString();
            this.#detail = "";
            this.#progress = null;
            this.#modules = message.modules;
            if (!wasReady)
              this.#log(
                `ready: ${message.modules.map((module) => `${module.name} ${module.state}`).join(", ") || "no modules"}`,
              );
            for (const waiter of this.#readyWaiters.splice(0)) waiter.resolve();
          } else {
            // The worker says "starting"; after a crash the host keeps calling it restarting.
            if (this.#state !== "restarting") this.#state = "starting";
            this.#detail = message.detail;
            this.#progress = message.progress;
            this.#modules = message.modules;
          }
          return;
        }
        case "answer": {
          const pending = this.#take(message.id);
          pending?.resolve({ kind: "answer", status: message.status, body: message.body });
          return;
        }
        case "send-file": {
          const pending = this.#take(message.id);
          pending?.resolve({ kind: "file", file: message.file });
          return;
        }
        case "receive-part": {
          const pending = this.#pending.get(message.id);
          if (!pending) return;
          if (!pending.onReceive) {
            this.#post(worker, {
              type: "part-failed",
              id: message.id,
              error: { status: 400, code: "part_refused", message: HOST_MESSAGES.part_refused },
            });
            return;
          }
          pending.receiving = true;
          const receive = pending.onReceive;
          void receive(message.target, message.max_bytes).then(
            (bytes) => {
              try {
                this.#inject("receive");
                this.#post(worker, {
                  type: "part-written",
                  id: message.id,
                  upload_id: pending.part?.upload_id ?? "",
                  index: pending.part?.index ?? 0,
                  bytes,
                });
              } catch {
                // nothing may leave a host callback
              }
            },
            (error: unknown) => {
              try {
                const taken = this.#take(message.id);
                const refusal =
                  error instanceof Refused
                    ? refusalOf(error)
                    : { status: 400, code: "part_refused", message: HOST_MESSAGES.part_refused };
                this.#post(worker, { type: "part-failed", id: message.id, error: refusal });
                taken?.reject(new Refused(refusal.status, refusal.code, refusal.message));
              } catch {
                // nothing may leave a host callback
              }
            },
          );
          return;
        }
        case "engine":
          void this.#engineCall(worker, message);
          return;
        case "share":
          void this.#share(worker, message);
          return;
        case "pong":
          return;
      }
    } catch (error) {
      this.#log(`a message was dropped: ${error instanceof Error ? error.name : "error"}`);
    }
  }

  /** "Send by email": the worker has checked everything it can; the key and the send are here. */
  async #share(worker: Worker, message: Extract<FromWorker, { type: "share" }>): Promise<void> {
    let answer: ToWorker;
    try {
      this.#inject("share");
      const results = await this.#sendShare(message.mail);
      await this.#noteShare(message.mail, results);
      answer = { type: "share-answer", id: message.id, ok: true, value: { results } };
    } catch (error) {
      answer = { type: "share-answer", id: message.id, ok: false, error: refusalOf(error) };
      if (!(error instanceof Refused))
        this.#log(`a send by email failed: ${error instanceof Error ? error.name : "error"}`);
    }
    this.#post(worker, answer);
  }

  /**
   * What the provider said, kept beside the worker's own log before the worker hears it: if
   * the worker died while the mail went, it writes the send down from here when it is back.
   * A line starts with a newline too, so one cut short by a power cut never swallows the next.
   */
  async #noteShare(mail: ShareMail, results: ShareResult[]): Promise<void> {
    if (!mail.record || results.length === 0) return;
    try {
      const line = JSON.stringify({ record: mail.record, to: mail.to, results, at: new Date() });
      await appendFile(
        join(this.#options.dir, "data", "files", "shares-sent.jsonl"),
        `\n${line}\n`,
        {
          mode: 0o600,
        },
      );
    } catch (error) {
      this.#log(
        `a send by email could not be noted: ${error instanceof Error ? error.name : "error"}`,
      );
    }
  }

  async #sendShare(mail: ShareMail): Promise<ShareResult[]> {
    // Only Data's own stored bytes may be attached: a string check, not a parse.
    const blobs = `${resolvePath(this.#options.dir, "data", "files", "blobs")}${sep}`;
    const path = resolvePath(String(mail.path ?? ""));
    if (!path.startsWith(blobs)) throw new Refused(400, "invalid", "That file cannot be sent.");
    const to = Array.isArray(mail.to) ? mail.to.filter((email) => typeof email === "string") : [];
    if (to.length === 0 || to.length > 10)
      throw new Refused(400, "invalid", "Send it to between one and ten addresses.");
    const key = await this.providerKey();
    if (!key) throw new Refused(400, "no_key", NO_KEY);
    const size = (await stat(path)).size;
    if (size > SHARE_MAX_BYTES)
      throw new Refused(400, "too_large", "That file is too large to attach.");
    const content = (await readFile(path)).toString("base64");
    const provider = this.shareProvider(key);
    const results: ShareResult[] = [];
    for (const email of to) {
      const sent = await provider.send({
        to_email: email,
        to_name: "",
        from_email: mail.from_email,
        from_name: mail.from_name,
        reply_to: mail.reply_to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        headers: {},
        tags: ["hq-share"],
        attachments: [{ name: mail.name, content }],
      });
      results.push({ email, status: sent.status, error_code: sent.error_code });
    }
    return results;
  }

  #post(worker: Worker, message: ToWorker): void {
    try {
      worker.postMessage(message);
    } catch (error) {
      this.#log(`could not reach the worker: ${error instanceof Error ? error.name : "error"}`);
    }
  }

  #take(id: number): Pending | undefined {
    const pending = this.#pending.get(id);
    if (!pending) return undefined;
    clearTimeout(pending.timer);
    this.#pending.delete(id);
    return pending;
  }

  /** The four calls the worker may ask for, run here where the engine lives. */
  async #engineCall(
    worker: Worker,
    message: Extract<FromWorker, { type: "engine" }>,
  ): Promise<void> {
    let answer: ToWorker;
    try {
      this.#inject("engine");
      if (!ENGINE_CALLS.includes(message.call)) {
        this.#log(`refused an engine call: ${String(message.call).slice(0, 40)}`);
        answer = {
          type: "engine-answer",
          id: message.id,
          ok: false,
          error: { status: 400, code: "invalid", message: "That call is not allowed." },
        };
      } else {
        const value = await this.#runEngine(message.call, message.args ?? {});
        answer = { type: "engine-answer", id: message.id, ok: true, value };
      }
    } catch (error) {
      answer = { type: "engine-answer", id: message.id, ok: false, error: refusalOf(error) };
      if (!(error instanceof Refused))
        this.#log(`an engine call failed: ${error instanceof Error ? error.name : "error"}`);
    }
    this.#post(worker, answer);
  }

  async #runEngine(
    call: EngineCall,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    switch (call) {
      case "addStops":
        return this.#engine.addStops(args);
      case "removeStop":
        return this.#engine.removeStop(args);
      case "importList": {
        const text = typeof args.text === "string" ? args.text : "";
        let rows = 0;
        for (let index = text.indexOf("\n"); index >= 0; index = text.indexOf("\n", index + 1))
          rows += 1;
        if (rows > IMPORT_ROW_CAP)
          throw new Refused(
            400,
            "too_many",
            `A Mail merge list made here holds ${IMPORT_ROW_CAP.toLocaleString("en-GB")} people at most.`,
          );
        return this.#engine.importList(args);
      }
      case "status":
        return this.#engine.status();
    }
  }

  // ------------------------------------------------------------------ asking the worker

  ask(
    method: "GET" | "POST",
    path: string,
    query: string,
    body: Record<string, unknown>,
    options: { deadline?: number; onReceive?: Pending["onReceive"]; part?: Pending["part"] } = {},
  ): Promise<Reply> {
    this.#inject("request");
    const worker = this.#worker;
    if (this.#state !== "ready" || !worker) return Promise.reject(this.#notReady());
    const id = this.#nextId++;
    const deadline =
      options.deadline ??
      (path.startsWith("/data/builds")
        ? (this.#options.buildDeadlineMs ?? DEFAULT_BUILD_DEADLINE_MS)
        : SHARE_PATH.test(path)
          ? SHARE_REQUEST_DEADLINE_MS
          : (this.#options.deadlineMs ?? DEFAULT_DEADLINE_MS));
    return new Promise<Reply>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Taken out of the map and answered whatever else happens: a request is never
        // left hanging by a fault in the rest of this.
        const pending = this.#pending.get(id);
        if (!pending) return;
        this.#pending.delete(id);
        try {
          this.#inject("deadline");
          if (pending.receiving)
            this.#post(worker, {
              type: "part-failed",
              id,
              error: { status: 503, code: "data_slow", message: HOST_MESSAGES.data_slow },
            });
        } catch {
          // nothing may leave a host callback
        }
        pending.reject(lostAnswer(pending, new Refused(503, "data_slow", HOST_MESSAGES.data_slow)));
        this.#missedDeadline(worker);
      }, deadline);
      timer.unref();
      this.#pending.set(id, {
        resolve,
        reject,
        timer,
        path,
        onReceive: options.onReceive,
        part: options.part,
        receiving: false,
      });
      this.#post(worker, { type: "request", id, method, path, query, body });
    });
  }

  /** A JSON answer from the worker, as the server's route expects it. */
  async forward(
    method: "GET" | "POST",
    path: string,
    query: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const reply = await this.ask(method, path, query, body);
    if (reply.kind === "file")
      throw new Refused(500, "failed", "Data answered with a file where words were expected.");
    return answerOf(reply);
  }

  // ------------------------------------------------------------------ status

  state(): DataState {
    return this.#state;
  }

  status(): DataStatus {
    this.#inject("status");
    return {
      state: this.#state,
      detail: this.#detail,
      progress: this.#progress,
      started_at: this.#startedAt,
      crashes: this.#crashes.length,
      modules: [...this.#modules],
    };
  }

  ready(timeoutMs = 60_000): Promise<void> {
    if (this.#state === "ready") return Promise.resolve();
    if (this.#state === "stopped") return Promise.reject(new Error("Data stopped after an error"));
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.#readyWaiters.findIndex((waiter) => waiter.resolve === done);
        if (index >= 0) this.#readyWaiters.splice(index, 1);
        reject(new Error("Data did not become ready in time"));
      }, timeoutMs);
      timer.unref();
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      this.#readyWaiters.push({
        resolve: done,
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
  }

  // ------------------------------------------------------------------ the routes

  routes(): Route[] {
    const status: JsonRoute = {
      method: "GET",
      pattern: /^\/data\/status$/,
      run: (engine) => {
        const data = this.status();
        let sender: {
          sending: { mailing_id: string; name: string } | null;
          sent_today: number;
        } | null = null;
        try {
          const own = engine.status();
          sender = { sending: own.sending, sent_today: own.sent_today };
        } catch {
          sender = null;
        }
        return { data, sender };
      },
    };
    const restart: JsonRoute = {
      method: "POST",
      pattern: /^\/data\/restart$/,
      run: () => this.restart(),
    };
    const parts: StreamRoute = {
      method: "POST",
      pattern: new RegExp(`^/data/uploads/${ID}/parts/(\\d{1,4})$`),
      stream: (request, response, params) => this.#receivePart(request, response, params),
    };
    const fileBytes: StreamRoute = {
      method: "GET",
      pattern: new RegExp(`^/data/files/${ID}/bytes$`),
      stream: (request, response, params, query) =>
        this.#sendBytes(response, `/data/files/${params[0]}/bytes`, query.toString()),
    };
    const buildBytes: StreamRoute = {
      method: "GET",
      pattern: new RegExp(`^/data/builds/${ID}/bytes$`),
      stream: (request, response, params, query) =>
        this.#sendBytes(response, `/data/builds/${params[0]}/bytes`, query.toString()),
    };
    const forward = (method: "GET" | "POST"): JsonRoute => ({
      method,
      pattern: /^(\/data(?:\/.*)?)$/,
      run: (_engine, [path], body, query) =>
        this.forward(method, path ?? "/data", query.toString(), body),
    });
    return [status, restart, parts, fileBytes, buildBytes, forward("GET"), forward("POST")];
  }

  /** A file's bytes out: the worker names the file, the host streams it. */
  async #sendBytes(response: ServerResponse, path: string, query: string): Promise<void> {
    try {
      this.#inject("stream");
      const reply = await this.ask("GET", path, query, {});
      if (reply.kind === "answer") {
        if (reply.status === 200)
          throw new Refused(500, "failed", "Data answered with words where a file was expected.");
        sendJson(response, reply.status, { ok: false, error: errorOf(reply.body) });
        return;
      }
      const { file } = reply;
      response.writeHead(200, {
        "content-type": file.type || "application/octet-stream",
        "content-length": String(file.size),
        "x-data-name": encodeURIComponent(file.name),
        "x-data-sha256": file.sha256,
      });
      try {
        await pipeline(createReadStream(file.path), response);
      } finally {
        if (file.remove_after) void rm(file.path, { force: true }).catch(() => undefined);
      }
    } catch (error) {
      refuse(response, error);
    }
  }

  /** A part of an upload in: the worker names the target, the host streams the body to it. */
  async #receivePart(
    request: IncomingMessage,
    response: ServerResponse,
    params: string[],
  ): Promise<void> {
    try {
      this.#inject("stream");
      const length = Number(request.headers["content-length"]);
      if (!Number.isSafeInteger(length) || length <= 0) {
        request.resume();
        throw new Refused(400, "part_refused", HOST_MESSAGES.part_refused);
      }
      if (length > PART_BYTES) {
        request.resume();
        throw new Refused(413, "part_too_large", HOST_MESSAGES.part_too_large);
      }
      const uploadId = params[0] ?? "";
      const index = params[1] ?? "0";
      const reply = await this.ask(
        "POST",
        `/data/uploads/${uploadId}/parts/${index}`,
        "",
        {},
        {
          part: { upload_id: uploadId, index: Number(index) },
          onReceive: async (target, maxBytes) => {
            if (length > maxBytes) {
              request.resume();
              throw new Refused(413, "part_too_large", HOST_MESSAGES.part_too_large);
            }
            const writing = `${target}.writing`;
            let seen = 0;
            const cap = new Transform({
              transform(chunk: Buffer, _encoding, done) {
                seen += chunk.length;
                if (seen > length) done(new Error("longer than declared"));
                else done(null, chunk);
              },
            });
            try {
              await pipeline(request, cap, createWriteStream(writing, { mode: 0o600 }));
              if (seen !== length) throw new Error("shorter than declared");
              await rename(writing, target);
            } catch (error) {
              await rm(writing, { force: true }).catch(() => undefined);
              throw error;
            }
            return seen;
          },
        },
      ).catch((error: unknown) => {
        request.resume();
        throw error;
      });
      if (reply.kind === "file")
        throw new Refused(500, "failed", "Data answered with a file where words were expected.");
      if (reply.status === 200) sendJson(response, 200, { ok: true, ...reply.body });
      else sendJson(response, reply.status, { ok: false, error: errorOf(reply.body) });
    } catch (error) {
      refuse(response, error);
    }
  }
}

/** A send by email whose answer is lost may still have gone: it never says "try again". */
function lostAnswer(pending: Pending, refusal: Refused): Refused {
  return SHARE_PATH.test(pending.path)
    ? new Refused(503, "share_unknown", HOST_MESSAGES.share_unknown)
    : refusal;
}

function errorOf(body: Record<string, unknown>): { code: string; message: string } {
  const error = body.error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      code: typeof record.code === "string" ? record.code : "failed",
      message:
        typeof record.message === "string" ? record.message : "Data could not do that just now.",
    };
  }
  return { code: "failed", message: "Data could not do that just now." };
}

/** The worker's `{status, body}` as the route's answer, or the refusal it carries. */
function answerOf(reply: Extract<Reply, { kind: "answer" }>): Record<string, unknown> {
  if (reply.status === 200) return reply.body;
  const error = errorOf(reply.body);
  throw new Refused(reply.status, error.code, error.message);
}

/**
 * Start Data beside the engine: the worker is spawned at once and the routes are ready to
 * hand to `createMergeServer`. Nothing here throws for a worker that fails to start; that
 * is a crash, reported through `/data/status`.
 */
export function startData(options: StartDataOptions): DataHandle {
  const host = new DataHost(options);
  host.start();
  return {
    routes: host.routes(),
    state: () => host.state(),
    status: () => host.status(),
    ready: (timeoutMs) => host.ready(timeoutMs),
    restart: () => host.restart(),
    stop: () => host.stop(),
    shareProvider: host.shareProvider,
    providerKey: () => host.providerKey(),
  };
}
