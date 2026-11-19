// @vitest-environment node
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  addHoliday,
  addNationalHolidays,
  countWorkingDays,
  pasteHolidays,
  readHolidays,
  removeHoliday,
  saveHolidaySetup,
  updateHoliday,
} from "@/lib/data/api/holidays";
import { DataRequestError } from "@/lib/data/socket";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's holidays client against the real stack (duties spec §7.7): every function's
 * answer passes its schema, the rule lines parse as the contract's `RuleLine`, and the
 * service's refusals reach the portal as its own sentences. Every holiday but the three fixed
 * national days is invented.
 */

let stack: Stack;

beforeAll(async () => {
  stack = await startStack({ env: true, modules: ["files", "contacts", "dates", "holidays"] });
}, 60_000);
afterAll(() => stack.stop());

describe("the holidays client", () => {
  it("passes every answer through its schema", async () => {
    const empty = await readHolidays(2027);
    expect(empty.holidays).toEqual([]);
    expect(empty.rules.national?.key).toBe("holidays-national");
    expect((await addNationalHolidays(2027, WALKER)).added).toBe(3);
    const { holiday } = await addHoliday(
      { on: "2027-03-08", name: "Walk company day", kind: "company" },
      WALKER,
      randomUUID(),
    );
    expect(holiday).toMatchObject({ weekday: "Monday", on_week_off: false });
    expect(
      (await updateHoliday(holiday.holiday_id, { name: "Walk company day moved" }, WALKER)).holiday
        .name,
    ).toBe("Walk company day moved");
    expect((await pasteHolidays("2027-03-09, Walk state day", WALKER, randomUUID())).added).toBe(1);
    const setup = await saveHolidaySetup(
      { week_off: [0, 6], state_minimum: "8", optional_allowance: "" },
      WALKER,
    );
    expect(setup.setup).toMatchObject({ state_minimum: 8, optional_allowance: null });
    const page = await readHolidays(2027);
    expect(page.counts).toEqual({ national: 3, state: 1, company: 1, optional: 0 });
    expect(page.checks).toContain("Independence Day falls on a Sunday, a weekly off day.");
    const counted = await countWorkingDays("2027-03-05", 1);
    expect(counted).toMatchObject({ on: "2027-03-10", fallback: false });
    expect(counted.off_between.map((day) => day.on)).toEqual(["2027-03-08", "2027-03-09"]);
    expect((await removeHoliday(holiday.holiday_id, WALKER)).removed).toBe(true);
    expect((await readHolidays()).year).toBe(Number(page.today.slice(0, 4)));
  });

  it("passes the service's refusals on as its sentences", async () => {
    await expect(
      addHoliday({ on: "2027-01-26", name: "Walk clash", kind: "company" }, WALKER, randomUUID()),
    ).rejects.toThrow("26 Jan 2027 is already a holiday: Republic Day.");
    await expect(
      pasteHolidays("32 Jan 2027, Walk bad day", WALKER, randomUUID()),
    ).rejects.toBeInstanceOf(DataRequestError);
  });
});
