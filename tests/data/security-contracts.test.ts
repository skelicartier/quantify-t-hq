// @vitest-environment node
import { describe, expect, it } from "vitest";

import { addDays } from "../../scripts/data/days";
import {
  DEVICE_LEAVER_DAYS,
  FIX_WINDOWS_DEFAULT,
  FLOWDOWNS,
  LEAVER_DAYS,
  SECURITY_DUE_KINDS,
  SECURITY_MODULES,
  SECURITY_SERVICES,
  SECURITY_USED_FOR,
  cancelByOf,
  closeByOf,
  deviceByOf,
  fixByOf,
  flowdownOf,
  inDue,
  isFlowdownKey,
  istDayOf,
  nextOnOrAfter,
  standInDevices,
  standInPolicies,
  standInProfiles,
  standInRoster,
  standInSource,
  standInTools,
  type FindingSource,
  type FlowdownInForce,
  type RosterPerson,
  type SummaryLine,
} from "../../scripts/data/security-contracts";
import {
  CONTROL_REFS,
  CONTROLS_CHECKED,
  POLICY_KEYS,
  PRACTICES,
  countWords,
  everyWords,
  ofWords,
  spanOf,
  type Severity,
} from "../../src/lib/data/labels-controls";

/**
 * The security batch's contract file (ws-notes/security/spec.md §3.1, §5.1), which every
 * unit reads and nobody edits: every row of §5.1 for its day helpers, the eighteen duties a
 * customer passes down (keys once each, a source and the day it was read), `fixByOf`'s
 * earliest-wins and tie rules, the word helpers of the shared words, and the stand-ins as
 * documented. Pure: no stack, no clock. Every firm and person is invented.
 */

const WALK_CAPITAL = "walk-capital-entry";

/** Walk Capital's contract with `cscrf-patch` and `cscrf-vapt` in force. */
const IN_FORCE: FlowdownInForce[] = (["cscrf-patch", "cscrf-vapt"] as const).map((key) => ({
  entry_id: WALK_CAPITAL,
  firm: "Walk Capital",
  key,
  effect: flowdownOf(key).effect!,
}));

const fix = (
  severity: Severity,
  source: FindingSource,
  inForce: readonly FlowdownInForce[] = IN_FORCE,
  foundOn = "2026-11-20",
) =>
  fixByOf({
    found_on: foundOn,
    severity,
    source,
    windows: FIX_WINDOWS_DEFAULT,
    in_force: inForce,
  });

describe("the names", () => {
  it("nine modules in MODULES order, each answering usedFor, and ten Due kinds", () => {
    expect(SECURITY_MODULES).toEqual([
      "tools",
      "devices",
      "logs",
      "recovery",
      "policies",
      "findings",
      "assurance",
      "profiles",
      "questionnaires",
    ]);
    expect(SECURITY_USED_FOR).toEqual(SECURITY_MODULES);
    expect(SECURITY_DUE_KINDS).toHaveLength(10);
    expect(new Set(Object.values(SECURITY_SERVICES)).size).toBe(13);
    expect(SECURITY_SERVICES.policies).toBe("policies");
    expect(SECURITY_SERVICES.findings).toBe("findings");
    expect(SECURITY_SERVICES.assurance).toBe("assurance");
  });
});

