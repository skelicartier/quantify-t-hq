/**
 * Mail merge's own files, read and never written: the lists, the record of who real mail
 * reached (`written.jsonl`), the stop list, the mailings and their frozen runs, and the
 * settings (for the from address shown on sent mail). Never `provider.key` or
 * `provider-status.json`.
 *
 * The sender appends to `written.jsonl` as it goes and rewrites the other files whole, so
 * the readers stat before they read and take only new whole lines from the log. A poll
 * every few seconds says what changed. Formats are the engine's (`scripts/mail-merge`);
 * `tests/data/sender-files.test.ts` holds this file to the real engine.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import type { ListColumn, ListRow } from "../mail-merge/lists";
import { render } from "../mail-merge/template";
import { localDay } from "./days";

export type SenderList = {
  id: string;
  name: string;
  file_name: string;
  created_at: string;
  hand: boolean;
  columns: ListColumn[];
  rows: ListRow[];
};

export type Written = { email: string; mailing_id: string; mailing: string; at: string };

export type Stop = {
  email: string;
  reason: "manual" | "asked" | "bounced" | "blocked";
  detail: string;
  at: string;
};

export type SenderMailing = {
  id: string;
  name: string;
  subject: string;
  state: "draft" | "sending" | "paused" | "finished" | "cancelled";
  mode: "live" | "practice" | null;
  run: number;
  list_ids: string[];
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type FrozenMessage = {
  subject: string;
  body: string;
  footer: string;
  from_email: string;
  from_name: string;
  reply_to: string;
};

type Recipient = {
  key: string;
  email: string;
  name: string;
  list_id: string;
  values: Record<string, string>;
};
type RunFile = {
  run: number;
  mode: "live" | "practice";
  message: FrozenMessage;
  recipients: Recipient[];
};
type LogLine = { key: string; state: string; at: string; reason?: string };

export type RunOutcome = {
  message: FrozenMessage;
  recipient: Recipient;
  outcome: { state: "sent" | "unknown"; at: string };
};

/** One message real mail carried to an address, as the sender made it then. */
export type SentMail =
  | {
      mailing_id: string;
      mailing: string;
      at: string;
      state: "sent" | "unknown";
      gone: false;
      from: string;
      reply_to: string;
      to: string;
      subject: string;
      text: string;
    }
  | { mailing_id: string; mailing: string; at: string; state: "sent" | "unknown"; gone: true };

export type SenderSettings = { from_email: string; from_name: string; reply_to: string };

/** What a poll found changed since the last one. */
export type SenderChanges = {
  written: Written[];
  stops: boolean;
  lists: string[];
  mailings: boolean;
};

const RUN_CACHE = 20;

type Signature = string;
const signatureOf = (path: string): Signature => {
  try {
    const stat = statSync(path);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "";
  }
};

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * The whole lines of a log from a byte offset on; a final line without its newline is
 * held back and the offset stops before it. Exported for the test and for callers that
 * want the raw read.
 */
export function readWrittenSince(
  path: string,
  offset: number,
): { lines: Written[]; offset: number } {
  if (!existsSync(path)) return { lines: [], offset: 0 };
  const size = statSync(path).size;
  if (size < offset) return { lines: [], offset: 0 }; // the file was replaced: start over
  if (size === offset) return { lines: [], offset };
  const bytes = readFileSync(path).subarray(offset);
  const lastNewline = bytes.lastIndexOf(0x0a);
  if (lastNewline < 0) return { lines: [], offset };
  const lines: Written[] = [];
  for (const line of bytes
    .subarray(0, lastNewline + 1)
    .toString("utf8")
    .split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as Partial<Written>;
      if (
        typeof parsed.email === "string" &&
        typeof parsed.mailing_id === "string" &&
        typeof parsed.at === "string"
      )
        lines.push({
          email: parsed.email,
          mailing_id: parsed.mailing_id,
          mailing: typeof parsed.mailing === "string" ? parsed.mailing : "",
          at: parsed.at,
        });
    } catch {
      // not a line the sender wrote
    }
  }
  return { lines, offset: offset + lastNewline + 1 };
}

