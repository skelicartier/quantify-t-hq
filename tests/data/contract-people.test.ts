// @vitest-environment node
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays } from "../../scripts/data/days";
import { readDataOverview } from "@/lib/data/api/overview";
import {
  addDocument,
  addPerson,
  cancelOffboarding,
  grantAccess,
  neverHadAccess,
  readCopy,
  readPeople,
  readPerson,
  recordCertificate,
  recordEvaluation,
  recordPayment,
  revokeAccess,
  startOffboarding,
  updatePerson,
  withdrawPayment,
  type PersonInput,
} from "@/lib/data/api/people";
import { DataRequestError } from "@/lib/data/socket";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's people-ledger client against the real stack: every function's answer passes
 * its schema (a document's copy goes into Files), the overview parses with a "person" row
 * when asked as the Owner and without one otherwise, and the service's refusals reach the
 * portal as its own sentences. Every person is invented.
 */

let stack: Stack;
let today = "";

beforeAll(async () => {
  stack = await startStack({ env: true, modules: ["files", "people"] });
  today = String((await stack.ask("GET", "/data/_test/day")).json?.day ?? "");
}, 60_000);
afterAll(() => stack.stop());

const input = (change: Partial<PersonInput> = {}): PersonInput => ({
  name: "Walk Contract Intern",
  email: "contract@walkintern.example",
  kind: "intern",
  role_title: "Research intern",
  starts_on: addDays(today, -30),
  ends_on: addDays(today, 59),
  mentor: "Walk Mentor",
  brief: "Invented: the sector screens.",
  stipend: { amount: "15000", currency: "INR", pays_on: "7" },
  ...change,
});

describe("the people ledger's client", () => {
  it("passes every answer through its schema", async () => {
    const { person } = await addPerson(input(), WALKER, randomUUID());
    const id = person.person_id;
    expect(person.evaluations.midpoint.due_on).toBe(addDays(addDays(today, -30), 44));
    const list = await readPeople("all");
    expect(list.people.map((row) => row.person_id)).toContain(id);
    expect(list.people.find((row) => row.person_id === id)).toMatchObject({
      state: "engaged",
      letter: "missing",
      access: { held: 0, to_revoke: 0 },
    });
    expect((await readPeople("starting")).people).toEqual([]);
    expect((await updatePerson(id, { mentor: "Walk Other Mentor" }, WALKER)).person.mentor).toBe(
      "Walk Other Mentor",
    );
    const letter = await addDocument(
      id,
      {
        kind: "internship",
        title: "Internship letter",
        signed_on: addDays(today, -32),
        includes_ip: true,
        includes_confidentiality: true,
      },
      {
        name: "walk-letter.pdf",
        content: Buffer.from("%PDF-1.4 invented letter\n").toString("base64"),
      },
      WALKER,
      randomUUID(),
    );
    // The ledger keeps the copy itself (never in Files), and gives its bytes back whole.
    const copy = letter.person.documents[0]?.copy;
    expect(copy).toMatchObject({ name: "walk-letter.pdf", mime: "application/pdf", bytes: 25 });
    const read = await readCopy(id, copy!.copy_id);
    expect(Buffer.from(read.content, "base64").toString()).toBe("%PDF-1.4 invented letter\n");
    expect(read).toMatchObject({ type: "application/pdf", copy: { name: "walk-letter.pdf" } });
    const period = addDays(today, -30).slice(0, 7);
    const paid = await recordPayment(
      id,
      {
        period,
        amount: "15000",
        currency: "INR",
        paid_on: today,
        reference: "WALK-UTR-1",
        tds_deducted: "",
        note: "",
      },
      WALKER,
      randomUUID(),
    );
    const payment = paid.person.payments[0]!;
    expect(
      (await withdrawPayment(id, payment.payment_id, "Invented: a mistake", WALKER)).person
        .payments[0]?.withdrawn?.why,
    ).toBe("Invented: a mistake");
    const granted = await grantAccess(
      id,
      { system: "Code host", level: "Write", critical: true, granted_on: today, notes: "" },
      WALKER,
      randomUUID(),
    );
    const second = await grantAccess(
      id,
      { system: "Chat", level: "", critical: false, granted_on: "", notes: "" },
      WALKER,
      randomUUID(),
    );
    const [code, chat] = second.person.access;
    expect(granted.person.access).toHaveLength(1);
    const started = await startOffboarding(id, today, WALKER);
    expect(started.deadlines).toHaveLength(2);
    expect((await cancelOffboarding(id, WALKER)).person.offboarding).toBeNull();
    await startOffboarding(id, today, WALKER);
    await revokeAccess(id, code!.access_id, today, WALKER);
    const ended = await neverHadAccess(id, chat!.access_id, WALKER);
    expect(ended.person.ended_on).toBe(today);
    await recordEvaluation(
      id,
      "final",
      { held_on: today, by_name: "Walk Mentor", outcome: "completed", summary: "Invented." },
      WALKER,
    );
    const certificate = await recordCertificate(
      id,
      { number: "WALK-CERT-1", issued_on: today },
      null,
      WALKER,
    );
    expect(certificate.person.certificate?.number).toBe("WALK-CERT-1");
    const detail = await readPerson(id);
    expect(detail.state).toBe("ended");
    expect(detail.periods.find((item) => item.period === period)?.open).toBe(true);
    expect(detail.events.map((event) => event.verb)).toContain("ended");
  });

  it("gives the Owner the person rows in Due, and nobody else", async () => {
    await addPerson(input({ name: "Walk Due Contract" }), WALKER, randomUUID());
    const owner = await readDataOverview({ owner: true });
    expect(owner.due.some((row) => row.kind === "person" && row.owner_only === true)).toBe(true);
    const admin = await readDataOverview();
    expect(admin.due.some((row) => row.kind === "person")).toBe(false);
  });

  it("brings the service's refusals as its own sentences", async () => {
    const { person } = await addPerson(input({ name: "Walk Refused" }), WALKER, randomUUID());
    await expect(
      recordCertificate(person.person_id, { number: "X", issued_on: today }, null, WALKER),
    ).rejects.toMatchObject({
      status: 409,
      code: "needs_final",
      message: "Record the final evaluation as completed first: the certificate follows it.",
    });
    await expect(addPerson(input({ name: "" }), WALKER, randomUUID())).rejects.toBeInstanceOf(
      DataRequestError,
    );
    await expect(readPerson("not-a-person")).rejects.toMatchObject({ status: 404 });
  });
});
