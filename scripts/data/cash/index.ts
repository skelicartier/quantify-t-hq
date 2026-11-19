/**
 * The cash view (ws-notes/duties/spec.md §7.6, report B7): what is already known to be coming
 * in and going out over the next 13 weeks (the open bills from Money, the stipends from the
 * people ledger, what he types), three scenarios for the next 24 months, and four or five
 * thresholds to watch, each beside its rule. A forecast to think with, not a record: nothing
 * here is a target, and nothing is stored but what he types (`cash/setup.json`).
 *
 * THE OWNER RULE. Stipends come from `people-pay`, whose `paid` and `owed` name people and
 * amounts. `GET /data/cash` and the CSV pass them on only when asked with `owner=1` (which
 * only the portal sets, from `context.me.role === "owner"`): without it there is no
 * `stipends` row, no item whose key starts `stipend:`, no name and no amount of the ledger in
 * the answer, the closing figures leave stipends out, and `stipends_left_out` says so. The
 * headcount (counts only) is given either way; the scenarios never read the ledger.
 *
 * Every other module is optional: without Money, statements or the people ledger the view
 * says which is not loaded here, and nothing throws.
 */

import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

import { Refused } from "../../mail-merge/engine";
import { fyStartYear } from "../company-contracts";
import type { Ctx, DataCore } from "../core";
import {
  DUTIES_SERVICES,
  standInDutyRules,
  type BillView,
  type CashNow,
  type CategoryView,
  type DutyRuleKey,
  type DutyRulesService,
  type DutyStored,
  type ExportView,
  type MoneyLookup,
  type PayLine,
  type PayOwed,
  type PeoplePay,
  type StatementsFeed,
} from "../duties-contracts";
import { clean, cleanText, isDay } from "../guard";
import type { Staff } from "../protocol";
import { toCsv } from "../text";
import {
  AMOUNT_WORDS,
  isDutyCurrency,
  minorInput,
  minorOf,
} from "../../../src/lib/data/labels-duties";
import { CASH_LEFT_OUT } from "../../../src/lib/data/labels-calendar";
import { CASH_DEFAULTS, CASH_LIMITS } from "./limits";
import { scenariosOf } from "./scenarios";
import { tilesOf } from "./tiles";
import type { CashEvent, CashFile, CashLine, CashSetup, CashTable } from "./types";
import { weekTable, weeksOf } from "./weeks";

const FILE = "cash/setup.json";
const BOM = "﻿";

export const CASH_SAY = {
  name: "Name it, in 2 to 120 letters.",
  day: "That is not a day.",
  future: "That day is in the future.",
  currency: "Choose a currency from the list.",
  kind: "Choose money in or money out.",
  countedAt: "Type what a not-sure line counts at as a whole number from 0 to 100.",
  growth: "Type the growth as a number from 0 to 100, with at most one decimal.",
  hireDelay: "Type the hire delay as a whole number of months from 1 to 12.",
  period: "Choose the month, such as 2027-01.",
  lines: `Data holds ${CASH_LIMITS.lines} lines at most.`,
  events: `Data holds ${CASH_LIMITS.events} events at most.`,
  missingLine: "That line is not here.",
  missingEvent: "That event is not here.",
  caro: "Give the figure and the day it is true on, or leave both empty.",
} as const;

export const LEFT_OUT = CASH_LEFT_OUT;

const EMPTY_SETUP = (): CashSetup => ({
  opening: {},
  burn_minor: null,
  collections_minor: 0,
  growth: 0,
  hire_delay_months: CASH_DEFAULTS.hire_delay_months,
  events: [],
  lines: [],
  other_sales_minor: 0,
  caro: null,
  updated_at: null,
  updated_by: null,
});

type Body = Record<string, unknown>;
const has = (input: Body, name: string) => Object.prototype.hasOwnProperty.call(input, name);
const blank = (value: unknown): boolean =>
  value === undefined || value === null || (typeof value === "string" && value.trim() === "");
