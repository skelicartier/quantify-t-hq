/**
 * Numbers (raise spec §8): what the raise and the buyers' interest come to, counted from
 * Data's own records each time the page is opened, never typed and never estimated; the
 * cash and burn he types with the day they are true on; and one investor update a month,
 * drafted asks first, whose recipients are handed to Mail merge as a new list he sends
 * himself. Nothing here sends anything, sets a target or adds across currencies.
 *
 * It reads the replies and the waitlist through their read-only feeds, the investor list
 * through `investors-raise` (absent here until the investors module offers it: the raise's
 * parts are then left out), and asks for them at request time, never at load.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import {
  CURRENCIES,
  INVESTOR_STAGES,
  MONEY_STALE_DAYS,
  UPDATE_DEFAULT_STAGES,
  type InvestorStage,
} from "../../../src/lib/data/labels";
import type { Answer, DataCore } from "../core";
import { daysBetween } from "../days";
import { clean, cleanText, isDay, isRouteId, normaliseEmail } from "../guard";
import type { Staff } from "../protocol";
import {
  FORWARD_STAGES,
  RAISE_SERVICES,
  type FunnelSummary,
  type InvestorsRaise,
  type RepliesFeed,
  type UpdateRecipientFirm,
  type WaitlistFeed,
} from "../raise-contracts";
import { toCsv } from "../text";
import {
  monthName,
  moneyRows,
  numbersOf,
  updateNumbersOf,
  type MoneyRow,
  type NumbersInput,
} from "./count";
import { linesOf, updateText } from "./text";
import type { Currency, InvestorUpdate, MoneyEntry, NumbersSetup, UpdateNumbers } from "./types";

const MONEY = "numbers/money.jsonl";
const SETUP = "numbers/setup.json";
const UPDATES = "numbers/updates.json";
const EVENTS = "numbers/events.jsonl";

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const NO_UPDATE = "There is no update for that month.";
const HANDED_OVER = "This month's update was handed to Mail merge; it is kept as it was.";
const STOPPED = "On the stop list";
const UNTICKED = "Unticked before the list was made";
const MAX_AMOUNT = 1e13;
const MAX_TYPES = 20;
const MAX_EXCLUDE = 500;
const ENTRIES_SHOWN = 12;
const SYSTEM: Staff = { staff_id: "system", name: "Data" };
const STAGE_KEYS = new Set<string>(Object.keys(INVESTOR_STAGES));

type InvestorsOwn = { owns(email: string): boolean };

/** A typed amount: digits, commas and spaces allowed, at most two decimals; null when not one. */
export function amountOf(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const amount = Number(text);
  return Number.isFinite(amount) && amount <= MAX_AMOUNT ? amount : null;
}

/** "a b\nc" or ["a", "b"] → the parts, trimmed, empty ones dropped. */
function listOf(value: unknown): string[] {
  const parts = Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item : ""))
    : typeof value === "string"
      ? value.split(",")
      : [];
  return parts.map((part) => part.trim()).filter((part) => part !== "");
}

/** The stages asked for, each a known one; refused otherwise. */
function stagesOf(value: unknown): InvestorStage[] {
  const stages = listOf(value);
  for (const stage of stages)
    if (!STAGE_KEYS.has(stage)) throw new Refused(400, "invalid", "Choose from the stages.");
  return [...new Set(stages)] as InvestorStage[];
}

