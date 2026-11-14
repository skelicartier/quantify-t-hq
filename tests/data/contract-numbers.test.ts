// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as numbers from "@/lib/data/api/numbers";
import { DataRequestError } from "@/lib/data/socket";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's Numbers client held to the real service: every call the Numbers pages and
 * actions make, made here over the socket, and every answer has to pass the portal's own
 * schema. The investor list is the stand-in (test routes only). Everyone is invented.
 */
let stack: Stack;
let today = "";

beforeAll(async () => {
  // U4's modules alone (raise spec §3.2): no investors module, so `investors-raise` is
  // absent and the stand-in can be installed. raise-merged.test.ts checks the real funnel.
  stack = await startStack({
    env: true,
    modules: ["files", "leads", "replies", "waitlist", "dates", "numbers"],
  });
  today = String((await stack.ask("GET", "/data/_test/day")).json!.day);
}, 60_000);
afterAll(async () => {
  await stack.stop();
});

describe("the portal and Numbers agree", () => {
  it("on the page without the investor list, and with it", async () => {
    const bare = await numbers.readNumbers();
    expect(bare.raise).toBeNull();
    expect(bare.weeks).toHaveLength(6);
    expect(bare.months).toHaveLength(12);
    expect(Object.keys(bare.weekly)).toHaveLength(6);
    expect(bare.update_date_id).toBeNull();
    await stack.ask("POST", "/data/_test/numbers/raise", {
      funnel: { firms: 3, first_meeting_days: [today], days_since_first_send: 4 },
      firms: [
        {
          investor_id: "e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5",
          firm: "Walk Fund 950",
          stage: "soft",
          people: [{ email: "partner950@fund950.example", name: "Asha Rao", replied: true }],
        },
      ],
      by: WALKER,
    });
    const page = await numbers.readNumbers();
    expect(page.raise).toMatchObject({ firms: 3, days_since_first_send: 4 });
    expect(page.weekly.first_investor_meetings?.at(-1)).toBe(1);
  });

  it("on cash and burn, and the buyer firm types", async () => {
    const saved = await numbers.saveMoney(
      { currency: "INR", cash: "1,200,000", burn_per_month: "150000", as_of: today, note: "" },
      WALKER,
      crypto.randomUUID(),
    );
    expect(saved.entry.cash).toBe(1_200_000);
    expect(saved.runway_months).toBe(8);
    await expect(
      numbers.saveMoney(
        { currency: "INR", cash: "1", burn_per_month: "0", as_of: today, note: "" },
        WALKER,
        crypto.randomUUID(),
      ),
    ).rejects.toThrow(DataRequestError);
    const setup = await numbers.saveNumbersSetup({ buyer_types: ["Hedge fund"] }, WALKER);
    expect(setup.setup.buyer_types).toEqual(["Hedge fund"]);
    const page = await numbers.readNumbers();
    expect(page.money.rows[0]).toMatchObject({ currency: "INR", used: true, runway_months: 8 });
    expect(page.money.entries).toHaveLength(1);
    expect(page.buyer_types).toEqual(["Hedge fund"]);
    expect(page.firm_types).toContain("Hedge fund");
  });

  it("on one month's update, from draft to handed over", async () => {
    const period = today.slice(0, 7);
    const first = await numbers.readUpdate(period);
    expect(first.update.status).toBe("draft");
    expect(first.text).toContain("[Up to three asks]");
    const saved = await numbers.saveUpdate(
      period,
      {
        opening: "",
        asks: "An introduction",
        highlights: "",
        lowlights: "",
        thanks: "",
        sign_off: "Walk Owner",
      },
      WALKER,
    );
    expect(saved.text).toContain("Asks\n1. An introduction");
    const frozen = await numbers.freezeUpdate(period, WALKER);
    expect(frozen.update.status).toBe("frozen");
    const live = await numbers.unfreezeUpdate(period, WALKER);
    expect(live.update.status).toBe("draft");
    await numbers.freezeUpdate(period, WALKER);
    const recipients = await numbers.readRecipients(period, ["soft", "signed"]);
    expect(recipients).toMatchObject({ here: true, people: 1 });
    const handed = await numbers.handOver(
      period,
      { stages: ["soft"], exclude: [] },
      WALKER,
      crypto.randomUUID(),
    );
    expect(handed.list.people).toBe(1);
    expect(handed.update.status).toBe("handed_over");
    const page = await numbers.readNumbers();
    expect(page.updates[0]).toMatchObject({ period, status: "handed_over", people: 1 });
  });
});
