// @vitest-environment node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import { SECRET_MESSAGE } from "../../scripts/data/guard";
import { funnelOf, type FunnelFirm } from "../../scripts/data/investors/funnel";
import { SENTENCES, roundChanges } from "../../scripts/data/investors/raise";
import { investorIdOf } from "../../scripts/data/investors/types";
import type { FunnelSummary } from "../../scripts/data/raise-contracts";
import { Scripted, peopleCsv, readyToSend, sendLive } from "./leads-kit";
import { WALKER, codeOf, startStack, until, type RawAnswer, type Stack } from "./helpers";

/**
 * The raise batch's half of Investors (raise spec §5): the funnel's arithmetic on the
 * spec's twelve invented firms, the format-1 → format-2 migration, the qualification, the
 * introduction, the wave, the offer deadline, the deck link and the round with every
 * refusal, offer deadlines in Due, and what `agenda:investors` and `search:investors`
 * give. Every firm and person is invented, on `.example`.
 */

type Body = Record<string, unknown>;

// ------------------------------------------------------------------ the worked example (§5.5)

const at = (day: string) => `${day}T06:00:00.000Z`;

function firm(
  n: number,
  name: string,
  moves: [FunnelFirm["stage"], string][],
  extra: Partial<FunnelFirm> = {},
): FunnelFirm {
  const last = moves[moves.length - 1];
  return {
    investor_id: `f${n}`,
    firm: name,
    stage: last ? last[0] : "not_written",
    stage_since: last ? at(last[1]) : at("2026-10-20"),
    next_step: "",
    next_step_on: null,
    passed_reason: "",
    wave: "Wave 1",
    warm: false,
    latest: null,
    moves: moves.map(([to, day]) => ({ to, at: at(day) })),
    ...extra,
  };
}

const TWELVE: FunnelFirm[] = [
  firm(
    1,
    "F1 Alpha",
    [
      ["written", "2026-11-06"],
      ["replied", "2026-11-07"],
      ["meeting", "2026-11-09"],
      ["met", "2026-11-11"],
      ["diligence", "2026-11-12"],
    ],
    { warm: true, latest: { state: "asked", amount: 2_500_000, currency: "INR" } },
  ),
  firm(2, "F2 Beta", [
    ["written", "2026-11-06"],
    ["replied", "2026-11-08"],
    ["meeting", "2026-11-10"],
    ["met", "2026-11-12"],
  ]),
  firm(3, "F3 Gamma", [
    ["written", "2026-11-06"],
    ["replied", "2026-11-09"],
    ["meeting", "2026-11-13"],
  ]),
  firm(
    4,
    "F4 Delta",
    [
      ["written", "2026-11-06"],
      ["replied", "2026-11-07"],
      ["passed", "2026-11-10"],
    ],
    { passed_reason: "too_early" },
  ),
  firm(5, "F5 Epsilon", [
    ["written", "2026-11-06"],
    ["replied", "2026-11-08"],
    ["set_aside", "2026-11-08"],
  ]),
  firm(6, "F6 Zeta", [["written", "2026-11-06"]]),
  firm(7, "F7 Eta", [["written", "2026-11-10"]], { wave: "Wave 2" }),
  firm(
    8,
    "F8 Theta",
    [
      ["written", "2026-11-10"],
      ["replied", "2026-11-11"],
      ["passed", "2026-11-12"],
    ],
    { wave: "Wave 2", passed_reason: "not_sector" },
  ),
  firm(9, "F9 Iota", [], { wave: "" }),
  firm(
    10,
    "F10 Kappa",
    [
      ["written", "2026-11-06"],
      ["replied", "2026-11-06"],
      ["meeting", "2026-11-07"],
      ["met", "2026-11-08"],
      ["soft", "2026-11-12"],
    ],
    { warm: true, latest: { state: "soft", amount: 25_000, currency: "USD" } },
  ),
  firm(
    11,
    "F11 Lambda",
    [
      ["written", "2026-11-06"],
      ["replied", "2026-11-06"],
      ["meeting", "2026-11-06"],
      ["met", "2026-11-07"],
      ["soft", "2026-11-09"],
      ["signed", "2026-11-10"],
      ["money_in", "2026-11-12"],
    ],
    { warm: true, latest: { state: "money_in", amount: 50_000, currency: "USD" } },
  ),
  firm(
    12,
    "F12 Mu",
    [
      ["written", "2026-10-26"],
      ["replied", "2026-10-28"],
    ],
    { wave: "", next_step: "Book a meeting", next_step_on: "2026-10-29" },
  ),
];

