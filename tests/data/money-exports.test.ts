// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  standInDutyRules,
  type DutyRuleKey,
  type DutyStored,
} from "../../scripts/data/duties-contracts";
import { exportClocks, lutCheck, rateWordsOf, realisedOf } from "../../scripts/data/money/exports";
import type { RuleAsk } from "../../scripts/data/money/tds";
import type { Receipt } from "../../scripts/data/money/types";
import { WALKER, codeOf, startStack, type RawAnswer, type Stack } from "./helpers";

/**
 * Export invoices (ws-notes/duties/spec.md §5.4): the EDF day; the realise-by day absent
 * until the realisation rule is confirmed, then with each reading; what is realised and when
 * in full; the rate in words; the LUT check; the purpose code's shape; and Due's "Bring home"
 * row absent until the rule is usable. Every customer is invented.
 */

const confirmed = (reading: number): Partial<Record<DutyRuleKey, DutyStored>> => ({
  "export-realisation": { reading, confirmed: { name: "Walk Bank", on: "2026-11-14" } },
});
const rulesWith = (stored: Partial<Record<DutyRuleKey, DutyStored>> = {}): RuleAsk => {
  const service = standInDutyRules(() => "2026-11-19", stored);
  return (key) => service.state(key);
};

describe("§5.4's clocks, by hand", () => {
  it("20 Oct 2026: EDF by 30 Nov; realise by none until confirmed, then 20 Jul 2027 or 20 Jan 2028", () => {
    const silent = exportClocks("2026-10-20", rulesWith());
    expect(silent).toMatchObject({
      edf_by: "2026-11-30",
      realise_by: null,
      readings: ["9 months", "15 months"],
      rules: { edf: { key: "export-edf", confirm_with: "bank", usable: true } },
    });
    expect(silent.rules.realisation).toMatchObject({ usable: false, confirm_with: "bank" });
    expect(exportClocks("2026-10-20", rulesWith(confirmed(0))).realise_by).toBe("2027-07-20");
    expect(exportClocks("2026-10-20", rulesWith(confirmed(1))).realise_by).toBe("2028-01-20");
    expect(exportClocks("2026-10-20", rulesWith(confirmed(1))).readings).toEqual([]);
  });

  it("30 Nov 2026: EDF by 30 Dec; 30 Aug 2027 or 29 Feb 2028", () => {
    expect(exportClocks("2026-11-30", rulesWith())).toMatchObject({
      edf_by: "2026-12-30",
      realise_by: null,
    });
    expect(exportClocks("2026-11-30", rulesWith(confirmed(0))).realise_by).toBe("2027-08-30");
    expect(exportClocks("2026-11-30", rulesWith(confirmed(1))).realise_by).toBe("2028-02-29");
  });

  it("no rule book: nothing worked out at all", () => {
    expect(exportClocks("2026-11-30", () => null)).toMatchObject({
      edf_by: null,
      realise_by: null,
      rules: { edf: null, realisation: null },
      readings: [],
    });
  });

  const receipt = (on: string, dollars: number, rupees: number | null = null): Receipt => ({
    receipt_id: on,
    received_on: on,
    amount_minor: dollars * 100,
    inr_minor: rupees === null ? null : rupees * 100,
    fira_number: "",
    fira_file_id: null,
    ebrc_number: "",
    from_line: null,
    taken_back: null,
    at: `${on}T00:00:00.000Z`,
    by: WALKER,
  });

  it("realised: USD 3,000 then USD 2,000 against USD 5,000 is in full on the second day", () => {
    expect(
      realisedOf(500_000, [receipt("2026-12-02", 2_000), receipt("2026-11-25", 3_000)]),
    ).toEqual({
      minor: 500_000,
      of_minor: 500_000,
      in_full_on: "2026-12-02",
      inr_minor: null,
    });
    const back = {
      ...receipt("2026-12-02", 2_000),
      taken_back: { at: "x", by: WALKER, why: "wrong" },
    };
    expect(realisedOf(500_000, [receipt("2026-11-25", 3_000), back]).in_full_on).toBeNull();
  });

  it("the rate in words: USD 5,000.00 as ₹4,41,250.00 is ₹88.25 a dollar", () => {
    expect(rateWordsOf("USD", 500_000, 44_125_000)).toBe("₹88.25 a dollar");
    expect(rateWordsOf("EUR", 100_000, 9_000_000)).toBe("₹90 a euro");
    expect(rateWordsOf("USD", 500_000, null)).toBe("");
    expect(rateWordsOf("INR", 500_000, 500_000)).toBe("");
  });

  it("the LUT check", () => {
    const words =
      "No LUT is recorded for 2026-27. It is filed before the year's first zero-rated invoice. Confirm with your CA.";
    expect(lutCheck("2026-10-20", "under_lut", [])).toBe(words);
    expect(
      lutCheck("2026-10-20", "under_lut", [
        { fy: "2026-27", arn: "WALK-ARN-1", filed_on: "2026-04-02", file_id: null },
      ]),
    ).toBeNull();
    expect(lutCheck("2026-10-20", "igst_paid", [])).toBeNull();
  });
});

