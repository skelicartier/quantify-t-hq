/**
 * Delivery read-back: what the provider says happened to each message after it accepted it.
 *
 * The sender already knows what it handed over. This reads the provider's own events back,
 * keeps the ones about this computer's live mail (delivered, delayed, bounced, blocked, not
 * sent, marked as spam, unsubscribed) under `delivery/` in Mail merge's folder, and puts the
 * four stopping kinds on the stop list. Opens and clicks are dropped unread and never
 * stored: privacy features open mail by themselves.
 *
 * Rules it keeps whatever is asked of it:
 *   - It never sends, pauses, resumes or slows a mailing. It reads, and it writes the stop
 *     list; a send never waits for it.
 *   - Nothing that happened before this code first ran with a key (`auto_stop_from`) goes
 *     on the stop list until a person presses "Apply to the stop list".
 *   - Each event acts on the stop list once: taking someone off by hand sticks.
 *   - An event is kept only when it matches one of this computer's own live sends, by the
 *     provider's message id. Anything else on the account is dropped unread, never written
 *     and never logged. Logs carry counts and codes only.
 */

import { chmodSync, existsSync, mkdirSync, renameSync } from "node:fs";

import {
  DELIVERY_APPLIED_FILE,
  DELIVERY_MAILINGS_DIR,
  DELIVERY_STATE_FILE,
  MERGE_TAG,
  STOP_REASON_OF,
  WEEK_MS,
  appliedKeyOf,
  countWords,
  NO_COUNTS,
  countsSince,
  deliveryKindOf,
  deliveryMailingFile,
  isRetry,
  isStopKind,
  isoOf,
  mailingDeliveryOf,
  mailingTagOf,
  messageIdKey,
  redactReason,
  standingOf,
  stopDetailOf,
  waitingStopsOf,
  warningsOf,
  type AppliedStop,
  type DeliveryCounts,
  type DeliveryEvent,
  type DeliveryKind,
  type DeliveryRecipient,
  type DeliveryStanding,
  type DeliveryStateFile,
  type DeliveryWarning,
  type MailingDelivery,
  type MailingDeliveryFile,
  type Reaction,
  type ReadOutcome,
  type ReadScope,
  type RecipientStanding,
  type StopKind,
  type WaitingStop,
} from "../../src/lib/merge/delivery-contracts";
import { normaliseEmail } from "./lists";
import type { EventPage, MailProvider, ProviderEvent } from "./provider";
import type { Store } from "./store";

export type DeliveryOptions = {
  /** How often the loop asks whether a read is due. */
  tickMs: number;
  /** Sends in the last 7 days are read this often. */
  recentEveryMs: number;
  /** Sends 7 to 30 days old, this often. */
  olderEveryMs: number;
  /** "Check delivery now" at most this often. */
  minGapMs: number;
  /** Between two pages of one read. */
  pageGapMs: number;
  pageSize: number;
  /** Pages in one read; the rest carries on at the next tick. */
  maxPages: number;
  /** Provider requests in any hour. */
  hourlyBudget: number;
  /** A read cut short longer ago than this starts again from the top. */
  resumeWithinMs: number;
  /** Tests only: auto_stop_from for a state file made now, instead of now. */
  stopFrom: string | null;
};

export const DELIVERY_DEFAULTS: DeliveryOptions = {
  tickMs: 60_000,
  recentEveryMs: 1_800_000,
  olderEveryMs: 86_400_000,
  minGapMs: 60_000,
  pageGapMs: 2_000,
  pageSize: 2_500,
  maxPages: 40,
  hourlyBudget: 60,
  resumeWithinMs: 7_200_000,
  stopFrom: null,
};

/** One live send: what the engine's runs say went, or may have gone, to whom. */
export type LiveSend = {
  mailing_id: string;
  name: string;
  email: string;
  /** `messageIdKey` of the run log's message id, "" when none. */
  message_id: string;
  sent_at: string;
};

export type ReadResult = {
  outcome: ReadOutcome;
  pages: number;
  kept: number;
  dropped: number;
  detail: string;
};

export type ReadView = {
  key_set: boolean;
  reading: boolean;
  last_read_at: string | null;
  scope: ReadScope | null;
  days: number | null;
  outcome: ReadOutcome | null;
  detail: string;
  kept: number;
  /** When the loop will next read, as far as can be said; null without a key. */
  next_at: string | null;
  wait_until: string | null;
  auto_stop_from: string | null;
  backlog_applied_at: string | null;
};

/** What a mailing's summary carries about its delivery. */
export type DeliveryBrief = {
  accepted: number;
  delivered: number;
  not_yet: number;
  didnt_arrive: number;
  hard_bounce: number;
  complaint: number;
  unsubscribed: number;
  read_at: string | null;
  warning: "attention" | "danger" | null;
};

export type DeliveryView = "didnt" | "not_yet" | "retry" | "all";
export const DELIVERY_VIEWS: readonly DeliveryView[] = ["didnt", "not_yet", "retry", "all"];