describe("§5.1: the day helpers", () => {
  it("closeByOf: 27 Nov 2026 gives 28 Nov 2026 for a critical account, 2 Dec 2026 for any other", () => {
    expect(closeByOf("2026-11-27", true)).toBe("2026-11-28");
    expect(closeByOf("2026-11-27", false)).toBe("2026-12-02");
    expect(LEAVER_DAYS).toEqual({ critical: 1, other: 5 });
  });

  it("deviceByOf: a company device by the last day, a personal one within 5 days", () => {
    expect(deviceByOf("2026-11-27", "company")).toBe("2026-11-27");
    expect(deviceByOf("2026-11-27", "personal")).toBe("2026-12-02");
    expect(DEVICE_LEAVER_DAYS).toEqual({ company: 0, personal: 5 });
  });

  it("nextOnOrAfter: a 31st stays the month's last day and never drifts", () => {
    expect(nextOnOrAfter("2027-01-31", 1, "2027-02-14")).toBe("2027-02-28");
    expect(nextOnOrAfter("2027-01-31", 1, "2027-03-20")).toBe("2027-03-31");
    expect(nextOnOrAfter("2027-01-31", 1, "2027-04-01")).toBe("2027-04-30");
    expect(nextOnOrAfter("2027-01-31", 1, "2027-01-31")).toBe("2027-01-31");
    expect(nextOnOrAfter("2026-03-15", 12, "2026-11-20")).toBe("2027-03-15");
    expect(nextOnOrAfter("2028-02-29", 12, "2028-03-01")).toBe("2029-02-28");
  });

  it("cancelByOf: the renewal less the notice", () => {
    expect(cancelByOf("2027-03-15", 30)).toBe("2027-02-13");
    expect(cancelByOf("2027-03-15", null)).toBe("2027-03-15");
    expect(cancelByOf("2027-03-15", 90)).toBe("2026-12-15");
  });

  it("inDue: from `ahead` days before, and every day after", () => {
    expect(inDue("2027-02-13", "2027-01-14", 30)).toBe(true);
    expect(inDue("2027-02-13", "2027-01-13", 30)).toBe(false);
    expect(inDue("2027-02-13", "2027-03-01", 30)).toBe(true);
  });

  it("istDayOf: India's calendar day of an instant; null for anything else", () => {
    expect(istDayOf("2026-11-19T20:00:00Z")).toBe("2026-11-20");
    expect(istDayOf("2026-11-19T18:29:00Z")).toBe("2026-11-19");
    expect(istDayOf("2026-11-19T18:30:00Z")).toBe("2026-11-20");
    expect(istDayOf("nope")).toBeNull();
  });

  it("the weekdays §5 checks against", () => {
    const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
    expect(weekday("2026-11-20")).toBe(5);
    expect(weekday("2026-11-27")).toBe(5);
    expect(weekday("2026-11-28")).toBe(6);
    expect(weekday("2026-12-02")).toBe(3);
    expect(weekday("2027-02-13")).toBe(6);
    expect(weekday("2027-02-14")).toBe(0);
    expect(weekday("2027-02-28")).toBe(0);
    expect(weekday("2027-03-15")).toBe(1);
  });
});