describe("the funnel, worked by hand (§5.5)", () => {
  const funnel: FunnelSummary = funnelOf({
    firms: TWELVE,
    today: "2026-11-13",
    first_send_at: at("2026-10-26"),
  });

  it("counts the firms, the first send and the first meetings this week", () => {
    expect(funnel).toMatchObject({
      today: "2026-11-13",
      week_from: "2026-11-09",
      firms: 12,
      not_written: 1,
      first_send_on: "2026-10-26",
      days_since_first_send: 18,
      first_meetings_this_week: 3,
      first_meeting_days: ["2026-11-06", "2026-11-07", "2026-11-09", "2026-11-10", "2026-11-13"],
    });
  });

  it("gives each stage its firms now, reached it or later, and of the stage before", () => {
    expect(funnel.stages.map((row) => [row.stage, row.now, row.reached, row.of])).toEqual([
      ["written", 2, 11, 12],
      ["replied", 1, 9, 11],
      ["meeting", 1, 5, 9],
      ["met", 1, 4, 5],
      ["diligence", 1, 3, 4],
      ["soft", 1, 2, 3],
      ["signed", 0, 1, 2],
      ["money_in", 1, 1, 1],
    ]);
    expect(funnel.exits).toEqual([
      { stage: "set_aside", now: 1 },
      { stage: "passed", now: 2 },
      { stage: "do_not_pitch", now: 0 },
    ]);
    // Now, plus Not written to yet, plus the exits, is every firm.
    const now = funnel.stages.reduce((sum, row) => sum + row.now, 0);
    const exits = funnel.exits.reduce((sum, row) => sum + row.now, 0);
    expect(now + funnel.not_written + exits).toBe(12);
  });

  it("keeps money per currency and per state, never across", () => {
    expect(funnel.money).toEqual({
      INR: { asked: { amount: 2_500_000, firms: 1 } },
      USD: { soft: { amount: 25_000, firms: 1 }, money_in: { amount: 50_000, firms: 1 } },
    });
  });

  it("tallies the pass reasons, most first, then by label", () => {
    expect(funnel.passed).toBe(2);
    expect(funnel.pass_reasons).toEqual([
      { reason: "Not our sector", firms: 1 },
      { reason: "Too early", firms: 1 },
    ]);
  });

  it("gives time in stage with the 14-day stale rule", () => {
    expect(funnel.stale_days).toBe(14);
    expect(
      funnel.time_in_stage.map((row) => [row.stage, row.firms, row.stale, row.longest_days]),
    ).toEqual([
      ["written", 2, 0, 7],
      ["replied", 1, 1, 16],
      ["meeting", 1, 0, 0],
      ["met", 1, 0, 1],
      ["diligence", 1, 0, 1],
      ["soft", 1, 0, 1],
      ["signed", 0, 0, 0],
    ]);
    expect(funnel.stale).toEqual([
      {
        investor_id: "f12",
        firm: "F12 Mu",
        stage: "replied",
        days: 16,
        next_step: "Book a meeting",
        next_step_on: "2026-10-29",
      },
    ]);
  });

  it("splits by wave and by introduction, each column adding up to the stage table", () => {
    const row = (split: FunnelSummary["by_wave"][number]) => [
      split.label,
      split.firms,
      split.written,
      split.replied,
      split.meeting,
      split.met,
      split.soft_or_later,
    ];
    expect(funnel.by_wave.map(row)).toEqual([
      ["Wave 1", 8, 8, 7, 5, 4, 2],
      ["Wave 2", 2, 2, 1, 0, 0, 0],
      ["No wave", 2, 1, 1, 0, 0, 0],
    ]);
    expect(funnel.by_wave.map((split) => split.key)).toEqual(["Wave 1", "Wave 2", ""]);
    expect(funnel.by_intro.map(row)).toEqual([
      ["Introduced", 3, 3, 3, 3, 3, 2],
      ["Not introduced", 9, 8, 6, 2, 1, 0],
    ]);
    expect(funnel.by_intro.map((split) => split.key)).toEqual(["warm", "cold"]);
    const sum = (key: "written" | "replied" | "meeting" | "met") =>
      funnel.by_wave.reduce((total, split) => total + split[key], 0);
    expect([sum("written"), sum("replied"), sum("meeting"), sum("met")]).toEqual([11, 9, 5, 4]);
  });

  it("says nothing of a target, a goal or a share", () => {
    const text = JSON.stringify(funnel);
    expect(text).not.toMatch(/target|goal|%/i);
  });

  it("is empty but whole with no firms and no send", () => {
    const empty = funnelOf({ firms: [], today: "2026-11-13", first_send_at: null });
    expect(empty).toMatchObject({
      firms: 0,
      first_send_on: null,
      days_since_first_send: null,
      first_meetings_this_week: 0,
      money: {},
      by_wave: [],
    });
    expect(empty.stages.every((stage) => stage.now === 0 && stage.reached === 0)).toBe(true);
    expect(empty.by_intro.map((split) => split.firms)).toEqual([0, 0]);
  });
});

