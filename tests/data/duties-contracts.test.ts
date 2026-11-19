// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  DUTY_RULES,
  addPeriods,
  addWorkingDaysWith,
  dutyDue,
  dutyRuleOf,
  dutyStateOf,
  editLineText,
  isDutyRuleKey,
  isWorkingDayWith,
  periodEnd,
  periodOf,
  retentionUntil,
  ruleLineOf,
  standInDutyRules,
  standInHolidays,
  standInMonthLock,
  tdsDepositDue,
  type DutyRuleKey,
  type EditLine,
} from "../../scripts/data/duties-contracts";

/**
 * The duties batch's contract file (duties spec §3.1, §5.1, §7.7), which every unit reads
 * and nobody edits: the rule book's shape (46 rules, every key once, a source each that is
 * an https link, the four rules the sources disagree on and their readings), a rule's state
 * from what the book holds, the line printed beside a worked-out day, the days worked out
 * with a rule, working days with and without holidays, the stand-ins, and the edit log's
 * hash text. Pure: no stack, no clock.
 */

const DISPUTED: readonly DutyRuleKey[] = [
  "tm-fee-startup",
  "tds-professional-year",
  "foreign-forms",
  "export-realisation",
];

describe("the duty rules (§3.1)", () => {
  it("holds 46 rules, every key once", () => {
    expect(DUTY_RULES).toHaveLength(46);
    const keys = DUTY_RULES.map((rule) => rule.key);
    expect(new Set(keys).size).toBe(46);
    for (const key of keys) {
      expect(isDutyRuleKey(key)).toBe(true);
      expect(dutyRuleOf(key).key).toBe(key);
    }
    expect(isDutyRuleKey("agm")).toBe(false);
    expect(isDutyRuleKey(42)).toBe(false);
    expect(() => dutyRuleOf("no-such-rule" as DutyRuleKey)).toThrow();
  });

  it("gives every rule and every reading's source as an https link, and a checked day", () => {
    for (const rule of DUTY_RULES) {
      expect(rule.sources.length, rule.key).toBeGreaterThan(0);
      for (const source of rule.sources) {
        expect(source.url, rule.key).toMatch(/^https:\/\/\S+$/);
        expect(source.name.length, rule.key).toBeGreaterThan(0);
      }
      for (const reading of rule.readings)
        for (const source of reading.sources) expect(source.url, rule.key).toMatch(/^https:\/\//);
      expect(rule.verified_on, rule.key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("marks exactly the four rules the sources disagree on, each with two or more readings", () => {
    const disputed = DUTY_RULES.filter((rule) => rule.only_when_confirmed).map((rule) => rule.key);
    expect([...disputed].sort()).toEqual([...DISPUTED].sort());
    for (const key of DISPUTED) {
      const rule = dutyRuleOf(key);
      expect(rule.readings.length, key).toBeGreaterThanOrEqual(2);
      expect(rule.amount, key).toBeNull();
    }
    for (const rule of DUTY_RULES.filter((item) => !item.only_when_confirmed))
      expect(rule.readings, rule.key).toEqual([]);
    expect(dutyRuleOf("export-realisation").readings.map((reading) => reading.label)).toEqual([
      "9 months",
      "15 months",
    ]);
    expect(dutyRuleOf("tds-professional-year").readings.map((reading) => reading.amount)).toEqual([
      50_000, 30_000,
    ]);
  });

  it("never writes a per cent sign in a rule's words (a link may hold an escape)", () => {
    for (const rule of DUTY_RULES) {
      const words = [
        rule.title,
        rule.from,
        rule.note,
        ...rule.readings.flatMap((reading) => [reading.label, reading.words]),
      ];
      expect(
        words.some((text) => text.includes("%")),
        rule.key,
      ).toBe(false);
    }
  });
});

describe("a rule's state (dutyStateOf)", () => {
  const ON = "2026-11-14";

  it("reads a plain rule with its own amount, usable and not confirmed", () => {
    expect(dutyStateOf(dutyRuleOf("cert-in-report"), {}, ON)).toEqual({
      key: "cert-in-report",
      amount: 6,
      unit: "hours",
      confirmed: false,
      confirmed_by: null,
      confirmed_on: null,
      reading: null,
      usable: true,
      not_yet: false,
    });
  });

  it("takes his amount over the rule's own", () => {
    const state = dutyStateOf(dutyRuleOf("cert-in-report"), { amount: 4 }, ON);
    expect(state.amount).toBe(4);
    expect(state.usable).toBe(true);
  });

  it("works nothing out from a rule with readings until one is confirmed", () => {
    const rule = dutyRuleOf("export-realisation");
    const before = dutyStateOf(rule, {}, ON);
    expect(before).toMatchObject({ amount: null, usable: false, confirmed: false, reading: null });
    // A reading chosen but not confirmed does not count.
    expect(dutyStateOf(rule, { reading: 1 }, ON)).toMatchObject({ amount: null, usable: false });
    const confirmed = { name: "Walk Bank", on: "2026-11-14" };
    expect(dutyStateOf(rule, { reading: 0, confirmed }, ON)).toMatchObject({
      amount: 9,
      reading: 0,
      usable: true,
      confirmed: true,
      confirmed_by: "Walk Bank",
      confirmed_on: "2026-11-14",
    });
    expect(dutyStateOf(rule, { reading: 1, confirmed }, ON)).toMatchObject({
      amount: 15,
      reading: 1,
      usable: true,
    });
    // A reading out of range is no reading.
    expect(dutyStateOf(rule, { reading: 5, confirmed }, ON)).toMatchObject({
      reading: null,
      amount: null,
      usable: true,
    });
  });

  it("puts his own amount over a confirmed reading", () => {
    const state = dutyStateOf(
      dutyRuleOf("export-realisation"),
      { amount: 12, reading: 1, confirmed: { name: "Walk Bank", on: "2026-11-14" } },
      ON,
    );
    expect(state.amount).toBe(12);
    expect(state.usable).toBe(true);
  });

  it("gives no amount for a rule in words, confirmed or not", () => {
    const rule = dutyRuleOf("tds-deposit");
    expect(dutyStateOf(rule, {}, ON)).toMatchObject({ amount: null, usable: true });
    expect(
      dutyStateOf(rule, { amount: 9, confirmed: { name: "Walk CA", on: ON } }, ON),
    ).toMatchObject({ amount: null, confirmed: true, confirmed_by: "Walk CA" });
  });

  it("is not in force before its start day, and is on it", () => {
    const rule = dutyRuleOf("dpdp-board-report");
    expect(dutyStateOf(rule, {}, "2027-05-11")).toMatchObject({
      not_yet: true,
      usable: false,
      amount: 72,
    });
    expect(dutyStateOf(rule, {}, "2027-05-12")).toMatchObject({ not_yet: false, usable: true });
  });
});

describe("the day a rule falls due (dutyDue)", () => {
  const ON = "2026-11-14";
  const state = (key: DutyRuleKey, stored = {}) => dutyStateOf(dutyRuleOf(key), stored, ON);

  it("adds days, months and years; nothing for hours, working days or words", () => {
    expect(dutyDue(state("tm-deficiency"), "2026-12-09")).toBe("2027-01-09");
    expect(dutyDue(state("tm-exam-reply"), "2027-01-31")).toBe("2027-02-28");
    expect(dutyDue(state("tm-opposition"), "2027-01-18")).toBe("2027-05-18");
    expect(dutyDue(state("tm-term"), "2026-11-14")).toBe("2036-11-14");
    expect(dutyDue(state("msme-no-agreement"), "2026-11-10")).toBe("2026-11-25");
    expect(dutyDue(state("cert-in-report"), "2026-11-13")).toBeNull();
    expect(dutyDue(state("close-by"), "2026-10-31")).toBeNull();
    expect(dutyDue(state("tds-deposit"), "2026-11-12")).toBeNull();
  });

  it("works out the realisation day only once a reading is confirmed", () => {
    expect(dutyDue(state("export-realisation"), "2026-11-30")).toBeNull();
    const confirmed = { name: "Walk Bank", on: ON };
    expect(dutyDue(state("export-realisation", { reading: 1, confirmed }), "2026-11-30")).toBe(
      "2028-02-29",
    );
    expect(dutyDue(state("export-realisation", { reading: 0, confirmed }), "2026-11-30")).toBe(
      "2027-08-30",
    );
  });
});

describe("the rule line (ruleLineOf)", () => {
  it("lists the readings while a disputed rule is not confirmed, and none once it is", () => {
    const rule = dutyRuleOf("tds-professional-year");
    expect(ruleLineOf(dutyStateOf(rule, {}, "2026-11-14"))).toEqual({
      key: "tds-professional-year",
      title: "Professional fees",
      confirm_with: "CA",
      confirmed_by: null,
      confirmed_on: null,
      usable: false,
      starts_on: null,
      readings: ["₹50,000", "₹30,000"],
    });
    const confirmed = dutyStateOf(
      rule,
      { reading: 0, confirmed: { name: "Walk CA", on: "2026-11-14" } },
      "2026-11-14",
    );
    expect(ruleLineOf(confirmed)).toMatchObject({
      usable: true,
      readings: [],
      confirmed_by: "Walk CA",
      confirmed_on: "2026-11-14",
    });
  });

  it("says the start day only while it is ahead", () => {
    const rule = dutyRuleOf("dpdp-board-report");
    expect(ruleLineOf(dutyStateOf(rule, {}, "2027-01-01")).starts_on).toBe("2027-05-12");
    expect(ruleLineOf(dutyStateOf(rule, {}, "2027-06-01")).starts_on).toBeNull();
  });

  it("carries a null role for a rule nobody confirms", () => {
    expect(ruleLineOf(dutyStateOf(dutyRuleOf("close-by"), {}, "2026-11-14")).confirm_with).toBe(
      null,
    );
  });
});

describe("the stand-in rule book (standInDutyRules)", () => {
  it("answers each rule's own amount, and what it was given", () => {
    const service = standInDutyRules(() => "2026-11-14", {
      "export-realisation": { reading: 1, confirmed: { name: "Walk Bank", on: "2026-11-14" } },
    });
    expect(service.state("close-by")).toMatchObject({ amount: 5, unit: "working_days" });
    expect(service.state("export-realisation")).toMatchObject({ amount: 15, usable: true });
    expect(service.state("dpdp-board-report").usable).toBe(false);
    expect(service.state("dpdp-board-report", "2027-05-12").usable).toBe(true);
  });
});

describe("months, years and retention (§5.1)", () => {
  it("names the month of a day, and its last day", () => {
    expect(periodOf("2026-11-14")).toBe("2026-11");
    expect(periodEnd("2026-11")).toBe("2026-11-30");
    expect(periodEnd("2027-02")).toBe("2027-02-28");
    expect(periodEnd("2028-02")).toBe("2028-02-29");
  });

  it("moves a month by whole months", () => {
    expect(addPeriods("2026-01", -2)).toBe("2025-11");
    expect(addPeriods("2026-11", 3)).toBe("2027-02");
    expect(addPeriods("2026-12", 1)).toBe("2027-01");
  });

  it("keeps a voucher to the end of the eighth financial year after its own", () => {
    expect(retentionUntil("2026-11-12", 8)).toBe("2035-03-31");
    expect(retentionUntil("2027-03-31", 8)).toBe("2035-03-31");
    expect(retentionUntil("2027-04-01", 8)).toBe("2036-03-31");
  });

  it("deposits tax deducted by the 7th of the next month, and by 30 April for March (§5.4)", () => {
    expect(tdsDepositDue("2026-11-12")).toBe("2026-12-07");
    expect(tdsDepositDue("2026-12-31")).toBe("2027-01-07");
    expect(tdsDepositDue("2027-03-20")).toBe("2027-04-30");
  });
});

describe("working days (§5.1)", () => {
  const none = new Set<string>();

  it("counts Monday to Friday by default, base day not counted", () => {
    expect(addWorkingDaysWith("2026-10-31", 5, none)).toBe("2026-11-06");
    expect(addWorkingDaysWith("2026-10-31", 5, new Set(["2026-11-04"]))).toBe("2026-11-09");
    expect(addWorkingDaysWith("2026-12-31", 5, none)).toBe("2027-01-07");
    expect(addWorkingDaysWith("2026-12-31", 5, new Set(["2027-01-01"]))).toBe("2027-01-08");
    expect(addWorkingDaysWith("2027-01-22", 3, new Set(["2027-01-26"]))).toBe("2027-01-28");
    expect(addWorkingDaysWith("2027-01-22", 3, none)).toBe("2027-01-27");
    expect(addWorkingDaysWith("2026-10-31", 0, none)).toBe("2026-10-31");
  });

  it("counts Saturdays when only Sunday is off", () => {
    expect(addWorkingDaysWith("2026-10-31", 5, none, [0])).toBe("2026-11-06");
    expect(addWorkingDaysWith("2026-11-06", 1, none, [0])).toBe("2026-11-07");
  });

  it("knows a working day", () => {
    expect(isWorkingDayWith("2026-11-14", none)).toBe(false);
    expect(isWorkingDayWith("2026-11-13", none)).toBe(true);
    expect(isWorkingDayWith("2026-11-13", new Set(["2026-11-13"]))).toBe(false);
    expect(isWorkingDayWith("2026-11-14", none, [0])).toBe(true);
  });
});

describe("the stand-in holidays (standInHolidays)", () => {
  const days = [
    { on: "2027-01-26", name: "Republic Day", kind: "national" as const },
    { on: "2026-11-04", name: "Walk company day", kind: "company" as const },
    { on: "2026-11-05", name: "Walk optional day", kind: "optional" as const },
  ];

  it("falls back to Monday to Friday with nothing recorded", () => {
    const service = standInHolidays();
    expect(service.addWorkingDays("2026-10-31", 5)).toBe("2026-11-06");
    expect(service.hasYear(2026)).toBe(false);
    expect(service.between("2026-01-01", "2027-12-31")).toEqual([]);
  });

  it("takes national, state and company days off, never optional ones", () => {
    const service = standInHolidays(days);
    expect(service.addWorkingDays("2026-10-31", 5)).toBe("2026-11-09");
    expect(service.isWorkingDay("2026-11-04")).toBe(false);
    expect(service.isWorkingDay("2026-11-05")).toBe(true);
    expect(service.addWorkingDays("2027-01-22", 3)).toBe("2027-01-28");
    expect(service.between("2026-11-01", "2027-12-31").map((day) => day.on)).toEqual([
      "2026-11-04",
      "2026-11-05",
      "2027-01-26",
    ]);
    expect(service.hasYear(2027)).toBe(true);
    expect(service.hasYear(2028)).toBe(false);
  });
});

describe("the stand-in month lock (standInMonthLock)", () => {
  it("locks the months given and says so in one sentence", () => {
    const lock = standInMonthLock(["2026-10"]);
    expect(lock.isLocked("2026-10")).toBe(true);
    expect(lock.isLocked("2026-11")).toBe(false);
    expect(lock.refusal("2026-10")).toBe(
      "October 2026 is locked. Reopen it on Month close, with a reason, to change this.",
    );
    expect(standInMonthLock().isLocked("2026-10")).toBe(false);
  });
});

describe("the edit log's hash text (editLineText)", () => {
  it("is the previous hash, a newline and the line's fields in a fixed order", () => {
    const line: Omit<EditLine, "hash"> = {
      at: "2026-11-14T10:00:00.000Z",
      by: { staff_id: "walk-owner", name: "Walk Owner" },
      changes: [{ field: "amount", before: "₹10,000", after: "₹11,800" }],
      verb: "changed",
      id: "walk-bill-1",
      record: "bill",
      n: 2,
    };
    const expected =
      'abc\n{"n":2,"record":"bill","id":"walk-bill-1","verb":"changed","changes":[{"field":"amount","before":"₹10,000","after":"₹11,800"}],"by":{"staff_id":"walk-owner","name":"Walk Owner"},"at":"2026-11-14T10:00:00.000Z"}';
    expect(editLineText("abc", line)).toBe(expected);
    expect(editLineText("abc", { ...line })).toBe(editLineText("abc", line));
  });
});
