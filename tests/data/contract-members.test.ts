// @vitest-environment node
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readBuild, startBuild } from "@/lib/data/api/builds";
import {
  addClass,
  addMember,
  cancelCertificate,
  issueCertificate,
  readMembers,
  recordEntry,
  reverseEntry,
  updateMember,
  type MemberInput,
} from "@/lib/data/api/members";
import { DataRequestError } from "@/lib/data/socket";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's register-of-members client against the real stack (ws-notes/company/spec.md
 * §7.9): every function's answer passes its schema, the CSV builds, and a refusal reaches
 * the portal as the service's own sentence.
 */

let stack: Stack;
let today = "";

beforeAll(async () => {
  stack = await startStack({ env: true, modules: ["files", "members"] });
  today = String((await stack.ask("GET", "/data/_test/day")).json?.day ?? "");
}, 60_000);
afterAll(() => stack.stop());

const member = (name: string): MemberInput => ({
  name,
  kind: "person",
  email: `${name.toLowerCase().replace(/ /g, ".")}@walk.example`,
  address: "Invented",
  id_number: "ZZZPZ0000Z",
  residency: "resident",
  nationality: "Indian",
  backers_note: "",
  became_member_on: "2025-08-14",
});

describe("the portal and the register agree", () => {
  it("on every class, member, entry and certificate call", async () => {
    const made = await addClass(
      { name: "Equity shares of ₹10 each", kind: "equity", nominal: 10 },
      WALKER,
      randomUUID(),
    );
    const classId = made.class.class_id;
    const founder = (await addMember(member("Walk Founder"), WALKER, randomUUID())).member;
    await updateMember(founder.member_id, { nationality: "Indian" }, WALKER);
    const entry = await recordEntry(
      {
        member_id: founder.member_id,
        class_id: classId,
        kind: "subscription",
        shares: 10_000,
        distinctive_from: 1,
        distinctive_to: 10_000,
        price_per_share: 10,
        paid_up_per_share: 10,
        on: "2025-08-14",
        entered_on: "2025-08-14",
        resolution_id: "",
        resolution_words: "Subscribers to the memorandum",
        note: "",
      },
      WALKER,
      randomUUID(),
    );
    expect(entry.entry.folio).toBe("F001");
    const extra = await recordEntry(
      {
        member_id: founder.member_id,
        class_id: classId,
        kind: "allotment",
        shares: 5,
        distinctive_from: "",
        distinctive_to: "",
        price_per_share: "",
        paid_up_per_share: "",
        on: today,
        entered_on: today,
        resolution_id: "",
        resolution_words: "",
        note: "",
      },
      WALKER,
      randomUUID(),
    );
    await reverseEntry(extra.entry.entry_id, { on: today, why: "Invented" }, WALKER);
    const certificate = await issueCertificate(
      {
        member_id: founder.member_id,
        class_id: classId,
        shares: 10_000,
        distinctive_from: 1,
        distinctive_to: 10_000,
        number: "",
        issued_on: today,
        stamp_amount: "",
        stamp_reference: "",
        content: Buffer.from("invented certificate").toString("base64"),
        name: "c.txt",
      },
      WALKER,
      randomUUID(),
    );
    expect(certificate.certificate.number).toBe("SC-001");
    await cancelCertificate(
      certificate.certificate.certificate_id,
      { on: today, why: "Invented" },
      WALKER,
    );
    for (const view of ["register", "certificates", "holdings"]) {
      const page = await readMembers(view);
      expect(page.view).toBe(view);
      expect(page.holdings[0]?.words).toBe("10,000 of 10,000 · 100.0 per cent");
      expect(page.certificates[0]?.file?.title).toBe("Share certificate SC-001 – Walk Founder");
    }
    const started = await startBuild({ kind: "members_csv", by: WALKER });
    let build = started.build;
    for (let tries = 0; tries < 100 && build.state === "building"; tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      build = (await readBuild(build.build_id)).build;
    }
    expect(build.state).toBe("ready");
    expect(build.name).toBe(`Register of members ${today}.csv`);
  });

  it("refusals arrive as sentences", async () => {
    const refused = await addClass(
      { name: "Equity shares of ₹10 each", kind: "equity", nominal: 10 },
      WALKER,
      randomUUID(),
    ).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(DataRequestError);
    expect((refused as DataRequestError).message).toBe(
      "There is already a class called Equity shares of ₹10 each.",
    );
  });
});
