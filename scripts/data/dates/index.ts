/**
 * Key dates (spec §2.8; company spec §6): the dates he keeps, so nothing lapses, and the
 * dates suggested for an Indian private company, worked out from today, the company record
 * and the rule book. A suggestion is only ever a row with its rule, its source, the day it
 * was checked and "Add it": nothing is added on its own and nothing alarms for a date he did
 * not add. What he did add lands in the overview's Due once it is inside its reminder
 * window. Records that start a statutory clock add their dates through `key-dates`
 * (`from-records.ts`). Every rule shows its source and "Confirm with your CA/CS" until he
 * records who confirmed it; nothing here is legal advice and nothing is filed from here.
 */

import { writeFileSync } from "node:fs";

import { Refused } from "../../mail-merge/engine";
import {
  COMPANY_SERVICES,
  dueFrom,
  isRuleKey,
  lateAmount,
  lateDays,
  ruleOf,
  type MeetingKind,
  type MeetingsLookup,
  type RuleKey,
} from "../company-contracts";
import type { DataCore, DueItem } from "../core";
import { LIMITS, clean, isDay } from "../guard";
import type { Staff } from "../protocol";
import { toCsv } from "../text";
import { DATE_KINDS, DATE_STATES, DEFAULT_FOLDERS, REPEATS } from "../../../src/lib/data/labels";
import { CONFIRM_ROLES, OWNER_ROLES, dayWords, rupees } from "../../../src/lib/data/labels-company";
import type { FilesService } from "../leads/contracts";
import { readVault } from "../backup/vault-index";
import type { CompanyInternal } from "../company/types";
import { inOffice } from "../company/book";
import { registerDatesAgenda } from "./agenda";
import {
  ALL_ITEMS,
  CATALOGUE,
  CHECKED_ON,
  catalogueItem,
  workOut,
  type Facts,
  type Group,
} from "./catalogue";
import { DEFAULT_ENTITY, DatesBook, inWindow, openDate, shownState, type KeyDate } from "./book";
import { directorSuggestions, type RecordSuggestion } from "./facts";
import { keyDatesService } from "./from-records";
import { RuleBook, clockWords, isCalendarRule, type RuleView } from "./rules";

const BOM = "﻿";
const FILES_SHOWN = 500;
/** A filed copy comes in one JSON request: base64 grows it by a third, under the service's 6 MB. */
const COPY_MAX_BYTES = 3 * 1024 * 1024;
/** Filed copies kept from "Done" go into this folder inside 09 (or 08 for a tax payment). */
const FILED_COPIES = "Filed copies";
const folderNamed = (key: string, fallback: string): string =>
  DEFAULT_FOLDERS.find((folder) => folder.key === key)?.name ?? fallback;

export type Suggestion = {
  key: string;
  title: string;
  kind: KeyDate["kind"];
  group: Group | "company";
  rule: string;
  applies: string;
  repeats: KeyDate["repeats"];
  needs_agm: boolean;
  typed: boolean;
  next: string | null;
  checked_on: string;
  rule_key: RuleKey | null;
  source_url: string | null;
  sources: { name: string; url: string }[];
  verified_on: string;
  confirm_with: "CA" | "CS" | "lawyer" | null;
  confirmed: { name: string; role: string; on: string } | null;
  from_fact: string | null;
  needs: string | null;
  earliest: string | null;
  /** Not part of the answer: what "Add it" stores with the date. */
  statutory: boolean;
  origin: { key: string; label: string; href: string } | null;
  base_on: string | null;
  remind_days: KeyDate["remind_days"];
  notes: string;
};

