/**
 * Replies: HQ does not read the founder's mailbox, so each reply is recorded here (or from
 * the lead), once, and Data does what it means: a yes puts the firm on the waitlist, a no
 * puts the address on Mail merge's stop list, a later sets a reminder, a wrong person adds
 * whoever they named, a question adds a follow-up for today. Every reply can be taken
 * back, with a preview of what is undone and what stays.
 */

import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

import { Refused } from "../../mail-merge/engine";
import type { DataCore, DueItem } from "../core";
import { addDays } from "../days";
import { LIMITS, clean, cleanText, isDay, normaliseEmail, wholeNumber } from "../guard";
import type { Staff } from "../protocol";
import { toCsv } from "../text";
import { findTerms, matchesTerms } from "../../../src/lib/merge/find";
import { OUTCOMES, WAITLIST_STAGE_ORDER, type WaitlistStage } from "../../../src/lib/data/labels";
import type {
  FollowUp,
  Interceptor,
  ReplyRow,
  RepliesService,
  WaitlistService,
} from "../leads/contracts";
import type { LeadsInternal } from "../leads/index";
import { BOM } from "../leads/exports";
import { FollowUps } from "./follow-ups";
import { Interceptors } from "./interceptors";
import {
  OUTCOME_KEYS,
  RepliesBook,
  readRecordInput,
  recordReply,
  rowOf,
  type RecordContext,
} from "./record";
import { planTakeBack, takeBack } from "./take-back";
import { WALK_REPLIES } from "./walk-seed";

const PAGE = 100;

export type RepliesInternal = RepliesService & { context: RecordContext };

/** Replies a person sent: not taken back, and not an automatic out-of-office. */
const human = (row: { outcome: string }) => row.outcome !== "out_of_office";

