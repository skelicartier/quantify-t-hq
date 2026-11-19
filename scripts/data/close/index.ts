/**
 * The month's close (ws-notes/duties/spec.md §9.7–§9.9): one record a month with the seven
 * things the CA needs and the facts beside each, when the pack was sent and to whom, the
 * CA's acknowledgement, then the lock, which freezes the month's MIS and makes `month-lock`
 * refuse changes to its bills, payments and lines until it is reopened with a reason. The
 * pack is a zip made on demand through the builds, never kept in Files.
 *
 * It provides `month-lock`, `close` (a file's "Used for" and its hold), `agenda:close`, Due
 * rows of kind `close`, and to its own unit `close-mis` (a frozen month's burn, for the
 * investor update). The stipend row's figures and the MIS's people part are given only with
 * the Owner flag; a Due row never names a person or an amount.
 */

import { Refused } from "../../mail-merge/engine";
import { dayWords } from "../../../src/lib/data/labels-company";
import { periodWords } from "../../../src/lib/data/labels-duties";
import {
  CLOSE_ITEMS,
  CLOSE_ITEM_KEYS,
  NO_HOLIDAYS,
  SEND_FIRST,
  closeTitleWords,
  lockedWords,
  notOverWords,
  readyWords,
  stillOpenWords,
  type CloseItemKey,
} from "../../../src/lib/data/labels-statements";
import type { Answer, Ctx, DataCore } from "../core";
import {
  DUTIES_SERVICES,
  DUTY_RULES,
  periodEnd,
  periodOf,
  retentionUntil,
  ruleLineOf,
  standInDutyRules,
  standInHolidays,
  type DutyRulesService,
  type FileHold,
  type HolidayView,
  type HoldsFiles,
  type HolidaysService,
  type MoneyLookup,
  type MonthLock,
  type PeoplePay,
} from "../duties-contracts";
import type { UsedFor } from "../company-contracts";
import type { FilesService } from "../files/index";
import { clean, isDay } from "../guard";
import { agendaService, type AgendaItem, type AgendaSource } from "../raise-contracts";
import type { CloseMis, MisCash } from "../numbers/count";
import { CLOSE_MIS, NUMBERS_MONTH, type NumbersMonth } from "../numbers/types";
import {
  FAKES,
  STATEMENTS_INSIDE,
  standInRoute,
  storedOf,
  type StatementsInside,
} from "../statements/index";
import { fakeMoney, fakePeoplePay } from "../statements/walk-seed";
import { CloseBook, PERIOD } from "./book";
import { closeDayOf, dueMonths, isOver } from "./due";
import { factsOf } from "./facts";
import { COPY_MAX_BYTES, RETENTION_YEARS } from "./limits";
import { misOf } from "./mis";
import { makePack, planPack, type PackSources } from "./pack";
import type { Close, MisSnapshot } from "./types";

type CompanyLike = { record?: () => { flags?: { gst_registered?: string } } };
type KeyDatesLike = { rulesUnconfirmed?: () => number };

