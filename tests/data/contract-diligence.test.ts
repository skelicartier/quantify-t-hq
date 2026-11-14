// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import {
  addRedline,
  addReference,
  addTrial,
  closeDiligence,
  openDiligence,
  readDiligence,
  readEntryDiligence,
  recordClearance,
  recordTrialDecision,
  reopenDiligence,
  saveQuestionnaire,
  saveSecurityReview,
  sendSample,
  updateRedline,
  updateReference,
  updateTrial,
} from "@/lib/data/api/diligence";
import { DataRequestError } from "@/lib/data/socket";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's diligence client (ws-notes/company/spec.md §9.8) against the real stack with
 * Files and the waitlist: every answer passes the portal's own schema; a reference shared
 * before consent and a sample before clearance come back as the service's sentence.
 */

let stack: Stack;
let entryId = "";
const today = () => localDay(new Date());
const content = Buffer.from("invented bytes").toString("base64");

beforeAll(async () => {
  stack = await startStack({
    env: true,
    modules: ["files", "leads", "replies", "waitlist", "diligence"],
  });
  const added = await stack.ask("POST", "/data/waitlist", {
    email: "ravi@buyer2.example",
    firm: "Walk Buyer 2",
    by: WALKER,
  });
  expect(added.status).toBe(200);
  entryId = String((added.json?.entry as { entry_id: string }).entry_id);
}, 60_000);
afterAll(() => stack.stop());

describe("the portal and the diligence module agree", () => {
  it("on buyer diligence", async () => {
    const opened = await openDiligence(entryId, WALKER, crypto.randomUUID());
    const id = opened.diligence.diligence_id;
    const saved = await saveQuestionnaire(
      id,
      {
        received_on: today(),
        due_on: addDays(today(), 5),
        answered_on: "",
        questions: "120",
        file: { content, name: "questionnaire.xlsx" },
        answers: null,
      },
      WALKER,
    );
    expect(saved.diligence.questionnaire.file_id).not.toBeNull();
    await saveSecurityReview(
      id,
      { started_on: today(), finished_on: "", outcome: "", note: "" },
      WALKER,
    );
    const reference = {
      name: "Walk Referee",
      firm: "Walk Fund 9",
      role: "Partner",
      consent_on: today(),
      shared_on: "",
      outcome: "",
    };
    const withReference = await addReference(id, reference, WALKER);
    const refId = withReference.diligence.references[0]!.reference_id;
    await updateReference(id, refId, { ...reference, shared_on: today() }, WALKER);
    const redline = {
      document: "Pilot agreement",
      agreement_id: "",
      round: "",
      sent_on: today(),
      received_on: "",
      status: "with_them",
      file: null,
    };
    const withRedline = await addRedline(id, redline, WALKER);
    await updateRedline(
      id,
      withRedline.diligence.redlines[0]!.redline_id,
      { ...redline, status: "agreed" },
      WALKER,
    );
    await closeDiligence(id, WALKER);
    expect((await reopenDiligence(id, WALKER)).diligence.state).toBe("open");
    const entry = await readEntryDiligence(entryId);
    expect(entry.diligence?.references[0]?.shared_on).toBe(today());
    expect(entry.agreements).toBeNull();
    expect((await readDiligence()).counts.open).toBe(1);
  });

  it("on dataset trials, and the refusals' sentences", async () => {
    const made = await addTrial(
      entryId,
      {
        dataset: "Walk dataset",
        dictionary_version: "v0.3",
        starts_on: today(),
        ends_on: addDays(today(), 30),
        go_no_go_on: "",
      },
      WALKER,
      crypto.randomUUID(),
    );
    const id = made.trial.trial_id;
    const early = await sendSample(id, { sent_on: today(), file: null }, WALKER).catch(
      (caught: unknown) => caught,
    );
    expect(early).toBeInstanceOf(DataRequestError);
    expect((early as DataRequestError).message).toBe(
      "Their compliance team clears a trial before any data goes. Record when it was cleared.",
    );
    await updateTrial(
      id,
      {
        dataset: "Walk dataset",
        dictionary_version: "v0.4",
        starts_on: today(),
        ends_on: addDays(today(), 30),
        go_no_go_on: addDays(today(), 28),
      },
      WALKER,
    );
    await recordClearance(id, { cleared_on: today(), by_name: "Walk Compliance" }, WALKER);
    const sent = await sendSample(
      id,
      { sent_on: today(), file: { content, name: "sample.csv" } },
      WALKER,
    );
    expect(sent.trial.sample?.file_id).not.toBeNull();
    expect(
      (await recordTrialDecision(id, { outcome: "go", on: today(), note: "" }, WALKER)).trial
        .decision?.outcome,
    ).toBe("go");
    expect((await readDiligence()).trials[0]?.auto_renews).toBe(false);
  });
});
