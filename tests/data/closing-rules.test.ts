// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  allotmentItems,
  datesMissing,
  deadlinesOf,
  dueOf,
  guardrailsOf,
  moneyItems,
  refundItem,
  roundItems,
} from "../../scripts/data/closing/chain";
import type { Closing, RoundClose } from "../../scripts/data/closing/types";
import { NO_ROUND } from "../../scripts/data/closing/types";
import {
  dueFrom,
  ruleOf,
  standInKeyDates,
  type KeyDateLink,
  type KeyDatesService,
  type RuleKey,
} from "../../scripts/data/company-contracts";
import { localDay } from "../../scripts/data/days";
import { WALKER, closeKit, firm, plus, type CloseKit } from "./close-kit";

/**
 * Every row of §5.7's table (ws-notes/company/spec.md): first by hand through the chain and
 * `standInKeyDates()`, on the table's own days (leap years and month ends included); then
 * through the real closing routes on days already past, since a step's day may not be after
 * today. PAS-3 with his amount of 30, and the advance-receipt report only once confirmed.
 * Every firm is invented.
 */

const AT = "2026-11-14T06:00:00.000Z";

function closing(change: Partial<Closing> = {}): Closing {
  return {
    closing_id: "c4000000000000000000000000000281",
    investor_id: "c4000000000000000000000000000281",
    firm: "Walk Fund 281",
    instrument: "iSAFE",
    class_id: null,
    shares: null,
    price_per_share: null,
    holder: { name: "Walk Fund 281", kind: "fund", email: "", address: "" },
    pooled: null,
    documents_sent: null,
    documents_signed: null,
    offer_letter: null,
    money_received: null,
    bank_kyc: null,
    valuation: null,
    board_approval: null,
    allotment: null,
    register: null,
    certificate: null,
    refund: null,
    notes: "",
    created_at: AT,
    created_by: WALKER,
    updated_at: AT,
    updated_by: WALKER,
    ...change,
  };
}

const money = (on: string): Closing["money_received"] => ({
  on,
  amount: 2_500_000,
  currency: "INR",
  own_account: true,
  reference: "WALK-FIRC-1",
  firc_file_id: null,
  at: AT,
  by: WALKER,
});

const allotted = (on: string): Closing["allotment"] => ({
  on,
  shares: 1_250,
  price_per_share: 1_000,
  class_id: null,
  at: AT,
  by: WALKER,
});

const dueIn = (links: readonly KeyDateLink[], rule: RuleKey): string | undefined =>
  links.find((link) => link.rule_key === rule)?.due_on;