export async function register(core: DataCore): Promise<void> {
  const book = new CloseBook(core);

  // ---------------------------------------------------------------- the other modules, asked now

  const statements = () => core.need<StatementsInside>(STATEMENTS_INSIDE);
  const money = () => core.need<MoneyLookup>(DUTIES_SERVICES.money);
  const people = () => core.need<PeoplePay>(DUTIES_SERVICES.peoplePay);
  const holidays = () => core.need<HolidaysService>(DUTIES_SERVICES.holidays);
  const rules = () => core.need<DutyRulesService>(DUTIES_SERVICES.dutyRules);
  const files = () => core.need<FilesService>("files");

  const gstOf = (): "yes" | "no" | "" | null => {
    try {
      const flag = core.need<CompanyLike>("company")?.record?.()?.flags?.gst_registered;
      return flag === "yes" || flag === "no" || flag === "" ? flag : null;
    } catch {
      return null;
    }
  };

  // ---------------------------------------------------------------- the lock, and what Files asks

  const monthLock: MonthLock = {
    isLocked: (period) => book.isLocked(period),
    refusal: (period) => lockedWords(period),
  };
  core.provide(DUTIES_SERVICES.monthLock, monthLock);

  /** The rows that hold a file: few months, seven rows each, so asked each time. */
  const holdersOf = (fileId: string) =>
    book
      .periods()
      .flatMap((period) =>
        CLOSE_ITEM_KEYS.filter((key) => book.get(period).items[key].file_ids.includes(fileId)).map(
          (key) => ({ period, key }),
        ),
      );
  const retentionYears = () => {
    try {
      return rules()?.state("voucher-retention").amount ?? RETENTION_YEARS;
    } catch {
      return RETENTION_YEARS;
    }
  };
  const closeService: UsedFor & HoldsFiles = {
    usedFor: (fileId) =>
      holdersOf(fileId).map(({ period, key }) => ({
        label: `Month close: ${periodWords(period)}, ${CLOSE_ITEMS[key]}`,
        href: `/data/money/close/${period}`,
      })),
    heldUntil: (fileId): FileHold | null => {
      const held = holdersOf(fileId).sort((a, b) => b.period.localeCompare(a.period))[0];
      if (!held) return null;
      return {
        until: retentionUntil(periodEnd(held.period), retentionYears()),
        why: `${CLOSE_ITEMS[held.key]} for ${periodWords(held.period)}`,
      };
    },
  };
  core.provide(DUTIES_SERVICES.close, closeService);

  const misService: CloseMis = {
    frozenCash: (period) => {
      const frozen = book.frozen(period);
      return frozen ? frozen.burn.map((row): MisCash => ({ ...row })) : null;
    },
  };
  core.provide(CLOSE_MIS, misService);

  // ---------------------------------------------------------------- days

  /** The first month with any statement or bill; null for none. */
  const firstMonth = (): string | null => {
    const months: string[] = [];
    const first = statements()?.book.firstDay();
    if (first) months.push(periodOf(first));
    try {
      for (const bill of money()?.bills() ?? []) months.push(periodOf(bill.invoice_on));
    } catch {
      // Money could not answer: the statements alone, then.
    }
    return months.sort()[0] ?? null;
  };

  const dayOf = (period: string) => {
    const real = holidays();
    const year = Number(periodEnd(period).slice(0, 4));
    const fallback = real === null || (!real.hasYear(year) && !real.hasYear(year + 1));
    let state = null;
    try {
      state = rules()?.state("close-by") ?? null;
    } catch {
      state = null;
    }
    return {
      due_on: closeDayOf(period, real ?? standInHolidays(), state),
      fallback_days: fallback,
      rule: state ? ruleLineOf(state) : null,
      rules_here: rules() !== null,
    };
  };

  const readyOf = (close: Close) =>
    CLOSE_ITEM_KEYS.filter((key) => close.items[key].state !== "open").length;
  const stateOf = (close: Close) => (close.locked ? "locked" : close.sent ? "sent" : "open");

  const dueRows = () => {
    const today = core.day();
    return dueMonths(today, firstMonth(), (period) => book.isLocked(period)).flatMap((period) => {
      const { due_on } = dayOf(period);
      if (!due_on) return [];
      return [{ period, due_on, ready: readyOf(book.get(period)) }];
    });
  };

  core.provideDue(() =>
    dueRows().map((row) => ({
      key: `close:${row.period}`,
      kind: "close" as const,
      title: closeTitleWords(row.period),
      sub: readyWords(row.ready),
      due_on: row.due_on,
      href: `/data/money/close/${row.period}`,
    })),
  );

  const agenda: AgendaSource = {
    agenda: (): AgendaItem[] =>
      dueRows().map((row) => ({
        key: `close:${row.period}`,
        kind: "close",
        title: closeTitleWords(row.period),
        plain: "Month close",
        sub: readyWords(row.ready),
        on: row.due_on,
        remind_days: [1, 0],
        href: `/data/money/close/${row.period}`,
      })),
  };
  core.provide(agendaService("close"), agenda);

  core.provideOverview("close", () => {
    const rows = dueRows();
    return { open: rows.length, next_due_on: rows.map((row) => row.due_on).sort()[0] ?? null };
  });

  // ---------------------------------------------------------------- the MIS

  const rulesUnconfirmed = (): number | null => {
    const keyDates = core.need<KeyDatesLike>("key-dates");
    const duty = rules();
    if (!keyDates?.rulesUnconfirmed && !duty) return null;
    let count = 0;
    try {
      count += keyDates?.rulesUnconfirmed?.() ?? 0;
    } catch {
      // Key dates could not answer: the duty rules alone, then.
    }
    if (duty)
      for (const rule of DUTY_RULES) {
        // `tds-deposit` is the calendar rule of the same key, counted by Key dates already.
        if (rule.confirm_with === null || rule.key === "tds-deposit") continue;
        try {
          if (!duty.state(rule.key).confirmed) count += 1;
        } catch {
          // a rule the rule book cannot answer is not counted
        }
      }
    return count;
  };

  const liveMis = async (period: string, today: string) => {
    const inside = statements();
    let exports = null;
    try {
      exports = money()?.exportInvoices() ?? null;
    } catch {
      exports = null;
    }
    let numbers = null;
    try {
      numbers = core.need<NumbersMonth>(NUMBERS_MONTH)?.month(period) ?? null;
    } catch {
      numbers = null;
    }
    return misOf({
      period,
      today,
      histories: inside?.histories() ?? [],
      categories: inside?.categories() ?? [],
      exports,
      numbers,
      due: await core.dueItems({ owner: false }),
      rulesUnconfirmed: rulesUnconfirmed(),
      people: people(),
      commentary: book.get(period).commentary,
    });
  };

  // ---------------------------------------------------------------- routes

  const periodFrom = (ctx: Ctx): string => {
    const period = ctx.params[0] ?? "";
    if (!PERIOD.test(period)) throw new Refused(404, "not_found", "There is no such month.");
    return period;
  };
  const ownerOf = (ctx: Ctx) =>
    ctx.method === "GET" ? ctx.query.get("owner") === "1" : ctx.body.owner === true;

  const packSources = (period: string): PackSources => ({
    close: book.get(period),
    statements: statements(),
    money: money(),
    people: people(),
    files: files(),
  });

  const blockers = (period: string, close: Close, today: string) => {
    const reasons: string[] = [];
    for (const key of CLOSE_ITEM_KEYS)
      if (close.items[key].state === "open") reasons.push(stillOpenWords(key));
    if (!close.sent) reasons.push(SEND_FIRST);
    if (!isOver(period, today)) reasons.push(notOverWords(period));
    return reasons;
  };

  const fileTitle = (fileId: string) => files()?.fileRow(fileId)?.title ?? null;

  core.route("GET", "/data/close", () => {
    const today = core.day();
    const first = firstMonth();
    const periods = new Set(book.periods());
    if (first)
      for (let period = first; period <= periodOf(today);) {
        periods.add(period);
        const [year = 0, month = 1] = period.split("-").map(Number);
        period = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
      }
    const months = [...periods].sort().reverse();
    return {
      today,
      months: months.map((period) => {
        const close = book.get(period);
        return {
          period,
          label: periodWords(period),
          over: isOver(period, today),
          due_on: dayOf(period).due_on,
          state: stateOf(close),
          ready: readyOf(close),
          sent_on: close.sent?.on ?? null,
          locked_at: close.locked?.at ?? null,
        };
      }),
      fallback_days: months.length ? dayOf(months[0]!).fallback_days : holidays() === null,
      fallback_words: NO_HOLIDAYS,
      rule: months.length ? dayOf(months[0]!).rule : null,
      rules_here: rules() !== null,
    };
  });

  core.route("GET", "/data/close/:period", (ctx) => {
    const period = periodFrom(ctx);
    const owner = ownerOf(ctx);
    const today = core.day();
    const close = book.get(period);
    const day = dayOf(period);
    const reasons = close.locked ? [] : blockers(period, close, today);
    const inside = statements();
    const attached: Record<string, string> = {};
    for (const key of CLOSE_ITEM_KEYS)
      for (const id of close.items[key].file_ids)
        attached[id] = fileTitle(id) ?? "A file no longer in Files";
    return {
      close,
      label: periodWords(period),
      over: isOver(period, today),
      state: stateOf(close),
      ready: readyOf(close),
      facts: factsOf({
        period,
        owner,
        close,
        histories: inside ? inside.histories() : null,
        money: money(),
        people: people(),
        gst: gstOf(),
        fileTitle,
      }),
      files: attached,
      due_on: day.due_on,
      due_words: day.due_on ? dayWords(day.due_on) : null,
      fallback_days: day.fallback_days,
      rule: day.rule,
      rules_here: day.rules_here,
      can_lock: !close.locked && reasons.length === 0,
      cannot_lock_because: reasons,
      pack: {
        files:
          planPack(core, period, owner, packSources(period), { day: today, by: "" }).length + 1,
        owner_parts: owner,
      },
      here: {
        money: money() !== null,
        statements: inside !== null,
        people: people() !== null,
        holidays: holidays() !== null,
      },
    };
  });

  const misAnswer = async (period: string, owner: boolean): Promise<Answer> => {
    const frozen = book.frozen(period);
    const mis: MisSnapshot = frozen ?? (await liveMis(period, core.day())).snapshot;
    const answer: Answer = {
      mis,
      frozen: frozen !== null,
      locked: book.isLocked(period),
      snapshots: book.snapshots(period).length,
    };
    if (owner) {
      if (frozen) {
        const part = book.ownerParts(period).find((item) => item.n === frozen.n);
        answer.owner_part = part
          ? { stipends: part.stipends, payments: part.payments, people_heads: part.people_heads }
          : null;
      } else answer.owner_part = (await liveMis(period, core.day())).owner;
    }
    return answer;
  };

  core.route("GET", "/data/close/:period/mis", async (ctx) =>
    misAnswer(periodFrom(ctx), ownerOf(ctx)),
  );

  core.route("GET", "/data/mis", async () => {
    const today = core.day();
    const first = statements()?.book.firstDay();
    const periods = new Set(book.periods().filter((period) => book.snapshots(period).length > 0));
    if (first)
      for (let period = periodOf(first); period <= periodOf(today);) {
        periods.add(period);
        const [year = 0, month = 1] = period.split("-").map(Number);
        period = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
      }
    const months = [];
    for (const period of [...periods].sort().reverse()) {
      const frozen = book.frozen(period);
      const burn = frozen ? frozen.burn : (await liveMis(period, today)).snapshot.burn;
      months.push({
        period,
        label: periodWords(period),
        state: frozen ? ("frozen" as const) : ("live" as const),
        current: period === periodOf(today),
        frozen_at: frozen?.frozen_at ?? null,
        frozen_by: frozen?.frozen_by ?? null,
        burn: burn.map((row) => ({
          currency: row.currency,
          net_minor: row.net_minor,
          runway_months: row.runway_months,
        })),
      });
    }
    return { months };
  });

  /** Every write: the month's record as it is now, never a people figure. */
  const written = (close: Close): Answer => ({
    close,
    state: stateOf(close),
    ready: readyOf(close),
  });

  // A row's key has underscores, which a ":id" segment does not match.
  core.route("POST", /^\/data\/close\/([0-9]{4}-[0-9]{2})\/items\/([a-z_]{1,40})$/, async (ctx) => {
    const by = ctx.staff();
    const period = periodFrom(ctx);
    const key = CLOSE_ITEM_KEYS.find((item) => item === ctx.params[1]) as CloseItemKey | undefined;
    if (!key) throw new Refused(404, "not_found", "There is no such row.");
    if (book.isLocked(period)) throw new Refused(409, "month_locked", lockedWords(period));
    let attach: string | null = clean(ctx.body.attach, 64) || null;
    const content = typeof ctx.body.content === "string" ? ctx.body.content : "";
    if (content) {
      const service = files();
      if (!service) throw new Refused(409, "files_missing", "Files is not loaded here.");
      const bytes = Buffer.from(content, "base64");
      if (bytes.length === 0) throw new Refused(400, "empty", "That file is empty.");
      if (bytes.length > COPY_MAX_BYTES)
        throw new Refused(400, "too_large", "That file is over 3 MB. Add a smaller copy.");
      const name = clean(ctx.body.name, 200).replace(/[\\/]/g, "_") || "file";
      const row = await service.putFile({
        folderPath: ["Money", "Close", period],
        title: name,
        originalName: name,
        bytes,
        by,
      });
      attach = row.file_id;
    } else if (attach && !files()?.fileRow(attach))
      throw new Refused(404, "not_found", "That file is not in Files.");
    return written(book.setItem(period, key, ctx.body, by, attach));
  });

  core.route("POST", "/data/close/:period/commentary", (ctx) =>
    written(book.commentary(periodFrom(ctx), ctx.body, ctx.staff())),
  );
  core.route("POST", "/data/close/:period/sent", (ctx) =>
    written(book.sent(periodFrom(ctx), ctx.body, ctx.staff(), core.day())),
  );
  core.route("POST", "/data/close/:period/acknowledged", (ctx) =>
    written(book.acknowledged(periodFrom(ctx), ctx.body, ctx.staff(), core.day())),
  );

  core.route("POST", "/data/close/:period/lock", async (ctx) => {
    const by = ctx.staff();
    const period = periodFrom(ctx);
    const today = core.day();
    const close = book.get(period);
    if (close.locked) return written(close);
    const reasons = blockers(period, close, today);
    if (reasons.length > 0) throw new Refused(409, "cannot_lock", reasons.join(" "));
    const { snapshot, owner } = await liveMis(period, today);
    return written(book.lock(period, by, snapshot, owner));
  });

  core.route("POST", "/data/close/:period/reopen", (ctx) =>
    written(book.reopen(periodFrom(ctx), ctx.body, ctx.staff())),
  );

  core.builds.provide("ca_pack", (handle, input) => makePack(core, handle, input, packSources));

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    core.route(
      "POST",
      "/data/_test/close/holidays",
      standInRoute(core, DUTIES_SERVICES.holidays, (body) => {
        const days = (Array.isArray(body.days) ? body.days : [])
          .filter((day): day is Record<string, unknown> => Boolean(day) && typeof day === "object")
          .filter((day) => isDay(day.on))
          .map((day) => ({
            on: String(day.on),
            name: clean(day.name, 120) || "Walk holiday",
            kind: (["national", "state", "company", "optional"].includes(String(day.kind))
              ? day.kind
              : "company") as HolidayView["kind"],
          }));
        return standInHolidays(days);
      }),
    );
    core.route(
      "POST",
      "/data/_test/close/duty-rules",
      standInRoute(core, DUTIES_SERVICES.dutyRules, (body) =>
        standInDutyRules(() => core.day(), storedOf(body.stored)),
      ),
    );
    /**
     * What the walk's close pages need where no real module provides it: the rule book, the
     * walk's bill in Money and the walk intern's stipend. Safe to run twice; never over a real one.
     */
    core.route("POST", "/data/_test/close/seed", (ctx) => {
      ctx.staff();
      const installed: string[] = [];
      const install = (name: string, make: () => object) => {
        const current = core.need<object>(name);
        // Never over a real one, and a stand-in already there stays as it is.
        if (current !== null) return;
        const fake = make();
        FAKES.add(fake);
        core.provide(name, fake);
        installed.push(name);
      };
      install(DUTIES_SERVICES.dutyRules, () => standInDutyRules(() => core.day()));
      install(DUTIES_SERVICES.money, () => fakeMoney({}));
      install(DUTIES_SERVICES.peoplePay, () => fakePeoplePay({}));
      const seeded =
        ctx.body.statements === true ? (statements()?.seed?.(ctx.staff(), true) ?? null) : null;
      return { installed, statements: seeded };
    });
  }
}
