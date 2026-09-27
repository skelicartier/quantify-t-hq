import Link from "next/link";

import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Stat, StatGrid } from "@/components/ui/stat";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCrmSettings } from "@/lib/api/crm";
import { EXPORT_KINDS, readWeeklyReport, type WeeklyReport } from "@/lib/api/reports";
import {
  LOSS_REASON_LABELS,
  MOVEMENT_KIND_LABELS,
  sourceLabel,
  sourceNamesFrom,
} from "@/lib/crm/vocabulary";
import { formatAbsolute, formatDate, formatMoney, formatMrr, formatWait } from "@/lib/format";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Weekly report" };
export const dynamic = "force-dynamic";

const EXPORT_LABELS: Record<string, string> = {
  companies: "Companies",
  people: "People",
  leads: "Leads",
  deals: "Deals",
  contracts: "Contracts",
};

const EXPORT_OUTCOMES: Record<string, string> = {
  sudo: "Confirm it's you first, then export again.",
  reason: "Say what the export is for, in a sentence.",
  forbidden: "Your role cannot export.",
  failed: "The export could not be made. Nothing left HQ.",
};

type ReportsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const context = await requireStaff("/reports");
  if (!hasCapability(context, "revenue:read")) {
    return (
      <>
        <PageHeader eyebrow="Business" title="Weekly report" />
        <Callout tone="neutral">The weekly report is visible to Sales, Admins and Owners.</Callout>
      </>
    );
  }
  const parameters = await searchParams;
  const week = firstSearchValue(parameters.week) ?? "";
  const exportOutcome = EXPORT_OUTCOMES[firstSearchValue(parameters.export) ?? ""];

  let report: WeeklyReport | null = null;
  let refused = false;
  try {
    report = await readWeeklyReport(context.token, /^\d{4}-W\d{2}$/.test(week) ? week : "");
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 400) refused = true;
    else if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  let sourceNames = new Map<string, string>();
  try {
    sourceNames = sourceNamesFrom(await readCrmSettings(context.token));
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const canExport = hasCapability(context, "crm:export");
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;

  return (
    <>
      <PageHeader
        eyebrow="Business"
        title="Weekly report"
        description={
          report
            ? `${formatDate(report.week.starts_on)} to ${formatDate(report.week.ends_on)}${report.week.in_progress ? ", so far" : ""}. Every figure is counted from the records.`
            : "Every figure is counted from the records."
        }
        actions={
          report && (
            <nav className="week-nav" aria-label="Weeks">
              <Link className="btn btn--small" href={`/reports?week=${report.week.previous}`}>
                ← {report.week.previous}
              </Link>
              <span className="week-nav__current">{report.week.label}</span>
              {report.week.next ? (
                <Link className="btn btn--small" href={`/reports?week=${report.week.next}`}>
                  {report.week.next} →
                </Link>
              ) : (
                <span className="week-nav__current week-nav__current--quiet">This week</span>
              )}
            </nav>
          )
        }
      />
      {exportOutcome && (
        <Callout tone="danger" role="alert" compact>
          {exportOutcome}
        </Callout>
      )}
      {report === null ? (
        <Callout tone={refused ? "neutral" : "danger"} role="alert">
          {refused ? (
            <>
              No report for that week. <Link href="/reports">Open this week</Link>.
            </>
          ) : (
            "The report could not be built just now. This is a read failure, not a quiet week."
          )}
        </Callout>
      ) : (
        <>
          <StatGrid columns={4} label="The week in four numbers">
            <Stat
              label="Leads received"
              value={report.leads.received}
              hint={`${report.leads.qualified} qualified`}
            />
            <Stat
              label="Median first reply"
              value={
                report.leads.median_first_reply_minutes === null
                  ? "—"
                  : formatWait(report.leads.median_first_reply_minutes)
              }
              text
              tone={
                report.leads.median_first_reply_minutes !== null &&
                report.leads.median_first_reply_minutes > report.leads.first_reply_target_minutes
                  ? "danger"
                  : "default"
              }
              hint={`${report.leads.answered_within_target} of ${report.leads.answered} within the hour`}
            />
            <Stat
              label="Demos held"
              value={report.meetings.demos_held}
              hint={`${report.meetings.demo_no_shows} no-shows`}
            />
            <Stat
              label="Won"
              value={formatMrr(report.deals.won.mrr)}
              text
              hint={`${report.deals.won.count} ${report.deals.won.count === 1 ? "deal" : "deals"} · ${report.deals.lost.count} lost`}
            />
          </StatGrid>

          <div className="report-grid">
            <Card title="Where leads came from" titleAs="h2">
              {report.leads.by_source.length === 0 ? (
                <p className="side-quiet">No leads this week.</p>
              ) : (
                <ul className="report-bars">
                  {report.leads.by_source.map((row) => (
                    <li key={row.source_key}>
                      <span className="report-bars__label">
                        {sourceLabel(row.source_key, sourceNames)}
                      </span>
                      <span className="report-bars__track" aria-hidden="true">
                        <span
                          className="report-bars__fill"
                          style={{
                            width: `${(row.count / Math.max(report.leads.received, 1)) * 100}%`,
                          }}
                        />
                      </span>
                      <span className="report-bars__value">{row.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Deals" titleAs="h2">
              <ul className="report-facts">
                <li>
                  <span>Opened</span>
                  <strong>{report.deals.created}</strong>
                </li>
                <li>
                  <span>Stage moves</span>
                  <strong>{report.deals.stage_moves}</strong>
                </li>
                <li>
                  <span>Won</span>
                  <strong>{report.deals.won.count}</strong>
                </li>
                <li>
                  <span>Lost</span>
                  <strong>{report.deals.lost.count}</strong>
                </li>
              </ul>
              {report.deals.lost.reasons.length > 0 && (
                <p className="side-quiet report-note">
                  Lost to:{" "}
                  {report.deals.lost.reasons
                    .map((row) => `${LOSS_REASON_LABELS[row.reason] ?? row.reason} (${row.count})`)
                    .join(", ")}
                </p>
              )}
            </Card>

            <Card title="Meetings" titleAs="h2">
              <ul className="report-facts">
                <li>
                  <span>Held</span>
                  <strong>{report.meetings.held}</strong>
                </li>
                <li>
                  <span>No-shows</span>
                  <strong>{report.meetings.no_shows}</strong>
                </li>
                <li>
                  <span>Outcome missing</span>
                  <strong
                    className={report.meetings.outcomes_missing > 0 ? "num--down" : undefined}
                  >
                    {report.meetings.outcomes_missing}
                  </strong>
                </li>
              </ul>
            </Card>

            <Card title="Revenue" titleAs="h2" description={`In ${report.revenue.currency}.`}>
              <ul className="report-facts">
                <li>
                  <span>MRR at start</span>
                  <strong>{formatMoney(report.revenue.mrr_at_start)}</strong>
                </li>
                <li>
                  <span>MRR at end</span>
                  <strong>{formatMoney(report.revenue.mrr_at_end)}</strong>
                </li>
                {Object.entries(report.revenue.movements).map(([kind, amount]) => (
                  <li key={kind}>
                    <span>{MOVEMENT_KIND_LABELS[kind] ?? kind}</span>
                    <strong className={amount < 0 ? "num--down" : "num--up"}>
                      {amount > 0 ? "+" : ""}
                      {formatMoney(amount)}
                    </strong>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <section className="record-section report-section" aria-labelledby="report-pipeline">
            <h2 className="record-section__title" id="report-pipeline">
              Pipeline now · {report.pipeline.open_count} open ·{" "}
              {formatMrr(report.pipeline.open_mrr)} · {formatMrr(report.pipeline.weighted)} weighted
            </h2>
            <DataTable
              caption="Pipeline by stage"
              scroll={false}
              columns={[
                { key: "stage", label: "Stage" },
                { key: "count", label: "Deals", align: "end" },
                { key: "mrr", label: "Monthly value", align: "end" },
                { key: "weighted", label: "Weighted", align: "end" },
              ]}
            >
              {report.pipeline.stages.map((stage) => (
                <tr key={stage.key}>
                  <td>{stage.label}</td>
                  <td className="data-table__num">{stage.count}</td>
                  <td className="data-table__num">{formatMrr(stage.mrr)}</td>
                  <td className="data-table__num">{formatMoney(stage.weighted)}</td>
                </tr>
              ))}
            </DataTable>
          </section>

          <div className="record-layout">
            <div className="record-layout__main">
              <Card
                title="Forecast, next 30 days"
                titleAs="h2"
                description="Deals expected to close within 30 days. Commit counts stages at 60% or better."
              >
                <ul className="report-facts">
                  <li>
                    <span>Commit</span>
                    <strong>{formatMrr(report.forecast.commit_mrr)}</strong>
                  </li>
                  <li>
                    <span>Best case</span>
                    <strong>{formatMrr(report.forecast.best_case_mrr)}</strong>
                  </li>
                </ul>
                {report.forecast.slipped_count > 0 && (
                  <>
                    <h3 className="report-subhead">
                      Close date slipped ({report.forecast.slipped_count})
                    </h3>
                    <ul className="side-list">
                      {report.forecast.slipped.map((deal) => (
                        <li key={deal.deal_id} className="renewal">
                          <Link href={`/deals/${deal.deal_id}`}>
                            {deal.company_name || deal.name}
                          </Link>
                          <span className="due due--overdue">{deal.days_late}d late</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Card>
              {report.losses_last_90_days.length > 0 && (
                <Card title="Why we lost, last 90 days" titleAs="h2">
                  <ul className="report-bars">
                    {report.losses_last_90_days.map((row) => (
                      <li key={row.reason}>
                        <span className="report-bars__label">
                          {LOSS_REASON_LABELS[row.reason] ?? row.reason}
                        </span>
                        <span className="report-bars__track" aria-hidden="true">
                          <span
                            className="report-bars__fill report-bars__fill--loss"
                            style={{
                              width: `${(row.count / Math.max(...report.losses_last_90_days.map((item) => item.count))) * 100}%`,
                            }}
                          />
                        </span>
                        <span className="report-bars__value">{row.count}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
            {canExport && (
              <aside className="record-layout__side">
                <Card
                  title="Export records"
                  titleAs="h3"
                  description="A CSV for work outside HQ. It needs a reason, and the export is kept in the audit log."
                >
                  <SudoGate
                    action={confirmSudoAction}
                    fresh={context.me.sudo_fresh}
                    untilLabel={untilLabel}
                    returnPath="/reports"
                    purpose="Exports need a fresh code from your authenticator app."
                  />
                  <form
                    className="stack-form stack-form--tight export-form"
                    method="post"
                    action="/reports/export"
                  >
                    <div className="field">
                      <div className="field__label">
                        <label htmlFor="export-kind">Records</label>
                      </div>
                      <select
                        id="export-kind"
                        className="select"
                        name="kind"
                        defaultValue="leads"
                        disabled={!context.me.sudo_fresh}
                      >
                        {EXPORT_KINDS.filter(
                          (kind) => kind !== "contracts" || hasCapability(context, "revenue:read"),
                        ).map((kind) => (
                          <option key={kind} value={kind}>
                            {EXPORT_LABELS[kind]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <div className="field__label">
                        <label htmlFor="export-reason">What it is for</label>
                      </div>
                      <input
                        id="export-reason"
                        className="input"
                        name="reason"
                        minLength={8}
                        maxLength={400}
                        required
                        placeholder="e.g. Quarterly board pack"
                        disabled={!context.me.sudo_fresh}
                      />
                    </div>
                    <button
                      className="btn btn--primary"
                      type="submit"
                      disabled={!context.me.sudo_fresh}
                    >
                      Download CSV
                    </button>
                  </form>
                </Card>
              </aside>
            )}
          </div>
        </>
      )}
    </>
  );
}
