/**
 * The investor book: every firm on the chosen Mail merge list or lists, one record each,
 * kept whole in `investors/firms.json`, with the choice in `investors/setup.json` and one
 * line per change in `investors/events.jsonl`.
 *
 * Firms are grouped by the address's domain (free mail is a firm of one). A firm starts at
 * "Written to" when Mail merge's written log shows a live send to anyone there, and at
 * "Not written to yet" otherwise; from then on the stage is his, moved on the record page
 * or by a reply. Amounts are kept in their own currency and summed per currency, never
 * across. Nothing here sends anything or writes outside `data/investors/`.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import type { DataCore } from "../core";
import { LIMITS, clean, cleanText, isDay, normaliseEmail } from "../guard";
import type { Staff } from "../protocol";
import type { SentMail, SenderList, Written } from "../sender-files";
import {
  AMOUNT_STATES,
  CURRENCIES,
  INSTRUMENTS,
  INTRO_STATUSES,
  INVESTOR_STAGES,
  INVESTOR_STAGE_ORDER,
  PASS_REASONS,
} from "../../../src/lib/data/labels";
import { domainOf, fieldOf, firmKeyOf } from "../leads/types";
import { amountValue } from "./amount";
import { deckLinkOf, introOf, offerDeadlineOf, profileOf, waveOf, withDefaults } from "./raise";
import {
  DATA_STAFF,
  MAIL_MERGE,
  NO_NEXT_STEP,
  defaultIntro,
  defaultProfile,
  investorIdOf,
  type Amount,
  type AmountState,
  type Currency,
  type Investor,
  type InvestorEvent,
  type InvestorRow,
  type InvestorStage,
  type LastTouch,
  type PassReason,
  type Person,
  type Setup,
} from "./types";

export { MAX_AMOUNT, amountValue } from "./amount";

const FIRMS = "investors/firms.json";
const SETUP = "investors/setup.json";
const EVENTS = "investors/events.jsonl";
export const MAX_LISTS = 10;

const STAGES = new Set<string>(INVESTOR_STAGE_ORDER);
const isStage = (value: unknown): value is InvestorStage =>
  typeof value === "string" && STAGES.has(value);

export const NEEDS_NEXT_STEP = "Give the next step and the day it is due by.";
export const NEEDS_REASON = "Say why they passed.";
export const NEEDS_UNTIL = "Say until when the firm is set aside.";

/** "$50,000", "₹2,500,000": the figure in its own currency, for an activity line. */
export function moneyWords(amount: number, currency: Currency): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(amount);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "11 Nov 2026": a calendar date as an activity line says it, never shifted into a zone. */
export function dayWords(day: string): string {
  const [year = "", month = "", date = ""] = day.split("-");
  return `${Number(date)} ${MONTHS[Number(month) - 1] ?? ""} ${year}`;
}

/** The newest amount on record: the one the list shows and the sums use. */
export function latestAmount(investor: Pick<Investor, "amounts">): Amount | null {
  let best: Amount | null = null;
  for (const amount of investor.amounts)
    if (!best || amount.on > best.on || (amount.on === best.on && amount.at >= best.at))
      best = amount;
  return best;
}

export type Money = Record<string, { soft: number; signed_and_in: number }>;

/**
 * Soft, and signed with money in, per currency, from each firm's newest amount. Never
 * added across currencies: $1 and ₹1 are kept apart, and a currency with nothing in it
 * is left out.
 */
export function moneyOf(investors: readonly Pick<Investor, "amounts">[]): Money {
  const money: Money = {};
  for (const investor of investors) {
    const latest = latestAmount(investor);
    if (!latest || latest.state === "asked") continue;
    const into = (money[latest.currency] ??= { soft: 0, signed_and_in: 0 });
    if (latest.state === "soft") into.soft += latest.amount;
    else into.signed_and_in += latest.amount;
  }
  return money;
}

