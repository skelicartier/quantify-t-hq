// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import { investorIdOf } from "../../scripts/data/investors/types";
import { chooseInvestorLists } from "@/lib/data/api/investors";
import {
  addClosingDates,
  addRefundDate,
  clearClosingStep,
  readClosing,
  readClosings,
  recordClosingStep,
  recordRoundStep,
  saveClosingTerms,
  startClosing,
} from "@/lib/data/api/closing";
import { DataRequestError, dataAsk, ok } from "@/lib/data/socket";
import { peopleCsv } from "./leads-kit";
import { WALKER, startStack, until, type Stack } from "./helpers";

/**
 * The portal's closing client (ws-notes/company/spec.md §9.8) against the real stack: the
 * investors module gives `investors-close`, the closing's own test routes install the
 * stand-in `key-dates`, `members` and `meetings`, and every answer passes the portal's
 * schema. Invented firms on `.example` only.
 */

let stack: Stack;
const peak = investorIdOf("peak.example");
const today = () => localDay(new Date());
const ago = (days: number) => addDays(today(), -days);

beforeAll(async () => {
  stack = await startStack({
    env: true,
    modules: ["files", "leads", "replies", "waitlist", "investors", "closing"],
  });
  const list = stack.engine.importList({
    name: "Walk investors",
    file_name: "walk-investors.csv",
    text: peopleCsv([{ email: "asha@peak.example", first: "Asha", company: "Peak Capital" }]),
  }).list.id;
  await until(async () => {
    const page = await dataAsk(ok.passthrough(), "GET", "/data/leads");
    return (page as { reading?: boolean }).reading === false;
  }, "the list to be read");
  expect((await chooseInvestorLists([list], WALKER)).firms).toBe(1);
  await stack.ask("POST", `/data/investors/${peak}/profile`, {
    residency: "non_resident",
    by: WALKER,
  });
  const moved = await stack.ask("POST", `/data/investors/${peak}/stage`, {
    stage: "soft",
    next_step: "Send the papers",
    next_step_on: today(),
    by: WALKER,
  });
  expect(moved.status).toBe(200);
  for (const name of ["key-dates", "members"])
    expect(
      (await stack.ask("POST", `/data/_test/closing/${name}`, { by: WALKER })).json,
    ).toMatchObject({
      installed: true,
    });
  await stack.ask("POST", "/data/_test/closing/meetings", {
    by: WALKER,
    resolutions: [
      {
        resolution_id: "walk-resolution-1",
        title: "Approve the allotment",
        kind: "board",
        passed_on: ago(3),
      },
    ],
  });
}, 60_000);
afterAll(() => stack.stop());

describe("the portal and the closing module agree", () => {
  it("on the firm before and after the checklist starts", async () => {
    const before = await readClosing(peak);
    expect(before).toMatchObject({
      closing: null,
      can_start: true,
      key_dates_here: true,
      members_here: true,
    });
    expect(before.classes).toEqual([
      { class_id: "stand-in-equity", name: "Equity shares of ₹10 each" },
    ]);
    expect(before.resolutions?.[0]?.resolution_id).toBe("walk-resolution-1");
    expect((await startClosing(peak, WALKER, crypto.randomUUID())).closing.firm).toBe(
      "Peak Capital",
    );
    const terms = await saveClosingTerms(
      peak,
      {
        instrument: "iSAFE",
        class_id: "stand-in-equity",
        shares: "1250",
        price_per_share: "1000",
        holder: { name: "Peak Capital", kind: "fund", email: "", address: "" },
        pooled: null,
        notes: "",
      },
      WALKER,
    );
    expect(terms.closing.class_id).toBe("stand-in-equity");
  });

  it("on every step, clearing, the dates and the round", async () => {
    await recordClosingStep(peak, "offer-letter", { on: ago(40), serial: "PAS-4/001" }, WALKER);
    const money = await recordClosingStep(
      peak,
      "money-received",
      {
        on: ago(30),
        amount: "2500000",
        currency: "INR",
        own_account: true,
        reference: "WALK-FIRC-1",
        add_dates: true,
      },
      WALKER,
    );
    expect(money.key_dates?.map((link) => link.rule_key).sort()).toEqual([
      "allotment",
      "firms-registration",
    ]);
    await recordClosingStep(peak, "bank-kyc", { on: ago(29), from_receiving_bank: false }, WALKER);
    await recordClosingStep(peak, "board-approval", { resolution_id: "walk-resolution-1" }, WALKER);
    const allotted = await recordClosingStep(
      peak,
      "allotment",
      { on: ago(2), shares: "1250", price_per_share: "1000", add_dates: true },
      WALKER,
    );
    expect(allotted.warnings).toContain(
      "For a non-resident, the FIRC and the investor's KYC come from the bank that received the money.",
    );
    const entered = await recordClosingStep(peak, "register", {}, WALKER);
    expect(entered.closing.register?.folio).toBe("F-STAND-IN");
    await recordClosingStep(peak, "certificate", { on: ago(1), number: "7" }, WALKER);
    expect((await clearClosingStep(peak, "certificate", WALKER)).closing.certificate).toBeNull();
    expect((await addClosingDates(peak, WALKER)).key_dates?.length).toBeGreaterThan(0);
    const refund = await addRefundDate(peak, WALKER).catch((caught: unknown) => caught);
    expect(refund).toBeInstanceOf(DataRequestError);
    const page = await readClosing(peak);
    expect(page.deadlines.map((line) => line.rule_key)).toEqual([
      "allotment",
      "pas-3",
      "register-entry",
      "share-certificates",
      "fc-gpr",
    ]);
    expect(page.register?.folio).toBe("F-STAND-IN");
    const round = await recordRoundStep(
      "special-resolution",
      { on: ago(50), words: "Issue of shares", add_dates: true },
      WALKER,
    );
    expect(round.round_dates.mgt_14).toBe(addDays(ago(50), 30));
    await recordRoundStep("separate-account", { on: ago(45), bank: "Walk Bank" }, WALKER);
    await recordRoundStep(
      "valuation",
      { on: ago(60), by_name: "Walk Valuer", kind: "both" },
      WALKER,
    );
    await recordRoundStep("firms-registered", { on: ago(20) }, WALKER);
    const view = await readClosings();
    expect(view.closings[0]).toMatchObject({ firm: "Peak Capital", residency: "non_resident" });
    expect(view.offers).toMatchObject({ count: 1, limit: 200 });
    expect(view.firms_registered_on).toBe(ago(20));
  });
});