describe("§5.7 by hand, through the stand-in", () => {
  it("money received on 12 Jan 2027: allot by 13 Mar, FIRMS 19 Jan, no advance-receipt report", () => {
    const keyDates = standInKeyDates();
    const links = keyDates.add(
      moneyItems(closing({ money_received: money("2027-01-12") }), "non_resident", null),
      WALKER,
    );
    expect(dueIn(links, "allotment")).toBe("2027-03-13");
    expect(dueIn(links, "firms-registration")).toBe("2027-01-19");
    expect(dueIn(links, "advance-receipt")).toBeUndefined();
    expect(links.find((link) => link.rule_key === "allotment")?.title).toBe(
      "Allot shares to Walk Fund 281, or refund",
    );
    // Worked out on its own, the report would be due 11 Feb, once confirmed.
    expect(dueFrom(ruleOf("advance-receipt"), "2027-01-12")).toBe("2027-02-11");
  });

  it("FIRMS is not added when the company or the round has registered already", () => {
    const items = moneyItems(
      closing({ money_received: money("2027-01-12") }),
      "non_resident",
      "2026-12-01",
    );
    expect(items.map((item) => item.rule_key)).toEqual(["allotment", "advance-receipt"]);
    const resident = moneyItems(closing({ money_received: money("2027-01-12") }), "resident", null);
    expect(resident.map((item) => item.rule_key)).toEqual(["allotment"]);
  });

  it("the refund date is R + 60 + 15: 28 Mar 2027", () => {
    const item = refundItem(closing({ money_received: money("2027-01-12") }), null)!;
    expect(item.base_on).toBe("2027-03-13");
    expect(standInKeyDates().add([item], WALKER)[0]?.due_on).toBe("2027-03-28");
  });

  it("the allotment on 12 Mar 2027: PAS-3, register, certificates, FC-GPR and the FLA", () => {
    const links = standInKeyDates().add(
      allotmentItems(
        closing({ money_received: money("2027-01-12"), allotment: allotted("2027-03-12") }),
        "non_resident",
      ),
      WALKER,
    );
    expect(dueIn(links, "pas-3")).toBe("2027-03-27");
    expect(dueIn(links, "register-entry")).toBe("2027-03-19");
    expect(dueIn(links, "share-certificates")).toBe("2027-05-12");
    expect(dueIn(links, "fc-gpr")).toBe("2027-04-11");
    expect(dueIn(links, "fla")).toBe("2027-07-15");
    expect(links.find((link) => link.rule_key === "fla")?.origin_key).toBe("closing:fla");
  });

  it("month ends and leap years", () => {
    const at = (rule: RuleKey, base: string) => dueOf(null, rule, base);
    expect(at("share-certificates", "2026-12-31")).toBe("2027-02-28");
    expect(at("share-certificates", "2027-12-31")).toBe("2028-02-29");
    expect(at("fc-gpr", "2028-01-30")).toBe("2028-02-29");
    expect(at("fla", "2027-04-02")).toBe("2028-07-15");
    expect(at("allotment", "2027-12-31")).toBe("2028-02-29");
    expect(at("valuation-age", "2026-12-15")).toBe("2027-03-15");
  });

  it("a special resolution typed on the round: MGT-14 by 19 Jan 2027; one from Meetings adds none", () => {
    const typed: RoundClose = {
      ...NO_ROUND,
      special_resolution: {
        on: "2026-12-20",
        resolution_id: null,
        words: "Issue shares",
        at: AT,
        by: WALKER,
      },
    };
    expect(standInKeyDates().add(roundItems(typed), WALKER)[0]?.due_on).toBe("2027-01-19");
    const picked: RoundClose = {
      ...NO_ROUND,
      special_resolution: {
        on: "2026-12-20",
        resolution_id: "r1",
        words: "Issue shares",
        at: AT,
        by: WALKER,
      },
    };
    expect(roundItems(picked)).toEqual([]);
  });

  it("PAS-3 at 30 with his amount: 11 Apr 2027", () => {
    const fake: KeyDatesService = {
      ...standInKeyDates(),
      rule: (key) => ({ amount: key === "pas-3" ? 30 : ruleOf(key).amount, confirmed: true }),
      dueOn: (key, base) => dueFrom(ruleOf(key), base, key === "pas-3" ? 30 : ruleOf(key).amount),
    };
    const lines = deadlinesOf(
      closing({ money_received: money("2027-01-12"), allotment: allotted("2027-03-12") }),
      "non_resident",
      fake,
      [],
    );
    expect(lines.find((line) => line.rule_key === "pas-3")?.on).toBe("2027-04-11");
    expect(lines.find((line) => line.rule_key === "pas-3")?.title).toBe("PAS-3 by");
  });

  it("the advance-receipt report counts as missing only once its rule is confirmed", () => {
    const record = closing({ money_received: money("2027-01-12") });
    const items = moneyItems(record, "non_resident", null);
    const stand = standInKeyDates();
    const links = stand.add(items, WALKER);
    expect(datesMissing(stand, items, links)).toBe(false);
    const confirmed: KeyDatesService = {
      ...stand,
      rule: (key) => ({ amount: ruleOf(key).amount, confirmed: true }),
    };
    expect(datesMissing(confirmed, items, links)).toBe(true);
  });

  it("the valuation 108 days old on the allotment day warns; the allotment late warns", () => {
    const record = closing({
      money_received: money("2027-01-12"),
      allotment: allotted("2027-04-02"),
      valuation: {
        on: "2026-12-15",
        by_name: "Walk Valuer",
        kind: "registered_valuer",
        file_id: null,
        from_round: false,
        at: AT,
        by: WALKER,
      },
    });
    const warnings = guardrailsOf({
      closing: record,
      firm: firm(281),
      round: NO_ROUND,
      company: null,
      keyDates: null,
      today: "2027-04-05",
    });
    expect(warnings.find((item) => item.key === "valuation-age")?.words).toBe(
      "The valuation is 108 days old on the allotment day; the rule is at most 90.",
    );
    expect(warnings.find((item) => item.key === "allotment")?.words).toBe(
      "Allotted 80 days after the money arrived; the rule is 60.",
    );
  });
});

// ------------------------------------------------------------------ through the routes

