/**
 * Investors: the pre-seed raise over the investor firms already mailed (spec §2.7). He
 * chooses the investor list in Mail merge once; the firms are grouped from its rows, each
 * starting at "Written to" or "Not written to yet" as Mail merge's written log says. From
 * then on each firm has a stage, a dated next step and the amounts he records. There is no
 * target and no bar: amounts are shown per currency, never added across them, never
 * against a goal.
 *
 * A reply from anyone on the list is taken over from the replies module (the
 * interceptor), and every lead on the list wears the "Investor" badge in All leads.
 */

import { writeFileSync } from "node:fs";

import type { Answer, DataCore, DueItem } from "../core";
import { LIMITS, clean, wholeNumber } from "../guard";
import type { Staff } from "../protocol";
import { toCsv } from "../text";
import { findTerms, matchesTerms } from "../../../src/lib/merge/find";
import {
  AMOUNT_STATES,
  INVESTOR_STAGES,
  INVESTOR_STAGE_ORDER,
  PASS_REASONS,
} from "../../../src/lib/data/labels";
import type { LeadsService, RepliesService, ReplyRow, WaitlistService } from "../leads/contracts";
import { InvestorsBook, latestAmount, moneyOf } from "./book";
import { investorInterceptor } from "./interceptor";
import { NO_NEXT_STEP, type Investor, type InvestorStage } from "./types";

const PAGE = 100;
const BOM = "﻿";
const STAGE_KEYS = new Set<string>(INVESTOR_STAGE_ORDER);

/** What the leads module (and anyone else) may ask: is this address at an investor firm. */
export type InvestorsService = {
  forEmail(email: string): { investor_id: string; firm: string; stage: string } | null;
  owns(email: string): boolean;
};

