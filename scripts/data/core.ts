/**
 * `DataCore`: what every Data module is built on, inside the worker thread.
 *
 * It holds the route table (`route`, `stream`), the services modules offer one another
 * (`provide`, `need`), the overview and due providers, jobs with progress and the
 * poison-pill markers, builds, the attempt-replay cache, the engine bridge to the main
 * thread, and the clock. It owns the store (`<Mail merge folder>/data/`) and the read-only
 * sender readers. It never touches the socket: the host hands it requests as messages and
 * it answers with messages.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../mail-merge/engine";
import { Builds } from "./builds";
import { localDay } from "./days";
import { attemptOf, staffOf } from "./guard";
import {
  type DataState,
  type EngineCall,
  type FromWorker,
  type ModuleState,
  type Progress,
  type RefusalBody,
  type SendFile,
  type ShareMail,
  type Staff,
  type ToWorker,
} from "./protocol";
import { SenderFiles } from "./sender-files";
import { DataStore } from "./store";

export type Answer = Record<string, unknown>;

/** What a handler is given. */
export type Ctx = {
  method: "GET" | "POST";
  path: string;
  /** The pattern's capture groups, in order. */
  params: string[];
  query: URLSearchParams;
  body: Record<string, unknown>;
  /** Who is making the change (`body.by`); throws `Refused` 400 when it was not given. */
  staff(): Staff;
  /** The creating POST's attempt id, when it carried a proper one. */
  attempt: string | null;
};

export type JsonHandler = (ctx: Ctx) => Answer | Promise<Answer>;

/** What a stream handler answers: a file for the host to send, or where to put the bytes coming in. */
export type StreamResult =
  | { file: SendFile }
  | {
      receive: { target: string; max_bytes: number };
      /**
       * Runs once the host has written the part; its answer is the request's. (Not named
       * `then`: an object with a `then` method is a thenable, and `await` would call it.)
       */
      written: (bytes: number) => Answer | Promise<Answer>;
      /** Runs when the host could not write it (the host has already refused the request). */
      failed?: (error: RefusalBody) => void;
    };
export type StreamHandler = (ctx: Ctx) => StreamResult | Promise<StreamResult>;

/** A route pattern: a RegExp, or a string path whose `:name` segments match an id. */
export type Pattern = string | RegExp;

type RouteEntry =
  | { kind: "json"; method: "GET" | "POST"; pattern: RegExp; handler: JsonHandler }
  | { kind: "stream"; method: "GET" | "POST"; pattern: RegExp; handler: StreamHandler };

export type DueKind = "follow_up" | "waitlist" | "investor" | "key_date" | "file_review" | "action";
export type DueItem = {
  key: string;
  kind: DueKind;
  title: string;
  sub: string;
  due_on: string;
  href: string;
};

export type OverviewProvider = () => Answer | Promise<Answer>;
export type DueProvider = () => DueItem[] | Promise<DueItem[]>;

/** What a module's `index.ts` exports. */
export type DataModule = { register(core: DataCore): void | Promise<void> };

export const MODULES = [
  "files",
  "leads",
  "replies",
  "waitlist",
  "investors",
  "dates",
  "contacts",
  "notes",
  "numbers",
  "calendar",
  "search",
  "backup",
] as const;
export type ModuleName = (typeof MODULES)[number];

export type Job = {
  readonly job_id: string;
  readonly kind: string;
  detail: string;
  done: number;
  total: number;
  state: "running" | "done" | "failed";
  advance(count?: number): void;
  setTotal(total: number): void;
  finish(): void;
  fail(detail: string): void;
};

export type JobView = {
  job_id: string;
  kind: string;
  detail: string;
  done: number;
  total: number;
  state: Job["state"];
};

const ID = "([A-Za-z0-9-]{1,64})";
const ATTEMPT_KEEP_MS = 24 * 60 * 60 * 1_000;
const ENGINE_DEADLINE_MS = 30_000;
/** A send by email waits this long for the host; the host's request deadline for it is longer. */
export const SHARE_DEADLINE_MS = 60_000;
const DUE_ROWS = 30;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** "/data/files/:id/versions/:vid" → a RegExp whose groups are the ids, in order. */
export function patternOf(pattern: Pattern): RegExp {
  if (pattern instanceof RegExp) return pattern;
  const source = pattern
    .split("/")
    .map((segment) => (segment.startsWith(":") ? ID : escapeRegExp(segment)))
    .join("\\/");
  return new RegExp(`^${source}$`);
}

