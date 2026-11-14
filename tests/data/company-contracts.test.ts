// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  GUARDRAILS,
  NO_EVIDENCE,
  RULES,
  addMonths,
  dueFrom,
  evidenceOf,
  fyEndOf,
  fyLabel,
  fyStartYear,
  hasEvidence,
  isRuleKey,
  lateAmount,
  lateDays,
  ruleOf,
  standInKeyDates,
  type FromRecord,
  type RuleKey,
} from "../../scripts/data/company-contracts";

/**
 * The company batch's contract file (company spec §3.1, §5.1, §6.10): the date helpers by
 * hand, the rule book's shape (every key once, a source each, a checked day, a unit that
 * fits its sense, FLA alone on a fixed day), no "%", target, goal or "must" in any rule or
 * guardrail, the stand-in `key-dates`, and the evidence readers. Every name is invented.
 */

const KEYS: readonly RuleKey[] = [
  "first-agm",
  "agm",
  "agm-gap",
  "adt-1",
  "aoc-4",
  "mgt-7a",
  "inc-20a",
  "board-gap-small",
  "board-gap-other",
  "dir-3-kyc",
  "dir-3-kyc-change",
  "board-notice",
  "general-notice",
  "board-quorum",
  "mgt-14",
  "minutes-draft",
  "minutes-comments",
  "minutes-signed",
  "allotment",
  "refund",
  "pas-3",
  "register-entry",
  "share-certificates",
  "valuation-age",
  "firms-registration",
  "advance-receipt",
  "fc-gpr",
  "fla",
  "offer-limit",
];

describe("the helpers, by hand (§5.1)", () => {
  it("adds whole months, keeping a month's last day", () => {
    expect(addMonths("2026-03-31", 9)).toBe("2026-12-31");
    expect(addMonths("2026-11-30", 15)).toBe("2028-02-29");
    expect(addMonths("2027-11-30", 15)).toBe("2029-02-28");
    expect(addMonths("2026-12-31", 2)).toBe("2027-02-28");
    expect(addMonths("2027-12-31", 2)).toBe("2028-02-29");
    expect(addMonths("2027-08-31", 6)).toBe("2028-02-29");
  });

  it("reads the Indian financial year", () => {
    expect(fyLabel("2026-11-13")).toBe("2026-27");
    expect(fyEndOf("2026-11-13")).toBe("2027-03-31");
    expect(fyStartYear("2027-03-31")).toBe(2026);
    expect(fyStartYear("2027-04-01")).toBe(2027);
  });

  it("puts the FLA return on 15 July after the allotment's year", () => {
    expect(dueFrom(ruleOf("fla"), "2027-03-12")).toBe("2027-07-15");
    expect(dueFrom(ruleOf("fla"), "2027-04-02")).toBe("2028-07-15");
  });

  it("counts late days and fixed late fees, capped where the source caps them", () => {
    expect(lateDays("2027-01-30", "2027-02-13")).toBe(14);
    expect(lateDays("2027-01-30", "2027-01-29")).toBe(0);
    expect(lateAmount(ruleOf("aoc-4"), 14)).toBe(1400);
    expect(lateAmount(ruleOf("pas-3"), 14)).toBe(14000);
    expect(lateAmount(ruleOf("pas-3"), 3000)).toBe(2500000);
    expect(lateAmount(ruleOf("inc-20a"), 120)).toBe(100000);
    expect(lateAmount(ruleOf("fc-gpr"), 10)).toBeNull();
    expect(lateAmount(ruleOf("aoc-4"), 0)).toBeNull();
  });

  it("works a due day out with his amount when given", () => {
    expect(dueFrom(ruleOf("pas-3"), "2027-03-12")).toBe("2027-03-27");
    expect(dueFrom(ruleOf("pas-3"), "2027-03-12", 30)).toBe("2027-04-11");
    expect(dueFrom(ruleOf("share-certificates"), "2027-12-31")).toBe("2028-02-29");
    expect(dueFrom(ruleOf("dir-3-kyc"), "2025-09-15")).toBeNull();
    expect(dueFrom(ruleOf("board-quorum"), "2026-12-12")).toBeNull();
  });
});