describe("the round's changes, in words", () => {
  it("names what the first save set, then only what changed", () => {
    const first = {
      round_id: "r",
      name: "Pre-seed",
      instrument: "iSAFE" as const,
      cap: { amount: 5_000_000, currency: "USD" as const, basis: "post_money" as const },
      discount_percent: 20,
      mfn: true,
      minimum_cheque: null,
      opened_on: null,
      lead: "no" as const,
      lead_investor_id: null,
      notes: "",
      updated_at: "2026-11-13T06:00:00.000Z",
      updated_by: WALKER,
    };
    expect(roundChanges(null, first)).toEqual([
      "Name",
      "Instrument",
      "Valuation cap",
      "Discount",
      "Most favoured nation",
    ]);
    expect(roundChanges(first, { ...first, discount_percent: 15, updated_at: "later" })).toEqual([
      "Discount",
    ]);
  });
});

// ------------------------------------------------------------------ on the real stack

const SENT = [1, 2].map((n) => ({
  email: `partner${n}@fund${n}.example`,
  first: "Asha",
  last: `Rao${n}`,
  company: `Walk Fund ${n}`,
}));

const INVESTOR_CSV = [
  "Email,First Name,Last Name,Title,Company,Tier,Email Kind",
  "partner1@fund1.example,Asha,Rao1,Partner,Walk Fund 1,1,named",
  "analyst1@fund1.example,Dev,Menon,Analyst,Walk Fund 1,1,named",
  "partner2@fund2.example,Asha,Rao2,Partner,Walk Fund 2,2,named",
  "gp@seedhouse.example,Isha,Bosewala,General partner,Seed House,1,named",
  "gp@earlyfund.example,Nina,Iyer,General partner,Early Fund,2,named",
  "partner@ridgecap.example,Omar,Khan,Partner,Ridge Capital,2,named",
].join("\n");

const id = (key: string) => investorIdOf(key);
const today = () => localDay(new Date());

let stack: Stack;
const provider = new Scripted();

const post = (path: string, body: Body): Promise<RawAnswer> =>
  stack.ask("POST", path, { by: WALKER, ...body });
const message = (answer: RawAnswer): string =>
  String((answer.json?.error as { message?: string } | undefined)?.message ?? "");

async function refusedWith(
  answer: Promise<RawAnswer>,
  sentence: string,
  status = 400,
  code = "invalid",
): Promise<void> {
  const got = await answer;
  expect([got.status, codeOf(got), message(got)]).toEqual([status, code, sentence]);
}

async function investor(key: string): Promise<Body> {
  const answer = await stack.ask("GET", `/data/investors/${id(key)}`);
  expect(answer.status).toBe(200);
  return answer.json!.investor as Body;
}

beforeAll(async () => {
  // U1's modules alone (raise spec §3.2): no contacts and no files (which gives `packs`), so
  // the introduction keeps no contact and the detail answers no introducers and no data
  // room. raise-merged.test.ts checks the introducer picker and the data room for real.
  stack = await startStack({
    liveProvider: () => provider,
    modules: ["leads", "replies", "waitlist", "investors", "dates"],
  });
  await readyToSend(stack.engine);
  const walk = stack.engine.importList({
    name: "Walk 01",
    file_name: "walk-01.csv",
    text: peopleCsv(SENT),
  }).list.id;
  await sendLive(stack.engine, walk, "Walk live 01");
  const list = stack.engine.importList({
    name: "Walk investors",
    file_name: "walk-investors.csv",
    text: `${INVESTOR_CSV}\n`,
  }).list.id;
  await until(async () => {
    const setup = (await stack.ask("GET", "/data/investors/setup")).json!;
    return (setup.lists as { id: string }[]).some((item) => item.id === list);
  }, "the investor list to be seen");
  const chosen = await post("/data/investors/setup", { list_ids: [list] });
  expect(chosen.json!.firms).toBe(5);
}, 60_000);
afterAll(() => stack.stop());

