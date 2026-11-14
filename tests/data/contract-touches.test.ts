// @vitest-environment node
import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays } from "../../scripts/data/days";
import { logTouch, readTouches, restoreTouch, withdrawTouch } from "@/lib/data/api/touches";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's Touches client against the real stack: every function's answer passes its
 * schema, and a refusal reaches the portal as the service's sentence. Every lead and firm is
 * invented; with neither All leads nor the investors module here, the names typed are kept.
 */

const idOf = (key: string): string => createHash("sha256").update(key).digest("hex").slice(0, 32);

let stack: Stack;
let today = "";

beforeAll(async () => {
  stack = await startStack({ env: true, modules: ["touches"] });
  today = String((await stack.ask("GET", "/data/_test/day")).json?.day ?? "");
}, 60_000);
afterAll(() => stack.stop());

describe("the Touches client", () => {
  it("passes every answer through its schema", async () => {
    const lead = idOf("lead:contract@walk-touch.example");
    const { touch } = await logTouch(
      {
        subject_kind: "lead",
        subject_id: lead,
        subject_name: "Walk Contract Lead",
        on: today,
        kind: "request",
        note: "Invented: after the panel.",
      },
      WALKER,
      randomUUID(),
    );
    expect(touch.href).toBe(`/data/leads/${lead}`);
    await logTouch(
      {
        subject_kind: "investor",
        subject_id: idOf("investor:walk-contract.example"),
        subject_name: "Walk Contract Capital",
        on: addDays(today, -8),
        kind: "accepted",
        note: "",
      },
      WALKER,
      randomUUID(),
    );
    const page = await readTouches();
    expect(page.total).toBe(2);
    expect(page.weeks).toHaveLength(8);
    expect(page.four_weeks).toEqual({ requests: 1, accepted: 1 });
    const onLead = await readTouches({ subject_kind: "lead", subject_id: lead });
    expect(onLead.touches.map((item) => item.touch_id)).toEqual([touch.touch_id]);
    expect((await withdrawTouch(touch.touch_id, WALKER)).touch.withdrawn).not.toBeNull();
    expect((await restoreTouch(touch.touch_id, WALKER)).touch.withdrawn).toBeNull();
  });

  it("brings the service's refusals as its own sentences", async () => {
    await expect(
      logTouch(
        {
          subject_kind: "lead",
          subject_id: "not-an-id",
          subject_name: "",
          on: today,
          kind: "request",
          note: "",
        },
        WALKER,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 400, message: "Say who the touch was with." });
  });
});