export function register(core: DataCore): void {
  const store = core.store;
  store.ensureDir("numbers");

  // ---------------------------------------------------------------- records

  const money: MoneyEntry[] = store
    .readLines<MoneyEntry>(MONEY)
    .filter((entry) => typeof entry?.entry_id === "string");
  const storedSetup = store.readJson<Partial<NumbersSetup> & { format?: number }>(SETUP, {});
  const setup: NumbersSetup = {
    buyer_types: Array.isArray(storedSetup.buyer_types)
      ? storedSetup.buyer_types.filter((type) => typeof type === "string")
      : [],
    update_date_id:
      typeof storedSetup.update_date_id === "string" ? storedSetup.update_date_id : null,
    updated_at: typeof storedSetup.updated_at === "string" ? storedSetup.updated_at : null,
    updated_by: storedSetup.updated_by ?? null,
  };
  const storedUpdates = store.readJson<{ updates?: InvestorUpdate[] }>(UPDATES, {});
  const updates: InvestorUpdate[] = Array.isArray(storedUpdates.updates)
    ? storedUpdates.updates.filter((update) => typeof update?.period === "string")
    : [];

  const saveSetup = () => store.writeJson(SETUP, { format: 1, ...setup });
  const saveUpdates = () => store.writeJson(UPDATES, { format: 1, updates });
  const log = (verb: string, detail: string, by: Staff) =>
    store.appendLine(EVENTS, { event_id: randomUUID(), verb, detail, by, at: core.now() });

  // ---------------------------------------------------------------- the other modules, asked now

  const raise = () => core.need<InvestorsRaise>(RAISE_SERVICES.investorsRaise);
  const funnel = (): FunnelSummary | null => {
    const service = raise();
    if (!service) return null;
    try {
      return service.funnel();
    } catch (error) {
      core.log(`the funnel could not be read: ${error instanceof Error ? error.name : "error"}`);
      return null;
    }
  };

  const inputOf = (summary: FunnelSummary | null): NumbersInput => {
    const replies = core.need<RepliesFeed>(RAISE_SERVICES.repliesFeed);
    const waitlist = core.need<WaitlistFeed>(RAISE_SERVICES.waitlistFeed);
    const investors = core.need<InvestorsOwn>("investors");
    return {
      today: core.day(),
      dayOf: (at) => core.day(at),
      replies: replies?.all() ?? [],
      isInvestor: (email) => investors?.owns(email) ?? false,
      entries: waitlist?.entries() ?? [],
      moves: waitlist?.moves() ?? [],
      buyerTypes: setup.buyer_types,
      firstMeetingDays: summary ? summary.first_meeting_days : null,
    };
  };

  // ---------------------------------------------------------------- one month's update

  const periodOf = (value: string): string => {
    if (!PERIOD.test(value) || value > core.day().slice(0, 7))
      throw new Refused(404, "not_found", NO_UPDATE);
    return value;
  };

  /** The month's update, made as a draft the first time anyone opens it. */
  const updateFor = (period: string): InvestorUpdate => {
    const known = updates.find((update) => update.period === period);
    if (known) return known;
    const now = core.now();
    const made: InvestorUpdate = {
      update_id: randomUUID(),
      period,
      title: `Quantify Terminal: ${monthName(period)} update`,
      opening: "",
      asks: "",
      highlights: "",
      lowlights: "",
      thanks: "",
      sign_off: "",
      snapshot: null,
      snapshot_at: null,
      status: "draft",
      handed_over: null,
      created_at: now,
      created_by: SYSTEM,
      updated_at: now,
      updated_by: SYSTEM,
    };
    updates.push(made);
    updates.sort((a, b) => b.period.localeCompare(a.period));
    saveUpdates();
    return made;
  };

  const liveNumbers = (period: string): UpdateNumbers => {
    const summary = funnel();
    return updateNumbersOf(inputOf(summary), period, summary, money);
  };
  const numbersFor = (update: InvestorUpdate): UpdateNumbers =>
    update.snapshot ?? liveNumbers(update.period);
  const shown = (update: InvestorUpdate): Answer => {
    const numbers = numbersFor(update);
    return { update, numbers, text: updateText(update, numbers) };
  };

  const touch = (update: InvestorUpdate, by: Staff) => {
    update.updated_at = core.now();
    update.updated_by = by;
    saveUpdates();
  };

  // ---------------------------------------------------------------- who it goes to

  type Person = UpdateRecipientFirm["people"][number] & { stopped: boolean };
  type RecipientFirm = Omit<UpdateRecipientFirm, "people"> & { people: Person[] };

  /** The firms at these stages and their people, each address once, the stopped marked. */
  const recipientsOf = (stages: readonly InvestorStage[]) => {
    const service = raise();
    if (!service) return { firms: [] as RecipientFirm[], here: false };
    core.sender.poll();
    const seen = new Set<string>();
    const firms: RecipientFirm[] = [];
    for (const firm of service.recipients(stages)) {
      const people: Person[] = [];
      for (const person of firm.people) {
        const email = normaliseEmail(person.email) || person.email.trim().toLowerCase();
        if (!email || seen.has(email)) continue;
        seen.add(email);
        people.push({ ...person, email, stopped: core.sender.isStopped(email) });
      }
      firms.push({ ...firm, people });
    }
    return { firms, here: true };
  };

  // ---------------------------------------------------------------- routes: the page

  core.route("GET", "/data/numbers", () => {
    const summary = funnel();
    const input = inputOf(summary);
    const counted = numbersOf(input);
    const rows = moneyRows(money, input.today);
    const reached = (stage: string) =>
      summary?.stages.find((item) => item.stage === stage)?.reached ?? 0;
    const now = (stage: string) => summary?.stages.find((item) => item.stage === stage)?.now ?? 0;
    const types = new Map<string, string>();
    for (const type of [...input.entries.map((entry) => entry.firm_type), ...setup.buyer_types]) {
      const trimmed = type.trim();
      if (trimmed && !types.has(trimmed.toLowerCase())) types.set(trimmed.toLowerCase(), trimmed);
    }
    return {
      today: input.today,
      ...counted,
      raise: summary
        ? {
            firms: summary.firms,
            written: reached("written"),
            replied: reached("replied"),
            meeting: reached("meeting"),
            met: reached("met"),
            soft: now("soft"),
            signed: now("signed"),
            money_in: now("money_in"),
            days_since_first_send: summary.days_since_first_send,
            money: summary.money,
          }
        : null,
      money: {
        rows,
        entries: [...money]
          .sort(
            (a, b) => b.as_of.localeCompare(a.as_of) || b.recorded_at.localeCompare(a.recorded_at),
          )
          .slice(0, ENTRIES_SHOWN),
        stale_days: MONEY_STALE_DAYS,
      },
      buyer_types: [...setup.buyer_types],
      firm_types: [...types.values()].sort((a, b) => a.localeCompare(b, "en")),
      update_date_id: setup.update_date_id,
      updates: updates.map((update) => ({
        period: update.period,
        label: monthName(update.period),
        status: update.status,
        people: update.handed_over?.people ?? null,
        updated_at: update.updated_at,
      })),
    };
  });

  core.route("POST", "/data/numbers/money", (ctx) => {
    const by = ctx.staff();
    const today = core.day();
    const currency = clean(ctx.body.currency, 3);
    if (!(CURRENCIES as readonly string[]).includes(currency))
      throw new Refused(400, "invalid", "Choose USD or INR.");
    const cash = amountOf(ctx.body.cash);
    if (cash === null)
      throw new Refused(400, "invalid", "Type the cash as a number, such as 1200000.");
    const burn = amountOf(ctx.body.burn_per_month);
    if (burn === null || burn <= 0)
      throw new Refused(
        400,
        "invalid",
        "Type the monthly burn as a number above 0, such as 150000.",
      );
    const asOf = clean(ctx.body.as_of, 10);
    if (!isDay(asOf)) throw new Refused(400, "invalid", "Choose the day these are true on.");
    if (asOf > today) throw new Refused(400, "invalid", "That day is in the future.");
    if (daysBetween(asOf, today) > MONEY_STALE_DAYS)
      throw new Refused(
        400,
        "invalid",
        "That is more than 35 days ago. Type figures that are true this month.",
      );
    const entry: MoneyEntry = {
      entry_id: randomUUID(),
      currency: currency as Currency,
      as_of: asOf,
      cash,
      burn_per_month: burn,
      note: cleanText(ctx.body.note, 500),
      recorded_at: core.now(),
      recorded_by: by,
    };
    store.appendLine(MONEY, entry);
    money.push(entry);
    log("Cash and burn typed", currency, by);
    const row: MoneyRow | undefined = moneyRows(money, today).find(
      (item) => item.currency === entry.currency,
    );
    return { entry, runway_months: row?.runway_months ?? null };
  });

  core.route("POST", "/data/numbers/setup", (ctx) => {
    const by = ctx.staff();
    if (ctx.body.buyer_types !== undefined) {
      const types: string[] = [];
      for (const raw of listOf(ctx.body.buyer_types)) {
        const type = cleanText(raw, 80);
        if (type && !types.some((seen) => seen.toLowerCase() === type.toLowerCase()))
          types.push(type);
      }
      if (types.length > MAX_TYPES) throw new Refused(400, "invalid", "Twenty types at most.");
      setup.buyer_types = types;
      log("Buyer firm types changed", String(types.length), by);
    }
    if (ctx.body.update_date_id !== undefined) {
      const id = clean(ctx.body.update_date_id, 64);
      if (id && !isRouteId(id)) throw new Refused(400, "invalid", "That is not a Key date.");
      setup.update_date_id = id || null;
      log("Monthly reminder set", id, by);
    }
    setup.updated_at = core.now();
    setup.updated_by = by;
    saveSetup();
    return { setup: { ...setup } };
  });

  // ---------------------------------------------------------------- routes: one month's update

  core.route("GET", "/data/numbers/updates/:period", (ctx) => {
    const update = updateFor(periodOf(ctx.params[0]!));
    return { ...shown(update), today: core.day() };
  });

  core.route("POST", "/data/numbers/updates/:period", (ctx) => {
    const by = ctx.staff();
    const update = updateFor(periodOf(ctx.params[0]!));
    if (update.status === "handed_over") throw new Refused(409, "handed_over", HANDED_OVER);
    const body = ctx.body;
    const part = (name: string, limit: number): string | undefined =>
      body[name] === undefined ? undefined : cleanText(body[name], limit);
    const listed = (name: "asks" | "highlights" | "lowlights", plural: string) => {
      const value = part(name, 2_000);
      if (value !== undefined && linesOf(value).length > 3)
        throw new Refused(400, "invalid", `Three ${plural} at most.`);
      return value;
    };
    const next = {
      opening: part("opening", 400),
      asks: listed("asks", "asks"),
      highlights: listed("highlights", "highlights"),
      lowlights: listed("lowlights", "lowlights"),
      thanks: part("thanks", 1_000),
      sign_off: part("sign_off", 120),
    };
    for (const [key, value] of Object.entries(next) as [keyof typeof next, string | undefined][])
      if (value !== undefined) update[key] = value;
    touch(update, by);
    log("Update saved", update.period, by);
    return shown(update);
  });

  core.route("POST", "/data/numbers/updates/:period/freeze", (ctx) => {
    const by = ctx.staff();
    const update = updateFor(periodOf(ctx.params[0]!));
    if (update.status === "handed_over") throw new Refused(409, "handed_over", HANDED_OVER);
    if (update.status === "draft") {
      update.snapshot = liveNumbers(update.period);
      update.snapshot_at = core.now();
      update.status = "frozen";
      touch(update, by);
      log("Numbers frozen", update.period, by);
    }
    return shown(update);
  });

  core.route("POST", "/data/numbers/updates/:period/unfreeze", (ctx) => {
    const by = ctx.staff();
    const update = updateFor(periodOf(ctx.params[0]!));
    if (update.status === "handed_over") throw new Refused(409, "handed_over", HANDED_OVER);
    if (update.status === "frozen") {
      update.snapshot = null;
      update.snapshot_at = null;
      update.status = "draft";
      touch(update, by);
      log("Numbers live again", update.period, by);
    }
    return shown(update);
  });

  core.route("GET", "/data/numbers/updates/:period/recipients", (ctx) => {
    periodOf(ctx.params[0]!);
    const given = ctx.query.get("stages");
    const stages = given === null ? [...UPDATE_DEFAULT_STAGES] : stagesOf(given);
    const { firms, here } = recipientsOf(stages);
    const everyone = firms.flatMap((firm) => firm.people);
    return {
      stages,
      firms,
      people: everyone.filter((person) => !person.stopped).length,
      left_out: everyone
        .filter((person) => person.stopped)
        .map((person) => ({ email: person.email, why: STOPPED })),
      here,
    };
  });

  core.route("POST", "/data/numbers/updates/:period/hand-over", async (ctx) => {
    const by = ctx.staff();
    const period = periodOf(ctx.params[0]!);
    if (!raise())
      throw new Refused(409, "investors_missing", "The investor list is not set up here yet.");
    const update = updateFor(period);
    if (update.status === "draft" || !update.snapshot)
      throw new Refused(
        409,
        "not_frozen",
        "Freeze the numbers first, so the list and the words match.",
      );
    const stages =
      ctx.body.stages === undefined ? [...UPDATE_DEFAULT_STAGES] : stagesOf(ctx.body.stages);
    const exclude = new Set(
      listOf(ctx.body.exclude)
        .slice(0, MAX_EXCLUDE)
        .map((email) => normaliseEmail(email))
        .filter((email) => email !== ""),
    );
    const { firms } = recipientsOf(stages);
    const rows: string[][] = [];
    const leftOut: { email: string; why: string }[] = [];
    for (const firm of firms)
      for (const person of firm.people) {
        if (person.stopped) leftOut.push({ email: person.email, why: STOPPED });
        else if (exclude.has(person.email)) leftOut.push({ email: person.email, why: UNTICKED });
        else {
          const [first = "", ...rest] = person.name.trim().split(/\s+/);
          rows.push([
            person.email,
            first,
            rest.join(" "),
            firm.firm,
            INVESTOR_STAGES[firm.stage].label,
          ]);
        }
      }
    if (rows.length === 0)
      throw new Refused(
        409,
        "nobody_left",
        "Nobody is left to write to: choose more stages, or tick someone.",
      );
    const label = monthName(period);
    core.sender.poll();
    const taken = new Set(core.sender.lists().map((list) => list.name));
    let name = `Investor update ${label}`;
    for (let copy = 2; taken.has(name); copy += 1) name = `Investor update ${label} (${copy})`;
    const made = await core.engine("importList", {
      name,
      file_name: `investor-update-${period}.csv`,
      text: toCsv(["Email", "First Name", "Last Name", "Company", "Stage"], rows),
    });
    const list = (made.list ?? {}) as { id?: unknown; name?: unknown; people?: unknown };
    const madeList = {
      id: String(list.id ?? ""),
      name: typeof list.name === "string" ? list.name : name,
      people: typeof list.people === "number" ? list.people : rows.length,
    };
    update.status = "handed_over";
    update.handed_over = {
      at: core.now(),
      by,
      list_id: madeList.id,
      list_name: madeList.name,
      people: madeList.people,
      left_out: leftOut,
    };
    touch(update, by);
    log("Handed to Mail merge", `${update.period} · ${madeList.people}`, by);
    return { list: madeList, left_out: leftOut, update };
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    let fake: InvestorsRaise | null = null;
    core.route("POST", "/data/_test/numbers/raise", (ctx) => {
      ctx.staff();
      const current = raise();
      if (ctx.body.on === false) {
        if (current && current === fake) core.provide(RAISE_SERVICES.investorsRaise, null);
        return { installed: false, real: Boolean(current && current !== fake) };
      }
      if (current && current !== fake) return { installed: false, real: true };
      fake = standIn(ctx.body, core.day());
      core.provide(RAISE_SERVICES.investorsRaise, fake);
      return { installed: true, real: false };
    });
    core.route("GET", "/data/_test/numbers/feeds", () => {
      const replies = core.need<RepliesFeed>(RAISE_SERVICES.repliesFeed);
      const waitlist = core.need<WaitlistFeed>(RAISE_SERVICES.waitlistFeed);
      const current = raise();
      return {
        replies: replies ? replies.all() : null,
        entries: waitlist ? waitlist.entries() : null,
        moves: waitlist ? waitlist.moves() : null,
        standin: current !== null && current === fake,
        real: current !== null && current !== fake,
      };
    });
  }
}

// ------------------------------------------------------------------ the stand-in (test routes only)

type StandInFirm = UpdateRecipientFirm;

/** An empty funnel for today, so a stand-in posted with only some parts still reads whole. */
export function emptyFunnel(today: string): FunnelSummary {
  return {
    today,
    week_from: today,
    firms: 0,
    not_written: 0,
    first_send_on: null,
    days_since_first_send: null,
    first_meetings_this_week: 0,
    first_meeting_days: [],
    stages: FORWARD_STAGES.map((stage) => ({ stage, now: 0, reached: 0, of: 0 })),
    exits: [],
    money: {},
    passed: 0,
    pass_reasons: [],
    stale_days: 14,
    time_in_stage: [],
    stale: [],
    by_wave: [],
    by_intro: [],
  };
}

/**
 * An invented `investors-raise` (raise spec §8.9): the funnel it was given, and firms whose
 * `recipients(stages)` are those at the stages asked for. Installed only under test routes,
 * and never over a real one.
 */
function standIn(body: Record<string, unknown>, today: string): InvestorsRaise {
  const given =
    body.funnel && typeof body.funnel === "object" && !Array.isArray(body.funnel)
      ? (body.funnel as Partial<FunnelSummary>)
      : {};
  const summary: FunnelSummary = { ...emptyFunnel(today), ...given };
  if (!Array.isArray(summary.first_meeting_days)) summary.first_meeting_days = [];
  summary.first_meeting_days = summary.first_meeting_days.filter((day) => isDay(day));
  if (!Array.isArray(summary.stages)) summary.stages = emptyFunnel(today).stages;
  if (!summary.money || typeof summary.money !== "object") summary.money = {};
  const firms: StandInFirm[] = (Array.isArray(body.firms) ? body.firms : [])
    .filter(
      (firm): firm is Record<string, unknown> =>
        Boolean(firm) && typeof firm === "object" && !Array.isArray(firm),
    )
    .map((firm) => ({
      investor_id: clean(firm.investor_id, 64),
      firm: clean(firm.firm, 120),
      stage: (STAGE_KEYS.has(String(firm.stage)) ? firm.stage : "written") as InvestorStage,
      people: (Array.isArray(firm.people) ? firm.people : [])
        .filter(
          (person): person is Record<string, unknown> =>
            Boolean(person) && typeof person === "object",
        )
        .map((person) => ({
          email: normaliseEmail(clean(person.email, 254)),
          name: clean(person.name, 120),
          replied: person.replied === true,
        }))
        .filter((person) => person.email !== ""),
    }))
    .filter((firm) => firm.investor_id !== "" && firm.firm !== "");
  return {
    funnel: () => summary,
    firmOptions: () =>
      firms.map((firm) => ({ investor_id: firm.investor_id, firm: firm.firm, stage: firm.stage })),
    recipients: (stages) =>
      firms
        .filter((firm) => stages.includes(firm.stage))
        .map((firm) => ({ ...firm, people: firm.people.map((person) => ({ ...person })) })),
    name: (investorId) => firms.find((firm) => firm.investor_id === investorId)?.firm ?? null,
  };
}
