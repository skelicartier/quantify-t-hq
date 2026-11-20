/**
 * Pen tests and findings (ws-notes/security/spec.md §8): each penetration test (tester,
 * CERT-In empanelled or not, scope, report, retest, a large change since) and when the next
 * one is due; each finding with its fix-by day from his windows and the duties customers'
 * contracts pass down (`profiles.inForce`), his own day with a reason, and how it ended; and
 * the code host's dependency alerts imported from a file he saves, in two steps (a preview
 * kept in memory for 10 minutes under an `import_id`, then the import). HQ never connects to
 * the code host: no fetch, no socket, no token.
 *
 * Due rows of kinds `finding` (from 7 days before the fix-by day) and `pen_test` (the next
 * test from 30 days before; a retest from 7), none Owner-only; search (`search:findings`);
 * the `findings` service (`FindingsLookup`: `usedFor`, Summary lines, evidence); the
 * overview's `findings` block. Nothing here sends, files or pays anything.
 */

import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

import { Refused } from "../../mail-merge/engine";
import type { DataCore, DueItem } from "../core";
import { clean, isDay } from "../guard";
import { checkCopy, copyGiven, fileChoices, fileLink, keepCopy } from "../meetings/copy";
import { snippetOf } from "../notes/snippet";
import type { Staff } from "../protocol";
import { searchService, type SearchSource } from "../raise-contracts";
import {
  SECURITY_SERVICES,
  flowdownOf,
  isFlowdownKey,
  standInProfiles,
  type EvidenceOption,
  type FindingsLookup,
  type FlowdownInContract,
  type FlowdownInForce,
  type ProfilesLookup,
  type SummaryLine,
} from "../security-contracts";
import { toCsv } from "../text";
import { findTerms, matchesTerms } from "../../../src/lib/merge/find";
import { dayWords } from "../../../src/lib/data/labels-company";
import {
  NOT_EMPANELLED,
  NO_PEN_TEST,
  NO_REPORT,
  RETEST_NOT_DONE,
  FINDING_SOURCES,
  FINDING_SOURCE_KEYS,
  FINDING_STATUSES,
  PEN_TEST_KINDS,
  PEN_TEST_KIND_WORDS,
  previewWords,
} from "../../../src/lib/data/labels-assurance";
import { FLAGS } from "../../../src/lib/data/labels-company";
import {
  SEVERITIES,
  SEVERITY_WORDS,
  countWords,
  spanOf,
  type Severity,
} from "../../../src/lib/data/labels-controls";
import { FindingsBook, sha256Of } from "./book";
import { parseAlerts, planOf, titleOf, type ParsedAlert } from "./dependabot";
import {
  findingInDue,
  fixViewOf,
  penTestInDue,
  penTestMonths,
  penTestNextOf,
  reportOlderThan,
  retestInDue,
  windowsOf,
  type FixView,
} from "./fixby";
import { LIMIT, SAY } from "./limits";
import type { Finding, PenTest } from "./types";
import { WALK_CAPITAL, WALK_FINDING_ID } from "./walk-seed";

const BOM = "﻿";
const PAGE = "/data/assurance/findings";
const REPORT_FOLDER = ["Security", "Pen tests"];
const EVIDENCE_FOLDER = ["Security", "Findings"];

export const findingHref = (id: string): string => `${PAGE}/${id}`;
export const penTestHref = (id: string): string => `${PAGE}/pen-tests/${id}`;

/** A stand-in carries this mark, so another unit's test route may replace it and `{ on: false }` finds its own. */
export const STAND_IN = Symbol.for("hq.security.stand-in");

type Pending = {
  import_id: string;
  alerts: ParsedAlert[];
  refused: { index: number; why: string }[];
  name: string;
  sha256: string;
  at: number;
};

