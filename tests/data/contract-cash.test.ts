// @vitest-environment node
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays } from "../../scripts/data/days";
import {
  addCashEvent,
  addCashLine,
  readCash,
  removeCashEvent,
  saveCashSetup,
  updateCashLine,
  withdrawCashLine,
} from "@/lib/data/api/cash";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's cash client against the real stack, with the real people ledger (duties spec
 * §7.6, §7.7): every answer passes its schema; asked as the Owner the stipend the ledger owes
 * is a row and an item, asked without the flag neither the row, nor the item, nor the person's
 * name is anywhere in the answer; the service's refusals reach the portal as its sentences.
 * Every name is invented.
 */

let stack: Stack;
let today = "";

beforeAll(async () => {
  stack = await startStack({
    env: true,
    modules: ["files", "contacts", "dates", "people", "cash"],
  });
  today = String((await stack.ask("GET", "/data/_test/day")).json?.day ?? "");
  const added = await stack.ask("POST", "/data/people", {
    name: "Walk Cash Intern",
    email: "cash@walkintern.example",
    kind: "intern",
    role_title: "Research intern",
    starts_on: addDays(today, -10),
    ends_on: addDays(today, 60),
    mentor: "Walk Mentor",
    stipend: { amount: 15000, currency: "INR", pays_on: "month_end" },
    by: WALKER,
  });
  expect(added.status).toBe(200);
}, 60_000);
afterAll(() => stack.stop());

describe("the cash client", () => {
  it("passes every answer through its schema, the Owner's and the Admin's", async () => {
    await saveCashSetup(
      { opening_currency: "INR", opening_amount: "1200000", opening_as_of: addDays(today, -3) },
      WALKER,
    );
    const { line } = await addCashLine(
      {
        kind: "expected_in",
        on: addDays(today, 10),
        currency: "INR",
        amount: "100000",
        name: "Walk Customer One",
        sure: false,
      },
      WALKER,
      randomUUID(),
    );
    expect((await updateCashLine(line.line_id, { counted_at: "50" }, WALKER)).line.counted_at).toBe(
      50,
    );
    const { event } = await addCashEvent(
      { kind: "money_in", name: "Walk raise", period: "2027-06", amount: "8500000", flagged: true },
      WALKER,
      randomUUID(),
    );
    const owner = await readCash(true);
    expect(owner.here).toEqual({ money: false, statements: false, people: true });
    expect(owner.stipends_left_out).toBe(false);
    const table = owner.tables[0]!;
    expect(table.opening?.source).toBe("typed");
    expect(table.rows.map((row) => row.key)).toContain("stipends");
    expect(table.items.some((item) => item.name.includes("Walk Cash Intern"))).toBe(true);
    expect(owner.scenarios).toHaveLength(3);
    const admin = await readCash(false);
    expect(admin.stipends_left_out).toBe(true);
    expect(admin.tables[0]!.rows.map((row) => row.key)).not.toContain("stipends");
    expect(JSON.stringify(admin)).not.toContain("Walk Cash Intern");
    expect(admin.tiles.find((tile) => tile.key === "pf")?.beside).toContain("1 intern");
    expect((await withdrawCashLine(line.line_id, WALKER)).line.withdrawn).toBe(true);
    expect((await removeCashEvent(event.event_id, WALKER)).removed).toBe(true);
  });

  it("passes the service's refusals on as its sentences", async () => {
    await expect(saveCashSetup({ growth: "101" }, WALKER)).rejects.toThrow(
      "Type the growth as a number from 0 to 100, with at most one decimal.",
    );
    await expect(
      addCashEvent(
        { kind: "money_in", name: "Walk raise", period: "June", amount: "1", flagged: false },
        WALKER,
        randomUUID(),
      ),
    ).rejects.toThrow("Choose the month, such as 2027-01.");
  });
});
