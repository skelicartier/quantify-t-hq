// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  addCertification,
  addInsurance,
  addReview,
  addReviewAction,
  readAssuranceSummary,
  readCertification,
  readCertifications,
  readInsurance,
  readReview,
  readReviews,
  recordSurveillance,
  renewInsurance,
  reviewActionDone,
  saveAssuranceSetup,
  updateCertification,
  updateInsurance,
  updateReview,
} from "@/lib/data/api/assurance";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's assurance client against the real stack (ws-notes/security/spec.md §8.7): the
 * Summary with and without the Owner flag and with modules absent, certification through its
 * stages, insurance and its renewal, a review with inputs and actions; every answer passes its
 * schema, and a refusal arrives as the service's sentence. Invented names only.
 */

let stack: Stack;

beforeAll(async () => {
  stack = await startStack({ env: true, modules: ["files", "policies", "findings", "assurance"] });
}, 60_000);
afterAll(() => stack.stop());

describe("the portal and assurance agree", () => {
  it("the Summary parses, with modules absent and with a stand-in", async () => {
    const summary = await readAssuranceSummary(false);
    expect(summary.owner).toBe(false);
    expect(summary.absent.map((item) => item.name)).toEqual([
      "tools",
      "devices",
      "logs",
      "recovery",
      "questionnaires",
      "profiles",
    ]);
    await stack.ask("POST", "/data/_test/assurance/source", {
      by: WALKER,
      name: "tools",
      lines: [
        { key: "walk", area: "systems", title: "Tools", words: "Walk.", href: "/data/systems" },
      ],
    });
    const owner = await readAssuranceSummary(true);
    expect(owner.owner).toBe(true);
    expect(owner.areas[0]!.lines).toHaveLength(1);
  });

  it("certification, insurance and reviews parse in each state", async () => {
    const cert = await addCertification(
      {
        standard: "iso27001",
        status: "planning",
        body: "Walk Certification Body",
        stage1_on: "2099-02-10",
      },
      WALKER,
      crypto.randomUUID(),
    );
    const certId = cert.certification.cert_id;
    await updateCertification(
      certId,
      { status: "certified", issued_on: "2026-01-15", certificate_number: "WALK-CERT-0001" },
      WALKER,
    );
    await recordSurveillance(certId, 1, { held_on: "2026-11-01", outcome: "Invented." }, WALKER);
    await addCertification(
      {
        standard: "soc2",
        status: "planning",
        report_kind: "type2",
        report_from: "2026-01-01",
        report_to: "2026-06-30",
      },
      WALKER,
      crypto.randomUUID(),
    );
    const list = await readCertifications();
    expect(list.certifications).toHaveLength(2);
    expect((await readCertification(certId)).certification.days.length).toBeGreaterThan(0);

    const cover = await addInsurance(
      {
        kind: "cyber",
        insurer: "Walk Insurance",
        cover: "5000000",
        ends_on: "2026-03-31",
        starts_on: "2025-04-01",
      },
      WALKER,
      crypto.randomUUID(),
    );
    await updateInsurance(cover.insurance.insurance_id, { broker: "Walk Brokers" }, WALKER);
    await renewInsurance(
      cover.insurance.insurance_id,
      { starts_on: "2026-04-01", ends_on: "2099-03-31" },
      WALKER,
      crypto.randomUUID(),
    );
    await addInsurance(
      { kind: "other", name: "Walk special cover", insurer: "Walk Insurance" },
      WALKER,
      crypto.randomUUID(),
    );
    expect((await readInsurance()).insurance).toHaveLength(3);

    const review = await addReview(
      {
        held_on: "2026-11-01",
        attendees: "Walk Owner",
        inputs: { risks: "Invented risks." },
        actions: [{ what: "Walk action one", owner: "Walk Owner", due_on: "2099-01-15" }],
      },
      WALKER,
      crypto.randomUUID(),
    );
    const reviewId = review.review.review_id;
    await updateReview(reviewId, { decisions: "Invented decisions." }, WALKER);
    const added = await addReviewAction(
      reviewId,
      { what: "Walk action two", owner: "", due_on: "" },
      WALKER,
    );
    await reviewActionDone(added.review.actions[0]!.action_id, {}, WALKER);
    await saveAssuranceSetup({ review_months: "6" }, WALKER);
    expect((await readReviews()).next.months).toBe(6);
    expect((await readReview(reviewId)).review.actions_open).toBe(1);
    const lines = (await readAssuranceSummary(false)).areas[1]!.lines;
    expect(lines.map((line) => line.key)).toContain("assurance:review");
  });

  it("a refusal is the service's sentence", async () => {
    await expect(
      addInsurance({ kind: "cyber", insurer: "" }, WALKER, crypto.randomUUID()),
    ).rejects.toMatchObject({
      status: 400,
      message: "Name the insurer, in at most 120 characters.",
    });
  });
});