let stack: Stack;
const post = (path: string, body: Record<string, unknown> = {}) =>
  stack.ask("POST", path, { by: WALKER, ...body });
const message = (answer: RawAnswer) =>
  String((answer.json?.error as { message?: unknown } | undefined)?.message ?? "");

beforeAll(async () => {
  stack = await startStack({ modules: ["files", "contacts", "money"] });
}, 60_000);
afterAll(() => stack.stop());

type Invoice = {
  invoice_id: string;
  edf_by: string | null;
  realise_by: string | null;
  readings: string[];
  checks: string[];
  realised: { minor: number; in_full_on: string | null; inr_minor: number | null };
  receipts: { receipt_id: string; rate_words: string }[];
};

describe("through the service", () => {
  it("an invoice under LUT: the clocks, the receipt, the rate, the LUT and Due", async () => {
    await post("/data/_test/money/duty-rules", {});
    const bad = await post("/data/money/exports", {
      customer: "Walk Customer Inc",
      invoice_number: "WALK-EXP-0009",
      invoice_on: "2026-10-20",
      currency: "USD",
      amount: "5000",
      purpose_code: "P802",
      attempt: crypto.randomUUID(),
    });
    expect(bad.status).toBe(400);
    expect(message(bad)).toBe("A purpose code is P and four digits, such as P0802.");
    const added = await post("/data/money/exports", {
      customer: "Walk Customer Inc",
      country: "United States",
      invoice_number: "WALK-EXP-0001",
      invoice_on: "2026-10-20",
      currency: "USD",
      amount: "5000",
      tax_treatment: "under_lut",
      purpose_code: "p0802",
      attempt: crypto.randomUUID(),
    });
    expect(added.status).toBe(200);
    const invoice = added.json?.invoice as Invoice & { purpose_code: string };
    expect(invoice).toMatchObject({
      purpose_code: "P0802",
      edf_by: "2026-11-30",
      realise_by: null,
      readings: ["9 months", "15 months"],
    });
    expect(invoice.checks).toContain(
      "No LUT is recorded for 2026-27. It is filed before the year's first zero-rated invoice. Confirm with your CA.",
    );
    const dueKeys = async () =>
      ((await stack.ask("GET", "/data/overview")).json?.due as { key: string }[]).map(
        (row) => row.key,
      );
    expect(await dueKeys()).toContain("export:edf:2026-10");
    expect(await dueKeys()).not.toContain(`export:${invoice.invoice_id}:realise`);

    const received = await post(`/data/money/exports/${invoice.invoice_id}/receipts`, {
      received_on: "2026-11-12",
      amount: "5,000.00",
      inr: "4,41,250.00",
      fira_number: "WALK-FIRA-0001",
    });
    const after = received.json?.invoice as Invoice;
    expect(after.receipts[0]?.rate_words).toBe("₹88.25 a dollar");
    expect(after.realised).toMatchObject({
      minor: 500_000,
      in_full_on: "2026-11-12",
      inr_minor: 44_125_000,
    });

    const lut = await post("/data/money/luts", {
      fy: "2026-27",
      arn: "WALK-ARN-0001",
      filed_on: "2026-04-02",
    });
    expect(lut.status).toBe(200);
    expect(
      codeOf(
        await post("/data/money/luts", {
          fy: "2026-27",
          arn: "WALK-ARN-2",
          filed_on: "2026-04-03",
        }),
      ),
    ).toBe("taken");
    const read = (await stack.ask("GET", `/data/money/exports/${invoice.invoice_id}`)).json
      ?.invoice as Invoice;
    expect(read.checks.some((line) => line.startsWith("No LUT"))).toBe(false);

    // Realised in full: no "Bring home" row even once usable. A second invoice, open, gets one.
    await post("/data/_test/money/duty-rules", { stored: confirmed(0) });
    const second = (
      await post("/data/money/exports", {
        customer: "Walk Customer Two",
        invoice_number: "WALK-EXP-0002",
        invoice_on: "2026-01-20",
        currency: "USD",
        amount: "1000",
        attempt: crypto.randomUUID(),
      })
    ).json?.invoice as Invoice;
    expect(second.realise_by).toBe("2026-10-20");
    expect(await dueKeys()).toContain(`export:${second.invoice_id}:realise`);
    expect(await dueKeys()).not.toContain(`export:${invoice.invoice_id}:realise`);
    const agenda = (await stack.ask("GET", "/data/_test/money/agenda")).json?.items as {
      kind: string;
      plain: string;
      title: string;
    }[];
    expect(
      agenda
        .filter((item) => item.kind === "export")
        .every((item) => item.plain === "Export paperwork"),
    ).toBe(true);
    await post("/data/_test/money/duty-rules", { on: false });
    expect(await dueKeys()).not.toContain(`export:${second.invoice_id}:realise`);
  });
});
