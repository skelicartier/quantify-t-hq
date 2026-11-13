/**
 * Recording a reply, and what it does (spec §3.8), in this order: check what was given;
 * find the lead (or add one when asked); let an interceptor take it over; run the
 * outcome's effects; append the reply with its effects; answer with the sentence.
 *
 * A yes goes to the waitlist through `core.need("waitlist")` and is refused with a
 * sentence when there is none. A no goes onto Mail merge's own stop list through the
 * engine bridge, never anywhere else. Later, out of office, a wrong person and a question
 * each leave a follow-up. Nothing is ever sent.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import type { DataCore } from "../core";
import { addDays, addWorkingDays, workingDayAfter } from "../days";
import { LIMITS, clean, cleanText, isDay, normaliseEmail } from "../guard";
import type { Staff } from "../protocol";
import { INVESTOR_STAGES, OUTCOMES, type Outcome } from "../../../src/lib/data/labels";
import type { Effect, Reply, ReplyRow, TakeBack, WaitlistService } from "../leads/contracts";
import type { LeadsInternal } from "../leads/index";
import { shortDay, type LeadRow, type ReplyMark } from "../leads/types";
import type { FollowUps } from "./follow-ups";
import type { Interceptors } from "./interceptors";

const FILE = "replies/replies.jsonl";

export const OUTCOME_KEYS: readonly Outcome[] = [
  "replied_positive",
  "not_interested",
  "not_now",
  "out_of_office",
  "wrong_person",
  "question",
];

export const WAITLIST_MISSING = "The waitlist is not set up here yet.";
export const NOT_A_LEAD =
  "No lead has that address. Tick “If they are not a lead yet, add them” to record it.";

/** Every reply and every take-back, as appended; read whole at start. */
export class RepliesBook {
  readonly #store: DataStore;
  readonly replies: Reply[] = [];
  readonly byId = new Map<string, Reply>();
  readonly byEmail = new Map<string, Reply[]>();
  readonly takeBacks = new Map<string, TakeBack>();

  constructor(store: DataStore) {
    this.#store = store;
    store.ensureDir("replies");
    for (const line of store.readLines<Reply | TakeBack>(FILE)) {
      if (line?.kind === "reply" && typeof line.reply_id === "string") this.#keep(line);
      else if (line?.kind === "take_back" && typeof line.reply_id === "string")
        this.takeBacks.set(line.reply_id, line);
    }
  }

  #keep(reply: Reply): void {
    this.replies.push(reply);
    this.byId.set(reply.reply_id, reply);
    const list = this.byEmail.get(reply.email);
    if (list) list.push(reply);
    else this.byEmail.set(reply.email, [reply]);
  }

  append(reply: Reply): void {
    this.#store.appendLine(FILE, reply);
    this.#keep(reply);
  }

  appendTakeBack(takeBack: TakeBack): void {
    this.#store.appendLine(FILE, takeBack);
    this.takeBacks.set(takeBack.reply_id, takeBack);
  }

  /** The newest reply to an address that has not been taken back: what sets the lead's status. */
  markFor(email: string): ReplyMark | null {
    let best: Reply | null = null;
    let saidNo = false;
    for (const reply of this.byEmail.get(email) ?? []) {
      if (this.takeBacks.has(reply.reply_id)) continue;
      if (reply.outcome === "not_interested") saidNo = true;
      if (
        !best ||
        reply.received_at > best.received_at ||
        (reply.received_at === best.received_at && reply.recorded_at > best.recorded_at)
      )
        best = reply;
    }
    if (!best) return null;
    return {
      reply_id: best.reply_id,
      outcome: best.outcome,
      received_at: best.received_at,
      later_until: best.later_until,
      referral_name: best.referral?.name || best.referral?.email || "",
      said_no: saidNo,
      went: best.effects.some((effect) => effect.kind === "waitlist_joined")
        ? "waitlist"
        : best.effects.some((effect) => effect.kind === "investor_stage")
          ? "investors"
          : null,
    };
  }
}

type DataStore = DataCore["store"];

export type RecordInput = {
  email: string;
  outcome: Outcome;
  words: string;
  subject: string;
  received_at: string;
  later_until: string | null;
  referral: { name: string; email: string; title: string } | null;
  add_if_missing: boolean;
};

