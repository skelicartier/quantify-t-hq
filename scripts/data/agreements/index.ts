/**
 * The legal-document register (ws-notes/company/spec.md §7): the company's agreements over
 * Files, who they are with, their terms, the end of a fixed term and the renewal of one that
 * renews on its own with the day notice must go by, the signed copy and the signing record
 * in Files, and "What is missing" (the founder's IP assignment, letters and IP assignments
 * for the people engaged as counts from the people ledger, NDAs, pilot and customer
 * agreements, DPAs and investment documents).
 *
 * Notice, end and review days are Due rows of kind "agreement" and the calendar's agenda
 * (`agenda:agreements`); agreements are searchable (`search:agreements`); the `agreements`
 * service tells the close and the pilots which agreements a firm has. Nothing here reads
 * People: a person on an agreement is a typed name, and "What is missing" names nobody.
 */

import { Refused } from "../../mail-merge/engine";
import {
  COMPANY_SERVICES,
  type AgreementView,
  type AgreementsLookup,
  type CompanyLookup,
  type PeopleLetters,
} from "../company-contracts";
import type { Answer, DataCore, DueItem } from "../core";
import { addDays } from "../days";
import { clean, isRouteId, wholeNumber } from "../guard";
import {
  RAISE_SERVICES,
  agendaService,
  searchService,
  type AgendaItem,
  type AgendaSource,
  type InvestorsRaise,
  type SearchSource,
  type WaitlistFeed,
} from "../raise-contracts";
import { snippetOf } from "../notes/snippet";
import { findTerms, matchesTerms } from "../../../src/lib/merge/find";
import {
  AGREEMENT_STATUSES,
  AGREEMENT_TYPES,
  dayShort,
} from "../../../src/lib/data/labels-registers";
import type { InvestorStage } from "../../../src/lib/data/labels";
import {
  checkCopy,
  copyGiven,
  fileChoices,
  fileLink,
  folderNamed,
  keepCopy,
} from "../meetings/copy";
import { AgreementsBook, type Refs } from "./book";
import { AGREEMENT_LIMITS, END_AHEAD_DAYS, NOTICE_AHEAD_DAYS, REVIEW_AHEAD_DAYS } from "./limits";
import { isEnded, isSigned, missingRows, worked } from "./rules";
import type { Agreement, AgreementType, Party } from "./types";

const TEAM_TYPES = new Set<AgreementType>([
  "founder_ip",
  "ip_assignment",
  "appointment",
  "internship",
  "contractor",
]);
const FUNDRAISING_TYPES = new Set<AgreementType>(["investment", "side_letter"]);

/** Where a signed copy goes in Files, by the agreement's type. */
export function copyFolder(type: AgreementType): string[] {
  if (TEAM_TYPES.has(type)) return [folderNamed("team", "05 Founders, team and ESOP")];
  if (FUNDRAISING_TYPES.has(type))
    return [folderNamed("fundraising", "10 Fundraising and investors")];
  return [folderNamed("contracts", "06 Contracts and NDAs")];
}

export const agreementHref = (id: string): string => `/data/company/agreements/${id}`;

/** A party's own page, when it points at a record. */
export function partyHref(party: Party): string | null {
  if (!party.ref_id) return null;
  if (party.kind === "investor") return `/data/investors/${party.ref_id}`;
  if (party.kind === "waitlist") return `/data/waitlist/${party.ref_id}`;
  if (party.kind === "director") return `/data/company/directors/${party.ref_id}`;
  return null;
}

const offsetOf = (value: string | null) => Math.min(200_000, Math.max(0, wholeNumber(value, 0)));
const textOf = (agreement: Agreement): string[] => [
  agreement.title,
  ...agreement.parties.flatMap((party) => [party.name, party.entity]),
  AGREEMENT_TYPES[agreement.type],
  agreement.notes,
];

type FakeFirm = { investor_id: string; firm: string; stage: InvestorStage };