/** The body's `in_force`, read as `profiles.inForce` would answer it; keys without an effect are left out. */
export function inForceOf(raw: unknown): FlowdownInForce[] {
  if (!Array.isArray(raw)) return [];
  const list: FlowdownInForce[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (!isFlowdownKey(record.key)) continue;
    const effect = flowdownOf(record.key).effect;
    if (!effect) continue;
    list.push({
      entry_id: clean(record.entry_id, 64) || "walk-entry",
      firm: clean(record.firm, 200) || "A customer",
      key: record.key,
      effect,
    });
  }
  return list;
}

/** The body's `in_force`, read as `profiles.inContract` would answer it: every flowdown key kept. */
export function inContractOf(raw: unknown): FlowdownInContract[] {
  if (!Array.isArray(raw)) return [];
  const list: FlowdownInContract[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (!isFlowdownKey(record.key)) continue;
    list.push({
      entry_id: clean(record.entry_id, 64) || "walk-entry",
      firm: clean(record.firm, 200) || "A customer",
      key: record.key,
    });
  }
  return list;
}

export async function register(core: DataCore): Promise<void> {
  /** The module's day: pinned under a test route so tests read §5.4's days; else today. */
  let pinnedDay: string | null = null;
  const today = (): string => pinnedDay ?? core.day();
  const book = new FindingsBook(core, today);
  const pending = new Map<string, Pending>();

  function safely<T>(ask: () => T): T | null {
    try {
      return ask();
    } catch (error) {
      core.log(`findings: a lookup failed: ${error instanceof Error ? error.name : "error"}`);
      return null;
    }
  }

  /** The duties in force today, or null when no profiles answer here. */
  const inForceNow = (on = today()): FlowdownInForce[] | null => {
    const profiles = core.need<ProfilesLookup>(SECURITY_SERVICES.profiles);
    if (!profiles || typeof profiles.inForce !== "function") return null;
    return safely(() => profiles.inForce(on)) ?? [];
  };

  /** Whether a contract in force today asks for a CERT-In-empanelled tester. */
  const empanelledAsked = (on = today()): boolean => {
    const profiles = core.need<ProfilesLookup>(SECURITY_SERVICES.profiles);
    if (!profiles || typeof profiles.inContract !== "function") return false;
    const duties = safely(() => profiles.inContract(on)) ?? [];
    return duties.some((duty) => duty.key === "cscrf-empanelled");
  };

  const windows = () => windowsOf(book.setup);
  const months = () => penTestMonths(book.setup);
  const nextTest = () => penTestNextOf(book.penTests, months());

  const fixOf = (finding: Finding, inForce: FlowdownInForce[] | null, on = today()): FixView =>
    fixViewOf(finding, windows(), inForce ?? [], on);

  // ---------------------------------------------------------------- rows

  const testerOf = (id: string | null): string | null =>
    id ? (book.penTests.find((test) => test.pen_test_id === id)?.tester ?? null) : null;

  const findingRow = (finding: Finding, inForce: FlowdownInForce[] | null, on = today()) => ({
    ...finding,
    fix: fixOf(finding, inForce, on),
    source_words: FINDING_SOURCES[finding.source],
    severity_words: SEVERITY_WORDS[finding.severity],
    status_words: FINDING_STATUSES[finding.status].label,
    pen_test_tester: testerOf(finding.pen_test_id),
    href: findingHref(finding.finding_id),
  });

  const penTestChecks = (test: PenTest): string[] => {
    const checks: string[] = [];
    if (!test.report_file_id) checks.push(NO_REPORT);
    // Shown only when a contract in force asks for an empanelled auditor. That duty has no
    // effect on a day, so it is read from `inContract`, not `inForce`.
    if (test.empanelled !== "yes" && empanelledAsked()) checks.push(NOT_EMPANELLED);
    if (test.retest.planned_on && !test.retest.done_on) checks.push(RETEST_NOT_DONE);
    if (test.large_change)
      checks.push(`A large change since the last test: ${test.large_change.what}`);
    return checks;
  };

  const penTestRow = (test: PenTest) => {
    const linked = book.findings.filter((finding) => finding.pen_test_id === test.pen_test_id);
    return {
      ...test,
      kind_words: PEN_TEST_KINDS[test.kind],
      empanelled_words: FLAGS[test.empanelled],
      findings: {
        open: linked.filter((finding) => finding.status === "open").length,
        all: linked.length,
      },
      checks: penTestChecks(test),
      report_file: fileLink(core, test.report_file_id),
      retest_file: fileLink(core, test.retest.file_id),
      href: penTestHref(test.pen_test_id),
    };
  };

  const sortFindings = (rows: ReturnType<typeof findingRow>[]) =>
    rows.sort(
      (a, b) =>
        Number(a.status !== "open") - Number(b.status !== "open") ||
        a.fix.fix_by.localeCompare(b.fix.fix_by) ||
        a.title.localeCompare(b.title),
    );

  const countsOf = (inForce: FlowdownInForce[] | null, on = today()) => {
    const open = book.findings.filter((finding) => finding.status === "open");
    const bySeverity = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0])) as Record<
      Severity,
      number
    >;
    for (const finding of open) bySeverity[finding.severity] += 1;
    return {
      open: open.length,
      overdue: open.filter((finding) => fixOf(finding, inForce, on).state === "overdue").length,
      by_severity: bySeverity,
      all: book.findings.length,
    };
  };

  const windowsAnswer = () => {
    const mine = windows();
    return Object.fromEntries(
      SEVERITIES.map((severity) => [
        severity,
        { days: mine[severity], yours: typeof book.setup.windows[severity] === "number" },
      ]),
    ) as Record<Severity, { days: number; yours: boolean }>;
  };

  const lastImport = () => {
    const line = book.lastImport();
    return line
      ? { at: line.at, on: core.day(line.at), file_name: line.file_name, counts: line.counts }
      : null;
  };

  // ---------------------------------------------------------------- Due

  const dueItems = (): DueItem[] => {
    const on = today();
    const inForce = inForceNow(on);
    const items: DueItem[] = [];
    for (const finding of book.findings) {
      if (finding.status !== "open") continue;
      const fix = fixOf(finding, inForce, on);
      if (!findingInDue(fix, on)) continue;
      items.push({
        key: `finding:${finding.finding_id}`,
        kind: "finding",
        title: `Fix ${finding.title}`,
        sub: `${SEVERITY_WORDS[finding.severity]} · ${FINDING_SOURCES[finding.source]} · found ${dayWords(finding.found_on)}`,
        due_on: fix.fix_by,
        href: findingHref(finding.finding_id),
      });
    }
    const next = nextTest();
    if (penTestInDue(next, on))
      items.push({
        key: "pen_test:next",
        kind: "pen_test",
        title: "The next penetration test",
        sub: next.why,
        due_on: next.next_on!,
        href: PAGE,
      });
    for (const test of book.penTests)
      if (retestInDue(test, on))
        items.push({
          key: `pen_test:${test.pen_test_id}:retest`,
          kind: "pen_test",
          title: `Retest by ${test.tester}`,
          sub: `Planned for ${dayWords(test.retest.planned_on)}`,
          due_on: test.retest.planned_on!,
          href: penTestHref(test.pen_test_id),
        });
    return items;
  };
  core.provideDue(dueItems);

  // ---------------------------------------------------------------- search

  const textOf = (finding: Finding): string[] => [
    finding.title,
    finding.description,
    finding.dependabot?.ghsa_id ?? "",
    finding.dependabot?.cve_id ?? "",
    finding.dependabot?.package ?? "",
  ];
  const search: SearchSource = {
    search: ({ terms, kind, limit }) => {
      if (terms.length === 0 || (kind !== null && kind !== "finding")) return [];
      const found = book.findings
        .filter((finding) => matchesTerms(textOf(finding), terms))
        .sort(
          (a, b) =>
            Number(a.status !== "open") - Number(b.status !== "open") ||
            b.found_on.localeCompare(a.found_on),
        );
      if (found.length === 0) return [];
      return [
        {
          kind: "finding",
          count: found.length,
          hits: found.slice(0, Math.max(0, limit)).map((finding) => ({
            kind: "finding" as const,
            id: finding.finding_id,
            title: finding.title,
            subtitle: `${SEVERITY_WORDS[finding.severity]} · ${FINDING_STATUSES[finding.status].label}`,
            snippet: snippetOf(finding.description, terms),
            href: findingHref(finding.finding_id),
          })),
        },
      ];
    },
  };
  core.provide(searchService("findings"), search);

  // ---------------------------------------------------------------- the service

  const summaryLines = (on: string): SummaryLine[] => {
    const inForce = inForceNow(on);
    const next = penTestNextOf(book.penTests, months());
    const lines: SummaryLine[] = [];
    const latest = next.latest;
    lines.push({
      key: "pen_test",
      area: "assurance",
      title: "Penetration test",
      words: latest
        ? `Last penetration test: report ${dayWords(latest.report_on)} by ${latest.tester}, ${PEN_TEST_KIND_WORDS[latest.kind]}. Next due ${dayWords(next.next_on)}.`
        : book.penTests.length
          ? `A penetration test by ${book.penTests[0]!.tester} has no report yet.`
          : NO_PEN_TEST,
      attention: !latest || (next.next_on !== null && next.next_on < on),
      href: PAGE,
    });
    const counts = countsOf(inForce, on);
    const parts = SEVERITIES.filter((severity) => counts.by_severity[severity] > 0).map(
      (severity) => `${counts.by_severity[severity]} ${severity}`,
    );
    lines.push({
      key: "findings",
      area: "assurance",
      title: "Findings",
      words:
        counts.open === 0
          ? "No open findings."
          : `${countWords(counts.open, "open finding")}: ${parts.join(", ")}${counts.overdue > 0 ? `; ${counts.overdue} overdue` : ""}.`,
      attention: counts.overdue > 0,
      href: PAGE,
    });
    const imported = book.lastImport();
    const openAlerts = book.findings.filter(
      (finding) => finding.source === "dependabot" && finding.status === "open",
    ).length;
    lines.push({
      key: "dependabot",
      area: "assurance",
      title: "Dependency alerts",
      words: imported
        ? `Dependency alerts last imported ${dayWords(core.day(imported.at))}: ${openAlerts} open.`
        : "No dependency alerts imported.",
      attention: false,
      href: `${PAGE}?source=dependabot`,
    });
    return lines;
  };

  const evidence = (on: string): EvidenceOption[] => {
    const options: EvidenceOption[] = [];
    const span = months();
    for (const test of book.penTests) {
      const older = test.report_on ? reportOlderThan(test.report_on, span, on) : false;
      options.push({
        ref: `findings:pen_test:${test.pen_test_id}`,
        label: test.report_on
          ? `Penetration test by ${test.tester}, ${dayWords(test.report_on)}`
          : `Penetration test by ${test.tester}, no report yet`,
        href: penTestHref(test.pen_test_id),
        current: test.report_on !== null && !older,
        why: !test.report_on
          ? "No report yet."
          : older
            ? `Older than ${spanOf(span, "months")}.`
            : "",
      });
    }
    const counts = countsOf(inForceNow(on), on);
    options.push({
      ref: "findings:register",
      label: "The findings register",
      href: PAGE,
      current: counts.overdue === 0,
      why:
        counts.overdue === 0
          ? ""
          : `${countWords(counts.overdue, "finding")} past ${counts.overdue === 1 ? "its" : "their"} fix-by day.`,
    });
    return options;
  };

  const service: FindingsLookup = {
    usedFor: (fileId) => {
      const lines: { label: string; href: string }[] = [];
      for (const test of book.penTests) {
        if (test.report_file_id === fileId)
          lines.push({
            label: `Report of the penetration test by ${test.tester}, in Pen tests and findings`,
            href: penTestHref(test.pen_test_id),
          });
        if (test.retest.file_id === fileId)
          lines.push({
            label: `Retest report by ${test.tester}, in Pen tests and findings`,
            href: penTestHref(test.pen_test_id),
          });
      }
      for (const finding of book.findings)
        if (finding.evidence_file_id === fileId)
          lines.push({
            label: `Evidence for “${finding.title}”, in Pen tests and findings`,
            href: findingHref(finding.finding_id),
          });
      return lines;
    },
    summary: (on) => summaryLines(on),
    evidence: (on) => evidence(on),
  };
  core.provide(SECURITY_SERVICES.findings, service);

  core.provideOverview("findings", () => {
    const counts = countsOf(inForceNow());
    const next = dueItems().sort(
      (a, b) => a.due_on.localeCompare(b.due_on) || a.title.localeCompare(b.title),
    )[0];
    return {
      open: counts.open,
      overdue: counts.overdue,
      pen_tests: book.penTests.length,
      pen_test_next: nextTest().next_on,
      next: next ? { title: next.title, on: next.due_on } : null,
    };
  });

  // ---------------------------------------------------------------- copies in Files

  async function copyOf(
    body: Record<string, unknown>,
    place: { folder: string[]; title: string },
    by: Staff,
  ): Promise<string | null> {
    if (!copyGiven(body)) return null;
    checkCopy(core, body);
    const file = await keepCopy(core, body, { ...place, note: place.title }, by);
    return file.file_id;
  }

  // ---------------------------------------------------------------- routes (fixed paths first)

  core.route("GET", "/data/findings", (ctx) => {
    const on = today();
    const view = ctx.query.get("view") === "all" ? "all" : "open";
    const asked = clean(ctx.query.get("source"), 12);
    const source = (FINDING_SOURCE_KEYS as readonly string[]).includes(asked) ? asked : "";
    const inForce = inForceNow(on);
    const next = nextTest();
    return {
      view,
      source,
      pen_tests: book.penTests
        .map((test) => penTestRow(test))
        .sort(
          (a, b) =>
            (b.report_on ?? b.started_on ?? "").localeCompare(a.report_on ?? a.started_on ?? "") ||
            b.created_at.localeCompare(a.created_at),
        ),
      findings: sortFindings(
        book.findings
          .filter((finding) => view === "all" || finding.status === "open")
          .filter((finding) => !source || finding.source === source)
          .map((finding) => findingRow(finding, inForce, on)),
      ),
      counts: countsOf(inForce, on),
      windows: windowsAnswer(),
      pen_test: {
        next_on: next.next_on,
        why: next.why,
        months: next.months,
        yours: book.setup.pen_test_months !== null,
      },
      in_force: inForce,
      last_import: lastImport(),
      files: fileChoices(core),
      files_here: core.need("files") !== null,
      today: on,
    };
  });

  core.route("POST", "/data/findings", (ctx) => {
    const by = ctx.staff();
    return { finding: findingRow(book.addFinding(ctx.body, by), inForceNow()) };
  });

  core.route("POST", "/data/findings/setup", (ctx) => {
    const by = ctx.staff();
    const setup = book.saveSetup(ctx.body, by);
    return { windows: windowsAnswer(), pen_test_months: setup.pen_test_months };
  });

  // ---------------------------------------------------------------- dependency alerts

  const sweep = () => {
    const cutoff = Date.now() - LIMIT.preview_ms;
    for (const [id, item] of pending) if (item.at < cutoff) pending.delete(id);
  };

  core.route("POST", "/data/findings/dependabot/preview", (ctx) => {
    ctx.staff();
    sweep();
    const content = typeof ctx.body.content === "string" ? ctx.body.content : "";
    if (!content) throw new Refused(400, "empty", SAY.empty);
    // Base64 grows a file by a third: a quick refusal before decoding a file far too large.
    if (content.length > Math.ceil((LIMIT.file_bytes * 4) / 3) + 8)
      throw new Refused(400, "too_large", SAY.tooLarge);
    const bytes = new Uint8Array(Buffer.from(content, "base64"));
    const parsed = parseAlerts(bytes);
    if (parsed.alerts.length === 0 && parsed.refused.length === 0)
      throw new Refused(400, "empty", SAY.nothing);
    const name =
      clean(ctx.body.name, LIMIT.file_name).replace(/[\\/]/g, "_") || "dependabot-alerts.json";
    const item: Pending = {
      import_id: randomUUID(),
      alerts: parsed.alerts,
      refused: parsed.refused,
      name,
      sha256: sha256Of(bytes),
      at: Date.now(),
    };
    pending.set(item.import_id, item);
    const on = today();
    const known = book.byAlert();
    const plans = parsed.alerts.map((alert) => planOf(alert, known.get(alert.key), on));
    const counts = {
      alerts: parsed.alerts.length,
      new: plans.filter((plan) => plan === "new").length,
      changed: plans.filter((plan) => plan === "changed").length,
      unchanged: plans.filter((plan) => plan === "unchanged").length,
      refused: parsed.refused.length,
    };
    const repos = [...new Set(parsed.alerts.map((alert) => alert.repo))].sort();
    return {
      import_id: item.import_id,
      repos,
      counts,
      words: previewWords({ ...counts, repos }),
      sample: parsed.alerts.slice(0, LIMIT.sample).map((alert, index) => ({
        index: alert.index,
        key: alert.key,
        repo: alert.repo,
        number: alert.number,
        title: titleOf(alert),
        package: alert.package,
        ghsa_id: alert.ghsa_id,
        cve_id: alert.cve_id,
        severity: alert.severity,
        state: alert.state,
        found_on: alert.found_on,
        plan: plans[index]!,
      })),
      refused: parsed.refused,
      file_name: name,
    };
  });

  core.route("POST", "/data/findings/dependabot/import", (ctx) => {
    const by = ctx.staff();
    sweep();
    const id = clean(ctx.body.import_id, 64);
    const item = id ? pending.get(id) : undefined;
    if (!item) throw new Refused(404, "expired", SAY.expired);
    const counts = book.applyAlerts(
      item.alerts,
      item.refused.length,
      { name: item.name, sha256: item.sha256 },
      by,
    );
    pending.delete(item.import_id);
    return { counts };
  });

  // ---------------------------------------------------------------- pen tests

  core.route("POST", "/data/findings/pen-tests", async (ctx) => {
    const by = ctx.staff();
    book.checkPenTest(ctx.body, null);
    const tester = clean(ctx.body.tester, LIMIT.tester);
    const fileId = await copyOf(
      ctx.body,
      { folder: REPORT_FOLDER, title: `Penetration test report by ${tester}` },
      by,
    );
    return { pen_test: penTestRow(book.addPenTest(ctx.body, fileId, by)) };
  });

  core.route("GET", "/data/findings/pen-tests/:id", (ctx) => {
    const test = book.penTest(ctx.params[0]);
    const on = today();
    const inForce = inForceNow(on);
    return {
      pen_test: penTestRow(test),
      findings: sortFindings(
        book.findings
          .filter((finding) => finding.pen_test_id === test.pen_test_id)
          .map((finding) => findingRow(finding, inForce, on)),
      ),
      events: book.eventsOf(test.pen_test_id),
      next: nextTest(),
      files: fileChoices(core),
      files_here: core.need("files") !== null,
      today: on,
    };
  });

  core.route("POST", "/data/findings/pen-tests/:id/update", async (ctx) => {
    const by = ctx.staff();
    const test = book.penTest(ctx.params[0]);
    book.checkPenTest(ctx.body, test);
    const fileId = await copyOf(
      ctx.body,
      { folder: REPORT_FOLDER, title: `Penetration test report by ${test.tester}` },
      by,
    );
    const report = fileId ?? (ctx.body.clear_report === true ? null : undefined);
    return { pen_test: penTestRow(book.updatePenTest(test, ctx.body, report, by)) };
  });

  core.route("POST", "/data/findings/pen-tests/:id/retest", async (ctx) => {
    const by = ctx.staff();
    const test = book.penTest(ctx.params[0]);
    book.checkRetest(test, ctx.body);
    const fileId = await copyOf(
      ctx.body,
      { folder: REPORT_FOLDER, title: `Retest report by ${test.tester}` },
      by,
    );
    return { pen_test: penTestRow(book.retest(test, ctx.body, fileId, by)) };
  });

  core.route("POST", "/data/findings/pen-tests/:id/large-change", (ctx) => {
    const by = ctx.staff();
    const test = book.penTest(ctx.params[0]);
    return { pen_test: penTestRow(book.largeChange(test, ctx.body, by)) };
  });

  // ---------------------------------------------------------------- one finding

  const findingAnswer = (finding: Finding) => {
    const on = today();
    const inForce = inForceNow(on);
    const test = finding.pen_test_id
      ? (book.penTests.find((item) => item.pen_test_id === finding.pen_test_id) ?? null)
      : null;
    return {
      finding: findingRow(finding, inForce, on),
      pen_test: test ? penTestRow(test) : null,
      pen_tests: book.penTests
        .map((item) => ({
          pen_test_id: item.pen_test_id,
          tester: item.tester,
          report_on: item.report_on,
        }))
        .sort((a, b) => (b.report_on ?? "").localeCompare(a.report_on ?? "")),
      evidence_file: fileLink(core, finding.evidence_file_id),
      events: book.eventsOf(finding.finding_id),
      in_force: inForce,
      files: fileChoices(core),
      files_here: core.need("files") !== null,
      today: on,
    };
  };

  core.route("GET", "/data/findings/:id", (ctx) => findingAnswer(book.finding(ctx.params[0])));

  const one = (finding: Finding) => ({ finding: findingRow(finding, inForceNow()) });

  core.route("POST", "/data/findings/:id/update", (ctx) => {
    const by = ctx.staff();
    return one(book.updateFinding(book.finding(ctx.params[0]), ctx.body, by));
  });

  core.route("POST", "/data/findings/:id/fixed", async (ctx) => {
    const by = ctx.staff();
    const finding = book.finding(ctx.params[0]);
    book.checkFixed(finding, ctx.body);
    const fileId = await copyOf(
      ctx.body,
      { folder: EVIDENCE_FOLDER, title: `Evidence: ${finding.title}` },
      by,
    );
    return one(book.fixed(finding, ctx.body, fileId, by));
  });

  core.route("POST", "/data/findings/:id/accept", (ctx) => {
    const by = ctx.staff();
    return one(book.accept(book.finding(ctx.params[0]), ctx.body, by));
  });

  core.route("POST", "/data/findings/:id/dismiss", (ctx) => {
    const by = ctx.staff();
    return one(book.dismiss(book.finding(ctx.params[0]), ctx.body, by));
  });

  core.route("POST", "/data/findings/:id/reopen", (ctx) => {
    const by = ctx.staff();
    return one(book.reopen(book.finding(ctx.params[0]), by));
  });

  core.route("POST", "/data/findings/:id/move", (ctx) => {
    const by = ctx.staff();
    return one(book.move(book.finding(ctx.params[0]), ctx.body, by));
  });

  // ---------------------------------------------------------------- the register as a CSV

  core.builds.provide("findings_csv", async (handle, input) => {
    const on = today();
    const inForce = inForceNow(on);
    const rows = [...book.findings].sort(
      (a, b) => a.found_on.localeCompare(b.found_on) || a.title.localeCompare(b.title),
    );
    handle.setProgress(0, rows.length);
    await core.yield();
    const lines = rows.map((finding) => {
      const fix = fixOf(finding, inForce, on);
      return [
        finding.title,
        SEVERITY_WORDS[finding.severity],
        FINDING_SOURCES[finding.source],
        FINDING_STATUSES[finding.status].label,
        finding.found_on,
        fix.fix_by,
        fix.because ? `${fix.because.firm}: ${fix.because.key}` : "",
        finding.own_fix_by?.why ?? "",
        finding.fixed_on ?? "",
        finding.decision?.why ?? "",
        finding.decision?.decided_by ?? "",
        finding.owner,
        testerOf(finding.pen_test_id) ?? "",
        finding.dependabot?.repo ?? "",
        finding.dependabot?.ghsa_id ?? "",
        finding.dependabot?.cve_id ?? "",
        finding.dependabot?.package ?? "",
        finding.dependabot?.html_url ?? "",
      ];
    });
    const text =
      BOM +
      toCsv(
        [
          "title",
          "severity",
          "source",
          "status",
          "found_on",
          "fix_by",
          "shorter_because",
          "moved_because",
          "fixed_on",
          "decision",
          "decided_by",
          "owner",
          "pen_test_by",
          "repository",
          "advisory",
          "cve",
          "package",
          "alert_address",
        ],
        lines,
      );
    writeFileSync(handle.path, text, { mode: 0o600 });
    handle.setProgress(rows.length, rows.length);
    core.store.appendLine("findings/exports.jsonl", {
      at: core.now(),
      by: input.by,
      kind: "findings",
      rows: rows.length,
    });
    return { name: `Findings ${on}.csv`, type: "text/csv; charset=utf-8" };
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    const installProfiles = (body: Record<string, unknown>) => {
      const current = core.need<ProfilesLookup & { [STAND_IN]?: true }>(SECURITY_SERVICES.profiles);
      const isStandIn = current !== null && current[STAND_IN] === true;
      if (body.on === false) {
        if (isStandIn) core.provide(SECURITY_SERVICES.profiles, null);
        return { installed: false };
      }
      if (current && !isStandIn) return { installed: false, real: true };
      const fake = Object.assign(
        standInProfiles(inForceOf(body.in_force), inContractOf(body.in_force)),
        {
          [STAND_IN]: true as const,
        },
      );
      core.provide(SECURITY_SERVICES.profiles, fake);
      return { installed: true };
    };

    core.route("POST", "/data/_test/findings/profiles", (ctx) => {
      ctx.staff();
      return installProfiles(ctx.body);
    });

    core.route("POST", "/data/_test/findings/today", (ctx) => {
      ctx.staff();
      const day = ctx.body.day;
      if (day === null || day === undefined || day === "") pinnedDay = null;
      else if (isDay(day)) pinnedDay = day;
      else throw new Refused(400, "invalid", SAY.notADay);
      return { today: today(), pinned: pinnedDay !== null };
    });

    core.route("POST", "/data/_test/findings/expire", (ctx) => {
      ctx.staff();
      for (const item of pending.values()) item.at = 0;
      return { expired: pending.size };
    });

    /**
     * The walk's stand-ins: Walk Capital with SEBI CSCRF's patch duty in its contract, and
     * `walk-finding` for the next finding added by hand (the harness opens its page). Safe twice.
     */
    core.route("POST", "/data/_test/findings/seed", (ctx) => {
      ctx.staff();
      const exists = book.findings.some((item) => item.finding_id === WALK_FINDING_ID);
      book.pinned = exists ? null : WALK_FINDING_ID;
      return {
        profiles: installProfiles({ in_force: [{ ...WALK_CAPITAL, key: "cscrf-patch" }] }),
        pinned: book.pinned,
      };
    });

    core.route("GET", "/data/_test/findings/search", (ctx) => {
      const query = clean(ctx.query.get("q"), LIMIT.search);
      return {
        groups:
          core.need<SearchSource>(searchService("findings"))?.search({
            query,
            terms: findTerms(query),
            kind: null,
            limit: 5,
          }) ?? [],
      };
    });

    core.route("GET", "/data/_test/findings/lookup", (ctx) => {
      const on = today();
      const lookup = core.need<FindingsLookup>(SECURITY_SERVICES.findings);
      return {
        summary: lookup?.summary(on, ctx.query.get("owner") === "1") ?? [],
        evidence: lookup?.evidence(on) ?? [],
        used_for: lookup?.usedFor(clean(ctx.query.get("file_id"), 64)) ?? [],
        today: on,
      };
    });
  }
}
