/**
 * All leads and Replies in one thread, for the tests that need to reach inside: the real
 * `DataCore` (routes, store, sender readers, builds, attempt replay) and the real
 * `MergeEngine` on a temp folder, bridged the way the host bridges them, with a fake files
 * service in place of Unit 2's. Everyone in here is invented, on `.example` domains.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { registerBuilds } from "../../scripts/data/builds";
import { DataCore } from "../../scripts/data/core";
import { registerOverview } from "../../scripts/data/overview";
import type { FromWorker, Staff } from "../../scripts/data/protocol";
import type {
  FileRow,
  FileVersion,
  FilesEvent,
  FilesService,
  VersionPath,
} from "../../scripts/data/leads/contracts";
import type { LeadsInternal, LeadsModule } from "../../scripts/data/leads/index";
import type { RepliesInternal } from "../../scripts/data/replies/index";
import { MergeEngine, Refused, type StepResult } from "../../scripts/mail-merge/engine";
import type {
  AccountCheck,
  Blocked,
  MailProvider,
  OutgoingMail,
  SendResult,
  SenderCheck,
} from "../../scripts/mail-merge/provider";

export const WALKER: Staff = { staff_id: "walk-owner", name: "Walk Owner" };
export const OTHER: Staff = { staff_id: "walk-admin", name: "Walk Admin" };
export const KEY = "xkeysib-test-0000000000000000000000000000000000000000-abcd";

/** A provider that remembers what it was handed and says every message was sent. */
export class Scripted implements MailProvider {
  readonly kind = "live" as const;
  sent: OutgoingMail[] = [];
  /** What `syncStops` hears the provider will not mail (a bounce, say). */
  blocked: Blocked[] = [];
  async send(mail: OutgoingMail): Promise<SendResult> {
    this.sent.push(mail);
    return {
      status: "sent",
      message_id: `<${this.sent.length}@test>`,
      error_code: "",
      retry_after_seconds: null,
    };
  }
  async checkAccount(): Promise<AccountCheck> {
    return {
      status: "ok",
      email: "founder@walk.example",
      company: "Walk",
      plan: "free",
      credits: 300,
    };
  }
  async checkSender(email: string): Promise<SenderCheck> {
    return {
      status: "ok",
      domain: email.split("@")[1] ?? "",
      sender_known: true,
      sender_active: true,
      domain_known: true,
      domain_authenticated: true,
    };
  }
  async listBlocked(): Promise<Blocked[]> {
    return this.blocked;
  }
}

// ------------------------------------------------------------------ a fake files service

type FakeFile = { row: FileRow; versions: (FileVersion & { path: string })[]; current: number };

/** Unit 2's `files` service as far as All leads uses it: CSVs with versions, on disk. */
export class FakeFiles implements FilesService {
  readonly #dir: string;
  readonly #files = new Map<string, FakeFile>();
  readonly #listeners = new Set<(event: FilesEvent) => void>();

  constructor(dir: string) {
    this.#dir = dir;
  }

  #write(fileId: string, n: number, text: string): { path: string; sha256: string; bytes: number } {
    const path = join(this.#dir, `${fileId}-v${n}.csv`);
    writeFileSync(path, text);
    return {
      path,
      sha256: createHash("sha256").update(text).digest("hex"),
      bytes: Buffer.byteLength(text),
    };
  }