export type DeliveryRow = {
  email: string;
  name: string;
  list: string;
  sent_at: string;
  shown: DeliveryStanding | Reaction;
  delivery: DeliveryStanding;
  delivery_at: string | null;
  reason: string;
  reaction: Reaction | null;
  reaction_at: string | null;
  stop: { on: boolean; since: string | null; waiting: boolean };
};

/** Why a read cannot be asked for now: the status, code and sentence of the refusal. */
export type CheckRefusal = { status: number; code: string; message: string };

type Hooks = {
  store: Store;
  now: () => Date;
  options?: Partial<DeliveryOptions> | undefined;
  /** The live provider for the key, or null with no key. */
  provider: () => MailProvider | null;
  /** Every live run's recipients with outcome `sent` or `unknown`, in send order. */
  sends: () => LiveSend[];
  /** Adds to the stop list and saves; "already" when the address is on it. */
  stop: (
    email: string,
    reason: "bounced" | "asked",
    detail: string,
    at: string,
  ) => "added" | "already";
  /** Since when the address has been on the stop list; null when it is not. */
  stopSince: (email: string) => string | null;
  log?: (line: string) => void;
};

type Plan = {
  scope: ReadScope;
  days: number;
  offset: number;
  started_at: string;
  /** Ask without the tag filter whatever the state says (the empty-filter check). */
  probe: boolean;
};

type Tally = { pages: number; kept: number; dropped: number; matched: number };

type MailingView = {
  summary: MailingDelivery | null;
  standings: Map<string, RecipientStanding>;
};

const DAY_MS = 86_400_000;
const MONTH_MS = 30 * DAY_MS;
const SCOPE_DAYS: Readonly<Record<ReadScope, number>> = { first: 31, recent: 8, older: 31, now: 8 };
const SLOW_DOWN_SECONDS = 900;
/** A send this fresh may simply have no events yet: it does not prove the filter hid it. */
const SETTLE_MS = 600_000;
const VIEW_PAGE = 100;
const BACKLOG_ROWS = 200;
const WITH_REASON: ReadonlySet<DeliveryKind> = new Set<DeliveryKind>([
  "soft_bounce",
  "hard_bounce",
  "blocked",
  "invalid",
  "error",
]);
const SCOPES: readonly ReadScope[] = ["first", "recent", "older", "now"];
const OUTCOMES: readonly ReadOutcome[] = [
  "ok",
  "partial",
  "no_key",
  "refused",
  "unreachable",
  "slowed",
];

const clampDays = (days: number): number =>
  Math.min(90, Math.max(1, Math.trunc(Number.isFinite(days) ? days : 8)));

