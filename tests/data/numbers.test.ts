// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  addMonths,
  lastDayOf,
  moneyRows,
  monthsOf,
  numbersOf,
  runwayOf,
  runwayWords,
  updateNumbersOf,
  weeksOf,
  type NumbersInput,
} from "../../scripts/data/numbers/count";
import { amountOf, emptyFunnel } from "../../scripts/data/numbers/index";
import { updateText } from "../../scripts/data/numbers/text";
import type { MoneyEntry } from "../../scripts/data/numbers/types";
import type { FunnelSummary } from "../../scripts/data/raise-contracts";

/**
 * The numbers, checked by hand against the raise spec's worked example (§8.2, §8.4): every
 * cell of the six-week and twelve-month views, the money rules, and the November update's
 * words character for character. Every person, firm and figure is invented.
 */

const TODAY = "2026-11-13";
const at = (day: string) => `${day}T06:00:00.000Z`;
const WALKER = { staff_id: "walk-owner", name: "Walk Owner" };

const reply = (id: string, email: string, outcome: string, day: string, taken_back = false) => ({
  reply_id: id,
  email,
  outcome,
  received_at: at(day),
  taken_back,
});

const REPLIES = [
  reply("r1", "asha@buyer1.example", "replied_positive", "2026-11-07"),
  reply("r2", "ben@buyer2.example", "replied_positive", "2026-11-10"),
  reply("r3", "cara@buyer3.example", "meeting_request", "2026-11-11"),
  reply("r4", "dev@inbox.example", "replied_positive", "2026-11-12"),
  reply("r5", "eve@buyer4.example", "replied_positive", "2026-11-12", true),
  reply("r6", "partner@fundx.example", "replied_positive", "2026-11-12"),
  reply("r7", "fay@buyer6.example", "not_interested", "2026-10-28"),
];

const entry = (
  id: string,
  domain: string,
  firm_type: string,
  joined_on: string,
  stage: string,
  free_mail = false,
) => ({ entry_id: id, firm: domain, domain, firm_type, free_mail, joined_on, stage });

const ENTRIES = [
  entry("e1", "buyer1.example", "Hedge fund", "2026-11-07", "call_held"),
  entry("e2", "buyer2.example", "Asset manager", "2026-11-10", "call_booked"),
  entry("e3", "buyer3.example", "Broker", "2026-11-11", "joined"),
  entry("e4", "inbox.example", "", "2026-11-12", "joined", true),
  entry("e5", "buyer5.example", "Family office", "2026-10-20", "pilot"),
];

const move = (entry_id: string, to: string, day: string) => ({ entry_id, to, at: at(day) });
const MOVES = [
  move("e1", "joined", "2026-11-07"),
  move("e1", "call_booked", "2026-11-09"),
  move("e1", "call_held", "2026-11-12"),
  move("e2", "call_booked", "2026-11-12"),
  move("e5", "call_booked", "2026-10-27"),
  move("e5", "call_held", "2026-10-29"),
  move("e5", "pilot", "2026-11-03"),
];

/** §5.5's first-meeting days: F11 6 Nov, F10 7 Nov, F1 9 Nov, F2 10 Nov, F3 13 Nov. */
const FIRST_MEETINGS = ["2026-11-06", "2026-11-07", "2026-11-09", "2026-11-10", "2026-11-13"];

function input(extra: Partial<NumbersInput> = {}): NumbersInput {
  return {
    today: TODAY,
    dayOf: (instant) => instant.slice(0, 10),
    replies: REPLIES,
    isInvestor: (email) => email === "partner@fundx.example",
    entries: ENTRIES,
    moves: MOVES,
    // Trimmed and in any case: "Hedge fund" and "Asset manager".
    buyerTypes: ["  hedge FUND ", "Asset manager"],
    firstMeetingDays: FIRST_MEETINGS,
    ...extra,
  };
}

