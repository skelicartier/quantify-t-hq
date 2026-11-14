// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import { offersOf } from "../../scripts/data/closing/chain";
import type { Closing } from "../../scripts/data/closing/types";
import { addDays, localDay } from "../../scripts/data/days";
import { backersLine } from "@/lib/data/labels-close";
import { WALKER, closeKit, codeOf, firm, messageOf, type CloseKit } from "./close-kit";
import { peopleCsv, startKit } from "./leads-kit";

/**
 * The close (ws-notes/company/spec.md §9.3, §9.4) on the real closing module: every refusal,
 * each guardrail shown and not shown, the offers across two financial years and per class,
 * a pooled holder whose backers keep their currencies apart, the register entry made once
 * through `members`, a refund that takes back the money's dates and reverses the entry,
 * steps cleared only in order, a changed day rebasing its dates, and `investors-close` for a
 * firm with and without a qualification. Every firm is invented, on `.example`.
 */

let kits: { close(): void }[] = [];
afterEach(() => {
  for (const kit of kits) kit.close();
  kits = [];
});

const today = () => localDay(new Date());
const ago = (days: number) => addDays(today(), -days);

async function fresh(firms = [firm(1)]): Promise<CloseKit> {
  const kit = await closeKit({ firms });
  kits.push(kit);
  return kit;
}

const start = (kit: CloseKit, id: string) => kit.post(`/data/closing/${id}/start`);
const step = (kit: CloseKit, id: string, name: string, body: Record<string, unknown> = {}) =>
  kit.post(`/data/closing/${id}/steps/${name}`, body);
const detail = async (kit: CloseKit, id: string) => (await kit.get(`/data/closing/${id}`)).body;
const guardKeys = async (kit: CloseKit, id: string) =>
  ((await detail(kit, id)).guardrails as { key: string }[]).map((item) => item.key);

const paid = (kit: CloseKit, id: string, change: Record<string, unknown> = {}) =>
  step(kit, id, "money-received", {
    on: ago(30),
    amount: "2500000",
    currency: "INR",
    own_account: true,
    reference: "WALK-FIRC-1",
    add_dates: true,
    ...change,
  });