describe("qualification (Qualify)", () => {
  const path = () => `/data/investors/${id("fund1.example")}/profile`;

  it("refuses each wrong value with its sentence", async () => {
    await refusedWith(
      post(path(), { cheque_min: "lots", cheque_currency: "USD" }),
      SENTENCES.cheque,
    );
    await refusedWith(
      post(path(), { cheque_min: "25000", cheque_currency: "" }),
      SENTENCES.chequeCurrency,
    );
    await refusedWith(
      post(path(), { cheque_min: "100000", cheque_max: "25000", cheque_currency: "USD" }),
      SENTENCES.chequeOrder,
    );
    await refusedWith(post(path(), { stages: ["growth"] }), SENTENCES.fromList);
    await refusedWith(post(path(), { geography: ["mars"] }), SENTENCES.fromList);
    await refusedWith(post(path(), { lead: "boss" }), SENTENCES.fromList);
    await refusedWith(post(path(), { residency: "moon" }), SENTENCES.fromList);
    await refusedWith(post(path(), { india_ok: "maybe" }), SENTENCES.fromList);
    await refusedWith(
      post(path(), { sectors: "a, b, c, d, e, f, g, h, i, j, k" }),
      SENTENCES.sectors,
    );
    await refusedWith(
      post(path(), { conflict: "xkeysib-0000000000000000" }),
      SECRET_MESSAGE,
      400,
      "secret",
    );
  });

  it("keeps a good profile, with repeats dropped and blank meaning not known", async () => {
    // "From $25,000": one bound is enough.
    const one = await post(path(), { cheque_min: "25000", cheque_currency: "INR" });
    expect((one.json!.investor as Body).profile).toMatchObject({
      cheque: { min: 25_000, max: null, currency: "INR" },
      stages: [],
      lead: "",
    });
    const saved = await post(path(), {
      cheque_min: "25,000",
      cheque_max: "100000",
      cheque_currency: "USD",
      stages: ["seed", "pre_seed", "seed"],
      sectors: "fintech, data, Fintech, , AI",
      geography: ["us", "india"],
      lead: "lead",
      conflict: "",
      residency: "non_resident",
      india_ok: "yes",
    });
    expect(saved.status).toBe(200);
    expect((saved.json!.investor as Body).profile).toEqual({
      cheque: { min: 25_000, max: 100_000, currency: "USD" },
      stages: ["pre_seed", "seed"],
      sectors: ["fintech", "data", "AI"],
      geography: ["india", "us"],
      lead: "lead",
      conflict: "",
      residency: "non_resident",
      india_ok: "yes",
    });
    const events = (await stack.ask("GET", `/data/investors/${id("fund1.example")}`)).json!
      .events as { kind: string; title: string }[];
    expect(events[0]).toMatchObject({ kind: "profile", title: "Qualification changed" });
  });
});

