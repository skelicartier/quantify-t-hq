/**
 * The findings book (ws-notes/security/spec.md §8.2): `findings/pen-tests.json`,
 * `findings/findings.json`, `findings/setup.json` (his fix-by windows and pen-test months),
 * `findings/events.jsonl` (one line per change: verb and field names, never values) and
 * `findings/imports.jsonl` (one line per dependency-alert import: the file's name, its
 * SHA-256 and the counts, never an alert's words). Nothing is deleted: a finding is fixed,
 * accepted or dismissed, a pen test kept.
 */

import { createHash, randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import type { Flag } from "../company-contracts";
import type { DataCore } from "../core";
import { clean, cleanText, isDay } from "../guard";
import type { Staff } from "../protocol";
import type { FindingSource } from "../security-contracts";
import { isSeverity, SEVERITIES, type Severity } from "../../../src/lib/data/labels-controls";
import { blockOf, descriptionOf, planOf, statusOf, titleOf, type ParsedAlert } from "./dependabot";
import { LIMIT, SAY } from "./limits";
import type {
  Finding,
  FindingsEvent,
  ImportCounts,
  ImportLine,
  PenTest,
  Setup,
  Stamp,
} from "./types";

const PEN_TESTS = "findings/pen-tests.json";
const FINDINGS = "findings/findings.json";
const SETUP = "findings/setup.json";
const EVENTS = "findings/events.jsonl";
const IMPORTS = "findings/imports.jsonl";

type Input = Record<string, unknown>;

const FLAGS = new Set<string>(["yes", "no", ""]);
const KINDS = new Set<string>(["third_party", "in_house"]);
/** He adds these by hand; dependency alerts come in through the import. */
const BY_HAND = new Set<string>(["pen_test", "self", "customer", "other"]);

const has = (input: Input, name: string) => Object.prototype.hasOwnProperty.call(input, name);
const listOf = <T>(value: unknown, keep: (item: T) => boolean): T[] =>
  Array.isArray(value) ? (value as T[]).filter((item) => item && keep(item)) : [];

const WORDS: Record<string, string> = {
  title: "Title",
  description: "Description",
  source: "Source",
  severity: "Severity",
  found_on: "Found",
  pen_test_id: "Pen test",
  owner: "Owner",
  evidence: "Evidence",
  tester: "Tester",
  empanelled: "Empanelled",
  kind: "Kind",
  scope: "Scope",
  started_on: "Started",
  report_on: "Report",
  report_file_id: "Report file",
  notes: "Notes",
};

/** Names the fields that differ, in words; never their values. */
function changed(before: object, after: object): string {
  const a = before as Record<string, unknown>;
  const b = after as Record<string, unknown>;
  const keys = Object.keys(WORDS).filter(
    (key) => key in b && JSON.stringify(a[key]) !== JSON.stringify(b[key]),
  );
  return keys.length ? keys.map((key) => WORDS[key] ?? key).join(", ") : "Nothing";
}

export class FindingsBook {
  readonly #core: DataCore;
  penTests: PenTest[];
  findings: Finding[];
  setup: Setup;
  /** Today, as the module reads it (pinned under a test route). */
  today: () => string;
  /** Under test routes: the id the next finding added by hand takes (the walk's pinned record). */
  pinned: string | null = null;

  constructor(core: DataCore, today: () => string) {
    this.#core = core;
    this.today = today;
    core.store.ensureDir("findings");
    const tests = core.store.readJson<Record<string, unknown>>(PEN_TESTS, {});
    this.penTests = listOf<PenTest>(
      tests.pen_tests,
      (item) => typeof item.pen_test_id === "string",
    );
    const found = core.store.readJson<Record<string, unknown>>(FINDINGS, {});
    this.findings = listOf<Finding>(
      found.findings,
      (item) =>
        typeof item.finding_id === "string" && isDay(item.found_on) && isSeverity(item.severity),
    );
    const setup = core.store.readJson<Partial<Setup>>(SETUP, {});
    this.setup = {
      format: 1,
      windows: setup.windows && typeof setup.windows === "object" ? { ...setup.windows } : {},
      pen_test_months: typeof setup.pen_test_months === "number" ? setup.pen_test_months : null,
    };
  }

  // ---------------------------------------------------------------- storing

  #saveFindings(): void {
    this.#core.store.writeJson(FINDINGS, { format: 1, findings: this.findings });
  }

  #savePenTests(): void {
    this.#core.store.writeJson(PEN_TESTS, { format: 1, pen_tests: this.penTests });
  }

  log(target: FindingsEvent["target"], id: string, verb: string, detail: string, by: Staff): void {
    const line: FindingsEvent = {
      event_id: randomUUID(),
      target,
      id,
      verb,
      detail,
      by,
      at: this.#core.now(),
    };
    this.#core.store.appendLine(EVENTS, line);
  }

  eventsOf(id: string, limit = 50): FindingsEvent[] {
    return this.#core.store
      .readLines<FindingsEvent>(EVENTS)
      .filter((event) => typeof event?.event_id === "string" && event.id === id)
      .reverse()
      .slice(0, limit);
  }

  imports(): ImportLine[] {
    return this.#core.store
      .readLines<ImportLine>(IMPORTS)
      .filter((line) => typeof line?.at === "string" && line.counts);
  }

  lastImport(): ImportLine | null {
    return this.imports().at(-1) ?? null;
  }

  #stamp(by: Staff): Stamp {
    const now = this.#core.now();
    return { created_at: now, created_by: by, updated_at: now, updated_by: by };
  }

  #touch(record: Stamp, by: Staff): void {
    record.updated_at = this.#core.now();
    record.updated_by = by;
  }

  // ---------------------------------------------------------------- reading inputs

  #day(value: unknown, { past = false, required = "" } = {}): string | null {
    const day = clean(value, 10);
    if (!day) {
      if (required) throw new Refused(400, "invalid", required);
      return null;
    }
    if (!isDay(day)) throw new Refused(400, "invalid", SAY.notADay);
    if (past && day > this.today()) throw new Refused(400, "invalid", SAY.future);
    return day;
  }

  #why(value: unknown, min: number, max: number, say: string): string {
    const text = cleanText(value, max + 1);
    if (text.length < min || text.length > max) throw new Refused(400, "invalid", say);
    return text;
  }

  #flag(value: unknown): Flag {
    const flag = clean(value, 4);
    if (!FLAGS.has(flag)) throw new Refused(400, "invalid", SAY.flag);
    return flag as Flag;
  }

  // ---------------------------------------------------------------- findings

  finding(id: string | undefined): Finding {
    const found = id ? this.findings.find((item) => item.finding_id === id) : undefined;
    if (!found) throw new Refused(404, "not_found", SAY.finding);
    return found;
  }

  #findingFields(input: Input, base: Finding | null) {
    const pick = <K extends keyof Finding>(key: K, read: (value: unknown) => Finding[K]) =>
      has(input, key) ? read(input[key]) : base ? base[key] : read(undefined);
    const title = pick("title", (value) => {
      const text = cleanText(value, LIMIT.title + 1);
      if (text.length < LIMIT.title_min || text.length > LIMIT.title)
        throw new Refused(400, "invalid", SAY.title);
      return text;
    });
    const severity = pick("severity", (value) => {
      const text = clean(value, 10);
      if (!isSeverity(text)) throw new Refused(400, "invalid", SAY.severity);
      return text;
    });
    const source = pick("source", (value) => {
      const text = clean(value, 12) || "self";
      if (text === "dependabot" && base?.source !== "dependabot")
        throw new Refused(400, "invalid", SAY.sourceByHand);
      if (text !== "dependabot" && !BY_HAND.has(text))
        throw new Refused(400, "invalid", SAY.source);
      return text as FindingSource;
    });
    const foundOn = pick(
      "found_on",
      (value) => this.#day(value, { past: true }) ?? this.#day(this.today())!,
    );
    const penTestId = pick("pen_test_id", (value) => {
      const id = clean(value, 64);
      if (!id) return null;
      this.penTest(id);
      return id;
    });
    const owner = pick("owner", (value) => {
      const text = cleanText(value, LIMIT.owner + 1);
      if (text.length > LIMIT.owner) throw new Refused(400, "invalid", SAY.owner);
      return text;
    });
    if (base?.fixed_on && base.fixed_on < foundOn)
      throw new Refused(400, "invalid", SAY.fixedBefore);
    return {
      title,
      description: pick("description", (value) => cleanText(value, LIMIT.description)),
      source,
      severity,
      found_on: foundOn,
      pen_test_id: penTestId,
      owner,
      evidence: pick("evidence", (value) => cleanText(value, LIMIT.evidence)),
    };
  }

  addFinding(input: Input, by: Staff): Finding {
    if (this.findings.length >= LIMIT.findings)
      throw new Refused(409, "too_many", SAY.tooManyFindings);
    const finding: Finding = {
      finding_id: this.pinned ?? randomUUID(),
      ...this.#findingFields(input, null),
      status: "open",
      fixed_on: null,
      evidence_file_id: null,
      decision: null,
      own_fix_by: null,
      dependabot: null,
      ...this.#stamp(by),
    };
    this.pinned = null;
    this.findings.push(finding);
    this.#saveFindings();
    this.log("finding", finding.finding_id, "added", "", by);
    return finding;
  }

  updateFinding(finding: Finding, input: Input, by: Staff): Finding {
    const fields = this.#findingFields(input, finding);
    const detail = changed(finding, fields);
    Object.assign(finding, fields);
    this.#touch(finding, by);
    this.#saveFindings();
    this.log("finding", finding.finding_id, "changed", detail, by);
    return finding;
  }

  /** Checks a fix before a copy of the evidence is kept. */
  checkFixed(finding: Finding, input: Input): string {
    if (finding.status !== "open") throw new Refused(409, "invalid", SAY.notOpen);
    const on = this.#day(input.on, { past: true }) ?? this.today();
    if (on < finding.found_on) throw new Refused(400, "invalid", SAY.fixedBefore);
    return on;
  }

  fixed(finding: Finding, input: Input, fileId: string | null, by: Staff): Finding {
    const on = this.checkFixed(finding, input);
    finding.status = "fixed";
    finding.fixed_on = on;
    if (has(input, "evidence")) finding.evidence = cleanText(input.evidence, LIMIT.evidence);
    if (fileId) finding.evidence_file_id = fileId;
    this.#touch(finding, by);
    this.#saveFindings();
    this.log("finding", finding.finding_id, "fixed", fileId ? "Evidence kept in Files" : "", by);
    return finding;
  }

  accept(finding: Finding, input: Input, by: Staff): Finding {
    if (finding.status !== "open") throw new Refused(409, "invalid", SAY.notOpen);
    const why = this.#why(input.why, LIMIT.why_min, LIMIT.why, SAY.why);
    const decidedBy = cleanText(input.decided_by, LIMIT.decided_by + 1);
    if (!decidedBy || decidedBy.length > LIMIT.decided_by)
      throw new Refused(400, "invalid", SAY.decidedBy);
    const on = this.#day(input.on, { past: true, required: SAY.decidedOn })!;
    finding.status = "accepted";
    finding.decision = { why, decided_by: decidedBy, on };
    this.#touch(finding, by);
    this.#saveFindings();
    this.log("finding", finding.finding_id, "accepted", "", by);
    return finding;
  }

  dismiss(finding: Finding, input: Input, by: Staff): Finding {
    if (finding.status !== "open") throw new Refused(409, "invalid", SAY.notOpen);
    const why = this.#why(input.why, LIMIT.why_min, LIMIT.why, SAY.why);
    finding.status = "dismissed";
    finding.decision = { why, decided_by: by.name, on: this.today() };
    this.#touch(finding, by);
    this.#saveFindings();
    this.log("finding", finding.finding_id, "dismissed", "", by);
    return finding;
  }

  reopen(finding: Finding, by: Staff): Finding {
    if (finding.status === "open") throw new Refused(409, "invalid", SAY.open);
    finding.status = "open";
    finding.fixed_on = null;
    finding.decision = null;
    this.#touch(finding, by);
    this.#saveFindings();
    this.log("finding", finding.finding_id, "reopened", "", by);
    return finding;
  }

  move(finding: Finding, input: Input, by: Staff): Finding {
    if (input.undo === true) {
      finding.own_fix_by = null;
      this.#touch(finding, by);
      this.#saveFindings();
      this.log("finding", finding.finding_id, "day moved back", "", by);
      return finding;
    }
    if (finding.status !== "open") throw new Refused(409, "invalid", SAY.notOpen);
    const on = this.#day(input.on, { required: SAY.moveOn })!;
    if (on < finding.found_on) throw new Refused(400, "invalid", SAY.fixedBefore);
    const why = this.#why(input.why, LIMIT.why_min, LIMIT.own_why, SAY.ownWhy);
    finding.own_fix_by = { on, why };
    this.#touch(finding, by);
    this.#saveFindings();
    this.log("finding", finding.finding_id, "day moved", "", by);
    return finding;
  }

  // ---------------------------------------------------------------- pen tests

  penTest(id: string | undefined): PenTest {
    const found = id ? this.penTests.find((item) => item.pen_test_id === id) : undefined;
    if (!found) throw new Refused(404, "not_found", SAY.penTest);
    return found;
  }

  #penTestFields(input: Input, base: PenTest | null) {
    const pick = <K extends keyof PenTest>(key: K, read: (value: unknown) => PenTest[K]) =>
      has(input, key) ? read(input[key]) : base ? base[key] : read(undefined);
    const tester = pick("tester", (value) => {
      const text = cleanText(value, LIMIT.tester + 1);
      if (!text || text.length > LIMIT.tester) throw new Refused(400, "invalid", SAY.tester);
      return text;
    });
    const kind = pick("kind", (value) => {
      const text = clean(value, 12) || "third_party";
      if (!KINDS.has(text)) throw new Refused(400, "invalid", SAY.kind);
      return text as PenTest["kind"];
    });
    const scope = pick("scope", (value) => {
      const text = cleanText(value, LIMIT.scope + 1);
      if (text.length > LIMIT.scope) throw new Refused(400, "invalid", SAY.scope);
      return text;
    });
    const startedOn = pick("started_on", (value) => this.#day(value, { past: true }));
    const reportOn = pick("report_on", (value) => this.#day(value, { past: true }));
    if (startedOn && reportOn && reportOn < startedOn)
      throw new Refused(400, "invalid", SAY.reportBefore);
    return {
      tester,
      empanelled: pick("empanelled", (value) => this.#flag(value)),
      kind,
      scope,
      started_on: startedOn,
      report_on: reportOn,
      notes: pick("notes", (value) => cleanText(value, LIMIT.notes)),
    };
  }

  /** Checks a pen test's fields before a copy of the report is kept. */
  checkPenTest(input: Input, base: PenTest | null): void {
    if (!base && this.penTests.length >= LIMIT.pen_tests)
      throw new Refused(409, "too_many", SAY.tooManyPenTests);
    this.#penTestFields(input, base);
  }

  addPenTest(input: Input, reportFileId: string | null, by: Staff): PenTest {
    this.checkPenTest(input, null);
    const test: PenTest = {
      pen_test_id: randomUUID(),
      ...this.#penTestFields(input, null),
      report_file_id: reportFileId,
      retest: { planned_on: null, done_on: null, file_id: null },
      large_change: null,
      ...this.#stamp(by),
    };
    this.penTests.push(test);
    this.#savePenTests();
    this.log("pen_test", test.pen_test_id, "added", "", by);
    return test;
  }

  /** `reportFileId`: a report just kept, null to take it off, undefined to leave it. */
  updatePenTest(
    test: PenTest,
    input: Input,
    reportFileId: string | null | undefined,
    by: Staff,
  ): PenTest {
    const fields = {
      ...this.#penTestFields(input, test),
      report_file_id: reportFileId === undefined ? test.report_file_id : reportFileId,
    };
    const detail = changed(test, fields);
    Object.assign(test, fields);
    this.#touch(test, by);
    this.#savePenTests();
    this.log("pen_test", test.pen_test_id, "changed", detail, by);
    return test;
  }

  /** Checks a retest before its report is kept. */
  checkRetest(test: PenTest, input: Input): { planned_on: string | null; done_on: string | null } {
    const plannedOn = has(input, "planned_on")
      ? this.#day(input.planned_on)
      : test.retest.planned_on;
    const doneOn = has(input, "done_on")
      ? this.#day(input.done_on, { past: true })
      : test.retest.done_on;
    if (doneOn && test.report_on && doneOn < test.report_on)
      throw new Refused(400, "invalid", SAY.retestBefore);
    return { planned_on: plannedOn, done_on: doneOn };
  }

  retest(test: PenTest, input: Input, fileId: string | null, by: Staff): PenTest {
    const days = this.checkRetest(test, input);
    test.retest = { ...days, file_id: fileId ?? test.retest.file_id };
    this.#touch(test, by);
    this.#savePenTests();
    this.log("pen_test", test.pen_test_id, days.done_on ? "retested" : "retest planned", "", by);
    return test;
  }

  largeChange(test: PenTest, input: Input, by: Staff): PenTest {
    if (input.undo === true) {
      test.large_change = null;
      this.#touch(test, by);
      this.#savePenTests();
      this.log("pen_test", test.pen_test_id, "large change taken back", "", by);
      return test;
    }
    const on = this.#day(input.on, { past: true }) ?? this.today();
    const what = this.#why(input.what, LIMIT.change_min, LIMIT.change, SAY.change);
    test.large_change = { on, what };
    this.#touch(test, by);
    this.#savePenTests();
    this.log("pen_test", test.pen_test_id, "large change", "", by);
    return test;
  }

  // ---------------------------------------------------------------- setup

  saveSetup(input: Input, by: Staff): Setup {
    const windows: Partial<Record<Severity, number>> = { ...this.setup.windows };
    const given =
      input.windows && typeof input.windows === "object"
        ? (input.windows as Record<string, unknown>)
        : {};
    for (const severity of SEVERITIES) {
      if (!has(given, severity)) continue;
      const text = clean(String(given[severity] ?? ""), 6);
      if (!text) {
        delete windows[severity];
        continue;
      }
      const days = /^\d+$/.test(text) ? Number(text) : NaN;
      if (!Number.isInteger(days) || days < LIMIT.window_min || days > LIMIT.window_max)
        throw new Refused(400, "invalid", SAY.window);
      windows[severity] = days;
    }
    let months = this.setup.pen_test_months;
    if (has(input, "pen_test_months")) {
      const text = clean(String(input.pen_test_months ?? ""), 4);
      if (!text) months = null;
      else {
        const value = /^\d+$/.test(text) ? Number(text) : NaN;
        if (!Number.isInteger(value) || value < LIMIT.months_min || value > LIMIT.months_max)
          throw new Refused(400, "invalid", SAY.months);
        months = value;
      }
    }
    this.setup = { format: 1, windows, pen_test_months: months };
    this.#core.store.writeJson(SETUP, this.setup);
    this.log("setup", "setup", "changed", "Fix-by windows, pen-test months", by);
    return this.setup;
  }

  // ---------------------------------------------------------------- dependency alerts

  /** The finding an alert is already here as, by `repo#number`. */
  byAlert(): Map<string, Finding> {
    const map = new Map<string, Finding>();
    for (const finding of this.findings)
      if (finding.dependabot)
        map.set(`${finding.dependabot.repo}#${finding.dependabot.number}`, finding);
    return map;
  }

  /** Applies a preview's alerts: new ones become findings, the rest are refreshed. */
  applyAlerts(
    alerts: readonly ParsedAlert[],
    refused: number,
    file: { name: string; sha256: string },
    by: Staff,
  ): ImportCounts {
    const today = this.today();
    const now = this.#core.now();
    const known = this.byAlert();
    const counts: ImportCounts = {
      alerts: alerts.length,
      new: 0,
      changed: 0,
      unchanged: 0,
      refused,
    };
    const fresh = alerts.filter((alert) => !known.has(alert.key)).length;
    if (this.findings.length + fresh > LIMIT.findings)
      throw new Refused(409, "too_many", SAY.tooManyFindings);
    for (const alert of alerts) {
      const existing = known.get(alert.key);
      const plan = planOf(alert, existing, today);
      counts[plan] += 1;
      if (!existing) {
        const finding: Finding = {
          finding_id: randomUUID(),
          title: titleOf(alert),
          description: descriptionOf(alert),
          source: "dependabot",
          severity: alert.severity,
          found_on: alert.found_on,
          pen_test_id: null,
          owner: "",
          ...statusOf(alert, today),
          evidence: "",
          evidence_file_id: null,
          own_fix_by: null,
          dependabot: blockOf(alert, now),
          ...this.#stamp(by),
        };
        this.findings.push(finding);
        this.log("finding", finding.finding_id, "imported", "From the dependency alerts", by);
        continue;
      }
      const wasOpen = existing.status === "open";
      existing.dependabot = blockOf(alert, now);
      existing.description = descriptionOf(alert);
      if (existing.severity !== alert.severity) {
        existing.severity = alert.severity;
        this.log("finding", existing.finding_id, "severity changed", "On the code host", by);
      }
      if (existing.status !== "accepted") {
        const next = statusOf(alert, today);
        if (next.status === "open" && !wasOpen)
          this.log("finding", existing.finding_id, "Open again on the code host", "", by);
        else if (next.status !== existing.status)
          this.log("finding", existing.finding_id, next.status, "On the code host", by);
        Object.assign(existing, next);
      }
      if (plan === "changed") this.#touch(existing, by);
    }
    this.#saveFindings();
    const line: ImportLine = { at: now, by, file_name: file.name, sha256: file.sha256, counts };
    this.#core.store.appendLine(IMPORTS, line);
    this.log("import", "import", "dependency alerts imported", `${counts.alerts} alerts`, by);
    return counts;
  }
}

export const sha256Of = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");
