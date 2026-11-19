// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  standInDutyRules,
  tdsDepositDue,
  type DutyRuleKey,
  type DutyStored,
} from "../../scripts/data/duties-contracts";
import { TDS_TABLE, tdsLine, type RuleAsk, type TdsBill } from "../../scripts/data/money/tds";
import { WALKER, codeOf, startStack, type RawAnswer, type Stack } from "./helpers";

/**
 * Tax deducted on Indian vendors' bills (ws-notes/duties/spec.md §5.4): every row of the
 * year-to-date table with its numbers exactly, the professional-fee limit unconfirmed (both
 * readings, nothing worked out) and confirmed, the deposit days, and, through the service, the
 * line on a real bill and a deduction above the amount before GST refused. Every vendor is
 * invented ("Walk Legal LLP", "Walk Build Co").
 */

const CONFIRMED: Partial<Record<DutyRuleKey, DutyStored>> = {
  "tds-professional-year": { reading: 0, confirmed: { name: "Walk CA", on: "2026-11-14" } },
};
const rulesWith = (stored: Partial<Record<DutyRuleKey, DutyStored>> = {}): RuleAsk => {
  const service = standInDutyRules(() => "2026-11-19", stored);
  return (key) => service.state(key);
};

let n = 0;
const bill = (invoiceOn: string, rupees: number, change: Partial<TdsBill> = {}): TdsBill => {
  n += 1;
  return {
    bill_id: `b${n}`,
    invoice_on: invoiceOn,
    created_at: `2026-11-19T00:00:${String(n).padStart(2, "0")}.000Z`,
    taxable_minor: rupees * 100,
    currency: "INR",
    cancelled: false,
    kind: "",
    ...change,
  };
};

/** The line as the page prints it: the comparison, then the hint. */
function lineOn(
  bills: TdsBill[],
  kind: Parameters<typeof tdsLine>[0]["kind"],
  rules: RuleAsk = rulesWith(CONFIRMED),
) {
  const last = bills[bills.length - 1]!;
  const line = tdsLine({ bill: last, bills, kind, resident: true, rules });
  return {
    line,
    text: line ? [line.words, line.hint_words].filter(Boolean).join(" ") : "",
  };
}