describe("the introduction", () => {
  const path = () => `/data/investors/${id("fund2.example")}/intro`;

  it("refuses each wrong value with its sentence", async () => {
    await refusedWith(post(path(), { status: "maybe" }), SENTENCES.introStatus);
    for (const status of ["to_ask", "asked", "made"])
      await refusedWith(post(path(), { status, introducer: "" }), SENTENCES.introducer);
    await refusedWith(
      post(path(), { status: "made", introducer: "Walk Introducer", on: addDays(today(), 1) }),
      SENTENCES.future,
    );
    await refusedWith(
      post(path(), { status: "made", introducer: "Walk Introducer", on: "2026-02-30" }),
      SENTENCES.notADay,
    );
  });

  it("keeps a Made introduction (warm), today by default, and no contact without Contacts", async () => {
    const before = (await stack.ask("GET", "/data/raise/funnel")).json!.funnel as FunnelSummary;
    const saved = await post(path(), {
      status: "made",
      introducer: "Walk Introducer",
      contact_id: "c-1",
      on: "",
    });
    expect(saved.status).toBe(200);
    expect((saved.json!.investor as Body).intro).toEqual({
      status: "made",
      introducer: "Walk Introducer",
      contact_id: null,
      on: today(),
    });
    const detail = (await stack.ask("GET", `/data/investors/${id("fund2.example")}`)).json!;
    expect((detail.events as { kind: string; title: string }[])[0]).toMatchObject({
      kind: "intro",
      title: "Introduction: Made",
    });
    const row = (
      (await stack.ask("GET", "/data/investors?intro=warm")).json!.investors as Body[]
    ).map((item) => [item.firm, item.warm]);
    expect(row).toEqual([["Walk Fund 2", true]]);
    const cold = (await stack.ask("GET", "/data/investors?intro=cold")).json!;
    expect(cold.total).toBe(4);
    const after = (await stack.ask("GET", "/data/raise/funnel")).json!.funnel as FunnelSummary;
    expect(after.by_intro[0]!.firms).toBe(before.by_intro[0]!.firms + 1);
  });

  it("answers no introducers and no data room where Contacts and packs are not here", async () => {
    const detail = (await stack.ask("GET", `/data/investors/${id("fund2.example")}`)).json!;
    expect(detail.introducers).toBeNull();
    expect(detail.data_room).toBeNull();
    expect(detail.investor).toMatchObject({ last_met_at: null });
  });
});

describe("the wave, the offer deadline and the deck link", () => {
  const update = (key: string, field: string, value: string) =>
    post(`/data/investors/${id(key)}/update`, { field, value });

  it("refuses a past deadline, a day that is not one, and a link that is not https", async () => {
    await refusedWith(
      update("seedhouse.example", "offer_deadline", addDays(today(), -1)),
      SENTENCES.past,
    );
    await refusedWith(update("seedhouse.example", "offer_deadline", "soon"), SENTENCES.notADay);
    await refusedWith(
      update("seedhouse.example", "deck_link", "http://deck.example/x"),
      SENTENCES.deckLink,
    );
    await refusedWith(
      update("seedhouse.example", "deck_link", "deck.example/x"),
      SENTENCES.deckLink,
    );
  });

  it("keeps each, as a raise line on the activity, and clears each with a blank", async () => {
    const wave = await update("seedhouse.example", "wave", "  Wave 2 ");
    expect((wave.json!.investor as Body).wave).toBe("Wave 2");
    const link = await update("seedhouse.example", "deck_link", "https://deck.example/d/walk");
    expect((link.json!.investor as Body).deck_link).toBe("https://deck.example/d/walk");
    const deadline = await update("seedhouse.example", "offer_deadline", today());
    expect((deadline.json!.investor as Body).offer_deadline).toBe(today());
    const events = (await stack.ask("GET", `/data/investors/${id("seedhouse.example")}`)).json!
      .events as { kind: string; detail: string }[];
    expect(events.slice(0, 3).map((event) => event.kind)).toEqual(["raise", "raise", "raise"]);
    for (const field of ["wave", "deck_link", "offer_deadline"]) {
      const cleared = await update("seedhouse.example", field, "");
      expect((cleared.json!.investor as Body)[field]).toEqual(
        field === "offer_deadline" ? null : "",
      );
    }
  });

  it("sets the wave on exactly the firms a search shows, on every page", async () => {
    const setWave = await post("/data/investors/wave", {
      stage: "",
      q: "walk fund",
      wave_filter: "",
      intro: "",
      wave: "Wave 1",
    });
    expect(setWave.json!.changed).toBe(2);
    const page = (await stack.ask("GET", `/data/investors?wave=${encodeURIComponent("Wave 1")}`))
      .json!;
    expect((page.investors as Body[]).map((row) => row.firm).sort()).toEqual([
      "Walk Fund 1",
      "Walk Fund 2",
    ]);
    const none = (await stack.ask("GET", "/data/investors?wave=-")).json!;
    expect(none.total).toBe(3);
    expect(page.waves).toEqual([
      { label: "Wave 1", firms: 2 },
      { label: "", firms: 3 },
    ]);
    // Clearing for one stage tab only touches that tab's firms.
    const cleared = await post("/data/investors/wave", {
      stage: "not_written",
      q: "walk fund",
      wave_filter: "Wave 1",
      intro: "",
      wave: "",
    });
    expect(cleared.json!.changed).toBe(0);
    expect((await investor("fund1.example")).wave).toBe("Wave 1");
  });
});