/** A reply as the form sends it, checked; refusals are the form's own sentences. */
export function readRecordInput(
  body: Record<string, unknown>,
  now: string,
  today: string,
): RecordInput {
  const email = normaliseEmail(clean(body.email, LIMITS.email));
  if (!email) throw new Refused(400, "invalid", "That is not an email address.");
  let outcome = clean(body.outcome, 40) as Outcome;
  if (!OUTCOME_KEYS.includes(outcome))
    throw new Refused(400, "invalid", "Choose what their answer was.");
  const flag = (value: unknown) => value === true || value === "on" || value === "true";
  if (outcome === "not_now" && flag(body.auto_reply)) outcome = "out_of_office";
  const words = cleanText(body.words, LIMITS.words);
  const subject = cleanText(body.subject, LIMITS.subject);
  const typed = clean(body.received_at, 40);
  const parsed = typed ? Date.parse(typed) : Number.NaN;
  if (typed && !Number.isFinite(parsed))
    throw new Refused(400, "invalid", "When their reply arrived is not a date and time.");
  if (Number.isFinite(parsed) && parsed > Date.parse(now) + 10 * 60_000)
    throw new Refused(400, "invalid", "Their reply cannot have arrived in the future.");
  const received_at = Number.isFinite(parsed) ? new Date(parsed).toISOString() : now;
  let later_until: string | null = null;
  if (outcome === "not_now" || outcome === "out_of_office") {
    const day = clean(body.later_until, 10);
    if (day && !isDay(day)) throw new Refused(400, "invalid", "That is not a day.");
    later_until = day || addDays(today, 14);
    if (later_until < today)
      throw new Refused(400, "invalid", "The day to write again is in the past.");
  }
  let referral: RecordInput["referral"] = null;
  if (outcome === "wrong_person") {
    const given =
      body.referral && typeof body.referral === "object" && !Array.isArray(body.referral)
        ? (body.referral as Record<string, unknown>)
        : {};
    const name = cleanText(given.name, LIMITS.referral);
    const rawEmail = clean(given.email, LIMITS.email);
    const referralEmail = rawEmail ? normaliseEmail(rawEmail) : "";
    if (rawEmail && !referralEmail)
      throw new Refused(400, "invalid", "The address they named is not an email address.");
    if (referralEmail === email)
      throw new Refused(
        400,
        "invalid",
        "They named their own address; record it as another answer.",
      );
    const title = cleanText(given.title, LIMITS.referral);
    referral = name || referralEmail || title ? { name, email: referralEmail, title } : null;
  }
  return {
    email,
    outcome,
    words,
    subject,
    received_at,
    later_until,
    referral,
    add_if_missing: flag(body.add_if_missing),
  };
}

export type RecordContext = {
  core: DataCore;
  leads: LeadsInternal;
  book: RepliesBook;
  followUps: FollowUps;
  interceptors: Interceptors;
};

