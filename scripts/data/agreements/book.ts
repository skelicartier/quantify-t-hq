/**
 * The legal-document register, kept whole in `agreements/agreements.json` (rewritten on
 * every change) with one line per change in `agreements/events.jsonl`. An agreement is
 * never deleted: it expires or ends, and stays.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import type { DataCore } from "../core";
import { cleanText, isDay } from "../guard";
import type { Staff } from "../protocol";
import {
  AGREEMENT_STATUSES,
  AGREEMENT_TYPES,
  FLAG_WORDS,
  PARTY_KINDS,
  SIGNING,
  countWords,
  dayWords,
} from "../../../src/lib/data/labels-registers";
import { AGREEMENT_LIMITS, AGREEMENT_TOTAL } from "./limits";
import type { Agreement, AgreementType, AgreementsEvent, Party } from "./types";

const AGREEMENTS = "agreements/agreements.json";
const EVENTS = "agreements/events.jsonl";

type Input = Record<string, unknown>;

export const CHOOSE = "Choose from the list.";
export const FUTURE = "That day is in the future.";
export const NOT_A_DAY = "That is not a day.";
const MONEY = "Type the amount as a number, such as 250000.";

const has = (input: Input, name: string) => Object.prototype.hasOwnProperty.call(input, name);
const isKey = <T extends object>(table: T, value: unknown): value is keyof T =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(table, value);
const blank = (value: unknown) => value === undefined || value === null || value === "";
const flag = (value: unknown): boolean => value === true || value === "true" || value === "on";

function whole(value: unknown, min: number, max: number, sentence: string): number | null {
  if (blank(value)) return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim());
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max)
    throw new Refused(400, "invalid", sentence);
  return parsed;
}

function day(value: unknown): string | null {
  if (blank(value)) return null;
  if (!isDay(value)) throw new Refused(400, "invalid", NOT_A_DAY);
  return value;
}

/** What a write may ask of the other modules: each answers null when it is not here. */
export type Refs = {
  today: string;
  /** The record's own name, null when there is no such record, undefined when its module is absent. */
  name(
    kind: "investor" | "waitlist" | "director",
    id: string,
    on: string,
  ): string | null | undefined;
};

const NOT_HERE: Record<"investor" | "waitlist" | "director", string> = {
  investor: "That firm is not here.",
  waitlist: "That firm is not here.",
  director: "That director is not here.",
};

export class AgreementsBook {
  readonly #core: DataCore;
  agreements: Agreement[];
  events: AgreementsEvent[];
  /** Under test routes, the next agreement made takes this id. */
  pinned: string | null = null;

  constructor(core: DataCore) {
    this.#core = core;
    core.store.ensureDir("agreements");
    const stored = core.store.readJson<{ agreements?: Agreement[] }>(AGREEMENTS, {});
    this.agreements = Array.isArray(stored.agreements)
      ? stored.agreements.filter(
          (item) => typeof item?.agreement_id === "string" && isKey(AGREEMENT_TYPES, item.type),
        )
      : [];
    this.events = core.store
      .readLines<AgreementsEvent>(EVENTS)
      .filter((event) => typeof event?.event_id === "string");
  }

  save(): void {
    this.#core.store.writeJson(AGREEMENTS, { format: 1, agreements: this.agreements });
  }

  event(agreement: Agreement, verb: string, detail: string, by: Staff): void {
    const event: AgreementsEvent = {
      event_id: randomUUID(),
      agreement_id: agreement.agreement_id,
      verb,
      detail,
      by,
      at: this.#core.now(),
    };
    this.events.push(event);
    this.#core.store.appendLine(EVENTS, event);
  }

  eventsOf(id: string): AgreementsEvent[] {
    return this.events
      .filter((event) => event.agreement_id === id)
      .reverse()
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  get(id: string | undefined): Agreement {
    const found = id ? this.agreements.find((item) => item.agreement_id === id) : undefined;
    if (!found) throw new Refused(404, "not_found", "That agreement is not here.");
    return found;
  }

  // ---------------------------------------------------------------- the fields

  #parties(value: unknown, refs: Refs, on: string): Party[] {
    const rows = (Array.isArray(value) ? value : [])
      .map((row) => (row && typeof row === "object" ? (row as Input) : {}))
      .filter((row) => !blank(row.name) || !blank(row.ref_id));
    if (rows.length === 0) throw new Refused(400, "invalid", "Name at least one other party.");
    if (rows.length > AGREEMENT_LIMITS.parties)
      throw new Refused(400, "invalid", `Name at most ${AGREEMENT_LIMITS.parties} other parties.`);
    return rows.map((row) => {
      const kind = blank(row.kind) ? "other" : row.kind;
      if (!isKey(PARTY_KINDS, kind)) throw new Refused(400, "invalid", CHOOSE);
      let name = cleanText(row.name, AGREEMENT_LIMITS.party_name);
      let refId: string | null = null;
      const asked = typeof row.ref_id === "string" ? row.ref_id.trim().slice(0, 64) : "";
      if (asked && (kind === "investor" || kind === "waitlist" || kind === "director")) {
        const found = refs.name(kind, asked, on);
        if (found === null) throw new Refused(404, "not_found", NOT_HERE[kind]);
        refId = asked;
        name = name || found || "";
      }
      if (!name) throw new Refused(400, "invalid", "Name at least one other party.");
      return {
        kind,
        ref_id: refId,
        name,
        entity: cleanText(row.entity, AGREEMENT_LIMITS.entity),
        country: cleanText(row.country, AGREEMENT_LIMITS.country),
      };
    });
  }

