/**
 * The sender: lists of people, one message made out to each, sent at a pace a person
 * chose, with every recipient accounted for.
 *
 * Rules it keeps whatever is asked of it:
 *   - Nobody is written to twice in one send. Each attempt is written down before the
 *     message goes and its outcome after, so a crash between the two is "may have been
 *     sent", never a second copy.
 *   - Nothing leaves without a live person's press. A send that was running when the
 *     sender stopped comes back paused.
 *   - A send stops itself when it should: at the day's limit, when the provider refuses
 *     the key, when it is not answering, and when too many are failing to be one bad
 *     address.
 *   - Someone on the stop list is never written to, and the reason is kept.
 *   - A practice send goes through every step and sends nothing.
 */

import { createHash, randomUUID } from "node:crypto";

import {
  ImportRefused,
  displayName,
  importCsv,
  normaliseEmail,
  type LeftOut,
  type ListColumn,
  type ListRow,
} from "./lists";
import {
  BrevoProvider,
  PracticeProvider,
  type AccountCheck,
  type MailProvider,
  type SendResult,
  type SenderCheck,
} from "./provider";
import { Store } from "./store";
import { blanksIn, columnKey, fieldsOf, render } from "./template";

export class Refused extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "Refused";
    this.status = status;
    this.code = code;
  }
}

export type Settings = {
  from_email: string;
  from_name: string;
  reply_to: string;
  /** Plain words under every message; fields allowed. */
  footer: string;
  per_minute: number;
  daily_cap: number;
};

/**
 * Thirty a day at two a minute: the pace a new sending domain can hold without landing in
 * spam. Both are settings; a send that needs to go faster says so in Setup.
 */
export const DEFAULT_SETTINGS: Settings = {
  from_email: "",
  from_name: "",
  reply_to: "",
  footer: "",
  per_minute: 2,
  daily_cap: 30,
};

type StoredList = {
  id: string;
  name: string;
  file_name: string;
  created_at: string;
  columns: ListColumn[];
  email_column: string;
  rows: ListRow[];
  left_out: LeftOut[];
  left_out_total: number;
  /** The one list people typed in by hand go on. */
  hand?: boolean;
};

export type StopReason = "manual" | "asked" | "bounced" | "blocked";
type Stop = { email: string; reason: StopReason; detail: string; at: string };

export type MailingState = "draft" | "sending" | "paused" | "finished" | "cancelled";
export type RunMode = "live" | "practice";

type Mailing = {
  id: string;
  name: string;
  subject: string;
  body: string;
  list_ids: string[];
  /** Only the rows where this column reads this value; "" for everyone on the lists. */
  only_column: string;
  only_value: string;
  /** Rows with anything in this column are held back, the words in it as the reason. */
  hold_column: string;
  /** Only the people in `picked`, whatever the column above says; a pick beats a hold. */
  pick_only: boolean;
  picked: string[];
  /** Leave out anyone another mailing has already reached. */
  skip_written: boolean;
  state: MailingState;
  mode: RunMode | null;
  pause_reason: string | null;
  run: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  tested: { at: string; to: string; wording: string } | null;
};

type Recipient = {
  key: string;
  email: string;
  name: string;
  list_id: string;
  values: Record<string, string>;
};

export type OutcomeState = "sent" | "failed" | "skipped" | "unknown";
type Outcome = {
  key: string;
  state: OutcomeState;
  reason: string;
  message_id: string;
  error_code: string;
  at: string;
};
/** `attempting` before a message goes; `withdrawn` when the answer says nothing went. */
type LogLine =
  | Outcome
  | { key: string; state: "attempting"; at: string }
  | { key: string; state: "withdrawn"; at: string };

type FrozenMessage = {
  subject: string;
  body: string;
  footer: string;
  from_email: string;
  from_name: string;
  reply_to: string;
};

type Run = {
  run: number;
  mode: RunMode;
  message: FrozenMessage;
  recipients: Recipient[];
  outcomes: Map<string, Outcome>;
  /** Where the next unsent recipient is no earlier than. */
  cursor: number;
  retries: number;
};

type ProviderStatus = {
  account: AccountCheck | null;
  sender: SenderCheck | null;
  checked_at: string | null;
};

export type Check = {
  key: string;
  ok: boolean;
  blocking: boolean;
  /** Stands in the way of a real send only: a practice run goes without it. */
  live_only: boolean;
  label: string;
};

type Audience = {
  sendable: Recipient[];
  left: { recipient: Recipient; reason: string }[];
  missing: Map<string, number>;
  duplicates: number;
  stopped: number;
  held: number;
  already: number;
};

/** Why someone can or cannot be written to by a mailing. */
type Standing = {
  kind: "ok" | "stopped" | "held" | "written" | "missing";
  reason: string;
  gaps: string[];
};

type Written = { email: string; mailing_id: string; mailing: string; at: string };

export type StepResult =
  "idle" | "sent" | "failed" | "skipped" | "unknown" | "waiting" | "paused" | "finished";

export type EngineOptions = {
  dir: string;
  now?: () => Date;
  /** The provider a live send uses, given the key. Tests hand in their own. */
  liveProvider?: (key: string) => MailProvider;
};

const LIMITS = {
  name: 120,
  subject: 200,
  body: 20_000,
  footer: 1_000,
  key: 200,
  cell: 4_000,
} as const;
/** Words that tell a reader how to stop: an opt-out line, in whichever way it is put. */
const OPT_OUT =
  /unsubscribe|opt[ -]?out|stop hearing|hear from me|not a fit|won.?t follow up|reply .{0,12}\b(no|stop)\b/i;