export type CoreOptions = {
  /** Mail merge's folder; Data's own is `<dir>/data`. */
  dir: string;
  post: (message: FromWorker) => void;
  testRoutes?: boolean;
  now?: () => Date;
  log?: (line: string) => void;
};

export class DataCore {
  readonly dir: string;
  readonly root: string;
  readonly store: DataStore;
  readonly sender: SenderFiles;
  readonly testRoutes: boolean;
  readonly builds: Builds;
  readonly modules: ModuleState[] = [];
  readonly #routes: RouteEntry[] = [];
  readonly #services = new Map<string, unknown>();
  readonly #overview = new Map<string, OverviewProvider>();
  readonly #due: DueProvider[] = [];
  readonly #attempts = new Map<string, { route: string; answer: Answer; at: string }>();
  readonly #engineWaiters = new Map<
    number,
    { resolve: (value: Answer) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >();
  readonly #receivers = new Map<
    number,
    { resolve: (bytes: number) => void; reject: (error: RefusalBody) => void }
  >();
  readonly #jobs = new Map<string, Job>();
  readonly #reading = new Set<string>();
  #poisoned = new Set<string>();
  readonly #post: (message: FromWorker) => void;
  readonly #now: () => Date;
  readonly #log: (line: string) => void;
  #nextEngineId = 1;
  #state: DataState = "starting";
  #detail = "Starting";
  #progress: Progress = null;
  #closed = false;
  #stopSenderWatch: (() => void) | null = null;

  constructor(options: CoreOptions) {
    this.dir = options.dir;
    this.store = new DataStore(`${options.dir}/data`);
    this.root = this.store.root;
    this.testRoutes = options.testRoutes === true;
    this.#post = options.post;
    this.#now = options.now ?? (() => new Date());
    this.#log = options.log ?? ((line) => console.log(`[data] ${line}`));
    this.sender = new SenderFiles(options.dir);
    this.builds = new Builds(this);
  }

  // ------------------------------------------------------------------ opening

  /** The first things, before any module: the folder, the tmp sweep, the replay cache. */
  open(): void {
    if (!this.store.exists("data.json"))
      this.store.writeJson("data.json", { format: 1, created_at: this.now() });
    this.store.remove("tmp");
    this.store.ensureDir("tmp");
    // Attempts: keep a day's worth, write them back compact.
    const kept: { attempt: string; route: string; answer: Answer; at: string }[] = [];
    const cutoff = this.#now().getTime() - ATTEMPT_KEEP_MS;
    for (const line of this.store.readLines<{
      attempt: string;
      route: string;
      answer: Answer;
      at: string;
    }>("attempts.jsonl")) {
      if (typeof line?.attempt !== "string" || Date.parse(line.at) < cutoff) continue;
      kept.push(line);
      this.#attempts.set(line.attempt, { route: line.route, answer: line.answer, at: line.at });
    }
    this.store.writeText(
      "attempts.jsonl",
      kept.map((line) => JSON.stringify(line)).join("\n") + (kept.length ? "\n" : ""),
    );
    // Poison pills: whatever was being read when the worker last died.
    const left = this.store.readJson<string[]>("reading.json", []);
    this.#poisoned = new Set(
      Array.isArray(left) ? left.filter((key) => typeof key === "string") : [],
    );
    if (this.#poisoned.size > 0) {
      this.#log(`${this.#poisoned.size} item(s) were being read when the worker last stopped`);
      this.store.writeJson("reading.json", []);
    }
    this.#stopSenderWatch = this.sender.watch(() => undefined);
  }

