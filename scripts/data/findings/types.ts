/**
 * Pen tests and findings (ws-notes/security/spec.md §8.2): the penetration tests with their
 * reports, retests and the large changes since; the findings with fix-by days worked out
 * from his windows and the duties customers' contracts pass down; and the code host's
 * dependency alerts imported as findings. On disk under `data/findings/`. A finding keeps
 * the HQ service's names (`src/lib/api/trust.ts`) so a later move maps field for field:
 * `owner` ↔ `owner_name`, the worked-out `fix_by` ↔ `due_on`, `decision` ↔
 * `decided_by_name` and `decision_reason`.
 */

import type { Flag } from "../company-contracts";
import type { Staff } from "../protocol";
import type { FindingSource, FixWindows } from "../security-contracts";
import type { HostState, PenTestKind } from "../../../src/lib/data/labels-assurance";
import type { Severity } from "../../../src/lib/data/labels-controls";

export type Stamp = {
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
};

export type PenTest = Stamp & {
  pen_test_id: string;
  /** The firm or person, as typed. */
  tester: string;
  /** CERT-In-empanelled. */
  empanelled: Flag;
  kind: PenTestKind;
  scope: string;
  started_on: string | null;
  report_on: string | null;
  /** Files, "Security › Pen tests". */
  report_file_id: string | null;
  retest: { planned_on: string | null; done_on: string | null; file_id: string | null };
  large_change: { on: string; what: string } | null;
  notes: string;
};

export type FindingStatus = "open" | "fixed" | "accepted" | "dismissed";

/** What is kept of a dependency alert: only these fields, never the advisory's long text. */
export type DependabotBlock = {
  /** "walk-org/walk-app", from `html_url`. */
  repo: string;
  number: number;
  ghsa_id: string;
  cve_id: string | null;
  package: string;
  ecosystem: string;
  manifest_path: string;
  vulnerable_range: string;
  patched: string | null;
  html_url: string;
  state: HostState;
  dismissed_reason: string | null;
  imported_at: string;
};

export type Finding = Stamp & {
  finding_id: string;
  title: string;
  description: string;
  source: FindingSource;
  severity: Severity;
  found_on: string;
  pen_test_id: string | null;
  owner: string;
  status: FindingStatus;
  fixed_on: string | null;
  evidence: string;
  evidence_file_id: string | null;
  /** Accepted (his decision) or dismissed (his, or the code host's for an alert). */
  decision: { why: string; decided_by: string; on: string } | null;
  own_fix_by: { on: string; why: string } | null;
  dependabot: DependabotBlock | null;
};

export type Setup = {
  format: 1;
  windows: Partial<FixWindows>;
  pen_test_months: number | null;
};

export type FindingsEvent = {
  event_id: string;
  target: "finding" | "pen_test" | "setup" | "import";
  id: string;
  verb: string;
  /** Field names or a short sentence; never an alert's words. */
  detail: string;
  by: Staff;
  at: string;
};

/** One line of `findings/imports.jsonl`: the file and the counts, never an alert's words. */
export type ImportLine = {
  at: string;
  by: Staff;
  file_name: string;
  sha256: string;
  counts: ImportCounts;
};

export type ImportCounts = {
  alerts: number;
  new: number;
  changed: number;
  unchanged: number;
  refused: number;
};
