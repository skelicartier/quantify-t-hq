/**
 * The company record (ws-notes/company/spec.md §6): the company's own facts, kept on this
 * computer and edited by group; its directors, who cease and stay; and each director's
 * changes to the email, mobile or address on the MCA record, whose 30-day KYC-Web filing
 * becomes a Key date when he leaves the box ticked. Checks compare the facts and are lines,
 * never refusals. Key dates works the filings out from these facts as suggestions; nothing
 * here is legal advice and nothing is filed from here. Provides `company`.
 */

import { COMPANY_SERVICES, NO_EVIDENCE } from "../company-contracts";
import type { DataCore } from "../core";
import { addDays } from "../days";
import type { Staff } from "../protocol";
import { firstFyEndOptions } from "../../../src/lib/data/labels-company";
import type { Facts as CatalogueFacts } from "../dates/catalogue";
import { changeItem, changeOrigin, decides, dscOrigin, kycDue, kycOrigin } from "../dates/facts";
import type { KeyDatesInternal } from "../dates/from-records";
import { CompanyBook, dscSoon, factsEmpty, inOffice } from "./book";
import { checksOf } from "./checks";
import type { CompanyInternal, ContactChange, Director } from "./types";
import { WALK_DIRECTOR_ID, walkDirector } from "./walk-seed";

/** The facts the overview names when they are blank, in this order. */
const FACTS_NEEDED: readonly [string, (facts: CompanyBook["facts"]) => boolean][] = [
  ["Legal name", (facts) => !facts.legal_name],
  ["CIN", (facts) => !facts.cin],
  ["PAN", (facts) => !facts.pan],
  ["Incorporation day", (facts) => !facts.incorporated_on],
  ["First financial year's end", (facts) => !facts.first_fy_end],
];

const ticked = (value: unknown): boolean => value === true || value === "on" || value === "true";