  add(title: string, text: string, folder = "11 Leads, lists and outreach"): FileRow {
    const file_id = randomUUID();
    const written = this.#write(file_id, 1, text);
    const at = new Date().toISOString();
    const row: FileRow = {
      file_id,
      title,
      original_name: title,
      folder_id: "folder-leads",
      folder_path: folder,
      kind: "csv",
      bytes: written.bytes,
      tags: [],
      starred: false,
      review_by: null,
      versions: 1,
      updated_at: at,
      updated_by_name: WALKER.name,
      trashed_at: null,
    };
    this.#files.set(file_id, {
      row,
      versions: [
        {
          version_id: randomUUID(),
          n: 1,
          sha256: written.sha256,
          bytes: written.bytes,
          kind: "csv",
          original_name: title,
          added_at: at,
          path: written.path,
        },
      ],
      current: 1,
    });
    this.#emit({ kind: "added", file_id });
    return row;
  }

  /** A new version, made current; listeners hear `version_added`. */
  addVersion(fileId: string, text: string): void {
    const file = this.#files.get(fileId)!;
    const n = file.versions.length + 1;
    const written = this.#write(fileId, n, text);
    file.versions.push({
      version_id: randomUUID(),
      n,
      sha256: written.sha256,
      bytes: written.bytes,
      kind: "csv",
      original_name: file.row.original_name,
      added_at: new Date().toISOString(),
      path: written.path,
    });
    file.current = n;
    file.row = { ...file.row, versions: n, bytes: written.bytes };
    this.#emit({ kind: "version_added", file_id: fileId });
  }

  /** The file leaves Files for good (its bytes too). */
  forget(fileId: string): void {
    this.#files.delete(fileId);
    this.#emit({ kind: "deleted", file_id: fileId });
  }

  #emit(event: FilesEvent): void {
    for (const listener of this.#listeners) listener(event);
  }

  csvFiles(): FileRow[] {
    return [...this.#files.values()].map((file) => file.row).filter((row) => row.kind === "csv");
  }
  fileRow(fileId: string): FileRow | null {
    return this.#files.get(fileId)?.row ?? null;
  }
  versions(fileId: string): FileVersion[] {
    return (this.#files.get(fileId)?.versions ?? []).map((version) => ({
      version_id: version.version_id,
      n: version.n,
      sha256: version.sha256,
      bytes: version.bytes,
      kind: version.kind,
      original_name: version.original_name,
      added_at: version.added_at,
    }));
  }
  versionPath(fileId: string, n?: number): VersionPath | null {
    const file = this.#files.get(fileId);
    const version = file?.versions.find((item) => item.n === (n ?? file.current));
    if (!file || !version) return null;
    return {
      path: version.path,
      sha256: version.sha256,
      n: version.n,
      bytes: version.bytes,
      original_name: version.original_name,
      kind: "csv",
    };
  }
  async putFile(input: { title: string; bytes: Uint8Array }): Promise<FileRow> {
    return this.add(input.title, new TextDecoder().decode(input.bytes));
  }
  onChange(listener: (event: FilesEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}

// ------------------------------------------------------------------ the kit

export type Answer = { status: number; body: Record<string, unknown> };

export type Kit = {
  dir: string;
  core: DataCore;
  engine: MergeEngine;
  provider: Scripted;
  files: FakeFiles | null;
  leads: LeadsInternal;
  module: LeadsModule;
  replies: RepliesInternal;
  clock: { at: Date };
  ask(method: "GET" | "POST", path: string, body?: Record<string, unknown>): Promise<Answer>;
  /** Make a build and read its file once it is ready. */
  build(kind: string, input?: { query?: string; body?: Record<string, unknown> }): Promise<string>;
  /** Wait for any background rebuild of the index to finish. */
  settle(): Promise<void>;
  close(): void;
};

export type KitOptions = {
  /** Something to do with the engine and the files before Data opens (seeding). */
  before?: (engine: MergeEngine, files: FakeFiles, dir: string) => void | Promise<void>;
  /** No files service at all, as in this copy before Unit 2 merges. */
  noFiles?: boolean;
  /** Reuse a folder (a restart). */
  dir?: string;
};

const IMPORT_ROW_CAP = 5_000;

export async function startKit(options: KitOptions = {}): Promise<Kit> {
  const dir = options.dir ?? mkdtempSync(join(tmpdir(), "hqlk-"));
  const clock = { at: new Date() };
  const provider = new Scripted();
  const engine = new MergeEngine({ dir, liveProvider: () => provider });
  const files = options.noFiles ? null : new FakeFiles(dir);
  if (options.before) await options.before(engine, files ?? new FakeFiles(dir), dir);
  const waiting = new Map<number, (answer: Answer) => void>();
  let nextId = 1;
  // eslint-disable-next-line prefer-const
  let core: DataCore;
  const runEngine = (call: string, args: Record<string, unknown>): Record<string, unknown> => {
    switch (call) {
      case "addStops":
        return engine.addStops(args);
      case "removeStop":
        return engine.removeStop(args);
      case "importList": {
        const text = typeof args.text === "string" ? args.text : "";
        if (text.split("\n").length - 1 > IMPORT_ROW_CAP)
          throw new Refused(
            400,
            "too_many",
            "A Mail merge list made here holds 5,000 people at most.",
          );
        return engine.importList(args);
      }
      case "status":
        return engine.status();
      default:
        throw new Refused(400, "invalid", "That call is not allowed.");
    }
  };
  const post = (message: FromWorker): void => {
    if (message.type === "answer") {
      waiting.get(message.id)?.({ status: message.status, body: message.body });
      waiting.delete(message.id);
      return;
    }
    if (message.type === "engine") {
      setImmediate(() => {
        try {
          core.handle({
            type: "engine-answer",
            id: message.id,
            ok: true,
            value: runEngine(message.call, message.args),
          });
        } catch (error) {
          const refused =
            error instanceof Refused
              ? { status: error.status, code: error.code, message: error.message }
              : { status: 500, code: "failed", message: "Data could not do that just now." };
          core.handle({ type: "engine-answer", id: message.id, ok: false, error: refused });
        }
      });
    }
  };
  core = new DataCore({ dir, post, testRoutes: true, log: () => undefined });
  core.open();
  if (files) core.provide("files", files);
  await core.loadModules(["leads", "replies"], (name) =>
    name === "leads"
      ? import("../../scripts/data/leads/index")
      : import("../../scripts/data/replies/index"),
  );
  for (const state of core.modules)
    if (state.state !== "ready") throw new Error(`module ${state.name} failed: ${state.detail}`);
  registerOverview(core);
  registerBuilds(core);
  core.ready();
  const leads = core.need<LeadsInternal>("leads")!;
  const replies = core.need<RepliesInternal>("replies")!;
  const ask = (method: "GET" | "POST", path: string, body: Record<string, unknown> = {}) => {
    const id = nextId++;
    const url = new URL(path, "http://kit.invalid");
    return new Promise<Answer>((resolve) => {
      waiting.set(id, resolve);
      core.handle({
        type: "request",
        id,
        method,
        path: url.pathname,
        query: url.search.slice(1),
        body,
      });
    });
  };
  const settle = async (): Promise<void> => {
    for (let tries = 0; tries < 2_000; tries += 1) {
      if (!leads.module.reading) {
        await new Promise((resolve) => setImmediate(resolve));
        if (!leads.module.reading) return;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("the index did not settle");
  };
  return {
    dir,
    core,
    engine,
    provider,
    files,
    leads,
    module: leads.module,
    replies,
    clock,
    ask,
    settle,
    build: async (kind, input = {}) => {
      const build = core.builds.start(kind, {
        query: input.query ?? "",
        folder_id: "",
        by: WALKER,
        body: input.body ?? {},
      });
      for (let tries = 0; tries < 2_000; tries += 1) {
        const now = core.builds.get(build.build_id);
        if (now?.state === "ready")
          return readFileSync(core.builds.file(build.build_id).path, "utf8");
        if (now?.state === "failed") throw new Error(now.detail);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      throw new Error("the build did not finish");
    },
    close: () => {
      core.close();
      if (!options.dir) rmSync(dir, { recursive: true, force: true });
    },
  };
}

// ------------------------------------------------------------------ sending, for real

export async function drain(engine: MergeEngine): Promise<StepResult[]> {
  const seen: StepResult[] = [];
  for (let index = 0; index < 10_000; index += 1) {
    const outcome = await engine.step();
    seen.push(outcome);
    if (outcome === "idle" || outcome === "paused" || outcome === "finished") break;
  }
  return seen;
}

/** Mail merge's settings and key, so a live send can go (to the scripted provider). */
export async function readyToSend(engine: MergeEngine): Promise<void> {
  engine.saveSettings({
    from_email: "founder@walk.example",
    from_name: "Walk Founder",
    reply_to: "replies@walk.example",
    footer: "",
    per_minute: 60,
    daily_cap: 5_000,
  });
  await engine.setKey({ key: KEY });
}

/** A live mailing to one list, sent in full: what the written log and run files hold after. */
export async function sendLive(
  engine: MergeEngine,
  listId: string,
  name: string,
  subject = "A note for {{company}}",
): Promise<string> {
  const mailing = engine.createMailing({ name }).mailing;
  engine.updateMailing(mailing.id, {
    subject,
    body: "Hi {{first_name}},\n\nA short note, in the words of a person.\n\nA Founder",
    list_ids: [listId],
  });
  await engine.testMailing(mailing.id, { to: "founder@walk.example" });
  const detail = engine.mailingDetail(mailing.id, {}) as unknown as {
    audience?: { sendable?: number };
  };
  const sendable = Number(detail.audience?.sendable ?? 0);
  engine.startMailing(mailing.id, { practice: false, confirm: sendable });
  await drain(engine);
  return mailing.id;
}

/** A list of invented people: `First Name,Last Name,Title,Company,Firm Type,City,Country,Email`. */
export function peopleCsv(
  people: readonly {
    email: string;
    first?: string;
    last?: string;
    title?: string;
    company?: string;
  }[],
): string {
  const rows = ["First Name,Last Name,Title,Company,Firm Type,City,Country,Email"];
  for (const person of people)
    rows.push(
      [
        person.first ?? "Asha",
        person.last ?? "Rao",
        person.title ?? "Partner",
        person.company ?? "Walk Fund",
        "Family office",
        "Mumbai",
        "India",
        person.email,
      ].join(","),
    );
  return `${rows.join("\n")}\n`;
}
