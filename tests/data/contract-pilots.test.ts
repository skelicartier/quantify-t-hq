// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import {
  logCheckIn,
  planPilot,
  readEntryPilots,
  readPilot,
  readPilots,
  recordCriterionResult,
  recordPilotDecision,
  startPilot,
  updatePilot,
  type PilotInput,
} from "@/lib/data/api/pilots";
import { DataRequestError } from "@/lib/data/socket";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's pilots client (ws-notes/company/spec.md §9.8) against the real stack with
 * the waitlist module: every answer passes the portal's own schema, and a refusal arrives
 * as a `DataRequestError` with the service's sentence. Invented firms on `.example` only.
 */

let stack: Stack;
let entryId = "";
const today = () => localDay(new Date());

const INPUT: PilotInput = {
  starts_on: "",
  ends_on: "",
  criteria: [
    { what: "Analysts use it every day", target: "Two analysts, five days a week" },
    { what: "", target: "" },
  ],
  owners: { sponsor: "Walk Sponsor", technical: "Walk Engineer", user: "Walk Analyst" },
  free: false,
  price: { amount: "50000", currency: "INR", note: "20 per cent upfront" },
  conversion: { on: "", amount: "40000", currency: "INR", per: "month" },
  go_no_go_on: "",
};

beforeAll(async () => {
  stack = await startStack({ env: true, modules: ["leads", "replies", "waitlist", "pilots"] });
  const added = await stack.ask("POST", "/data/waitlist", {
    email: "asha@buyer1.example",
    firm: "Walk Buyer 1",
    by: WALKER,
  });
  expect(added.status).toBe(200);
  entryId = String((added.json?.entry as { entry_id: string }).entry_id);
}, 60_000);
afterAll(() => stack.stop());

describe("the portal and the pilots module agree", () => {
  it("on every client function", async () => {
    expect((await readPilots()).pilots).toEqual([]);
    const input = {
      ...INPUT,
      starts_on: today(),
      ends_on: addDays(today(), 30),
      go_no_go_on: addDays(today(), 28),
    };
    const planned = await planPilot({ ...input, entry_id: entryId }, WALKER, crypto.randomUUID());
    expect(planned.running).toBe(0);
    const id = planned.pilot.pilot_id;
    expect((await updatePilot(id, { ...input, free: true }, WALKER)).pilot.price).toBeNull();
    expect((await startPilot(id, WALKER)).pilot.state).toBe("running");
    const logged = await logCheckIn(
      id,
      { on: today(), note: "All well." },
      WALKER,
      crypto.randomUUID(),
    );
    expect(logged.next_check_in).toBe(addDays(today(), 7));
    const criterion = logged.pilot.criteria[0]!.criterion_id;
    expect(
      (await recordCriterionResult(id, criterion, { result: "Every day", met: "yes" }, WALKER))
        .pilot.criteria[0]?.met,
    ).toBe("yes");
    const page = await readPilot(id);
    expect(page.entry).toEqual({ entry_id: entryId, firm: "Walk Buyer 1", stage: "joined" });
    expect(page.agreements).toBeNull();
    expect((await readEntryPilots(entryId)).pilots).toHaveLength(1);
    expect((await readPilots("running")).counts.running).toBe(1);
    expect(
      (
        await recordPilotDecision(
          id,
          { outcome: "go", on: today(), note: "", converts_on: addDays(today(), 3) },
          WALKER,
        )
      ).pilot.state,
    ).toBe("decided");
  });

  it("a refusal carries the service's sentence", async () => {
    const error = await planPilot(
      { ...INPUT, entry_id: "nowhere" },
      WALKER,
      crypto.randomUUID(),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DataRequestError);
    expect((error as DataRequestError).message).toBe("That firm is not on the waitlist.");
  });
});
