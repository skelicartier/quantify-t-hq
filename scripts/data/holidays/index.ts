/**
 * Holidays (ws-notes/duties/spec.md §7.4, report A4): the holiday set he keeps (national,
 * state and company days off; optional days listed, never days off), the working week, and
 * working-day arithmetic for every unit that counts working days (`holidays`). A year with no
 * holidays recorded counts Monday to Friday (or his weekly off days) and says so. Nothing is
 * guessed: no list ships in the code; the one button adds the three fixed national days of the
 * year he picks. The calendar shows each holiday a year ahead (`agenda:holidays`); there is no
 * Due row and no search. A record and a reminder, not legal advice: which state's rules apply
 * and its minimum are his CA's to confirm.
 */

import { writeFileSync } from "node:fs";

import { Refused } from "../../mail-merge/engine";
import type { DataCore } from "../core";
import {
  DUTIES_SERVICES,
  ruleLineOf,
  type DutyRulesService,
  type RuleLine,
} from "../duties-contracts";
import { clean, isDay } from "../guard";
import { agendaService, type AgendaSource } from "../raise-contracts";
import { toCsv } from "../text";
import { HOLIDAY_KINDS, WEEKDAYS } from "../../../src/lib/data/labels-calendar";
import { HOLIDAY_SAY, HolidaysBook, holidayAgenda } from "./book";
import { AGENDA_DAYS, HOLIDAY_FIRST_YEAR, HOLIDAY_LAST_YEAR, HOLIDAY_LIMITS } from "./limits";
import { WALK_HOLIDAYS } from "./walk-seed";

const BOM = "﻿";

export async function register(core: DataCore): Promise<void> {
  const book = new HolidaysBook(core);

  core.provide(DUTIES_SERVICES.holidays, book.service());

  const agenda: AgendaSource = {
    agenda: (today) => holidayAgenda(book, today, AGENDA_DAYS),
  };
  core.provide(agendaService("holidays"), agenda);

  core.provideOverview("holidays", () => {
    const today = core.day();
    const next = book.holidays.find((holiday) => holiday.on >= today) ?? null;
    return {
      this_year: book.inYear(Number(today.slice(0, 4))).length,
      next: next ? { name: next.name, on: next.on } : null,
    };
  });

  /** The two rules beside the working week, from the rule book; null when it is not loaded. */
  const ruleLine = (key: "holidays-national" | "holidays-state"): RuleLine | null => {
    const rules = core.need<DutyRulesService>(DUTIES_SERVICES.dutyRules);
    if (!rules) return null;
    try {
      return ruleLineOf(rules.state(key));
    } catch {
      return null;
    }
  };

  const yearOf = (value: unknown, today: string): number => {
    const text = typeof value === "number" ? String(value) : clean(value, 4);
    const year = /^\d{4}$/.test(text) ? Number(text) : Number(today.slice(0, 4));
    return year >= HOLIDAY_FIRST_YEAR && year <= HOLIDAY_LAST_YEAR
      ? year
      : Number(today.slice(0, 4));
  };

  // ---------------------------------------------------------------- the year

  core.route("GET", "/data/holidays", (ctx) => {
    const today = core.day();
    const year = yearOf(ctx.query.get("year"), today);
    const held = book.inYear(year);
    const thisYear = Number(today.slice(0, 4));
    const years = [...new Set([...book.years(), thisYear, thisYear + 1, year])].sort(
      (a, b) => a - b,
    );
    const counts = { national: 0, state: 0, company: 0, optional: 0 };
    for (const holiday of held) counts[holiday.kind] += 1;
    return {
      year,
      years,
      setup: book.setup,
      holidays: held.map((holiday) => book.rowOf(holiday)),
      checks: book.checks(year),
      counts,
      rules: { national: ruleLine("holidays-national"), state: ruleLine("holidays-state") },
      today,
    };
  });

  // Fixed paths before `:id` paths.
  core.route("POST", "/data/holidays/national", (ctx) => {
    const by = ctx.staff();
    return { added: book.national(ctx.body.year, by) };
  });

  core.route("POST", "/data/holidays/bulk", (ctx) => {
    const by = ctx.staff();
    return { added: book.bulk(ctx.body.text, by) };
  });

  core.route("POST", "/data/holidays/setup", (ctx) => {
    const by = ctx.staff();
    return { setup: book.saveSetup(ctx.body, by) };
  });

  core.route("GET", "/data/holidays/working-days", (ctx) => {
    const today = core.day();
    const fromText = clean(ctx.query.get("from"), 10);
    const from = fromText || today;
    if (!isDay(from)) throw new Refused(400, "invalid", "That is not a day.");
    const countText = clean(ctx.query.get("count"), 4);
    const count = /^\d+$/.test(countText) ? Number(countText) : Number.NaN;
    if (!Number.isSafeInteger(count) || count < 0 || count > HOLIDAY_LIMITS.working_days)
      throw new Refused(400, "invalid", HOLIDAY_SAY.count);
    return book.count(from, count);
  });

  core.route("POST", "/data/holidays", (ctx) => {
    const by = ctx.staff();
    return { holiday: book.rowOf(book.add(ctx.body, by)) };
  });

  core.route("POST", "/data/holidays/:id/update", (ctx) => {
    const by = ctx.staff();
    return { holiday: book.rowOf(book.update(book.get(ctx.params[0]), ctx.body, by)) };
  });

  core.route("POST", "/data/holidays/:id/remove", (ctx) => {
    const by = ctx.staff();
    book.remove(book.get(ctx.params[0]), by);
    return { removed: true };
  });

  // ---------------------------------------------------------------- the year as a CSV

  /**
   * The year's holidays for the CA or a calendar. A build, as every CSV in Data is: the host
   * streams only Files' and builds' bytes.
   */
  core.builds.provide("holidays_csv", async (handle, input) => {
    const today = core.day();
    const year = yearOf(input.body.year, today);
    const rows = book.inYear(year).map((holiday) => {
      const row = book.rowOf(holiday);
      return [row.on, row.weekday, row.name, HOLIDAY_KINDS[row.kind], row.note];
    });
    handle.setProgress(0, rows.length);
    await core.yield();
    writeFileSync(handle.path, BOM + toCsv(["day", "weekday", "holiday", "kind", "note"], rows), {
      mode: 0o600,
    });
    handle.setProgress(rows.length, rows.length);
    return { name: `Holidays ${year}.csv`, type: "text/csv; charset=utf-8" };
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    /**
     * The walk's and the tests' start: `reset` empties the set and the working week (safe to run
     * twice); `holidays` adds invented days that are not there yet; `walk: true` adds the walk's
     * own company day.
     */
    core.route("POST", "/data/_test/holidays/seed", (ctx) => {
      const by = ctx.staff();
      if (ctx.body.reset === true) book.reset();
      const given = Array.isArray(ctx.body.holidays)
        ? (ctx.body.holidays as Record<string, unknown>[])
        : ctx.body.walk === true
          ? WALK_HOLIDAYS.map((holiday) => ({ ...holiday }))
          : [];
      let added = 0;
      for (const holiday of given) {
        if (book.holidays.some((item) => item.on === holiday.on)) continue;
        book.add(holiday, by);
        added += 1;
      }
      return { added, holidays: book.holidays.length, weekdays: WEEKDAYS.length };
    });
  }
}
