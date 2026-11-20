// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fixViewOf, penTestNextOf, windowsOf } from "../../scripts/data/findings/fixby";
import type { Finding, PenTest } from "../../scripts/data/findings/types";
import {
  FIX_WINDOWS_DEFAULT,
  flowdownOf,
  type FlowdownInForce,
} from "../../scripts/data/security-contracts";
import { NOT_EMPANELLED, NO_PROFILES } from "../../src/lib/data/labels-assurance";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * Fix-by days (ws-notes/security/spec.md §5.1, §5.4): with the stand-in profiles (Walk
 * Capital's contract with SEBI CSCRF's patch and test duties in force) every §5.1 row
 * through the service, the "because" line naming the firm and the duty, his own day and the
 * line when it is later than a contract allows, the Due window; without profiles, the
 * windows alone and the page's sentence. Every firm and finding is invented.
 */

type Body = Record<string, unknown>;

const WALK_CAPITAL: FlowdownInForce[] = (["cscrf-patch", "cscrf-vapt"] as const).map((key) => ({
  entry_id: "walk-capital",
  firm: "Walk Capital",
  key,
  effect: flowdownOf(key).effect!,
}));

const finding = (over: Partial<Finding>): Finding => ({
  finding_id: "walk-finding",
  title: "Walk finding",
  description: "",
  source: "self",
  severity: "high",
  found_on: "2026-11-20",
  pen_test_id: null,
  owner: "",
  status: "open",
  fixed_on: null,
  evidence: "",
  evidence_file_id: null,
  decision: null,
  own_fix_by: null,
  dependabot: null,
  created_at: "2026-11-20T00:00:00.000Z",
  created_by: WALKER,
  updated_at: "2026-11-20T00:00:00.000Z",
  updated_by: WALKER,
  ...over,
});