export function register(core: DataCore): void {
  const book = new CompanyBook(core);
  const keyDates = () => core.need<KeyDatesInternal>(COMPANY_SERVICES.keyDates);

  const lookup: CompanyInternal = {
    usedFor: () => [],
    facts: () => ({
      legal_name: book.facts.legal_name,
      incorporated_on: book.facts.incorporated_on,
      first_fy_end: book.facts.first_fy_end,
      small: book.facts.flags.small,
      startup: book.facts.flags.startup,
      subsidiary: book.facts.flags.subsidiary,
      foreign_investment: book.facts.flags.foreign_investment,
      dpiit_number: book.facts.dpiit.number,
      firms_registered_on: book.facts.firms.registered_on,
    }),
    directorsOn: (day) =>
      book.directors
        .filter((director) => inOffice(director, day))
        .map((director) => ({
          director_id: director.director_id,
          name: director.name,
          is_founder: director.is_founder,
        })),
    record: () => structuredClone(book.facts),
    directors: () => book.directors.map((director) => structuredClone(director)),
    changes: () => book.changes.map((change) => ({ ...change })),
  };
  core.provide(COMPANY_SERVICES.company, lookup);

  /** The facts as Key dates works its dates out with them; the rule's own amounts without it. */
  const catalogueFacts = (): CatalogueFacts => {
    try {
      return keyDates()?.facts() ?? { agm_on: null };
    } catch {
      return { agm_on: null };
    }
  };

  const fileBy = (change: ContactChange): string =>
    keyDates()?.dueOn("dir-3-kyc-change", change.changed_on) ?? addDays(change.changed_on, 30);

  const rowOf = (director: Director, today: string, facts: CatalogueFacts) => {
    const open = book.changesOf(director.director_id).filter((change) => !change.filed);
    const firstBy = open.map(fileBy).sort()[0] ?? null;
    const kyc = kycDue(director, facts);
    return {
      ...director,
      in_office: inOffice(director, today),
      dsc_soon: !director.ceased_on && dscSoon(director, today),
      next_kyc: director.ceased_on ? null : { due_on: kyc.due_on, words: kyc.words },
      changes_to_file: { count: open.length, first_by: firstBy },
    };
  };

  const director = (id: string | undefined) => book.director(id);

  // ---------------------------------------------------------------- the facts

  core.route("GET", "/data/company", () => {
    const today = core.day();
    const facts = catalogueFacts();
    const inOfficeNow = book.directors.filter((item) => inOffice(item, today));
    let lastAgm: { on: string; from: "meetings" | "typed" } | null = null;
    try {
      lastAgm = keyDates()?.lastAgm() ?? null;
    } catch {
      lastAgm = null;
    }
    return {
      facts: book.facts,
      empty: factsEmpty(book.facts),
      checks: checksOf(book.facts),
      decides: decides({
        facts: {
          ...facts,
          incorporated_on: book.facts.incorporated_on,
          first_fy_end: book.facts.first_fy_end,
          small: book.facts.flags.small,
          startup: book.facts.flags.startup,
        },
        directors: inOfficeNow,
        agm: lastAgm,
      }),
      changes: book.events((event) => event.target === "facts"),
      first_fy_end_options: firstFyEndOptions(book.facts.incorporated_on),
      directors_in_office: inOfficeNow.length,
      last_agm: lastAgm,
      contacts_here: core.need("contacts") !== null,
      today,
    };
  });

  core.route("POST", "/data/company/facts", (ctx) => {
    const by = ctx.staff();
    const facts = book.saveFacts(ctx.body.group, ctx.body, by);
    return { facts, checks: checksOf(facts) };
  });

  // ---------------------------------------------------------------- directors

  core.route("GET", "/data/company/directors", (ctx) => {
    const today = core.day();
    const facts = catalogueFacts();
    const all = ctx.query.get("ceased") === "1";
    const rows = book.directors
      .filter((item) => all || !item.ceased_on)
      .sort(
        (a, b) =>
          Number(Boolean(a.ceased_on)) - Number(Boolean(b.ceased_on)) ||
          (a.appointed_on ?? "").localeCompare(b.appointed_on ?? "") ||
          a.name.localeCompare(b.name),
      )
      .map((item) => rowOf(item, today, facts));
    return {
      directors: rows,
      counts: {
        in_office: book.directors.filter((item) => inOffice(item, today)).length,
        ceased: book.directors.filter((item) => item.ceased_on).length,
      },
      today,
    };
  });

  core.route("POST", "/data/company/directors", (ctx) => {
    const by = ctx.staff();
    const added = book.addDirector(ctx.body, by);
    return { director: rowOf(added, core.day(), catalogueFacts()) };
  });

  core.route("GET", "/data/company/directors/:id", (ctx) => {
    const today = core.day();
    const found = director(ctx.params[0]);
    const changes = book.changesOf(found.director_id);
    let keyDatesOf: unknown[] = [];
    try {
      keyDatesOf =
        keyDates()?.datesOf([
          dscOrigin(found.director_id),
          kycOrigin(found.director_id),
          ...changes.map((change) => changeOrigin(change.change_id)),
        ]) ?? [];
    } catch {
      keyDatesOf = [];
    }
    return {
      director: rowOf(found, today, catalogueFacts()),
      changes: changes.map((change) => ({ ...change, file_by: fileBy(change) })),
      key_dates: keyDatesOf,
      key_dates_here: keyDates() !== null,
      events: book.events((event) => event.target === "director" && event.id === found.director_id),
      today,
    };
  });

  core.route("POST", "/data/company/directors/:id/update", (ctx) => {
    const by = ctx.staff();
    const found = director(ctx.params[0]);
    const before = found.dsc.expires_on;
    const changed = book.updateDirector(found, ctx.body, by);
    const after = changed.dsc.expires_on;
    if (after && after !== before)
      keyDates()?.moveDsc(
        dscOrigin(changed.director_id),
        after,
        `director-dsc-${changed.director_id}-${after.replace(/-/g, "")}`,
      );
    return { director: rowOf(changed, core.day(), catalogueFacts()) };
  });

  core.route("POST", "/data/company/directors/:id/contact-change", (ctx) => {
    const by: Staff = ctx.staff();
    const found = director(ctx.params[0]);
    const change = book.contactChange(found, ctx.body, by);
    const service = keyDates();
    const links =
      ticked(ctx.body.add_date) && service ? service.add([changeItem(change, found)], by) : [];
    return {
      director: rowOf(found, core.day(), catalogueFacts()),
      change: { ...change, file_by: fileBy(change) },
      key_dates: links,
    };
  });

  core.route("POST", "/data/company/directors/:id/contact-change/:changeId/filed", (ctx) => {
    const by = ctx.staff();
    const found = director(ctx.params[0]);
    const change = book.changeFiled(found, book.change(found, ctx.params[1]), ctx.body, by);
    keyDates()?.done(
      changeOrigin(change.change_id),
      "dir-3-kyc-change",
      { ...NO_EVIDENCE, srn: change.filed?.srn ?? "", filed_on: change.filed?.on ?? null },
      by,
    );
    return { change: { ...change, file_by: fileBy(change) } };
  });

  core.route("POST", "/data/company/directors/:id/kyc", (ctx) => {
    const by = ctx.staff();
    const found = director(ctx.params[0]);
    const changed = book.kyc(found, ctx.body, by);
    keyDates()?.done(
      kycOrigin(changed.director_id),
      "dir-3-kyc",
      { ...NO_EVIDENCE, srn: changed.kyc.srn, filed_on: changed.kyc.last_filed_on },
      by,
    );
    const row = rowOf(changed, core.day(), catalogueFacts());
    return { director: row, next_kyc: row.next_kyc };
  });

  core.route("POST", "/data/company/directors/:id/ceased", (ctx) => {
    const by = ctx.staff();
    const found = director(ctx.params[0]);
    return {
      director: rowOf(book.cease(found, ctx.body.ceased_on, by), core.day(), catalogueFacts()),
    };
  });

  // ---------------------------------------------------------------- the overview's block

  core.provideOverview("company", () => {
    const today = core.day();
    const office = book.directors.filter((item) => inOffice(item, today));
    let unconfirmed = 0;
    try {
      unconfirmed = keyDates()?.rulesUnconfirmed() ?? 0;
    } catch {
      unconfirmed = 0;
    }
    return {
      incorporated_on: book.facts.incorporated_on,
      directors: office.length,
      dsc_soon: office.filter((item) => dscSoon(item, today)).length,
      rules_unconfirmed: unconfirmed,
      facts_missing: FACTS_NEEDED.filter(([, blank]) => blank(book.facts)).map(([words]) => words),
    };
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    core.route("POST", "/data/_test/company/seed", (ctx) => {
      const by = ctx.staff();
      const found = book.directors.find((item) => item.director_id === WALK_DIRECTOR_ID);
      if (found) return { director: found, created: false };
      const made = book.addDirector(walkDirector(core.day()), by, WALK_DIRECTOR_ID);
      return { director: made, created: true };
    });
  }
}