describe("§5.1: fix-by days", () => {
  it("the windows alone, found 20 Nov 2026: 27 Nov 2026, 20 Dec 2026, 18 Feb 2027, 19 May 2027", () => {
    expect(FIX_WINDOWS_DEFAULT).toEqual({ critical: 7, high: 30, medium: 90, low: 180 });
    expect(fix("critical", "self", [])).toEqual({ fix_by: "2026-11-27", because: null });
    expect(fix("high", "self", [])).toEqual({ fix_by: "2026-12-20", because: null });
    expect(fix("medium", "self", [])).toEqual({ fix_by: "2027-02-18", because: null });
    expect(fix("low", "self", [])).toEqual({ fix_by: "2027-05-19", because: null });
  });

  it("with cscrf-patch and cscrf-vapt in force: dependency alerts", () => {
    expect(fix("high", "dependabot")).toEqual({
      fix_by: "2026-11-27",
      because: { entry_id: WALK_CAPITAL, firm: "Walk Capital", key: "cscrf-patch" },
    });
    expect(fix("medium", "dependabot")).toEqual({ fix_by: "2027-02-18", because: null });
    // The window is already 7 days: a tie names nobody.
    expect(fix("critical", "dependabot")).toEqual({ fix_by: "2026-11-27", because: null });
  });

  it("with cscrf-patch and cscrf-vapt in force: pen-test findings", () => {
    expect(fix("low", "pen_test")).toEqual({
      fix_by: "2027-02-20",
      because: { entry_id: WALK_CAPITAL, firm: "Walk Capital", key: "cscrf-vapt" },
    });
    expect(fix("medium", "pen_test")).toEqual({ fix_by: "2027-02-18", because: null });
    expect(fix("high", "pen_test")).toEqual({ fix_by: "2026-12-20", because: null });
    expect(fix("low", "pen_test", IN_FORCE, "2026-11-30")).toEqual({
      fix_by: "2027-02-28",
      because: { entry_id: WALK_CAPITAL, firm: "Walk Capital", key: "cscrf-vapt" },
    });
  });

  it("a duty that covers neither the source nor the severity changes nothing", () => {
    expect(fix("high", "self")).toEqual({ fix_by: "2026-12-20", because: null });
    expect(fix("high", "customer")).toEqual({ fix_by: "2026-12-20", because: null });
  });

  it("the earliest wins, and on a tie the first duty given is named", () => {
    const other: FlowdownInForce = {
      entry_id: "walk-other-entry",
      firm: "Walk Other Fund",
      key: "cscrf-patch",
      effect: { sources: ["dependabot"], severities: ["high"], days: 3, months: null },
    };
    expect(fix("high", "dependabot", [...IN_FORCE, other])).toEqual({
      fix_by: "2026-11-23",
      because: { entry_id: "walk-other-entry", firm: "Walk Other Fund", key: "cscrf-patch" },
    });
    const twin: FlowdownInForce = { ...IN_FORCE[0]!, entry_id: "walk-twin", firm: "Walk Twin" };
    expect(fix("high", "dependabot", [IN_FORCE[0]!, twin]).because?.firm).toBe("Walk Capital");
    expect(fix("high", "dependabot", [twin, IN_FORCE[0]!]).because?.firm).toBe("Walk Twin");
  });

  it("his own windows replace the defaults", () => {
    expect(
      fixByOf({
        found_on: "2026-11-20",
        severity: "high",
        source: "self",
        windows: { ...FIX_WINDOWS_DEFAULT, high: 14 },
        in_force: [],
      }),
    ).toEqual({ fix_by: addDays("2026-11-20", 14), because: null });
  });
});