describe("offer deadlines in Due", () => {
  const due = async () =>
    ((await stack.ask("GET", "/data/overview")).json!.due as { key: string; title: string }[]) ??
    [];
  const update = (key: string, field: string, value: string) =>
    post(`/data/investors/${id(key)}/update`, { field, value });

  it("joins Due three days ahead, not four, and never at Passed", async () => {
    const early = id("earlyfund.example");
    await update("earlyfund.example", "offer_deadline", addDays(today(), 3));
    expect(await due()).toContainEqual(
      expect.objectContaining({
        key: `investor:${early}:offer`,
        kind: "investor",
        title: "Offer deadline: Early Fund",
        sub: "Not written to yet",
        due_on: addDays(today(), 3),
        href: `/data/investors/${early}`,
      }),
    );
    await update("earlyfund.example", "offer_deadline", addDays(today(), 4));
    expect((await due()).some((item) => item.key === `investor:${early}:offer`)).toBe(false);
    await update("earlyfund.example", "offer_deadline", addDays(today(), 2));
    await post(`/data/investors/${early}/stage`, { stage: "passed", passed_reason: "too_early" });
    expect((await due()).some((item) => item.key === `investor:${early}:offer`)).toBe(false);
  });

  it("gives the overview its raise block: firms now at Replied through Money in", async () => {
    const overview = (await stack.ask("GET", "/data/overview")).json!;
    const raise = overview.raise as {
      stages: { stage: string }[];
      first_meetings_this_week: number;
    };
    expect(raise.stages.map((row) => row.stage)).toEqual([
      "replied",
      "meeting",
      "met",
      "diligence",
      "soft",
      "signed",
      "money_in",
    ]);
    expect(raise.first_meetings_this_week).toBe(0);
  });
});

describe("agenda:investors and search:investors", () => {
  it("lists the next step and the offer deadline with their keys and plain words", async () => {
    const ridge = id("ridgecap.example");
    await post(`/data/investors/${ridge}/stage`, {
      stage: "replied",
      next_step: "Send the deck",
      next_step_on: addDays(today(), 2),
    });
    await post(`/data/investors/${ridge}/update`, {
      field: "offer_deadline",
      value: addDays(today(), 10),
    });
    const items = (await stack.ask("GET", "/data/_test/raise/agenda")).json!.items as Body[];
    expect(items).toContainEqual({
      key: `investor:${ridge}`,
      kind: "investor",
      title: "Send the deck · Ridge Capital",
      plain: "Investor next step",
      sub: "Replied",
      on: addDays(today(), 2),
      remind_days: [0],
      href: `/data/investors/${ridge}`,
    });
    expect(items).toContainEqual({
      key: `offer_deadline:${ridge}`,
      kind: "offer_deadline",
      title: "Offer deadline: Ridge Capital",
      plain: "Offer deadline",
      sub: "Replied",
      on: addDays(today(), 10),
      remind_days: [3, 0],
      href: `/data/investors/${ridge}`,
    });
    // Passed firms owe nothing.
    expect(items.some((item) => String(item.key).includes(id("earlyfund.example")))).toBe(false);
  });

  it("finds a firm by a person's invented surname, its wave or its sectors", async () => {
    const search = async (q: string) =>
      (await stack.ask("GET", `/data/_test/raise/search?q=${encodeURIComponent(q)}`)).json!
        .groups as { kind: string; count: number; hits: Body[] }[];
    const found = await search("bosewala");
    expect(found).toEqual([
      {
        kind: "investor",
        count: 1,
        hits: [
          {
            kind: "investor",
            id: id("seedhouse.example"),
            title: "Seed House",
            subtitle: "Not written to yet · seedhouse.example",
            snippet: "",
            href: `/data/investors/${id("seedhouse.example")}`,
          },
        ],
      },
    ]);
    expect((await search("fintech"))[0]!.hits.map((hit) => hit.title)).toEqual(["Walk Fund 1"]);
    expect((await search("wave 1"))[0]!.count).toBe(2);
    expect((await search("walk introducer"))[0]!.hits.map((hit) => hit.title)).toEqual([
      "Walk Fund 2",
    ]);
    expect(await search("nobody-here")).toEqual([{ kind: "investor", count: 0, hits: [] }]);
  });
});