describe("§5.4's year-to-date table, by hand", () => {
  const legal = [bill("2026-06-10", 20_000), bill("2026-09-05", 25_000)];
  const third = bill("2026-11-12", 10_000);

  it("Walk Legal LLP, professional, limit confirmed at ₹50,000: below, then over with this bill", () => {
    expect(lineOn(legal, "professional").text).toBe(
      "₹45,000 of ₹50,000 in 2026-27: below the limit.",
    );
    const over = lineOn([...legal, third], "professional");
    expect(over.text).toBe(
      "₹55,000 in 2026-27: over the ₹50,000 limit with this bill. 10 per cent of this bill is ₹1,000; of the year so far, ₹5,500. Your CA decides which applies.",
    );
    expect(over.line?.ytd_minor).toBe(5_500_000);
    expect(over.line?.rule).toMatchObject({
      key: "tds-professional-year",
      confirmed_by: "Walk CA",
      usable: true,
      readings: [],
    });
    expect(over.line).toMatchObject({ section: "393(1), Table 6(iii)", code: "1027" });
  });

  it("the same, limit not confirmed: the sum alone, both readings, nothing worked out", () => {
    const silent = lineOn([...legal, third], "professional", rulesWith());
    expect(silent.text).toBe("₹55,000 billed in 2026-27.");
    expect(silent.line?.hint_words).toBe("");
    expect(silent.line?.rule).toMatchObject({
      key: "tds-professional-year",
      usable: false,
      confirm_with: "CA",
      readings: ["₹50,000", "₹30,000"],
    });
  });

  it("exactly ₹50,000 is at the limit, not over it", () => {
    expect(
      lineOn([bill("2026-06-10", 20_000), bill("2026-07-01", 30_000)], "professional").text,
    ).toBe("₹50,000 of ₹50,000 in 2026-27: at the limit, not over it.");
  });

  it("a later bill once the limit is passed says since which bill", () => {
    const after = lineOn([...legal, third, bill("2026-11-15", 5_000)], "professional");
    expect(after.line?.words).toBe(
      "₹60,000 in 2026-27: over the ₹50,000 limit since the bill of 12 Nov 2026.",
    );
  });

  it("Walk Build Co, a contractor that is not an individual: the year's limit and one bill's", () => {
    const build = [
      bill("2026-05-01", 28_000),
      bill("2026-07-01", 29_000),
      bill("2026-09-01", 27_000),
    ];
    expect(lineOn(build, "contractor_other").text).toBe(
      "₹84,000 of ₹1,00,000 in 2026-27: below the limit. This bill, ₹27,000, is below the ₹30,000 limit for one bill.",
    );
    const over = lineOn([...build, bill("2026-10-01", 20_000)], "contractor_other");
    expect(over.line?.words).toBe("₹1,04,000 in 2026-27: over the ₹1,00,000 limit with this bill.");
    expect(over.line?.hint_words).toMatch(
      /^2 per cent of this bill is ₹400; of the year so far, ₹2,080\./,
    );
    expect(over.line).toMatchObject({ code: "1024", section: "393(1), Table 6(i)" });
  });

  it("a single bill of ₹31,000 first is over the one-bill limit", () => {
    expect(lineOn([bill("2026-05-01", 31_000)], "contractor_other").text).toBe(
      "This bill, ₹31,000, is over the ₹30,000 limit for one bill. 2 per cent of this bill is ₹620.",
    );
  });

  it("a director's fees: no lower limit", () => {
    expect(lineOn([bill("2026-08-01", 5_000)], "director").text).toBe(
      "No lower limit. 10 per cent of this bill is ₹500.",
    );
  });

  it("rent of a building, ₹60,000 in November", () => {
    expect(lineOn([bill("2026-11-01", 60_000)], "rent_building").text).toBe(
      "This month's rent, ₹60,000, is over the ₹50,000 limit. 10 per cent of it is ₹6,000.",
    );
    expect(lineOn([bill("2026-11-01", 50_000)], "rent_building").text).toBe(
      "This month's rent, ₹50,000, is at the ₹50,000 limit, not over it.",
    );
  });

  it("cancelled bills, other years and other currencies are not counted; no line without a kind", () => {
    const mixed = [
      bill("2026-03-31", 40_000),
      bill("2026-06-10", 20_000, { cancelled: true }),
      bill("2026-06-11", 20_000, { currency: "USD" }),
      bill("2026-09-05", 25_000),
    ];
    expect(lineOn(mixed, "professional").text).toBe(
      "₹25,000 of ₹50,000 in 2026-27: below the limit.",
    );
    expect(lineOn(mixed, "none").line).toBeNull();
    expect(lineOn(mixed, "").line).toBeNull();
    expect(
      tdsLine({
        bill: mixed[3]!,
        bills: mixed,
        kind: "professional",
        resident: false,
        rules: rulesWith(),
      }),
    ).toBeNull();
  });

  it("with no rule book, the sum alone and no rule", () => {
    const none: RuleAsk = () => null;
    const line = tdsLine({
      bill: third,
      bills: [...legal, third],
      kind: "professional",
      resident: true,
      rules: none,
    });
    expect(line).toMatchObject({
      words: "₹55,000 billed in 2026-27.",
      hint_words: "",
      rule: null,
      deposit_by: null,
    });
  });

  it("the table: kind, section, code and rule for each", () => {
    expect(TDS_TABLE.contractor_person).toMatchObject({
      code: "1023",
      rate: "tds-rate-contractor-person",
    });
    expect(TDS_TABLE.technical).toMatchObject({ code: "1026", year: "tds-technical-year" });
    expect(TDS_TABLE.rent_plant).toMatchObject({
      code: "",
      month: "tds-rent-month",
      section: "393(1), Table 2(ii)",
    });
    expect(TDS_TABLE.director).toMatchObject({ single: null, year: null, month: null });
  });
});

