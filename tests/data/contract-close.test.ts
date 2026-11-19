// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as close from "@/lib/data/api/close";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's Month close and MIS client held to the real service (ws-notes/duties/spec.md
 * §9.12): every call the pages and actions make, made over the socket, every answer passing
 * the portal's own schema, the people figures only with the Owner flag. Money, the people
 * ledger and the rule book are stand-ins; the statement is the walk's, invented.
 */

let stack: Stack;

beforeAll(async () => {
  stack = await startStack({ env: true, modules: ["files", "numbers", "statements", "close"] });
  await stack.ask("POST", "/data/_test/close/seed", { by: WALKER, statements: true });
}, 60_000);
afterAll(async () => {
  await stack.stop();
});

describe("the portal and Month close agree", () => {
  it("on the months, one month, its rows, sent, acknowledged, lock and reopen", async () => {
    const months = await close.readCloseMonths();
    expect(months.months.find((month) => month.period === "2026-10")).toMatchObject({
      due_on: "2026-11-06",
      state: "open",
    });
    const admin = await close.readClose("2026-10", false);
    expect(admin.facts.stipend_sheet).toEqual([
      "In the people ledger, which is for the Owner only.",
    ]);
    expect(admin.pack.owner_parts).toBe(false);
    const owner = await close.readClose("2026-10", true);
    expect(owner.facts.stipend_sheet).toEqual(["1 payment, ₹15,000."]);
    for (const key of close.closeItemKeySchema.options)
      await close.setCloseItem("2026-10", key, { state: "ready", note: "" }, WALKER);
    await close.saveCommentary("2026-10", "A quiet month: hosting and data only.", WALKER);
    await close.recordSent(
      "2026-10",
      { on: "2026-11-06", to_name: "Walk CA", how: "Email" },
      WALKER,
    );
    await close.recordAcknowledged(
      "2026-10",
      { on: "2026-11-07", by_name: "Walk CA", note: "Received." },
      WALKER,
    );
    const locked = await close.lockMonth("2026-10", WALKER);
    expect(locked.state).toBe("locked");
    const mis = await close.readMis("2026-10", false);
    expect(mis.frozen).toBe(true);
    expect(mis.owner_part).toBeUndefined();
    expect(mis.mis.commentary).toBe("A quiet month: hosting and data only.");
    const ownerMis = await close.readMis("2026-10", true);
    expect(ownerMis.owner_part?.stipends).toEqual({ INR: 1_500_000 });
    const list = await close.readMisMonths();
    expect(list.months.find((month) => month.period === "2026-10")?.state).toBe("frozen");
    const reopened = await close.reopenMonth("2026-10", "A bill arrived late for October.", WALKER);
    expect(reopened.state).toBe("sent");
    await expect(close.reopenMonth("2026-10", "short", WALKER)).resolves.toMatchObject({
      state: "sent",
    });
  });
});