  /**
   * Load the modules by name, in order. A missing module is skipped; one that throws at
   * load is reported `failed` and the others still load.
   */
  async loadModules(
    names: readonly string[],
    importer: (name: string) => Promise<unknown>,
  ): Promise<void> {
    for (const [index, name] of names.entries()) {
      this.setStarting(`Loading ${name}`, { done: index, total: names.length });
      let loaded: unknown;
      try {
        loaded = await importer(name);
      } catch (error) {
        if (isMissingModule(error, name)) continue;
        this.modules.push({ name, state: "failed", detail: errorName(error) });
        this.#log(`module ${name} failed to load: ${errorName(error)}`);
        continue;
      }
      const exported = loaded as Partial<DataModule> | null;
      if (!exported || typeof exported.register !== "function") continue;
      try {
        await exported.register(this);
        this.modules.push({ name, state: "ready", detail: "" });
      } catch (error) {
        this.modules.push({ name, state: "failed", detail: errorName(error) });
        this.#log(`module ${name} failed to start: ${errorName(error)}`);
      }
    }
  }

  /** Posted while opening: what is being read, and how far it has got. */
  setStarting(detail: string, progress: Progress = null): void {
    this.#state = "starting";
    this.#detail = detail;
    this.#progress = progress;
    this.#postState();
  }