describe("refusals", () => {
  it("a firm that is not here, a second closing, and a firm before Soft commit", async () => {
    const early = firm(2, { stage: "met" });
    const kit = await fresh([firm(1), early]);
    const missing = await start(kit, "c4000000000000000000000000000999");
    expect([missing.status, codeOf(missing), messageOf(missing)]).toEqual([
      404,
      "not_found",
      "That firm is not here.",
    ]);
    expect((await start(kit, firm(1).investor_id)).status).toBe(200);
    const again = await start(kit, firm(1).investor_id);
    expect([again.status, codeOf(again), messageOf(again)]).toEqual([
      409,
      "closing_open",
      "This firm's closing is open already.",
    ]);
    expect(codeOf(await start(kit, early.investor_id))).toBe("too_early");
    expect((await detail(kit, early.investor_id)).can_start).toBe(false);
  });

  it("the terms: the instrument, the holder's name, the class when the register is here", async () => {
    const kit = await fresh();
    const id = firm(1).investor_id;
    await start(kit, id);
    const terms = (body: Record<string, unknown>) =>
      kit.post(`/data/closing/${id}/terms`, {
        instrument: "iSAFE",
        holder: { name: "Walk Fund 1", kind: "fund" },
        ...body,
      });
    expect(messageOf(await terms({ instrument: "Shares" }))).toBe("Choose the instrument.");
    expect(messageOf(await terms({ holder: { name: " " } }))).toBe(
      "Give the holder's name, as it goes in the register.",
    );
    expect(messageOf(await terms({ shares: "12.5" }))).toBe(
      "Give the number of shares as a whole number.",
    );
    await kit.post("/data/_test/closing/members");
    expect(messageOf(await terms({ class_id: "other-class" }))).toBe(
      "That class of shares is not in the register.",
    );
    expect((await terms({ class_id: "stand-in-equity", shares: "1250" })).status).toBe(200);
  });

  it("step days, the serial, the amount; and the allotment before the money", async () => {
    const kit = await fresh();
    const id = firm(1).investor_id;
    await start(kit, id);
    expect(messageOf(await step(kit, id, "offer-letter", { on: ago(1) }))).toBe(
      "Give the offer letter's serial number.",
    );
    expect(
      messageOf(
        await step(kit, id, "offer-letter", { on: addDays(today(), 1), serial: "PAS-4/001" }),
      ),
    ).toBe("That day has not come yet.");
    expect(messageOf(await paid(kit, id, { amount: "lots" }))).toBe(
      "Type the amount as a number, such as 2500000.",
    );
    const early = await step(kit, id, "allotment", {
      on: ago(5),
      shares: "10",
      price_per_share: "10",
    });
    expect([early.status, codeOf(early), messageOf(early)]).toEqual([
      409,
      "no_money",
      "Record the money received first: shares are allotted after it arrives.",
    ]);
    await paid(kit, id);
    const before = await step(kit, id, "allotment", {
      on: ago(31),
      shares: "10",
      price_per_share: "10",
    });
    expect(before.status).toBe(400);
    expect(messageOf(before)).toMatch(
      /^Shares are allotted after the money arrives: that day is before \d{1,2} \w{3} \d{4}\.$/,
    );
    expect(messageOf(await step(kit, id, "register", { on: ago(1) }))).toBe(
      "Record the allotment first.",
    );
  });

  it("register and certificate by hand need the folio and the number; a refund only before allotment", async () => {
    const kit = await fresh();
    const id = firm(1).investor_id;
    await start(kit, id);
    await paid(kit, id);
    await step(kit, id, "allotment", { on: ago(2), shares: "1250", price_per_share: "1000" });
    expect(messageOf(await step(kit, id, "register", { on: ago(1) }))).toBe("Give the folio.");
    expect(messageOf(await step(kit, id, "certificate", { on: ago(1) }))).toBe(
      "Give the certificate number.",
    );
    const refund = await step(kit, id, "refund", {
      on: ago(1),
      amount: "2500000",
      currency: "INR",
    });
    expect([refund.status, codeOf(refund), messageOf(refund)]).toEqual([
      409,
      "allotted",
      "Shares were allotted, so there is nothing to refund.",
    ]);
    expect((await step(kit, id, "register", { on: ago(1), folio: "F003" })).status).toBe(200);
    expect((await detail(kit, id)).closing).toMatchObject({
      register: { folio: "F003", by_hand: true },
    });
  });

  it("clearing a step that later steps rest on is refused, in order it is allowed", async () => {
    const kit = await fresh();
    const id = firm(1).investor_id;
    await kit.post("/data/_test/closing/key-dates");
    await start(kit, id);
    await paid(kit, id);
    await step(kit, id, "allotment", {
      on: ago(2),
      shares: "1250",
      price_per_share: "1000",
      add_dates: true,
    });
    await step(kit, id, "register", { on: ago(1), folio: "F003" });
    const money = await kit.post(`/data/closing/${id}/steps/money-received/clear`);
    expect([money.status, codeOf(money), messageOf(money)]).toEqual([
      409,
      "later_steps",
      "Clear the later steps first: allotment.",
    ]);
    const allotment = await kit.post(`/data/closing/${id}/steps/allotment/clear`);
    expect(messageOf(allotment)).toBe("Clear the later steps first: register of members.");
    expect((await kit.post(`/data/closing/${id}/steps/register/clear`)).status).toBe(200);
    const cleared = await kit.post(`/data/closing/${id}/steps/allotment/clear`);
    expect(cleared.status).toBe(200);
    const links = cleared.body.key_dates as { rule_key: string; state: string }[];
    expect(links.find((link) => link.rule_key === "pas-3")?.state).toBe("taken_back");
    expect((await kit.post(`/data/closing/${id}/steps/money-received/clear`)).status).toBe(200);
  });

  it("a closing that does not exist yet, and an unknown step", async () => {
    const kit = await fresh();
    const id = firm(1).investor_id;
    expect(codeOf(await paid(kit, id))).toBe("no_closing");
    await start(kit, id);
    expect((await step(kit, id, "handshake")).status).toBe(404);
  });
});

