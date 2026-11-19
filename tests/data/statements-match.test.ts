// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { WALK_BILL, WALK_CATEGORIES } from "../../scripts/data/statements/walk-seed";
import { WALKER, codeOf, startStack, type Stack } from "./helpers";

/**
 * Matching statement lines (ws-notes/duties/spec.md §9.4) against the stand-in `money` and
 * `people-pay` (test routes only): each row of the suggestions table, a match that records
 * the payment in Money and its take-back, a link that records nothing, and "Accept the sure
 * matches". The walk statement and every bill, invoice and person are invented.
 */

let stack: Stack;
let accountId = "";
const owner = { by: WALKER, owner: true };

type Suggestion = { kind: string; ref: string; title: string; strength: string; why: string };
type LineRow = {
  line_id: string;
  narration: string;
  category_id: string | null;
  match: Record<string, unknown> | null;
  match_title: string | null;
  suggestions: Suggestion[];
};

const HOSTING_BILL = {
  bill_id: "walk-bill-hosting",
  vendor_name: "Walk Hosting Pvt",
  invoice_number: "WALK-HST-1001",
  invoice_on: "2026-09-28",
  currency: "INR",
  total_minor: 4_000_000,
  category_id: "walk-cat-hosting",
};
const DATA_BILL = {
  bill_id: "walk-bill-data",
  vendor_name: "Walk Data Ltd",
  invoice_number: "WALK-DAT-1003",
  invoice_on: "2026-10-01",
  currency: "INR",
  total_minor: 6_000_000,
  category_id: "walk-cat-data",
  payments: [
    {
      payment_id: "walk-pay-data",
      paid_on: "2026-10-10",
      amount_minor: 6_000_000,
      reference: "WALK-REF-1003",
    },
  ],
};

async function install(bills: unknown[], exports: unknown[] = []) {
  await stack.ask("POST", "/data/_test/statements/money", { by: WALKER, on: false });
  const money = await stack.ask("POST", "/data/_test/statements/money", {
    by: WALKER,
    categories: WALK_CATEGORIES,
    bills,
    export_invoices: exports,
  });
  expect(money.json).toMatchObject({ installed: true, real: false });
}

async function october(view = "all") {
  const answer = await stack.ask(
    "GET",
    `/data/statements/accounts/${accountId}/lines?owner=1&month=2026-10&view=${view}`,
  );
  expect(answer.status).toBe(200);
  return answer.json as { lines: LineRow[]; sure: number };
}
const byNarration = (lines: LineRow[], words: string) =>
  lines.find((line) => line.narration.includes(words))!;

beforeAll(async () => {
  stack = await startStack({ modules: ["files", "statements"] });
  await stack.ask("POST", "/data/_test/statements/people-pay", { by: WALKER });
  const seeded = await stack.ask("POST", "/data/_test/statements/seed", { by: WALKER });
  expect(seeded.json).toMatchObject({ imported: true });
  accountId = String(seeded.json!.account_id);
}, 60_000);
afterAll(async () => {
  await stack.stop();
});

describe("suggestions, row by row", () => {
  it("offers a recorded payment whose reference is in the line, an open bill by its invoice number, and one by its amount", async () => {
    await install([WALK_BILL, HOSTING_BILL, DATA_BILL]);
    const { lines } = await october();
    expect(byNarration(lines, "DATA LICENCE OCT").suggestions).toEqual([
      {
        kind: "bill_payment",
        ref: "bill_payment:walk-bill-data:walk-pay-data",
        title: "Walk Data Ltd WALK-DAT-1003",
        strength: "sure",
        why: "The bank reference matches.",
        currency: null,
        href: "/data/money/bills/walk-bill-data",
      },
    ]);
    expect(byNarration(lines, "WALK LEGAL LLP").suggestions[0]).toMatchObject({
      kind: "bill",
      ref: "bill:walk-bill-0007",
      title: "Walk Legal LLP WALK-INV-0007",
      strength: "sure",
      why: "The invoice number is in the bank's line.",
    });
    expect(byNarration(lines, "CLOUD HOSTING OCT").suggestions).toEqual([
      expect.objectContaining({ kind: "bill", strength: "likely", why: "The same amount." }),
    ]);
  });

  it("offers the intern's stipend, sure by its reference, only in the Owner's answer", async () => {
    const { lines } = await october();
    expect(byNarration(lines, "INTERN ONE STIPEND").suggestions).toEqual([
      expect.objectContaining({
        kind: "stipend",
        ref: "stipend:walk-intern-one:walk-pay-0015",
        title: "Stipend: Walk Intern One, October 2026",
        strength: "sure",
        why: "The bank reference matches.",
      }),
    ]);
    const bare = await stack.ask(
      "GET",
      `/data/statements/accounts/${accountId}/lines?month=2026-10`,
    );
    expect(bare.status).toBe(403);
    expect(codeOf(bare)).toBe("owner_only");
  });

  it("offers an export receipt by its rupees, and an open export invoice", async () => {
    await install(
      [WALK_BILL],
      [
        {
          invoice_id: "walk-exp-1",
          customer: "Walk Overseas One",
          invoice_number: "WALK-EXP-0001",
          currency: "USD",
          amount_minor: 24_000,
          receipts: [{ receipt_id: "walk-rcpt-1", amount_minor: 24_000, inr_minor: 2_000_000 }],
        },
        {
          invoice_id: "walk-exp-2",
          customer: "Walk Overseas Two",
          invoice_number: "WALK-EXP-0002",
          currency: "USD",
          amount_minor: 50_000,
        },
      ],
    );
    const { lines } = await october();
    expect(byNarration(lines, "WALK FUND SUBSCRIPTION").suggestions).toEqual([
      expect.objectContaining({
        kind: "export_receipt",
        ref: "export_receipt:walk-exp-1:walk-rcpt-1",
        strength: "sure",
        why: "The rupees match the receipt.",
      }),
      expect.objectContaining({
        kind: "export",
        ref: "export:walk-exp-2",
        strength: "likely",
        why: "An export invoice is open.",
        currency: "USD",
      }),
    ]);
  });
});

