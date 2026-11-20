// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  acceptFinding,
  addFinding,
  addPenTest,
  dismissFinding,
  findingFixed,
  importAlerts,
  moveFinding,
  previewAlerts,
  readFinding,
  readFindings,
  readPenTest,
  recordLargeChange,
  recordRetest,
  reopenFinding,
  saveFindingsSetup,
  updateFinding,
  updatePenTest,
} from "@/lib/data/api/findings";
import { walkAlerts } from "../../scripts/data/findings/walk-seed";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's findings client against the real stack (ws-notes/security/spec.md §8.7):
 * every answer passes its schema, with and without the stand-in profiles, each fix state the
 * schema names, the import's two steps, and a refusal arrives as the service's sentence.
 * Invented testers, findings and alerts only.
 */

let stack: Stack;

beforeAll(async () => {
  stack = await startStack({ env: true, modules: ["files", "findings"] });
}, 60_000);
afterAll(() => stack.stop());

describe("the portal and the findings register agree", () => {
  it("every answer parses: a pen test, findings in each state, the import", async () => {
    const empty = await readFindings();
    expect(empty.in_force).toBeNull();
    const test = await addPenTest(
      { tester: "Walk Testers", kind: "third_party", empanelled: "yes", report_on: "2026-10-02" },
      WALKER,
      crypto.randomUUID(),
    );
    const testId = test.pen_test.pen_test_id;
    await updatePenTest(testId, { scope: "The walk app" }, WALKER);
    await recordRetest(testId, { planned_on: "2099-01-01" }, WALKER);
    await recordLargeChange(testId, { on: "2026-10-20", what: "A new invented service." }, WALKER);
    const one = await addFinding(
      { title: "Walk contract finding", severity: "high", source: "pen_test", pen_test_id: testId },
      WALKER,
      crypto.randomUUID(),
    );
    const findingId = one.finding.finding_id;
    await updateFinding(findingId, { owner: "Walk Owner" }, WALKER);
    await moveFinding(findingId, { on: "2099-01-01", why: "An invented reason to wait." }, WALKER);
    await moveFinding(findingId, { undo: true }, WALKER);
    await findingFixed(findingId, { on: one.finding.found_on, evidence: "Checked." }, WALKER);
    await reopenFinding(findingId, WALKER);
    await acceptFinding(
      findingId,
      { why: "An invented accepted risk.", decided_by: "Walk Owner", on: one.finding.found_on },
      WALKER,
    );
    const other = await addFinding(
      { title: "Walk other finding", severity: "low", source: "self" },
      WALKER,
      crypto.randomUUID(),
    );
    await dismissFinding(other.finding.finding_id, { why: "An invented dismissal." }, WALKER);
    await saveFindingsSetup({ windows: { low: "60" }, pen_test_months: "6" }, WALKER);

    const today = (await readFindings()).today;
    const preview = await previewAlerts(
      {
        content: Buffer.from(JSON.stringify(walkAlerts(today))).toString("base64"),
        name: "walk-dependabot-alerts.json",
      },
      WALKER,
    );
    expect(preview.counts).toMatchObject({ alerts: 3, new: 3, refused: 1 });
    const done = await importAlerts(preview.import_id, WALKER, crypto.randomUUID());
    expect(done.counts.new).toBe(3);

    const all = await readFindings("all");
    expect(new Set(all.findings.map((row) => row.status))).toEqual(
      new Set(["accepted", "dismissed", "open", "fixed"]),
    );
    expect(all.last_import?.file_name).toBe("walk-dependabot-alerts.json");
    expect(all.windows.low).toEqual({ days: 60, yours: true });
    const alerts = await readFindings("all", "dependabot");
    expect(alerts.findings.every((row) => row.source === "dependabot")).toBe(true);
    const page = await readFinding(alerts.findings[0]!.finding_id);
    expect(page.finding.dependabot?.repo).toBe("walk-org/walk-app");
    const testPage = await readPenTest(testId);
    expect(testPage.findings).toHaveLength(1);
    expect(testPage.pen_test.checks.length).toBeGreaterThan(0);
  });

  it("with the stand-in profiles: the because line parses", async () => {
    await stack.ask("POST", "/data/_test/findings/seed", { by: WALKER });
    const page = await readFindings("all", "dependabot");
    expect(page.in_force).toHaveLength(1);
    const high = page.findings.find((row) => row.severity === "high")!;
    expect(high.fix.because).toMatchObject({ firm: "Walk Capital", key: "cscrf-patch" });
  });

  it("a refusal is the service's sentence", async () => {
    await expect(
      addFinding({ title: "Hi", severity: "high" }, WALKER, crypto.randomUUID()),
    ).rejects.toMatchObject({ status: 400, message: "Say what was found in 3 to 200 characters." });
    await expect(importAlerts("walk-gone", WALKER, crypto.randomUUID())).rejects.toMatchObject({
      status: 404,
      message: "That preview has expired. Choose the file again.",
    });
  });
});