describe("a finding's day and its words (pure)", () => {
  it("a dependency alert under Walk Capital's contract: 27 Nov 2026, and why", () => {
    const view = fixViewOf(
      finding({ source: "dependabot" }),
      FIX_WINDOWS_DEFAULT,
      WALK_CAPITAL,
      "2026-11-20",
    );
    expect(view.fix_by).toBe("2026-11-27");
    expect(view.words).toBe("Fix by 27 Nov 2026");
    expect(view.because).toMatchObject({
      firm: "Walk Capital",
      key: "cscrf-patch",
      regime: "sebi",
    });
    expect(view.lines).toEqual([
      "Shorter because of Walk Capital's contract: high-severity missing patches fixed within 1 week.",
    ]);
    expect(view.due_from).toBe("2026-11-20");
  });

  it("his own day: moved to 10 Jan 2027, and later than the contract allows", () => {
    const why = "Waiting on the library's next release.";
    const view = fixViewOf(
      finding({ source: "dependabot", own_fix_by: { on: "2027-01-10", why } }),
      FIX_WINDOWS_DEFAULT,
      WALK_CAPITAL,
      "2026-11-20",
    );
    expect(view.fix_by).toBe("2027-01-10");
    expect(view.worked_out).toBe("2026-11-27");
    expect(view.lines).toEqual([
      "Shorter because of Walk Capital's contract: high-severity missing patches fixed within 1 week.",
      `Moved to 10 Jan 2027: ${why}`,
      "Later than Walk Capital's contract allows (27 Nov 2026).",
    ]);
    const self = fixViewOf(
      finding({ own_fix_by: { on: "2027-01-10", why } }),
      FIX_WINDOWS_DEFAULT,
      WALK_CAPITAL,
      "2026-11-20",
    );
    expect(self.lines).toEqual([`Moved to 10 Jan 2027: ${why}`]);
  });

  it("in Due from 7 days before; overdue past it; fixed late or in time", () => {
    const open = (today: string) => fixViewOf(finding({}), FIX_WINDOWS_DEFAULT, [], today);
    expect(open("2026-11-20")).toMatchObject({ fix_by: "2026-12-20", due_from: "2026-12-13" });
    expect(open("2026-12-20")).toMatchObject({ state: "due", words: "Fix by 20 Dec 2026" });
    expect(open("2026-12-21")).toMatchObject({
      state: "overdue",
      words: "Overdue since 20 Dec 2026",
    });
    const late = fixViewOf(
      finding({ status: "fixed", fixed_on: "2026-12-23" }),
      FIX_WINDOWS_DEFAULT,
      [],
      "2026-12-30",
    );
    expect(late).toMatchObject({ state: "fixed_late", words: "Fixed 3 days after its fix-by day" });
    const oneDay = fixViewOf(
      finding({ status: "fixed", fixed_on: "2026-12-21" }),
      FIX_WINDOWS_DEFAULT,
      [],
      "2026-12-30",
    );
    expect(oneDay.words).toBe("Fixed 1 day after its fix-by day");
    const inTime = fixViewOf(
      finding({ status: "fixed", fixed_on: "2026-12-20" }),
      FIX_WINDOWS_DEFAULT,
      [],
      "2026-12-30",
    );
    expect(inTime).toMatchObject({ state: "fixed", words: "Fixed 20 Dec 2026" });
  });

  it("his windows replace HQ's where he set one", () => {
    expect(windowsOf({ windows: { high: 14 } })).toEqual({ ...FIX_WINDOWS_DEFAULT, high: 14 });
    expect(windowsOf({ windows: {} })).toEqual(FIX_WINDOWS_DEFAULT);
  });

  it("the next pen test: 12 months after the latest report, or at once after a large change", () => {
    const test = (over: Partial<PenTest>): PenTest => ({
      pen_test_id: "walk-test",
      tester: "Walk Testers",
      empanelled: "",
      kind: "third_party",
      scope: "",
      started_on: null,
      report_on: "2026-10-02",
      report_file_id: null,
      retest: { planned_on: null, done_on: null, file_id: null },
      large_change: null,
      notes: "",
      created_at: "2026-10-02T00:00:00.000Z",
      created_by: WALKER,
      updated_at: "2026-10-02T00:00:00.000Z",
      updated_by: WALKER,
      ...over,
    });
    expect(penTestNextOf([test({})], 12)).toMatchObject({
      next_on: "2027-10-02",
      why: "Last report 2 Oct 2026 by Walk Testers",
    });
    expect(
      penTestNextOf(
        [test({ large_change: { on: "2027-01-05", what: "A new login service" } })],
        12,
      ),
    ).toMatchObject({
      next_on: "2027-01-05",
      why: "A large change on 5 Jan 2027: A new login service",
    });
    expect(penTestNextOf([], 12)).toMatchObject({
      next_on: null,
      why: "No penetration test recorded.",
    });
  });
});