export class SenderFiles {
  readonly dir: string;
  readonly #lists = new Map<string, { signature: Signature; list: SenderList }>();
  readonly #listsSignature = { value: "" };
  readonly #written: Written[] = [];
  readonly #writtenKeys = new Set<string>();
  readonly #writtenByEmail = new Map<string, Written[]>();
  #writtenOffset = 0;
  #stops: Stop[] = [];
  #stopsSet = new Set<string>();
  #stopsSignature: Signature = "";
  #mailings = new Map<string, SenderMailing>();
  #mailingsSignature = "";
  #settings: SenderSettings = { from_email: "", from_name: "", reply_to: "" };
  #settingsSignature: Signature = "";
  readonly #runs = new Map<
    string,
    { signature: Signature; file: RunFile | null; log: Signature; lines: LogLine[] }
  >();
  readonly #listeners = new Set<(changes: SenderChanges) => void>();
  #timer: NodeJS.Timeout | null = null;
  #polling = false;

  constructor(dir: string) {
    this.dir = dir;
    this.poll();
  }

  // ------------------------------------------------------------------ lists

  #listsFolderSignature(): Signature {
    const folder = join(this.dir, "lists");
    if (!existsSync(folder)) return "none";
    return readdirSync(folder)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => `${name}=${signatureOf(join(folder, name))}`)
      .join("|");
  }

  /** Reread the lists whose file changed; returns the ids that changed or went. */
  #refreshLists(): string[] {
    const signature = this.#listsFolderSignature();
    if (signature === this.#listsSignature.value) return [];
    this.#listsSignature.value = signature;
    const folder = join(this.dir, "lists");
    const seen = new Set<string>();
    const changed: string[] = [];
    const names = existsSync(folder)
      ? readdirSync(folder).filter((name) => name.endsWith(".json"))
      : [];
    for (const name of names) {
      const path = join(folder, name);
      const fileSignature = signatureOf(path);
      const id = name.slice(0, -".json".length);
      seen.add(id);
      const known = this.#lists.get(id);
      if (known && known.signature === fileSignature) continue;
      const stored = readJson<Partial<SenderList> & { id?: string }>(path);
      if (!stored || typeof stored.id !== "string") continue;
      this.#lists.set(id, {
        signature: fileSignature,
        list: {
          id: stored.id,
          name: typeof stored.name === "string" ? stored.name : "",
          file_name: typeof stored.file_name === "string" ? stored.file_name : "",
          created_at: typeof stored.created_at === "string" ? stored.created_at : "",
          hand: stored.hand === true,
          columns: Array.isArray(stored.columns) ? stored.columns : [],
          rows: Array.isArray(stored.rows) ? stored.rows : [],
        },
      });
      changed.push(id);
    }
    for (const id of [...this.#lists.keys()]) {
      if (!seen.has(id)) {
        this.#lists.delete(id);
        changed.push(id);
      }
    }
    return changed;
  }

  /** Every list, newest first, rows included. */
  lists(): SenderList[] {
    return [...this.#lists.values()]
      .map((entry) => entry.list)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  list(id: string): SenderList | null {
    return this.#lists.get(id)?.list ?? null;
  }

  listRows(id: string): ListRow[] | null {
    return this.#lists.get(id)?.list.rows ?? null;
  }

  // ------------------------------------------------------------------ the written log

  #refreshWritten(): Written[] {
    const read = readWrittenSince(join(this.dir, "written.jsonl"), this.#writtenOffset);
    if (read.offset < this.#writtenOffset) {
      // The log was replaced (a smaller file): forget and read it whole again.
      this.#written.length = 0;
      this.#writtenKeys.clear();
      this.#writtenByEmail.clear();
      this.#writtenOffset = 0;
      return this.#refreshWritten();
    }
    this.#writtenOffset = read.offset;
    const fresh: Written[] = [];
    for (const line of read.lines) {
      const key = `${line.mailing_id}|${line.email}`;
      if (this.#writtenKeys.has(key)) continue;
      this.#writtenKeys.add(key);
      this.#written.push(line);
      const mine = this.#writtenByEmail.get(line.email);
      if (mine) mine.push(line);
      else this.#writtenByEmail.set(line.email, [line]);
      fresh.push(line);
    }
    return fresh;
  }

  /** Every live send that reached (or may have reached) someone, in the order written. */
  written(): readonly Written[] {
    return this.#written;
  }

  writtenFor(email: string): Written[] {
    return this.#writtenByEmail.get(email) ?? [];
  }

  /** How many live sends on a local day. */
  sentOn(day: string): number {
    let count = 0;
    for (const line of this.#written) if (localDay(line.at) === day) count += 1;
    return count;
  }

  // ------------------------------------------------------------------ the stop list

  #refreshStops(): boolean {
    const path = join(this.dir, "stop-list.json");
    const signature = signatureOf(path);
    if (signature === this.#stopsSignature) return false;
    this.#stopsSignature = signature;
    const stored = signature ? readJson<Stop[]>(path) : [];
    this.#stops = Array.isArray(stored)
      ? stored.filter((stop) => typeof stop?.email === "string")
      : [];
    this.#stopsSet = new Set(this.#stops.map((stop) => stop.email));
    return true;
  }

  stops(): readonly Stop[] {
    return this.#stops;
  }

  stop(email: string): Stop | null {
    return this.#stops.find((stop) => stop.email === email) ?? null;
  }

  isStopped(email: string): boolean {
    return this.#stopsSet.has(email);
  }

  // ------------------------------------------------------------------ mailings and runs

  #mailingsFolderSignature(): Signature {
    const folder = join(this.dir, "mailings");
    if (!existsSync(folder)) return "none";
    return readdirSync(folder)
      .filter((name) => name.endsWith(".json") && !name.includes(".run-"))
      .sort()
      .map((name) => `${name}=${signatureOf(join(folder, name))}`)
      .join("|");
  }

  #refreshMailings(): boolean {
    const signature = this.#mailingsFolderSignature();
    if (signature === this.#mailingsSignature) return false;
    this.#mailingsSignature = signature;
    const folder = join(this.dir, "mailings");
    const next = new Map<string, SenderMailing>();
    const names = existsSync(folder)
      ? readdirSync(folder).filter((name) => name.endsWith(".json") && !name.includes(".run-"))
      : [];
    for (const name of names) {
      const stored = readJson<Partial<SenderMailing>>(join(folder, name));
      if (!stored || typeof stored.id !== "string") continue;
      next.set(stored.id, {
        id: stored.id,
        name: typeof stored.name === "string" ? stored.name : "",
        subject: typeof stored.subject === "string" ? stored.subject : "",
        state: (stored.state as SenderMailing["state"]) ?? "draft",
        mode: stored.mode === "live" || stored.mode === "practice" ? stored.mode : null,
        run: typeof stored.run === "number" ? stored.run : 0,
        list_ids: Array.isArray(stored.list_ids)
          ? stored.list_ids.filter((id) => typeof id === "string")
          : [],
        created_at: typeof stored.created_at === "string" ? stored.created_at : "",
        updated_at: typeof stored.updated_at === "string" ? stored.updated_at : "",
        started_at: typeof stored.started_at === "string" ? stored.started_at : null,
        finished_at: typeof stored.finished_at === "string" ? stored.finished_at : null,
      });
    }
    this.#mailings = next;
    return true;
  }

  mailings(): SenderMailing[] {
    return [...this.#mailings.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  mailing(id: string): SenderMailing | null {
    return this.#mailings.get(id) ?? null;
  }

  /** The mailing now sending, as the sender's status says it. */
  sending(): { mailing_id: string; name: string } | null {
    const going = [...this.#mailings.values()].find((mailing) => mailing.state === "sending");
    return going ? { mailing_id: going.id, name: going.name } : null;
  }

  #run(mailingId: string, run: number): { file: RunFile | null; lines: LogLine[] } {
    const key = `${mailingId}.run-${run}`;
    const jsonPath = join(this.dir, "mailings", `${key}.json`);
    const logPath = join(this.dir, "mailings", `${key}.log`);
    const signature = signatureOf(jsonPath);
    const logSignature = signatureOf(logPath);
    const cached = this.#runs.get(key);
    if (cached && cached.signature === signature && cached.log === logSignature) {
      // Most recently used goes last.
      this.#runs.delete(key);
      this.#runs.set(key, cached);
      return cached;
    }
    const file = signature ? readJson<RunFile>(jsonPath) : null;
    const lines: LogLine[] = [];
    if (logSignature) {
      for (const line of readFileSync(logPath, "utf8").split("\n")) {
        if (!line.trim()) continue;
        try {
          lines.push(JSON.parse(line) as LogLine);
        } catch {
          // a torn last line: that outcome is unknown, and the engine records it so
        }
      }
    }
    const entry = { signature, file, log: logSignature, lines };
    this.#runs.set(key, entry);
    while (this.#runs.size > RUN_CACHE) {
      const oldest = this.#runs.keys().next().value;
      if (oldest === undefined) break;
      this.#runs.delete(oldest);
    }
    return entry;
  }

  /**
   * The frozen message, the recipient and the outcome of the live run that wrote to this
   * address, newest run first; null when no run did; "gone" when the mailing is no more.
   */
  runFor(mailingId: string, email: string): RunOutcome | null | "gone" {
    const mailing = this.#mailings.get(mailingId);
    if (!mailing) return "gone";
    for (let run = mailing.run; run >= 1; run -= 1) {
      const { file, lines } = this.#run(mailingId, run);
      if (!file || file.mode !== "live") continue;
      const recipient = file.recipients.find((item) => item.email === email || item.key === email);
      if (!recipient) continue;
      let outcome: RunOutcome["outcome"] | null = null;
      for (const line of lines) {
        if (line.key !== recipient.key) continue;
        if (line.state === "sent" || line.state === "unknown")
          outcome = { state: line.state, at: line.at };
      }
      if (outcome) return { message: file.message, recipient, outcome };
    }
    return null;
  }

  /** Every message real mail carried to an address, as the sender made it then. */
  sentMail(email: string): SentMail[] {
    return this.writtenFor(email).map((line) => {
      const run = this.runFor(line.mailing_id, email);
      if (run === "gone" || run === null)
        return {
          mailing_id: line.mailing_id,
          mailing: line.mailing,
          at: line.at,
          state: "sent",
          gone: true,
        };
      const rendered = render(run.message, run.recipient.values);
      const { message } = run;
      return {
        mailing_id: line.mailing_id,
        mailing: line.mailing || this.#mailings.get(line.mailing_id)?.name || "",
        at: run.outcome.at || line.at,
        state: run.outcome.state,
        gone: false,
        from: message.from_name
          ? `${message.from_name} <${message.from_email}>`
          : message.from_email,
        reply_to: message.reply_to,
        to: run.recipient.email,
        subject: rendered.subject,
        text: rendered.text,
      };
    });
  }

  // ------------------------------------------------------------------ settings

  #refreshSettings(): void {
    const path = join(this.dir, "settings.json");
    const signature = signatureOf(path);
    if (signature === this.#settingsSignature) return;
    this.#settingsSignature = signature;
    const stored = signature ? readJson<Partial<SenderSettings>>(path) : null;
    this.#settings = {
      from_email: typeof stored?.from_email === "string" ? stored.from_email : "",
      from_name: typeof stored?.from_name === "string" ? stored.from_name : "",
      reply_to: typeof stored?.reply_to === "string" ? stored.reply_to : "",
    };
  }

  settings(): SenderSettings {
    return this.#settings;
  }

  // ------------------------------------------------------------------ the poll

  /** Stat everything, reread what changed, tell the listeners. Cheap when nothing moved. */
  poll(): SenderChanges {
    if (this.#polling) return { written: [], stops: false, lists: [], mailings: false };
    this.#polling = true;
    try {
      const changes: SenderChanges = {
        written: this.#refreshWritten(),
        stops: this.#refreshStops(),
        lists: this.#refreshLists(),
        mailings: this.#refreshMailings(),
      };
      this.#refreshSettings();
      if (changes.written.length || changes.stops || changes.lists.length || changes.mailings)
        for (const listener of this.#listeners) {
          try {
            listener(changes);
          } catch {
            // a listener's fault is its own
          }
        }
      return changes;
    } finally {
      this.#polling = false;
    }
  }

  /** Be told what changed, every `intervalMs`; returns the way to stop listening. */
  watch(listener: (changes: SenderChanges) => void, intervalMs = 5_000): () => void {
    this.#listeners.add(listener);
    if (!this.#timer) {
      this.#timer = setInterval(() => this.poll(), intervalMs);
      this.#timer.unref();
    }
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0 && this.#timer) {
        clearInterval(this.#timer);
        this.#timer = null;
      }
    };
  }

  close(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    this.#listeners.clear();
  }
}
