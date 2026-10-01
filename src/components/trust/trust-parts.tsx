import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { SegmentedLinks } from "@/components/ui/toolbar";
import type { StaffContext } from "@/lib/access/core";
import { hasCapability } from "@/lib/access/core";

const TABS = [
  { href: "/trust", label: "Due", capability: "audit:read" },
  { href: "/trust/risks", label: "Risks", capability: "audit:read" },
  { href: "/trust/findings", label: "Findings", capability: "audit:read" },
  { href: "/trust/changes", label: "Changes", capability: "audit:read" },
  { href: "/trust/continuity", label: "Continuity", capability: "audit:read" },
  { href: "/trust/suppliers", label: "Suppliers", capability: "audit:read" },
  { href: "/trust/answers", label: "Answers", capability: "crm:read" },
  { href: "/trust/processing", label: "Processing", capability: "privacy:read" },
  { href: "/trust/controls", label: "Controls", capability: "audit:read" },
  { href: "/trust/centre", label: "Trust centre", capability: "audit:read" },
] as const;

export type TrustTab = (typeof TABS)[number]["href"];

/** The registers this person may open; the rest are not offered. */
export function TrustTabs({ context, current }: { context: StaffContext; current: TrustTab }) {
  const items = TABS.filter((tab) => hasCapability(context, tab.capability)).map((tab) => ({
    href: tab.href,
    label: tab.label,
    current: tab.href === current,
  }));
  return <SegmentedLinks label="Trust registers" items={items} />;
}

const BAND_TONE: Record<string, PillTone> = {
  critical: "danger",
  high: "attention",
  medium: "neutral",
  low: "live",
};

/** A risk's band or a finding's severity, in words. */
export function BandPill({ band }: { band: string }) {
  return (
    <StatusPill
      value={band}
      label={`${band.charAt(0).toUpperCase()}${band.slice(1)}`}
      tone={BAND_TONE[band] ?? "neutral"}
    />
  );
}

const STATUS: Record<string, { label: string; tone: PillTone }> = {
  open: { label: "Open", tone: "attention" },
  treating: { label: "Being treated", tone: "neutral" },
  accepted: { label: "Accepted", tone: "neutral" },
  closed: { label: "Closed", tone: "live" },
  in_progress: { label: "In progress", tone: "neutral" },
  fixed: { label: "Fixed", tone: "live" },
  approved: { label: "Approved", tone: "live" },
  draft: { label: "Draft", tone: "neutral" },
  expired: { label: "Re-approve", tone: "danger" },
  archived: { label: "Archived", tone: "neutral" },
  awaiting: { label: "Waiting for approval", tone: "attention" },
  retrospective: { label: "Went ahead unapproved", tone: "danger" },
  not_needed: { label: "No approval needed", tone: "neutral" },
  due: { label: "Due", tone: "danger" },
  overdue: { label: "Overdue", tone: "danger" },
  ok: { label: "In date", tone: "live" },
  not_started: { label: "Not started", tone: "neutral" },
  planned: { label: "Planned", tone: "attention" },
  done: { label: "Done", tone: "live" },
  rolled_back: { label: "Rolled back", tone: "danger" },
  failed: { label: "Failed", tone: "danger" },
  passed: { label: "Passed", tone: "live" },
  partial: { label: "Partly worked", tone: "attention" },
  satisfactory: { label: "Satisfactory", tone: "live" },
  concerns: { label: "Concerns", tone: "attention" },
  unacceptable: { label: "Unacceptable", tone: "danger" },
};

/** Any register's state, in the words the register uses. */
export function TrustPill({ state }: { state: string }) {
  const entry = STATUS[state] ?? { label: state, tone: "neutral" as PillTone };
  return <StatusPill value={state} label={entry.label} tone={entry.tone} />;
}

function band(score: number): string {
  if (score >= 15) return "critical";
  if (score >= 8) return "high";
  if (score >= 4) return "medium";
  return "low";
}

/**
 * The live register on the 5 × 5 grid: likelihood up the side, impact along the bottom,
 * each cell shaded by the band its score falls in and carrying the count of risks there.
 */
export function RiskHeatMap({ heat }: { heat: readonly (readonly number[])[] }) {
  const levels = [5, 4, 3, 2, 1];
  return (
    <table className="heatmap">
      <caption className="heatmap__caption">
        Live risks by likelihood (rows) and impact (columns)
      </caption>
      <thead>
        <tr>
          <th scope="col" className="heatmap__corner">
            <span className="sr-only">Likelihood</span>
          </th>
          {[1, 2, 3, 4, 5].map((impact) => (
            <th key={impact} scope="col" className="heatmap__axis">
              <span className="heatmap__word">Impact </span>
              {impact}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {levels.map((likelihood) => (
          <tr key={likelihood}>
            <th scope="row" className="heatmap__axis">
              <span className="heatmap__word">Likelihood </span>
              {likelihood}
            </th>
            {[1, 2, 3, 4, 5].map((impact) => {
              const count = heat[likelihood - 1]?.[impact - 1] ?? 0;
              const cellBand = band(likelihood * impact);
              return (
                <td
                  key={impact}
                  className={`heatmap__cell heatmap__cell--${cellBand}${count ? " heatmap__cell--filled" : ""}`}
                  aria-label={`Likelihood ${likelihood}, impact ${impact} (${cellBand}): ${count} risk${count === 1 ? "" : "s"}`}
                >
                  {count > 0 ? count : ""}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const TRUST_EVENT_LABELS: Readonly<Record<string, string>> = {
  created: "Recorded",
  update: "Updated",
  review: "Reviewed",
  reviewed: "Reviewed",
  treat: "Treatment",
  accept: "Accepted",
  close: "Closed",
  reopen: "Reopened",
  start: "Started",
  fix: "Fixed",
  approve: "Approved",
  outcome: "Outcome",
  archive: "Archived",
  restore: "Restored",
  tier: "Tier",
  note: "Note",
};

/** Where a due item's record lives. */
export function trustHref(register: string, recordId: string): string {
  switch (register) {
    case "risk":
      return `/trust/risks/${recordId}`;
    case "finding":
      return `/trust/findings/${recordId}`;
    case "change":
      return `/trust/changes/${recordId}`;
    case "supplier":
      return `/trust/suppliers/${recordId}`;
    case "answer":
      return `/trust/answers/${recordId}`;
    case "processing":
      return `/trust/processing/${recordId}`;
    default:
      return "/trust/continuity";
  }
}

export const REGISTER_LABELS: Readonly<Record<string, string>> = {
  risk: "Risk",
  finding: "Finding",
  change: "Change",
  supplier: "Supplier",
  continuity: "Continuity",
  answer: "Answer",
  processing: "Processing",
};