describe("matching", () => {
  it("records the payment in Money from the line, gives the bill's category, and takes it back", async () => {
    await install([WALK_BILL]);
    const { lines } = await october();
    const legal = byNarration(lines, "WALK LEGAL LLP");
    const matched = await stack.ask("POST", `/data/statements/lines/${legal.line_id}/match`, {
      ...owner,
      ref: "bill:walk-bill-0007",
    });
    expect(matched.status).toBe(200);
    const line = matched.json!.line as LineRow & {
      match: { kind: string; bill_id: string; payment_id: string; made_here: boolean };
    };
    expect(line.match).toMatchObject({
      kind: "bill_payment",
      bill_id: "walk-bill-0007",
      made_here: true,
    });
    expect(line.category_id).toBe("walk-cat-legal");
    const after = await october("matched");
    expect(byNarration(after.lines, "WALK LEGAL LLP").match_title).toBe(
      "Walk Legal LLP WALK-INV-0007",
    );
    const again = await stack.ask("POST", `/data/statements/lines/${legal.line_id}/match`, {
      ...owner,
      ref: "bill:walk-bill-0007",
    });
    expect(again.status).toBe(409);
    const back = await stack.ask("POST", `/data/statements/lines/${legal.line_id}/unmatch`, {
      ...owner,
      why: "Matched to the wrong bill.",
    });
    expect((back.json!.line as LineRow).match).toBeNull();
    const reopened = await october();
    // The payment went back in Money, so the open bill is offered again.
    expect(byNarration(reopened.lines, "WALK LEGAL LLP").suggestions[0]).toMatchObject({
      ref: "bill:walk-bill-0007",
      strength: "sure",
    });
  });

  it("links a stipend payment without writing to the people ledger", async () => {
    const { lines } = await october();
    const stipend = byNarration(lines, "INTERN ONE STIPEND");
    const linked = await stack.ask("POST", `/data/statements/lines/${stipend.line_id}/match`, {
      ...owner,
      ref: "stipend:walk-intern-one:walk-pay-0015",
    });
    expect((linked.json!.line as LineRow).match).toEqual({
      kind: "stipend",
      person_id: "walk-intern-one",
      payment_id: "walk-pay-0015",
    });
    const shown = await october("matched");
    expect(byNarration(shown.lines, "INTERN ONE STIPEND").match_title).toBe(
      "Stipend: Walk Intern One, October 2026",
    );
  });

  it("accepts every sure bill match in one press and says how many", async () => {
    await install([WALK_BILL, HOSTING_BILL, DATA_BILL]);
    const before = await october();
    expect(before.sure).toBe(2);
    const accepted = await stack.ask("POST", `/data/statements/accounts/${accountId}/accept-sure`, {
      ...owner,
      month: "2026-10",
    });
    expect(accepted.json).toMatchObject({ accepted: 2, words: "2 matches accepted." });
    const after = await october();
    expect(after.sure).toBe(0);
    expect(byNarration(after.lines, "DATA LICENCE OCT").match).toMatchObject({
      kind: "bill_payment",
      payment_id: "walk-pay-data",
      made_here: false,
    });
    // The likely one by amount alone is left for him.
    expect(byNarration(after.lines, "CLOUD HOSTING OCT").match).toBeNull();
  });
});