type Grouped = {
  firm_key: string;
  domain: string;
  firm: string;
  people: Person[];
  list_ids: Set<string>;
  list_values: Record<string, string>;
};

const PERSON_FIELDS = new Set(["first_name", "last_name", "full_name", "title", "email_kind"]);

function valueBy(values: Record<string, string>, field: string): string {
  for (const [key, value] of Object.entries(values))
    if (fieldOf(key) === field && value?.trim()) return value.trim();
  return "";
}

/** One firm per domain from the lists' rows; free mail is a firm of one. */
export function groupLists(lists: readonly SenderList[]): Map<string, Grouped> {
  const firms = new Map<string, Grouped>();
  for (const list of lists) {
    const labels = new Map(list.columns.map((column) => [column.key, column.label]));
    for (const row of list.rows) {
      const email = normaliseEmail(row.email);
      if (!email) continue;
      const values = row.values ?? {};
      const kind = valueBy(values, "email_kind");
      const domainKey = firmKeyOf(email, kind);
      const firm_key = domainKey || `mail:${email}`;
      const name =
        row.name?.trim() ||
        valueBy(values, "full_name") ||
        [valueBy(values, "first_name"), valueBy(values, "last_name")].filter(Boolean).join(" ");
      const person: Person = { email, name, title: valueBy(values, "title"), from: "list" };
      let firm = firms.get(firm_key);
      if (!firm) {
        firm = {
          firm_key,
          domain: domainOf(email),
          firm: "",
          people: [],
          list_ids: new Set(),
          list_values: {},
        };
        firms.set(firm_key, firm);
      }
      firm.list_ids.add(list.id);
      if (!firm.firm) firm.firm = valueBy(values, "company");
      if (!firm.people.some((item) => item.email === email)) firm.people.push(person);
      for (const [key, value] of Object.entries(values)) {
        const field = fieldOf(key);
        if (!value?.trim() || (field && PERSON_FIELDS.has(field))) continue;
        if (value.trim().toLowerCase() === email || key === "email") continue;
        const label = labels.get(key) ?? key;
        if (!firm.list_values[label]) firm.list_values[label] = clean(value, LIMITS.title);
      }
    }
  }
  for (const firm of firms.values())
    if (!firm.firm)
      firm.firm = firm.firm_key.startsWith("mail:")
        ? firm.people[0]?.name || firm.people[0]?.email || firm.domain
        : firm.domain;
  return firms;
}

export type MoveInput = {
  stage: unknown;
  next_step: unknown;
  next_step_on: unknown;
  set_aside_until?: unknown;
  passed_reason?: unknown;
};

export type AmountInput = {
  state: unknown;
  amount: unknown;
  currency: unknown;
  instrument: unknown;
  on: unknown;
};

/** What the replies module knows of a firm, for its row: whether and when anyone replied. */
export type Touches = { replied: boolean; last_replied_at: string | null };

/** The newest of written to, replied and met, with which it was. */
export function lastTouchOf(
  written: string | null,
  replied: string | null,
  met: string | null,
): LastTouch {
  let touch: LastTouch = null;
  for (const [kind, at] of [
    ["written", written],
    ["replied", replied],
    ["met", met],
  ] as const)
    if (at && (!touch || at > touch.at)) touch = { kind, at };
  return touch;
}

export class InvestorsBook {
  readonly #core: DataCore;
  setup: Setup;
  readonly firms = new Map<string, Investor>();
  readonly events: InvestorEvent[] = [];
  /** Each firm's events, oldest first: the same objects as `events`. */
  readonly #eventsBy = new Map<string, InvestorEvent[]>();
  readonly #byEmail = new Map<string, string>();
  #listeners = new Set<() => void>();