export async function register(core: DataCore): Promise<void> {
  const book = new AgreementsBook(core);

  const company = () => core.need<CompanyLookup>(COMPANY_SERVICES.company);
  const letters = () => core.need<PeopleLetters>(COMPANY_SERVICES.peopleLetters);
  const waitlistFeed = () => core.need<WaitlistFeed>(RAISE_SERVICES.waitlistFeed);
  const investorsRaise = () => core.need<InvestorsRaise>(RAISE_SERVICES.investorsRaise);

  /** Another module asked, never trusted to be there or to answer. */
  function safely<T>(ask: () => T): T | null {
    try {
      return ask();
    } catch (error) {
      core.log(`agreements: a lookup failed: ${error instanceof Error ? error.name : "error"}`);
      return null;
    }
  }

  const refs = (): Refs => {
    const today = core.day();
    return {
      today,
      name: (kind, id, on) => {
        if (kind === "investor") {
          const raise = investorsRaise();
          return raise ? (safely(() => raise.name(id)) ?? null) : undefined;
        }
        if (kind === "waitlist") {
          const feed = waitlistFeed();
          if (!feed) return undefined;
          return safely(() => feed.entries().find((entry) => entry.entry_id === id)?.firm) ?? null;
        }
        const record = company();
        if (!record) return undefined;
        const found = safely(() =>
          [...record.directorsOn(on), ...record.directorsOn(today)].find(
            (director) => director.director_id === id,
          ),
        );
        return found?.name ?? null;
      },
    };
  };

  /** The records a party may point at, for the form's pickers; null where the module is absent. */
  const pickers = () => {
    const today = core.day();
    const raise = investorsRaise();
    const feed = waitlistFeed();
    const record = company();
    return {
      investor: raise
        ? (safely(() =>
            raise
              .firmOptions()
              .map((firm) => ({ id: firm.investor_id, name: firm.firm }))
              .sort((a, b) => a.name.localeCompare(b.name)),
          ) ?? [])
        : null,
      waitlist: feed
        ? (safely(() =>
            feed
              .entries()
              .map((entry) => ({ id: entry.entry_id, name: entry.firm }))
              .sort((a, b) => a.name.localeCompare(b.name)),
          ) ?? [])
        : null,
      director: record
        ? (safely(() =>
            record.directorsOn(today).map((director) => ({
              id: director.director_id,
              name: director.name,
            })),
          ) ?? [])
        : null,
    };
  };

  const missing = () => {
    const today = core.day();
    const record = company();
    const people = letters();
    const feed = waitlistFeed();
    const raise = investorsRaise();
    return missingRows({
      agreements: book.agreements,
      founders: record
        ? (safely(() =>
            record
              .directorsOn(today)
              .filter((director) => director.is_founder)
              .map(({ director_id, name }) => ({ director_id, name })),
          ) ?? [])
        : null,
      letters: people ? safely(() => people.counts(today)) : null,
      waitlist: feed ? safely(() => feed.entries()) : null,
      investors: raise ? safely(() => raise.firmOptions()) : null,
    });
  };

  const rowOf = (agreement: Agreement, today: string) => {
    const days = worked(agreement, today);
    return {
      ...agreement,
      ends_on: days.ends_on,
      renews_on: days.renews_on,
      notice_by: days.notice_by,
      notice_state: days.notice_state,
      signed_file: fileLink(core, agreement.signed_file_id),
    };
  };

  const viewOf = (agreement: Agreement, today: string): AgreementView => ({
    agreement_id: agreement.agreement_id,
    title: agreement.title,
    type: AGREEMENT_TYPES[agreement.type],
    status: agreement.status,
    signed_on: agreement.signed_on,
    ends_on: worked(agreement, today).ends_on,
    href: agreementHref(agreement.agreement_id),
  });

  // ---------------------------------------------------------------- Due and the agenda

  type Mark = {
    part: "notice" | "end" | "review";
    on: string;
    ahead: number;
    title: string;
    plain: string;
    remind: number[];
  };

  function marksOf(agreement: Agreement, today: string): Mark[] {
    if (isEnded(agreement)) return [];
    const marks: Mark[] = [];
    const days = worked(agreement, today);
    if (isSigned(agreement) && agreement.renewal.auto && !agreement.renewal.notice_given) {
      if (days.notice_by && days.renews_on)
        marks.push({
          part: "notice",
          on: days.notice_by,
          ahead: NOTICE_AHEAD_DAYS,
          title: `Give notice on “${agreement.title}” by ${dayShort(days.notice_by)}, or it renews on ${dayShort(days.renews_on)}`,
          plain: "Agreement notice",
          remind: [NOTICE_AHEAD_DAYS, 0],
        });
    }
    if (isSigned(agreement) && !agreement.renewal.auto && days.ends_on)
      marks.push({
        part: "end",
        on: days.ends_on,
        ahead: END_AHEAD_DAYS,
        title: `“${agreement.title}” ends on ${dayShort(days.ends_on)}`,
        plain: "Agreement ends",
        remind: [END_AHEAD_DAYS, 0],
      });
    if (agreement.review_on)
      marks.push({
        part: "review",
        on: agreement.review_on,
        ahead: REVIEW_AHEAD_DAYS,
        title: `Review “${agreement.title}”`,
        plain: "Agreement review",
        remind: [0],
      });
    return marks;
  }

  const subOf = (agreement: Agreement) =>
    [AGREEMENT_TYPES[agreement.type], agreement.parties[0]?.name ?? ""].filter(Boolean).join(" · ");

  core.provideDue((): DueItem[] => {
    const today = core.day();
    return book.agreements.flatMap((agreement) =>
      marksOf(agreement, today)
        .filter((mark) => mark.on <= addDays(today, mark.ahead))
        .filter((mark) => mark.part !== "end" || mark.on >= today)
        .map((mark) => ({
          key: `agreement:${agreement.agreement_id}:${mark.part}`,
          kind: "agreement" as const,
          title: mark.title,
          sub: subOf(agreement),
          due_on: mark.on,
          href: agreementHref(agreement.agreement_id),
        })),
    );
  });

  const agenda: AgendaSource = {
    agenda: (today) =>
      book.agreements
        .filter(isSigned)
        .flatMap((agreement) =>
          marksOf(agreement, today).map((mark): AgendaItem => ({
            key: `agreement:${agreement.agreement_id}:${mark.part}`,
            kind: "agreement",
            title: mark.title,
            plain: mark.plain,
            sub: subOf(agreement),
            on: mark.on,
            remind_days: mark.remind,
            href: agreementHref(agreement.agreement_id),
          })),
        )
        .sort((a, b) => a.on.localeCompare(b.on) || a.title.localeCompare(b.title)),
  };
  core.provide(agendaService("agreements"), agenda);

  // ---------------------------------------------------------------- search

  const search: SearchSource = {
    search: ({ terms, kind, limit }) => {
      if (terms.length === 0 || (kind !== null && kind !== "agreement")) return [];
      const all = book.agreements
        .filter((agreement) => matchesTerms(textOf(agreement), terms))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      const found = [
        ...all.filter((agreement) => matchesTerms([agreement.title], terms)),
        ...all.filter((agreement) => !matchesTerms([agreement.title], terms)),
      ];
      if (found.length === 0) return [];
      return [
        {
          kind: "agreement",
          count: found.length,
          hits: found.slice(0, Math.max(0, limit)).map((agreement) => ({
            kind: "agreement",
            id: agreement.agreement_id,
            title: agreement.title,
            subtitle: `${AGREEMENT_TYPES[agreement.type]} · ${AGREEMENT_STATUSES[agreement.status].label}`,
            snippet: snippetOf(agreement.notes, terms),
            href: agreementHref(agreement.agreement_id),
          })),
        },
      ];
    },
  };
  core.provide(searchService("agreements"), search);

  // ---------------------------------------------------------------- the service

  const service: AgreementsLookup = {
    forParty: (kind, refId) => {
      const today = core.day();
      return book.agreements
        .filter((agreement) =>
          agreement.parties.some((party) => party.kind === kind && party.ref_id === refId),
        )
        .sort(
          (a, b) =>
            (b.signed_on ?? "").localeCompare(a.signed_on ?? "") ||
            b.created_at.localeCompare(a.created_at),
        )
        .map((agreement) => viewOf(agreement, today));
    },
    usedFor: (fileId) =>
      book.agreements.flatMap((agreement) => [
        ...(agreement.signed_file_id === fileId
          ? [
              {
                label: `Signed copy of “${agreement.title}”, in Agreements`,
                href: agreementHref(agreement.agreement_id),
              },
            ]
          : []),
        ...(agreement.audit_trail_file_id === fileId
          ? [
              {
                label: `Signing record of “${agreement.title}”, in Agreements`,
                href: agreementHref(agreement.agreement_id),
              },
            ]
          : []),
      ]),
  };
  core.provide(COMPANY_SERVICES.agreements, service);

  // ---------------------------------------------------------------- routes

  core.route("GET", "/data/agreements", (ctx) => {
    const today = core.day();
    const type = clean(ctx.query.get("type"), 20);
    const status = clean(ctx.query.get("status"), 20);
    const terms = findTerms(clean(ctx.query.get("q"), AGREEMENT_LIMITS.search));
    const ended = ctx.query.get("ended") === "1";
    const offset = offsetOf(ctx.query.get("offset"));
    const searched = book.agreements.filter((agreement) => matchesTerms(textOf(agreement), terms));
    const counts: Record<string, number> = { all: 0, ended: 0 };
    for (const key of Object.keys(AGREEMENT_TYPES)) counts[key] = 0;
    for (const agreement of searched)
      if (isEnded(agreement)) counts.ended = (counts.ended ?? 0) + 1;
      else {
        counts.all = (counts.all ?? 0) + 1;
        counts[agreement.type] = (counts[agreement.type] ?? 0) + 1;
      }
    const shown = searched
      .filter(
        (agreement) =>
          isEnded(agreement) === ended &&
          (!(type in AGREEMENT_TYPES) || agreement.type === type) &&
          (!(status in AGREEMENT_STATUSES) || agreement.status === status),
      )
      .sort(
        (a, b) =>
          (b.effective_on ?? b.signed_on ?? "").localeCompare(
            a.effective_on ?? a.signed_on ?? "",
          ) || b.created_at.localeCompare(a.created_at),
      );
    return {
      agreements: shown.slice(offset, offset + 100).map((agreement) => rowOf(agreement, today)),
      total: shown.length,
      offset,
      limit: 100,
      counts,
      signed: book.agreements.filter(isSigned).length,
      missing: missing(),
      pickers: pickers(),
      files: fileChoices(core),
      files_here: core.need("files") !== null,
      today,
    };
  });

  const detailOf = (agreement: Agreement): Answer => {
    const today = core.day();
    return {
      agreement,
      worked: worked(agreement, today),
      party_links: agreement.parties.map(partyHref),
      signed_file: fileLink(core, agreement.signed_file_id),
      audit_file: fileLink(core, agreement.audit_trail_file_id),
      pickers: pickers(),
      files: fileChoices(core),
      files_here: core.need("files") !== null,
      events: book.eventsOf(agreement.agreement_id),
      today,
    };
  };

  /** Keeps a copy of an agreement: the signed one or the signing record. */
  async function attachCopy(
    agreement: Agreement,
    body: Record<string, unknown>,
    kind: "signed" | "audit_trail",
    by: { staff_id: string; name: string },
  ): Promise<Agreement> {
    const file = await keepCopy(
      core,
      body,
      {
        folder: copyFolder(agreement.type),
        title: `${agreement.title} – ${kind === "signed" ? "signed" : "signing record"}`,
        note: `${kind === "signed" ? "Signed copy" : "Signing record"} of an agreement`,
      },
      by,
    );
    return book.attach(agreement, kind, file.file_id, file.title, by);
  }

  core.route("POST", "/data/agreements", async (ctx) => {
    const by = ctx.staff();
    const asked = refs();
    const withCopy = copyGiven(ctx.body);
    if (withCopy) {
      book.check(ctx.body, asked);
      checkCopy(core, ctx.body);
    }
    const agreement = book.add(ctx.body, by, asked);
    if (withCopy) await attachCopy(agreement, ctx.body, "signed", by);
    return { agreement };
  });

  core.route("GET", "/data/agreements/:id", (ctx) => detailOf(book.get(ctx.params[0])));

  core.route("POST", "/data/agreements/:id/update", (ctx) => {
    const by = ctx.staff();
    return { agreement: book.update(book.get(ctx.params[0]), ctx.body, by, refs()) };
  });

  core.route("POST", "/data/agreements/:id/status", (ctx) => {
    const by = ctx.staff();
    return { agreement: book.setStatus(book.get(ctx.params[0]), ctx.body, by, core.day()) };
  });

  core.route("POST", "/data/agreements/:id/signed-copy", async (ctx) => {
    const by = ctx.staff();
    const agreement = book.get(ctx.params[0]);
    const kind = ctx.body.kind === "audit_trail" ? "audit_trail" : "signed";
    return { agreement: await attachCopy(agreement, ctx.body, kind, by) };
  });

  core.route("POST", "/data/agreements/:id/notice-given", (ctx) => {
    const by = ctx.staff();
    return { agreement: book.noticeGiven(book.get(ctx.params[0]), ctx.body, by, core.day()) };
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    core.route("POST", "/data/_test/agreements/pin", (ctx) => {
      ctx.staff();
      const id = ctx.body.id;
      if (!isRouteId(id)) throw new Refused(400, "invalid", "That is not an id.");
      const exists = book.agreements.some((agreement) => agreement.agreement_id === id);
      book.pinned = exists ? null : id;
      return { pinned: book.pinned, exists };
    });

    /** Installs a stand-in only while no real one is here; removes only its own. */
    function standIn<T>(name: string, fake: T, set: () => void) {
      return (ctx: { staff(): unknown; body: Record<string, unknown> }) => {
        ctx.staff();
        const current = core.need<T>(name);
        if (ctx.body.on === false) {
          if (current === fake) core.provide(name, null);
          return { installed: false };
        }
        if (current && current !== fake) return { installed: false, real: true };
        set();
        core.provide(name, fake);
        return { installed: true };
      };
    }

    let counts = { engaged: 0, with_letter: 0, interns_and_contractors: 0, with_ip: 0 };
    const fakeLetters: PeopleLetters = { counts: () => ({ ...counts }) };
    core.route("POST", "/data/_test/agreements/people-letters", (ctx) =>
      standIn(COMPANY_SERVICES.peopleLetters, fakeLetters, () => {
        const given =
          ctx.body.counts && typeof ctx.body.counts === "object"
            ? (ctx.body.counts as Record<string, unknown>)
            : {};
        const number = (key: string) => Math.max(0, wholeNumber(given[key], 0));
        counts = {
          engaged: number("engaged"),
          with_letter: number("with_letter"),
          interns_and_contractors: number("interns_and_contractors"),
          with_ip: number("with_ip"),
        };
      })(ctx),
    );

    let entries: ReturnType<WaitlistFeed["entries"]> = [];
    const fakeFeed: WaitlistFeed = { entries: () => entries, moves: () => [] };
    let firms: FakeFirm[] = [];
    const fakeRaise: InvestorsRaise = {
      funnel: () => {
        throw new Error("not in the stand-in");
      },
      firmOptions: () => firms,
      recipients: () => [],
      name: (id) => firms.find((firm) => firm.investor_id === id)?.firm ?? null,
    };

    core.route("POST", "/data/_test/agreements/waitlist-feed", (ctx) =>
      standIn(RAISE_SERVICES.waitlistFeed, fakeFeed, () => {
        const given = Array.isArray(ctx.body.entries) ? ctx.body.entries : [];
        entries = given.map((item, index) => {
          const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
          return {
            entry_id: clean(record.entry_id, 64) || `stand-in-entry-${index + 1}`,
            firm: clean(record.firm, 200) || `Walk Firm ${index + 1}`,
            domain: clean(record.domain, 200),
            firm_type: clean(record.firm_type, 60),
            free_mail: false,
            joined_on: clean(record.joined_on, 10) || core.day(),
            stage: clean(record.stage, 20) || "joined",
          };
        });
      })(ctx),
    );

    core.route("POST", "/data/_test/agreements/investors-raise", (ctx) =>
      standIn(RAISE_SERVICES.investorsRaise, fakeRaise, () => {
        const given = Array.isArray(ctx.body.firms) ? ctx.body.firms : [];
        firms = given.map((item, index) => {
          const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
          return {
            investor_id: clean(record.investor_id, 64) || `stand-in-firm-${index + 1}`,
            firm: clean(record.firm, 200) || `Walk Fund ${index + 1}`,
            stage: (clean(record.stage, 20) || "written") as InvestorStage,
          };
        });
      })(ctx),
    );

    core.route("GET", "/data/_test/agreements/agenda", () => ({
      items: core.need<AgendaSource>(agendaService("agreements"))?.agenda(core.day()) ?? [],
      today: core.day(),
    }));

    core.route("GET", "/data/_test/agreements/search", (ctx) => {
      const query = clean(ctx.query.get("q"), AGREEMENT_LIMITS.search);
      return {
        groups:
          core.need<SearchSource>(searchService("agreements"))?.search({
            query,
            terms: findTerms(query),
            kind: null,
            limit: 5,
          }) ?? [],
      };
    });
  }
}
