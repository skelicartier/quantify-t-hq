/**
 * Investors: the pre-seed raise over the investor firms already mailed (spec §2.7). He
 * chooses the investor list in Mail merge once; the firms are grouped from its rows, each
 * starting at "Written to" or "Not written to yet" as Mail merge's written log says. From
 * then on each firm has a stage, a dated next step and the amounts he records. There is no
 * target and no bar: amounts are shown per currency, never added across them, never
 * against a goal.
 *
 * The raise batch (raise spec §5) adds each firm's qualification, introduction, wave,
 * offer deadline and deck link; the funnel as plain counts of firms; and the one round's
 * terms, with no target field. It provides `investors-raise` (the funnel, firm names and
 * the update's recipients), `agenda:investors` and `search:investors`, and puts offer
 * deadlines in Due three days ahead.
 *
 * A reply from anyone on the list is taken over from the replies module (the
 * interceptor), and every lead on the list wears the "Investor" badge in All leads.
 */

import { writeFileSync } from "node:fs";

import { Refused } from "../../mail-merge/engine";
import type { Answer, DataCore, DueItem } from "../core";
import { addDays } from "../days";
import { LIMITS, clean, wholeNumber } from "../guard";
import type { Staff } from "../protocol";
import {
  RAISE_SERVICES,
  agendaService,
  searchService,
  type AgendaItem,
  type AgendaSource,
  type ContactsLookup,
  type DataSearchHit,
  type FunnelSummary,
  type InvestorsRaise,
  type PacksLookup,
  type SearchSource,
  type UpdateRecipientFirm,
} from "../raise-contracts";
import { toCsv } from "../text";
import { findTerms, matchesTerms } from "../../../src/lib/merge/find";
import {
  AMOUNT_STATES,
  GEOGRAPHIES,
  INDIA_OK,
  INTRO_STATUSES,
  INVESTOR_STAGES,
  INVESTOR_STAGE_ORDER,
  LEAD_OR_FOLLOW,
  PASS_REASONS,
  RESIDENCY,
  STAGE_FOCUS,
} from "../../../src/lib/data/labels";
import type { LeadsService, RepliesService, ReplyRow, WaitlistService } from "../leads/contracts";
import { InvestorsBook, latestAmount, moneyOf, type Touches } from "./book";
import { funnelOf, type FunnelFirm } from "./funnel";
import { investorInterceptor } from "./interceptor";
import { MAX_WAVE_FIRMS, OFFER_DUE_DAYS, WAVE_LIMIT, roundOf } from "./raise";
import { RoundBook } from "./round";
import { INVESTORS_CLOSE, type InvestorsClose } from "../closing/seams";
import { NO_NEXT_STEP, type Investor, type InvestorStage } from "./types";

const PAGE = 100;
const BOM = "﻿";
const STAGE_KEYS = new Set<string>(INVESTOR_STAGE_ORDER);
/** The stages an agenda item or an offer deadline is no longer owed at. */
const CLOSED: ReadonlySet<InvestorStage> = new Set(["money_in", "passed", "do_not_pitch"]);
/** Soft commit and later: first in the firm pickers. */
const COMMITTED: ReadonlySet<InvestorStage> = new Set(["soft", "signed", "money_in"]);

/** The Firms view's filters, as the list and the bulk wave both read them. */
type Filters = {
  stage: string;
  terms: string[];
  /** null: every wave; "": no wave; else the label. */
  wave: string | null;
  intro: "warm" | "cold" | "";
};

function filtersOf(input: { stage: unknown; q: unknown; wave: unknown; intro: unknown }): Filters {
  const wave = clean(input.wave, WAVE_LIMIT);
  const intro = clean(input.intro, 10);
  return {
    stage: clean(input.stage, 40),
    terms: findTerms(clean(input.q, LIMITS.search)),
    wave: wave === "-" ? "" : wave || null,
    intro: intro === "warm" || intro === "cold" ? intro : "",
  };
}