describe("guardrails, shown and not shown", () => {
  it("SAFE from a non-resident until the closing's own instrument says otherwise", async () => {
    const kit = await fresh();
    const id = firm(1).investor_id;
    expect(await guardKeys(kit, id)).toEqual(["safe-non-resident"]);
    const first = (
      (await detail(kit, id)).guardrails as { confirm_with: string; source_url: string }[]
    )[0];
    expect(first?.confirm_with).toBe("lawyer");
    expect(first?.source_url).toMatch(/^https:\/\//);
    await start(kit, id);
    await kit.post(`/data/closing/${id}/terms`, {
      instrument: "iSAFE",
      holder: { name: "Walk Fund 1", kind: "fund" },
    });
    expect(await guardKeys(kit, id)).toEqual([]);
    kit.firms.set(
      id,
      firm(1, {
        residency: "resident",
        latest: { state: "soft", amount: 25_000, currency: "USD", instrument: "SAFE" },
      }),
    );
    await kit.post(`/data/closing/${id}/terms`, {
      instrument: "SAFE",
      holder: { name: "Walk Fund 1", kind: "fund" },
    });
    expect(await guardKeys(kit, id)).toEqual([]);
  });

  it("a note: DPIIT not known without the company record, and under ₹25 lakh", async () => {
    const kit = await fresh([
      firm(1, {
        residency: "resident",
        latest: { state: "soft", amount: 2_000_000, currency: "INR", instrument: "Note" },
      }),
    ]);
    const id = firm(1).investor_id;
    const note = ((await detail(kit, id)).guardrails as { key: string; extra: string }[])[0];
    expect(note?.key).toBe("note");
    expect(note?.extra).toBe("DPIIT recognition: Not known. This amount is under ₹25 lakh.");
    kit.firms.set(
      id,
      firm(1, {
        residency: "resident",
        latest: { state: "soft", amount: 3_000_000, currency: "INR", instrument: "Note" },
      }),
    );
    expect(((await detail(kit, id)).guardrails as { extra: string }[])[0]?.extra).toBe(
      "DPIIT recognition: Not known.",
    );
  });

  it("residency not known at Soft commit; not before it", async () => {
    const kit = await fresh([
      firm(1, { residency: "", latest: null }),
      firm(2, { residency: "", stage: "met", latest: null }),
    ]);
    expect(await guardKeys(kit, firm(1).investor_id)).toEqual(["residency-unknown"]);
    expect(await guardKeys(kit, firm(2).investor_id)).toEqual([]);
  });

  it("money not from the investor's own account, and KYC not from the receiving bank", async () => {
    const kit = await fresh();
    const id = firm(1).investor_id;
    await start(kit, id);
    await kit.post(`/data/closing/${id}/terms`, {
      instrument: "iSAFE",
      holder: { name: "Walk Fund 1", kind: "fund" },
    });
    await paid(kit, id, { own_account: false });
    expect(await guardKeys(kit, id)).toEqual(["own-account"]);
    await paid(kit, id, { own_account: true });
    await step(kit, id, "bank-kyc", { on: ago(10), from_receiving_bank: false });
    expect(await guardKeys(kit, id)).toEqual(["receiving-bank"]);
    await step(kit, id, "bank-kyc", { on: ago(10), from_receiving_bank: true });
    expect(await guardKeys(kit, id)).toEqual([]);
  });

  it("a valuation 98 days old on the allotment day, and an allotment later than 60 days", async () => {
    const kit = await fresh([firm(1, { residency: "resident" })]);
    const id = firm(1).investor_id;
    await start(kit, id);
    await kit.post(`/data/closing/${id}/terms`, {
      instrument: "CCPS",
      holder: { name: "Walk Fund 1", kind: "fund" },
    });
    await step(kit, id, "valuation", {
      on: ago(100),
      by_name: "Walk Valuer",
      kind: "registered_valuer",
    });
    expect(await guardKeys(kit, id)).toEqual(["valuation-age"]);
    await paid(kit, id, { on: ago(80) });
    await step(kit, id, "allotment", { on: ago(2), shares: "1250", price_per_share: "1000" });
    const warnings = (await detail(kit, id)).guardrails as { key: string; words: string }[];
    expect(warnings.map((item) => item.words)).toEqual([
      "The valuation is 98 days old on the allotment day; the rule is at most 90.",
      "Allotted 78 days after the money arrived; the rule is 60.",
    ]);
  });
});

describe("offers this financial year", () => {
  const offered = (id: string, on: string, classId: string | null = null): Closing => ({
    closing_id: id,
    investor_id: id,
    firm: id,
    instrument: "iSAFE",
    class_id: classId,
    shares: null,
    price_per_share: null,
    holder: { name: id, kind: "fund", email: "", address: "" },
    pooled: null,
    documents_sent: null,
    documents_signed: null,
    offer_letter: { on, serial: "PAS-4/001", file_id: null, at: "", by: WALKER },
    money_received: null,
    bank_kyc: null,
    valuation: null,
    board_approval: null,
    allotment: null,
    register: null,
    certificate: null,
    refund: null,
    notes: "",
    created_at: "",
    created_by: WALKER,
    updated_at: "",
    updated_by: WALKER,
  });

  it("two in 2026-27 and one in 2027-28, as §5.7 says, and per class when two are in use", () => {
    const closings = [
      offered("a", "2027-01-05"),
      offered("b", "2027-01-05"),
      offered("c", "2027-04-10"),
    ];
    const name = () => "Equity";
    expect(offersOf(closings, "2027-02-01", 200, name)).toMatchObject({
      fy: "2026-27",
      count: 2,
      limit: 200,
      by_class: [],
    });
    expect(offersOf(closings, "2027-05-01", 200, name)).toMatchObject({ fy: "2027-28", count: 1 });
    const classes = [offered("a", "2027-01-05", "eq"), offered("b", "2027-01-05", "pref")];
    expect(
      offersOf(classes, "2027-02-01", 200, (id) => (id === "eq" ? "Equity" : "Preference"))
        .by_class,
    ).toEqual([
      { class_name: "Equity", count: 1 },
      { class_name: "Preference", count: 1 },
    ]);
  });

  it("the Closing view counts an offer letter recorded today", async () => {
    const kit = await fresh();
    const id = firm(1).investor_id;
    await start(kit, id);
    expect(((await kit.get("/data/closing")).body.offers as { count: number }).count).toBe(0);
    await step(kit, id, "offer-letter", { on: today(), serial: "PAS-4/001" });
    expect(((await kit.get("/data/closing")).body.offers as { count: number }).count).toBe(1);
  });
});

describe("a pooled holder", () => {
  it("is one holder with three backers in two currencies, never added across", async () => {
    const kit = await fresh();
    const id = firm(1).investor_id;
    await start(kit, id);
    const saved = await kit.post(`/data/closing/${id}/terms`, {
      instrument: "iSAFE",
      holder: { name: "Walk Syndicate 1", kind: "fund" },
      pooled: {
        kind: "syndicate",
        backers: [
          { name: "Walk Backer 1", amount: "2500000", currency: "INR" },
          { name: "Walk Backer 2", amount: "2000000", currency: "INR" },
          { name: "Walk Backer 3", amount: "20000", currency: "USD" },
        ],
        fee_note: "2 per cent carry, as typed",
      },
    });
    expect(saved.status).toBe(200);
    const pooled = (saved.body.closing as Closing).pooled!;
    expect(backersLine(pooled.backers)).toBe("3 backers · ₹45,00,000 and $20,000");
    const refused = await kit.post(`/data/closing/${id}/terms`, {
      instrument: "iSAFE",
      holder: { name: "Walk Syndicate 1", kind: "fund" },
      pooled: { kind: "syndicate", backers: [{ name: "", amount: "1", currency: "INR" }] },
    });
    expect(messageOf(refused)).toBe("Give each backer's name.");
  });
});

describe("the register, the refund and a changed day", () => {
  it("members.allot is called once with the closing's data, and the register step reads its folio", async () => {
    const kit = await fresh();
    const id = firm(1).investor_id;
    await kit.post("/data/_test/closing/key-dates");
    await kit.post("/data/_test/closing/members");
    await start(kit, id);
    await kit.post(`/data/closing/${id}/terms`, {
      instrument: "iSAFE",
      class_id: "stand-in-equity",
      holder: { name: "Walk Fund 1", kind: "fund" },
    });
    await paid(kit, id);
    await step(kit, id, "allotment", { on: ago(2), shares: "1250", price_per_share: "1000" });
    const entered = await step(kit, id, "register");
    expect((entered.body.closing as Closing).register).toMatchObject({
      folio: "F-STAND-IN",
      by_hand: false,
    });
    const calls = (await kit.get("/data/_test/closing/members")).body.calls as unknown[];
    expect(calls).toEqual([
      { closing_key: `closing:${id}`, shares: 1250, class_id: "stand-in-equity" },
    ]);
    expect(((await detail(kit, id)).register as { folio: string }).folio).toBe("F-STAND-IN");
  });

  it("a refund takes back the money's dates and leaves no register entry standing", async () => {
    const kit = await fresh();
    const id = firm(1).investor_id;
    await kit.post("/data/_test/closing/key-dates");
    await kit.post("/data/_test/closing/members");
    await start(kit, id);
    await paid(kit, id, { on: ago(70) });
    expect((await detail(kit, id)).refund_date_due).toBe(true);
    const refundDate = await kit.post(`/data/closing/${id}/refund-date`);
    expect(
      (refundDate.body.key_dates as { rule_key: string }[]).map((link) => link.rule_key),
    ).toContain("refund");
    const refunded = await step(kit, id, "refund", {
      on: ago(1),
      amount: "2500000",
      currency: "INR",
    });
    expect(refunded.status).toBe(200);
    const links = refunded.body.key_dates as { rule_key: string; state: string }[];
    expect(links.find((link) => link.rule_key === "allotment")?.state).toBe("taken_back");
    expect(links.find((link) => link.rule_key === "refund")?.state).toBe("done");
    expect(
      codeOf(await step(kit, id, "allotment", { on: ago(1), shares: "1", price_per_share: "1" })),
    ).toBe("refunded");
  });

  it("a changed day rebases the origin's open dates", async () => {
    const kit = await fresh([firm(1, { residency: "resident" })]);
    const id = firm(1).investor_id;
    await kit.post("/data/_test/closing/key-dates");
    await start(kit, id);
    await paid(kit, id, { on: ago(30) });
    const before = ((await detail(kit, id)).key_dates as { rule_key: string; due_on: string }[])[0];
    expect(before?.due_on).toBe(addDays(ago(30), 60));
    await paid(kit, id, { on: ago(20) });
    const after = ((await detail(kit, id)).key_dates as { rule_key: string; due_on: string }[])[0];
    expect(after?.due_on).toBe(addDays(ago(20), 60));
  });

  it("without Key dates the deadlines are still worked out, and the dates button refuses", async () => {
    const kit = await fresh([firm(1, { residency: "resident" })]);
    const id = firm(1).investor_id;
    await start(kit, id);
    await paid(kit, id, { on: ago(30) });
    const page = await detail(kit, id);
    expect(page.key_dates).toBeNull();
    expect(page.key_dates_here).toBe(false);
    expect(page.deadlines).toEqual([
      { rule_key: "allotment", title: "Allot by", on: addDays(ago(30), 60), done_on: null },
      { rule_key: "refund", title: "Refund by", on: addDays(ago(30), 75), done_on: null },
    ]);
    expect(codeOf(await kit.post(`/data/closing/${id}/key-dates`))).toBe("key_dates_missing");
  });

  it("the copies go into their folders, and 'Used for' names them", async () => {
    const kit = await fresh();
    const id = firm(1).investor_id;
    await start(kit, id);
    const content = Buffer.from("invented letter").toString("base64");
    const offer = await step(kit, id, "offer-letter", {
      on: ago(3),
      serial: "PAS-4/001",
      content,
      name: "offer.pdf",
    });
    const fileId = String((offer.body.closing as Closing).offer_letter?.file_id);
    await paid(kit, id, { content, name: "firc.pdf" });
    expect(kit.folders).toEqual([
      ["10 Fundraising and investors"],
      ["04 Cap table and share issues"],
    ]);
    const service = kit.core.need<{ usedFor(id: string): { label: string }[] }>("closing");
    expect(service?.usedFor(fileId)).toEqual([
      { label: "Offer letter to Walk Fund 1", href: `/data/investors/${id}#investor-closing` },
    ]);
  });
});

describe("investors-close", () => {
  it("reads a firm with and without a qualification, and the round's instrument", async () => {
    const kit = await startKit({
      before: (engine) => {
        engine.importList({
          name: "Walk investors",
          file_name: "walk-investors.csv",
          text: peopleCsv([
            { email: "asha@peak.example", first: "Asha", company: "Peak Capital" },
            { email: "cara@nine.example", first: "Cara", company: "Nine Ventures" },
          ]),
        });
      },
    });
    kits.push(kit);
    await kit.core.loadModules(["investors"], () => import("../../scripts/data/investors/index"));
    await kit.settle();
    const lists = (await kit.ask("GET", "/data/investors/setup")).body.lists as { id: string }[];
    await kit.ask("POST", "/data/investors/setup", { list_ids: [lists[0]!.id], by: WALKER });
    const close =
      kit.core.need<import("../../scripts/data/closing/seams").InvestorsClose>("investors-close")!;
    const { investorIdOf } = await import("../../scripts/data/investors/types");
    const peak = investorIdOf("peak.example");
    expect(close.firm(peak)).toMatchObject({ firm: "Peak Capital", residency: "", latest: null });
    expect(close.firm("0".repeat(32))).toBeNull();
    await kit.ask("POST", `/data/investors/${peak}/profile`, {
      residency: "non_resident",
      by: WALKER,
    });
    await kit.ask("POST", `/data/investors/${peak}/amounts`, {
      state: "soft",
      amount: "25000",
      currency: "USD",
      instrument: "SAFE",
      by: WALKER,
    });
    expect(close.firm(peak)).toMatchObject({
      residency: "non_resident",
      latest: { state: "soft", amount: 25_000, currency: "USD", instrument: "SAFE" },
      contact: { email: "asha@peak.example" },
    });
    expect(close.roundInstrument()).toBeNull();
  });
});