const PAGE = 100;
const PEOPLE_PAGE = 50;
/** Older files on disk may lack these; a mailing read back has them from here. */
const MAILING_DEFAULTS = { pick_only: false, picked: [] as string[], skip_written: true };
const HAND_LIST = "Added by hand";
const BREAKER_WINDOW = 20;
const BREAKER_FAILURES = 5;
const MAX_RETRIES = 3;
/** Refusals that are about the account, not the person: stop, and write to nobody else. */
const ACCOUNT_REFUSALS: Record<string, string> = {
  not_enough_credits: "The provider says the plan has no sends left. Resume when it has.",
  account_under_validation:
    "The provider has not switched sending on for this account yet. Resume when it has.",
  permission_denied: "The provider does not let this key send. Check it in Setup, then resume.",
  unauthorized: "The provider did not accept the key. Check it in Setup, then resume.",
};

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString("en-GB")} ${count === 1 ? one : many}`;
}

function clean(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

export class MergeEngine {
  readonly #store: Store;
  readonly #now: () => Date;
  readonly #liveProvider: (key: string) => MailProvider;
  readonly #practice: PracticeProvider;
  #settings: Settings;
  #key: string;
  #provider: ProviderStatus;
  readonly #lists = new Map<string, StoredList>();
  readonly #mailings = new Map<string, Mailing>();
  readonly #runs = new Map<string, Run>();
  readonly #stops = new Map<string, Stop>();
  readonly #sentByDay = new Map<string, number>();
  /**
   * Who has been written to, by which mailings. Its own file, written as each message
   * goes: a mailing can be deleted, and neither the day's count nor "already written to"
   * may be deleted with it.
   */
  readonly #written = new Map<string, Written[]>();
  readonly #writtenKeys = new Set<string>();
  #retryAt = 0;
  #looping = false;

  constructor(options: EngineOptions) {
    this.#store = new Store(options.dir);
    this.#now = options.now ?? (() => new Date());
    this.#liveProvider = options.liveProvider ?? ((key) => new BrevoProvider(key));
    this.#practice = new PracticeProvider(this.#store.path("practice-outbox.jsonl"));
    this.#settings = { ...DEFAULT_SETTINGS, ...this.#store.readJson("settings.json", {}) };
    this.#key = this.#store.readText("provider.key").trim();
    this.#provider = this.#store.readJson<ProviderStatus>("provider-status.json", {
      account: null,
      sender: null,
      checked_at: null,
    });
    for (const stop of this.#store.readJson<Stop[]>("stop-list.json", []))
      this.#stops.set(stop.email, stop);
    for (const id of this.#store.list("lists", ".json")) {
      const list = this.#store.readJson<StoredList | null>(`lists/${id}.json`, null);
      if (list) this.#lists.set(list.id, list);
    }
    for (const line of this.#store.readLines<{ at: string }>("tests.jsonl")) this.#count(line.at);
    for (const line of this.#store.readLines<Written>("written.jsonl")) this.#learn(line);
    for (const name of this.#store.list("mailings", ".json")) {
      if (name.includes(".run-")) continue;
      const stored = this.#store.readJson<Mailing | null>(`mailings/${name}.json`, null);
      if (!stored) continue;
      const mailing: Mailing = { ...MAILING_DEFAULTS, ...stored };
      this.#mailings.set(mailing.id, mailing);
      if (mailing.run > 0) this.#loadRun(mailing);
      if (mailing.state === "sending") {
        // Nothing leaves without a live press: what was running comes back paused.
        mailing.state = "paused";
        mailing.pause_reason =
          "The sender was restarted. Nobody was written to twice; press Resume to carry on.";
        this.#saveMailing(mailing);
      }
    }
  }

  // ------------------------------------------------------------------ small helpers

  #stamp(): string {
    return this.#now().toISOString();
  }

  /** The person's own day: the limit is "a day" as they live it, not a UTC one. */
  #day(at: Date | string = this.#now()): string {
    const moment = typeof at === "string" ? new Date(at) : at;
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`;
  }

  #count(at: string): void {
    const day = this.#day(at);
    this.#sentByDay.set(day, (this.#sentByDay.get(day) ?? 0) + 1);
  }

  #sentToday(): number {
    return this.#sentByDay.get(this.#day()) ?? 0;
  }

  #saveMailing(mailing: Mailing): void {
    this.#store.writeJson(`mailings/${mailing.id}.json`, mailing);
  }

  #saveStops(): void {
    this.#store.writeJson("stop-list.json", [...this.#stops.values()]);
  }

  #runFile(mailing: Mailing, ending: string): string {
    return `mailings/${mailing.id}.run-${mailing.run}.${ending}`;
  }

  #loadRun(mailing: Mailing): void {
    const frozen = this.#store.readJson<Pick<
      Run,
      "run" | "mode" | "message" | "recipients"
    > | null>(this.#runFile(mailing, "json"), null);
    if (!frozen) return;
    const run: Run = { ...frozen, outcomes: new Map(), cursor: 0, retries: 0 };
    const attempting = new Map<string, string>();
    for (const line of this.#store.readLines<LogLine>(this.#runFile(mailing, "log"))) {
      if (line.state === "attempting") {
        attempting.set(line.key, line.at);
        continue;
      }
      if (line.state === "withdrawn") {
        attempting.delete(line.key);
        continue;
      }
      attempting.delete(line.key);
      run.outcomes.set(line.key, line);
      // A crash between the log and the record: the log is the older of the two.
      if (run.mode === "live" && (line.state === "sent" || line.state === "unknown"))
        this.#remember(line.key, mailing, line.at);
    }
    for (const [key, at] of attempting) {
      // The sender stopped between "going out" and the answer. Never a second copy.
      const outcome: Outcome = {
        key,
        state: "unknown",
        reason: "The sender stopped while this one was going out. It may have been sent.",
        message_id: "",
        error_code: "interrupted",
        at,
      };
      run.outcomes.set(key, outcome);
      this.#store.appendLine(this.#runFile(mailing, "log"), outcome);
      if (run.mode === "live") this.#remember(key, mailing, at);
    }
    this.#runs.set(mailing.id, run);
  }

  #learn(line: Written): void {
    const key = `${line.mailing_id}|${line.email}`;
    if (this.#writtenKeys.has(key)) return;
    this.#writtenKeys.add(key);
    this.#written.set(line.email, [...(this.#written.get(line.email) ?? []), line]);
    this.#count(line.at);
  }

  /** Real mail went to this address, or may have: written down once, and counted. */
  #remember(email: string, mailing: Mailing, at: string): void {
    if (this.#writtenKeys.has(`${mailing.id}|${email}`)) return;
    const line: Written = { email, mailing_id: mailing.id, mailing: mailing.name, at };
    this.#store.appendLine("written.jsonl", line);
    this.#learn(line);
  }

  /** The name of another mailing that reached this address, if one did. */
  #reachedBy(email: string, mailing: Mailing): string | null {
    return (
      (this.#written.get(email) ?? []).find((line) => line.mailing_id !== mailing.id)?.mailing ??
      null
    );
  }

  #mailing(id: string): Mailing {
    const mailing = this.#mailings.get(id);
    if (!mailing) throw new Refused(404, "not_found", "That mailing is no longer here.");
    return mailing;
  }

  #list(id: string): StoredList {
    const list = this.#lists.get(id);
    if (!list) throw new Refused(404, "not_found", "That list is no longer here.");
    return list;
  }

  #wording(mailing: Mailing): string {
    return createHash("sha256")
      .update(
        [mailing.subject, mailing.body, this.#settings.footer, this.#settings.from_email].join(
          "\u0000",
        ),
      )
      .digest("hex");
  }

  /** May its words still be changed? Not once real mail has gone out under them. */
  #editable(mailing: Mailing): boolean {
    if (mailing.state === "draft") return true;
    return (
      (mailing.state === "finished" || mailing.state === "cancelled") && mailing.mode === "practice"
    );
  }

  #senderVerified(): boolean {
    const sender = this.#provider.sender;
    return Boolean(
      sender &&
      sender.status === "ok" &&
      sender.sender_known &&
      sender.sender_active &&
      sender.domain_authenticated,
    );
  }

  // ------------------------------------------------------------------ setup

  status() {
    const sending = [...this.#mailings.values()].find((mailing) => mailing.state === "sending");
    return {
      provider: {
        key_set: this.#key !== "",
        key_hint: this.#key ? this.#key.slice(-4) : "",
        account: this.#provider.account,
        sender: this.#provider.sender,
        sender_verified: this.#senderVerified(),
        checked_at: this.#provider.checked_at,
      },
      settings: this.#settings,
      sent_today: this.#sentToday(),
      sending: sending ? { mailing_id: sending.id, name: sending.name } : null,
      counts: {
        lists: this.#lists.size,
        people: [...this.#lists.values()].reduce((sum, list) => sum + list.rows.length, 0),
        mailings: this.#mailings.size,
        stopped: this.#stops.size,
      },
    };
  }

  async #check(): Promise<void> {
    const provider = this.#liveProvider(this.#key);
    const account = await provider.checkAccount();
    const sender = this.#settings.from_email
      ? await provider.checkSender(this.#settings.from_email)
      : null;
    this.#provider = { account, sender, checked_at: this.#stamp() };
    this.#store.writeJson("provider-status.json", this.#provider);
  }

  async setKey(input: { key?: unknown }) {
    const key = typeof input.key === "string" ? input.key.trim() : "";
    if (!key || key.length > LIMITS.key || /\s/.test(key))
      throw new Refused(400, "key_malformed", "That does not look like a provider key.");
    // The provider hands out two kinds, side by side, and only one sends by program.
    if (key.startsWith("xsmtpsib-"))
      throw new Refused(
        400,
        "key_wrong_kind",
        "That is the SMTP key. Mail merge needs an API key: under SMTP & API, the API keys tab. It starts xkeysib-.",
      );
    const account = await this.#liveProvider(key).checkAccount();
    if (account.status === "auth_failed")
      throw new Refused(
        400,
        "key_refused",
        "The provider did not accept that key, so nothing was saved. Check it was copied whole. If it was, the provider may be refusing this computer's address: allow it under Security, Authorised IPs, in its account.",
      );
    if (account.status !== "ok")
      throw new Refused(
        503,
        "provider_unreachable",
        "The provider could not be reached to check the key. Nothing was saved; try again.",
      );
    this.#key = key;
    this.#store.writeSecret("provider.key", key);
    await this.#check();
    return this.status();
  }

  clearKey() {
    if ([...this.#mailings.values()].some((m) => m.state === "sending" && m.mode === "live"))
      throw new Refused(409, "sending", "A mailing is sending. Pause it before removing the key.");
    this.#key = "";
    this.#store.remove("provider.key");
    this.#provider = { account: null, sender: null, checked_at: null };
    this.#store.writeJson("provider-status.json", this.#provider);
    return this.status();
  }

  async checkProvider() {
    if (!this.#key) throw new Refused(409, "no_key", "There is no provider key to check.");
    await this.#check();
    return this.status();
  }

  saveSettings(input: Record<string, unknown>) {
    const next: Settings = { ...this.#settings };
    if ("from_email" in input) {
      const raw = clean(input.from_email, 254);
      const email = raw ? normaliseEmail(raw) : "";
      if (raw && !email)
        throw new Refused(400, "invalid", "The sender address is not an email address.");
      next.from_email = email;
    }
    if ("reply_to" in input) {
      const raw = clean(input.reply_to, 254);
      const email = raw ? normaliseEmail(raw) : "";
      if (raw && !email)
        throw new Refused(400, "invalid", "The reply address is not an email address.");
      next.reply_to = email;
    }
    if ("from_name" in input) next.from_name = clean(input.from_name, 80);
    if ("footer" in input) next.footer = clean(input.footer, LIMITS.footer);
    for (const [name, low, high] of [
      ["per_minute", 1, 60],
      ["daily_cap", 1, 100_000],
    ] as const) {
      if (!(name in input)) continue;
      const value = Number(input[name]);
      if (!Number.isInteger(value) || value < low || value > high)
        throw new Refused(
          400,
          "invalid",
          name === "per_minute"
            ? "The pace is a whole number from 1 to 60 a minute."
            : "The day's limit is a whole number from 1 to 100,000.",
        );
      next[name] = value;
    }
    if (next.from_email !== this.#settings.from_email && this.#provider.sender) {
      // The provider's word was about the old address.
      this.#provider = { ...this.#provider, sender: null };
      this.#store.writeJson("provider-status.json", this.#provider);
    }
    this.#settings = next;
    this.#store.writeJson("settings.json", next);
    return this.status();
  }

  // ------------------------------------------------------------------ lists

  #listSummary(list: StoredList) {
    return {
      id: list.id,
      name: list.name,
      file_name: list.file_name,
      created_at: list.created_at,
      people: list.rows.length,
      left_out: list.left_out_total,
      email_column: list.email_column,
      columns: list.columns,
    };
  }

  lists() {
    return {
      lists: [...this.#lists.values()]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((list) => this.#listSummary(list)),
    };
  }

  importList(input: { name?: unknown; file_name?: unknown; text?: unknown }) {
    const fileName = clean(input.file_name, 200);
    const name = clean(input.name, LIMITS.name) || fileName.replace(/\.[A-Za-z0-9]+$/, "");
    if (!name) throw new Refused(400, "invalid", "Give the list a name.");
    if (typeof input.text !== "string" || !input.text.trim())
      throw new Refused(400, "invalid", "The file is empty.");
    let imported;
    try {
      imported = importCsv(input.text);
    } catch (error) {
      if (error instanceof ImportRefused) throw new Refused(400, "file_refused", error.message);
      throw error;
    }
    const list: StoredList = {
      id: randomUUID(),
      name,
      file_name: fileName,
      created_at: this.#stamp(),
      columns: imported.columns,
      email_column: imported.email_column,
      rows: imported.rows,
      // Enough to see what went wrong; the count is kept whole.
      left_out: imported.left_out.slice(0, 1_000),
      left_out_total: imported.left_out.length,
    };
    this.#lists.set(list.id, list);
    this.#store.writeJson(`lists/${list.id}.json`, list);
    return { list: this.#listSummary(list), left_out: list.left_out.slice(0, 50) };
  }

  listDetail(id: string, query: { offset?: number; q?: string; row?: string }) {
    const list = this.#list(id);
    const offset = Math.max(0, Math.trunc(query.offset ?? 0));
    const needle = (query.q ?? "").trim().toLowerCase().slice(0, 200);
    const matching = needle
      ? list.rows.filter((row) =>
          `${row.email} ${row.name} ${Object.values(row.values).join(" ")}`
            .toLowerCase()
            .includes(needle),
        )
      : list.rows;
    const view = (row: ListRow) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      values: row.values,
      stopped: this.#stops.has(row.email),
    });
    const editing = query.row ? list.rows.find((row) => row.id === query.row) : undefined;
    return {
      list: this.#listSummary(list),
      rows: matching.slice(offset, offset + PAGE).map(view),
      offset,
      limit: PAGE,
      total: matching.length,
      left_out: list.left_out.slice(0, 200),
      used_by: [...this.#mailings.values()]
        .filter((mailing) => mailing.list_ids.includes(id))
        .map((mailing) => ({ id: mailing.id, name: mailing.name, state: mailing.state })),
      editing: editing ? view(editing) : null,
    };
  }

  renameList(id: string, input: { name?: unknown }) {
    const list = this.#list(id);
    const name = clean(input.name, LIMITS.name);
    if (!name) throw new Refused(400, "invalid", "Give the list a name.");
    list.name = name;
    this.#store.writeJson(`lists/${list.id}.json`, list);
    return { list: this.#listSummary(list) };
  }

  deleteList(id: string) {
    const list = this.#list(id);
    const busy = [...this.#mailings.values()].find(
      (mailing) =>
        mailing.list_ids.includes(id) &&
        (mailing.state === "sending" || mailing.state === "paused"),
    );
    if (busy)
      throw new Refused(
        409,
        "in_use",
        `"${busy.name}" is part-way through sending to this list. Finish or cancel it first.`,
      );
    for (const mailing of this.#mailings.values()) {
      if (mailing.state !== "draft" || !mailing.list_ids.includes(id)) continue;
      mailing.list_ids = mailing.list_ids.filter((listId) => listId !== id);
      mailing.updated_at = this.#stamp();
      this.#saveMailing(mailing);
    }
    this.#lists.delete(id);
    this.#store.remove(`lists/${id}.json`);
    return { deleted: list.name };
  }

  #saveList(list: StoredList): void {
    this.#store.writeJson(`lists/${list.id}.json`, list);
  }

  /** Never reuses a removed row's id: a link to it must not open someone else. */
  #nextRowId(list: StoredList): string {
    const highest = list.rows.reduce(
      (top, row) => Math.max(top, Number.parseInt(row.id.slice(1), 10) || 0),
      0,
    );
    return `r${highest + 1}`;
  }

  /** Words typed for a person, under the list's own keys. */
  #cleanValues(input: unknown): Record<string, string> {
    const values: Record<string, string> = {};
    if (!input || typeof input !== "object" || Array.isArray(input)) return values;
    for (const [name, value] of Object.entries(input as Record<string, unknown>)) {
      const key = columnKey(name);
      if (key && key !== "email") values[key] = clean(value, LIMITS.cell);
    }
    return values;
  }

  /** Every column a row names is a column of its list, or a message could not use it. */
  #ensureColumns(list: StoredList, keys: Iterable<string>, labels: Map<string, string>): void {
    for (const key of keys) {
      if (list.columns.some((column) => column.key === key)) continue;
      list.columns.push({ key, label: labels.get(key) ?? key.replace(/_/g, " ") });
    }
  }

  addRow(listId: string, input: { email?: unknown; values?: unknown }) {
    const list = this.#list(listId);
    const email = normaliseEmail(clean(input.email, 254));
    if (!email) throw new Refused(400, "invalid", "That is not an email address.");
    if (list.rows.some((row) => row.email === email))
      throw new Refused(409, "already_on_list", `${email} is already on this list.`);
    const values = { ...this.#cleanValues(input.values), email };
    this.#ensureColumns(list, Object.keys(values), new Map([["email", "Email"]]));
    const row: ListRow = {
      id: this.#nextRowId(list),
      email,
      name: displayName(values),
      values,
    };
    list.rows.push(row);
    this.#saveList(list);
    return { list: this.#listSummary(list), row_id: row.id };
  }

  /**
   * One person's words, changed where they sit. A send already going has its own copy
   * and is not touched: this reaches drafts, and what is sent from here on.
   */
  updateRow(listId: string, rowId: string, input: { email?: unknown; values?: unknown }) {
    const list = this.#list(listId);
    const row = list.rows.find((item) => item.id === rowId);
    if (!row) throw new Refused(404, "not_found", "That person is no longer on the list.");
    const email = "email" in input ? normaliseEmail(clean(input.email, 254)) : row.email;
    if (!email) throw new Refused(400, "invalid", "That is not an email address.");
    if (email !== row.email && list.rows.some((item) => item.email === email))
      throw new Refused(409, "already_on_list", `${email} is already on this list.`);
    const before = row.email;
    row.values = { ...row.values, ...this.#cleanValues(input.values), email };
    row.email = email;
    row.name = displayName(row.values);
    this.#saveList(list);
    if (email !== before) {
      for (const mailing of this.#mailings.values()) {
        if (!mailing.picked.includes(before)) continue;
        mailing.picked = mailing.picked.map((item) => (item === before ? email : item));
        this.#saveMailing(mailing);
      }
    }
    return { list: this.#listSummary(list) };
  }

  removeRow(listId: string, rowId: string) {
    const list = this.#list(listId);
    const before = list.rows.length;
    list.rows = list.rows.filter((row) => row.id !== rowId);
    if (list.rows.length === before)
      throw new Refused(404, "not_found", "That person is no longer on the list.");
    this.#store.writeJson(`lists/${list.id}.json`, list);
    return { list: this.#listSummary(list) };
  }

  // ------------------------------------------------------------------ the stop list

  stops(query: { offset?: number }) {
    const offset = Math.max(0, Math.trunc(query.offset ?? 0));
    const all = [...this.#stops.values()].sort((a, b) => b.at.localeCompare(a.at));
    return { stops: all.slice(offset, offset + PAGE), offset, limit: PAGE, total: all.length };
  }

  addStops(input: { emails?: unknown; reason?: unknown }) {
    const text = typeof input.emails === "string" ? input.emails : "";
    const reason: StopReason = input.reason === "asked" ? "asked" : "manual";
    let added = 0;
    let already = 0;
    const refused: string[] = [];
    for (const piece of text.split(/[\s,;]+/).filter(Boolean)) {
      const email = normaliseEmail(piece);
      if (!email) {
        if (refused.length < 20) refused.push(piece.slice(0, 80));
        continue;
      }
      if (this.#stops.has(email)) {
        already += 1;
        continue;
      }
      this.#stops.set(email, { email, reason, detail: "", at: this.#stamp() });
      added += 1;
    }
    if (added > 0) this.#saveStops();
    return { added, already, refused };
  }

  removeStop(input: { email?: unknown }) {
    const email = normaliseEmail(clean(input.email, 254));
    if (!email || !this.#stops.delete(email))
      throw new Refused(404, "not_found", "That address is not on the stop list.");
    this.#saveStops();
    return { removed: email };
  }

  /** Addresses the provider itself will not mail: bounces, people who asked it to stop. */
  async syncStops() {
    if (!this.#key) throw new Refused(409, "no_key", "There is no provider key to ask with.");
    const blocked = await this.#liveProvider(this.#key).listBlocked(1_000);
    let added = 0;
    for (const item of blocked) {
      const email = normaliseEmail(item.email);
      if (!email || this.#stops.has(email)) continue;
      const code = item.reason.toLowerCase();
      const reason: StopReason = code.includes("bounce")
        ? "bounced"
        : code.includes("unsubscribe") || code.includes("spam")
          ? "asked"
          : "blocked";
      this.#stops.set(email, {
        email,
        reason,
        detail: item.reason.slice(0, 60),
        at: item.blocked_at || this.#stamp(),
      });
      added += 1;
    }
    if (added > 0) this.#saveStops();
    return { added, seen: blocked.length };
  }

  // ------------------------------------------------------------------ mailings

  /** Who a mailing would write to as things stand, and who it would leave out and why. */
  #matchesOnly(mailing: Mailing, row: ListRow, onlyValue: string): boolean {
    if (!mailing.only_column) return true;
    return (row.values[mailing.only_column] ?? "").trim().toLowerCase() === onlyValue;
  }

  /** The one place that says who may be written to, in the order that matters. */
  #standing(
    mailing: Mailing,
    row: ListRow,
    message: { subject: string; body: string; footer: string },
    picked: boolean,
  ): Standing {
    const none = { reason: "", gaps: [] };
    // Nothing overrides the stop list: not a pick, not a list, not a hand-typed address.
    if (this.#stops.has(row.email)) return { ...none, kind: "stopped", reason: "On the stop list" };
    // Someone picked by name was looked at by a person; a hold is for those who were not.
    const hold = mailing.hold_column ? (row.values[mailing.hold_column] ?? "").trim() : "";
    if (hold && !(mailing.pick_only && picked))
      return { ...none, kind: "held", reason: `Held back: ${hold}`.slice(0, 240) };
    const earlier = mailing.skip_written ? this.#reachedBy(row.email, mailing) : null;
    if (earlier) return { ...none, kind: "written", reason: `Already written to by "${earlier}"` };
    const gaps = render(message, row.values).missing;
    if (gaps.length > 0) return { kind: "missing", reason: `Nothing for ${gaps.join(", ")}`, gaps };
    return { ...none, kind: "ok" };
  }

  #audience(mailing: Mailing): Audience {
    const message = {
      subject: mailing.subject,
      body: mailing.body,
      footer: this.#settings.footer,
    };
    const sendable: Recipient[] = [];
    const left: { recipient: Recipient; reason: string }[] = [];
    const missing = new Map<string, number>();
    const seen = new Set<string>();
    let duplicates = 0;
    let stopped = 0;
    let held = 0;
    let already = 0;
    const picked = new Set(mailing.picked);
    const onlyValue = mailing.only_value.trim().toLowerCase();
    for (const listId of mailing.list_ids) {
      const list = this.#lists.get(listId);
      if (!list) continue;
      for (const row of list.rows) {
        // Not this mailing's people at all: they are not "left out" of it.
        if (
          mailing.pick_only ? !picked.has(row.email) : !this.#matchesOnly(mailing, row, onlyValue)
        )
          continue;
        if (seen.has(row.email)) {
          duplicates += 1;
          continue;
        }
        seen.add(row.email);
        const recipient: Recipient = {
          key: row.email,
          email: row.email,
          name: row.name,
          list_id: list.id,
          values: row.values,
        };
        const standing = this.#standing(mailing, row, message, picked.has(row.email));
        if (standing.kind === "ok") {
          sendable.push(recipient);
          continue;
        }
        left.push({ recipient, reason: standing.reason });
        if (standing.kind === "stopped") stopped += 1;
        if (standing.kind === "held") held += 1;
        if (standing.kind === "written") already += 1;
        for (const field of standing.gaps) missing.set(field, (missing.get(field) ?? 0) + 1);
      }
    }
    return { sendable, left, missing, duplicates, stopped, held, already };
  }

  #fields(mailing: Mailing) {
    const lists = mailing.list_ids
      .map((id) => this.#lists.get(id))
      .filter((list): list is StoredList => list !== undefined);
    const known = new Map<string, { key: string; label: string; in_all: boolean }>();
    for (const list of lists) {
      for (const column of list.columns) {
        if (!known.has(column.key))
          known.set(column.key, { key: column.key, label: column.label, in_all: true });
      }
    }
    for (const field of known.values())
      field.in_all = lists.every((list) => list.columns.some((column) => column.key === field.key));
    return [...known.values()];
  }

  #checks(mailing: Mailing, audience: Audience): Check[] {
    const checks: Check[] = [];
    const add = (key: string, ok: boolean, blocking: boolean, label: string, liveOnly = false) =>
      checks.push({ key, ok, blocking, live_only: liveOnly, label });
    const written = mailing.subject.trim() !== "" && mailing.body.trim() !== "";
    add(
      "wording",
      written,
      true,
      written ? "A subject and a message are written" : "Write a subject and a message",
    );
    const blanks = blanksIn(mailing.subject, mailing.body, this.#settings.footer);
    if (written)
      add(
        "blanks",
        blanks.length === 0,
        true,
        blanks.length === 0
          ? "No blanks are left in the words"
          : `Fill in ${blanks.join(" and ")}: it would go out as it stands`,
        true,
      );
    if (written && !OPT_OUT.test(`${mailing.body}\n${this.#settings.footer}`))
      add(
        "opt_out",
        false,
        false,
        "Nothing says how to stop hearing from you. A line such as: if this isn't a fit, reply \"no\" and I won't follow up",
      );
    const lists = mailing.list_ids.filter((id) => this.#lists.has(id)).length;
    add(
      "lists",
      lists > 0,
      true,
      lists > 0 ? `${plural(lists, "list")} chosen` : "Choose who it goes to",
    );
    const known = new Set(this.#fields(mailing).map((field) => field.key));
    const unknown = fieldsOf(mailing.subject, mailing.body, this.#settings.footer)
      .map((field) => field.key)
      .filter((key) => !known.has(key));
    if (lists > 0)
      add(
        "fields",
        unknown.length === 0,
        true,
        unknown.length === 0
          ? "Every field is a column of the lists"
          : `${unknown.map((key) => `{{${key}}}`).join(", ")} ${unknown.length === 1 ? "is not a column" : "are not columns"} of the lists chosen`,
      );
    if (lists > 0)
      add(
        "audience",
        audience.sendable.length > 0,
        true,
        audience.sendable.length > 0
          ? `${plural(audience.sendable.length, "person", "people")} will be written to`
          : mailing.pick_only && mailing.picked.length === 0
            ? "Pick the people it goes to"
            : "Nobody on the lists chosen can be written to",
      );
    const from = this.#settings.from_email;
    add(
      "sender",
      from !== "",
      true,
      from
        ? `Sent as ${this.#settings.from_name ? `${this.#settings.from_name} ` : ""}<${from}>`
        : "Say who it is from, in Setup",
      true,
    );
    const account = this.#provider.account;
    add(
      "key",
      this.#key !== "" && account?.status === "ok",
      true,
      this.#key === ""
        ? "Add the provider key in Setup to send for real"
        : account?.status === "auth_failed"
          ? "The provider refuses the key: put it right in Setup"
          : account?.status === "ok"
            ? "The provider accepts the key"
            : "Check the key with the provider, in Setup",
      true,
    );
    const sender = this.#provider.sender;
    if (this.#key !== "" && from !== "") {
      if (sender?.status === "ok")
        add(
          "sender_verified",
          this.#senderVerified(),
          true,
          this.#senderVerified()
            ? "The provider has verified the sender address and its domain"
            : !sender.sender_known || !sender.sender_active
              ? `The provider does not know ${from} as a sender yet: add and confirm it there`
              : `The provider has not authenticated ${sender.domain}: its mail would land in spam`,
          true,
        );
      else
        add(
          "sender_verified",
          false,
          true,
          "The sender has not been checked with the provider: press Check again in Setup",
          true,
        );
    }
    const tested = mailing.tested !== null && mailing.tested.wording === this.#wording(mailing);
    add(
      "test",
      tested,
      true,
      tested
        ? `A test of this wording went to ${mailing.tested!.to}`
        : mailing.tested
          ? "The wording changed since the test: send yourself another"
          : "Send yourself a test of this wording",
      true,
    );
    if (audience.held > 0)
      add(
        "held",
        false,
        false,
        `${plural(audience.held, "person is", "people are")} held back by ${mailing.hold_column} and left out`,
      );
    if (audience.already > 0)
      add(
        "already_left_out",
        false,
        false,
        `${plural(audience.already, "person was", "people were")} already written to by another mailing and left out`,
      );
    const again = audience.sendable
      .map((recipient) => this.#reachedBy(recipient.key, mailing))
      .filter((name): name is string => name !== null);
    if (again.length > 0)
      add(
        "already_written",
        false,
        false,
        `${plural(again.length, "person was", "people were")} already written to by "${again[0]}"${new Set(again).size > 1 ? " or another mailing" : ""}, and will be written to again`,
      );
    if (audience.stopped > 0)
      add(
        "stopped",
        false,
        false,
        `${plural(audience.stopped, "person is", "people are")} on the stop list and left out`,
      );
    for (const [field, count] of audience.missing)
      add(
        `missing_${field}`,
        false,
        false,
        `${plural(count, "person has", "people have")} nothing for ${field} and are left out. A fallback keeps them: {{${field}|there}}`,
      );
    if (audience.duplicates > 0)
      add(
        "duplicates",
        false,
        false,
        `${plural(audience.duplicates, "address is", "addresses are")} on more than one list and get one message`,
      );
    const room = Math.max(0, this.#settings.daily_cap - this.#sentToday());
    if (audience.sendable.length > room) {
      const days = Math.ceil((audience.sendable.length - room) / this.#settings.daily_cap) + 1;
      add(
        "pace",
        false,
        false,
        `At ${this.#settings.daily_cap.toLocaleString("en-GB")} a day this takes ${days} days. It stops at each day's limit and waits for you to resume`,
      );
    }
    return checks;
  }

  #progress(mailing: Mailing) {
    const run = this.#runs.get(mailing.id);
    const counts = {
      total: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      unknown: 0,
      waiting: 0,
      stopped_since: 0,
    };
    if (!run) return counts;
    counts.total = run.recipients.length;
    for (const recipient of run.recipients) {
      const outcome = run.outcomes.get(recipient.key);
      if (!outcome) {
        counts.waiting += 1;
        continue;
      }
      counts[outcome.state] += 1;
      const stop = this.#stops.get(recipient.key);
      if (outcome.state === "sent" && stop && stop.at > outcome.at) counts.stopped_since += 1;
    }
    return counts;
  }

  #mailingSummary(mailing: Mailing) {
    return {
      id: mailing.id,
      name: mailing.name,
      subject: mailing.subject,
      state: mailing.state,
      mode: mailing.mode,
      pause_reason: mailing.pause_reason,
      lists: mailing.list_ids
        .map((id) => this.#lists.get(id))
        .filter((list): list is StoredList => list !== undefined)
        .map((list) => ({ id: list.id, name: list.name, people: list.rows.length })),
      progress: this.#progress(mailing),
      created_at: mailing.created_at,
      updated_at: mailing.updated_at,
      started_at: mailing.started_at,
      finished_at: mailing.finished_at,
      editable: this.#editable(mailing),
    };
  }

  mailings() {
    return {
      mailings: [...this.#mailings.values()]
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map((mailing) => this.#mailingSummary(mailing)),
    };
  }

  createMailing(input: { name?: unknown }) {
    const name = clean(input.name, LIMITS.name);
    if (!name) throw new Refused(400, "invalid", "Give the mailing a name.");
    const stamp = this.#stamp();
    const mailing: Mailing = {
      id: randomUUID(),
      name,
      subject: "",
      body: "",
      list_ids: [],
      only_column: "",
      only_value: "",
      hold_column: "",
      ...MAILING_DEFAULTS,
      picked: [],
      state: "draft",
      mode: null,
      pause_reason: null,
      run: 0,
      created_at: stamp,
      updated_at: stamp,
      started_at: null,
      finished_at: null,
      tested: null,
    };
    this.#mailings.set(mailing.id, mailing);
    this.#saveMailing(mailing);
    return { mailing: this.#mailingSummary(mailing) };
  }

  duplicateMailing(id: string) {
    const from = this.#mailing(id);
    const stamp = this.#stamp();
    const mailing: Mailing = {
      ...from,
      id: randomUUID(),
      name: `${from.name} (copy)`.slice(0, LIMITS.name),
      list_ids: from.list_ids.filter((listId) => this.#lists.has(listId)),
      picked: [...from.picked],
      state: "draft",
      mode: null,
      pause_reason: null,
      run: 0,
      created_at: stamp,
      updated_at: stamp,
      started_at: null,
      finished_at: null,
      tested: null,
    };
    this.#mailings.set(mailing.id, mailing);
    this.#saveMailing(mailing);
    return { mailing: this.#mailingSummary(mailing) };
  }

  updateMailing(id: string, input: Record<string, unknown>) {
    const mailing = this.#mailing(id);
    if (!this.#editable(mailing))
      throw new Refused(
        409,
        "not_editable",
        mailing.state === "sending" || mailing.state === "paused"
          ? "This mailing is part-way through. Cancel it to change it, or make a copy."
          : "Mail has gone out under these words. Make a copy to write to people again.",
      );
    if ("name" in input) {
      const name = clean(input.name, LIMITS.name);
      if (!name) throw new Refused(400, "invalid", "Give the mailing a name.");
      mailing.name = name;
    }
    if ("subject" in input) mailing.subject = clean(input.subject, LIMITS.subject);
    if ("body" in input) {
      if (typeof input.body === "string" && input.body.length > LIMITS.body)
        throw new Refused(400, "invalid", "The message is too long.");
      mailing.body =
        typeof input.body === "string" ? input.body.replace(/\r\n?/g, "\n").trim() : "";
    }
    if ("list_ids" in input) {
      const ids = Array.isArray(input.list_ids) ? input.list_ids.map(String) : [];
      mailing.list_ids = [...new Set(ids)].filter((listId) => this.#lists.has(listId));
    }
    if ("only_column" in input) mailing.only_column = clean(input.only_column, 60);
    if ("only_value" in input) mailing.only_value = clean(input.only_value, 200);
    if ("hold_column" in input) mailing.hold_column = clean(input.hold_column, 60);
    if ("pick_only" in input) mailing.pick_only = input.pick_only === true;
    if ("skip_written" in input) mailing.skip_written = input.skip_written === true;
    if (!mailing.pick_only && mailing.only_column && !mailing.only_value)
      throw new Refused(400, "invalid", `Say which ${mailing.only_column} this mailing is for.`);
    // A practice run is behind it: the words are a draft again.
    mailing.state = "draft";
    mailing.pause_reason = null;
    mailing.updated_at = this.#stamp();
    this.#saveMailing(mailing);
    return { mailing: this.#mailingSummary(mailing) };
  }

  deleteMailing(id: string) {
    const mailing = this.#mailing(id);
    if (mailing.state === "sending" || mailing.state === "paused")
      throw new Refused(409, "busy", "This mailing is part-way through. Cancel it first.");
    for (let run = 1; run <= mailing.run; run += 1) {
      this.#store.remove(`mailings/${mailing.id}.run-${run}.json`);
      this.#store.remove(`mailings/${mailing.id}.run-${run}.log`);
    }
    this.#store.remove(`mailings/${mailing.id}.json`);
    this.#mailings.delete(id);
    this.#runs.delete(id);
    return { deleted: mailing.name };
  }

  mailingDetail(id: string, query: { state?: string; offset?: number; preview?: number }) {
    const mailing = this.#mailing(id);
    const run = this.#runs.get(mailing.id);
    const showRun = run !== undefined && mailing.state !== "draft";
    const audience = this.#audience(mailing);
    // What people see: the frozen send once there is one, the draft as it stands before.
    const message: FrozenMessage = showRun
      ? run.message
      : {
          subject: mailing.subject,
          body: mailing.body,
          footer: this.#settings.footer,
          from_email: this.#settings.from_email,
          from_name: this.#settings.from_name,
          reply_to: this.#settings.reply_to,
        };
    // Whoever a send left out has no message to read.
    const people = showRun
      ? run.recipients.filter((item) => run.outcomes.get(item.key)?.state !== "skipped")
      : audience.sendable;
    const at = Math.min(
      Math.max(0, Math.trunc(query.preview ?? 0)),
      Math.max(0, people.length - 1),
    );
    const person = people[at];
    const rendered = person ? render(message, person.values) : null;
    const offset = Math.max(0, Math.trunc(query.offset ?? 0));
    const wanted = query.state ?? "all";
    const listNames = new Map([...this.#lists.values()].map((list) => [list.id, list.name]));
    const rows = showRun
      ? run.recipients
          .map((recipient) => {
            const outcome = run.outcomes.get(recipient.key);
            return {
              email: recipient.email,
              name: recipient.name,
              list: listNames.get(recipient.list_id) ?? "A list since removed",
              state: outcome ? outcome.state : ("waiting" as const),
              reason: outcome?.reason ?? "",
              at: outcome?.at ?? null,
            };
          })
          .filter((row) => wanted === "all" || row.state === wanted)
      : [];
    return {
      mailing: {
        ...this.#mailingSummary(mailing),
        body: mailing.body,
        list_ids: mailing.list_ids,
        only_column: mailing.only_column,
        only_value: mailing.only_value,
        hold_column: mailing.hold_column,
        pick_only: mailing.pick_only,
        picked_count: mailing.picked.length,
        skip_written: mailing.skip_written,
      },
      message_fields: this.#messageFields(mailing),
      message: {
        from_email: message.from_email,
        from_name: message.from_name,
        footer: message.footer,
      },
      available_lists: [...this.#lists.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((list) => ({ id: list.id, name: list.name, people: list.rows.length })),
      fields: this.#fields(mailing),
      checks: this.#checks(mailing, audience),
      audience: {
        sendable: audience.sendable.length,
        left_out: audience.left.length,
        duplicates: audience.duplicates,
      },
      preview: rendered
        ? {
            index: at,
            total: people.length,
            email: person!.email,
            name: person!.name,
            list_id: person!.list_id,
            row_id:
              this.#lists.get(person!.list_id)?.rows.find((row) => row.email === person!.email)
                ?.id ?? null,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
          }
        : null,
      recipients: {
        rows: rows.slice(offset, offset + PAGE),
        offset,
        limit: PAGE,
        total: rows.length,
      },
      key_set: this.#key !== "",
      sent_today: this.#sentToday(),
      daily_cap: this.#settings.daily_cap,
    };
  }

  /** The fields a message uses, for a form that asks for them. `email` needs no asking. */
  #messageFields(mailing: Mailing) {
    const labels = new Map(this.#fields(mailing).map((field) => [field.key, field.label]));
    return fieldsOf(mailing.subject, mailing.body, this.#settings.footer)
      .filter((field) => field.key !== "email")
      .map((field) => ({
        key: field.key,
        label: labels.get(field.key) ?? field.key.replace(/_/g, " "),
        required: field.fallback === null,
      }));
  }

  /** Everyone a mailing could be sent to, one line each, however it is filtered. */
  #candidates(mailing: Mailing) {
    const seen = new Set<string>();
    const out: { row: ListRow; list: StoredList }[] = [];
    for (const listId of mailing.list_ids) {
      const list = this.#lists.get(listId);
      if (!list) continue;
      for (const row of list.rows) {
        if (seen.has(row.email)) continue;
        seen.add(row.email);
        out.push({ row, list });
      }
    }
    return out;
  }

  #matching(mailing: Mailing, q: string) {
    const needle = q.trim().toLowerCase();
    const all = this.#candidates(mailing);
    if (!needle) return all;
    return all.filter(({ row }) =>
      `${row.email} ${row.name} ${Object.values(row.values).join(" ")}`
        .toLowerCase()
        .includes(needle),
    );
  }

  /** The short columns: what tells one person from another in a line, not their letter. */
  #shortColumns(mailing: Mailing): { key: string; label: string }[] {
    const lists = mailing.list_ids
      .map((id) => this.#lists.get(id))
      .filter((list): list is StoredList => list !== undefined);
    const found = new Map<string, string>();
    for (const list of lists) {
      for (const column of list.columns) {
        if (column.key === "email" || found.has(column.key)) continue;
        const sample = list.rows.slice(0, 100).map((row) => row.values[column.key] ?? "");
        const longest = Math.max(0, ...sample.map((value) => value.length));
        if (longest > 0 && longest <= 44) found.set(column.key, column.label);
      }
    }
    return [...found.entries()].slice(0, 3).map(([key, label]) => ({ key, label }));
  }

  /** The people of a mailing's lists, searched, with who is picked and who cannot go. */
  people(id: string, query: { q?: string; offset?: number; view?: string }) {
    const mailing = this.#mailing(id);
    const picked = new Set(mailing.picked);
    const message = { subject: mailing.subject, body: mailing.body, footer: this.#settings.footer };
    const q = (query.q ?? "").slice(0, 200);
    const onlyPicked = query.view === "picked";
    const matching = this.#matching(mailing, q).filter(
      ({ row }) => !onlyPicked || picked.has(row.email),
    );
    const offset = Math.max(0, Math.trunc(query.offset ?? 0));
    const columns = this.#shortColumns(mailing);
    return {
      rows: matching.slice(offset, offset + PEOPLE_PAGE).map(({ row, list }) => {
        const standing = this.#standing(mailing, row, message, picked.has(row.email));
        return {
          email: row.email,
          name: row.name,
          list_id: list.id,
          row_id: row.id,
          cells: columns.map((column) => row.values[column.key] ?? ""),
          picked: picked.has(row.email),
          kind: standing.kind,
          reason: standing.reason,
        };
      }),
      columns,
      offset,
      limit: PEOPLE_PAGE,
      total: matching.length,
      picked_total: this.#candidates(mailing).filter(({ row }) => picked.has(row.email)).length,
    };
  }

  #touch(mailing: Mailing): void {
    // What a practice showed is no longer what would go.
    mailing.state = "draft";
    mailing.pause_reason = null;
    mailing.updated_at = this.#stamp();
    this.#saveMailing(mailing);
  }

  #mustEdit(mailing: Mailing): void {
    if (this.#editable(mailing)) return;
    throw new Refused(
      409,
      "not_editable",
      mailing.state === "sending" || mailing.state === "paused"
        ? "This mailing is part-way through. Cancel it to change it, or make a copy."
        : "Mail has gone out under this mailing. Make a copy to write to people again.",
    );
  }

  /**
   * Pick or unpick people. By address, or everyone a search finds: picking everyone leaves
   * out those who could not go anyway, because "all" must not undo a hold by accident.
   */
  pick(id: string, input: { emails?: unknown; picked?: unknown; all?: unknown; q?: unknown }) {
    const mailing = this.#mailing(id);
    this.#mustEdit(mailing);
    const adding = input.picked !== false;
    const onLists = new Map(this.#candidates(mailing).map((item) => [item.row.email, item.row]));
    let emails: string[];
    if (input.all === true) {
      const message = {
        subject: mailing.subject,
        body: mailing.body,
        footer: this.#settings.footer,
      };
      emails = this.#matching(mailing, typeof input.q === "string" ? input.q : "")
        .filter(({ row }) => !adding || this.#standing(mailing, row, message, false).kind === "ok")
        .map(({ row }) => row.email);
    } else {
      const given = Array.isArray(input.emails) ? input.emails : [];
      emails = given
        .map((item) => normaliseEmail(String(item)))
        .filter((email) => email !== "" && (!adding || onLists.has(email)));
    }
    const picked = new Set(mailing.picked);
    for (const email of emails) {
      if (adding) picked.add(email);
      else picked.delete(email);
    }
    mailing.picked = [...picked];
    this.#touch(mailing);
    return { picked: mailing.picked.length, changed: emails.length };
  }

  #handList(): StoredList {
    const found = [...this.#lists.values()].find((list) => list.hand === true);
    if (found) return found;
    const list: StoredList = {
      id: randomUUID(),
      name: HAND_LIST,
      file_name: "",
      created_at: this.#stamp(),
      columns: [{ key: "email", label: "Email" }],
      email_column: "Typed in",
      rows: [],
      left_out: [],
      left_out_total: 0,
      hand: true,
    };
    this.#lists.set(list.id, list);
    return list;
  }

  /**
   * Addresses typed in for one mailing, with the words its fields need. They go on the
   * "Added by hand" list, so they are kept and can be used again, and the mailing goes to
   * them. Someone already on its lists is not added twice; in a picked mailing they are
   * picked, because that is what asking for them by name means.
   */
  addPeople(id: string, input: { emails?: unknown; values?: unknown }) {
    const mailing = this.#mailing(id);
    this.#mustEdit(mailing);
    if (!mailing.pick_only && mailing.only_column)
      throw new Refused(
        409,
        "filtered",
        `This mailing goes only where ${mailing.only_column} is ${mailing.only_value}, so someone added here would not get it. Choose Everyone or Only the people I pick first.`,
      );
    const text = typeof input.emails === "string" ? input.emails : "";
    const pieces = text.split(/[\s,;]+/).filter(Boolean);
    if (pieces.length === 0) throw new Refused(400, "invalid", "Type at least one address.");
    const refused: string[] = [];
    const wanted: string[] = [];
    for (const piece of pieces.slice(0, 1_000)) {
      const email = normaliseEmail(piece);
      if (!email) refused.push(piece.slice(0, 80));
      else if (!wanted.includes(email)) wanted.push(email);
    }
    if (wanted.length === 0)
      throw new Refused(400, "invalid", `${refused[0]} is not an email address.`);
    const values = this.#cleanValues(input.values);
    const hand = this.#handList();
    const labels = new Map(this.#fields(mailing).map((field) => [field.key, field.label]));
    this.#ensureColumns(
      hand,
      [...Object.keys(values), ...this.#messageFields(mailing).map((field) => field.key)],
      labels,
    );
    const onLists = new Set(this.#candidates(mailing).map((item) => item.row.email));
    let added = 0;
    let already = 0;
    let stopped = 0;
    for (const email of wanted) {
      if (this.#stops.has(email)) stopped += 1;
      if (onLists.has(email)) {
        already += 1;
        continue;
      }
      const onHand = hand.rows.find((row) => row.email === email);
      if (onHand) {
        onHand.values = { ...onHand.values, ...values, email };
        onHand.name = displayName(onHand.values);
      } else {
        const row = { ...values, email };
        hand.rows.push({
          id: this.#nextRowId(hand),
          email,
          name: displayName(row),
          values: row,
        });
      }
      added += 1;
    }
    this.#saveList(hand);
    if (added > 0 && !mailing.list_ids.includes(hand.id)) mailing.list_ids.push(hand.id);
    if (mailing.pick_only) mailing.picked = [...new Set([...mailing.picked, ...wanted])];
    this.#touch(mailing);
    return { added, already, stopped, refused: refused.slice(0, 20) };
  }

  /** Every recipient of the last send with what happened, for a file to keep. */
  outcomes(id: string) {
    const mailing = this.#mailing(id);
    const run = this.#runs.get(mailing.id);
    const listNames = new Map([...this.#lists.values()].map((list) => [list.id, list.name]));
    return {
      name: mailing.name,
      mode: run?.mode ?? null,
      rows: (run?.recipients ?? []).map((recipient) => {
        const outcome = run!.outcomes.get(recipient.key);
        return {
          email: recipient.email,
          name: recipient.name,
          list: listNames.get(recipient.list_id) ?? "",
          state: outcome ? outcome.state : "waiting",
          reason: outcome?.reason ?? "",
          at: outcome?.at ?? "",
        };
      }),
    };
  }

  async testMailing(id: string, input: { to?: unknown }) {
    const mailing = this.#mailing(id);
    if (!this.#editable(mailing))
      throw new Refused(409, "not_editable", "A test is for a draft. This mailing has gone out.");
    const to = normaliseEmail(clean(input.to, 254));
    if (!to) throw new Refused(400, "invalid", "Say which address the test goes to.");
    if (!this.#key)
      throw new Refused(
        409,
        "no_key",
        "A test is a real email, so it needs the provider key. Add it in Setup. Until then, Practise shows every person's message.",
      );
    if (!this.#settings.from_email)
      throw new Refused(409, "no_sender", "Say who it is from, in Setup, before sending a test.");
    if (!mailing.subject.trim() || !mailing.body.trim())
      throw new Refused(409, "unwritten", "Write a subject and a message first.");
    const audience = this.#audience(mailing);
    // The test is made out to a real person on the list, so the fields read as they will.
    const sample = audience.sendable[0];
    if (!sample)
      throw new Refused(
        409,
        "no_audience",
        mailing.pick_only
          ? "Pick at least one person: the test is made out as their message."
          : "Choose a list with someone on it: the test is made out as their message.",
      );
    if (this.#sentToday() >= this.#settings.daily_cap)
      throw new Refused(409, "day_full", "Today's limit is reached. The test would go over it.");
    const rendered = render(
      { subject: mailing.subject, body: mailing.body, footer: this.#settings.footer },
      sample.values,
    );
    const result = await this.#liveProvider(this.#key).send({
      to_email: to,
      to_name: "",
      from_email: this.#settings.from_email,
      from_name: this.#settings.from_name,
      reply_to: this.#settings.reply_to,
      subject: `[Test] ${rendered.subject}`,
      html: rendered.html,
      text: rendered.text,
      headers: {},
      tags: ["hq-mail-merge", "test"],
    });
    if (result.status !== "sent") {
      throw new Refused(
        502,
        "test_failed",
        result.status === "auth_failed"
          ? "The provider did not accept the key. Check it in Setup."
          : result.status === "failed"
            ? `The provider refused the test (${result.error_code || "no reason given"}). The sender address may not be verified with it.`
            : "The provider did not answer. The test may not have gone; try again in a moment.",
      );
    }
    const at = this.#stamp();
    this.#store.appendLine("tests.jsonl", { at, to });
    this.#count(at);
    mailing.tested = { at, to, wording: this.#wording(mailing) };
    mailing.updated_at = at;
    this.#saveMailing(mailing);
    return { to, made_out_to: sample.email };
  }

  startMailing(id: string, input: { practice?: unknown; confirm?: unknown }) {
    const mailing = this.#mailing(id);
    const practice = input.practice === true;
    if (mailing.state === "sending" || mailing.state === "paused")
      throw new Refused(409, "busy", "This mailing is already part-way through.");
    if (!this.#editable(mailing))
      throw new Refused(
        409,
        "already_sent",
        "This mailing has gone out. Make a copy to write to people again.",
      );
    const other = [...this.#mailings.values()].find((item) => item.state === "sending");
    if (other)
      throw new Refused(409, "another_sending", `"${other.name}" is sending. One goes at a time.`);
    const audience = this.#audience(mailing);
    const blocker = this.#checks(mailing, audience).find(
      (check) => check.blocking && !check.ok && !(practice && check.live_only),
    );
    if (blocker) throw new Refused(409, "not_ready", `${blocker.label}.`);
    if (!practice && Number(input.confirm) !== audience.sendable.length)
      throw new Refused(
        400,
        "unconfirmed",
        `Type ${audience.sendable.length} to send: that is how many people this goes to.`,
      );
    const stamp = this.#stamp();
    mailing.run += 1;
    mailing.state = "sending";
    mailing.mode = practice ? "practice" : "live";
    mailing.pause_reason = null;
    mailing.started_at = stamp;
    mailing.finished_at = null;
    mailing.updated_at = stamp;
    const run: Run = {
      run: mailing.run,
      mode: mailing.mode,
      message: {
        subject: mailing.subject,
        body: mailing.body,
        footer: this.#settings.footer,
        from_email: this.#settings.from_email,
        from_name: this.#settings.from_name,
        reply_to: this.#settings.reply_to,
      },
      recipients: [...audience.sendable, ...audience.left.map((item) => item.recipient)],
      outcomes: new Map(),
      cursor: 0,
      retries: 0,
    };
    this.#store.writeJson(this.#runFile(mailing, "json"), {
      run: run.run,
      mode: run.mode,
      message: run.message,
      recipients: run.recipients,
    });
    // Whoever is left out is accounted for at once, with the reason.
    for (const item of audience.left)
      this.#record(mailing, run, {
        key: item.recipient.key,
        state: "skipped",
        reason: item.reason,
        message_id: "",
        error_code: "",
        at: stamp,
      });
    this.#runs.set(mailing.id, run);
    this.#retryAt = 0;
    this.#saveMailing(mailing);
    return { mailing: this.#mailingSummary(mailing) };
  }

  pauseMailing(id: string) {
    const mailing = this.#mailing(id);
    if (mailing.state !== "sending")
      throw new Refused(409, "not_sending", "This mailing is not sending.");
    this.#pause(mailing, "Paused by you.");
    return { mailing: this.#mailingSummary(mailing) };
  }

  resumeMailing(id: string) {
    const mailing = this.#mailing(id);
    if (mailing.state !== "paused")
      throw new Refused(409, "not_paused", "This mailing is not paused.");
    const other = [...this.#mailings.values()].find((item) => item.state === "sending");
    if (other)
      throw new Refused(409, "another_sending", `"${other.name}" is sending. One goes at a time.`);
    if (mailing.mode === "live") {
      if (!this.#key)
        throw new Refused(409, "no_key", "There is no provider key. Add it in Setup, then resume.");
      if (this.#sentToday() >= this.#settings.daily_cap)
        throw new Refused(
          409,
          "day_full",
          "Today's limit is reached. Resume tomorrow, or raise the limit in Setup.",
        );
    }
    const run = this.#runs.get(mailing.id);
    if (run) run.retries = 0;
    this.#retryAt = 0;
    mailing.state = "sending";
    mailing.pause_reason = null;
    mailing.updated_at = this.#stamp();
    this.#saveMailing(mailing);
    return { mailing: this.#mailingSummary(mailing) };
  }

  cancelMailing(id: string) {
    const mailing = this.#mailing(id);
    if (mailing.state !== "sending" && mailing.state !== "paused")
      throw new Refused(409, "not_running", "This mailing is not part-way through.");
    const stamp = this.#stamp();
    mailing.state = "cancelled";
    mailing.pause_reason = null;
    mailing.finished_at = stamp;
    mailing.updated_at = stamp;
    this.#saveMailing(mailing);
    return { mailing: this.#mailingSummary(mailing) };
  }

  // ------------------------------------------------------------------ the send itself

  #pause(mailing: Mailing, reason: string): void {
    mailing.state = "paused";
    mailing.pause_reason = reason;
    mailing.updated_at = this.#stamp();
    this.#saveMailing(mailing);
  }

  #record(mailing: Mailing, run: Run, outcome: Outcome): void {
    this.#store.appendLine(this.#runFile(mailing, "log"), outcome);
    run.outcomes.set(outcome.key, outcome);
    if (run.mode === "live" && (outcome.state === "sent" || outcome.state === "unknown"))
      this.#remember(outcome.key, mailing, outcome.at);
  }

  /** Too many of the latest failing is a list or a sender gone wrong, not one bad address. */
  #tripped(run: Run): string | null {
    const latest: Outcome[] = [];
    for (let index = run.recipients.length - 1; index >= 0 && latest.length < 400; index -= 1) {
      const outcome = run.outcomes.get(run.recipients[index]!.key);
      if (outcome && (outcome.state === "sent" || outcome.state === "failed")) latest.push(outcome);
    }
    const window = latest.sort((a, b) => b.at.localeCompare(a.at)).slice(0, BREAKER_WINDOW);
    const failed = window.filter((outcome) => outcome.state === "failed").length;
    return failed >= BREAKER_FAILURES
      ? `${failed} of the last ${window.length} were refused by the provider. Look at the list and the sender before going on; nothing more was sent.`
      : null;
  }

  /** How long to leave between two messages of the mailing now sending. */
  interval(): number {
    const sending = [...this.#mailings.values()].find((mailing) => mailing.state === "sending");
    if (!sending) return 1_000;
    return sending.mode === "practice" ? 15 : Math.round(60_000 / this.#settings.per_minute);
  }

  /** One step of the send: at most one message leaves. */
  async step(): Promise<StepResult> {
    const mailing = [...this.#mailings.values()].find((item) => item.state === "sending");
    if (!mailing) return "idle";
    const run = this.#runs.get(mailing.id);
    if (!run) {
      this.#pause(mailing, "This send's own record could not be read. Nothing more was sent.");
      return "paused";
    }
    if (this.#retryAt > this.#now().getTime()) return "waiting";
    while (run.cursor < run.recipients.length && run.outcomes.has(run.recipients[run.cursor]!.key))
      run.cursor += 1;
    const recipient = run.recipients[run.cursor];
    if (!recipient) {
      const stamp = this.#stamp();
      mailing.state = "finished";
      mailing.finished_at = stamp;
      mailing.updated_at = stamp;
      this.#saveMailing(mailing);
      return "finished";
    }
    const stamp = this.#stamp();
    if (this.#stops.has(recipient.key)) {
      // Added to the stop list after the send began: still never written to.
      this.#record(mailing, run, {
        key: recipient.key,
        state: "skipped",
        reason: "On the stop list",
        message_id: "",
        error_code: "",
        at: stamp,
      });
      return "skipped";
    }
    const live = run.mode === "live";
    if (live && !this.#key) {
      this.#pause(mailing, "The provider key was removed. Add it in Setup, then resume.");
      return "paused";
    }
    if (live && this.#sentToday() >= this.#settings.daily_cap) {
      this.#pause(
        mailing,
        `Today's limit of ${this.#settings.daily_cap.toLocaleString("en-GB")} is reached. Press Resume tomorrow.`,
      );
      return "paused";
    }
    const rendered = render(run.message, recipient.values);
    const provider = live ? this.#liveProvider(this.#key) : this.#practice;
    const stopAt = run.message.reply_to || run.message.from_email;
    // Written down before it goes: a crash from here on is "may have been sent".
    this.#store.appendLine(this.#runFile(mailing, "log"), {
      key: recipient.key,
      state: "attempting",
      at: stamp,
    });
    const result = await provider
      .send({
        to_email: recipient.email,
        to_name: recipient.name,
        from_email: run.message.from_email,
        from_name: run.message.from_name,
        reply_to: run.message.reply_to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        headers: stopAt ? { "List-Unsubscribe": `<mailto:${stopAt}?subject=unsubscribe>` } : {},
        tags: ["hq-mail-merge", mailing.id.slice(0, 8)],
      })
      // A provider that breaks instead of answering has still been handed the message.
      .catch((): SendResult => ({
        status: "unknown",
        message_id: "",
        error_code: "error",
        retry_after_seconds: null,
      }));
    const at = this.#stamp();
    const outcome = (state: OutcomeState, reason: string): Outcome => ({
      key: recipient.key,
      state,
      reason,
      message_id: result.message_id,
      error_code: result.error_code,
      at,
    });
    if (result.status === "sent") {
      run.retries = 0;
      this.#record(mailing, run, outcome("sent", ""));
      return "sent";
    }
    if (result.status === "unknown") {
      this.#record(mailing, run, outcome("unknown", "No answer came back. It may have been sent."));
      return "unknown";
    }
    if (result.status === "auth_failed" || ACCOUNT_REFUSALS[result.error_code]) {
      this.#withdraw(mailing, recipient.key);
      if (mailing.state === "sending")
        this.#pause(mailing, ACCOUNT_REFUSALS[result.error_code] ?? ACCOUNT_REFUSALS.unauthorized!);
      return "paused";
    }
    if (result.status === "retry") {
      this.#withdraw(mailing, recipient.key);
      run.retries += 1;
      if (run.retries >= MAX_RETRIES) {
        if (mailing.state === "sending")
          this.#pause(
            mailing,
            "The provider is not answering. Nothing more was sent; resume when it is back.",
          );
        return "paused";
      }
      this.#retryAt = this.#now().getTime() + (result.retry_after_seconds ?? 30) * 1_000;
      return "waiting";
    }
    run.retries = 0;
    this.#record(
      mailing,
      run,
      outcome(
        "failed",
        `The provider refused this one (${result.error_code || "no reason given"})`,
      ),
    );
    const tripped = this.#tripped(run);
    if (tripped && mailing.state === "sending") {
      this.#pause(mailing, tripped);
      return "paused";
    }
    return "failed";
  }

  /**
   * The answer says nothing went for this person. The log says so too, so a restart does
   * not read the attempt as "may have been sent", and they wait their turn again.
   */
  #withdraw(mailing: Mailing, key: string): void {
    this.#store.appendLine(this.#runFile(mailing, "log"), {
      key,
      state: "withdrawn",
      at: this.#stamp(),
    });
  }

  /** Keep sending until told to stop. One loop, one message at a time. */
  async loop(sleep: (ms: number) => Promise<void>): Promise<void> {
    if (this.#looping) return;
    this.#looping = true;
    while (this.#looping) {
      let outcome: StepResult = "idle";
      try {
        outcome = await this.step();
      } catch (error) {
        console.error(
          "[mail-merge] a step failed:",
          error instanceof Error ? error.message : error,
        );
      }
      await sleep(
        outcome === "sent" || outcome === "failed" || outcome === "unknown"
          ? this.interval()
          : outcome === "skipped"
            ? 0
            : 1_000,
      );
    }
  }

  stop(): void {
    this.#looping = false;
  }
}
