/**
 * Pilots (ws-notes/company/spec.md §9): a pilot record on a waitlist firm, with one to four
 * success criteria written before it starts, three named owners at the firm, the term, the
 * price or "free", what it converts to and when, the go/no-go day and the decision, and a
 * check-in log every week. "{n} pilots running" is a count with a sentence, never a limit:
 * a sixth pilot is accepted. No benchmark conversion rate is shown anywhere.
 *
 * Due rows (kind `pilot`) and `agenda:pilots`; the `pilots` service answers "Used for"
 * (pilots keep no copies, so it is always empty).
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import {
  COMPANY_SERVICES,
  type AgreementView,
  type AgreementsLookup,
  type UsedFor,
} from "../company-contracts";
import type { DataCore, DueItem } from "../core";
import { addDays, daysBetween } from "../days";
import { clean, cleanText, isDay, isRouteId } from "../guard";
import type { Staff } from "../protocol";
import {
  RAISE_SERVICES,
  agendaService,
  type AgendaItem,
  type AgendaSource,
  type WaitlistFeed,
} from "../raise-contracts";
import {
  CRITERIA_HINT,
  NAME_THE_OWNER,
  PILOTS_LINE,
  PILOT_DECISIONS,
  PILOT_OWNERS,
  criteriaMet,
  dayWords,
  termWords,
} from "../../../src/lib/data/labels-close";
import {
  CLOSE_TOTALS,
  anyDay,
  currencyOf,
  full,
  invalid,
  pastDay,
  ticked,
  wholeAmount,
} from "../closing/limits";
import { CHECK_IN_DAYS, CONVERT_AHEAD, DECIDE_AHEAD, PILOT_LIMITS, WALK_PILOT_ID } from "./limits";
import type { Criterion, Pilot, PilotEvent } from "./types";

const FILE = "pilots/pilots.json";
const EVENTS = "pilots/events.jsonl";
const STATES = ["planned", "running", "decided"] as const;
const OWNER_KEYS = Object.keys(PILOT_OWNERS) as (keyof typeof PILOT_OWNERS)[];
const PRICE_SENTENCE = "Type the price as a number, such as 50000.";

const errorName = (error: unknown): string => (error instanceof Error ? error.name : "error");

/** The next check-in of a running pilot: the last one (or the start) plus a week. */
export function nextCheckIn(
  pilot: Pick<Pilot, "state" | "starts_on" | "check_ins">,
): string | null {
  if (pilot.state !== "running") return null;
  const last = pilot.check_ins.reduce<string | null>(
    (latest, item) => (latest === null || item.on > latest ? item.on : latest),
    null,
  );
  return addDays(last ?? pilot.starts_on, CHECK_IN_DAYS);
}

const lastCheckIn = (pilot: Pilot): string | null =>
  pilot.check_ins.reduce<string | null>(
    (latest, item) => (latest === null || item.on > latest ? item.on : latest),
    null,
  );

/** Whether the go/no-go is still owed: no decision yet, or an extension. */
const undecided = (pilot: Pilot): boolean =>
  pilot.state !== "decided" && (pilot.decision === null || pilot.decision.outcome === "extend");