  constructor(core: DataCore) {
    this.#core = core;
    core.store.ensureDir("investors");
    const setup = core.store.readJson<Partial<Setup>>(SETUP, {});
    this.setup = {
      list_ids: Array.isArray(setup.list_ids)
        ? setup.list_ids.filter((id): id is string => typeof id === "string")
        : [],
      set_at: typeof setup.set_at === "string" ? setup.set_at : null,
      set_by: setup.set_by ?? null,
    };
    // Format 1 (before the raise batch) or 2: every stored field is kept, each new one gets
    // its default, and the next save writes format 2 (raise spec §5.2).
    const stored = core.store.readJson<{ format?: number; firms?: Investor[] }>(FIRMS, {});
    for (const investor of Array.isArray(stored.firms) ? stored.firms : [])
      if (typeof investor?.investor_id === "string" && isStage(investor.stage))
        this.firms.set(investor.investor_id, withDefaults(investor));
    for (const line of core.store.readLines<InvestorEvent>(EVENTS))
      if (typeof line?.investor_id === "string") this.#keep(line);
    this.#reindex();
  }

  // ------------------------------------------------------------------ keeping it

  onChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #reindex(): void {
    this.#byEmail.clear();
    for (const investor of this.firms.values())
      for (const person of investor.people) this.#byEmail.set(person.email, investor.investor_id);
  }

  #keep(event: InvestorEvent): void {
    this.events.push(event);
    const list = this.#eventsBy.get(event.investor_id);
    if (list) list.push(event);
    else this.#eventsBy.set(event.investor_id, [event]);
  }

  save(): void {
    this.#core.store.writeJson(FIRMS, { format: 2, firms: [...this.firms.values()] });
    this.#reindex();
    for (const listener of this.#listeners) {
      try {
        listener();
      } catch {
        // a listener that fails does not stop the save
      }
    }
  }

  #event(
    investor: Investor,
    kind: InvestorEvent["kind"],
    title: string,
    by: Staff,
    extra: Partial<Pick<InvestorEvent, "from" | "to" | "detail">> = {},
  ): InvestorEvent {
    const event: InvestorEvent = {
      event_id: randomUUID(),
      investor_id: investor.investor_id,
      kind,
      from: extra.from ?? "",
      to: extra.to ?? "",
      title,
      detail: extra.detail ?? "",
      by,
      at: this.#core.now(),
    };
    this.#keep(event);
    this.#core.store.appendLine(EVENTS, event);
    return event;
  }

  /** Take firms' lines out of the activity log (rewritten whole, as it is rarely done). */
  forget(investorIds: ReadonlySet<string>): void {
    const kept = this.events.filter((event) => !investorIds.has(event.investor_id));
    this.events.splice(0, this.events.length, ...kept);
    for (const id of investorIds) this.#eventsBy.delete(id);
    this.#core.store.writeText(
      EVENTS,
      kept.map((event) => JSON.stringify(event)).join("\n") + (kept.length ? "\n" : ""),
    );
  }

  get(investorId: string | undefined): Investor | null {
    return investorId ? (this.firms.get(investorId) ?? null) : null;
  }

  mustGet(investorId: string | undefined): Investor {
    const investor = this.get(investorId);
    if (!investor) throw new Refused(404, "not_found", "That investor is not here.");
    return investor;
  }

  /** The firm an address is a person at: on the chosen list, or added to it since. */
  forEmail(email: string): Investor | null {
    const id = this.#byEmail.get(normaliseEmail(email) || email);
    return id ? (this.firms.get(id) ?? null) : null;
  }

  owns(email: string): boolean {
    return this.#byEmail.has(normaliseEmail(email) || email);
  }

  eventsOf(investorId: string): InvestorEvent[] {
    return [...(this.#eventsBy.get(investorId) ?? [])].sort((a, b) => b.at.localeCompare(a.at));
  }

  /** Whether the firm was ever at a meeting (booked or held), from its own history. */
  everMet(investor: Investor): boolean {
    if (investor.stage === "meeting" || investor.stage === "met") return true;
    return (this.#eventsBy.get(investor.investor_id) ?? []).some(
      (event) => event.kind === "stage" && (event.to === "meeting" || event.to === "met"),
    );
  }

  /** When the firm was last moved to Met, from its own history. */
  lastMetAt(investor: Investor): string | null {
    let last: string | null = null;
    for (const event of this.#eventsBy.get(investor.investor_id) ?? [])
      if (event.kind === "stage" && event.to === "met" && (last === null || event.at > last))
        last = event.at;
    return last;
  }

  /** Every stage the firm was moved to, with when: the seeded, written and stage lines. */
  movesOf(investor: Investor): { to: InvestorStage; at: string }[] {
    const moves: { to: InvestorStage; at: string }[] = [];
    for (const event of this.#eventsBy.get(investor.investor_id) ?? [])
      if (
        (event.kind === "seeded" || event.kind === "written" || event.kind === "stage") &&
        isStage(event.to)
      )
        moves.push({ to: event.to, at: event.at });
    return moves;
  }

  // ------------------------------------------------------------------ Mail merge's side

  /** Every live send to anyone at the firm, from the written log (tests and practice never). */
  writtenTo(investor: Investor): Written[] {
    const lines: Written[] = [];
    for (const person of investor.people) lines.push(...this.#core.sender.writtenFor(person.email));
    return lines.sort((a, b) => a.at.localeCompare(b.at));
  }

  lastWritten(investor: Investor): Written | null {
    const lines = this.writtenTo(investor);
    return lines[lines.length - 1] ?? null;
  }

  /** What Mail merge sent to the firm's people, newest first, as it was made then. */
  sentTo(investor: Investor): (SentMail & { email: string; name: string })[] {
    const sent: (SentMail & { email: string; name: string })[] = [];
    for (const person of investor.people)
      for (const mail of this.#core.sender.sentMail(person.email))
        sent.push({ ...mail, email: person.email, name: person.name });
    return sent.sort((a, b) => b.at.localeCompare(a.at));
  }

  /** A firm still "Not written to yet" moves to "Written to" once Mail merge writes there. */
  refreshWritten(): number {
    let moved = 0;
    for (const investor of this.firms.values()) {
      if (investor.stage !== "not_written") continue;
      const first = this.writtenTo(investor)[0];
      if (!first) continue;
      investor.stage = "written";
      investor.stage_since = first.at;
      investor.updated_at = this.#core.now();
      this.#event(investor, "written", `Written to by “${first.mailing}”`, MAIL_MERGE, {
        from: "not_written",
        to: "written",
      });
      moved += 1;
    }
    if (moved) this.save();
    return moved;
  }

  // ------------------------------------------------------------------ choosing the list

  /**
   * Group the chosen lists' rows into firms. A firm already here keeps everything he
   * recorded and takes the list's people and columns afresh; a firm no longer on the
   * lists is dropped only when nothing was recorded on it, and kept (off the list) when
   * something was.
   */
  choose(listIds: readonly string[], by: Staff): { firms: number; added: number; kept: number } {
    this.#core.sender.poll();
    const ids = [...new Set(listIds.map((id) => clean(id, 64)).filter(Boolean))];
    if (ids.length === 0) throw new Refused(400, "invalid", "Choose the investor list.");
    if (ids.length > MAX_LISTS)
      throw new Refused(400, "invalid", `Choose ${MAX_LISTS} lists at most.`);
    const lists: SenderList[] = [];
    for (const id of ids) {
      const list = this.#core.sender.list(id);
      if (!list) throw new Refused(404, "not_found", "That list is no longer in Mail merge.");
      lists.push(list);
    }
    const added = this.#regroup(lists, by);
    this.setup = { list_ids: ids, set_at: this.#core.now(), set_by: by };
    this.#core.store.writeJson(SETUP, this.setup);
    this.save();
    this.refreshWritten();
    return { firms: this.firms.size, added, kept: this.firms.size - added };
  }

  /** The chosen lists changed in Mail merge (rows added or taken out): group them again. */
  regroupChosen(): void {
    if (this.setup.list_ids.length === 0) return;
    const lists = this.setup.list_ids
      .map((id) => this.#core.sender.list(id))
      .filter((list): list is SenderList => list !== null);
    this.#regroup(lists, DATA_STAFF);
    this.save();
    this.refreshWritten();
  }

  #regroup(lists: readonly SenderList[], by: Staff): number {
    const grouped = groupLists(lists);
    const now = this.#core.now();
    let added = 0;
    const seen = new Set<string>();
    for (const firm of grouped.values()) {
      const investor_id = investorIdOf(firm.firm_key);
      seen.add(investor_id);
      const existing = this.firms.get(investor_id);
      if (existing) {
        const added_people = existing.people.filter(
          (person) =>
            person.from === "added" && !firm.people.some((item) => item.email === person.email),
        );
        existing.people = [...firm.people, ...added_people];
        existing.list_ids = [...firm.list_ids];
        existing.list_values = { ...existing.list_values, ...firm.list_values };
        existing.updated_at = now;
        continue;
      }
      const writtenFirst = firm.people
        .flatMap((person) => this.#core.sender.writtenFor(person.email))
        .sort((a, b) => a.at.localeCompare(b.at))[0];
      const investor: Investor = {
        investor_id,
        firm_key: firm.firm_key,
        firm: clean(firm.firm, LIMITS.title),
        domain: firm.domain,
        list_ids: [...firm.list_ids],
        list_values: firm.list_values,
        people: firm.people,
        stage: writtenFirst ? "written" : "not_written",
        stage_since: writtenFirst?.at ?? now,
        next_step: "",
        next_step_on: null,
        set_aside_until: null,
        passed_reason: "",
        owner: "",
        amounts: [],
        profile: defaultProfile(),
        intro: defaultIntro(),
        wave: "",
        offer_deadline: null,
        deck_link: "",
        touched: false,
        created_at: now,
        updated_at: now,
      };
      this.firms.set(investor_id, investor);
      this.#event(
        investor,
        "seeded",
        writtenFirst
          ? `From the list, written to by “${writtenFirst.mailing}”`
          : "From the list, not written to yet",
        by,
        { to: investor.stage },
      );
      added += 1;
    }
    const dropped = new Set<string>();
    for (const [investor_id, investor] of this.firms) {
      if (seen.has(investor_id)) continue;
      if (investor.touched) investor.list_ids = [];
      else {
        this.firms.delete(investor_id);
        dropped.add(investor_id);
      }
    }
    // A firm dropped untouched had only the list's and Mail merge's lines: they go with it,
    // so a firm that comes back later starts its activity afresh.
    if (dropped.size) this.forget(dropped);
    return added;
  }

  // ------------------------------------------------------------------ his changes

  /** Move a firm to a stage, with what it asks for (spec §2.7). */
  move(investor: Investor, input: MoveInput, by: Staff): Investor {
    const today = this.#core.day();
    if (!isStage(input.stage)) throw new Refused(400, "invalid", "Choose a stage.");
    const stage = input.stage;
    let next_step = "";
    let next_step_on: string | null = null;
    if (!NO_NEXT_STEP.has(stage)) {
      next_step = cleanText(input.next_step, LIMITS.title);
      const on = clean(input.next_step_on, 10);
      if (!next_step || !isDay(on)) throw new Refused(400, "needs_next_step", NEEDS_NEXT_STEP);
      if (on < today) throw new Refused(400, "invalid", "The next step's day is in the past.");
      next_step_on = on;
    }
    let set_aside_until: string | null = null;
    if (stage === "set_aside") {
      const until = clean(input.set_aside_until, 10);
      if (!isDay(until)) throw new Refused(400, "invalid", NEEDS_UNTIL);
      if (until < today) throw new Refused(400, "invalid", "That day is in the past.");
      set_aside_until = until;
    }
    let passed_reason: PassReason | "" = "";
    if (stage === "passed") {
      const reason = clean(input.passed_reason, 40);
      if (!(reason in PASS_REASONS)) throw new Refused(400, "needs_reason", NEEDS_REASON);
      passed_reason = reason as PassReason;
    }
    this.#setStage(
      investor,
      stage,
      { next_step, next_step_on, set_aside_until, passed_reason },
      by,
    );
    investor.touched = true;
    this.save();
    return investor;
  }

  /** The stage and what goes with it, with one event; the same stage only changes the step. */
  #setStage(
    investor: Investor,
    stage: InvestorStage,
    patch: Pick<Investor, "next_step" | "next_step_on" | "set_aside_until" | "passed_reason">,
    by: Staff,
    why = "",
  ): { from: InvestorStage; to: InvestorStage } {
    const from = investor.stage;
    const now = this.#core.now();
    investor.next_step = patch.next_step;
    investor.next_step_on = patch.next_step_on;
    investor.set_aside_until = patch.set_aside_until;
    investor.passed_reason = patch.passed_reason;
    investor.updated_at = now;
    const step = patch.next_step
      ? `Next: ${patch.next_step}${patch.next_step_on ? ` by ${dayWords(patch.next_step_on)}` : ""}`
      : "";
    const detail = [
      why,
      stage === "passed" && patch.passed_reason ? PASS_REASONS[patch.passed_reason] : "",
      stage === "set_aside" && patch.set_aside_until
        ? `Until ${dayWords(patch.set_aside_until)}`
        : "",
      step,
    ]
      .filter(Boolean)
      .join(" · ");
    if (from === stage) {
      this.#event(investor, "update", "Next step changed", by, { detail });
      return { from, to: stage };
    }
    investor.stage = stage;
    investor.stage_since = now;
    this.#event(
      investor,
      "stage",
      `${INVESTOR_STAGES[from].label} → ${INVESTOR_STAGES[stage].label}`,
      by,
      { from, to: stage, detail },
    );
    return { from, to: stage };
  }

  /** What a reply does to the firm (the interceptor's half): the stage, with its reason. */
  replyMoves(
    investor: Investor,
    stage: InvestorStage,
    patch: Pick<Investor, "next_step" | "next_step_on" | "set_aside_until" | "passed_reason">,
    by: Staff,
    why: string,
  ): { from: InvestorStage; to: InvestorStage } {
    const moved = this.#setStage(investor, stage, patch, by, why);
    investor.touched = true;
    return moved;
  }

  /** A line on the firm's activity for a reply that did not move it. */
  replyNote(investor: Investor, title: string, by: Staff, detail = ""): void {
    investor.touched = true;
    investor.updated_at = this.#core.now();
    this.#event(investor, "reply", title, by, { detail });
  }

  addPerson(
    investor: Investor,
    person: { email: string; name: string; title: string },
    by: Staff,
    why: string,
  ): boolean {
    const email = normaliseEmail(person.email);
    if (!email) throw new Refused(400, "invalid", "That is not an email address.");
    if (investor.people.some((item) => item.email === email)) return false;
    const other = this.forEmail(email);
    if (other && other.investor_id !== investor.investor_id)
      throw new Refused(409, "invalid", `${email} is already a person at ${other.firm}.`);
    investor.people.push({
      email,
      name: cleanText(person.name, LIMITS.name),
      title: cleanText(person.title, LIMITS.title),
      from: "added",
    });
    investor.touched = true;
    investor.updated_at = this.#core.now();
    this.#event(investor, "person", `Added ${person.name || email}`, by, { detail: why });
    return true;
  }

  recordAmount(investor: Investor, input: AmountInput, by: Staff): Amount {
    const state = clean(input.state, 20);
    if (!(state in AMOUNT_STATES))
      throw new Refused(400, "invalid", "Choose Asked, Soft, Signed or Money in.");
    const amount = amountValue(input.amount);
    if (amount === null)
      throw new Refused(400, "invalid", "Type the amount as a number, such as 50000.");
    const currency = clean(input.currency, 3).toUpperCase();
    if (!(CURRENCIES as readonly string[]).includes(currency))
      throw new Refused(400, "invalid", "Choose USD or INR.");
    const instrument = clean(input.instrument, 40) || "Not decided";
    if (!(INSTRUMENTS as readonly string[]).includes(instrument))
      throw new Refused(400, "invalid", "Choose the instrument.");
    const on = clean(input.on, 10) || this.#core.day();
    if (!isDay(on)) throw new Refused(400, "invalid", "That is not a day.");
    const record: Amount = {
      amount_id: randomUUID(),
      state: state as AmountState,
      amount,
      currency: currency as Currency,
      instrument,
      on,
      by,
      at: this.#core.now(),
    };
    investor.amounts.push(record);
    investor.touched = true;
    investor.updated_at = record.at;
    this.#event(
      investor,
      "amount",
      `${AMOUNT_STATES[record.state]}: ${moneyWords(amount, record.currency)}`,
      by,
      { detail: `${instrument} · on ${dayWords(on)}` },
    );
    this.save();
    return record;
  }

  addNote(investor: Investor, text: unknown, by: Staff): InvestorEvent {
    const note = cleanText(text, LIMITS.notes);
    if (!note) throw new Refused(400, "invalid", "Write the note first.");
    investor.touched = true;
    investor.updated_at = this.#core.now();
    const event = this.#event(investor, "note", "Note", by, { detail: note });
    this.save();
    return event;
  }

  /**
   * One field from the record's side: the firm's name, the owner, the next step or its day;
   * and the raise's three (the wave, the offer deadline, the deck link), each an event "raise".
   */
  update(investor: Investor, field: unknown, value: unknown, by: Staff): Investor {
    const name = clean(field, 40);
    const today = this.#core.day();
    let detail = "";
    let kind: "update" | "raise" = "update";
    switch (name) {
      case "wave": {
        investor.wave = waveOf(value);
        detail = investor.wave ? `Wave: ${investor.wave}` : "Wave: none";
        kind = "raise";
        break;
      }
      case "offer_deadline": {
        investor.offer_deadline = offerDeadlineOf(value, today);
        detail = `Offer deadline: ${investor.offer_deadline ? dayWords(investor.offer_deadline) : "None set"}`;
        kind = "raise";
        break;
      }
      case "deck_link": {
        investor.deck_link = deckLinkOf(value);
        detail = investor.deck_link ? "Deck link: set" : "Deck link: cleared";
        kind = "raise";
        break;
      }
      case "firm": {
        const firm = cleanText(value, LIMITS.title);
        if (!firm) throw new Refused(400, "invalid", "The firm needs a name.");
        investor.firm = firm;
        detail = `Firm: ${firm}`;
        break;
      }
      case "owner": {
        investor.owner = cleanText(value, LIMITS.name);
        detail = `Owner: ${investor.owner || "None set"}`;
        break;
      }
      case "next_step": {
        const step = cleanText(value, LIMITS.title);
        if (!step && !NO_NEXT_STEP.has(investor.stage))
          throw new Refused(400, "needs_next_step", NEEDS_NEXT_STEP);
        investor.next_step = step;
        detail = `Next step: ${step || "None set"}`;
        break;
      }
      case "next_step_on": {
        const on = clean(value, 10);
        if (!on) {
          if (!NO_NEXT_STEP.has(investor.stage))
            throw new Refused(400, "needs_next_step", NEEDS_NEXT_STEP);
          investor.next_step_on = null;
        } else {
          if (!isDay(on)) throw new Refused(400, "invalid", "That is not a day.");
          if (on < today) throw new Refused(400, "invalid", "That day is in the past.");
          investor.next_step_on = on;
        }
        detail = `By: ${investor.next_step_on ? dayWords(investor.next_step_on) : "None set"}`;
        break;
      }
      default:
        throw new Refused(400, "invalid", "That cannot be changed here.");
    }
    investor.touched = true;
    investor.updated_at = this.#core.now();
    this.#event(investor, kind, "Changed", by, { detail });
    this.save();
    return investor;
  }

  // ------------------------------------------------------------------ the raise (spec §5)

  /** "Qualify": the whole profile at once, as the form sends it. */
  qualify(investor: Investor, body: Record<string, unknown>, by: Staff): Investor {
    investor.profile = profileOf(body);
    investor.touched = true;
    investor.updated_at = this.#core.now();
    this.#event(investor, "profile", "Qualification changed", by);
    this.save();
    return investor;
  }

  /** "Introduction": its status, who makes it (a contact when he chose one), and the day. */
  introduce(
    investor: Investor,
    body: Record<string, unknown>,
    contact: ((contactId: string) => { name: string } | null) | null,
    by: Staff,
  ): Investor {
    const intro = introOf(body, this.#core.day(), contact);
    investor.intro = intro;
    investor.touched = true;
    investor.updated_at = this.#core.now();
    this.#event(investor, "intro", `Introduction: ${INTRO_STATUSES[intro.status].label}`, by, {
      detail: [intro.introducer, intro.on ? `on ${dayWords(intro.on)}` : ""]
        .filter(Boolean)
        .join(" · "),
    });
    this.save();
    return investor;
  }

  /** "Set the wave" for every firm a list shows: one line on each firm whose wave changed. */
  setWave(investors: readonly Investor[], value: unknown, by: Staff): number {
    const wave = waveOf(value);
    const now = this.#core.now();
    let changed = 0;
    for (const investor of investors) {
      if (investor.wave === wave) continue;
      investor.wave = wave;
      investor.touched = true;
      investor.updated_at = now;
      this.#event(investor, "raise", "Changed", by, {
        detail: wave ? `Wave: ${wave}` : "Wave: none",
      });
      changed += 1;
    }
    if (changed) this.save();
    return changed;
  }

  // ------------------------------------------------------------------ reading

  rowOf(investor: Investor, touches: (investor: Investor) => Touches): InvestorRow {
    const last = this.lastWritten(investor);
    const heard = touches(investor);
    const contact =
      investor.people.find((person) => this.#core.sender.writtenFor(person.email).length > 0) ??
      investor.people[0] ??
      null;
    const latest = latestAmount(investor);
    return {
      investor_id: investor.investor_id,
      firm: investor.firm,
      domain: investor.domain,
      free_mail: investor.firm_key.startsWith("mail:"),
      contact: contact ? { email: contact.email, name: contact.name, title: contact.title } : null,
      people: investor.people.length,
      stage: investor.stage,
      stage_since: investor.stage_since,
      last_written_at: last?.at ?? null,
      last_mailing: last?.mailing ?? "",
      next_step: investor.next_step,
      next_step_on: investor.next_step_on,
      set_aside_until: investor.set_aside_until,
      amount: latest
        ? {
            state: latest.state,
            amount: latest.amount,
            currency: latest.currency,
            instrument: latest.instrument,
          }
        : null,
      on_list: investor.list_ids.length > 0,
      replied: heard.replied,
      wave: investor.wave,
      warm: investor.intro.status === "made",
      last_touch: lastTouchOf(last?.at ?? null, heard.last_replied_at, this.lastMetAt(investor)),
    };
  }

  searchText(investor: Investor): string {
    return [
      investor.firm,
      investor.domain,
      investor.owner,
      investor.next_step,
      ...investor.people.flatMap((person) => [person.email, person.name, person.title]),
      ...Object.values(investor.list_values),
      investor.wave,
      investor.intro.introducer,
      ...investor.profile.sectors,
      investor.profile.conflict,
    ]
      .join(" ")
      .toLowerCase();
  }

  sorted(): Investor[] {
    return [...this.firms.values()].sort(
      (a, b) =>
        INVESTOR_STAGE_ORDER.indexOf(a.stage) - INVESTOR_STAGE_ORDER.indexOf(b.stage) ||
        a.firm.localeCompare(b.firm, "en", { sensitivity: "base", numeric: true }),
    );
  }
}