export async function register(core: DataCore): Promise<void> {
  const leads = core.need<LeadsInternal>("leads");
  if (!leads) throw new Error("the leads module is not loaded");
  const context: RecordContext = {
    core,
    leads,
    book: new RepliesBook(core.store),
    followUps: new FollowUps(core.store),
    interceptors: new Interceptors(),
  };
  const { book, followUps } = context;
  for (const email of book.byEmail.keys()) leads.noteReply(email, book.markFor(email));
  const closeBySends = () =>
    followUps.closeBySends((email) => core.sender.writtenFor(email), core.day());
  closeBySends();
  leads.onChange((event) => {
    if (event.kind === "written" || event.kind === "rebuilt") closeBySends();
  });

  const rows = (): ReplyRow[] =>
    book.replies
      .map((reply) => rowOf(reply, context))
      .sort(
        (a, b) =>
          b.received_at.localeCompare(a.received_at) || b.recorded_at.localeCompare(a.recorded_at),
      );
  const live = (row: ReplyRow) => row.taken_back === null;

  const service: RepliesInternal = {
    context,
    forEmail: (email) => {
      const address = normaliseEmail(email) || email;
      return (book.byEmail.get(address) ?? [])
        .map((reply) => rowOf(reply, context))
        .sort((a, b) => b.received_at.localeCompare(a.received_at));
    },
    forFirm: (firmKey) =>
      firmKey
        ? rows().filter(
            (row) => leads.firmKeyOf(row.email, leads.byEmail(row.email)?.email_kind) === firmKey,
          )
        : [],
    openFollowUps: () => followUps.open(),
    addFollowUp: (input) => {
      const email = normaliseEmail(input.email);
      const lead = email ? leads.byEmail(email) : null;
      if (!lead) throw new Refused(409, "not_a_lead", "No lead has that address.");
      if (!isDay(input.due_on)) throw new Refused(400, "invalid", "That is not a day.");
      return followUps.add({
        lead_id: lead.lead_id,
        email: lead.email,
        name: lead.name || lead.email,
        kind: input.kind,
        title: cleanText(input.title, LIMITS.title) || "Follow up",
        due_on: input.due_on,
        from_reply_id: input.from_reply_id,
        at: core.now(),
      });
    },
    registerInterceptor: (interceptor: Interceptor) => context.interceptors.register(interceptor),
    followUpsFor: (email) => followUps.forEmail(normaliseEmail(email) || email),
  };
  core.provide("replies", service);

  // ---------------------------------------------------------------- the overview and Due

  core.provideOverview("replies", () => {
    const today = core.day();
    const all = rows().filter(live);
    const on = (row: ReplyRow) => core.day(row.received_at) === today;
    return {
      today: all.filter((row) => human(row) && on(row)).length,
      yes_today: all.filter((row) => row.outcome === "replied_positive" && on(row)).length,
      yes_total: all.filter((row) => row.outcome === "replied_positive").length,
      latest: all.slice(0, 5).map((row) => ({
        reply_id: row.reply_id,
        lead_id: row.lead_id,
        email: row.email,
        name: row.name,
        firm: row.firm,
        outcome: row.outcome,
        received_at: row.received_at,
      })),
    };
  });
  core.provideOverview("follow_ups", () => {
    const today = core.day();
    const open = followUps.open();
    return {
      due: open.filter((item) => item.due_on <= today).length,
      overdue: open.filter((item) => item.due_on < today).length,
    };
  });
  core.provideDue((): DueItem[] => {
    const today = core.day();
    return followUps
      .open()
      .filter((item) => item.due_on <= today)
      .map((item) => {
        const lead = leads.byEmail(item.email);
        return {
          key: `follow_up:${item.follow_up_id}`,
          kind: "follow_up",
          title: item.title,
          sub: [item.name, lead?.company].filter(Boolean).join(" · "),
          due_on: item.due_on,
          href: `/data/leads/${item.lead_id}`,
        };
      });
  });

  // ---------------------------------------------------------------- recording and reading

  core.route("POST", "/data/replies", async (ctx) => {
    const by = ctx.staff();
    const input = readRecordInput(ctx.body, core.now(), core.day());
    return recordReply(input, by, ctx.attempt, context);
  });

  core.route("GET", "/data/replies", (ctx) => {
    const outcome = clean(ctx.query.get("outcome"), 40);
    const terms = findTerms(clean(ctx.query.get("q"), LIMITS.search));
    const offset = Math.min(200_000, Math.max(0, wholeNumber(ctx.query.get("offset"), 0)));
    const all = rows();
    const searched = terms.length
      ? all.filter((row) =>
          matchesTerms([row.name, row.email, row.firm, row.words, row.subject, row.mailing], terms),
        )
      : all;
    const counts: Record<string, number> = { all: searched.length };
    const kept: Record<string, number> = { all: 0 };
    for (const key of OUTCOME_KEYS) {
      counts[key] = 0;
      kept[key] = 0;
    }
    for (const row of searched) counts[row.outcome] = (counts[row.outcome] ?? 0) + 1;
    for (const row of all)
      if (live(row)) {
        kept.all = (kept.all ?? 0) + 1;
        kept[row.outcome] = (kept[row.outcome] ?? 0) + 1;
      }
    const shown = OUTCOME_KEYS.includes(outcome as (typeof OUTCOME_KEYS)[number])
      ? searched.filter((row) => row.outcome === outcome)
      : searched;
    return {
      replies: shown.slice(offset, offset + PAGE),
      total: shown.length,
      offset,
      limit: PAGE,
      counts,
      live: kept,
      today: core.day(),
      follow_ups_open: followUps.open().length,
      waitlist: core.need<WaitlistService>("waitlist") !== null,
    };
  });

  core.route("GET", "/data/replies/:id/take-back-preview", (ctx) =>
    planTakeBack(ctx.params[0]!, context),
  );

  core.route("POST", "/data/replies/:id/take-back", async (ctx) => {
    const by = ctx.staff();
    return takeBack(ctx.params[0]!, by, context);
  });

  // ---------------------------------------------------------------- follow-ups

  core.route("GET", "/data/follow-ups", (ctx) => {
    const state = clean(ctx.query.get("state"), 20) || "open";
    const offset = Math.min(200_000, Math.max(0, wholeNumber(ctx.query.get("offset"), 0)));
    const today = core.day();
    const chosen =
      state === "all"
        ? [...followUps.items].sort((a, b) => a.due_on.localeCompare(b.due_on))
        : state === "open"
          ? followUps.open()
          : followUps.items.filter((item) => item.state === state);
    const withFirm = chosen.slice(offset, offset + PAGE).map((item) => ({
      ...item,
      firm: leads.byEmail(item.email)?.company ?? "",
    }));
    return {
      follow_ups: withFirm,
      total: chosen.length,
      offset,
      limit: PAGE,
      overdue: followUps.open().filter((item) => item.due_on < today).length,
      today,
    };
  });

  core.route("POST", "/data/follow-ups", (ctx) => {
    const by = ctx.staff();
    const email = normaliseEmail(clean(ctx.body.email, LIMITS.email));
    if (!email) throw new Refused(400, "invalid", "That is not an email address.");
    const lead = leads.byEmail(email);
    if (!lead)
      throw new Refused(
        409,
        "not_a_lead",
        "No lead has that address. Add them in All leads first.",
      );
    const title = cleanText(ctx.body.title, LIMITS.title);
    if (!title) throw new Refused(400, "invalid", "Say what is to be done.");
    const dueOn = clean(ctx.body.due_on, 10);
    if (!isDay(dueOn)) throw new Refused(400, "invalid", "Choose the day it is due.");
    const item = followUps.add({
      lead_id: lead.lead_id,
      email,
      name: lead.name || email,
      kind: "other",
      title,
      due_on: dueOn,
      from_reply_id: null,
      at: core.now(),
    });
    void by;
    return { follow_up: item };
  });

  const followUpOr404 = (id: string | undefined): FollowUp => {
    const item = id ? followUps.get(id) : null;
    if (!item) throw new Refused(404, "not_found", "That follow-up is not here.");
    return item;
  };

  core.route("POST", "/data/follow-ups/:id/done", (ctx) => {
    const by = ctx.staff();
    const item = followUpOr404(ctx.params[0]);
    if (item.state !== "open")
      throw new Refused(409, "not_open", "That follow-up is done already.");
    return {
      follow_up: followUps.done(item, cleanText(ctx.body.note, LIMITS.notes), by, core.now()),
    };
  });

  core.route("POST", "/data/follow-ups/:id/move", (ctx) => {
    ctx.staff();
    const item = followUpOr404(ctx.params[0]);
    if (item.state !== "open")
      throw new Refused(409, "not_open", "That follow-up is done already.");
    const dueOn = clean(ctx.body.due_on, 10);
    if (!isDay(dueOn)) throw new Refused(400, "invalid", "Choose the day it is due.");
    if (dueOn < core.day()) throw new Refused(400, "invalid", "That day is in the past.");
    return { follow_up: followUps.move(item, dueOn) };
  });

  // ---------------------------------------------------------------- the download

  core.builds.provide("replies_csv", async (handle, input) => {
    const all = rows();
    handle.setProgress(0, all.length);
    await core.yield();
    const text =
      BOM +
      toCsv(
        [
          "received_at",
          "email",
          "name",
          "firm",
          "outcome",
          "words",
          "subject",
          "mailing",
          "later_until",
          "referral_name",
          "referral_email",
          "recorded_at",
          "recorded_by",
          "taken_back",
        ],
        all.map((row) => [
          row.received_at,
          row.email,
          row.name,
          row.firm,
          OUTCOMES[row.outcome].label,
          row.words,
          row.subject,
          row.mailing,
          row.later_until ?? "",
          row.referral?.name ?? "",
          row.referral?.email ?? "",
          row.recorded_at,
          row.recorded_by.name,
          row.taken_back?.at ?? "",
        ]),
      );
    writeFileSync(handle.path, text, { mode: 0o600 });
    handle.setProgress(all.length, all.length);
    core.store.appendLine("leads/exports.jsonl", {
      at: core.now(),
      by: input.by,
      kind: "replies",
      view: "",
      rows: all.length,
    });
    return { name: `Replies ${core.day()}.csv`, type: "text/csv; charset=utf-8" };
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    // A stand-in waitlist for the tests until Unit 4's exists; never replaces a real one.
    const joins: {
      email: string;
      firm_key: string;
      quote: string;
      subject: string;
      received_at: string;
    }[] = [];
    const entries = new Map<string, { entry_id: string; firm: string }>();
    const fake: WaitlistService = {
      joinFromReply: ({ reply, lead, firmKey }) => {
        joins.push({
          email: reply.email,
          firm_key: firmKey,
          quote: reply.words,
          subject: reply.subject,
          received_at: reply.received_at,
        });
        const known = entries.get(firmKey);
        const entry = known ?? { entry_id: randomUUID(), firm: lead.company || lead.domain };
        entries.set(firmKey, entry);
        const unsent = firmKey.startsWith("mail:")
          ? 0
          : leads.unsentAt(firmKey).filter((item) => item.email !== reply.email).length;
        return {
          entry_id: entry.entry_id,
          created: !known,
          firm: entry.firm,
          unsent,
          href: `/data/waitlist/${entry.entry_id}`,
        };
      },
      forEmail: (email) => {
        const join = joins.find((item) => item.email === email);
        const entry = join ? entries.get(join.firm_key) : undefined;
        return entry ? { entry_id: entry.entry_id, firm: entry.firm, stage: "joined" } : null;
      },
      forFirm: (firmKey) => {
        const entry = entries.get(firmKey);
        return entry ? { entry_id: entry.entry_id, firm: entry.firm, stage: "joined" } : null;
      },
      stageCounts: () =>
        Object.fromEntries(
          WAITLIST_STAGE_ORDER.map((stage) => [stage, stage === "joined" ? entries.size : 0]),
        ) as Record<WaitlistStage, number>,
      usedFor: () => [],
    };
    core.route("POST", "/data/_test/waitlist", (ctx) => {
      ctx.staff();
      const current = core.need<WaitlistService>("waitlist");
      if (ctx.body.on === false) {
        if (current === fake) core.provide("waitlist", null);
        return { installed: false };
      }
      if (current && current !== fake) return { installed: false, real: true };
      core.provide("waitlist", fake);
      return { installed: true };
    });
    core.route("GET", "/data/_test/waitlist", () => ({ joins }));

    core.route("POST", "/data/_test/replies/walk-seed", async (ctx) => {
      const by: Staff = ctx.staff();
      let recorded = 0;
      for (const seed of WALK_REPLIES) {
        if (book.byEmail.has(seed.email) || !leads.byEmail(seed.email)) continue;
        const today = core.day();
        await recordReply(
          {
            email: seed.email,
            outcome: seed.outcome,
            words: seed.words,
            subject: seed.subject,
            received_at: core.now(),
            later_until: seed.later_days ? addDays(today, seed.later_days) : null,
            referral: seed.referral ?? null,
            add_if_missing: false,
          },
          by,
          null,
          context,
        );
        recorded += 1;
      }
      return { recorded };
    });
  }
}
