// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { MembersRegister } from "../../scripts/data/company-contracts";
import { addDays } from "../../scripts/data/days";
import { holdingWords, ofWords, perCentWords } from "../../src/lib/data/labels-registers";
import { WALKER, codeOf, startStack, type RawAnswer, type Stack } from "./helpers";

/**
 * The register of members (ws-notes/company/spec.md §7.9): a class, two subscribers and an
 * allotment with distinctive numbers added up into holdings in words (never a "%"); an
 * overlapping entry and a transfer over the holding refused; a reversed entry kept and
 * left out of holdings; certificates and their refusals; `members.allot` once per closing
 * key and `reverse` by it; the CSV's header and one line per entry. Everyone is invented.
 */

let stack: Stack;
let today = "";

const post = (path: string, body: Record<string, unknown> = {}) =>
  stack.ask("POST", path, { by: WALKER, ...body });
const message = (answer: RawAnswer) =>
  String((answer.json?.error as { message?: unknown } | undefined)?.message ?? "");

type Page = {
  holdings: { name: string; shares: number; of: number; words: string }[];
  entries: { entry_id: string; reversed: unknown; kind: string; shares: number }[];
  members: { member_id: string; folio: string; name: string; holds: { words: string }[] }[];
  certificates: { number: string; cancelled: unknown }[];
  totals: { issued: number }[];
};
const page = async (view = "register") =>
  (await stack.ask("GET", `/data/members?view=${view}`)).json as unknown as Page;

beforeAll(async () => {
  stack = await startStack({ modules: ["files", "members"] });
  today = String((await stack.ask("GET", "/data/_test/day")).json?.day ?? "");
}, 60_000);
afterAll(() => stack.stop());

describe("words for proportions", () => {
  it("one decimal, rounded half up, and never a per cent sign", () => {
    expect(perCentWords(1_250, 11_250)).toBe("11.1 per cent");
    expect(perCentWords(9_000, 10_000)).toBe("90.0 per cent");
    expect(perCentWords(1, 8)).toBe("12.5 per cent");
    expect(perCentWords(1, 2_000)).toBe("0.1 per cent");
    expect(ofWords(1_250, 10_000)).toBe("1,250 of 10,000 · 12.5 per cent");
    expect(holdingWords(1_250, 10_000, "equity")).toBe(
      "1,250 of 10,000 equity shares · 12.5 per cent",
    );
  });
});