const ticked = (value: unknown): boolean =>
  value === true || value === "1" || value === "on" || value === "true" || value === "yes";

/** An amount typed as "1,180.50": paise, or a refusal. Zero only where `zero` allows it. */
function amountOf(value: unknown, zero = false): number {
  const minor = minorOf(typeof value === "number" ? String(value) : value);
  if (minor === null || (!zero && minor === 0)) throw new Refused(400, "invalid", AMOUNT_WORDS);
  return minor;
}

function nameOf(value: unknown): string {
  const name = cleanText(value, CASH_LIMITS.name + 1);
  if (name.length < CASH_LIMITS.name_min || name.length > CASH_LIMITS.name)
    throw new Refused(400, "invalid", CASH_SAY.name);
  return name;
}

function wholeIn(value: unknown, min: number, max: number, refusal: string): number {
  const text = typeof value === "number" ? String(value) : clean(value, 6);
  const parsed = /^\d+$/.test(text) ? Number(text) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max)
    throw new Refused(400, "invalid", refusal);
  return parsed;
}

/** Whatever a service answers, or the fallback when it throws: the view never fails for it. */
function safely<T>(ask: () => T, fallback: T): T {
  try {
    return ask();
  } catch {
    return fallback;
  }
}

export async function register(core: DataCore): Promise<void> {
  core.store.ensureDir("cash");
  const stored = core.store.readJson<Partial<CashFile>>(FILE, {});
  let setup: CashSetup = { ...EMPTY_SETUP(), ...(stored.setup ?? {}) };
  if (!Array.isArray(setup.lines)) setup.lines = [];
  if (!Array.isArray(setup.events)) setup.events = [];

  const save = (by: Staff | null) => {
    if (by) {
      setup.updated_at = core.now();
      setup.updated_by = by;
    }
    const file: CashFile = { format: 1, setup };
    core.store.writeJson(FILE, file);
  };

  const money = () => core.need<MoneyLookup>(DUTIES_SERVICES.money);
  const statements = () => core.need<StatementsFeed>(DUTIES_SERVICES.statements);
  const peoplePay = () => core.need<PeoplePay>(DUTIES_SERVICES.peoplePay);
  const dutyRules = () => core.need<DutyRulesService>(DUTIES_SERVICES.dutyRules);

  /** The books group of the Company record (U1's), read defensively: it may be absent. */
  const booksPlan = (): { revenue_limit: number | null; invoice_limit: number | null } | null => {
    const company = core.need<{ record(): unknown }>("company");
    if (!company) return null;
    const record = safely(() => company.record(), null) as {
      books?: { free_revenue_limit?: unknown; free_invoice_limit?: unknown };
    } | null;
    const books = record?.books;
    if (!books) return null;
    const limit = (value: unknown) =>
      typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
    return {
      revenue_limit: limit(books.free_revenue_limit),
      invoice_limit: limit(books.free_invoice_limit),
    };
  };

  // ---------------------------------------------------------------- the view

  /** The whole view on a day; `owner` lets the people ledger's figures in. */
  const viewOf = (today: string, owner: boolean) => {
    const bank = statements();
    const lookup = money();
    const pay = peoplePay();
    const rules = dutyRules();
    const cash: CashNow[] = bank ? safely(() => bank.cash(), []) : [];
    const bills: BillView[] = lookup ? safely(() => lookup.bills({ open: true }), []) : [];
    const weeks = weeksOf(today, null);
    const lastDay = weeks[weeks.length - 1]!.to;
    // OWNER ONLY: stipends owed are read only for an answer asked as the Owner.
    const owed: PayOwed[] | null =
      owner && pay ? safely(() => pay.owed("2000-01-01", lastDay), []) : null;
    const lines = setup.lines;
    const currencies = new Set<string>(["INR"]);
    for (const item of cash) currencies.add(item.currency);
    for (const currency of Object.keys(setup.opening)) currencies.add(currency);
    for (const bill of bills)
      if (!bill.cancelled && bill.open_minor > 0) currencies.add(bill.currency);
    for (const line of lines) if (!line.withdrawn) currencies.add(line.currency);
    for (const item of owed ?? []) currencies.add(item.currency);
    const tables: CashTable[] = [...currencies].sort().map((currency) => {
      const fromBank = cash.find((item) => item.currency === currency);
      const typed = setup.opening[currency];
      const opening: CashTable["opening"] = fromBank
        ? { minor: fromBank.cash_minor, as_of: fromBank.as_of, source: "statements" }
        : typed
          ? { minor: typed.amount_minor, as_of: typed.as_of, source: "typed" }
          : null;
      return weekTable({
        today,
        currency,
        opening,
        bills: bills.filter((bill) => bill.currency === currency),
        owed: owed === null ? null : owed.filter((item) => item.currency === currency),
        lines: lines.filter((line) => line.currency === currency),
      });
    });
    const rupees = tables.find((table) => table.currency === "INR")!;
    const bankRupees = cash.find((item) => item.currency === "INR");
    const burn =
      setup.burn_minor !== null
        ? { minor: setup.burn_minor, source: "typed" as const }
        : bankRupees?.avg_net_burn_minor !== undefined && bankRupees.avg_net_burn_minor !== null
          ? { minor: bankRupees.avg_net_burn_minor, source: "statements" as const }
          : null;
    const scenarios = rupees.opening
      ? scenariosOf({
          opening: { minor: rupees.opening.minor, as_of: rupees.opening.as_of },
          burn_minor: burn?.minor ?? 0,
          collections_minor: setup.collections_minor,
          growth: setup.growth,
          hire_delay_months: setup.hire_delay_months,
          events: setup.events,
        })
      : null;
    const fy = fyStartYear(today);
    const exports: ExportView[] | null = lookup
      ? safely(() => lookup.exportInvoices({ from: `${fy}-04-01`, to: `${fy + 1}-03-31` }), [])
      : null;
    const tiles = tilesOf({
      today,
      rules,
      exports,
      other_sales_minor: setup.other_sales_minor,
      headcount: pay ? safely(() => pay.headcount(today), null) : null,
      caro: setup.caro,
      books: booksPlan(),
    });
    return {
      today,
      weeks: weeksOf(today, rupees.opening?.as_of ?? null),
      tables,
      stipends_left_out: !owner,
      scenarios,
      assumptions: {
        burn_minor: burn?.minor ?? null,
        burn_source: burn?.source ?? null,
        collections_minor: setup.collections_minor,
        growth: setup.growth,
        hire_delay_months: setup.hire_delay_months,
        events: setup.events,
      },
      tiles,
      lines: setup.lines.filter((line) => !line.withdrawn),
      typed: {
        opening: setup.opening,
        burn_minor: setup.burn_minor,
        other_sales_minor: setup.other_sales_minor,
        caro: setup.caro,
      },
      here: { money: lookup !== null, statements: bank !== null, people: pay !== null },
    };
  };

  core.route("GET", "/data/cash", (ctx) => viewOf(core.day(), ctx.query.get("owner") === "1"));

  core.provideOverview("cash", () => ({
    lines: setup.lines.filter((line) => !line.withdrawn).length,
    events: setup.events.length,
    typed_openings: Object.keys(setup.opening).length,
  }));

  // ---------------------------------------------------------------- lines he types

  const lineFields = (input: Body, base: CashLine | null) => {
    const kind = has(input, "kind") ? clean(input.kind, 12) : (base?.kind ?? "");
    if (kind !== "expected_in" && kind !== "other_out")
      throw new Refused(400, "invalid", CASH_SAY.kind);
    const on = has(input, "on") ? clean(input.on, 10) : (base?.on ?? "");
    if (!isDay(on)) throw new Refused(400, "invalid", CASH_SAY.day);
    const currency = has(input, "currency")
      ? clean(input.currency, 3).toUpperCase() || "INR"
      : (base?.currency ?? "INR");
    if (!isDutyCurrency(currency)) throw new Refused(400, "invalid", CASH_SAY.currency);
    const amount_minor = has(input, "amount") ? amountOf(input.amount) : (base?.amount_minor ?? 0);
    if (amount_minor === 0) throw new Refused(400, "invalid", AMOUNT_WORDS);
    const name = has(input, "name") ? nameOf(input.name) : (base?.name ?? "");
    if (!name) throw new Refused(400, "invalid", CASH_SAY.name);
    const sure = has(input, "sure") ? ticked(input.sure) : (base?.sure ?? true);
    const counted_at =
      has(input, "counted_at") && !blank(input.counted_at)
        ? wholeIn(input.counted_at, 0, CASH_LIMITS.counted_at_max, CASH_SAY.countedAt)
        : (base?.counted_at ?? CASH_DEFAULTS.counted_at);
    return { kind, on, currency, amount_minor, name, sure, counted_at } as const;
  };

  const lineOf = (id: string | undefined): CashLine => {
    const line = id ? setup.lines.find((item) => item.line_id === id) : undefined;
    if (!line) throw new Refused(404, "not_found", CASH_SAY.missingLine);
    return line;
  };

  core.route("POST", "/data/cash/lines", (ctx) => {
    const by = ctx.staff();
    if (setup.lines.length >= CASH_LIMITS.lines) throw new Refused(400, "invalid", CASH_SAY.lines);
    const line: CashLine = {
      line_id: randomUUID(),
      ...lineFields(ctx.body, null),
      withdrawn: false,
    };
    setup.lines.push(line);
    save(by);
    return { line };
  });

  core.route("POST", "/data/cash/lines/:id/update", (ctx) => {
    const by = ctx.staff();
    const line = lineOf(ctx.params[0]);
    Object.assign(line, lineFields(ctx.body, line));
    save(by);
    return { line };
  });

  core.route("POST", "/data/cash/lines/:id/withdraw", (ctx) => {
    const by = ctx.staff();
    const line = lineOf(ctx.params[0]);
    line.withdrawn = true;
    save(by);
    return { line };
  });

  // ---------------------------------------------------------------- the assumptions

  core.route("POST", "/data/cash/setup", (ctx) => {
    const by = ctx.staff();
    const input = ctx.body;
    const today = core.day();
    const next: CashSetup = { ...setup, opening: { ...setup.opening } };
    if (has(input, "opening_currency")) {
      const currency = clean(input.opening_currency, 3).toUpperCase() || "INR";
      if (!isDutyCurrency(currency)) throw new Refused(400, "invalid", CASH_SAY.currency);
      if (blank(input.opening_amount)) delete next.opening[currency];
      else {
        const asOf = clean(input.opening_as_of, 10);
        if (!isDay(asOf)) throw new Refused(400, "invalid", CASH_SAY.day);
        if (asOf > today) throw new Refused(400, "invalid", CASH_SAY.future);
        next.opening[currency] = {
          amount_minor: amountOf(input.opening_amount, true),
          as_of: asOf,
        };
      }
    }
    if (has(input, "burn")) next.burn_minor = blank(input.burn) ? null : amountOf(input.burn, true);
    if (has(input, "collections"))
      next.collections_minor = blank(input.collections) ? 0 : amountOf(input.collections, true);
    if (has(input, "growth")) {
      const text = typeof input.growth === "number" ? String(input.growth) : clean(input.growth, 6);
      const growth = text === "" ? 0 : /^\d{1,3}(\.\d)?$/.test(text) ? Number(text) : Number.NaN;
      if (!(growth >= 0 && growth <= CASH_LIMITS.growth_max))
        throw new Refused(400, "invalid", CASH_SAY.growth);
      next.growth = growth;
    }
    if (has(input, "hire_delay_months"))
      next.hire_delay_months = wholeIn(
        input.hire_delay_months,
        CASH_LIMITS.hire_delay_min,
        CASH_LIMITS.hire_delay_max,
        CASH_SAY.hireDelay,
      );
    if (has(input, "other_sales"))
      next.other_sales_minor = blank(input.other_sales) ? 0 : amountOf(input.other_sales, true);
    if (has(input, "caro_amount") || has(input, "caro_as_of")) {
      if (blank(input.caro_amount) && blank(input.caro_as_of)) next.caro = null;
      else {
        const asOf = clean(input.caro_as_of, 10);
        if (blank(input.caro_amount) || !isDay(asOf))
          throw new Refused(400, "invalid", CASH_SAY.caro);
        next.caro = { amount_minor: amountOf(input.caro_amount, true), as_of: asOf };
      }
    }
    setup = next;
    save(by);
    return { setup };
  });

  // ---------------------------------------------------------------- scenario events

  core.route("POST", "/data/cash/events", (ctx) => {
    const by = ctx.staff();
    if (setup.events.length >= CASH_LIMITS.events)
      throw new Refused(400, "invalid", CASH_SAY.events);
    const kind = clean(ctx.body.kind, 14);
    if (kind !== "money_in" && kind !== "monthly_cost")
      throw new Refused(400, "invalid", "Choose money in, once, or a monthly cost.");
    const period = clean(ctx.body.period, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Refused(400, "invalid", CASH_SAY.period);
    const event: CashEvent = {
      event_id: randomUUID(),
      kind,
      name: nameOf(ctx.body.name),
      period,
      amount_minor: amountOf(ctx.body.amount),
      flagged: ticked(ctx.body.flagged),
    };
    setup.events.push(event);
    save(by);
    return { event };
  });

  core.route("POST", "/data/cash/events/:id/remove", (ctx) => {
    const by = ctx.staff();
    const id = ctx.params[0];
    if (!setup.events.some((event) => event.event_id === id))
      throw new Refused(404, "not_found", CASH_SAY.missingEvent);
    setup.events = setup.events.filter((event) => event.event_id !== id);
    save(by);
    return { removed: true };
  });

  // ---------------------------------------------------------------- the weeks as a CSV

  /** A build, as every CSV in Data is. Stipends only when the portal asked as the Owner. */
  core.builds.provide("cash_csv", async (handle, input) => {
    const today = core.day();
    const owner = input.body.owner === true;
    const view = viewOf(today, owner);
    const money = (minor: number) => (minor < 0 ? `-${minorInput(-minor)}` : minorInput(minor));
    const header = [
      "currency",
      "week",
      "from",
      "to",
      "bills_to_pay",
      ...(owner ? ["stipends"] : []),
      "other_money_out",
      "expected_money_in",
      "closing_cash",
    ];
    const rows: (string | number)[][] = [];
    for (const table of view.tables)
      for (const week of view.weeks) {
        const of = (key: string) => table.rows.find((row) => row.key === key)?.by_week[week.n] ?? 0;
        rows.push([
          table.currency,
          week.label,
          week.from,
          week.to,
          money(of("bills")),
          ...(owner ? [money(of("stipends"))] : []),
          money(of("other_out")),
          money(of("expected_in")),
          table.closing[week.n] === undefined ? "" : money(table.closing[week.n]!),
        ]);
      }
    handle.setProgress(0, rows.length);
    await core.yield();
    writeFileSync(handle.path, BOM + toCsv(header, rows), { mode: 0o600 });
    handle.setProgress(rows.length, rows.length);
    return { name: `Cash view ${today}.csv`, type: "text/csv; charset=utf-8" };
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes)
    registerTestRoutes(
      core,
      viewOf,
      () => setup,
      (next) => {
        setup = next;
        save(null);
      },
    );
}

type ViewOf = (today: string, owner: boolean) => unknown;

/**
 * The stand-ins (spec §3.3): each installs its fake only while the real service is null,
 * answers `{ installed: false, real: true }` when the real one is there, and `{ on: false }`
 * takes away only its own fake. And the view on a fixed day, for §5.3's table.
 */
function registerTestRoutes(
  core: DataCore,
  viewOf: ViewOf,
  current: () => CashSetup,
  replace: (next: CashSetup) => void,
): void {
  const fakes = new Map<string, unknown>();
  const install = (ctx: Ctx, name: string, make: () => unknown) => {
    ctx.staff();
    const real = core.need<unknown>(name);
    if (ctx.body.on === false) {
      if (real !== null && real === fakes.get(name)) core.provide(name, null);
      fakes.delete(name);
      return { installed: false };
    }
    if (real !== null && real !== fakes.get(name)) return { installed: false, real: true };
    const fake = make();
    fakes.set(name, fake);
    core.provide(name, fake);
    return { installed: true };
  };
  const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

  core.route("POST", "/data/_test/cash/money", (ctx) =>
    install(ctx, DUTIES_SERVICES.money, () => {
      const categories = list<CategoryView>(ctx.body.categories);
      const bills = list<BillView>(ctx.body.bills).map((bill) => ({ ...bill }));
      const invoices = list<ExportView>(ctx.body.export_invoices).map((item) => ({ ...item }));
      const fake: MoneyLookup = {
        usedFor: () => [],
        heldUntil: () => null,
        categories: () => categories,
        bills: (filter = {}) =>
          bills.filter(
            (bill) =>
              (filter.cancelled || !bill.cancelled) &&
              (!filter.open || bill.open_minor > 0) &&
              (!filter.from || bill.invoice_on >= filter.from) &&
              (!filter.to || bill.invoice_on <= filter.to),
          ),
        exportInvoices: (filter = {}) =>
          invoices.filter(
            (item) =>
              (!filter.from || item.invoice_on >= filter.from) &&
              (!filter.to || item.invoice_on <= filter.to),
          ),
        recordPayment: (input) => {
          const bill = bills.find((item) => item.bill_id === input.bill_id);
          if (!bill) throw new Refused(404, "not_found", "That bill is not here.");
          bill.payments = [
            ...bill.payments,
            {
              payment_id: randomUUID(),
              paid_on: input.paid_on,
              amount_minor: input.amount_minor,
              reference: input.reference,
            },
          ];
          bill.open_minor = Math.max(0, bill.open_minor - input.amount_minor);
          return bill;
        },
        recordReceipt: (input) => {
          const invoice = invoices.find((item) => item.invoice_id === input.invoice_id);
          if (!invoice) throw new Refused(404, "not_found", "That invoice is not here.");
          invoice.receipts = [
            ...invoice.receipts,
            {
              receipt_id: randomUUID(),
              received_on: input.received_on,
              amount_minor: input.amount_minor,
              inr_minor: input.inr_minor,
              fira_number: "",
            },
          ];
          return invoice;
        },
        takeBackPayment: (input) => {
          const bill = bills.find((item) => item.bill_id === input.bill_id);
          if (!bill) throw new Refused(404, "not_found", "That bill is not here.");
          const taken = bill.payments.find((item) => item.payment_id === input.payment_id);
          bill.payments = bill.payments.filter((item) => item.payment_id !== input.payment_id);
          if (taken) bill.open_minor += taken.amount_minor;
          return bill;
        },
        takeBackReceipt: (input) => {
          const invoice = invoices.find((item) => item.invoice_id === input.invoice_id);
          if (!invoice) throw new Refused(404, "not_found", "That invoice is not here.");
          invoice.receipts = invoice.receipts.filter(
            (item) => item.receipt_id !== input.receipt_id,
          );
          return invoice;
        },
        packFiles: () => ({
          bills: [],
          challans: [],
          export_invoices: [],
          firas: [],
          bills_without_copy: 0,
          bills_count: 0,
          challans_count: 0,
          export_count: 0,
          firas_count: 0,
        }),
      };
      return fake;
    }),
  );

  core.route("POST", "/data/_test/cash/statements", (ctx) =>
    install(ctx, DUTIES_SERVICES.statements, () => {
      const cash = list<CashNow>(ctx.body.cash);
      const fake: StatementsFeed = { cash: () => cash };
      return fake;
    }),
  );

  core.route("POST", "/data/_test/cash/people-pay", (ctx) =>
    install(ctx, DUTIES_SERVICES.peoplePay, () => {
      const paid = list<PayLine>(ctx.body.paid);
      const owed = list<PayOwed>(ctx.body.owed);
      const count = (ctx.body.headcount ?? {}) as Partial<Record<string, unknown>>;
      const number = (value: unknown) => (typeof value === "number" ? value : 0);
      const fake: PeoplePay = {
        paid: (from, to) => paid.filter((line) => line.paid_on >= from && line.paid_on <= to),
        owed: (from, to) => owed.filter((line) => line.due_on >= from && line.due_on <= to),
        headcount: () => ({
          employees: number(count.employees),
          interns: number(count.interns),
          contractors: number(count.contractors),
        }),
      };
      return fake;
    }),
  );

  core.route("POST", "/data/_test/cash/duty-rules", (ctx) =>
    install(ctx, DUTIES_SERVICES.dutyRules, () =>
      standInDutyRules(
        () => core.day(),
        (ctx.body.stored ?? {}) as Partial<Record<DutyRuleKey, DutyStored>>,
      ),
    ),
  );

  /** His typed figures, lines and events, straight in (safe to run twice with `reset`). */
  core.route("POST", "/data/_test/cash/seed", (ctx) => {
    ctx.staff();
    const body = ctx.body;
    const next: CashSetup =
      body.reset === true
        ? { ...EMPTY_SETUP() }
        : { ...current(), opening: { ...current().opening } };
    const opening = body.opening as
      { currency?: string; amount_minor?: number; as_of?: string } | undefined;
    if (opening && typeof opening.amount_minor === "number" && isDay(opening.as_of))
      next.opening[opening.currency ?? "INR"] = {
        amount_minor: opening.amount_minor,
        as_of: opening.as_of,
      };
    for (const line of list<Partial<CashLine>>(body.lines))
      next.lines.push({
        line_id: line.line_id ?? randomUUID(),
        kind: line.kind === "other_out" ? "other_out" : "expected_in",
        on: String(line.on),
        currency: line.currency ?? "INR",
        amount_minor: Number(line.amount_minor ?? 0),
        name: line.name ?? "Walk line",
        sure: line.sure !== false,
        counted_at: line.counted_at ?? CASH_DEFAULTS.counted_at,
        withdrawn: false,
      });
    for (const event of list<Partial<CashEvent>>(body.events))
      next.events.push({
        event_id: event.event_id ?? randomUUID(),
        kind: event.kind === "monthly_cost" ? "monthly_cost" : "money_in",
        name: event.name ?? "Walk event",
        period: String(event.period),
        amount_minor: Number(event.amount_minor ?? 0),
        flagged: event.flagged === true,
      });
    const typed = (body.setup ?? {}) as Partial<CashSetup>;
    for (const key of [
      "burn_minor",
      "collections_minor",
      "growth",
      "hire_delay_months",
      "other_sales_minor",
      "caro",
    ] as const)
      if (key in typed) (next as Record<string, unknown>)[key] = typed[key];
    replace(next);
    return { lines: next.lines.length, events: next.events.length };
  });

  /** The view on a fixed day (§5.3's table is worked from Saturday 14 Nov 2026). */
  core.route("GET", "/data/_test/cash/view", (ctx) => {
    const today = clean(ctx.query.get("today"), 10);
    return viewOf(isDay(today) ? today : core.day(), ctx.query.get("owner") === "1") as Record<
      string,
      unknown
    >;
  });
}