describe("the rule book's shape", () => {
  it("holds every key exactly once", () => {
    const keys = RULES.map((rule) => rule.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual([...KEYS].sort());
    for (const key of KEYS) expect(isRuleKey(key)).toBe(true);
    expect(isRuleKey("not-a-rule")).toBe(false);
  });

  it("gives each rule a source, a checked day and a unit that fits its sense", () => {
    for (const rule of RULES) {
      expect(rule.sources.length, rule.key).toBeGreaterThan(0);
      for (const source of rule.sources) expect(source.url).toMatch(/^https:\/\//);
      expect(rule.verified_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (rule.sense === "count") expect(rule.unit, rule.key).toBe("people");
      else if (rule.key !== "fla") expect(["days", "months", "years"]).toContain(rule.unit);
      expect(["CA", "CS", "lawyer"]).toContain(rule.confirm_with);
    }
    expect(RULES.filter((rule) => rule.fy_day !== null).map((rule) => rule.key)).toEqual(["fla"]);
  });

  it("names every guardrail's source", () => {
    for (const guardrail of GUARDRAILS) {
      expect(guardrail.sources.length).toBeGreaterThan(0);
      for (const source of guardrail.sources) expect(source.url).toMatch(/^https:\/\//);
    }
  });

  it("says no %, target, goal or must anywhere", () => {
    const texts = [
      ...RULES.flatMap((rule) => [rule.title, rule.from, rule.note, rule.late?.words ?? ""]),
      ...GUARDRAILS.map((guardrail) => guardrail.words),
    ];
    for (const text of texts) {
      expect(text).not.toContain("%");
      expect(text).not.toMatch(/\btarget\b/i);
      expect(text).not.toMatch(/\bgoal\b/i);
      expect(text).not.toMatch(/\bmust\b/i);
    }
  });
});

describe("the stand-in key-dates", () => {
  const BY = { staff_id: "walk-owner", name: "Walk Owner" };
  const item = (rule_key: RuleKey, base_on = "2027-03-12", key = "walk:allot-1"): FromRecord => ({
    origin: { key, label: "Allotment to Walk Fund 281", href: "/data/investors/walk" },
    rule_key,
    base_on,
    title: `${rule_key}: allotment to Walk Fund 281`,
  });

  it("adds one date per origin and rule, and a second add adds none", () => {
    const service = standInKeyDates();
    const first = service.add([item("pas-3"), item("register-entry")], BY);
    expect(first.map((link) => [link.rule_key, link.due_on])).toEqual([
      ["register-entry", "2027-03-19"],
      ["pas-3", "2027-03-27"],
    ]);
    service.add([item("pas-3")], BY);
    expect(service.dates).toHaveLength(2);
  });

  it("adds nothing for a rule only once confirmed", () => {
    const service = standInKeyDates();
    expect(service.add([item("advance-receipt", "2027-01-12")], BY)).toEqual([]);
    expect(service.dates).toHaveLength(0);
  });

  it("moves only open dates, keeps evidence on done, and leaves done ones when taken back", () => {
    const service = standInKeyDates();
    service.add([item("pas-3"), item("register-entry")], BY);
    const done = service.done(
      "walk:allot-1",
      "register-entry",
      { ...NO_EVIDENCE, srn: "WALK-SRN-9", filed_on: "2027-03-15" },
      BY,
    );
    expect(done?.evidence.srn).toBe("WALK-SRN-9");
    const moved = service.rebase("walk:allot-1", "2027-03-20", BY);
    expect(moved.find((link) => link.rule_key === "pas-3")?.due_on).toBe("2027-04-04");
    expect(moved.find((link) => link.rule_key === "register-entry")?.due_on).toBe("2027-03-19");
    const back = service.takeBack("walk:allot-1", "Refunded.", BY);
    expect(back.find((link) => link.rule_key === "pas-3")?.state).toBe("taken_back");
    expect(back.find((link) => link.rule_key === "register-entry")?.state).toBe("done");
    expect(service.done("walk:other", "pas-3", NO_EVIDENCE, BY)).toBeNull();
  });
});

describe("evidence", () => {
  it("reads whatever was stored, empty where it is missing or wrong", () => {
    expect(evidenceOf(null)).toEqual(NO_EVIDENCE);
    expect(evidenceOf({ fee_paid: -1 })).toEqual(NO_EVIDENCE);
    const full = {
      srn: "WALK-SRN-1",
      challan: "WALK-CH-1",
      filed_on: "2027-01-20",
      fee_paid: 300,
      filed_file_id: "walk-file",
      note: "Filed by the CS.",
    };
    expect(evidenceOf(full)).toEqual(full);
    expect(evidenceOf({ ...full, filed_on: "20 Jan" }).filed_on).toBeNull();
  });

  it("says whether anything at all was kept", () => {
    expect(hasEvidence(NO_EVIDENCE)).toBe(false);
    expect(hasEvidence({ ...NO_EVIDENCE, note: "Only a note." })).toBe(false);
    expect(hasEvidence({ ...NO_EVIDENCE, fee_paid: 0 })).toBe(true);
    expect(hasEvidence({ ...NO_EVIDENCE, srn: "WALK-SRN-1" })).toBe(true);
  });
});
