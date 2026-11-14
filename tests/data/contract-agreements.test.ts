// @vitest-environment node
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays } from "../../scripts/data/days";
import {
  addAgreement,
  attachAgreementCopy,
  readAgreement,
  readAgreements,
  recordNoticeGiven,
  setAgreementStatus,
  updateAgreement,
  type AgreementInput,
} from "@/lib/data/api/agreements";
import { readDataOverview } from "@/lib/data/api/overview";
import { DataRequestError } from "@/lib/data/socket";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's Agreements client against the real stack (ws-notes/company/spec.md §7.9):
 * every function's answer passes its schema, the overview parses with an "agreement" row in
 * Due, and a refusal reaches the portal as the service's own sentence.
 */

let stack: Stack;
let today = "";

beforeAll(async () => {
  stack = await startStack({ env: true, modules: ["files", "agreements"] });
  today = String((await stack.ask("GET", "/data/_test/day")).json?.day ?? "");
}, 60_000);
afterAll(() => stack.stop());

const input = (change: Partial<AgreementInput> = {}): AgreementInput => ({
  title: "Walk NDA",
  type: "nda",
  parties: [{ kind: "other", ref_id: null, name: "Walk Pilot Fund", entity: "", country: "India" }],
  status: "signed",
  effective_on: today,
  signed_on: today,
  term_months: 12,
  ends_on: "",
  auto_renews: true,
  renews_on: addDays(today, 40),
  renewal_months: 12,
  notice_days: 30,
  terminate_for_convenience: "30 days' notice",
  governing_law: "India",
  forum: "Courts of Walk Town",
  value_amount: 250000,
  value_currency: "INR",
  signing: "aadhaar_esign",
  stamp_state: "Walk State",
  stamp_amount: 100,
  stamp_certificate_no: "WALK-STAMP-1",
  related_party: false,
  personal_data: false,
  ip_clause: "no",
  confidentiality_clause: "yes",
  owner: "Walk Owner",
  review_on: "",
  notes: "Invented",
  ...change,
});

describe("the portal and Agreements agree", () => {
  it("on every agreement call", async () => {
    const { agreement } = await addAgreement(
      { ...input(), content: Buffer.from("invented nda").toString("base64"), name: "nda.txt" },
      WALKER,
      randomUUID(),
    );
    const id = agreement.agreement_id;
    expect(agreement.signed_file_id).toBeTruthy();
    const overview = await readDataOverview();
    expect(overview.due.find((row) => row.key === `agreement:${id}:notice`)).toMatchObject({
      kind: "agreement",
      due_on: addDays(today, 10),
    });
    await updateAgreement(id, { review_on: addDays(today, 5) }, WALKER);
    await attachAgreementCopy(
      id,
      {
        content: Buffer.from("invented record").toString("base64"),
        name: "r.txt",
        kind: "audit_trail",
      },
      WALKER,
    );
    await recordNoticeGiven(id, { on: today, note: "Invented" }, WALKER);
    const page = await readAgreement(id);
    expect(page.worked).toMatchObject({ notice_state: "given", renews_on: addDays(today, 40) });
    expect(page.audit_file?.title).toBe("Walk NDA – signing record");
    await setAgreementStatus(id, { status: "terminated", on: today }, WALKER);
    const live = await readAgreements();
    expect(live.counts).toMatchObject({ all: 0, ended: 1 });
    const ended = await readAgreements({ ended: true, q: "walk pilot" });
    expect(ended.agreements[0]).toMatchObject({ agreement_id: id, notice_state: "given" });
    expect(ended.missing).toHaveLength(8);
  });

  it("refusals arrive as sentences", async () => {
    const refused = await addAgreement(input({ title: "" }), WALKER, randomUUID()).catch(
      (error: unknown) => error,
    );
    expect(refused).toBeInstanceOf(DataRequestError);
    expect((refused as DataRequestError).message).toBe("Give the agreement a title.");
  });
});