describe("the register through the stack", () => {
  let classId = "";
  let founder = "";
  let cofounder = "";
  let allotment = "";

  it("adds a class and refuses a second of the same name", async () => {
    const made = await post("/data/members/classes", {
      name: "Equity shares of ₹10 each",
      kind: "equity",
      nominal: 10,
    });
    expect(made.status).toBe(200);
    classId = String((made.json?.class as { class_id: string }).class_id);
    const again = await post("/data/members/classes", { name: "Equity shares of ₹10 each" });
    expect(again.status).toBe(409);
    expect(codeOf(again)).toBe("class_taken");
    expect(message(again)).toBe("There is already a class called Equity shares of ₹10 each.");
    const unnamed = await post("/data/members/classes", { name: "" });
    expect(message(unnamed)).toBe("Give the class a name, such as “Equity shares of ₹10 each”.");
  });

  it("two subscribers and an allotment add up to holdings in words", async () => {
    const add = async (name: string) => {
      const answer = await post("/data/members", {
        name,
        kind: "person",
        email: `${name.toLowerCase().replace(/ /g, ".")}@walk.example`,
        address: "Invented street, Walk town",
        id_number: "ZZZPZ0000Z",
        residency: "resident",
        nationality: "Indian",
        became_member_on: "2025-08-14",
      });
      expect(answer.status, message(answer)).toBe(200);
      return answer.json?.member as { member_id: string; folio: string };
    };
    const first = await add("Walk Founder");
    const second = await add("Walk Co-founder");
    expect([first.folio, second.folio]).toEqual(["F001", "F002"]);
    founder = first.member_id;
    cofounder = second.member_id;
    for (const [member, from, to] of [
      [founder, 1, 5_000],
      [cofounder, 5_001, 10_000],
    ] as const) {
      const entry = await post("/data/members/entries", {
        member_id: member,
        class_id: classId,
        kind: "subscription",
        shares: 5_000,
        distinctive_from: from,
        distinctive_to: to,
        price_per_share: 10,
        paid_up_per_share: 10,
        on: "2025-08-14",
        entered_on: "2025-08-14",
      });
      expect(entry.status, message(entry)).toBe(200);
    }
    const investor = (
      await post("/data/members", {
        name: "Walk Fund 281",
        kind: "fund",
        became_member_on: today,
      })
    ).json?.member as { member_id: string };
    const allotted = await post("/data/members/entries", {
      member_id: investor.member_id,
      class_id: classId,
      kind: "allotment",
      shares: 1_250,
      distinctive_from: 10_001,
      distinctive_to: 11_250,
      on: addDays(today, -10),
      entered_on: today,
    });
    expect(allotted.status, message(allotted)).toBe(200);
    allotment = String((allotted.json?.entry as { entry_id: string }).entry_id);
    expect(allotted.json?.warnings).toEqual([
      "Entered 10 days after the allotment; the rule is 7. Confirm with your CS.",
    ]);
    const holdings = (await page("holdings")).holdings;
    expect(holdings.find((row) => row.name === "Walk Fund 281")?.words).toBe(
      "1,250 of 11,250 · 11.1 per cent",
    );
    expect(JSON.stringify(holdings)).not.toContain("%");
  });

  it("refuses overlapping numbers, a wrong count and a transfer over the holding", async () => {
    const overlap = await post("/data/members/entries", {
      member_id: cofounder,
      class_id: classId,
      kind: "allotment",
      shares: 101,
      distinctive_from: 9_500,
      distinctive_to: 9_600,
      on: today,
      entered_on: today,
    });
    expect(overlap.status).toBe(409);
    expect(codeOf(overlap)).toBe("overlap");
    expect(message(overlap)).toBe("Shares 9,500–9,600 of this class are already in folio F002.");
    const count = await post("/data/members/entries", {
      member_id: cofounder,
      class_id: classId,
      shares: 100,
      distinctive_from: 20_000,
      distinctive_to: 20_200,
      on: today,
    });
    expect(message(count)).toBe("The distinctive numbers do not add up to 100 shares.");
    const tooMany = await post("/data/members/entries", {
      member_id: cofounder,
      class_id: classId,
      kind: "transfer_out",
      shares: 5_001,
      on: today,
      entered_on: today,
    });
    expect(tooMany.status).toBe(409);
    expect(codeOf(tooMany)).toBe("not_held");
    expect(message(tooMany)).toBe(
      "Folio F002 holds 5,000 of these shares; it cannot give up more.",
    );
    const backwards = await post("/data/members/entries", {
      member_id: cofounder,
      class_id: classId,
      shares: 1,
      on: today,
      entered_on: addDays(today, -1),
    });
    expect(message(backwards)).toBe("It cannot be entered before it happened.");
    const ahead = await post("/data/members/entries", {
      member_id: cofounder,
      class_id: classId,
      shares: 1,
      on: addDays(today, 1),
    });
    expect(message(ahead)).toBe("That day is in the future.");
  });

  it("a reversed entry stays, and leaves the holdings", async () => {
    const nowhy = await post(`/data/members/entries/${allotment}/reverse`, { on: today, why: "" });
    expect(message(nowhy)).toBe("Say why it is reversed.");
    const reversed = await post(`/data/members/entries/${allotment}/reverse`, {
      on: today,
      why: "Invented: entered twice",
    });
    expect(reversed.status).toBe(200);
    const after = await page();
    expect(after.entries.find((entry) => entry.entry_id === allotment)?.reversed).toBeTruthy();
    expect(after.holdings.some((row) => row.name === "Walk Fund 281")).toBe(false);
    expect(after.totals[0]?.issued).toBe(10_000);
    const twice = await post(`/data/members/entries/${allotment}/reverse`, { why: "Again" });
    expect(twice.status).toBe(409);
  });

  it("issues certificates, refuses a taken number or more than held, and cancels one", async () => {
    const issued = await post("/data/members/certificates", {
      member_id: founder,
      class_id: classId,
      shares: 5_000,
      distinctive_from: 1,
      distinctive_to: 5_000,
      issued_on: today,
      stamp_amount: 50,
      stamp_reference: "WALK-STAMP-1",
      content: Buffer.from("invented certificate").toString("base64"),
      name: "certificate.txt",
    });
    expect(issued.status, message(issued)).toBe(200);
    const certificate = issued.json?.certificate as {
      number: string;
      certificate_id: string;
      file_id: string;
    };
    expect(certificate.number).toBe("SC-001");
    expect(issued.json?.warnings).toEqual([
      "Issued more than 2 months after the allotment on 14 Aug 2025; the rule is within 2 months. Confirm with your CS.",
    ]);
    const file = (await stack.ask("GET", `/data/files/${certificate.file_id}`)).json!;
    expect(JSON.stringify(file)).toContain("04 Cap table and share issues");
    expect(JSON.stringify(file)).toContain("Share certificate SC-001, in the register of members");
    const taken = await post("/data/members/certificates", {
      member_id: cofounder,
      class_id: classId,
      shares: 10,
      number: "SC-001",
      issued_on: today,
    });
    expect(taken.status).toBe(409);
    expect(codeOf(taken)).toBe("number_taken");
    expect(message(taken)).toBe("Certificate SC-001 is already issued.");
    const more = await post("/data/members/certificates", {
      member_id: cofounder,
      class_id: classId,
      shares: 6_000,
      issued_on: today,
    });
    expect(more.status).toBe(409);
    const next = await post("/data/members/certificates", {
      member_id: cofounder,
      class_id: classId,
      shares: 5_000,
      issued_on: today,
    });
    expect((next.json?.certificate as { number: string }).number).toBe("SC-002");
    const cancelled = await post(
      `/data/members/certificates/${certificate.certificate_id}/cancel`,
      { on: today, why: "Invented: reissued" },
    );
    expect(cancelled.status).toBe(200);
    expect((await page("certificates")).certificates.map((item) => item.number)).toEqual([
      "SC-001",
      "SC-002",
    ]);
  });

  it("members.allot gives one entry per closing key, and reverse undoes it by the key", async () => {
    // The service, as the closing module reaches it, through a test of its own module.
    const holder = {
      name: "Walk Angel Syndicate",
      kind: "fund" as const,
      residency: "non_resident" as const,
      email: "partner@walkangels.example",
      address: "Invented",
      investor_id: "0123456789abcdef0123456789abcdef",
    };
    const call = async () =>
      (
        await stack.ask("POST", "/data/_test/members/allot", {
          by: WALKER,
          closing_key: "closing:walk-1",
          holder,
          class_id: classId,
          shares: 500,
          price_per_share: 400,
          allotted_on: today,
          entered_on: today,
        })
      ).json?.link as Awaited<ReturnType<MembersRegister["allot"]>>;
    const first = await call();
    const second = await call();
    expect(second).toEqual(first);
    expect(first).toMatchObject({ shares: 500, folio: "F004", reversed: false });
    const entries = (await page()).entries.filter((entry) => entry.kind === "allotment");
    expect(entries.filter((entry) => entry.shares === 500)).toHaveLength(1);
    const reversed = (
      await stack.ask("POST", "/data/_test/members/reverse", {
        by: WALKER,
        closing_key: "closing:walk-1",
        why: "Refunded",
      })
    ).json?.link as { reversed: boolean };
    expect(reversed.reversed).toBe(true);
  });

  it("the CSV: BOM, the header, one line per entry and one for a member without entries", async () => {
    await post("/data/members", { name: "Walk Nobody Yet", became_member_on: today });
    const started = await post("/data/builds", { kind: "members_csv" });
    const id = (started.json?.build as { build_id: string }).build_id;
    let state = "";
    for (let tries = 0; tries < 100 && state !== "ready"; tries += 1) {
      state = String(
        ((await stack.ask("GET", `/data/builds/${id}`)).json?.build as { state: string }).state,
      );
      if (state !== "ready") await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const bytes = await stack.ask("GET", `/data/builds/${id}/bytes`);
    const text = bytes.bytes.toString("utf8");
    expect(text.startsWith("﻿folio,name,kind,address,email,id_number,residency")).toBe(true);
    expect(text.split("\r\n")[0]).toBe(
      "﻿folio,name,kind,address,email,id_number,residency,nationality,became_member_on,ceased_on,class,entry,shares,distinctive_from,distinctive_to,price_per_share,paid_up_per_share,on,entered_on,resolution,certificate,reversed_on,reversed_why",
    );
    const lines = text.trim().split("\r\n").slice(1);
    const entries = (await page()).entries.length;
    expect(lines).toHaveLength(entries + 1);
    expect(lines.some((line) => line.startsWith("F005,Walk Nobody Yet"))).toBe(true);
  });
});
