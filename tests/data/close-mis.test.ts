// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The MIS (ws-notes/duties/spec.md §9.8, §9.12): the two identities, per currency, on the
 * walk statement sorted into Money's stand-in categories; the Owner's file written apart from
 * the snapshot and given only with the flag; an Admin's MIS holding no stipend figure. The
 * statement, the categories and the intern are invented.
 */

let stack: Stack;
const by = WALKER;

/** The walk's October lines, each given its category, as the Owner would on Statements. */
const SORT: [string, string][] = [
  ["CLOUD HOSTING", "walk-cat-hosting"],
  ["DATA LICENCE", "walk-cat-data"],
  ["OFFICE RENT", "walk-cat-rent"],
  ["WALK LEGAL LLP", "walk-cat-legal"],
  ["INTERN ONE STIPEND", "walk-cat-stipends"],
  ["SUBSCRIPTION", "walk-cat-subscriptions"],
];

async function sortWalkLines(stack: Stack, accountId: string, months: string[]): Promise<void> {
  for (const month of months) {
    const answer = await stack.ask(
      "GET",
      `/data/statements/accounts/${accountId}/lines?owner=1&month=${month}&view=all`,
    );
    for (const line of answer.json!.lines as { line_id: string; narration: string }[]) {
      const category = SORT.find(([words]) => line.narration.includes(words))?.[1];
      if (category)
        await stack.ask("POST", `/data/statements/lines/${line.line_id}/category`, {
          by,
          owner: true,
          category_id: category,
        });
    }
  }
}

type Mis = {
  expenses: {
    currency: string;
    heads: { name: string; minor: number | null; people: boolean }[];
    unsorted_minor: number;
    total_minor: number;
  }[];
  burn: Record<string, unknown>[];
  cash_flow: {
    currency: string;
    opening_minor: number;
    in: { customers: number; funding: number; other: number };
    out_minor: number;
    between_minor: number;
    closing_minor: number;
  }[];
  revenue: { collected: Record<string, number> };
  people: unknown;
  frozen_at: string | null;
};

beforeAll(async () => {
  stack = await startStack({ modules: ["files", "numbers", "statements", "close"] });
  const seeded = await stack.ask("POST", "/data/_test/close/seed", { by, statements: true });
  const accountId = String((seeded.json!.statements as { account_id: string }).account_id);
  await sortWalkLines(stack, accountId, ["2026-08", "2026-09", "2026-10"]);
}, 60_000);
afterAll(async () => {
  await stack.stop();
});

describe("the MIS for October 2026", () => {
  it("holds §5.5's burn and runway, and both identities", async () => {
    const answer = (await stack.ask("GET", "/data/close/2026-10/mis")).json as {
      mis: Mis;
      frozen: boolean;
    };
    expect(answer.frozen).toBe(false);
    const { mis } = answer;
    expect(mis.burn).toEqual([
      {
        currency: "INR",
        as_of: "2026-10-31",
        cash_minor: 120_000_000,
        gross_minor: 17_500_000,
        collected_minor: 2_000_000,
        net_minor: 15_500_000,
        avg_net_minor: 15_000_000,
        months: 3,
        runway_months: 8,
        zero_on: "2027-07-01",
      },
    ]);
    expect(mis.revenue.collected).toEqual({ INR: 2_000_000 });
    const [spent] = mis.expenses;
    expect(spent!.heads).toEqual([
      { name: "Cloud hosting", ledger: "Cloud hosting charges", minor: 4_000_000, people: false },
      {
        name: "Legal and professional fees",
        ledger: "Legal and professional charges",
        minor: 1_180_000,
        people: false,
      },
      {
        name: "Market-data licences",
        ledger: "Data licence fees",
        minor: 6_000_000,
        people: false,
      },
      { name: "Office rent", ledger: "Rent", minor: 4_820_000, people: false },
      { name: "People cost: shown to the Owner", ledger: "", minor: null, people: true },
    ]);
    const owner = (await stack.ask("GET", "/data/close/2026-10/mis?owner=1")).json as {
      owner_part: { people_heads: { minor: number }[] };
    };
    const peopleTotal = owner.owner_part.people_heads.reduce((sum, head) => sum + head.minor, 0);
    const headsTotal = spent!.heads.reduce((sum, head) => sum + (head.minor ?? 0), 0);
    // total = heads + people heads + unsorted = gross
    expect(headsTotal + peopleTotal + spent!.unsorted_minor).toBe(spent!.total_minor);
    expect(spent!.total_minor).toBe(17_500_000);
    // closing = opening + in − out (+ between own accounts, none here)
    const [flow] = mis.cash_flow;
    expect(flow).toEqual({
      currency: "INR",
      opening_minor: 135_500_000,
      in: { customers: 2_000_000, funding: 0, other: 0 },
      out_minor: 17_500_000,
      between_minor: 0,
      closing_minor: 120_000_000,
    });
    expect(
      flow!.opening_minor +
        flow!.in.customers +
        flow!.in.funding +
        flow!.in.other -
        flow!.out_minor,
    ).toBe(flow!.closing_minor);
  });

  it("gives the people figures only with the Owner flag", async () => {
    const admin = (await stack.ask("GET", "/data/close/2026-10/mis")).json!;
    expect("owner_part" in admin).toBe(false);
    const text = JSON.stringify(admin);
    expect(text).not.toContain("Intern stipends");
    expect(text).not.toContain("Walk Intern One");
    expect(text).not.toContain("stipends");
    const heads = (admin.mis as Mis).expenses.flatMap((item) =>
      item.heads.map((head) => head.minor),
    );
    expect(heads).not.toContain(1_500_000);
    const owner = (await stack.ask("GET", "/data/close/2026-10/mis?owner=1")).json!;
    expect(owner.owner_part).toEqual({
      stipends: { INR: 1_500_000 },
      payments: 1,
      people_heads: [{ currency: "INR", name: "Intern stipends", minor: 1_500_000 }],
    });
  });

  it("freezes at the lock, the Owner's part written apart from the snapshot", async () => {
    for (const key of [
      "statements",
      "sales_invoices",
      "bills",
      "stipend_sheet",
      "tds_challans",
      "gst_returns",
      "firas",
    ])
      await stack.ask("POST", `/data/close/2026-10/items/${key}`, { by, state: "ready" });
    await stack.ask("POST", "/data/close/2026-10/sent", {
      by,
      on: "2026-11-06",
      to_name: "Walk CA",
    });
    expect((await stack.ask("POST", "/data/close/2026-10/lock", { by })).status).toBe(200);
    const frozen = (await stack.ask("GET", "/data/close/2026-10/mis")).json as {
      mis: Mis;
      frozen: boolean;
    };
    expect(frozen.frozen).toBe(true);
    expect(frozen.mis.frozen_at).not.toBeNull();
    const snapshot = readFileSync(join(stack.dir, "data", "close", "mis", "2026-10.json"), "utf8");
    const ownerFile = readFileSync(
      join(stack.dir, "data", "close", "owner", "2026-10.json"),
      "utf8",
    );
    expect(snapshot).not.toContain("Intern stipends");
    expect(ownerFile).toContain("Intern stipends");
    const owner = (await stack.ask("GET", "/data/close/2026-10/mis?owner=1")).json!;
    expect(owner.owner_part).toMatchObject({ stipends: { INR: 1_500_000 } });
    const list = (await stack.ask("GET", "/data/mis")).json as {
      months: { period: string; state: string }[];
    };
    expect(list.months.find((month) => month.period === "2026-10")?.state).toBe("frozen");
    expect(list.months.find((month) => month.period === "2026-09")?.state).toBe("live");
  });
});
