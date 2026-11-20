// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { WALKER, startStack, type Stack } from "./helpers";

/**
 * Pen tests and findings through the service (ws-notes/security/spec.md §5.4, §8.4, §8.5):
 * a finding's fix-by day, his own day and back, overdue, fixed late, accepted and dismissed
 * with their reasons, reopened; the Due rows and their keys from 7 days before; the next
 * pen test 12 months after the report, at once after a large change, and a retest from 7
 * days before; his windows; search; `usedFor`; the Summary's lines and evidence. The
 * module's day is pinned, so §5.4's days hold on any day. Every tester and finding is invented.
 */

type Body = Record<string, unknown>;
const pdf = Buffer.from("%PDF-1.4\n% An invented report.\n").toString("base64");

describe("findings and pen tests", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack({ modules: ["files", "findings"] });
  }, 60_000);
  afterAll(() => stack.stop());

  const post = (path: string, body: Body = {}) => stack.ask("POST", path, { by: WALKER, ...body });
  const pin = (day: string) => post("/data/_test/findings/today", { day });
  const message = (answer: { json?: Body | null }) =>
    ((answer.json?.error ?? {}) as { message?: string }).message ?? "";
  const due = async (kind: string) => {
    const overview = (await stack.ask("GET", "/data/overview?due=all")).json!;
    return (overview.due as Body[]).filter((item) => item.kind === kind);
  };
  const page = async (query = "?view=all") =>
    (await stack.ask("GET", `/data/findings${query}`)).json!;
  const lookup = async (query = "") =>
    (await stack.ask("GET", `/data/_test/findings/lookup${query}`)).json!;

  let highId = "";

  it("starts empty: no pen test, no findings, HQ's windows, no Due row", async () => {
    await pin("2026-11-20");
    const empty = await page();
    expect(empty).toMatchObject({
      pen_tests: [],
      findings: [],
      counts: { open: 0, overdue: 0, all: 0 },
      windows: {
        critical: { days: 7, yours: false },
        high: { days: 30, yours: false },
        medium: { days: 90, yours: false },
        low: { days: 180, yours: false },
      },
      pen_test: { next_on: null, why: "No penetration test recorded.", months: 12 },
      in_force: null,
      last_import: null,
      today: "2026-11-20",
    });
    expect(await due("finding")).toEqual([]);
    expect(await due("pen_test")).toEqual([]);
    const summary = (await lookup()).summary as Body[];
    expect(summary.map((line) => [line.key, line.words, line.attention])).toEqual([
      ["pen_test", "No penetration test recorded.", true],
      ["findings", "No open findings.", false],
      ["dependabot", "No dependency alerts imported.", false],
    ]);
  });

  it("refuses what §8.3 refuses, with the page's sentence", async () => {
    expect(message(await post("/data/findings", { title: "Hi", severity: "high" }))).toBe(
      "Say what was found in 3 to 200 characters.",
    );
    expect(message(await post("/data/findings", { title: "Walk thing", severity: "huge" }))).toBe(
      "Choose the severity from the list.",
    );
    expect(
      message(
        await post("/data/findings", {
          title: "Walk thing",
          severity: "high",
          found_on: "2026-11-21",
        }),
      ),
    ).toBe("That day is in the future.");
    expect(
      message(
        await post("/data/findings", {
          title: "Walk thing",
          severity: "high",
          source: "dependabot",
        }),
      ),
    ).toBe("Dependency alerts come in through the import, not by hand.");
  });

  it("a high finding found 20 Nov 2026: fix by 20 Dec 2026, in Due from 13 Dec 2026", async () => {
    const made = await post("/data/findings", {
      title: "Walk admin page has no rate limit",
      severity: "high",
      source: "self",
      found_on: "2026-11-20",
      owner: "Walk Owner",
      attempt: crypto.randomUUID(),
    });
    expect(made.status, message(made)).toBe(200);
    const finding = made.json!.finding as Body & { finding_id: string; fix: Body };
    highId = finding.finding_id;
    expect(finding.fix).toMatchObject({
      fix_by: "2026-12-20",
      due_from: "2026-12-13",
      words: "Fix by 20 Dec 2026",
      because: null,
      lines: [],
    });
    expect(finding).toMatchObject({
      source_words: "Found by us",
      severity_words: "High",
      status_words: "Open",
      href: `/data/assurance/findings/${highId}`,
    });
    await pin("2026-12-12");
    expect(await due("finding")).toEqual([]);
    await pin("2026-12-13");
    expect(await due("finding")).toEqual([
      {
        key: `finding:${highId}`,
        kind: "finding",
        title: "Fix Walk admin page has no rate limit",
        sub: "High · Found by us · found 20 Nov 2026",
        due_on: "2026-12-20",
        href: `/data/assurance/findings/${highId}`,
      },
    ]);
  });

  it("his own day, with a reason, and back", async () => {
    expect(
      message(await post(`/data/findings/${highId}/move`, { on: "2027-01-10", why: "Soon" })),
    ).toBe("Say why the day moves, in 10 to 300 characters.");
    const moved = await post(`/data/findings/${highId}/move`, {
      on: "2027-01-10",
      why: "The fix needs the new login service.",
    });
    expect((moved.json!.finding as { fix: Body }).fix).toMatchObject({
      fix_by: "2027-01-10",
      words: "Fix by 10 Jan 2027",
      lines: ["Moved to 10 Jan 2027: The fix needs the new login service."],
    });
    expect((await due("finding"))[0]).toBeUndefined();
    const back = await post(`/data/findings/${highId}/move`, { undo: true });
    expect((back.json!.finding as { fix: Body }).fix).toMatchObject({ fix_by: "2026-12-20" });
  });

  it("overdue past its day; fixed 3 days after it; the Due row goes", async () => {
    await pin("2026-12-21");
    const open = (await page()).findings as Body[];
    expect((open[0]!.fix as Body).words).toBe("Overdue since 20 Dec 2026");
    expect((await page()).counts).toMatchObject({ open: 1, overdue: 1 });
    await pin("2026-12-23");
    expect(message(await post(`/data/findings/${highId}/fixed`, { on: "2026-11-19" }))).toBe(
      "It cannot be fixed before it was found.",
    );
    const fixed = await post(`/data/findings/${highId}/fixed`, {
      on: "2026-12-23",
      evidence: "Rate limit on, tested by hand.",
      content: pdf,
      name: "walk-evidence.pdf",
    });
    expect(fixed.status, message(fixed)).toBe(200);
    const row = fixed.json!.finding as Body & { fix: Body; evidence_file_id: string };
    expect(row.fix).toMatchObject({
      state: "fixed_late",
      words: "Fixed 3 days after its fix-by day",
    });
    expect(row.status).toBe("fixed");
    expect(await due("finding")).toEqual([]);
    const used = (await lookup(`?file_id=${row.evidence_file_id}`)).used_for as Body[];
    expect(used).toEqual([
      {
        label: "Evidence for “Walk admin page has no rate limit”, in Pen tests and findings",
        href: `/data/assurance/findings/${highId}`,
      },
    ]);
    const detail = (await stack.ask("GET", `/data/findings/${highId}`)).json!;
    expect((detail.events as Body[]).map((event) => event.verb)).toEqual([
      "fixed",
      "day moved back",
      "day moved",
      "added",
    ]);
    expect(detail.evidence_file).toMatchObject({ file_id: row.evidence_file_id });
  });

  it("accepted with a reason, reopened, dismissed", async () => {
    await pin("2026-11-20");
    const made = await post("/data/findings", {
      title: "Walk old library in the build",
      severity: "low",
      source: "customer",
    });
    const id = (made.json!.finding as { finding_id: string }).finding_id;
    expect(
      message(
        await post(`/data/findings/${id}/accept`, {
          why: "Fine",
          decided_by: "Walk Owner",
          on: "2026-11-20",
        }),
      ),
    ).toBe("Say why in 10 to 500 characters.");
    expect(
      message(
        await post(`/data/findings/${id}/accept`, {
          why: "Only used in tests here.",
          on: "2026-11-20",
        }),
      ),
    ).toBe("Say who decided it.");
    const accepted = await post(`/data/findings/${id}/accept`, {
      why: "Only used in tests here.",
      decided_by: "Walk Owner",
      on: "2026-11-20",
    });
    expect(accepted.json!.finding).toMatchObject({
      status: "accepted",
      decision: { why: "Only used in tests here.", decided_by: "Walk Owner", on: "2026-11-20" },
      fix: { state: "accepted", words: "Risk accepted" },
    });
    expect(
      message(await post(`/data/findings/${id}/dismiss`, { why: "Not a real problem at all." })),
    ).toBe("Only an open finding can be changed that way.");
    const reopened = await post(`/data/findings/${id}/reopen`);
    expect(reopened.json!.finding).toMatchObject({ status: "open", decision: null });
    const dismissed = await post(`/data/findings/${id}/dismiss`, {
      why: "The customer withdrew it.",
    });
    expect(dismissed.json!.finding).toMatchObject({
      status: "dismissed",
      decision: { why: "The customer withdrew it.", decided_by: "Walk Owner", on: "2026-11-20" },
    });
    expect(((await page("")).findings as Body[]).some((row) => row.finding_id === id)).toBe(false);
  });

  it("his windows: whole days 1 to 365, and the day moves with them", async () => {
    expect(message(await post("/data/findings/setup", { windows: { high: "0" } }))).toBe(
      "Type each window as a whole number of days from 1 to 365.",
    );
    expect(message(await post("/data/findings/setup", { pen_test_months: "30" }))).toBe(
      "Type the months as a whole number from 1 to 24.",
    );
    const set = await post("/data/findings/setup", { windows: { high: "14" } });
    expect(set.json!.windows).toMatchObject({ high: { days: 14, yours: true } });
    const made = await post("/data/findings", {
      title: "Walk window check",
      severity: "high",
      found_on: "2026-11-20",
    });
    expect((made.json!.finding as { fix: Body }).fix.fix_by).toBe("2026-12-04");
    await post("/data/findings/setup", { windows: { high: "" } });
    expect(((await page()).windows as Body).high).toEqual({ days: 30, yours: false });
  });

  it("a pen test by Walk Testers: the next one 12 months after the report, in Due from 30 days before", async () => {
    await pin("2026-11-20");
    expect(message(await post("/data/findings/pen-tests", { tester: "" }))).toBe(
      "Say who tested it, in at most 120 characters.",
    );
    expect(
      message(
        await post("/data/findings/pen-tests", {
          tester: "Walk Testers",
          started_on: "2026-10-05",
          report_on: "2026-10-02",
        }),
      ),
    ).toBe("The report cannot come before the test started.");
    const made = await post("/data/findings/pen-tests", {
      tester: "Walk Testers",
      kind: "third_party",
      empanelled: "no",
      scope: "The walk app and its API",
      started_on: "2026-09-20",
      report_on: "2026-10-02",
      content: pdf,
      name: "walk-pen-test.pdf",
      attempt: crypto.randomUUID(),
    });
    expect(made.status, message(made)).toBe(200);
    const test = made.json!.pen_test as Body & { pen_test_id: string; report_file_id: string };
    expect(test).toMatchObject({ kind_words: "Third party", empanelled_words: "No", checks: [] });
    expect(test.report_file).toMatchObject({ file_id: test.report_file_id });
    expect((await page()).pen_test).toMatchObject({
      next_on: "2027-10-02",
      why: "Last report 2 Oct 2026 by Walk Testers",
    });
    const used = (await lookup(`?file_id=${test.report_file_id}`)).used_for as Body[];
    expect(used[0]!.label).toBe(
      "Report of the penetration test by Walk Testers, in Pen tests and findings",
    );
    await pin("2027-09-01");
    expect(await due("pen_test")).toEqual([]);
    await pin("2027-09-02");
    expect(await due("pen_test")).toEqual([
      {
        key: "pen_test:next",
        kind: "pen_test",
        title: "The next penetration test",
        sub: "Last report 2 Oct 2026 by Walk Testers",
        due_on: "2027-10-02",
        href: "/data/assurance/findings",
      },
    ]);
    await pin("2026-11-20");
    const summary = (await lookup()).summary as Body[];
    expect(summary[0]).toMatchObject({
      key: "pen_test",
      words:
        "Last penetration test: report 2 Oct 2026 by Walk Testers, a third party. Next due 2 Oct 2027.",
      attention: false,
    });
    const evidence = (await lookup()).evidence as Body[];
    expect(evidence[0]).toEqual({
      ref: `findings:pen_test:${test.pen_test_id}`,
      label: "Penetration test by Walk Testers, 2 Oct 2026",
      href: `/data/assurance/findings/pen-tests/${test.pen_test_id}`,
      current: true,
      why: "",
    });

    // A retest planned for 30 Nov 2026 and not done: in Due from 23 Nov 2026.
    const retest = await post(`/data/findings/pen-tests/${test.pen_test_id}/retest`, {
      planned_on: "2026-11-30",
    });
    expect((retest.json!.pen_test as Body).checks).toEqual(["The retest is not done."]);
    await pin("2026-11-22");
    expect((await due("pen_test")).map((row) => row.key)).toEqual([]);
    await pin("2026-11-23");
    expect(await due("pen_test")).toEqual([
      {
        key: `pen_test:${test.pen_test_id}:retest`,
        kind: "pen_test",
        title: "Retest by Walk Testers",
        sub: "Planned for 30 Nov 2026",
        due_on: "2026-11-30",
        href: `/data/assurance/findings/pen-tests/${test.pen_test_id}`,
      },
    ]);
    await post(`/data/findings/pen-tests/${test.pen_test_id}/retest`, { done_on: "2026-11-23" });
    expect(await due("pen_test")).toEqual([]);

    // A large change on 5 Jan 2027: the next test is due that day.
    await pin("2027-01-05");
    const change = await post(`/data/findings/pen-tests/${test.pen_test_id}/large-change`, {
      on: "2027-01-05",
      what: "A new login service went live.",
    });
    expect((change.json!.pen_test as Body).checks).toEqual([
      "A large change since the last test: A new login service went live.",
    ]);
    expect((await page()).pen_test).toMatchObject({
      next_on: "2027-01-05",
      why: "A large change on 5 Jan 2027: A new login service went live.",
    });
    expect((await due("pen_test"))[0]).toMatchObject({
      key: "pen_test:next",
      due_on: "2027-01-05",
      sub: "A large change on 5 Jan 2027: A new login service went live.",
    });
    await post(`/data/findings/pen-tests/${test.pen_test_id}/large-change`, { undo: true });
    expect(((await page()).pen_test as Body).next_on).toBe("2027-10-02");
  });

  it("an old report: evidence older than 12 months", async () => {
    await pin("2026-11-20");
    const old = await post("/data/findings/pen-tests", {
      tester: "Walk Old Testers",
      report_on: "2025-10-02",
    });
    const id = (old.json!.pen_test as { pen_test_id: string }).pen_test_id;
    expect((old.json!.pen_test as Body).checks).toEqual(["No report attached."]);
    const option = ((await lookup()).evidence as Body[]).find(
      (item) => item.ref === `findings:pen_test:${id}`,
    );
    expect(option).toMatchObject({
      label: "Penetration test by Walk Old Testers, 2 Oct 2025",
      current: false,
      why: "Older than 12 months.",
    });
  });

  it("a pen test's findings, the Summary's findings line, search", async () => {
    await pin("2026-11-20");
    const tests = (await page()).pen_tests as Body[];
    const walk = tests.find((test) => test.tester === "Walk Testers")!;
    await post("/data/findings", {
      title: "Walk login form leaks a username",
      severity: "medium",
      source: "pen_test",
      pen_test_id: walk.pen_test_id,
      found_on: "2026-11-01",
    });
    const one = (await stack.ask("GET", `/data/findings/pen-tests/${String(walk.pen_test_id)}`))
      .json!;
    expect((one.findings as Body[]).map((row) => row.title)).toEqual([
      "Walk login form leaks a username",
    ]);
    expect((one.pen_test as Body).findings).toEqual({ open: 1, all: 1 });
    expect(
      message(
        await post("/data/findings", { title: "Walk x y", severity: "low", pen_test_id: "nope" }),
      ),
    ).toBe("That pen test is not here.");
    const line = ((await lookup()).summary as Body[]).find((item) => item.key === "findings")!;
    expect(line.words).toBe("2 open findings: 1 high, 1 medium.");
    expect(line.attention).toBe(false);
    await pin("2027-02-01");
    const late = ((await lookup()).summary as Body[]).find((item) => item.key === "findings")!;
    expect(late).toMatchObject({
      words: "2 open findings: 1 high, 1 medium; 2 overdue.",
      attention: true,
    });
    const groups = (await stack.ask("GET", "/data/_test/findings/search?q=login%20username")).json!
      .groups as Body[];
    expect(groups).toEqual([
      expect.objectContaining({
        kind: "finding",
        count: 1,
        hits: [
          expect.objectContaining({
            title: "Walk login form leaks a username",
            subtitle: "Medium · Open",
          }),
        ],
      }),
    ]);
    expect(
      (await stack.ask("GET", "/data/_test/findings/search?q=nothing-like-this")).json!.groups,
    ).toEqual([]);
  });

  it("the overview's block counts, with nothing from the people ledger", async () => {
    const overview = (await stack.ask("GET", "/data/overview")).json!;
    const parts = (overview.parts ?? overview) as Body;
    expect(JSON.stringify(parts)).not.toContain("Walk Intern");
  });
});