export function rowOf(reply: Reply, context: RecordContext): ReplyRow {
  const lead = context.leads.byEmail(reply.email);
  const takeBack = context.book.takeBacks.get(reply.reply_id);
  return {
    ...reply,
    name: lead?.name ?? "",
    firm: lead?.company ?? "",
    taken_back: takeBack
      ? { at: takeBack.at, by: takeBack.by, undone: takeBack.undone, kept: takeBack.kept }
      : null,
  };
}

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString("en-GB")} ${count === 1 ? one : many}`;

/** Record one reply and do what it means; the answer carries the sentence to show. */
export async function recordReply(
  input: RecordInput,
  by: Staff,
  attempt: string | null,
  context: RecordContext,
): Promise<{ reply: ReplyRow; message: string; href: string | null }> {
  const { core, leads, followUps } = context;
  const now = core.now();
  const today = core.day();
  const interceptor = context.interceptors.ownerOf(input.email);
  const waitlist = core.need<WaitlistService>("waitlist");
  // Refused before anything is written, so the lead stands as it was.
  if (input.outcome === "replied_positive" && !interceptor && !waitlist)
    throw new Refused(409, "waitlist_missing", WAITLIST_MISSING);

  const effects: Effect[] = [];
  let lead: LeadRow | null = leads.byEmail(input.email);
  if (!lead) {
    if (!input.add_if_missing) throw new Refused(409, "not_a_lead", NOT_A_LEAD);
    lead = leads.addManual({
      email: input.email,
      values: {},
      origin: "reply",
      referred_by: null,
      by,
    });
    effects.push({ kind: "lead_added", lead_id: lead.lead_id, email: lead.email });
  }
  const name = lead.name || lead.email;
  core.sender.poll();
  const last = [...core.sender.writtenFor(input.email)].sort((a, b) => b.at.localeCompare(a.at))[0];
  const reply: Reply = {
    kind: "reply",
    reply_id: randomUUID(),
    email: input.email,
    lead_id: lead.lead_id,
    outcome: input.outcome,
    received_at: input.received_at,
    subject: input.subject,
    words: input.words,
    later_until: input.later_until,
    referral: input.referral,
    mailing_id: last?.mailing_id ?? null,
    mailing: last?.mailing ?? "",
    recorded_at: now,
    recorded_by: by,
    effects,
    attempt: attempt ?? "",
  };
  const followUp = (
    kind: Parameters<FollowUps["add"]>[0]["kind"],
    title: string,
    dueOn: string,
    on: LeadRow = lead!,
    note = "",
  ) => {
    const item = followUps.add({
      lead_id: on.lead_id,
      email: on.email,
      name: on.name || on.email,
      kind,
      title,
      due_on: dueOn,
      from_reply_id: reply.reply_id,
      note,
      at: now,
    });
    effects.push({ kind: "follow_up", follow_up_id: item.follow_up_id });
    return item;
  };

  let message = "";
  let href: string | null = null;

  /** Every "no" reaches the stop list, an investor's too: his rule. */
  const stop = async (): Promise<boolean> => {
    try {
      const answer = (await core.engine("addStops", { emails: input.email, reason: "asked" })) as {
        added?: number;
      };
      core.sender.poll();
      const at = core.sender.stop(input.email)?.at;
      effects.push(
        (answer.added ?? 0) > 0
          ? { kind: "stop_added", email: input.email, ...(at ? { at } : {}) }
          : { kind: "stop_already", email: input.email },
      );
      return true;
    } catch {
      effects.push({ kind: "stop_failed", email: input.email });
      followUp("other", `Put ${input.email} on the stop list`, today);
      return false;
    }
  };

  if (interceptor) {
    effects.push(...(await interceptor.apply(reply, { lead, by })));
    const moved = effects.find((effect) => effect.kind === "investor_stage");
    const stage =
      moved?.kind === "investor_stage"
        ? (INVESTOR_STAGES[moved.to as keyof typeof INVESTOR_STAGES]?.label ?? moved.to)
        : "";
    if (
      input.outcome === "not_interested" &&
      !effects.some((effect) => effect.kind.startsWith("stop_"))
    )
      await stop();
    if (input.outcome === "question")
      followUp("answer", `Answer ${name}'s question`, today, lead, input.words);
    const said: Record<Outcome, string> = {
      replied_positive: "said yes",
      not_interested: "said no",
      not_now: "said later",
      out_of_office: "is out of office",
      wrong_person: "named someone else",
      question: "asked a question",
    };
    message = stage
      ? `Recorded: ${name} ${said[input.outcome]}. ${lead.company || "The firm"} moves to ${stage} in Investors${input.outcome === "replied_positive" ? ", not the waitlist" : ""}.`
      : `Recorded: ${name} ${said[input.outcome]}.`;
  } else {
    switch (input.outcome) {
      case "replied_positive": {
        const firmKey = leads.firmKeyOf(input.email, lead.email_kind) || `mail:${input.email}`;
        const joined = waitlist!.joinFromReply({ reply, lead, firmKey, by });
        effects.push({
          kind: "waitlist_joined",
          entry_id: joined.entry_id,
          created: joined.created,
        });
        message = `Recorded: ${name} said yes. ${joined.firm || lead.company || "The firm"} is on the waitlist.`;
        if (joined.unsent > 0) {
          message += ` ${plural(joined.unsent, "other address", "other addresses")} at ${lead.domain} ${joined.unsent === 1 ? "has" : "have"} not been written to yet: see them on the firm's page.`;
          href = joined.href;
        }
        break;
      }
      case "not_interested": {
        const stopped = await stop();
        message = stopped
          ? `Recorded: ${name} said no. They are on the stop list and will not be written to again.`
          : `Recorded: ${name} said no, but Mail merge's stop list could not be reached: a follow-up for today asks you to add them.`;
        break;
      }
      case "not_now": {
        followUp("write_again", `Write to ${name} again`, input.later_until!);
        message = `Recorded: later. A reminder is set for ${shortDay(input.later_until!, today)}.`;
        break;
      }
      case "out_of_office": {
        const back = workingDayAfter(input.later_until!);
        followUp("write_again", `Write to ${name} again`, back);
        message = `Recorded: out of office until ${shortDay(input.later_until!, today)}. A reminder is set for ${shortDay(back, today)}.`;
        break;
      }
      case "wrong_person": {
        const due = addWorkingDays(today, 2);
        const named = input.referral?.name || input.referral?.email || "the person they named";
        if (input.referral?.email) {
          let referred = leads.byEmail(input.referral.email);
          if (!referred) {
            referred = leads.addManual({
              email: input.referral.email,
              values: {
                full_name: input.referral.name,
                title: input.referral.title,
                company: lead.company,
                firm_type: lead.firm_type,
                country: lead.country,
                city: lead.city,
              },
              origin: "referral",
              referred_by: input.email,
              by,
            });
            leads.tag(referred.lead_id, ["Referral"], [], by);
            effects.push({ kind: "lead_added", lead_id: referred.lead_id, email: referred.email });
            followUp("write_to_named", `Write to ${named}, named by ${name}`, due, referred);
            message = `Recorded: wrong person. ${named} is added as a lead, with a follow-up for ${shortDay(due, today)}.`;
          } else {
            followUp("write_to_named", `Write to ${named}, named by ${name}`, due, referred);
            message = `Recorded: wrong person. ${named} is already a lead; a follow-up for ${shortDay(due, today)} is set.`;
          }
        } else {
          followUp("find_address", `Find an address for ${named}`, due);
          message = `Recorded: wrong person. A follow-up for ${shortDay(due, today)} asks you to find ${named}'s address.`;
        }
        break;
      }
      case "question": {
        followUp("answer", `Answer ${name}'s question`, today, lead, input.words);
        message = "Recorded: a question. It is on today's follow-ups.";
        break;
      }
    }
  }

  context.book.append(reply);
  leads.noteReply(input.email, context.book.markFor(input.email));
  core.log(`reply recorded: ${input.outcome}, ${effects.length} effect(s)`);
  return { reply: rowOf(reply, context), message, href };
}

export function outcomeLabel(outcome: Outcome): string {
  return OUTCOMES[outcome].label;
}