export async function register(core: DataCore): Promise<void> {
  const book = new DatesBook(core);
  const rules = new RuleBook(core);
  registerDatesAgenda(core, book);
  const files = () => core.need<FilesService>("files");
  const company = () => core.need<CompanyInternal>(COMPANY_SERVICES.company);
  const meetings = () => core.need<MeetingsLookup>(COMPANY_SERVICES.meetings);
  const fileExists = (id: string): boolean => {
    const row = files()?.fileRow(id);
    return Boolean(row && !row.trashed_at);
  };
  const fileOf = (id: string | null) => {
    const row = id ? (files()?.fileRow(id) ?? null) : null;
    return row && !row.trashed_at ? { file_id: row.file_id, title: row.title } : null;
  };

  // ---------------------------------------------------------------- the facts, asked at request time

  const heldOn = (kind: MeetingKind): string | null => {
    try {
      const held = meetings()?.held(kind)[0]?.held_on;
      return isDay(held) ? held : null;
    } catch {
      return null;
    }
  };

  const lastAgm = (): { on: string; from: "meetings" | "typed" } | null => {
    const held = heldOn("agm");
    const typed = book.facts.agm_on;
    if (held && (!typed || held > typed)) return { on: held, from: "meetings" };
    return typed ? { on: typed, from: "typed" } : null;
  };

  const record = () => {
    try {
      const lookup = company();
      return lookup ? { facts: lookup.record(), directors: lookup.directors() } : null;
    } catch {
      return null;
    }
  };

  const factsNow = (): Facts => {
    const today = core.day();
    const known = record();
    const facts = known?.facts;
    return {
      agm_on: lastAgm()?.on ?? null,
      incorporated_on: facts?.incorporated_on ?? null,
      first_fy_end: facts?.first_fy_end ?? null,
      small: facts?.flags.small ?? "",
      startup: facts?.flags.startup ?? "",
      gst_registered: facts?.flags.gst_registered ?? "",
      exports: facts?.flags.exports ?? "",
      last_board_on: heldOn("board"),
      amounts: rules.amounts(),
      directors: known?.directors.filter((director) => inOffice(director, today)).length ?? 0,
    };
  };

  const factsKnown = (): boolean => {
    const known = record();
    return Boolean(known && (known.facts.updated_at !== null || known.directors.length > 0));
  };

  const keyDates = keyDatesService(core, book, rules, { facts: factsNow, lastAgm });
  core.provide(COMPANY_SERVICES.keyDates, keyDates);

  // ---------------------------------------------------------------- the suggestions

  const confirmedOf = (key: string | null) => {
    if (!key) return null;
    const found = rules.confirmation(key);
    return found ? { name: found.name, role: found.role, on: found.on } : null;
  };

  const notesFor = (row: {
    rule: string;
    applies: string;
    verified_on: string;
    confirm_with: string | null;
  }): string =>
    row.confirm_with
      ? `${row.rule}. Applies when: ${row.applies}. Checked on ${dayWords(row.verified_on)}; check with your ${row.confirm_with === "lawyer" ? "lawyer" : row.confirm_with}.`
      : `${row.rule}. Applies when: ${row.applies}.`;

  const fromRecord = (row: RecordSuggestion): Suggestion => {
    const rule = row.rule_key ? ruleOf(row.rule_key) : null;
    const verified = rule?.verified_on ?? CHECKED_ON;
    const words = rule ? clockWords(rule, rules.amount(rule.key)) : "The expiry date on the DSC";
    return {
      key: row.key,
      title: row.title,
      kind: row.kind,
      group: "company",
      rule: words,
      applies: rule ? "Each director in office" : "Every MCA form needs a director's DSC",
      repeats: row.repeats,
      needs_agm: false,
      typed: false,
      next: row.next,
      checked_on: CHECKED_ON,
      rule_key: row.rule_key,
      source_url: rule?.sources[0]?.url ?? null,
      sources: rule ? rule.sources.map((source) => ({ ...source })) : [],
      verified_on: verified,
      confirm_with: rule?.confirm_with ?? null,
      confirmed: confirmedOf(row.rule_key),
      from_fact: row.from_fact,
      needs: row.needs,
      earliest: null,
      statutory: row.statutory,
      origin: row.origin,
      base_on: row.base_on,
      remind_days: row.remind_days,
      notes: rule
        ? `${row.from_fact}. ${words}. Checked on ${dayWords(verified)}; check with your ${rule.confirm_with}.`
        : `${row.from_fact}.`,
    };
  };

  /** A catalogue row as it reads today, with the facts. */
  const catalogueRow = (
    item: (typeof ALL_ITEMS)[number],
    today: string,
    facts: Facts,
  ): Suggestion => {
    const worked = workOut(item, today, facts);
    const rule = worked.rule_key ? ruleOf(worked.rule_key) : null;
    const sources = rule ? rule.sources : item.sources;
    const verified = rule?.verified_on ?? item.verified_on;
    const confirm = rule?.confirm_with ?? item.confirm_with;
    return {
      key: item.key,
      title: worked.title,
      kind: item.kind,
      group: worked.from_fact ? "company" : item.group,
      rule: worked.rule,
      applies: item.applies,
      repeats: item.repeats,
      needs_agm: item.needs_agm,
      typed: item.typed,
      next: worked.next,
      checked_on: CHECKED_ON,
      rule_key: worked.rule_key,
      source_url: sources[0]?.url ?? null,
      sources: sources.map((source) => ({ ...source })),
      verified_on: verified,
      confirm_with: confirm,
      confirmed: confirmedOf(worked.rule_key ?? (isCalendarRule(item.key) ? item.key : null)),
      from_fact: worked.from_fact,
      needs: worked.needs,
      earliest: worked.earliest,
      statutory: item.group !== "renewal",
      origin: null,
      base_on: worked.base_on,
      remind_days: item.remind_days,
      notes: notesFor({
        rule: worked.rule,
        applies: item.applies,
        verified_on: verified,
        confirm_with: confirm,
      }),
    };
  };

  /** Each director's rows today (in office only), with the dates already added left out. */
  const recordRows = (today: string, facts: Facts): Suggestion[] => {
    const added = new Set(book.dates.map((date) => date.from_suggestion).filter(Boolean));
    const openOrigins = new Set(
      book.dates
        .filter(openDate)
        .map((date) => date.origin?.key ?? "")
        .filter(Boolean),
    );
    const directors = record()?.directors.filter((director) => inOffice(director, today)) ?? [];
    return directorSuggestions(directors, facts)
      .filter((row) => !added.has(row.key) && !openOrigins.has(row.origin.key))
      .map(fromRecord);
  };

  /** Every row the page lists today, the catalogue's and each director's, added ones left out. */
  const suggestionsNow = (today: string, facts: Facts) => {
    const added = new Set(book.dates.map((date) => date.from_suggestion).filter(Boolean));
    const rows: Suggestion[] = [];
    const hidden: { key: string; title: string; why: string }[] = [];
    for (const item of ALL_ITEMS) {
      if (added.has(item.key)) continue;
      const why = item.hidden(facts);
      if (why) {
        // A row listed only when the facts call for it is not "hidden" from anyone.
        if (CATALOGUE.includes(item)) hidden.push({ key: item.key, title: item.title, why });
        continue;
      }
      rows.push(catalogueRow(item, today, facts));
    }
    rows.push(...recordRows(today, facts));
    return { rows, hidden };
  };

  const answerOf = (row: Suggestion) => {
    const { statutory, origin, base_on, remind_days, notes, ...shown } = row;
    void statutory;
    void origin;
    void base_on;
    void remind_days;
    void notes;
    return shown;
  };

  // ---------------------------------------------------------------- rows

  const usedOf = (key: string, today: string) => {
    const on = book.dates.filter(
      (date) =>
        openDate(date) && (isRuleKey(key) ? date.rule_key === key : date.from_suggestion === key),
    );
    const movable = isRuleKey(key)
      ? on.filter((date) => {
          if (!date.base_on) return false;
          const due = dueFrom(ruleOf(key), date.base_on, rules.amount(key));
          return due !== null && due !== date.due_on;
        }).length
      : 0;
    void today;
    return { used_by: on.length, movable };
  };

  const ruleViewOf = (key: string, today: string): RuleView => rules.view(key, usedOf(key, today));

  const lateOf = (date: KeyDate, today: string) => {
    if (!date.statutory || !date.rule_key) return null;
    const rule = ruleOf(date.rule_key);
    if (!rule.late) return null;
    if (openDate(date) && date.due_on < today) {
      const days = lateDays(date.due_on, today);
      return { days, amount: lateAmount(rule, days), words: rule.late.words };
    }
    const filed = date.evidence.filed_on;
    if (date.state === "done" && filed && filed > date.due_on) {
      const days = lateDays(date.due_on, filed);
      return { days, amount: lateAmount(rule, days), words: rule.late.words };
    }
    return null;
  };

  const rowOf = (date: KeyDate, today: string) => ({
    ...date,
    shown_state: shownState(date, today),
    overdue: openDate(date) && date.due_on < today,
    reminding: inWindow(date, today),
    file: fileOf(date.file_id),
    filed_file: fileOf(date.evidence.filed_file_id),
    late: lateOf(date, today),
    rule: date.rule_key
      ? ruleViewOf(date.rule_key, today)
      : date.from_suggestion && isCalendarRule(date.from_suggestion)
        ? ruleViewOf(date.from_suggestion, today)
        : null,
  });

  // ---------------------------------------------------------------- Due

  core.provideDue((): DueItem[] => {
    const today = core.day();
    return book.dates
      .filter((date) => inWindow(date, today))
      .map((date) => {
        const late = lateOf(date, today);
        const sub = [DATE_KINDS[date.kind], date.entity, date.handled_by]
          .filter(Boolean)
          .join(" · ");
        return {
          key: `key_date:${date.date_id}`,
          kind: "key_date" as const,
          title: date.title,
          sub: late?.amount ? `${sub} · ${rupees(late.amount)} late fee so far` : sub,
          due_on: date.due_on,
          href: `/data/dates#date-${date.date_id}`,
        };
      });
  });

  // ---------------------------------------------------------------- the page

  core.route("GET", "/data/dates", (ctx) => {
    const today = core.day();
    const asked = clean(ctx.query.get("view"), 20) || "upcoming";
    const view =
      asked === "all" || asked === "done" || asked === "rules"
        ? (asked as "all" | "done" | "rules")
        : "upcoming";
    const sorted = [...book.dates].sort(
      (a, b) => a.due_on.localeCompare(b.due_on) || a.title.localeCompare(b.title),
    );
    const chosen =
      view === "all"
        ? sorted
        : view === "done"
          ? sorted.filter((date) => !openDate(date))
          : sorted.filter(openDate);
    const vault = files() ? readVault(core.store).filter((file) => !file.trashed) : [];
    const facts = factsNow();
    const suggested = suggestionsNow(today, facts);
    return {
      view,
      dates: chosen.map((date) => rowOf(date, today)),
      counts: {
        upcoming: sorted.filter(openDate).length,
        done: sorted.filter((date) => !openDate(date)).length,
        all: sorted.length,
      },
      suggestions: suggested.rows.map(answerOf),
      hidden: suggested.hidden,
      facts: book.facts,
      facts_known: factsKnown(),
      checked_on: CHECKED_ON,
      files: vault
        .map((file) => ({
          file_id: file.file_id,
          title: file.title,
          folder: file.folder.join(" › "),
        }))
        .sort((a, b) => a.folder.localeCompare(b.folder) || a.title.localeCompare(b.title))
        .slice(0, FILES_SHOWN),
      files_here: files() !== null,
      today,
    };
  });

  core.route("POST", "/data/dates", (ctx) => {
    const by = ctx.staff();
    return { date: rowOf(book.add(ctx.body, by, fileExists), core.day()) };
  });

  core.route("POST", "/data/dates/facts", (ctx) => {
    ctx.staff();
    return { facts: book.setFacts({ agm_on: ctx.body.agm_on }) };
  });

  core.route("POST", "/data/dates/suggested/:key/add", (ctx) => {
    const by = ctx.staff();
    const key = ctx.params[0]!;
    const agm = clean(ctx.body.agm_on, 10);
    if (isDay(agm) && agm !== book.facts.agm_on) book.setFacts({ agm_on: agm });
    const today = core.day();
    const facts = factsNow();
    if (book.dates.some((date) => date.from_suggestion === key))
      throw new Refused(409, "already_added", "That date is in your list already.");
    const item = catalogueItem(key);
    const found = item
      ? catalogueRow(item, today, facts)
      : recordRows(today, facts).find((row) => row.key === key);
    if (!found) throw new Refused(404, "not_found", "That suggestion is not here.");
    if (found.origin && book.dates.some((d) => openDate(d) && d.origin?.key === found.origin?.key))
      throw new Refused(409, "already_added", "That date is in your list already.");
    const typedDay = clean(ctx.body.due_on, 10);
    const due_on = isDay(typedDay) ? typedDay : found.next;
    if (!due_on)
      throw new Refused(
        400,
        "invalid",
        found.needs_agm ? "Say when the AGM was held first." : "Choose the day it is due.",
      );
    const date = book.add(
      {
        title: found.title,
        kind: found.kind,
        due_on,
        repeats: found.repeats,
        remind_days: found.remind_days,
        entity: ctx.body.entity ?? DEFAULT_ENTITY,
        handled_by: ctx.body.handled_by ?? "",
        notes: clean(ctx.body.notes, LIMITS.notes) || found.notes,
      },
      by,
      fileExists,
      key,
      {
        rule_key: found.rule_key,
        statutory: found.statutory,
        origin: found.origin,
        base_on: isDay(typedDay) && typedDay !== found.next ? null : found.base_on,
      },
    );
    return { date: rowOf(date, today) };
  });

  core.route("POST", "/data/dates/:id/update", (ctx) => {
    const by = ctx.staff();
    const date = book.get(ctx.params[0]);
    return { date: rowOf(book.update(date, ctx.body, by, fileExists), core.day()) };
  });

  core.route("POST", "/data/dates/:id/done", async (ctx) => {
    const by = ctx.staff();
    const date = book.get(ctx.params[0]);
    if (!openDate(date)) throw new Refused(409, "invalid", "That date is not coming up.");
    // Checked before a copy is kept, so a refused fee leaves nothing behind in Files.
    const evidence = book.evidenceInput(ctx.body, null);
    const given = clean(ctx.body.filed_file_id, 64);
    const content = typeof ctx.body.content === "string" ? ctx.body.content : "";
    if (given || content) {
      const vault = files();
      if (!vault)
        throw new Refused(
          409,
          "files_missing",
          "Files is not set up here yet, so a copy cannot be kept.",
        );
      if (given) {
        const row = vault.fileRow(given);
        if (!row || row.trashed_at)
          throw new Refused(404, "not_found", "That file is not in Files.");
        evidence.filed_file_id = row.file_id;
      } else {
        const original =
          clean(ctx.body.name, LIMITS.file_name).replace(/[\\/]/g, "_") || "Filed copy";
        const bytes = Buffer.from(content, "base64");
        if (bytes.length === 0) throw new Refused(400, "empty", "That file is empty.");
        if (bytes.length > COPY_MAX_BYTES)
          throw new Refused(
            400,
            "too_large",
            "That copy is over 3 MB. Put it in Files, then choose it from there.",
          );
        const folder =
          date.kind === "tax"
            ? folderNamed("finance", "08 Finance, tax and audit")
            : folderNamed("mca", "09 MCA filings and compliance");
        const row = await vault.putFile({
          // A folder of its own inside the default one, as the waitlist's proof is kept, so
          // the default folder itself stays as he left it.
          folderPath: [folder, FILED_COPIES],
          title: `${date.title} – filed ${dayWords(evidence.filed_on ?? core.day())}`.slice(
            0,
            LIMITS.title,
          ),
          originalName: original,
          bytes: new Uint8Array(bytes),
          by,
          note: `Filed copy of “${date.title}”`,
        });
        evidence.filed_file_id = row.file_id;
      }
    }
    return { date: rowOf(book.done(date, evidence, by, factsNow()), core.day()) };
  });

  core.route("POST", "/data/dates/:id/in-progress", (ctx) => {
    const by = ctx.staff();
    const date = book.get(ctx.params[0]);
    return { date: rowOf(book.inProgress(date, ctx.body.note, by), core.day()) };
  });

  core.route("POST", "/data/dates/:id/not-for-us", (ctx) => {
    const by = ctx.staff();
    const date = book.get(ctx.params[0]);
    return { date: rowOf(book.notForUs(date, ctx.body, by), core.day()) };
  });

  core.route("POST", "/data/dates/:id/sign-off", (ctx) => {
    const by = ctx.staff();
    const date = book.get(ctx.params[0]);
    return { date: rowOf(book.signOff(date, ctx.body, by), core.day()) };
  });

  core.route("POST", "/data/dates/:id/owner", (ctx) => {
    const by = ctx.staff();
    const date = book.get(ctx.params[0]);
    return { date: rowOf(book.setOwner(date, ctx.body, by), core.day()) };
  });

  core.route("POST", "/data/dates/:id/delete", (ctx) => {
    ctx.staff();
    const date = book.get(ctx.params[0]);
    book.remove(date);
    return { deleted: date.date_id };
  });

  // ---------------------------------------------------------------- the rule book

  core.route("GET", "/data/dates/rules", () => {
    const today = core.day();
    const views = rules.keys().map((key) => ruleViewOf(key, today));
    return {
      rules: views,
      counts: {
        all: views.length,
        confirmed: views.filter((view) => view.confirmed !== null).length,
        changed: views.filter((view) => view.changed).length,
      },
    };
  });

  core.route("POST", "/data/dates/rules/:key/amount", (ctx) => {
    const by = ctx.staff();
    const key = ctx.params[0]!;
    rules.setAmount(key, ctx.body.amount, by);
    return { rule: ruleViewOf(key, core.day()) };
  });

  core.route("POST", "/data/dates/rules/:key/confirm", (ctx) => {
    const by = ctx.staff();
    const key = ctx.params[0]!;
    rules.confirm(key, ctx.body, by);
    return { rule: ruleViewOf(key, core.day()) };
  });

  core.route("POST", "/data/dates/rules/:key/unconfirm", (ctx) => {
    const by = ctx.staff();
    const key = ctx.params[0]!;
    rules.unconfirm(key, by);
    return { rule: ruleViewOf(key, core.day()) };
  });

  core.route("POST", "/data/dates/rules/:key/move", (ctx) => {
    ctx.staff();
    const key = ctx.params[0]!;
    if (!isRuleKey(key)) {
      if (isCalendarRule(key)) return { moved: 0 };
      throw new Refused(404, "not_found", "That rule is not here.");
    }
    let moved = 0;
    for (const date of book.dates) {
      if (!openDate(date) || date.rule_key !== key || !date.base_on) continue;
      const due = dueFrom(ruleOf(key), date.base_on, rules.amount(key));
      if (!due || due === date.due_on) continue;
      date.due_on = due;
      date.updated_at = core.now();
      moved += 1;
    }
    if (moved) book.save();
    return { moved };
  });

  // ---------------------------------------------------------------- the sheet for the CA

  core.builds.provide("dates_csv", async (handle, input) => {
    const today = core.day();
    const all = [...book.dates].sort((a, b) => a.due_on.localeCompare(b.due_on));
    handle.setProgress(0, all.length);
    await core.yield();
    const title = (id: string | null) => (id ? (files()?.fileRow(id)?.title ?? "") : "");
    const text =
      BOM +
      toCsv(
        [
          "due_on",
          "what",
          "kind",
          "repeats",
          "company",
          "handled_by",
          "remind_days_before",
          "state",
          "notes",
          "file",
          "suggested_rule",
          "last_done",
          "rule",
          "source",
          "checked_on",
          "confirmed_by",
          "owner",
          "srn",
          "challan",
          "filed_on",
          "fee_paid",
          "filed_copy",
          "not_for_us_signed_off_by",
          "from_record",
        ],
        all.map((date) => {
          const view = rowOf(date, today).rule;
          const last = date.history[date.history.length - 1];
          const evidence =
            date.evidence.srn || date.evidence.filed_on || date.evidence.filed_file_id
              ? date.evidence
              : (last?.evidence ?? date.evidence);
          return [
            date.due_on,
            date.title,
            DATE_KINDS[date.kind],
            REPEATS[date.repeats],
            date.entity,
            date.handled_by,
            date.remind_days,
            DATE_STATES[shownState(date, today)],
            date.notes,
            title(date.file_id),
            date.from_suggestion ?? "",
            last?.done_at.slice(0, 10) ?? "",
            view ? `${view.title}: ${view.clock}` : "",
            view ? view.sources.map((source) => source.url).join(" ; ") : "",
            view?.verified_on ?? "",
            view?.confirmed
              ? `${view.confirmed.name} (${CONFIRM_ROLES[view.confirmed.role]}), ${view.confirmed.on}`
              : "",
            date.owner_role ? OWNER_ROLES[date.owner_role] : "",
            evidence.srn,
            evidence.challan,
            evidence.filed_on ?? "",
            evidence.fee_paid ?? "",
            title(evidence.filed_file_id),
            date.sign_off ? `${date.sign_off.name} (${CONFIRM_ROLES[date.sign_off.role]})` : "",
            date.origin?.label ?? "",
          ];
        }),
      );
    writeFileSync(handle.path, text, { mode: 0o600 });
    handle.setProgress(all.length, all.length);
    core.store.appendLine("dates/exports.jsonl", {
      at: core.now(),
      by: input.by,
      kind: "dates",
      rows: all.length,
    });
    return { name: `Key dates ${today}.csv`, type: "text/csv; charset=utf-8" };
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    /** What the `key-dates` service answers, call by call, for the tests and the walk. */
    core.route("POST", "/data/_test/key-dates", (ctx) => {
      const by: Staff = ctx.staff();
      const args = Array.isArray(ctx.body.args) ? (ctx.body.args as unknown[]) : [];
      const text = (index: number) => String(args[index] ?? "");
      switch (clean(ctx.body.call, 20)) {
        case "add":
          return { result: keyDates.add((args[0] ?? []) as never, by) };
        case "linksFor":
          return { result: keyDates.linksFor(text(0)) };
        case "rebase":
          return { result: keyDates.rebase(text(0), text(1), by) };
        case "done": {
          const key = text(1);
          if (!isRuleKey(key)) throw new Refused(400, "invalid", "That rule is not here.");
          return { result: keyDates.done(text(0), key, (args[2] ?? {}) as never, by) };
        }
        case "takeBack":
          return { result: keyDates.takeBack(text(0), text(1), by) };
        default:
          throw new Refused(400, "invalid", "That call is not allowed.");
      }
    });

    // A stand-in `meetings` (company spec §3.3), only while C2's module is absent.
    type Held = {
      meeting_id: string;
      kind: MeetingKind;
      held_on: string;
      title: string;
      href: string;
    };
    let held: Held[] = [];
    const fake: MeetingsLookup = {
      usedFor: () => [],
      held: (kind) =>
        held
          .filter((meeting) => !kind || meeting.kind === kind)
          .sort((a, b) => b.held_on.localeCompare(a.held_on)),
      passed: () => [],
      resolution: () => null,
    };
    core.route("POST", "/data/_test/dates/meetings", (ctx) => {
      ctx.staff();
      const current = meetings();
      if (ctx.body.on === false) {
        if (current === fake) core.provide(COMPANY_SERVICES.meetings, null);
        held = [];
        return { installed: false };
      }
      if (current && current !== fake) return { installed: false, real: true };
      const given = Array.isArray(ctx.body.held)
        ? (ctx.body.held as Record<string, unknown>[])
        : [];
      held = given
        .filter((item) => isDay(item.held_on))
        .map((item, index) => {
          const kind = (["board", "agm", "egm", "circular"] as const).find(
            (value) => value === item.kind,
          );
          return {
            meeting_id: clean(item.meeting_id, 64) || `stand-in-${index + 1}`,
            kind: kind ?? "board",
            held_on: String(item.held_on),
            title: clean(item.title, 200) || "Invented meeting",
            href: "/data/company/meetings",
          };
        });
      core.provide(COMPANY_SERVICES.meetings, fake);
      return { installed: true, held };
    });
  }
}