describe("fix-by days through the service", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack({ modules: ["files", "findings"] });
  }, 60_000);
  afterAll(() => stack.stop());

  const post = (path: string, body: Body = {}) => stack.ask("POST", path, { by: WALKER, ...body });
  const list = async () => (await stack.ask("GET", "/data/findings?view=all")).json!;
  const fixOf = async (title: string) =>
    ((await list()).findings as Body[]).find((row) => row.title === title)!.fix as Body;

  it("without profiles: the windows alone, and the page's sentence", async () => {
    await post("/data/_test/findings/today", { day: "2026-11-20" });
    for (const [title, severity] of [
      ["Walk critical", "critical"],
      ["Walk high", "high"],
      ["Walk medium", "medium"],
      ["Walk low", "low"],
    ] as const)
      expect(
        (
          await post("/data/findings", {
            title,
            severity,
            source: "pen_test",
            found_on: "2026-11-20",
          })
        ).status,
      ).toBe(200);
    const page = await list();
    expect(page.in_force).toBeNull();
    expect(NO_PROFILES).toBe(
      "Customer duties are not loaded here, so no contract shortens these days.",
    );
    expect((await fixOf("Walk critical")).fix_by).toBe("2026-11-27");
    expect((await fixOf("Walk high")).fix_by).toBe("2026-12-20");
    expect((await fixOf("Walk medium")).fix_by).toBe("2027-02-18");
    expect((await fixOf("Walk low")).fix_by).toBe("2027-05-19");
  });

  it("with the stand-in profiles: §5.1's pen-test rows, and the because line", async () => {
    const installed = await post("/data/_test/findings/profiles", {
      in_force: [
        { entry_id: "walk-capital", firm: "Walk Capital", key: "cscrf-patch" },
        { entry_id: "walk-capital", firm: "Walk Capital", key: "cscrf-vapt" },
        { entry_id: "walk-capital", firm: "Walk Capital", key: "cscrf-sbom" },
      ],
    });
    expect(installed.json).toMatchObject({ installed: true });
    const page = await list();
    expect((page.in_force as Body[]).map((duty) => duty.key)).toEqual([
      "cscrf-patch",
      "cscrf-vapt",
    ]);
    const low = await fixOf("Walk low");
    expect(low).toMatchObject({
      fix_by: "2027-02-20",
      because: { firm: "Walk Capital", key: "cscrf-vapt" },
    });
    expect(low.lines).toEqual([
      "Shorter because of Walk Capital's contract: findings from a vulnerability assessment and penetration test closed within 3 months.",
    ]);
    expect(await fixOf("Walk medium")).toMatchObject({ fix_by: "2027-02-18", because: null });
    expect(await fixOf("Walk high")).toMatchObject({ fix_by: "2026-12-20", because: null });
    await post("/data/_test/findings/today", { day: "2026-11-30" });
    const later = await post("/data/findings", {
      title: "Walk low later",
      severity: "low",
      source: "pen_test",
      found_on: "2026-11-30",
    });
    expect(later.status).toBe(200);
    expect(await fixOf("Walk low later")).toMatchObject({
      fix_by: "2027-02-28",
      because: { key: "cscrf-vapt" },
    });
  });

  it("a contract asking for an empanelled tester: the line on a pen test that is not", async () => {
    // cscrf-empanelled has no effect on a day, so it is in the contract but not in `in_force`.
    await post("/data/_test/findings/profiles", {
      in_force: [{ entry_id: "walk-capital", firm: "Walk Capital", key: "cscrf-empanelled" }],
    });
    expect((await list()).in_force).toEqual([]);
    const test = async (tester: string, empanelled: "yes" | "no" | "") => {
      const made = await post("/data/findings/pen-tests", {
        tester,
        kind: "third_party",
        empanelled,
        scope: "The walk app",
        started_on: "2026-11-02",
        report_on: "2026-11-10",
        attempt: crypto.randomUUID(),
      });
      expect(made.status).toBe(200);
      return made.json!.pen_test as Body & { pen_test_id: string; checks: string[] };
    };
    expect((await test("Walk Testers Two", "no")).checks).toContain(NOT_EMPANELLED);
    expect((await test("Walk Testers Three", "")).checks).toContain(NOT_EMPANELLED);
    expect((await test("Walk Empanelled Testers", "yes")).checks).not.toContain(NOT_EMPANELLED);
    await post("/data/_test/findings/profiles", { in_force: [] });
    for (const row of (await list()).pen_tests as { checks: string[] }[])
      expect(row.checks).not.toContain(NOT_EMPANELLED);
  });

  it("a second stand-in call answers as installed; off removes only its own", async () => {
    expect((await post("/data/_test/findings/profiles", { on: false })).json).toMatchObject({
      installed: false,
    });
    expect((await list()).in_force).toBeNull();
    expect((await fixOf("Walk low")).fix_by).toBe("2027-05-19");
  });
});