describe("the round", () => {
  const save = (body: Body) =>
    post("/data/raise/round", {
      name: "",
      instrument: "iSAFE",
      cap_amount: "5000000",
      cap_currency: "USD",
      cap_basis: "post_money",
      discount: "20",
      mfn: "on",
      minimum_amount: "25000",
      minimum_currency: "USD",
      opened_on: "",
      lead: "no",
      lead_investor_id: "",
      notes: "",
      ...body,
    });

  it("starts with none, and the lead picker puts Soft commit and later first", async () => {
    await post(`/data/investors/${id("fund2.example")}/stage`, {
      stage: "soft",
      next_step: "Send the papers",
      next_step_on: today(),
    });
    const page = (await stack.ask("GET", "/data/raise/round")).json!;
    expect(page.round).toBeNull();
    expect(page.history).toEqual([]);
    const firms = page.firms as { firm: string; stage: string }[];
    expect(firms[0]).toMatchObject({ firm: "Walk Fund 2", stage: "soft" });
    expect(firms.slice(1).map((item) => item.firm)).toEqual([
      "Early Fund",
      "Ridge Capital",
      "Seed House",
      "Walk Fund 1",
    ]);
  });

  it("refuses each wrong term with its sentence", async () => {
    await refusedWith(save({ instrument: "Bond" }), SENTENCES.instrument);
    await refusedWith(save({ cap_amount: "five million" }), SENTENCES.cap);
    for (const discount of ["0", "51", "12.25", "ten", "-5"])
      await refusedWith(save({ discount }), SENTENCES.discount);
    await refusedWith(save({ minimum_amount: "some" }), SENTENCES.minimum);
    await refusedWith(save({ opened_on: "2026-13-01" }), SENTENCES.notADay);
    await refusedWith(save({ lead: "perhaps" }), SENTENCES.fromList);
    await refusedWith(
      save({ lead: "yes", lead_investor_id: "0".repeat(32) }),
      SENTENCES.leadFirm,
      404,
      "not_found",
    );
    await refusedWith(save({ notes: "xkeysib-0000000000000" }), SECRET_MESSAGE, 400, "secret");
  });

  it("keeps the terms, with no target in them, and the history of each change", async () => {
    const saved = await save({});
    expect(saved.status).toBe(200);
    const round = saved.json!.round as Body;
    expect(round).toMatchObject({
      name: "Pre-seed",
      instrument: "iSAFE",
      cap: { amount: 5_000_000, currency: "USD", basis: "post_money" },
      discount_percent: 20,
      mfn: true,
      minimum_cheque: { amount: 25_000, currency: "USD" },
      opened_on: null,
      lead: "no",
      lead_investor_id: null,
      notes: "",
      updated_by: WALKER,
    });
    expect(Object.keys(round).some((key) => /target|goal|range/i.test(key))).toBe(false);
    const fund2 = id("fund2.example");
    const again = await save({ lead: "yes", lead_investor_id: fund2, discount: "" });
    expect(again.json!.round).toMatchObject({
      round_id: round.round_id,
      lead: "yes",
      lead_investor_id: fund2,
      discount_percent: null,
    });
    // A lead firm is kept only with "We have a lead".
    const noLead = await save({ lead: "no", lead_investor_id: fund2 });
    expect((noLead.json!.round as Body).lead_investor_id).toBeNull();
    const page = (await stack.ask("GET", "/data/raise/round")).json!;
    const history = page.history as { by: Body; changed: string[] }[];
    expect(history.map((row) => row.changed)).toEqual([
      ["Discount", "Lead", "Lead firm"],
      ["Discount", "Lead", "Lead firm"],
      [
        "Name",
        "Instrument",
        "Valuation cap",
        "Discount",
        "Most favoured nation",
        "Smallest cheque",
      ],
    ]);
    expect(history[0]!.by).toEqual(WALKER);
    const file = JSON.parse(
      readFileSync(join(stack.dir, "data", "investors", "round.json"), "utf8"),
    ) as Body;
    expect(file.format).toBe(1);
    expect(
      readFileSync(join(stack.dir, "data", "investors", "round-history.jsonl"), "utf8")
        .trim()
        .split("\n"),
    ).toHaveLength(3);
  });
});

