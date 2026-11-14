// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import { SENTENCES } from "../../scripts/data/investors/raise";
import { investorIdOf } from "../../scripts/data/investors/types";
import {
  chooseInvestorLists,
  introduceInvestor,
  qualifyInvestor,
  readFunnel,
  readInvestor,
  readInvestors,
  readRound,
  saveRound,
  setWave,
  updateInvestor,
  type QualifyInput,
  type RoundInput,
} from "@/lib/data/api/investors";
import { readDataOverview } from "@/lib/data/api/overview";
import { DataRequestError, dataAsk, ok } from "@/lib/data/socket";
import { Scripted, peopleCsv, readyToSend, sendLive } from "./leads-kit";
import { WALKER, startStack, until, type Stack } from "./helpers";

/**
 * The portal's raise clients (raise spec §5.8) against the real stack: every new answer
 * passes the portal's own schema, so a renamed or dropped field fails here, and every
 * refusal arrives as a `DataRequestError` carrying the service's sentence. Invented firms
 * on `.example` only.
 */

let stack: Stack;
const provider = new Scripted();
const today = () => localDay(new Date());
const peak = investorIdOf("peak.example");
const nine = investorIdOf("nine.example");

const NO_PROFILE: QualifyInput = {
  cheque_min: "",
  cheque_max: "",
  cheque_currency: "USD",
  stages: [],
  sectors: "",
  geography: [],
  lead: "",
  conflict: "",
  residency: "",
  india_ok: "",
};

const ROUND: RoundInput = {
  name: "",
  instrument: "iSAFE",
  cap_amount: "5000000",
  cap_currency: "USD",
  cap_basis: "post_money",
  discount: "20",
  mfn: true,
  minimum_amount: "25000",
  minimum_currency: "USD",
  opened_on: "",
  lead: "no",
  lead_investor_id: "",
  notes: "",
};

beforeAll(async () => {
  // U1's modules alone (raise spec §3.2): no contacts and no files (which gives `packs`), so
  // the detail answers no introducers and no data room. raise-merged.test.ts checks both.
  stack = await startStack({
    env: true,
    liveProvider: () => provider,
    modules: ["leads", "replies", "waitlist", "investors", "dates"],
  });
  await readyToSend(stack.engine);
  const walk = stack.engine.importList({
    name: "Walk 01",
    file_name: "walk-01.csv",
    text: peopleCsv([{ email: "asha@peak.example", first: "Asha", company: "Peak Capital" }]),
  }).list.id;
  await sendLive(stack.engine, walk, "Walk live 01");
  const list = stack.engine.importList({
    name: "Walk investors",
    file_name: "walk-investors.csv",
    text: peopleCsv([
      { email: "asha@peak.example", first: "Asha", company: "Peak Capital" },
      { email: "cara@nine.example", first: "Cara", last: "Quillon", company: "Nine Ventures" },
    ]),
  }).list.id;
  await until(async () => {
    const page = await dataAsk(ok.passthrough(), "GET", "/data/leads");
    return (
      (page as { total?: number }).total === 2 && (page as { reading?: boolean }).reading === false
    );
  }, "the lists to be read");
  expect((await chooseInvestorLists([list], WALKER)).firms).toBe(2);
}, 60_000);
afterAll(() => stack.stop());