export function register(core: DataCore): void {
  const stored = core.store.readJson<{ pilots?: Pilot[] }>(FILE, {});
  const pilots: Pilot[] = Array.isArray(stored.pilots) ? stored.pilots : [];
  let pinned: string | null = null;
  const save = (): void => core.store.writeJson(FILE, { format: 1, pilots });
  const log = (pilotId: string, verb: string, detail: string, by: Staff): void => {
    const event: PilotEvent = {
      event_id: randomUUID(),
      pilot_id: pilotId,
      verb,
      detail,
      by,
      at: core.now(),
    };
    core.store.appendLine(EVENTS, event);
  };

  const feed = () => core.need<WaitlistFeed>(RAISE_SERVICES.waitlistFeed);
  const agreements = () => core.need<AgreementsLookup>(COMPANY_SERVICES.agreements);

  const entryOf = (entryId: string): { entry_id: string; firm: string; stage: string } | null => {
    try {
      const found = feed()
        ?.entries()
        .find((entry) => entry.entry_id === entryId);
      return found ? { entry_id: found.entry_id, firm: found.firm, stage: found.stage } : null;
    } catch (error) {
      core.log(`pilots: the waitlist could not be read: ${errorName(error)}`);
      return null;
    }
  };
  const stages = (): Map<string, string> => {
    try {
      return new Map((feed()?.entries() ?? []).map((entry) => [entry.entry_id, entry.stage]));
    } catch {
      return new Map();
    }
  };

  const mustPilot = (id: string | undefined): Pilot => {
    const pilot = pilots.find((item) => item.pilot_id === id);
    if (!pilot) throw new Refused(404, "not_found", "That pilot is not here.");
    return pilot;
  };
  const running = (): number => pilots.filter((pilot) => pilot.state === "running").length;
  const touch = (pilot: Pilot, by: Staff): void => {
    pilot.updated_at = core.now();
    pilot.updated_by = by;
  };

  const warningsOf = (pilot: Pilot): string[] => {
    const out: string[] = [];
    if (pilot.criteria.length < 3) out.push(CRITERIA_HINT);
    for (const key of OWNER_KEYS) if (!pilot.owners[key]) out.push(NAME_THE_OWNER(key, pilot.firm));
    if (pilot.state === "running") {
      const since = lastCheckIn(pilot) ?? pilot.starts_on;
      const days = daysBetween(since, core.day());
      if (days > CHECK_IN_DAYS)
        out.push(`No check-in for ${days.toLocaleString("en-GB")} days. Log one each week.`);
    }
    return out;
  };

  const rowOf = (pilot: Pilot, stageOf: Map<string, string>) => ({
    ...pilot,
    criteria_met: criteriaMet(pilot.criteria),
    owners_missing: OWNER_KEYS.filter((key) => !pilot.owners[key]),
    next_check_in: nextCheckIn(pilot),
    last_check_in: lastCheckIn(pilot),
    entry_stage: stageOf.get(pilot.entry_id) ?? null,
  });

  // ---------------------------------------------------------------- reading the fields

  const criteriaOf = (value: unknown, before: readonly Criterion[]): Criterion[] => {
    const rows = Array.isArray(value) ? value : [];
    const criteria: Criterion[] = [];
    for (const row of rows) {
      const item = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      const what = cleanText(item.what, PILOT_LIMITS.criterion);
      const target = cleanText(item.target, PILOT_LIMITS.target);
      if (!what && !target) continue;
      if (!what) throw invalid("Say what each criterion measures.");
      const kept = before[criteria.length];
      criteria.push({
        criterion_id: kept?.criterion_id ?? randomUUID(),
        what,
        target,
        result: kept && kept.what === what ? kept.result : "",
        met: kept && kept.what === what ? kept.met : "",
      });
    }
    if (criteria.length === 0) throw invalid("Write at least one success criterion.");
    if (criteria.length > PILOT_LIMITS.criteria) throw invalid("Four criteria at most.");
    return criteria;
  };

  const ownersOf = (value: unknown): Pilot["owners"] => {
    const given = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    return {
      sponsor: cleanText(given.sponsor, PILOT_LIMITS.owner),
      technical: cleanText(given.technical, PILOT_LIMITS.owner),
      user: cleanText(given.user, PILOT_LIMITS.owner),
    };
  };

  const priceOf = (value: unknown, free: boolean): Pilot["price"] => {
    if (free || !value || typeof value !== "object") return null;
    const given = value as Record<string, unknown>;
    const amount = wholeAmount(given.amount, PRICE_SENTENCE);
    if (amount === null) return null;
    return {
      amount,
      currency: currencyOf(given.currency),
      note: cleanText(given.note, PILOT_LIMITS.price_note),
    };
  };

  const conversionOf = (value: unknown): Pilot["conversion"] => {
    if (!value || typeof value !== "object") return null;
    const given = value as Record<string, unknown>;
    const on = anyDay(given.on);
    const amount = wholeAmount(given.amount, PRICE_SENTENCE);
    if (on === null && amount === null) return null;
    const per = clean(given.per, 8) === "year" ? "year" : "month";
    return {
      on,
      amount,
      currency: amount === null ? "INR" : currencyOf(given.currency),
      per,
    };
  };

  const termOf = (body: Record<string, unknown>) => {
    const starts = clean(body.starts_on, 10);
    const ends = clean(body.ends_on, 10);
    if (!isDay(starts) || !isDay(ends)) throw invalid("Give the first and the last day.");
    if (ends < starts) throw invalid("The pilot ends before it starts.");
    return { starts, ends };
  };

  // ---------------------------------------------------------------- what other modules ask

  const used: UsedFor = { usedFor: () => [] };
  core.provide(COMPANY_SERVICES.pilots, used);

  core.provideDue((): DueItem[] => {
    const today = core.day();
    const items: DueItem[] = [];
    for (const pilot of pilots) {
      const href = `/data/waitlist/pilots/${pilot.pilot_id}`;
      const sub = `Pilot · ${termWords(pilot.starts_on, pilot.ends_on)}`;
      if (pilot.state === "planned" && pilot.starts_on <= today)
        items.push({
          key: `pilot:${pilot.pilot_id}:start`,
          kind: "pilot",
          title: `Start the pilot with ${pilot.firm}`,
          sub,
          due_on: pilot.starts_on,
          href,
        });
      const next = nextCheckIn(pilot);
      if (next && next <= today)
        items.push({
          key: `pilot:${pilot.pilot_id}:check-in`,
          kind: "pilot",
          title: `Weekly check-in: ${pilot.firm}`,
          sub,
          due_on: next,
          href,
        });
      if (
        undecided(pilot) &&
        pilot.go_no_go_on &&
        pilot.go_no_go_on <= addDays(today, DECIDE_AHEAD)
      )
        items.push({
          key: `pilot:${pilot.pilot_id}:decide`,
          kind: "pilot",
          title: `Go or no-go: ${pilot.firm}`,
          sub,
          due_on: pilot.go_no_go_on,
          href,
        });
      const converts = pilot.conversion?.on ?? null;
      if (
        pilot.state === "decided" &&
        pilot.decision?.outcome === "go" &&
        converts &&
        converts <= addDays(today, CONVERT_AHEAD)
      )
        items.push({
          key: `pilot:${pilot.pilot_id}:convert`,
          kind: "pilot",
          title: `Convert ${pilot.firm} to paid`,
          sub,
          due_on: converts,
          href,
        });
    }
    return items;
  });

  const agendaOf = (): AgendaItem[] => {
    const items: AgendaItem[] = [];
    for (const pilot of pilots) {
      const href = `/data/waitlist/pilots/${pilot.pilot_id}`;
      const sub = `Pilot · ${termWords(pilot.starts_on, pilot.ends_on)}`;
      if (undecided(pilot) && pilot.go_no_go_on)
        items.push({
          key: `pilot:${pilot.pilot_id}:go-no-go`,
          kind: "pilot",
          title: `Pilot go/no-go · ${pilot.firm}`,
          plain: "Pilot go/no-go",
          sub,
          on: pilot.go_no_go_on,
          remind_days: [3, 0],
          href,
        });
      const next = nextCheckIn(pilot);
      if (next)
        items.push({
          key: `pilot:${pilot.pilot_id}:check-in`,
          kind: "pilot",
          title: `Pilot check-in · ${pilot.firm}`,
          plain: "Pilot check-in",
          sub,
          on: next,
          remind_days: [0],
          href,
        });
      const converts = pilot.conversion?.on ?? null;
      if (pilot.state === "decided" && pilot.decision?.outcome === "go" && converts)
        items.push({
          key: `pilot:${pilot.pilot_id}:converts`,
          kind: "pilot",
          title: `Pilot converts · ${pilot.firm}`,
          plain: "Pilot converts",
          sub,
          on: converts,
          remind_days: [7, 0],
          href,
        });
    }
    return items.sort((a, b) => a.on.localeCompare(b.on) || a.title.localeCompare(b.title));
  };
  const agenda: AgendaSource = {
    agenda: (today) => {
      void today; // every open item, overdue ones included
      try {
        return agendaOf();
      } catch (error) {
        core.log(`pilots agenda failed: ${errorName(error)}`);
        return [];
      }
    },
  };
  core.provide(agendaService("pilots"), agenda);

  // ---------------------------------------------------------------- reading

  core.route("GET", "/data/pilots", (ctx) => {
    const state = clean(ctx.query.get("state"), 20);
    const stageOf = stages();
    const sorted = [...pilots].sort(
      (a, b) => b.starts_on.localeCompare(a.starts_on) || a.firm.localeCompare(b.firm),
    );
    const shown = (STATES as readonly string[]).includes(state)
      ? sorted.filter((pilot) => pilot.state === state)
      : sorted;
    const count = (key: Pilot["state"]) => pilots.filter((pilot) => pilot.state === key).length;
    return {
      pilots: shown.map((pilot) => rowOf(pilot, stageOf)),
      counts: {
        running: count("running"),
        planned: count("planned"),
        decided: count("decided"),
        all: pilots.length,
      },
      running_line: PILOTS_LINE(running()),
      today: core.day(),
    };
  });

  core.route("GET", "/data/pilots/for-entry/:entryId", (ctx) => {
    const entryId = ctx.params[0] ?? "";
    const stageOf = stages();
    return {
      pilots: pilots
        .filter((pilot) => pilot.entry_id === entryId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((pilot) => rowOf(pilot, stageOf)),
      running_line: PILOTS_LINE(running()),
      today: core.day(),
    };
  });

  core.route("GET", "/data/pilots/:id", (ctx) => {
    const pilot = mustPilot(ctx.params[0]);
    let found: AgreementView[] | null = null;
    const register = agreements();
    if (register)
      try {
        found = register.forParty("waitlist", pilot.entry_id);
      } catch (error) {
        core.log(`pilots: agreements could not be read: ${errorName(error)}`);
        found = [];
      }
    return {
      pilot: rowOf(pilot, stages()),
      entry: entryOf(pilot.entry_id),
      agreements: found,
      warnings: warningsOf(pilot),
      next_check_in: nextCheckIn(pilot),
      running_line: PILOTS_LINE(running()),
      events: core.store
        .readLines<PilotEvent>(EVENTS)
        .filter((event) => event?.pilot_id === pilot.pilot_id)
        .reverse()
        .slice(0, 100),
      today: core.day(),
    };
  });

  // ---------------------------------------------------------------- his changes

  core.route("POST", "/data/pilots", (ctx) => {
    const by = ctx.staff();
    const body = ctx.body;
    const entry = entryOf(clean(body.entry_id, 64));
    if (!entry) throw new Refused(404, "not_found", "That firm is not on the waitlist.");
    if (
      pilots.some(
        (pilot) =>
          pilot.entry_id === entry.entry_id &&
          (pilot.state === "planned" || pilot.state === "running"),
      )
    )
      throw new Refused(409, "pilot_open", `${entry.firm} has a pilot open already.`);
    full(pilots.length, CLOSE_TOTALS.pilots, "pilots");
    const { starts, ends } = termOf(body);
    const at = core.now();
    const id = pinned && !pilots.some((pilot) => pilot.pilot_id === pinned) ? pinned : randomUUID();
    pinned = null;
    const pilot: Pilot = {
      pilot_id: id,
      entry_id: entry.entry_id,
      firm: entry.firm,
      state: "planned",
      starts_on: starts,
      ends_on: ends,
      criteria: criteriaOf(body.criteria, []),
      owners: ownersOf(body.owners),
      price: priceOf(body.price, ticked(body.free)),
      conversion: conversionOf(body.conversion),
      go_no_go_on: anyDay(body.go_no_go_on),
      decision: null,
      check_ins: [],
      created_at: at,
      created_by: by,
      updated_at: at,
      updated_by: by,
    };
    pilots.push(pilot);
    save();
    log(pilot.pilot_id, "planned", termWords(starts, ends), by);
    return {
      pilot,
      warnings: warningsOf(pilot),
      running: running(),
      running_line: PILOTS_LINE(running()),
    };
  });

  core.route("POST", "/data/pilots/:id/update", (ctx) => {
    const by = ctx.staff();
    const pilot = mustPilot(ctx.params[0]);
    const body = ctx.body;
    const { starts, ends } = termOf(body);
    pilot.starts_on = starts;
    pilot.ends_on = ends;
    pilot.criteria = criteriaOf(body.criteria, pilot.criteria);
    pilot.owners = ownersOf(body.owners);
    pilot.price = priceOf(body.price, ticked(body.free));
    pilot.conversion = conversionOf(body.conversion);
    pilot.go_no_go_on = anyDay(body.go_no_go_on);
    touch(pilot, by);
    save();
    log(pilot.pilot_id, "edited", termWords(starts, ends), by);
    return { pilot, warnings: warningsOf(pilot) };
  });

  core.route("POST", "/data/pilots/:id/start", (ctx) => {
    const by = ctx.staff();
    const pilot = mustPilot(ctx.params[0]);
    if (pilot.state !== "planned" || pilot.criteria.length === 0)
      throw new Refused(409, "not_planned", "Only a planned pilot can start.");
    pilot.state = "running";
    touch(pilot, by);
    save();
    log(pilot.pilot_id, "started", "", by);
    return { pilot };
  });

  core.route("POST", "/data/pilots/:id/check-ins", (ctx) => {
    const by = ctx.staff();
    const pilot = mustPilot(ctx.params[0]);
    if (pilot.state !== "running")
      throw new Refused(409, "not_running", "Only a running pilot has check-ins.");
    const on = pastDay(ctx.body.on, core.day()) ?? core.day();
    const note = cleanText(ctx.body.note, PILOT_LIMITS.note);
    if (!note) throw invalid("Write what was said at the check-in.");
    pilot.check_ins.push({ check_in_id: randomUUID(), on, note, at: core.now(), by });
    pilot.check_ins.sort((a, b) => a.on.localeCompare(b.on) || a.at.localeCompare(b.at));
    touch(pilot, by);
    save();
    log(pilot.pilot_id, "check_in", note.slice(0, 200), by);
    return { pilot, next_check_in: nextCheckIn(pilot) };
  });

  core.route("POST", "/data/pilots/:id/criteria/:cid/result", (ctx) => {
    const by = ctx.staff();
    const pilot = mustPilot(ctx.params[0]);
    const criterion = pilot.criteria.find((item) => item.criterion_id === ctx.params[1]);
    if (!criterion) throw new Refused(404, "not_found", "That criterion is not on this pilot.");
    const met = clean(ctx.body.met, 3);
    if (met !== "yes" && met !== "no" && met !== "") throw invalid("Choose Yes, No or Not yet.");
    criterion.result = cleanText(ctx.body.result, PILOT_LIMITS.result);
    criterion.met = met;
    touch(pilot, by);
    save();
    log(pilot.pilot_id, "result", `${criterion.what}: ${criterion.result || "no result"}`, by);
    return { pilot };
  });

  core.route("POST", "/data/pilots/:id/decision", (ctx) => {
    const by = ctx.staff();
    const pilot = mustPilot(ctx.params[0]);
    if (pilot.state === "decided")
      throw new Refused(409, "decided", "This pilot is decided already.");
    const body = ctx.body;
    const today = core.day();
    const outcome = clean(body.outcome, 10);
    if (outcome !== "go" && outcome !== "no_go" && outcome !== "extend")
      throw invalid("Choose Go, No-go or Extend it.");
    const on = pastDay(body.on, today) ?? today;
    const note = cleanText(body.note, PILOT_LIMITS.note);
    if (outcome === "extend") {
      const ends = clean(body.ends_on, 10);
      const decideOn = clean(body.go_no_go_on, 10);
      if (!isDay(ends) || !isDay(decideOn) || ends < today || decideOn < today)
        throw invalid("Give the new end and go/no-go days.");
      if (ends < pilot.starts_on) throw invalid("The pilot ends before it starts.");
      pilot.ends_on = ends;
      pilot.go_no_go_on = decideOn;
    } else {
      pilot.state = "decided";
      const converts = anyDay(body.converts_on);
      if (outcome === "go" && converts)
        pilot.conversion = {
          on: converts,
          amount: pilot.conversion?.amount ?? null,
          currency: pilot.conversion?.currency ?? "INR",
          per: pilot.conversion?.per ?? "month",
        };
    }
    pilot.decision = { outcome, on, note, by };
    touch(pilot, by);
    save();
    log(
      pilot.pilot_id,
      "decision",
      `${PILOT_DECISIONS[outcome]} on ${dayWords(on)}${note ? `: ${note.slice(0, 160)}` : ""}`,
      by,
    );
    return { pilot };
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    // The next pilot planned takes this id, so the walk's screens have fixed paths.
    core.route("POST", "/data/_test/pilots/pin", (ctx) => {
      ctx.staff();
      const id = clean(ctx.body.id, 64) || WALK_PILOT_ID;
      if (!isRouteId(id)) throw invalid("Give an id.");
      pinned = pilots.some((pilot) => pilot.pilot_id === id) ? null : id;
      return { pinned };
    });
    // Running pilots on invented firms, not on the waitlist, for the count (PI4).
    core.route("POST", "/data/_test/pilots/running", (ctx) => {
      const by = ctx.staff();
      const count = Math.min(20, Math.max(1, Number(ctx.body.count) || 1));
      const ago = Math.min(60, Math.max(0, Number(ctx.body.started_days_ago) || 0));
      const today = core.day();
      const at = core.now();
      const made: string[] = [];
      for (let index = 1; index <= count; index += 1) {
        const n = pilots.length + 1;
        const pilot: Pilot = {
          pilot_id: randomUUID(),
          entry_id: `walk-entry-${n}`,
          firm: `Walk Pilot Firm ${n}`,
          state: "running",
          starts_on: addDays(today, -ago),
          ends_on: addDays(today, 30),
          criteria: [
            {
              criterion_id: randomUUID(),
              what: "Analysts use it every day",
              target: "Two analysts, five days a week",
              result: "",
              met: "",
            },
          ],
          owners: { sponsor: "Walk Sponsor", technical: "Walk Engineer", user: "Walk Analyst" },
          price: null,
          conversion: null,
          go_no_go_on: null,
          decision: null,
          check_ins: [],
          created_at: at,
          created_by: by,
          updated_at: at,
          updated_by: by,
        };
        pilots.push(pilot);
        made.push(pilot.pilot_id);
      }
      save();
      return { made, running: running() };
    });
    core.route("GET", "/data/_test/pilots/agenda", () => ({ items: agenda.agenda(core.day()) }));
  }
}