/** "14:05" on this computer's clock. */
function clockWords(at: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

function isRecipient(value: unknown): value is DeliveryRecipient {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DeliveryRecipient>;
  return (
    typeof item.email === "string" &&
    typeof item.message_id === "string" &&
    typeof item.sent_at === "string" &&
    Array.isArray(item.events)
  );
}

export class Delivery {
  readonly options: DeliveryOptions;
  readonly #hooks: Hooks;
  readonly #store: Store;
  readonly #log: (line: string) => void;
  #state: DeliveryStateFile | null = null;
  readonly #files = new Map<string, MailingDeliveryFile>();
  readonly #views = new Map<string, MailingView>();
  readonly #applied: AppliedStop[] = [];
  readonly #appliedKeys = new Set<string>();
  #reading: Promise<ReadResult> | null = null;
  #halted = false;
  /** A read that kept nothing of this computer's mail with the tag filter on: ask once without. */
  #probe: { scope: ReadScope; days: number } | null = null;
  /** What a read cut short had counted, so the read that carries it on reports the whole. */
  #carry: (Tally & { started_at: string; probe: boolean }) | null = null;
  #lastLogged = "";

  constructor(hooks: Hooks) {
    this.#hooks = hooks;
    this.#store = hooks.store;
    this.options = { ...DELIVERY_DEFAULTS, ...(hooks.options ?? {}) };
    this.#log = hooks.log ?? ((line) => console.log(`[mail-merge] ${line}`));
    this.#state = this.#loadState();
    if (this.#state) this.#ensureFolders();
    for (const id of this.#store.list(DELIVERY_MAILINGS_DIR, ".json")) {
      // An unreadable file is kept aside by the store and this mailing starts empty.
      const file = this.#store.readJson<MailingDeliveryFile | null>(deliveryMailingFile(id), null);
      if (
        !file ||
        typeof file !== "object" ||
        file.mailing_id !== id ||
        !Array.isArray(file.recipients)
      )
        continue;
      this.#files.set(id, {
        format: 1,
        mailing_id: id,
        name: typeof file.name === "string" ? file.name : "",
        recipients: file.recipients.filter(isRecipient),
        read_at: typeof file.read_at === "string" ? file.read_at : null,
      });
    }
    for (const line of this.#store.readLines<AppliedStop>(DELIVERY_APPLIED_FILE)) {
      if (!line || typeof line.email !== "string" || typeof line.at !== "string") continue;
      this.#applied.push(line);
      this.#appliedKeys.add(appliedKeyOf(line));
    }
    if (this.#hooks.provider() !== null) this.#ensureState();
  }

  // ------------------------------------------------------------------ the state file

  #stamp(): string {
    return this.#hooks.now().toISOString();
  }

  #nowMs(): number {
    return this.#hooks.now().getTime();
  }

  #loadState(): DeliveryStateFile | null {
    if (!existsSync(this.#store.path(DELIVERY_STATE_FILE))) return null;
    const raw = this.#store.readJson<Partial<DeliveryStateFile> | null>(DELIVERY_STATE_FILE, null);
    if (raw === null) return null;
    const from = raw && typeof raw === "object" ? isoOf(raw.auto_stop_from) : null;
    if (from === null) {
      // It parses and says nothing usable: kept aside like any unreadable file. A new one
      // starts from now, the safe side: everything earlier then waits for a press.
      const file = this.#store.path(DELIVERY_STATE_FILE);
      if (existsSync(file)) renameSync(file, `${file}.unreadable-${Date.now()}`);
      return null;
    }
    const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
    const progress = raw.in_progress;
    const last = raw.last_read;
    return {
      format: 1,
      auto_stop_from: from,
      backlog_applied_at: text(raw.backlog_applied_at),
      last_read:
        last && typeof last === "object" && typeof last.at === "string"
          ? {
              at: last.at,
              scope: SCOPES.includes(last.scope) ? last.scope : "recent",
              days: Number(last.days) || 0,
              pages: Number(last.pages) || 0,
              kept: Number(last.kept) || 0,
              outcome: OUTCOMES.includes(last.outcome) ? last.outcome : "ok",
              detail: typeof last.detail === "string" ? last.detail : "",
            }
          : null,
      last_recent_at: text(raw.last_recent_at),
      last_older_at: text(raw.last_older_at),
      in_progress:
        progress &&
        typeof progress === "object" &&
        SCOPES.includes(progress.scope) &&
        typeof progress.started_at === "string"
          ? {
              scope: progress.scope,
              days: clampDays(Number(progress.days)),
              offset: Math.max(0, Math.trunc(Number(progress.offset)) || 0),
              started_at: progress.started_at,
            }
          : null,
      wait_until: text(raw.wait_until),
      requests: Array.isArray(raw.requests)
        ? raw.requests.filter((item): item is string => typeof item === "string")
        : [],
      tags_filter: raw.tags_filter !== false,
    };
  }

  #ensureFolders(): void {
    for (const folder of ["delivery", DELIVERY_MAILINGS_DIR]) {
      const path = this.#store.path(folder);
      mkdirSync(path, { recursive: true, mode: 0o700 });
      chmodSync(path, 0o700);
    }
  }

  /** The folders and the state file, made the first time there is a key. Never remade. */
  #ensureState(): DeliveryStateFile {
    if (this.#state) return this.#state;
    this.#ensureFolders();
    this.#state = {
      format: 1,
      auto_stop_from: isoOf(this.options.stopFrom) ?? this.#stamp(),
      backlog_applied_at: null,
      last_read: null,
      last_recent_at: null,
      last_older_at: null,
      in_progress: null,
      wait_until: null,
      requests: [],
      tags_filter: true,
    };
    this.#saveState();
    return this.#state;
  }

  #saveState(): void {
    if (this.#state) this.#store.writeJson(DELIVERY_STATE_FILE, this.#state);
  }

  #saveFile(file: MailingDeliveryFile): void {
    this.#views.delete(file.mailing_id);
    this.#store.writeJson(deliveryMailingFile(file.mailing_id), file);
  }

  /** A key was set: from this instant on, stopping events act by themselves. */
  keySet(): void {
    this.#ensureState();
  }

  /** The engine is stopping: a read going now ends after its page and carries on next start. */
  halt(): void {
    this.#halted = true;
  }

  // ------------------------------------------------------------------ when a read is due

  /** After a read that failed, the schedule waits this long (five ticks) before the next. */
  #failGapMs(): number {
    return Math.min(this.options.recentEveryMs, 5 * this.options.tickMs);
  }

  #budgetLeft(state: DeliveryStateFile): number {
    const cutoff = new Date(this.#nowMs() - 3_600_000).toISOString();
    if (state.requests.some((at) => at < cutoff))
      state.requests = state.requests.filter((at) => at >= cutoff);
    return this.options.hourlyBudget - state.requests.length;
  }

  /** Whether anything was handed over from `fromMs` on (and before `toMs`, when given). */
  #sendsIn(sends: readonly LiveSend[], fromMs: number, toMs: number | null = null): boolean {
    const from = new Date(fromMs).toISOString();
    const to = toMs === null ? null : new Date(toMs).toISOString();
    return sends.some((send) => send.sent_at >= from && (to === null || send.sent_at < to));
  }

  /** The read the schedule asks for now, if any: the first matching rule wins. */
  #due(): Plan | null {
    const provider = this.#hooks.provider();
    if (!provider || typeof provider.listEvents !== "function") return null;
    if (this.#reading) return null;
    const state = this.#ensureState();
    const now = this.#nowMs();
    if (state.wait_until !== null && Date.parse(state.wait_until) > now) return null;
    // Nothing can be asked this hour: wait, rather than end a read at once each tick.
    if (this.#budgetLeft(state) <= 0) return null;
    // A read the provider refused or did not answer is not asked again at every tick.
    const last = state.last_read;
    if (
      last !== null &&
      (last.outcome === "refused" || last.outcome === "unreachable") &&
      now - Date.parse(last.at) < this.#failGapMs()
    )
      return null;
    if (state.in_progress !== null) {
      // It was cut short when it last ended keeping its place, or (a crash) when it began.
      const kept =
        last !== null &&
        (last.outcome === "partial" || last.outcome === "slowed" || last.outcome === "unreachable");
      const started = Math.max(
        Date.parse(state.in_progress.started_at) || 0,
        kept ? Date.parse(last.at) || 0 : 0,
      );
      const carry = this.#carry;
      if (now - started < this.options.resumeWithinMs)
        return {
          ...state.in_progress,
          probe: carry !== null && carry.started_at === state.in_progress.started_at && carry.probe,
        };
      state.in_progress = null;
      this.#carry = null;
      this.#saveState();
    }
    const started_at = this.#stamp();
    if (this.#probe !== null) return { ...this.#probe, offset: 0, started_at, probe: true };
    if (state.last_read === null)
      return { scope: "first", days: SCOPE_DAYS.first, offset: 0, started_at, probe: false };
    const sends = this.#hooks.sends();
    const ago = (at: string | null, every: number) => at === null || now - Date.parse(at) >= every;
    if (
      this.#sendsIn(sends, now - WEEK_MS) &&
      ago(state.last_recent_at, this.options.recentEveryMs)
    )
      return { scope: "recent", days: SCOPE_DAYS.recent, offset: 0, started_at, probe: false };
    if (
      this.#sendsIn(sends, now - MONTH_MS, now - WEEK_MS) &&
      ago(state.last_older_at, this.options.olderEveryMs)
    )
      return { scope: "older", days: SCOPE_DAYS.older, offset: 0, started_at, probe: false };
    return null;
  }

  /** One turn of the loop: start the read that is due and wait for it; nothing otherwise. */
  async tick(): Promise<ReadResult | null> {
    if (this.#halted) return null;
    const plan = this.#due();
    return plan ? this.#start(plan) : null;
  }

  // ------------------------------------------------------------------ one read

  get reading(): boolean {
    return this.#reading !== null;
  }

  /** Why "Check delivery now" cannot be asked at this moment; null when it can. */
  checkRefusal(): CheckRefusal | null {
    const state = this.#state;
    const now = this.#nowMs();
    if (state?.last_read && now - Date.parse(state.last_read.at) < this.options.minGapMs)
      return {
        status: 409,
        code: "too_soon",
        message: "Delivery was read less than a minute ago. Try again in a moment.",
      };
    if (state?.wait_until && Date.parse(state.wait_until) > now)
      return {
        status: 409,
        code: "slowed",
        message: `The provider asked HQ to slow down. The next read is after ${clockWords(new Date(state.wait_until))}.`,
      };
    return null;
  }

  /**
   * Read now. Never two at once: asked while one goes, it answers that one's result. With
   * no key (or a provider that has no events to give) it answers `no_key` and reads nothing.
   */
  read(scope: ReadScope, options: { days?: number } = {}): Promise<ReadResult> {
    if (this.#reading) return this.#reading;
    return this.#start({
      scope,
      days: clampDays(options.days ?? SCOPE_DAYS[scope]),
      offset: 0,
      started_at: this.#stamp(),
      probe: false,
    });
  }

  #start(plan: Plan): Promise<ReadResult> {
    const going = this.#run(plan).finally(() => {
      this.#reading = null;
    });
    this.#reading = going;
    return going;
  }

  /** By message id, and by "<mailing tag>|<address>" for sends whose answer was lost. */
  #match(): { byId: Map<string, LiveSend>; byTag: Map<string, LiveSend> } {
    const byId = new Map<string, LiveSend>();
    const byTag = new Map<string, LiveSend>();
    for (const send of this.#hooks.sends()) {
      if (send.message_id) byId.set(send.message_id, send);
      else byTag.set(`${mailingTagOf(send.mailing_id)}|${send.email}`, send);
    }
    return { byId, byTag };
  }

  /** A mailing's file, made on first need with every send accepted so far, in send order. */
  #fileFor(send: LiveSend): MailingDeliveryFile {
    const found = this.#files.get(send.mailing_id);
    if (found) return found;
    const file: MailingDeliveryFile = {
      format: 1,
      mailing_id: send.mailing_id,
      name: send.name,
      recipients: this.#hooks
        .sends()
        .filter((item) => item.mailing_id === send.mailing_id)
        .map((item) => ({
          email: item.email,
          message_id: item.message_id,
          sent_at: item.sent_at,
          events: [],
        })),
      read_at: null,
    };
    this.#files.set(file.mailing_id, file);
    return file;
  }

  #applyStop(
    target: { email: string; kind: StopKind; at: string; mailing_id: string; mailing: string },
    how: AppliedStop["how"],
  ): "added" | "already" {
    const result = this.#hooks.stop(
      target.email,
      STOP_REASON_OF[target.kind],
      stopDetailOf(target.kind, target.mailing),
      target.at,
    );
    const line: AppliedStop = {
      email: target.email,
      kind: target.kind,
      mailing_id: target.mailing_id,
      at: target.at,
      applied_at: this.#stamp(),
      result,
      how,
    };
    this.#store.appendLine(DELIVERY_APPLIED_FILE, line);
    this.#applied.push(line);
    this.#appliedKeys.add(appliedKeyOf(line));
    return result;
  }

  /** One event, in the order the spec gives (§6.4): kept, or counted as dropped. */
  #take(
    event: ProviderEvent,
    match: { byId: Map<string, LiveSend>; byTag: Map<string, LiveSend> },
    state: DeliveryStateFile,
    tally: Tally,
    changed: Set<string>,
  ): void {
    const drop = () => {
      tally.dropped += 1;
    };
    const kind = deliveryKindOf(event.event);
    if (kind === null) return drop();
    const at = isoOf(event.date);
    if (at === null) return drop();
    const address = normaliseEmail(event.email);
    let send = match.byId.get(messageIdKey(event.message_id));
    if (!send)
      for (const tag of event.tag.split(",")) {
        send = match.byTag.get(`${tag.trim()}|${address}`);
        if (send) break;
      }
    if (!send) return drop();
    if (address !== send.email) return drop();
    tally.matched += 1;
    const file = this.#fileFor(send);
    let recipient = file.recipients.find((item) => item.email === send.email);
    if (!recipient) {
      recipient = {
        email: send.email,
        message_id: send.message_id,
        sent_at: send.sent_at,
        events: [],
      };
      file.recipients.push(recipient);
      changed.add(file.mailing_id);
    }
    if (recipient.events.some((item) => item.kind === kind && item.at === at)) return drop();
    const kept: DeliveryEvent = {
      kind,
      at,
      reason: WITH_REASON.has(kind) ? redactReason(event.reason) : "",
    };
    recipient.events.push(kept);
    recipient.events.sort((a, b) => a.at.localeCompare(b.at));
    changed.add(file.mailing_id);
    tally.kept += 1;
    if (!isStopKind(kind)) return;
    // The stop rule (spec §6.6): once per event, and nothing from before the first run
    // with a key until a person has said so.
    if (this.#appliedKeys.has(appliedKeyOf({ email: send.email, kind, at }))) return;
    if (at < state.auto_stop_from && state.backlog_applied_at === null) return;
    this.#applyStop(
      { email: send.email, kind, at, mailing_id: send.mailing_id, mailing: send.name },
      "auto",
    );
  }

  /** After a read that finished: every live mailing with a send inside it, whole and in order. */
  #rebuild(days: number, at: string): void {
    const cutoff = new Date(this.#nowMs() - days * DAY_MS).toISOString();
    const byMailing = new Map<string, LiveSend[]>();
    for (const send of this.#hooks.sends()) {
      const list = byMailing.get(send.mailing_id);
      if (list) list.push(send);
      else byMailing.set(send.mailing_id, [send]);
    }
    for (const [mailingId, sends] of byMailing) {
      if (!sends.some((send) => send.sent_at >= cutoff)) continue;
      const before = this.#files.get(mailingId);
      const events = new Map(
        (before?.recipients ?? []).map((recipient) => [recipient.email, recipient.events]),
      );
      const file: MailingDeliveryFile = {
        format: 1,
        mailing_id: mailingId,
        name: sends[0]!.name,
        recipients: sends.map((send) => ({
          email: send.email,
          message_id: send.message_id,
          sent_at: send.sent_at,
          events: events.get(send.email) ?? [],
        })),
        read_at: at,
      };
      this.#files.set(mailingId, file);
      this.#saveFile(file);
    }
  }

  #end(
    plan: Plan,
    tally: Tally,
    outcome: ReadOutcome,
    detail: string,
    keepProgress: boolean,
  ): ReadResult {
    const state = this.#ensureState();
    state.last_read = {
      at: this.#stamp(),
      scope: plan.scope,
      days: plan.days,
      pages: tally.pages,
      kept: tally.kept,
      outcome,
      detail,
    };
    if (keepProgress) {
      // A read that could not ask even once leaves the place another read had kept.
      if (state.in_progress?.started_at === plan.started_at)
        this.#carry = { ...tally, started_at: plan.started_at, probe: plan.probe };
    } else {
      state.in_progress = null;
      this.#carry = null;
      // The one read without the filter has been made, however it ended: not again and again.
      if (plan.probe) this.#probe = null;
    }
    this.#saveState();
    const line =
      `delivery read (${plan.scope}, ${plan.days} days): ${countWords(tally.pages)} ` +
      `${tally.pages === 1 ? "page" : "pages"}, ${countWords(tally.kept)} kept, ` +
      `${countWords(tally.dropped)} dropped${outcome === "ok" ? "" : `, ${outcome}`}`;
    // A read that keeps failing the same way says so once, not at every tick.
    if (outcome === "ok" || line !== this.#lastLogged) this.#log(line);
    this.#lastLogged = outcome === "ok" ? "" : line;
    return { outcome, pages: tally.pages, kept: tally.kept, dropped: tally.dropped, detail };
  }

  async #run(plan: Plan): Promise<ReadResult> {
    const provider = this.#hooks.provider();
    const nothing = { pages: 0, kept: 0, dropped: 0 };
    if (!provider || typeof provider.listEvents !== "function")
      return { ...nothing, outcome: "no_key", detail: "" };
    const state = this.#ensureState();
    if (state.wait_until !== null && Date.parse(state.wait_until) > this.#nowMs())
      return {
        ...nothing,
        outcome: "slowed",
        detail: `The provider asked HQ to slow down; reading again after ${clockWords(new Date(state.wait_until))}. Sending is not affected.`,
      };
    const carried = this.#carry?.started_at === plan.started_at ? this.#carry : null;
    const tally: Tally = {
      pages: carried?.pages ?? 0,
      kept: carried?.kept ?? 0,
      dropped: carried?.dropped ?? 0,
      matched: carried?.matched ?? 0,
    };
    let offset = plan.offset;
    let asked = 0;
    let filtered = true;
    state.wait_until = null;
    for (;;) {
      if (this.#halted)
        return this.#end(
          plan,
          tally,
          "partial",
          "The sender stopped during this read; it carries on by itself.",
          true,
        );
      if (this.#budgetLeft(state) <= 0)
        return this.#end(
          plan,
          tally,
          "partial",
          `Stopped at this hour's limit of ${countWords(this.options.hourlyBudget)} requests to the provider; it carries on by itself.`,
          true,
        );
      const useTags = state.tags_filter && !plan.probe;
      if (!useTags) filtered = false;
      // From here this read is the one in progress: a restart carries it on from `offset`.
      state.in_progress = {
        scope: plan.scope,
        days: plan.days,
        offset,
        started_at: plan.started_at,
      };
      state.requests.push(this.#stamp());
      this.#saveState();
      let page: EventPage;
      try {
        page = await provider.listEvents({
          days: plan.days,
          offset,
          limit: this.options.pageSize,
          tags: useTags ? [MERGE_TAG] : null,
        });
      } catch {
        page = { status: "unavailable" };
      }
      if (page.status === "refused" && page.http === 400 && useTags) {
        // The filter's form is the one thing about the request that may be wrong (U2).
        state.tags_filter = false;
        this.#saveState();
        this.#log("the provider refused the tag filter; reading without it");
        continue;
      }
      if (page.status === "refused") {
        const code = page.code.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 40) || String(page.http);
        return this.#end(
          plan,
          tally,
          "refused",
          `The provider refused the read (${code}). Sending is not affected.`,
          false,
        );
      }
      if (page.status === "auth_failed")
        return this.#end(
          plan,
          tally,
          "refused",
          "The provider did not accept the key for reading delivery. Check it in Setup. Sending is not affected.",
          false,
        );
      if (page.status === "rate_limited") {
        const until = new Date(
          this.#nowMs() + (page.retry_after_seconds ?? SLOW_DOWN_SECONDS) * 1_000,
        );
        state.wait_until = until.toISOString();
        return this.#end(
          plan,
          tally,
          "slowed",
          `The provider asked HQ to slow down; reading again after ${clockWords(until)}. Sending is not affected.`,
          true,
        );
      }
      if (page.status === "unavailable")
        return this.#end(
          plan,
          tally,
          "unreachable",
          "The provider did not answer. It is asked again at the next read. Sending is not affected.",
          true,
        );
      // A page: small, synchronous work between two requests.
      tally.pages += 1;
      asked += 1;
      const match = this.#match();
      const changed = new Set<string>();
      for (const event of page.events) this.#take(event, match, state, tally, changed);
      offset += page.events.length;
      state.in_progress = {
        scope: plan.scope,
        days: plan.days,
        offset,
        started_at: plan.started_at,
      };
      for (const mailingId of changed) {
        const file = this.#files.get(mailingId);
        if (file) this.#saveFile(file);
      }
      this.#saveState();
      if (page.events.length < this.options.pageSize) break;
      if (asked >= this.options.maxPages)
        return this.#end(
          plan,
          tally,
          "partial",
          `Read ${countWords(tally.pages)} pages; the rest follows at the next read.`,
          true,
        );
      if (this.options.pageGapMs > 0)
        await new Promise((resolve) => setTimeout(resolve, this.options.pageGapMs));
    }
    // It finished.
    const at = this.#stamp();
    if (plan.scope !== "older") state.last_recent_at = at;
    if (plan.scope === "first" || plan.scope === "older" || plan.days >= 31)
      state.last_older_at = at;
    this.#rebuild(plan.days, at);
    // The empty-filter check (U2, U3): mail old enough to have events, and none of them
    // came back with the filter on. Ask once without it; if that finds them, drop it.
    if (plan.probe) {
      this.#probe = null;
      if (tally.matched > 0 && state.tags_filter) {
        state.tags_filter = false;
        this.#log("the tag filter hid this computer's mail; reading without it");
      }
    } else if (filtered && tally.matched === 0) {
      const now = this.#nowMs();
      const from = new Date(now - plan.days * DAY_MS).toISOString();
      const settled = new Date(now - SETTLE_MS).toISOString();
      if (
        this.#hooks
          .sends()
          .some((send) => send.message_id && send.sent_at >= from && send.sent_at < settled)
      )
        this.#probe = { scope: plan.scope, days: plan.days };
    }
    return this.#end(plan, tally, "ok", "", false);
  }

  // ------------------------------------------------------------------ what the pages read

  readView(): ReadView {
    const state = this.#state;
    const keySet = this.#hooks.provider() !== null;
    const last = state?.last_read ?? null;
    return {
      key_set: keySet,
      reading: this.reading,
      last_read_at: last?.at ?? null,
      scope: last?.scope ?? null,
      days: last?.days ?? null,
      outcome: last?.outcome ?? null,
      detail: last?.detail ?? "",
      kept: last?.kept ?? 0,
      next_at: keySet && state ? this.#nextAt(state) : null,
      wait_until: state?.wait_until ?? null,
      auto_stop_from: state?.auto_stop_from ?? null,
      backlog_applied_at: state?.backlog_applied_at ?? null,
    };
  }

  #nextAt(state: DeliveryStateFile): string | null {
    const now = this.#nowMs();
    if (state.wait_until !== null && Date.parse(state.wait_until) > now) return state.wait_until;
    if (state.in_progress !== null || state.last_read === null) return new Date(now).toISOString();
    const sends = this.#hooks.sends();
    const times: number[] = [];
    if (this.#sendsIn(sends, now - WEEK_MS))
      times.push(
        state.last_recent_at === null
          ? now
          : Date.parse(state.last_recent_at) + this.options.recentEveryMs,
      );
    if (this.#sendsIn(sends, now - MONTH_MS, now - WEEK_MS))
      times.push(
        state.last_older_at === null
          ? now
          : Date.parse(state.last_older_at) + this.options.olderEveryMs,
      );
    return times.length > 0 ? new Date(Math.max(now, Math.min(...times))).toISOString() : null;
  }

  #view(mailingId: string): MailingView | null {
    const cached = this.#views.get(mailingId);
    if (cached) return cached;
    const file = this.#files.get(mailingId);
    if (!file) return null;
    const view: MailingView = {
      // Until a read has finished for it, a mailing's file may hold only part of the story.
      summary: file.read_at === null ? null : mailingDeliveryOf(file),
      standings: new Map(
        file.recipients.map((recipient) => [recipient.email, standingOf(recipient.events)]),
      ),
    };
    this.#views.set(mailingId, view);
    return view;
  }

  /** One mailing's delivery as last read; null before a read has finished for it. */
  summary(mailingId: string): MailingDelivery | null {
    return this.#view(mailingId)?.summary ?? null;
  }

  brief(mailingId: string): DeliveryBrief | null {
    const summary = this.summary(mailingId);
    if (!summary) return null;
    const counts = summary.counts;
    const levels = warningsOf(counts, "mailing").map((warning) => warning.level);
    return {
      accepted: counts.accepted,
      delivered: counts.delivered,
      not_yet: counts.not_yet,
      didnt_arrive: counts.didnt_arrive,
      hard_bounce: counts.hard_bounce,
      complaint: counts.complaint,
      unsubscribed: counts.unsubscribed,
      read_at: summary.read_at,
      warning: levels.includes("danger")
        ? "danger"
        : levels.includes("attention")
          ? "attention"
          : null,
    };
  }

  /** Each recipient's standing by address; null before a read has finished for the mailing. */
  standings(mailingId: string): ReadonlyMap<string, RecipientStanding> | null {
    const view = this.#view(mailingId);
    return view && view.summary ? view.standings : null;
  }

  #waiting(): WaitingStop[] {
    const state = this.#state;
    return state ? waitingStopsOf([...this.#files.values()], this.#applied, state) : [];
  }

  overview(): {
    read: ReadView;
    week: {
      since: string;
      counts: DeliveryCounts;
      warnings: DeliveryWarning[];
      by_mailing: { mailing_id: string; name: string; hard_bounce: number; complaint: number }[];
    };
    backlog: {
      total: number;
      would_add: number;
      rows: (WaitingStop & { on_stop_list: boolean })[];
    };
  } {
    const since = new Date(this.#nowMs() - WEEK_MS).toISOString();
    const files = [...this.#files.values()];
    const counts = countsSince(files, since);
    const byMailing = files
      .map((file) => {
        const own = countsSince([file], since);
        return {
          mailing_id: file.mailing_id,
          name: file.name,
          hard_bounce: own.hard_bounce,
          complaint: own.complaint,
        };
      })
      .filter((item) => item.hard_bounce > 0 || item.complaint > 0)
      .sort(
        (a, b) =>
          b.hard_bounce + b.complaint - (a.hard_bounce + a.complaint) ||
          a.name.localeCompare(b.name),
      );
    const waiting = this.#waiting().map((item) => ({
      ...item,
      on_stop_list: this.#hooks.stopSince(item.email) !== null,
    }));
    return {
      read: this.readView(),
      week: { since, counts, warnings: warningsOf(counts, "week"), by_mailing: byMailing },
      backlog: {
        total: waiting.length,
        would_add: waiting.filter((item) => !item.on_stop_list).length,
        rows: waiting.slice(0, BACKLOG_ROWS),
      },
    };
  }

  /**
   * The press. It carries the count the page showed; a different count now is refused, so
   * nothing goes on the stop list that he did not see. Answers a refusal or what it did.
   */
  applyBacklog(count: unknown): CheckRefusal | { added: number; already: number } {
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0)
      return { status: 400, code: "invalid", message: "Say how many." };
    const state = this.#state;
    const waiting = this.#waiting();
    if (!state || waiting.length === 0)
      return { status: 409, code: "nothing", message: "Nothing is waiting for the stop list." };
    const wouldAdd = waiting.filter((item) => this.#hooks.stopSince(item.email) === null).length;
    if (count !== wouldAdd)
      return {
        status: 409,
        code: "changed",
        message: `The list changed since this page was drawn: ${countWords(wouldAdd)} now. Look again, then press once more.`,
      };
    let added = 0;
    let already = 0;
    for (const item of waiting) {
      if (this.#applyStop(item, "press") === "added") added += 1;
      else already += 1;
    }
    state.backlog_applied_at = this.#stamp();
    this.#saveState();
    this.#log(
      `delivery backlog applied: ${countWords(added)} added, ${countWords(already)} already`,
    );
    return { added, already };
  }

  /** A mailing's people by what happened, for its page. `people` gives each one's name and list. */
  mailingRows(
    mailingId: string,
    people: ReadonlyMap<string, { name: string; list: string }>,
    query: { view?: string | undefined; offset?: number | undefined },
  ): {
    delivery: MailingDelivery | null;
    warnings: DeliveryWarning[];
    rows: DeliveryRow[];
    offset: number;
    limit: number;
    total: number;
    counts_by_view: Record<DeliveryView, number>;
    retry: { count: number; on_stop_list: number };
    /** Of this mailing's people, how many wait for the press before they are stopped. */
    waiting_stops: number;
  } {
    const view: DeliveryView = DELIVERY_VIEWS.includes(query.view as DeliveryView)
      ? (query.view as DeliveryView)
      : "didnt";
    const offset = Math.max(0, Math.trunc(query.offset ?? 0) || 0);
    const summary = this.summary(mailingId);
    const file = summary ? this.#files.get(mailingId) : undefined;
    const standings = this.standings(mailingId);
    const waiting = new Set(this.#waiting().map((item) => item.email));
    const all: DeliveryRow[] = [];
    for (const recipient of file?.recipients ?? []) {
      const standing = standings?.get(recipient.email) ?? standingOf(recipient.events);
      const since = this.#hooks.stopSince(recipient.email);
      const person = people.get(recipient.email);
      all.push({
        email: recipient.email,
        name: person?.name ?? "",
        list: person?.list ?? "A list since removed",
        sent_at: recipient.sent_at,
        shown: standing.shown,
        delivery: standing.delivery,
        delivery_at: standing.delivery_at,
        reason: standing.reason,
        reaction: standing.reaction,
        reaction_at: standing.reaction_at,
        stop: {
          on: since !== null,
          since,
          waiting: since === null && waiting.has(recipient.email),
        },
      });
    }
    const counts = summary?.counts ?? NO_COUNTS;
    const retryable = all.filter((row) => isRetry(row.delivery));
    const inView: Record<DeliveryView, (row: DeliveryRow) => boolean> = {
      didnt: (row) =>
        row.delivery !== "delivered" && row.delivery !== "not_yet" && row.delivery !== "deferred",
      not_yet: (row) => row.delivery === "not_yet" || row.delivery === "deferred",
      retry: (row) => isRetry(row.delivery) && !row.stop.on,
      all: () => true,
    };
    const shown = all.filter(inView[view]);
    const retryCount = retryable.filter((row) => !row.stop.on).length;
    return {
      delivery: summary,
      warnings: summary ? warningsOf(summary.counts, "mailing") : [],
      rows: shown.slice(offset, offset + VIEW_PAGE),
      offset,
      limit: VIEW_PAGE,
      total: shown.length,
      counts_by_view: {
        didnt: counts.didnt_arrive,
        not_yet: counts.not_yet,
        retry: retryCount,
        all: all.length,
      },
      retry: { count: retryCount, on_stop_list: retryable.length - retryCount },
      waiting_stops: all.filter((row) => row.stop.waiting).length,
    };
  }

  /** Whom a retry would go to: a passing failure, and not on the stop list now. */
  retryable(mailingId: string): string[] {
    const standings = this.standings(mailingId);
    if (!standings) return [];
    const emails: string[] = [];
    for (const [email, standing] of standings)
      if (isRetry(standing.delivery) && this.#hooks.stopSince(email) === null) emails.push(email);
    return emails;
  }
}