export async function register(core: DataCore): Promise<void> {
  const book = new InvestorsBook(core);
  const leads = () => core.need<LeadsService>("leads");
  const replies = () => core.need<RepliesService>("replies");

  /** Replies a person sent to the firm (not taken back, not an automatic out-of-office). */
  const repliesOf = (investor: Investor): ReplyRow[] => {
    const service = replies();
    if (!service) return [];
    return investor.people
      .flatMap((person) => service.forEmail(person.email))
      .sort((a, b) => b.received_at.localeCompare(a.received_at));
  };
  const replied = (investor: Investor): boolean =>
    repliesOf(investor).some((row) => row.taken_back === null && row.outcome !== "out_of_office");

  // ---------------------------------------------------------------- the other modules

  const service: InvestorsService = {
    forEmail: (email) => {
      const investor = book.forEmail(email);
      return investor
        ? { investor_id: investor.investor_id, firm: investor.firm, stage: investor.stage }
        : null;
    },
    owns: (email) => book.owns(email),
  };
  core.provide("investors", service);
  leads()?.registerStanding({
    name: "investors",
    badges: (email) => (book.owns(email) ? ["Investor"] : []),
  });
  replies()?.registerInterceptor(investorInterceptor(core, book));

  // Mail merge moved: a firm not written to yet may have been, a chosen list may have changed.
  core.sender.watch((changes) => {
    try {
      if (changes.lists.some((id) => book.setup.list_ids.includes(id))) book.regroupChosen();
      else if (changes.written.length) book.refreshWritten();
    } catch (error) {
      core.log(
        `investors could not follow Mail merge: ${error instanceof Error ? error.name : "error"}`,
      );
    }
  });
  book.refreshWritten();

  // ---------------------------------------------------------------- Due

  core.provideDue((): DueItem[] => {
    const today = core.day();
    // A follow-up already asks for the same thing on the same day: one row is enough.
    const owed = new Set(
      (replies()?.openFollowUps() ?? []).map(
        (item) => `${item.email}|${item.title}|${item.due_on}`,
      ),
    );
    const items: DueItem[] = [];
    for (const investor of book.firms.values()) {
      if (NO_NEXT_STEP.has(investor.stage) || !investor.next_step_on) continue;
      if (investor.next_step_on > today) continue;
      if (
        investor.people.some((person) =>
          owed.has(`${person.email}|${investor.next_step}|${investor.next_step_on}`),
        )
      )
        continue;
      items.push({
        key: `investor:${investor.investor_id}`,
        kind: "investor",
        title: investor.next_step || "Next step",
        sub: `${investor.firm} · ${INVESTOR_STAGES[investor.stage].label}`,
        due_on: investor.next_step_on,
        href: `/data/investors/${investor.investor_id}`,
      });
    }
    return items;
  });

  // ---------------------------------------------------------------- reading

  const listsAnswer = () =>
    core.sender.lists().map((list) => ({
      id: list.id,
      name: list.name,
      rows: list.rows.length,
      created_at: list.created_at,
    }));

  const chosenAnswer = () => ({
    list_ids: book.setup.list_ids,
    lists: book.setup.list_ids.map((id) => ({
      id,
      name: core.sender.list(id)?.name ?? "A list no longer in Mail merge",
      here: core.sender.list(id) !== null,
    })),
    set_at: book.setup.set_at,
    set_by: book.setup.set_by,
  });

  core.route("GET", "/data/investors/setup", () => {
    core.sender.poll();
    return { lists: listsAnswer(), chosen: chosenAnswer(), firms: book.firms.size };
  });

  core.route("POST", "/data/investors/setup", (ctx) => {
    const by = ctx.staff();
    const given = ctx.body.list_ids;
    const ids = Array.isArray(given)
      ? given.map((id) => clean(id, 64))
      : typeof given === "string"
        ? [clean(given, 64)]
        : [];
    const result = book.choose(ids, by);
    core.log(`investor list chosen: ${result.firms} firms`);
    return { ...result, chosen: chosenAnswer() };
  });

  core.route("GET", "/data/investors", (ctx) => {
    core.sender.poll();
    book.refreshWritten();
    const stage = clean(ctx.query.get("stage"), 40);
    const terms = findTerms(clean(ctx.query.get("q"), LIMITS.search));
    const offset = Math.min(200_000, Math.max(0, wholeNumber(ctx.query.get("offset"), 0)));
    const all = book.sorted();
    const searched = terms.length
      ? all.filter((investor) => matchesTerms([book.searchText(investor)], terms))
      : all;
    const counts: Record<string, number> = { all: searched.length };
    for (const key of INVESTOR_STAGE_ORDER) counts[key] = 0;
    for (const investor of searched) counts[investor.stage] = (counts[investor.stage] ?? 0) + 1;
    const shown = STAGE_KEYS.has(stage)
      ? searched.filter((investor) => investor.stage === stage)
      : searched;
    const money = moneyOf(all);
    const latest = all.map((investor) => latestAmount(investor));
    return {
      investors: shown
        .slice(offset, offset + PAGE)
        .map((investor) => book.rowOf(investor, replied)),
      total: shown.length,
      offset,
      limit: PAGE,
      counts,
      money,
      readouts: {
        firms: all.length,
        written: all.filter((investor) => book.lastWritten(investor) !== null).length,
        replied: all.filter(replied).length,
        meetings: all.filter((investor) => book.everMet(investor)).length,
        soft_firms: latest.filter((amount) => amount?.state === "soft").length,
        signed_firms: latest.filter(
          (amount) => amount?.state === "signed" || amount?.state === "money_in",
        ).length,
      },
      chosen: chosenAnswer(),
      today: core.day(),
    };
  });

  const detailOf = (investor: Investor): Answer => {
    core.sender.poll();
    const leadsService = leads();
    const waitlist = core.need<WaitlistService>("waitlist");
    const last = book.lastWritten(investor);
    return {
      investor: {
        ...investor,
        free_mail: investor.firm_key.startsWith("mail:"),
        last_written_at: last?.at ?? null,
        last_mailing: last?.mailing ?? "",
        lists: investor.list_ids.map((id) => ({
          id,
          name: core.sender.list(id)?.name ?? "A list no longer in Mail merge",
        })),
      },
      events: book.eventsOf(investor.investor_id),
      sent: book.sentTo(investor),
      replies: repliesOf(investor),
      people: investor.people.map((person) => {
        const lead = leadsService?.byEmail(person.email) ?? null;
        const written = core.sender.writtenFor(person.email);
        return {
          ...person,
          lead_id: lead?.lead_id ?? null,
          status: lead?.status ?? null,
          times_written: written.length,
          last_written_at: written.length
            ? written.reduce((latest, line) => (line.at > latest ? line.at : latest), "")
            : null,
        };
      }),
      waitlist:
        waitlist && !investor.firm_key.startsWith("mail:")
          ? waitlist.forFirm(investor.firm_key)
          : null,
      waitlist_here: waitlist !== null,
      today: core.day(),
    };
  };

  core.route("GET", "/data/investors/:id", (ctx) => {
    book.refreshWritten();
    return detailOf(book.mustGet(ctx.params[0]));
  });

  // ---------------------------------------------------------------- his changes

  core.route("POST", "/data/investors/:id/stage", (ctx) => {
    const by: Staff = ctx.staff();
    const investor = book.mustGet(ctx.params[0]);
    book.move(
      investor,
      {
        stage: ctx.body.stage,
        next_step: ctx.body.next_step,
        next_step_on: ctx.body.next_step_on,
        set_aside_until: ctx.body.set_aside_until,
        passed_reason: ctx.body.passed_reason,
      },
      by,
    );
    return { investor };
  });

  core.route("POST", "/data/investors/:id/update", (ctx) => {
    const by = ctx.staff();
    const investor = book.mustGet(ctx.params[0]);
    book.update(investor, ctx.body.field, ctx.body.value, by);
    return { investor };
  });

  core.route("POST", "/data/investors/:id/notes", (ctx) => {
    const by = ctx.staff();
    const investor = book.mustGet(ctx.params[0]);
    const event = book.addNote(investor, ctx.body.text, by);
    return { investor, event };
  });

  core.route("POST", "/data/investors/:id/amounts", (ctx) => {
    const by = ctx.staff();
    const investor = book.mustGet(ctx.params[0]);
    const amount = book.recordAmount(
      investor,
      {
        state: ctx.body.state,
        amount: ctx.body.amount,
        currency: ctx.body.currency,
        instrument: ctx.body.instrument,
        on: ctx.body.on,
      },
      by,
    );
    return { investor, amount };
  });

  // ---------------------------------------------------------------- the download

  core.builds.provide("investors_csv", async (handle, input) => {
    core.sender.poll();
    const all = book.sorted();
    handle.setProgress(0, all.length);
    await core.yield();
    const rows = all.map((investor) => {
      const row = book.rowOf(investor, replied);
      const latest = latestAmount(investor);
      return [
        investor.firm,
        investor.firm_key.startsWith("mail:") ? "" : investor.domain,
        INVESTOR_STAGES[investor.stage].label,
        investor.stage_since.slice(0, 10),
        row.contact?.name ?? "",
        row.contact?.title ?? "",
        investor.people.length,
        row.last_written_at?.slice(0, 10) ?? "",
        row.last_mailing,
        row.replied ? "Yes" : "No",
        investor.next_step,
        investor.next_step_on ?? "",
        investor.set_aside_until ?? "",
        investor.passed_reason ? PASS_REASONS[investor.passed_reason] : "",
        latest ? AMOUNT_STATES[latest.state] : "",
        latest ? latest.amount : "",
        latest?.currency ?? "",
        latest?.instrument ?? "",
        investor.owner,
      ];
    });
    const text =
      BOM +
      toCsv(
        [
          "firm",
          "domain",
          "stage",
          "since",
          "contact",
          "contact_title",
          "people",
          "last_written",
          "last_mailing",
          "replied",
          "next_step",
          "next_step_on",
          "set_aside_until",
          "passed_because",
          "amount_state",
          "amount",
          "currency",
          "instrument",
          "owner",
        ],
        rows,
      );
    writeFileSync(handle.path, text, { mode: 0o600 });
    handle.setProgress(all.length, all.length);
    core.store.appendLine("investors/exports.jsonl", {
      at: core.now(),
      by: input.by,
      kind: "investors",
      rows: all.length,
    });
    return { name: `Investors ${core.day()}.csv`, type: "text/csv; charset=utf-8" };
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    // Back to the first visit: no list chosen, no firms (the walk shows "Choose the investor list").
    core.route("POST", "/data/_test/investors/reset", (ctx) => {
      ctx.staff();
      book.forget(new Set(book.firms.keys()));
      book.firms.clear();
      book.setup = { list_ids: [], set_at: null, set_by: null };
      core.store.writeJson("investors/setup.json", book.setup);
      book.save();
      return { reset: true };
    });
  }
}

export type { InvestorStage };