  #fields(input: Input, base: Agreement | null, refs: Refs) {
    const pick = (name: string) => has(input, name) || !base;
    const title = pick("title") ? cleanText(input.title, AGREEMENT_LIMITS.title) : base!.title;
    if (!title) throw new Refused(400, "invalid", "Give the agreement a title.");
    const type = pick("type") ? input.type : base!.type;
    if (!isKey(AGREEMENT_TYPES, type)) throw new Refused(400, "invalid", CHOOSE);
    const status = pick("status") ? (blank(input.status) ? "draft" : input.status) : base!.status;
    if (!isKey(AGREEMENT_STATUSES, status)) throw new Refused(400, "invalid", CHOOSE);
    const effective = pick("effective_on") ? day(input.effective_on) : base!.effective_on;
    const signed = pick("signed_on") ? day(input.signed_on) : base!.signed_on;
    if (signed && signed > refs.today) throw new Refused(400, "invalid", FUTURE);
    const parties = pick("parties")
      ? this.#parties(input.parties, refs, effective ?? signed ?? refs.today)
      : base!.parties;
    const months = pick("term_months")
      ? whole(
          input.term_months,
          1,
          AGREEMENT_LIMITS.months_max,
          "Type the term in whole months, from 1 to 600.",
        )
      : base!.term.months;
    const endsOn = pick("ends_on") ? day(input.ends_on) : base!.term.ends_on;
    const auto = pick("auto_renews") ? flag(input.auto_renews) : base!.renewal.auto;
    const renewalMonths = pick("renewal_months")
      ? whole(
          input.renewal_months,
          1,
          AGREEMENT_LIMITS.months_max,
          "Type the renewal term in whole months, from 1 to 600.",
        )
      : base!.renewal.months;
    const renewsOn = pick("renews_on") ? day(input.renews_on) : base!.renewal.renews_on;
    const noticeDays = pick("notice_days")
      ? whole(
          input.notice_days,
          1,
          AGREEMENT_LIMITS.notice_days_max,
          "Type the notice in whole days, from 1 to 365.",
        )
      : base!.renewal.notice_days;
    if (auto && !renewsOn) throw new Refused(400, "invalid", "Give the day it renews.");
    let value = base?.value ?? null;
    if (pick("value_amount") || pick("value_currency")) {
      const amount = whole(input.value_amount, 0, AGREEMENT_LIMITS.money_max, MONEY);
      const currency = blank(input.value_currency) ? "INR" : input.value_currency;
      if (currency !== "INR" && currency !== "USD") throw new Refused(400, "invalid", CHOOSE);
      value = amount === null ? null : { amount, currency };
    }
    const signing = pick("signing") ? (input.signing ?? "") : base!.signing;
    if (!isKey(SIGNING, signing)) throw new Refused(400, "invalid", CHOOSE);
    let stamp = base?.stamp ?? null;
    if (pick("stamp_state") || pick("stamp_amount") || pick("stamp_certificate_no")) {
      const state = cleanText(input.stamp_state, AGREEMENT_LIMITS.law);
      const amount = whole(input.stamp_amount, 0, AGREEMENT_LIMITS.money_max, MONEY);
      const certificate = cleanText(input.stamp_certificate_no, AGREEMENT_LIMITS.stamp_number);
      stamp =
        state || amount !== null || certificate
          ? { state, amount, certificate_no: certificate }
          : null;
    }
    const ipClause = pick("ip_clause") ? (input.ip_clause ?? "") : base!.ip_clause;
    const confidentiality = pick("confidentiality_clause")
      ? (input.confidentiality_clause ?? "")
      : base!.confidentiality_clause;
    if (!isKey(FLAG_WORDS, ipClause) || !isKey(FLAG_WORDS, confidentiality))
      throw new Refused(400, "invalid", CHOOSE);
    return {
      title,
      type: type as AgreementType,
      parties,
      status: status as Agreement["status"],
      effective_on: effective,
      signed_on: signed,
      term: { months, ends_on: endsOn },
      renewal: {
        auto,
        months: renewalMonths,
        renews_on: renewsOn,
        notice_days: noticeDays,
        notice_given: base?.renewal.notice_given ?? null,
      },
      terminate_for_convenience: pick("terminate_for_convenience")
        ? cleanText(input.terminate_for_convenience, AGREEMENT_LIMITS.short_terms)
        : base!.terminate_for_convenience,
      governing_law: pick("governing_law")
        ? cleanText(input.governing_law, AGREEMENT_LIMITS.law)
        : base!.governing_law,
      forum: pick("forum") ? cleanText(input.forum, AGREEMENT_LIMITS.law) : base!.forum,
      value,
      signing: signing as Agreement["signing"],
      stamp,
      related_party: pick("related_party") ? flag(input.related_party) : base!.related_party,
      personal_data: pick("personal_data") ? flag(input.personal_data) : base!.personal_data,
      ip_clause: ipClause as Agreement["ip_clause"],
      confidentiality_clause: confidentiality as Agreement["confidentiality_clause"],
      owner: pick("owner") ? cleanText(input.owner, AGREEMENT_LIMITS.owner) : base!.owner,
      review_on: pick("review_on") ? day(input.review_on) : base!.review_on,
      notes: pick("notes") ? cleanText(input.notes, AGREEMENT_LIMITS.notes) : base!.notes,
    };
  }

  // ---------------------------------------------------------------- writes

  add(input: Input, by: Staff, refs: Refs): Agreement {
    if (this.agreements.length >= AGREEMENT_TOTAL)
      throw new Refused(409, "too_many", `Data holds ${countWords(AGREEMENT_TOTAL)} at most.`);
    const fields = this.#fields(input, null, refs);
    const at = this.#core.now();
    const statusOn = day(input.status_on);
    const agreement: Agreement = {
      agreement_id: this.pinned ?? randomUUID(),
      ...fields,
      status_on:
        statusOn ?? (fields.status === "signed" ? (fields.signed_on ?? refs.today) : refs.today),
      signed_file_id: null,
      audit_trail_file_id: null,
      created_at: at,
      created_by: by,
      updated_at: at,
      updated_by: by,
    };
    if (this.agreements.some((item) => item.agreement_id === agreement.agreement_id))
      throw new Refused(409, "taken", "That agreement is already here.");
    this.pinned = null;
    this.agreements.push(agreement);
    this.save();
    this.event(agreement, "added", AGREEMENT_STATUSES[agreement.status].label, by);
    return agreement;
  }

  /** Checks an add before a copy is kept, without keeping anything. */
  check(input: Input, refs: Refs, base: Agreement | null = null): void {
    this.#fields(input, base, refs);
  }

  update(agreement: Agreement, input: Input, by: Staff, refs: Refs): Agreement {
    const before = JSON.stringify(agreement);
    Object.assign(agreement, this.#fields(input, agreement, refs));
    agreement.updated_at = this.#core.now();
    agreement.updated_by = by;
    this.save();
    if (JSON.stringify(agreement) !== before) this.event(agreement, "changed", "", by);
    return agreement;
  }

  setStatus(agreement: Agreement, input: Input, by: Staff, today: string): Agreement {
    if (!isKey(AGREEMENT_STATUSES, input.status)) throw new Refused(400, "invalid", CHOOSE);
    const on = blank(input.on) ? today : day(input.on)!;
    if (on > today) throw new Refused(400, "invalid", FUTURE);
    agreement.status = input.status as Agreement["status"];
    agreement.status_on = on;
    if (agreement.status === "signed" && !agreement.signed_on) agreement.signed_on = on;
    agreement.updated_at = this.#core.now();
    agreement.updated_by = by;
    this.save();
    this.event(
      agreement,
      "status",
      `${AGREEMENT_STATUSES[agreement.status].label} on ${dayWords(on)}`,
      by,
    );
    return agreement;
  }

  attach(
    agreement: Agreement,
    kind: "signed" | "audit_trail",
    fileId: string,
    title: string,
    by: Staff,
  ): Agreement {
    if (kind === "signed") agreement.signed_file_id = fileId;
    else agreement.audit_trail_file_id = fileId;
    agreement.updated_at = this.#core.now();
    agreement.updated_by = by;
    this.save();
    this.event(agreement, kind === "signed" ? "signed copy" : "signing record", title, by);
    return agreement;
  }

  noticeGiven(agreement: Agreement, input: Input, by: Staff, today: string): Agreement {
    if (!agreement.renewal.auto)
      throw new Refused(409, "not_renewing", "This agreement does not renew on its own.");
    const on = blank(input.on) ? today : day(input.on)!;
    if (on > today) throw new Refused(400, "invalid", FUTURE);
    agreement.renewal.notice_given = {
      on,
      note: cleanText(input.note, AGREEMENT_LIMITS.notice_note),
    };
    agreement.updated_at = this.#core.now();
    agreement.updated_by = by;
    this.save();
    this.event(agreement, "notice given", dayWords(on), by);
    return agreement;
  }
}