describe("the portal and the raise agree", () => {
  it("on the list's new fields and the firm's", async () => {
    const page = await readInvestors();
    expect(page.waves).toEqual([{ label: "", firms: 2 }]);
    const row = page.investors.find((item) => item.investor_id === peak)!;
    expect(row).toMatchObject({ wave: "", warm: false, last_touch: { kind: "written" } });
    const detail = await readInvestor(peak);
    expect(detail.investor).toMatchObject({
      wave: "",
      offer_deadline: null,
      deck_link: "",
      last_replied_at: null,
      last_met_at: null,
      intro: { status: "none" },
    });
    expect(detail.introducers).toBeNull();
    expect(detail.data_room).toBeNull();
  });

  it("on a qualification and an introduction", async () => {
    const qualified = await qualifyInvestor(
      peak,
      {
        ...NO_PROFILE,
        cheque_min: "25000",
        cheque_max: "100000",
        stages: ["seed"],
        sectors: "fintech, data",
        geography: ["india", "us"],
        lead: "lead",
        residency: "non_resident",
        india_ok: "yes",
      },
      WALKER,
    );
    expect(qualified.investor.profile).toMatchObject({
      cheque: { min: 25_000, max: 100_000, currency: "USD" },
      sectors: ["fintech", "data"],
    });
    const introduced = await introduceInvestor(
      peak,
      { status: "made", introducer: "Walk Introducer", contact_id: "", on: "" },
      WALKER,
    );
    expect(introduced.investor.intro).toMatchObject({ status: "made", on: today() });
    const warm = await readInvestors({ intro: "warm" });
    expect(warm.investors.map((item) => item.firm)).toEqual(["Peak Capital"]);
  });

  it("on the wave, the offer deadline and the deck link", async () => {
    expect((await setWave({ q: "nine" }, "Wave 2", WALKER)).changed).toBe(1);
    expect((await readInvestors({ wave: "Wave 2" })).investors.map((item) => item.firm)).toEqual([
      "Nine Ventures",
    ]);
    expect((await readInvestors({ wave: "-" })).total).toBe(1);
    const deadline = await updateInvestor(nine, "offer_deadline", addDays(today(), 2), WALKER);
    expect(deadline.investor.offer_deadline).toBe(addDays(today(), 2));
    const link = await updateInvestor(nine, "deck_link", "https://deck.example/d/walk", WALKER);
    expect(link.investor.deck_link).toBe("https://deck.example/d/walk");
    const overview = await readDataOverview();
    expect(overview.due).toContainEqual(
      expect.objectContaining({ title: "Offer deadline: Nine Ventures", kind: "investor" }),
    );
    expect(overview.raise?.stages).toHaveLength(7);
  });

  it("on the funnel and the round", async () => {
    const { funnel } = await readFunnel();
    expect(funnel.firms).toBe(2);
    expect(funnel.stages[0]).toMatchObject({ stage: "written", now: 1, reached: 1, of: 2 });
    expect(funnel.by_intro.map((split) => split.firms)).toEqual([1, 1]);
    expect(funnel.by_wave.map((split) => split.label)).toEqual(["Wave 2", "No wave"]);
    expect(funnel.days_since_first_send).toBe(0);
    const empty = await readRound();
    expect(empty.round).toBeNull();
    expect(empty.firms.map((firm) => firm.firm)).toEqual(["Nine Ventures", "Peak Capital"]);
    const { round } = await saveRound(ROUND, WALKER);
    expect(round).toMatchObject({ name: "Pre-seed", discount_percent: 20, mfn: true });
    const page = await readRound();
    expect(page.round?.round_id).toBe(round.round_id);
    expect(page.history).toHaveLength(1);
  });

  it("keeps the service's sentences in its refusals", async () => {
    const refusal = (sentence: string, status = 400) =>
      expect.objectContaining({ status, message: sentence });
    await expect(
      qualifyInvestor(peak, { ...NO_PROFILE, cheque_min: "lots" }, WALKER),
    ).rejects.toBeInstanceOf(DataRequestError);
    await expect(
      qualifyInvestor(peak, { ...NO_PROFILE, cheque_min: "200", cheque_max: "100" }, WALKER),
    ).rejects.toEqual(refusal(SENTENCES.chequeOrder));
    await expect(
      introduceInvestor(peak, { status: "asked", introducer: "", contact_id: "", on: "" }, WALKER),
    ).rejects.toEqual(refusal(SENTENCES.introducer));
    await expect(
      updateInvestor(peak, "deck_link", "http://deck.example/x", WALKER),
    ).rejects.toEqual(refusal(SENTENCES.deckLink));
    await expect(
      updateInvestor(peak, "offer_deadline", addDays(today(), -1), WALKER),
    ).rejects.toEqual(refusal(SENTENCES.past));
    await expect(saveRound({ ...ROUND, discount: "60" }, WALKER)).rejects.toEqual(
      refusal(SENTENCES.discount),
    );
    await expect(
      saveRound({ ...ROUND, lead: "yes", lead_investor_id: "0".repeat(32) }, WALKER),
    ).rejects.toEqual(refusal(SENTENCES.leadFirm, 404));
  });
});