/** §5.5's funnel, as far as the numbers read it. */
function funnel(): FunnelSummary {
  const base = emptyFunnel(TODAY);
  const now: Record<string, number> = {
    written: 2,
    replied: 1,
    meeting: 1,
    met: 1,
    diligence: 1,
    soft: 1,
    signed: 0,
    money_in: 1,
  };
  const reached: Record<string, number> = {
    written: 11,
    replied: 9,
    meeting: 5,
    met: 4,
    diligence: 3,
    soft: 2,
    signed: 1,
    money_in: 1,
  };
  return {
    ...base,
    firms: 12,
    not_written: 1,
    first_send_on: "2026-10-26",
    days_since_first_send: 18,
    week_from: "2026-11-09",
    first_meetings_this_week: 3,
    first_meeting_days: FIRST_MEETINGS,
    stages: base.stages.map((stage) => ({
      ...stage,
      now: now[stage.stage] ?? 0,
      reached: reached[stage.stage] ?? 0,
    })),
    money: {
      INR: { asked: { amount: 2_500_000, firms: 1 } },
      USD: { soft: { amount: 25_000, firms: 1 }, money_in: { amount: 50_000, firms: 1 } },
    },
  };
}

const money = (
  currency: "USD" | "INR",
  as_of: string,
  cash: number,
  burn: number,
  recorded_at = at(as_of),
): MoneyEntry => ({
  entry_id: `${currency}-${as_of}-${recorded_at}`,
  currency,
  as_of,
  cash,
  burn_per_month: burn,
  note: "",
  recorded_at,
  recorded_by: WALKER,
});

describe("the periods", () => {
  it("are six weeks from Monday 5 Oct to this week so far, and twelve months to this one", () => {
    const weeks = weeksOf(TODAY);
    expect(weeks.map((week) => week.from)).toEqual([
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
      "2026-11-02",
      "2026-11-09",
    ]);
    expect(weeks.map((week) => week.label)).toEqual([
      "Week of 5 Oct",
      "Week of 12 Oct",
      "Week of 19 Oct",
      "Week of 26 Oct",
      "Week of 2 Nov",
      "This week (to 13 Nov)",
    ]);
    expect(weeks[4]).toMatchObject({ to: "2026-11-08", partial: false });
    expect(weeks[5]).toMatchObject({ to: TODAY, partial: true });
    const months = monthsOf(TODAY);
    expect(months.map((month) => month.label)).toEqual([
      "Dec 2025",
      "Jan 2026",
      "Feb 2026",
      "Mar 2026",
      "Apr 2026",
      "May 2026",
      "Jun 2026",
      "Jul 2026",
      "Aug 2026",
      "Sep 2026",
      "Oct 2026",
      "Nov 2026 (to 13 Nov)",
    ]);
    expect(months[0]).toMatchObject({ key: "2025-12", from: "2025-12-01", to: "2025-12-31" });
    expect(months[1]?.to).toBe("2026-01-31");
    expect(months[2]?.to).toBe("2026-02-28");
    expect(months[11]).toMatchObject({ key: "2026-11", to: TODAY, partial: true });
    expect(addMonths("2026-01", -2)).toBe("2025-11");
    expect(lastDayOf("2028-02")).toBe("2028-02-29");
  });
});