describe("§5.7 through the closing routes, on days already past", () => {
  let kit: CloseKit;
  const ids = { a: firm(1).investor_id, b: firm(2).investor_id, c: firm(3).investor_id };
  const steps = (id: string, step: string, body: Record<string, unknown>) =>
    kit.post(`/data/closing/${id}/steps/${step}`, body);

  beforeAll(async () => {
    kit = await closeKit({ firms: [firm(1), firm(2), firm(3, { residency: "resident" })] });
    expect((await kit.post("/data/_test/closing/key-dates")).body).toMatchObject({
      installed: true,
    });
    expect((await kit.post("/data/_test/closing/members")).body).toMatchObject({ installed: true });
    for (const id of Object.values(ids))
      expect((await kit.post(`/data/closing/${id}/start`)).status).toBe(200);
  }, 60_000);
  afterAll(() => kit.close());

  const linksOf = async (id: string): Promise<KeyDateLink[]> =>
    ((await kit.get(`/data/closing/${id}`)).body.key_dates as KeyDateLink[]) ?? [];

  it("money on 31 Dec 2023 is allotted by 29 Feb 2024; the allotment the same day dates the rest", async () => {
    const paid = await steps(ids.a, "money-received", {
      on: "2023-12-31",
      amount: "2500000",
      currency: "INR",
      own_account: true,
      reference: "WALK-FIRC-1",
      add_dates: true,
    });
    expect(paid.status).toBe(200);
    expect(dueIn(await linksOf(ids.a), "allotment")).toBe("2024-02-29");
    expect(dueIn(await linksOf(ids.a), "firms-registration")).toBe("2024-01-07");
    const allotment = await steps(ids.a, "allotment", {
      on: "2023-12-31",
      shares: "1250",
      price_per_share: "1000",
      class_id: "stand-in-equity",
      add_dates: true,
    });
    expect(allotment.status).toBe(200);
    const links = await linksOf(ids.a);
    expect(dueIn(links, "pas-3")).toBe("2024-01-15");
    expect(dueIn(links, "register-entry")).toBe("2024-01-07");
    expect(dueIn(links, "share-certificates")).toBe("2024-02-29");
    expect(dueIn(links, "fc-gpr")).toBe("2024-01-30");
    expect(dueIn(links, "fla")).toBe("2024-07-15");
    expect(links.find((link) => link.rule_key === "allotment")?.state).toBe("done");
  });

  it("the register entry through members, then the certificate by hand, mark their dates done", async () => {
    const entered = await steps(ids.a, "register", {});
    expect(entered.status).toBe(200);
    expect((entered.body.closing as Closing).register).toMatchObject({
      folio: "F-STAND-IN",
      by_hand: false,
    });
    const issued = await steps(ids.a, "certificate", { on: "2024-01-20", number: "7" });
    expect(issued.status).toBe(200);
    const links = await linksOf(ids.a);
    expect(links.find((link) => link.rule_key === "register-entry")?.evidence.note).toBe(
      "Folio F-STAND-IN",
    );
    expect(links.find((link) => link.rule_key === "share-certificates")?.state).toBe("done");
  });

  it("an allotment on 30 Jan 2024 files FC-GPR by 29 Feb 2024", async () => {
    await steps(ids.b, "money-received", {
      on: "2024-01-10",
      amount: "25000",
      currency: "USD",
      own_account: true,
      add_dates: true,
    });
    await steps(ids.b, "allotment", {
      on: "2024-01-30",
      shares: "100",
      price_per_share: "1000",
      add_dates: true,
    });
    expect(dueIn(await linksOf(ids.b), "fc-gpr")).toBe("2024-02-29");
  });

  it("a refund takes back the money's open dates", async () => {
    await steps(ids.c, "money-received", {
      on: plus(kitToday(), -10),
      amount: "2500000",
      currency: "INR",
      own_account: true,
      add_dates: true,
    });
    expect((await linksOf(ids.c)).map((link) => link.rule_key)).toEqual(["allotment"]);
    const refunded = await steps(ids.c, "refund", {
      on: kitToday(),
      amount: "2500000",
      currency: "INR",
    });
    expect(refunded.status).toBe(200);
    expect((await linksOf(ids.c)).find((link) => link.rule_key === "allotment")?.state).toBe(
      "taken_back",
    );
  });

  it("a special resolution typed on the round adds MGT-14: 30 Jan 2024 → 29 Feb 2024", async () => {
    const typed = await kit.post("/data/closing/round/special-resolution", {
      on: "2024-01-30",
      words: "Issue of shares by private placement",
      add_dates: true,
    });
    expect(typed.status).toBe(200);
    expect((typed.body.round_dates as { mgt_14: string }).mgt_14).toBe("2024-02-29");
    expect((typed.body.key_dates as KeyDateLink[])[0]?.title).toBe(
      "MGT-14: special resolution for the round",
    );
  });

  const kitToday = () => localDay(new Date());
});