describe("the CSV", () => {
  it("keeps its columns in order and appends the raise's, with no address", async () => {
    const started = await post("/data/builds", { kind: "investors_csv" });
    const buildId = (started.json!.build as { build_id: string }).build_id;
    await until(async () => {
      const build = (await stack.ask("GET", `/data/builds/${buildId}`)).json!.build as Body;
      return build.state === "ready";
    }, "the CSV");
    const bytes = await stack.raw(stack.socket, "GET", `/data/builds/${buildId}/bytes`);
    const text = bytes.bytes.toString("utf8");
    const [header = "", ...lines] = text.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
    expect(header).toBe(
      "firm,domain,stage,since,contact,contact_title,people,last_written,last_mailing,replied,next_step,next_step_on,set_aside_until,passed_because,amount_state,amount,currency,instrument,owner,wave,introduced,intro_status,introducer,intro_on,cheque_min,cheque_max,cheque_currency,stage_focus,sectors,geography,lead_or_follow,conflict,residency,can_invest_india,last_replied,last_met,offer_deadline,deck_link",
    );
    expect(lines).toHaveLength(5);
    expect(text).not.toContain("@");
    expect(lines.find((line) => line.startsWith("Walk Fund 2"))).toContain(
      "Wave 1,Yes,Made,Walk Introducer",
    );
  });
});

// ------------------------------------------------------------------ the migration

describe("format 1 to format 2", () => {
  it("reads a format-1 firm with the defaults and every old field, and saves it as format 2", async () => {
    const own = await startStack();
    try {
      const firmKey = "oldfund.example";
      const old = {
        investor_id: investorIdOf(firmKey),
        firm_key: firmKey,
        firm: "Old Fund",
        domain: firmKey,
        list_ids: [],
        list_values: { Tier: "1" },
        people: [{ email: "gp@oldfund.example", name: "Ira Old", title: "Partner", from: "list" }],
        stage: "replied",
        stage_since: "2026-11-01T06:00:00.000Z",
        next_step: "Book a meeting",
        next_step_on: "2026-11-20",
        set_aside_until: null,
        passed_reason: "",
        owner: "Walk Owner",
        amounts: [
          {
            amount_id: "a-1",
            state: "asked",
            amount: 25_000,
            currency: "USD",
            instrument: "SAFE",
            on: "2026-11-02",
            by: WALKER,
            at: "2026-11-02T06:00:00.000Z",
          },
        ],
        touched: true,
        created_at: "2026-10-30T06:00:00.000Z",
        updated_at: "2026-11-02T06:00:00.000Z",
      };
      const folder = join(own.dir, "data", "investors");
      mkdirSync(folder, { recursive: true });
      const file = join(folder, "firms.json");
      writeFileSync(file, JSON.stringify({ format: 1, firms: [old] }));
      // The worker opens the folder again: it reads the file as a fresh start would.
      await own.ask("POST", "/data/_test/crash", { by: WALKER });
      await own.data.ready(20_000);
      const read = (await own.ask("GET", `/data/investors/${old.investor_id}`)).json!
        .investor as Body;
      for (const [key, value] of Object.entries(old)) expect(read[key]).toEqual(value);
      expect(read).toMatchObject({
        profile: {
          cheque: null,
          stages: [],
          sectors: [],
          geography: [],
          lead: "",
          conflict: "",
          residency: "",
          india_ok: "",
        },
        intro: { status: "none", introducer: "", contact_id: null, on: null },
        wave: "",
        offer_deadline: null,
        deck_link: "",
      });
      // Nothing is written at start.
      expect((JSON.parse(readFileSync(file, "utf8")) as Body).format).toBe(1);
      const saved = await own.ask("POST", `/data/investors/${old.investor_id}/profile`, {
        by: WALKER,
        sectors: "fintech",
      });
      expect(saved.status).toBe(200);
      const after = JSON.parse(readFileSync(file, "utf8")) as { format: number; firms: Body[] };
      expect(after.format).toBe(2);
      const stored = after.firms[0]!;
      for (const [key, value] of Object.entries(old))
        if (key !== "updated_at") expect(stored[key]).toEqual(value);
      expect((stored.profile as Body).sectors).toEqual(["fintech"]);
    } finally {
      await own.stop();
    }
  }, 60_000);
});