describe("numbersOf, on the worked example", () => {
  const counted = numbersOf(input());

  it("gives every cell of the six-week view", () => {
    expect(counted.weekly).toEqual({
      yeses: [0, 0, 0, 0, 1, 3],
      firms_joined: [0, 0, 1, 0, 1, 3],
      named_buyers: [0, 0, 0, 0, 1, 1],
      calls_booked: [0, 0, 0, 1, 0, 2],
      calls_held: [0, 0, 0, 1, 0, 1],
      pilots_started: [0, 0, 0, 0, 1, 0],
      first_investor_meetings: [0, 0, 0, 0, 2, 3],
    });
    // "0 of 1" in the week of 19 Oct, "1 of 1", "1 of 3" this week.
    expect(counted.named_of.weekly).toEqual([0, 0, 1, 0, 1, 3]);
  });

  it("gives every cell of the twelve-month view", () => {
    const zeros = Array.from({ length: 10 }, () => 0);
    expect(counted.monthly).toEqual({
      yeses: [...zeros, 0, 4],
      firms_joined: [...zeros, 1, 4],
      named_buyers: [...zeros, 0, 2],
      calls_booked: [...zeros, 1, 2],
      calls_held: [...zeros, 1, 1],
      pilots_started: [...zeros, 0, 1],
      first_investor_meetings: [...zeros, 0, 5],
    });
    expect(counted.named_of.monthly).toEqual([...zeros, 1, 4]);
  });

  it("says what is signed and what has only had a call", () => {
    expect(counted.pilots).toEqual({ signed: 1, calls_held_no_pilot: 1 });
  });

  it("leaves the first-meetings row out when there is no investor list", () => {
    const without = numbersOf(input({ firstMeetingDays: null }));
    expect(Object.keys(without.weekly)).not.toContain("first_investor_meetings");
    expect(Object.keys(without.weekly)).toHaveLength(6);
  });

  it("never counts a taken-back reply, a no, or an investor's yes as a buyer's yes", () => {
    const yesOnly = numbersOf(
      input({
        replies: [
          reply("a", "asha@buyer1.example", "replied_positive", "2026-11-12", true),
          reply("b", "partner@fundx.example", "meeting_request", "2026-11-12"),
          reply("c", "x@buyer9.example", "not_interested", "2026-11-12"),
          reply("d", "y@buyer9.example", "question", "2026-11-12"),
        ],
      }),
    );
    expect(yesOnly.weekly.yeses).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe("cash, burn and runway", () => {
  it("uses the newest entry per currency, not after 35 days, and rounds down", () => {
    const rows = moneyRows(
      [
        money("INR", "2026-10-20", 900_000, 150_000),
        money("INR", "2026-11-01", 1_100_000, 150_000, "2026-11-01T05:00:00.000Z"),
        money("INR", "2026-11-01", 1_200_000, 150_000, "2026-11-02T05:00:00.000Z"),
        money("USD", "2026-10-05", 20_000, 2_500),
      ],
      TODAY,
    );
    expect(rows.map((row) => row.currency)).toEqual(["INR", "USD"]);
    expect(rows[0]).toMatchObject({ age_days: 12, used: true, runway_months: 8 });
    expect(rows[0]?.entry.cash).toBe(1_200_000);
    expect(runwayWords(rows[0]!.runway_months!)).toBe("8.0");
    expect(rows[1]).toMatchObject({ age_days: 39, used: false, runway_months: null });
    // 35 days old is still used; 36 is not.
    expect(moneyRows([money("USD", "2026-10-09", 10, 1)], TODAY)[0]?.used).toBe(true);
    expect(moneyRows([money("USD", "2026-10-08", 10, 1)], TODAY)[0]?.used).toBe(false);
  });

  it("rounds down to one decimal, never up, in whole cents", () => {
    expect(runwayOf(1_000_000, 150_000)).toBe(6.6);
    expect(runwayOf(1_200_000, 150_000)).toBe(8);
    expect(runwayOf(0.3, 0.1)).toBe(3);
    expect(runwayOf(299_999.99, 100_000)).toBe(2.9);
    expect(runwayOf(0, 5)).toBe(0);
    expect(runwayOf(10, 0)).toBeNull();
    expect(runwayWords(6.6)).toBe("6.6");
  });

  it("reads typed amounts with commas and spaces, at most two decimals", () => {
    expect(amountOf("1,200,000")).toBe(1_200_000);
    expect(amountOf("1 200 000.50")).toBe(1_200_000.5);
    expect(amountOf(150000)).toBe(150_000);
    expect(amountOf("12.345")).toBeNull();
    expect(amountOf("-5")).toBeNull();
    expect(amountOf("₹5")).toBeNull();
    expect(amountOf("")).toBeNull();
  });

  it("never adds a figure across currencies", () => {
    const numbers = updateNumbersOf(input(), "2026-11", funnel(), [
      money("INR", "2026-11-01", 1_200_000, 150_000),
      money("USD", "2026-11-10", 20_000, 2_500),
    ]);
    expect(numbers.cash.map((row) => [row.currency, row.cash, row.runway_months])).toEqual([
      ["INR", 1_200_000, 8],
      ["USD", 20_000, 8],
    ]);
    expect(numbers.raise?.money_in_amounts).toEqual({ USD: 50_000 });
  });
});

describe("the November update", () => {
  const numbers = updateNumbersOf(input(), "2026-11", funnel(), [
    money("INR", "2026-11-01", 1_200_000, 150_000),
    money("USD", "2026-10-05", 20_000, 2_500),
  ]);
  const empty = {
    opening: "",
    asks: "",
    highlights: "",
    lowlights: "",
    thanks: "",
    sign_off: "",
  };

  it("carries the month's counts, the readouts now, the round and the cash in use", () => {
    expect(numbers).toEqual({
      period: "2026-11",
      label: "November 2026",
      yeses: 4,
      firms_joined: 4,
      named_buyers: 2,
      calls_booked: 2,
      calls_held: 1,
      pilots_signed: 1,
      calls_held_no_pilot: 1,
      raise: { soft: 1, signed: 0, money_in: 1, money_in_amounts: { USD: 50_000 } },
      cash: [
        {
          currency: "INR",
          cash: 1_200_000,
          burn_per_month: 150_000,
          as_of: "2026-11-01",
          runway_months: 8,
        },
      ],
      counted_on: TODAY,
    });
  });

  it("is written word for word, asks first, with brackets for every empty part", () => {
    const text = updateText(
      { ...empty, asks: "Introductions to two hedge funds in Mumbai\n\nA CTO-level advisor\n" },
      numbers,
    );
    expect(text).toBe(
      [
        "Subject: Quantify Terminal: November 2026 update",
        "",
        "Hi {{first_name}},",
        "",
        "[One line on the month]",
        "",
        "Asks",
        "1. Introductions to two hedge funds in Mumbai",
        "2. A CTO-level advisor",
        "",
        "Numbers for November 2026, counted from our own records",
        "- People who said yes: 4",
        "- Firms that joined the waitlist: 4 (2 of them named firms of the kinds we sell to)",
        "- Calls booked: 2. Calls held: 1",
        "- Pilots signed: 1. Firms we have had a call with and no pilot yet: 1",
        "- The round so far: soft commits 1, signed 0, money in 1 ($50,000 in the bank)",
        "- Cash: ₹1,200,000 on 1 Nov 2026, monthly burn ₹150,000, runway 8.0 months",
        "",
        "Highlights",
        "[Up to three highlights]",
        "",
        "Lowlights",
        "[Up to three lowlights]",
        "",
        "Thanks",
        "[Who to thank]",
        "",
        "[Your name]",
      ].join("\n"),
    );
    expect(text.indexOf("Asks")).toBeLessThan(text.indexOf("Numbers for"));
  });

  it("writes a bracket for every part left empty, and for cash when none is in use", () => {
    const bare = updateText(
      empty,
      updateNumbersOf(input({ firstMeetingDays: null }), "2026-11", null, []),
    );
    for (const bracket of [
      "[One line on the month]",
      "[Up to three asks]",
      "[Up to three highlights]",
      "[Up to three lowlights]",
      "[Who to thank]",
      "[Your name]",
      "- Cash and burn: [type this month's on Numbers]",
    ])
      expect(bare).toContain(bracket);
    // Without the investor list the round's line is left out, not written as zero.
    expect(bare).not.toContain("The round so far");
    const filled = updateText(
      {
        opening: "A month of first calls.",
        asks: "One",
        highlights: "Two firms\nA pilot",
        lowlights: "Slow replies",
        thanks: "Our first users",
        sign_off: "Walk Owner",
      },
      numbers,
    );
    expect(filled).not.toMatch(/\[[^\]{}]+\]/);
    expect(filled).toContain("Highlights\n1. Two firms\n2. A pilot\n");
    expect(filled.endsWith("Thanks\nOur first users\n\nWalk Owner")).toBe(true);
  });

  it("writes every currency's money in, joined with “and”, never a total", () => {
    const both = updateText(empty, {
      ...numbers,
      raise: {
        soft: 1,
        signed: 0,
        money_in: 2,
        money_in_amounts: { USD: 50_000, INR: 2_500_000 },
      },
    });
    expect(both).toContain(
      "- The round so far: soft commits 1, signed 0, money in 2 (₹2,500,000 and $50,000 in the bank)",
    );
    const none = updateText(empty, {
      ...numbers,
      raise: { soft: 0, signed: 0, money_in: 0, money_in_amounts: {} },
    });
    expect(none).toContain("- The round so far: soft commits 0, signed 0, money in 0\n");
  });
});