describe("the deposit day (tdsDepositDue)", () => {
  it("is the 7th of the next month, 30 April for March, never moved for a holiday", () => {
    expect(tdsDepositDue("2026-11-12")).toBe("2026-12-07");
    expect(tdsDepositDue("2026-12-31")).toBe("2027-01-07");
    expect(tdsDepositDue("2027-03-20")).toBe("2027-04-30");
    const line = tdsLine({
      bill: bill("2026-11-12", 10_000),
      bills: [],
      kind: "professional",
      resident: true,
      rules: rulesWith(),
      deducted_on: "2026-11-12",
    });
    expect(line?.deposit_by).toBe("2026-12-07");
    expect(line?.deposit_rule).toMatchObject({ key: "tds-deposit", confirm_with: "CA" });
  });
});

// ------------------------------------------------------------------ through the service

let stack: Stack;
const post = (path: string, body: Record<string, unknown> = {}) =>
  stack.ask("POST", path, { by: WALKER, ...body });
const message = (answer: RawAnswer) =>
  String((answer.json?.error as { message?: unknown } | undefined)?.message ?? "");

beforeAll(async () => {
  stack = await startStack({ modules: ["files", "contacts", "money"] });
}, 60_000);
afterAll(() => stack.stop());

describe("the line on a bill, through the service", () => {
  it("follows the rule book: none, unconfirmed, confirmed", async () => {
    const vendor = (
      await post("/data/money/vendors", {
        name: "Walk Legal LLP",
        residency: "resident",
        pan: "ZZZPZ0000Z",
        gstin: "00ZZZPZ0000Z1Z0",
        tds_kind: "professional",
      })
    ).json?.vendor as { vendor_id: string };
    const ids: string[] = [];
    for (const [number, on, taxable, gst] of [
      ["WALK-INV-0005", "2026-06-10", "20000", "3600"],
      ["WALK-INV-0006", "2026-09-05", "25000", "4500"],
      ["WALK-INV-0007", "2026-11-12", "10000", "1800"],
    ] as const) {
      const added = await post("/data/money/bills", {
        vendor_id: vendor.vendor_id,
        invoice_number: number,
        invoice_on: on,
        taxable,
        gst,
        attempt: crypto.randomUUID(),
      });
      expect(added.status).toBe(200);
      ids.push(String((added.json?.bill as { bill_id: string }).bill_id));
    }
    const third = () => stack.ask("GET", `/data/money/bills/${ids[2]}`);
    type Line = { words: string; hint_words: string; rule: { readings: string[] } | null };
    const lineOf = async () => ((await third()).json?.bill as { tds_line: Line }).tds_line;
    expect(await lineOf()).toMatchObject({ words: "₹55,000 billed in 2026-27.", rule: null });
    expect((await third()).json?.here).toMatchObject({ rules: false });

    await post("/data/_test/money/duty-rules", {});
    expect(await lineOf()).toMatchObject({
      words: "₹55,000 billed in 2026-27.",
      hint_words: "",
      rule: { readings: ["₹50,000", "₹30,000"] },
    });

    await post("/data/_test/money/duty-rules", { stored: CONFIRMED });
    const confirmed = await lineOf();
    expect(confirmed.words).toBe("₹55,000 in 2026-27: over the ₹50,000 limit with this bill.");
    expect(confirmed.hint_words).toContain("10 per cent of this bill is ₹1,000");

    // A deduction above the amount before GST is refused; one at it is kept, with its deposit day.
    const above = await post(`/data/money/bills/${ids[2]}/tds`, {
      deducted: "10000.01",
      deducted_on: "2026-11-12",
    });
    expect(above.status).toBe(400);
    expect(message(above)).toBe(
      "The tax deducted cannot be more than the amount before GST, ₹10,000.",
    );
    const kept = await post(`/data/money/bills/${ids[2]}/tds`, {
      deducted: "1,000",
      deducted_on: "2026-11-12",
    });
    expect(kept.status).toBe(200);
    expect(kept.json?.bill).toMatchObject({
      payable_minor: 1_080_000,
      deposit: { by: "2026-12-07" },
      tds_line: { deposit_by: "2026-12-07" },
    });
    // A challan needs a deduction; this one has it.
    const challan = await post(`/data/money/bills/${ids[1]}/challan`, {
      number: "WALK-CH-1",
      deposited_on: "2026-11-12",
    });
    expect(codeOf(challan)).toBe("no_deduction");
    await post("/data/_test/money/duty-rules", { on: false });
  });
});
