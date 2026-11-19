// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import {
  addMark,
  addWatchNote,
  markFiles,
  readMark,
  readMarks,
  recordMarkStep,
  recordRenewal,
  setMarkStatus,
  updateMark,
} from "@/lib/data/api/marks";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's trademarks client against the real stack (ws-notes/duties/spec.md §6.6):
 * every answer passes its schema, without the rule book and with it, the fee check's both
 * shapes, and a refusal arrives as the service's sentence. Invented marks only.
 */

let stack: Stack;
const today = () => localDay(new Date());

beforeAll(async () => {
  stack = await startStack({ env: true, modules: ["files", "marks"] });
}, 60_000);
afterAll(() => stack.stop());

describe("the portal and the trademark register agree", () => {
  it("without the rule book", async () => {
    const made = await addMark(
      { name: "WALK MARK", class_number: "9", applied_on: addDays(today(), -10) },
      WALKER,
      crypto.randomUUID(),
    );
    const page = await readMark(made.mark.mark_id);
    expect(page.rules_here).toBe(false);
    expect(page.clocks.every((clock) => clock.rule === null)).toBe(true);
    const list = await readMarks();
    expect(list.fee.rule).toBeNull();
    expect(list.fee.readings).toHaveLength(2);
  });

  it("with the stand-in rules: steps, status, renewal, watch, files, the fee check", async () => {
    await stack.ask("POST", "/data/_test/marks/duty-rules", { by: WALKER });
    const made = await addMark(
      {
        name: "WALK LOGO",
        kind: "device",
        class_number: "42",
        application_number: "WALK-0000003",
        applied_on: addDays(today(), -30),
        filed_as_startup: "yes",
        fee_paid: "4500",
      },
      WALKER,
      crypto.randomUUID(),
    );
    const id = made.mark.mark_id;
    await updateMark(id, { agent: "Walk Agent" }, WALKER);
    const step = await recordMarkStep(
      id,
      { step: "exam_report", on: addDays(today(), -2) },
      WALKER,
    );
    expect(step.mark.status).toBe("objected");
    await setMarkStatus(id, { status: "registered", on: today() }, WALKER);
    await addWatchNote(
      id,
      { text: "WALK LOGOS in Journal 2140", on: today() },
      WALKER,
      crypto.randomUUID(),
    );
    const filed = await markFiles(
      id,
      { content: Buffer.from("invented certificate").toString("base64"), name: "certificate.txt" },
      WALKER,
    );
    expect(filed.files).toHaveLength(1);
    const page = await readMark(id);
    expect(page.fee_check).toEqual({
      words: null,
      rule: expect.objectContaining({ readings: ["₹4,500", "₹9,000"] }),
    });
    await recordRenewal(
      id,
      { renewed_on: today(), expires_on: page.renewal_expires_on!, srn: "WALK-SRN-0002" },
      WALKER,
    );
    const detached = await markFiles(
      id,
      { file_id: filed.files[0]!.file_id, detach: true },
      WALKER,
    );
    expect(detached.files).toHaveLength(0);
    await expect(
      addMark({ name: "WALK BAD", class_number: "0" }, WALKER, crypto.randomUUID()),
    ).rejects.toMatchObject({ status: 400, message: "A class is a number from 1 to 45." });
  });
});