  /** Posted once everything is loaded; requests are answered from here on. */
  ready(): void {
    this.#state = "ready";
    this.#detail = "";
    this.#progress = null;
    this.#postState();
    this.#log(
      `ready: ${this.sender.lists().length} lists, ${this.sender.written().length} written, ${this.modules.length} modules`,
    );
  }

  #postState(): void {
    this.#post({
      type: "state",
      state: this.#state,
      detail: this.#detail,
      progress: this.#progress,
      modules: [...this.modules],
    });
  }

  get state(): DataState {
    return this.#state;
  }

  /** Stop timers; the worker exits after this. */
  close(): void {
    this.#closed = true;
    this.#stopSenderWatch?.();
    this.sender.close();
    this.builds.close();
    for (const waiter of this.#engineWaiters.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Refused(503, "data_restarting", "Data is stopping."));
    }
    this.#engineWaiters.clear();
  }

  // ------------------------------------------------------------------ the clock

  now(): string {
    return this.#now().toISOString();
  }

  /** This Mac's calendar day, the day Mail merge counts its limit on. */
  day(at: Date | string = this.#now()): string {
    return localDay(at);
  }

  log(line: string): void {
    this.#log(line);
  }

  /** Let other messages in: between pages of a PDF, between rows of a file. */
  yield(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
  }

  // ------------------------------------------------------------------ routes

  route(method: "GET" | "POST", pattern: Pattern, handler: JsonHandler): void {
    this.#routes.push({ kind: "json", method, pattern: patternOf(pattern), handler });
  }

  stream(method: "GET" | "POST", pattern: Pattern, handler: StreamHandler): void {
    this.#routes.push({ kind: "stream", method, pattern: patternOf(pattern), handler });
  }

  /** Whether anything answers a path: for a module to ask before linking to another's page. */
  answers(method: "GET" | "POST", path: string): boolean {
    return this.#routes.some((route) => route.method === method && route.pattern.test(path));
  }

  // ------------------------------------------------------------------ services

  provide(name: string, value: unknown): void {
    this.#services.set(name, value);
  }

  /** What another module provided, or null: never a throw. */
  need<T>(name: string): T | null {
    return (this.#services.get(name) as T | undefined) ?? null;
  }

  provideOverview(key: string, provider: OverviewProvider): void {
    this.#overview.set(key, provider);
  }

  provideDue(provider: DueProvider): void {
    this.#due.push(provider);
  }

  /** Every module's block for the overview, by key; a block that fails is left out. */
  async overviewParts(): Promise<Record<string, unknown>> {
    const parts: Record<string, unknown> = {};
    for (const [key, provider] of this.#overview) {
      try {
        parts[key] = await provider();
      } catch (error) {
        this.#log(`overview block ${key} failed: ${errorName(error)}`);
      }
    }
    return parts;
  }

  /** What is owed, from every module: overdue first, then by date; at most 30. */
  async dueItems(): Promise<DueItem[]> {
    const items: DueItem[] = [];
    for (const provider of this.#due) {
      try {
        items.push(...(await provider()));
      } catch (error) {
        this.#log(`a due provider failed: ${errorName(error)}`);
      }
    }
    return items
      .sort((a, b) => a.due_on.localeCompare(b.due_on) || a.title.localeCompare(b.title))
      .slice(0, DUE_ROWS);
  }

  // ------------------------------------------------------------------ jobs and pills

  /** A long piece of work with progress the pages can show. */
  startJob(kind: string, total: number, detail = ""): Job {
    const jobs = this.#jobs;
    const job: Job = {
      job_id: randomUUID(),
      kind,
      detail,
      done: 0,
      total,
      state: "running",
      advance: (count = 1) => {
        job.done = Math.min(job.total, job.done + count);
      },
      setTotal: (next) => {
        job.total = next;
      },
      finish: () => {
        job.state = "done";
        job.done = job.total;
        jobs.delete(job.job_id);
      },
      fail: (why) => {
        job.state = "failed";
        job.detail = why;
        jobs.delete(job.job_id);
      },
    };
    jobs.set(job.job_id, job);
    return job;
  }

  /** The jobs running now, as plain data. */
  jobs(kind?: string): JobView[] {
    return [...this.#jobs.values()]
      .filter((job) => !kind || job.kind === kind)
      .map(({ job_id, kind: jobKind, detail, done, total, state }) => ({
        job_id,
        kind: jobKind,
        detail,
        done,
        total,
        state,
      }));
  }

  /**
   * Poison pills. Mark an item before reading it; clear the mark after. If the worker dies
   * with a mark set, the next start finds the key `poisoned`, and the module marks that
   * item "Could not be read" instead of reading it again.
   */
  readonly pills = {
    mark: (key: string): void => {
      this.#reading.add(key);
      this.store.writeJson("reading.json", [...this.#reading]);
    },
    clear: (key: string): void => {
      if (!this.#reading.delete(key)) return;
      this.store.writeJson("reading.json", [...this.#reading]);
    },
    poisoned: (key: string): boolean => this.#poisoned.has(key),
    forget: (key: string): void => {
      this.#poisoned.delete(key);
    },
    /** Read with the mark set, cleared whatever happens; a poisoned key is refused at once. */
    guard: async <T>(key: string, read: () => Promise<T>): Promise<T> => {
      if (this.#poisoned.has(key)) throw new PoisonedError(key);
      this.pills.mark(key);
      try {
        return await read();
      } finally {
        this.pills.clear(key);
      }
    },
  };

  // ------------------------------------------------------------------ the engine bridge

  /**
   * Ask the main thread to run one of Mail merge's four allowed calls. A refusal comes back
   * as `Refused`, as if the engine had thrown it here.
   */
  engine(call: EngineCall, args: Record<string, unknown>): Promise<Answer> {
    if (this.#closed)
      return Promise.reject(new Refused(503, "data_restarting", "Data is stopping."));
    const id = this.#nextEngineId++;
    return new Promise<Answer>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#engineWaiters.delete(id);
        reject(
          new Refused(
            503,
            "data_slow",
            "Mail merge took too long to answer. Nothing was lost; try again.",
          ),
        );
      }, ENGINE_DEADLINE_MS);
      timer.unref();
      this.#engineWaiters.set(id, { resolve, reject, timer });
      this.#post({ type: "engine", id, call, args });
    });
  }

  /**
   * Ask the main thread to send a file by email: the host reads the provider key (the
   * worker never does), reads the bytes and sends one message per address. The answer is
   * `{ results: ShareResult[] }`; a refusal (no key) comes back as `Refused`. No answer in
   * time is "it may have gone".
   */
  share(mail: ShareMail): Promise<Answer> {
    if (this.#closed)
      return Promise.reject(new Refused(503, "data_restarting", "Data is stopping."));
    const id = this.#nextEngineId++;
    return new Promise<Answer>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#engineWaiters.delete(id);
        reject(
          new Refused(503, "share_slow", "It may have gone: the provider did not answer in time."),
        );
      }, SHARE_DEADLINE_MS);
      timer.unref();
      this.#engineWaiters.set(id, { resolve, reject, timer });
      this.#post({ type: "share", id, mail });
    });
  }

  // ------------------------------------------------------------------ messages from the host

  handle(message: ToWorker): void {
    switch (message.type) {
      case "request":
        void this.#request(message);
        return;
      case "engine-answer":
      case "share-answer": {
        const waiter = this.#engineWaiters.get(message.id);
        if (!waiter) return;
        this.#engineWaiters.delete(message.id);
        clearTimeout(waiter.timer);
        if (message.ok) waiter.resolve(message.value);
        else
          waiter.reject(
            new Refused(message.error.status, message.error.code, message.error.message),
          );
        return;
      }
      case "part-written": {
        const receiver = this.#receivers.get(message.id);
        if (!receiver) return;
        this.#receivers.delete(message.id);
        receiver.resolve(message.bytes);
        return;
      }
      case "part-failed": {
        const receiver = this.#receivers.get(message.id);
        if (!receiver) return;
        this.#receivers.delete(message.id);
        receiver.reject(message.error);
        return;
      }
      case "ping":
        this.#post({ type: "pong" });
        return;
      case "stop":
        this.close();
        return;
    }
  }

  #answer(id: number, status: number, body: Answer): void {
    this.#post({ type: "answer", id, status, body });
  }

  #refuse(id: number, error: unknown): void {
    if (error instanceof Refused) {
      this.#answer(id, error.status, { error: { code: error.code, message: error.message } });
      return;
    }
    this.#log(`a request failed: ${errorName(error)}`);
    this.#answer(id, 500, {
      error: { code: "failed", message: "Data could not do that just now." },
    });
  }

  async #request(message: Extract<ToWorker, { type: "request" }>): Promise<void> {
    const { id } = message;
    try {
      const url = new URL(
        `${message.path}${message.query ? `?${message.query}` : ""}`,
        "http://data.invalid",
      );
      const route = this.#routes.find(
        (entry) => entry.method === message.method && entry.pattern.test(url.pathname),
      );
      if (!route) throw new Refused(404, "module_missing", "That part of Data is not loaded.");
      const body = message.body ?? {};
      const ctx: Ctx = {
        method: message.method,
        path: url.pathname,
        params: (route.pattern.exec(url.pathname) ?? []).slice(1),
        query: url.searchParams,
        body,
        staff: () => staffOf(body),
        attempt: message.method === "POST" ? attemptOf(body) : null,
      };
      if (route.kind === "json") {
        if (ctx.attempt) {
          const prior = this.#attempts.get(ctx.attempt);
          if (prior && prior.route === url.pathname) {
            this.#answer(id, 200, prior.answer);
            return;
          }
        }
        const answer = await route.handler(ctx);
        if (ctx.attempt) this.#remember(ctx.attempt, url.pathname, answer);
        this.#answer(id, 200, answer);
        return;
      }
      const result = await route.handler(ctx);
      if ("file" in result) {
        this.#post({ type: "send-file", id, file: result.file });
        return;
      }
      const written = new Promise<number>((resolve, reject) => {
        this.#receivers.set(id, { resolve, reject });
      });
      this.#post({
        type: "receive-part",
        id,
        target: result.receive.target,
        max_bytes: result.receive.max_bytes,
      });
      let bytes: number;
      try {
        bytes = await written;
      } catch (error) {
        // The host has refused the request already; the handler only tidies up.
        try {
          result.failed?.(error as RefusalBody);
        } catch (inner) {
          this.#log(`a part's clean-up failed: ${errorName(inner)}`);
        }
        return;
      }
      this.#answer(id, 200, await result.written(bytes));
    } catch (error) {
      this.#refuse(id, error);
    }
  }

  #remember(attempt: string, route: string, answer: Answer): void {
    const at = this.now();
    this.#attempts.set(attempt, { route, answer, at });
    this.store.appendLine("attempts.jsonl", { attempt, route, answer, at });
  }
}

export class PoisonedError extends Error {
  constructor(readonly key: string) {
    super("this item crashed the worker the last time it was read");
    this.name = "PoisonedError";
  }
}

function errorName(error: unknown): string {
  if (error instanceof Refused) return `${error.name} ${error.code}`;
  return error instanceof Error ? error.name : "error";
}

function isMissingModule(error: unknown, name: string): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  const aboutThisModule =
    error.message.includes(`/${name}/index`) || error.message.includes(`${name}/index`);
  return (
    (code === "ERR_MODULE_NOT_FOUND" ||
      code === "MODULE_NOT_FOUND" ||
      /Cannot find module/.test(error.message)) &&
    aboutThisModule
  );
}