describe("the duties customers pass down", () => {
  it("eighteen, each key once, each with a source and the day it was read", () => {
    expect(FLOWDOWNS).toHaveLength(18);
    expect(new Set(FLOWDOWNS.map((item) => item.key)).size).toBe(18);
    for (const item of FLOWDOWNS) {
      expect(item.sources.length, item.key).toBeGreaterThan(0);
      for (const source of item.sources) expect(source.url).toMatch(/^https:\/\//);
      expect(item.verified_on, item.key).toBe(CONTROLS_CHECKED);
      expect(item.words.length, item.key).toBeGreaterThan(5);
      expect(isFlowdownKey(item.key)).toBe(true);
    }
    expect(isFlowdownKey("cscrf-nope")).toBe(false);
    expect(() => flowdownOf("nope" as never)).toThrow();
  });

  it("only cscrf-vapt and cscrf-patch change anything in HQ", () => {
    expect(FLOWDOWNS.filter((item) => item.effect !== null).map((item) => item.key)).toEqual([
      "cscrf-vapt",
      "cscrf-patch",
    ]);
    expect(flowdownOf("cscrf-patch").effect).toEqual({
      sources: ["dependabot"],
      severities: ["critical", "high"],
      days: 7,
      months: null,
    });
    expect(flowdownOf("cscrf-vapt").effect).toMatchObject({ days: null, months: 3 });
  });
});

describe("the shared words' sizes and counts", () => {
  it("32 control references, 11 policies, 13 practices", () => {
    expect(Object.keys(CONTROL_REFS)).toHaveLength(32);
    expect(POLICY_KEYS).toHaveLength(11);
    expect(Object.keys(PRACTICES)).toHaveLength(13);
  });

  it("ofWords, countWords, spanOf, everyWords", () => {
    expect(ofWords(38, 200, "answered")).toBe("38 of 200 answered");
    expect(ofWords(1200, 2000, "answered")).toBe("1,200 of 2,000 answered");
    expect(countWords(1, "tool")).toBe("1 tool");
    expect(countWords(3, "tool")).toBe("3 tools");
    expect(countWords(2, "policy", "policies")).toBe("2 policies");
    expect(countWords(0, "device")).toBe("0 devices");
    expect(spanOf(7, "days")).toBe("7 days");
    expect(spanOf(1, "months")).toBe("1 month");
    expect(spanOf(12, "months")).toBe("12 months");
    expect(spanOf(1, "days")).toBe("1 day");
    expect(everyWords(1, "months")).toBe("every month");
    expect(everyWords(12, "months")).toBe("every year");
    expect(everyWords(3, "months")).toBe("every 3 months");
    expect(everyWords(1, "days")).toBe("every day");
    expect(everyWords(7, "days")).toBe("every 7 days");
  });
});

describe("the stand-ins answer as documented", () => {
  const line: SummaryLine = {
    key: "walk",
    area: "systems",
    title: "Walk",
    words: "Walk words.",
    attention: false,
    href: "/data",
  };

  it("standInSource: its lines and options as copies; usedFor answers nothing", () => {
    const option = { ref: "walk:x:1", label: "Walk", href: "/data", current: true, why: "" };
    const source = standInSource([line], [option]);
    const lines = source.summary("2026-11-20", false);
    expect(lines).toEqual([line]);
    lines[0]!.words = "changed";
    expect(source.summary("2026-11-20", true)[0]!.words).toBe("Walk words.");
    expect(source.evidence("2026-11-20")).toEqual([option]);
    expect(source.usedFor("any")).toEqual([]);
    expect(standInSource().summary("2026-11-20", false)).toEqual([]);
  });

  it("standInRoster: sorted by name; one person by id, or null", () => {
    const person = (person_id: string, name: string): RosterPerson => ({
      person_id,
      name,
      email: `${person_id}@walk.example`,
      kind: "intern",
      state: "engaged",
      starts_on: "2026-10-01",
      last_day: null,
      href: `/data/people/${person_id}`,
    });
    const roster = standInRoster([person("b", "Walk Intern Two"), person("a", "Walk Intern One")]);
    expect(roster.people("2026-11-20").map((item) => item.name)).toEqual([
      "Walk Intern One",
      "Walk Intern Two",
    ]);
    expect(roster.person("b", "2026-11-20")?.name).toBe("Walk Intern Two");
    expect(roster.person("c", "2026-11-20")).toBeNull();
  });

  it("standInTools, standInDevices, standInPolicies, standInProfiles", () => {
    const tool = {
      tool_id: "t",
      name: "Walk Mail",
      critical: true,
      holds: ["customer" as const],
      subprocessor: true,
      retired: false,
      href: "/data/systems/tools/t",
    };
    const tools = standInTools([tool], ["mailbox"]);
    expect(tools.tools()).toEqual([tool]);
    expect(tools.keyDateCovers()).toEqual(["mailbox"]);
    expect(tools.summary("2026-11-20", true)).toEqual([]);

    const device = {
      device_id: "d",
      label: "Walk Laptop 14",
      ownership: "personal" as const,
      by: "2026-12-02",
      done: false,
      href: "/data/systems/devices/d",
    };
    const devices = standInDevices({ p: [device] });
    expect(devices.forPerson("p", "2026-11-20")).toEqual([device]);
    expect(devices.forPerson("q", "2026-11-20")).toEqual([]);

    const file = {
      key: "access_control" as const,
      file_id: "f",
      title: "Walk access control policy",
      version: 3,
      href: "/data/files/f",
    };
    const policies = standInPolicies([file]);
    expect(policies.fileFor("access_control")).toEqual(file);
    expect(policies.fileFor("backup")).toBeNull();

    const profiles = standInProfiles(IN_FORCE);
    expect(profiles.inForce("2026-11-20")).toEqual(IN_FORCE);
    expect(profiles.forEntry(WALK_CAPITAL)).toBeNull();
    expect(standInProfiles().inForce("2026-11-20")).toEqual([]);
  });
});