const byName = (a: string, b: string): number =>
  a.localeCompare(b, "en", { sensitivity: "base", numeric: true });

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
  /** Replies that count: not taken back, not an automatic out-of-office. */
  const heardFrom = (investor: Investor): ReplyRow[] =>
    repliesOf(investor).filter((row) => row.taken_back === null && row.outcome !== "out_of_office");
  const replied = (investor: Investor): boolean => heardFrom(investor).length > 0;
  const touches = (investor: Investor): Touches => {
    const heard = heardFrom(investor);
    return { replied: heard.length > 0, last_replied_at: heard[0]?.received_at ?? null };
  };
  const rounds = new RoundBook(core);

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
    // An offer deadline joins Due three days before (raise spec §5.7).
    const soon = addDays(today, OFFER_DUE_DAYS);
    for (const investor of book.firms.values()) {
      if (!investor.offer_deadline || CLOSED.has(investor.stage)) continue;
      if (investor.offer_deadline > soon) continue;
      items.push({
        key: `investor:${investor.investor_id}:offer`,
        kind: "investor",
        title: `Offer deadline: ${investor.firm}`,
        sub: INVESTOR_STAGES[investor.stage].label,
        due_on: investor.offer_deadline,
        href: `/data/investors/${investor.investor_id}`,
      });
    }
    return items;
  });

  // ---------------------------------------------------------------- the raise (spec §5)

  /** The firm's contact: the first person Mail merge wrote to, else the first person. */
  const contactOf = (investor: Investor) =>
    investor.people.find((person) => core.sender.writtenFor(person.email).length > 0) ??
    investor.people[0] ??
    null;

  const funnel = (): FunnelSummary => {
    const firms: FunnelFirm[] = [];
    let firstSend: string | null = null;
    for (const investor of book.sorted()) {
      const first = book.writtenTo(investor)[0];
      if (first && (firstSend === null || first.at < firstSend)) firstSend = first.at;
      const latest = latestAmount(investor);
      firms.push({
        investor_id: investor.investor_id,
        firm: investor.firm,
        stage: investor.stage,
        stage_since: investor.stage_since,
        next_step: investor.next_step,
        next_step_on: investor.next_step_on,
        passed_reason: investor.passed_reason,
        wave: investor.wave,
        warm: investor.intro.status === "made",
        latest: latest
          ? { state: latest.state, amount: latest.amount, currency: latest.currency }
          : null,
        moves: book.movesOf(investor),
      });
    }
    return funnelOf({ firms, today: core.day(), first_send_at: firstSend });
  };

  const firmOptions = () =>
    [...book.firms.values()]
      .sort(
        (a, b) =>
          Number(COMMITTED.has(b.stage)) - Number(COMMITTED.has(a.stage)) || byName(a.firm, b.firm),
      )
      .map((investor) => ({
        investor_id: investor.investor_id,
        firm: investor.firm,
        stage: investor.stage,
      }));

  const raise: InvestorsRaise = {
    funnel,
    firmOptions,
    recipients: (stages): UpdateRecipientFirm[] => {
      const wanted = new Set<string>(stages);
      return book
        .sorted()
        .filter((investor) => wanted.has(investor.stage))
        .map((investor) => {
          const people: UpdateRecipientFirm["people"] = [];
          for (const row of heardFrom(investor)) {
            if (people.some((person) => person.email === row.email)) continue;
            const person = investor.people.find((item) => item.email === row.email);
            people.push({ email: row.email, name: person?.name || row.name, replied: true });
          }
          if (people.length === 0) {
            const contact = contactOf(investor);
            if (contact) people.push({ email: contact.email, name: contact.name, replied: false });
          }
          return {
            investor_id: investor.investor_id,
            firm: investor.firm,
            stage: investor.stage,
            people,
          };
        });
    },
    name: (investorId) => book.get(investorId)?.firm ?? null,
  };
  core.provide(RAISE_SERVICES.investorsRaise, raise);

  // What the closing reads of a firm and of the round (company spec §9.2): C4-internal.
  const close: InvestorsClose = {
    firm: (investorId) => {
      const investor = book.get(investorId);
      if (!investor) return null;
      const latest = latestAmount(investor);
      const contact = contactOf(investor);
      return {
        investor_id: investor.investor_id,
        firm: investor.firm,
        stage: investor.stage,
        residency: investor.profile?.residency ?? "",
        latest: latest
          ? {
              state: latest.state,
              amount: latest.amount,
              currency: latest.currency,
              instrument: latest.instrument,
            }
          : null,
        contact: contact ? { email: contact.email, name: contact.name } : null,
      };
    },
    roundInstrument: () => rounds.round?.instrument ?? null,
  };
  core.provide(INVESTORS_CLOSE, close);

  core.provideOverview("raise", () => {
    const summary = funnel();
    return {
      stages: summary.stages
        .filter((row) => row.stage !== "written")
        .map((row) => ({ stage: row.stage, now: row.now })),
      first_meetings_this_week: summary.first_meetings_this_week,
    };
  });

  const agendaOf = (): AgendaItem[] => {
    const items: AgendaItem[] = [];
    for (const investor of book.sorted()) {
      if (CLOSED.has(investor.stage)) continue;
      const href = `/data/investors/${investor.investor_id}`;
      const stage = INVESTOR_STAGES[investor.stage].label;
      if (investor.next_step_on)
        items.push({
          key: `investor:${investor.investor_id}`,
          kind: "investor",
          title: `${investor.next_step || "Next step"} · ${investor.firm}`,
          plain: "Investor next step",
          sub: stage,
          on: investor.next_step_on,
          remind_days: [0],
          href,
        });
      if (investor.offer_deadline)
        items.push({
          key: `offer_deadline:${investor.investor_id}`,
          kind: "offer_deadline",
          title: `Offer deadline: ${investor.firm}`,
          plain: "Offer deadline",
          sub: stage,
          on: investor.offer_deadline,
          remind_days: [3, 0],
          href,
        });
    }
    return items;
  };
  const agenda: AgendaSource = {
    agenda: (today) => {
      void today; // every open item, overdue ones included
      try {
        return agendaOf();
      } catch (error) {
        core.log(`investors agenda failed: ${error instanceof Error ? error.name : "error"}`);
        return [];
      }
    },
  };
  core.provide(agendaService("investors"), agenda);

  const searchOf: SearchSource["search"] = ({ terms, kind, limit }) => {
    if ((kind && kind !== "investor") || terms.length === 0) return [];
    const words = terms.map((term) => term.toLowerCase());
    const found = book
      .sorted()
      .filter((investor) => matchesTerms([book.searchText(investor)], words));
    const hits: DataSearchHit[] = found.slice(0, Math.max(0, limit)).map((investor) => ({
      kind: "investor",
      id: investor.investor_id,
      title: investor.firm,
      subtitle: `${INVESTOR_STAGES[investor.stage].label} · ${
        investor.firm_key.startsWith("mail:") ? "A firm of one" : investor.domain
      }`,
      snippet: "",
      href: `/data/investors/${investor.investor_id}`,
    }));
    return [{ kind: "investor", count: found.length, hits }];
  };
  const search: SearchSource = {
    search: (input) => {
      try {
        return searchOf(input);
      } catch (error) {
        core.log(`investors search failed: ${error instanceof Error ? error.name : "error"}`);
        return [];
      }
    },
  };
  core.provide(searchService("investors"), search);

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

  /** The firms a Firms view shows for these filters (every page), and the ones behind its tabs. */
  const listed = (filters: Filters) => {
    const all = book.sorted();
    const searched = all.filter(
      (investor) =>
        (!filters.terms.length || matchesTerms([book.searchText(investor)], filters.terms)) &&
        (filters.wave === null || investor.wave === filters.wave) &&
        (!filters.intro || (investor.intro.status === "made") === (filters.intro === "warm")),
    );
    const shown = STAGE_KEYS.has(filters.stage)
      ? searched.filter((investor) => investor.stage === filters.stage)
      : searched;
    return { all, searched, shown };
  };

  const wavesOf = (all: readonly Investor[]) => {
    const counts = new Map<string, number>();
    for (const investor of all)
      if (investor.wave) counts.set(investor.wave, (counts.get(investor.wave) ?? 0) + 1);
    return [
      ...[...counts.entries()]
        .sort(([a], [b]) => byName(a, b))
        .map(([label, firms]) => ({ label, firms })),
      { label: "", firms: all.filter((investor) => !investor.wave).length },
    ];
  };

  // Registered before the `:id` routes (first match wins).
  core.route("POST", "/data/investors/wave", (ctx) => {
    const by = ctx.staff();
    const { shown } = listed(
      filtersOf({
        stage: ctx.body.stage,
        q: ctx.body.q,
        wave: ctx.body.wave_filter,
        intro: ctx.body.intro,
      }),
    );
    if (shown.length > MAX_WAVE_FIRMS)
      throw new Refused(
        400,
        "invalid",
        `That is ${shown.length.toLocaleString("en-GB")} firms; narrow the list to ${MAX_WAVE_FIRMS.toLocaleString("en-GB")} at most.`,
      );
    book.setWave(shown, ctx.body.wave, by);
    return { changed: shown.length };
  });

  core.route("GET", "/data/investors", (ctx) => {
    core.sender.poll();
    book.refreshWritten();
    const offset = Math.min(200_000, Math.max(0, wholeNumber(ctx.query.get("offset"), 0)));
    const { all, searched, shown } = listed(
      filtersOf({
        stage: ctx.query.get("stage"),
        q: ctx.query.get("q"),
        wave: ctx.query.get("wave"),
        intro: ctx.query.get("intro"),
      }),
    );
    const counts: Record<string, number> = { all: searched.length };
    for (const key of INVESTOR_STAGE_ORDER) counts[key] = 0;
    for (const investor of searched) counts[investor.stage] = (counts[investor.stage] ?? 0) + 1;
    const money = moneyOf(all);
    const latest = all.map((investor) => latestAmount(investor));
    return {
      investors: shown
        .slice(offset, offset + PAGE)
        .map((investor) => book.rowOf(investor, touches)),
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
      waves: wavesOf(all),
      today: core.day(),
    };
  });

  const detailOf = (investor: Investor): Answer => {
    core.sender.poll();
    const leadsService = leads();
    const waitlist = core.need<WaitlistService>("waitlist");
    const contacts = core.need<ContactsLookup>(RAISE_SERVICES.contacts);
    const packs = core.need<PacksLookup>(RAISE_SERVICES.packs);
    const last = book.lastWritten(investor);
    const heard = touches(investor);
    let introducers: ReturnType<ContactsLookup["introducers"]> | null = null;
    let dataRoom: ReturnType<PacksLookup["sharedWith"]> | null = null;
    try {
      introducers = contacts ? contacts.introducers() : null;
    } catch (error) {
      core.log(`investors: the introducers could not be read: ${errorName(error)}`);
    }
    try {
      dataRoom = packs ? packs.sharedWith(investor.investor_id) : null;
    } catch (error) {
      core.log(`investors: the data room could not be read: ${errorName(error)}`);
    }
    return {
      investor: {
        ...investor,
        free_mail: investor.firm_key.startsWith("mail:"),
        last_written_at: last?.at ?? null,
        last_mailing: last?.mailing ?? "",
        last_replied_at: heard.last_replied_at,
        last_met_at: book.lastMetAt(investor),
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
      introducers,
      data_room: dataRoom,
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

  core.route("POST", "/data/investors/:id/profile", (ctx) => {
    const by = ctx.staff();
    const investor = book.mustGet(ctx.params[0]);
    book.qualify(investor, ctx.body, by);
    return { investor };
  });

  core.route("POST", "/data/investors/:id/intro", (ctx) => {
    const by = ctx.staff();
    const investor = book.mustGet(ctx.params[0]);
    const contacts = core.need<ContactsLookup>(RAISE_SERVICES.contacts);
    book.introduce(
      investor,
      ctx.body,
      contacts
        ? (contactId) => {
            const found = contacts.get(contactId);
            return found ? { name: found.name } : null;
          }
        : null,
      by,
    );
    return { investor };
  });

  // ---------------------------------------------------------------- the funnel and the round

  core.route("GET", "/data/raise/funnel", () => {
    core.sender.poll();
    book.refreshWritten();
    return { funnel: funnel() };
  });

  core.route("GET", "/data/raise/round", () => ({
    round: rounds.round,
    firms: firmOptions(),
    history: rounds.history(),
  }));

  core.route("POST", "/data/raise/round", (ctx) => {
    const by = ctx.staff();
    const fields = roundOf(ctx.body, (investorId) => book.get(investorId) !== null);
    return { round: rounds.save(fields, by) };
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

  /** The raise's columns, appended after the old ones (raise spec §5.7); still no address. */
  const raiseColumns = (investor: Investor): (string | number)[] => {
    const { profile, intro } = investor;
    const heard = touches(investor);
    const labelsOf = (keys: readonly string[], table: Readonly<Record<string, string>>) =>
      keys.map((key) => table[key] ?? key).join(", ");
    return [
      investor.wave,
      intro.status === "made" ? "Yes" : "No",
      INTRO_STATUSES[intro.status].label,
      intro.introducer,
      intro.on ?? "",
      profile.cheque?.min ?? "",
      profile.cheque?.max ?? "",
      profile.cheque?.currency ?? "",
      labelsOf(profile.stages, STAGE_FOCUS),
      profile.sectors.join(", "),
      labelsOf(profile.geography, GEOGRAPHIES),
      profile.lead ? LEAD_OR_FOLLOW[profile.lead] : "",
      profile.conflict,
      profile.residency ? RESIDENCY[profile.residency] : "",
      profile.india_ok ? INDIA_OK[profile.india_ok] : "",
      heard.last_replied_at?.slice(0, 10) ?? "",
      book.lastMetAt(investor)?.slice(0, 10) ?? "",
      investor.offer_deadline ?? "",
      investor.deck_link,
    ];
  };

  core.builds.provide("investors_csv", async (handle, input) => {
    core.sender.poll();
    const all = book.sorted();
    handle.setProgress(0, all.length);
    await core.yield();
    const rows = all.map((investor) => {
      const row = book.rowOf(investor, touches);
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
        ...raiseColumns(investor),
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
          ...RAISE_COLUMNS,
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

    // What `agenda:investors` and `search:investors` give, for the tests (raise spec §5.4).
    core.route("GET", "/data/_test/raise/agenda", () => ({ items: agenda.agenda(core.day()) }));
    core.route("GET", "/data/_test/raise/search", (ctx) => {
      const query = clean(ctx.query.get("q"), LIMITS.search);
      return {
        groups: search.search({ query, terms: findTerms(query), kind: null, limit: 5 }),
      };
    });
  }
}

const errorName = (error: unknown): string => (error instanceof Error ? error.name : "error");

const RAISE_COLUMNS = [
  "wave",
  "introduced",
  "intro_status",
  "introducer",
  "intro_on",
  "cheque_min",
  "cheque_max",
  "cheque_currency",
  "stage_focus",
  "sectors",
  "geography",
  "lead_or_follow",
  "conflict",
  "residency",
  "can_invest_india",
  "last_replied",
  "last_met",
  "offer_deadline",
  "deck_link",
] as const;

export type { InvestorStage };
