import Link from "next/link";

import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
import { readExportQuota, type ExportQuota } from "@/lib/api/privileged";
import { BarList } from "@/components/charts/bar-list";
import { TrendChart } from "@/components/charts/trend-chart";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Stat, StatGrid } from "@/components/ui/stat";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import {
  EXPORT_FORMATS,
  EXPORT_KINDS,
  EXPORT_LABELS,
  EXPORT_OUTCOMES,
  FORMAT_LABELS,
  canExport as canExportKind,
} from "@/lib/exports";
import { readCrmSettings, type DealSummary } from "@/lib/api/crm";
import { readDealsBoard } from "@/lib/api/deals";
import {
  readFunnel,
  readPipelineHistory,
  readWeeklyReport,
  type FunnelReport,
  type PipelineHistory,
  type WeeklyReport,
} from "@/lib/api/reports";
import { readMrrBridge, type MrrBridge } from "@/lib/api/revenue";
import {
  LOSS_REASON_LABELS,
  MOVEMENT_KIND_LABELS,
  sourceLabel,
  sourceNamesFrom,
} from "@/lib/crm/vocabulary";
import {
  formatAbsolute,
  formatDate,
  formatMoney,
  formatMoneyBy,
  formatMonth,
  formatMonthShort,
  formatMrr,
  formatMrrBy,
  formatMultiple,
  formatNumber,
  formatPercent,
  formatWait,
} from "@/lib/format";
import { closedMetrics, pipelineCover } from "@/lib/reports/metrics";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Weekly report" };
export const dynamic = "force-dynamic";

type ReportsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function isReadFailure(error: unknown): boolean {
  return error instanceof HqApiUnavailableError || error instanceof HqApiRequestError;
}

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
  const now = requestNow();

  let report: WeeklyReport | null = null;
  let refused = false;
  try {
    report = await readWeeklyReport(context.token, /^\d{4}-W\d{2}$/.test(week) ? week : "");
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 400) refused = true;
    else if (!isReadFailure(error)) throw error;
  }

  // The quarter's closed deals and the year's MRR are read beside the week; each one
  // that fails leaves its own card saying so, never a zero.
  let sourceNames = new Map<string, string>();
  let wonDeals: DealSummary[] | null = null;
  let lostDeals: DealSummary[] | null = null;
  let bridge: MrrBridge | null = null;
  let funnel: FunnelReport | null = null;
  let history: PipelineHistory | null = null;
  const [settingsRead, wonRead, lostRead, bridgeRead, funnelRead, historyRead] =
    await Promise.allSettled([
      readCrmSettings(context.token),
      readDealsBoard(context.token, "won"),
      readDealsBoard(context.token, "lost"),
      readMrrBridge(context.token, "USD", 12),
      readFunnel(context.token, 90),
      readPipelineHistory(context.token, 90),
    ]);
  for (const read of [settingsRead, wonRead, lostRead, bridgeRead, funnelRead, historyRead]) {
    if (read.status === "rejected" && !isReadFailure(read.reason)) throw read.reason;
  }
  if (funnelRead.status === "fulfilled") funnel = funnelRead.value;
  if (historyRead.status === "fulfilled") history = historyRead.value;
  if (settingsRead.status === "fulfilled") sourceNames = sourceNamesFrom(settingsRead.value);
  if (wonRead.status === "fulfilled")
    wonDeals = wonRead.value.columns.flatMap((column) => column.deals);
  if (lostRead.status === "fulfilled")
    lostDeals = lostRead.value.columns.flatMap((column) => column.deals);
  if (bridgeRead.status === "fulfilled") bridge = bridgeRead.value;

  const quarter = wonDeals && lostDeals ? closedMetrics(wonDeals, lostDeals, now, 90) : null;
  const cover =
    quarter && report ? pipelineCover(report.pipeline.open_mrr, quarter.monthlyWonMrr) : null;
  const canExport = hasCapability(context, "crm:export");
  let quota: ExportQuota | null = null;
  if (canExport) {
    try {
      quota = await readExportQuota(context.token);
    } catch (error) {
      if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
        throw error;
    }
  }
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  const openUsd = report?.pipeline.open_mrr?.USD ?? 0;

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
              value={formatMrrBy(report.deals.won.mrr)}
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

            <Card
              title="Support desk"
              titleAs="h2"
              description="Counted from the conversations, not a survey."
            >
              {report.desk === null ? (
                <p className="table-sub">
                  The desk is not on the database yet, so its week cannot be counted.
                </p>
              ) : (
                <ul className="report-facts">
                  <li>
                    <span>Opened</span>
                    <strong>{report.desk.opened}</strong>
                  </li>
                  <li>
                    <span>Median first reply</span>
                    <strong>
                      {report.desk.median_first_reply_minutes === null
                        ? "—"
                        : formatWait(report.desk.median_first_reply_minutes)}
                    </strong>
                  </li>
                  <li>
                    <span>Replies sent</span>
                    <strong>{report.desk.replies_sent}</strong>
                  </li>
                  <li>
                    <span>Resolved</span>
                    <strong>{report.desk.resolved}</strong>
                  </li>
                  <li>
                    <span>Resolved on the first reply</span>
                    <strong>{report.desk.resolved_on_first_reply}</strong>
                  </li>
                  <li>
                    <span>Resolved after a reopen</span>
                    <strong
                      className={report.desk.resolved_after_reopen > 0 ? "num--down" : undefined}
                    >
                      {report.desk.resolved_after_reopen}
                    </strong>
                  </li>
                  <li>
                    <span>Open now</span>
                    <strong>{report.desk.open_now}</strong>
                  </li>
                </ul>
              )}
            </Card>
          </div>

          <section className="record-section report-section" aria-labelledby="report-quarter">
            <h2 className="record-section__title" id="report-quarter">
              Last 90 days · how the pipeline converts
            </h2>
            {quarter === null ? (
              <Callout tone="attention" compact>
                Closed deals could not be read just now, so the quarter&apos;s figures are missing —
                a read failure, not a quiet quarter.
              </Callout>
            ) : (
              <StatGrid columns={6} label="Closed deals, last ninety days">
                <Stat
                  label="Won"
                  value={quarter.won}
                  hint={quarter.wonMrr ? formatMrrBy(quarter.wonMrr) : "Money withheld"}
                />
                <Stat
                  label="Lost"
                  value={quarter.lost}
                  hint={
                    quarter.reasons[0]
                      ? (LOSS_REASON_LABELS[quarter.reasons[0].reason] ?? quarter.reasons[0].reason)
                      : "Nothing lost"
                  }
                />
                <Stat
                  label="Win rate"
                  value={quarter.winRate === null ? "—" : formatPercent(quarter.winRate)}
                  text
                  hint={`${quarter.won + quarter.lost} closed`}
                />
                <Stat
                  label="Median sales cycle"
                  value={
                    quarter.medianCycleDays === null
                      ? "—"
                      : `${formatNumber(Math.round(quarter.medianCycleDays))} days`
                  }
                  text
                  hint={`Opened to won, ${quarter.cycleSample} ${quarter.cycleSample === 1 ? "deal" : "deals"}`}
                />
                <Stat
                  label="Average won deal"
                  value={formatMrrBy(quarter.averageWon)}
                  text
                  hint="Monthly value at close"
                />
                <Stat
                  label="Pipeline cover"
                  value={formatMultiple(cover)}
                  text
                  hint={
                    quarter.monthlyWonMrr
                      ? `vs ${formatMrrBy(quarter.monthlyWonMrr)} won a month`
                      : "Needs a won deal"
                  }
                />
              </StatGrid>
            )}
          </section>

          <div className="chart-grid">
            <Card
              title="Pipeline by stage"
              titleAs="h2"
              description={`${report.pipeline.open_count} open · ${formatMrrBy(report.pipeline.open_mrr)} · ${formatMrrBy(report.pipeline.weighted)} weighted.`}
            >
              <BarList
                label="Open pipeline by stage, in US dollars"
                format={(value) => formatMrr(value, "USD")}
                rows={report.pipeline.stages.map((stage) => ({
                  key: stage.key,
                  label: stage.label,
                  value: stage.mrr.USD ?? 0,
                  share: openUsd > 0 ? (stage.mrr.USD ?? 0) / openUsd : undefined,
                  sub: `${stage.count} ${stage.count === 1 ? "deal" : "deals"} · ${formatMoneyBy(stage.weighted)} weighted`,
                }))}
              />
            </Card>
            <Card
              title="MRR, last twelve months"
              titleAs="h2"
              description="Where the ledger stood at each month's end, in US dollars."
            >
              {bridge === null ? (
                <Callout tone="attention" compact>
                  Revenue could not be read just now — a read failure, not zero revenue.
                </Callout>
              ) : (
                <TrendChart
                  ariaLabel={`Monthly recurring revenue at each month's end over ${bridge.months.length} months, ending at ${formatMoney(bridge.current.mrr)}.`}
                  format={(value) => formatMoney(value, "USD")}
                  points={bridge.months.map((month) => ({
                    label: formatMonthShort(month.month),
                    title: month.partial
                      ? `${formatMonth(month.month)} so far`
                      : formatMonth(month.month),
                    value: month.end,
                  }))}
                />
              )}
            </Card>
          </div>

          <div className="chart-grid chart-grid--single">
            <Card
              title="Pipeline over time"
              titleAs="h2"
              description="Open monthly value at each day's end over ninety days, from the nightly snapshot, in US dollars."
            >
              {history === null ? (
                <Callout tone="attention" compact>
                  The pipeline history could not be read just now — a read failure, not an empty
                  pipeline.
                </Callout>
              ) : history.points.length === 0 ? (
                <p className="table-sub">No snapshot yet; the first is taken tonight.</p>
              ) : (
                <TrendChart
                  ariaLabel={`Open pipeline value over ${history.points.length} days, ending at ${formatMoney(history.points[history.points.length - 1]!.open_mrr_cents / 100)}.`}
                  format={(value) => formatMoney(value, "USD")}
                  tone="info"
                  points={history.points.map((point, index) => ({
                    // A label on the first of each month and on the last day; the rest
                    // stay blank so ninety days do not fight for the axis.
                    label:
                      point.day.endsWith("-01") || index === history.points.length - 1
                        ? formatMonthShort(point.day.slice(0, 7))
                        : "",
                    title: `${formatDate(point.day)} · ${point.open_count} open · ${formatMoney(point.weighted_cents / 100, "USD")} weighted`,
                    value: point.open_mrr_cents / 100,
                  }))}
                />
              )}
            </Card>
          </div>

          <section className="record-section report-section" aria-labelledby="report-funnel">
            <h2 className="record-section__title" id="report-funnel">
              How the stages convert · last ninety days
            </h2>
            <p className="page-note">
              Every deal that entered a stage in the last ninety days, and where it went. Conversion
              is of those that have left; time in stage is the median for those that left.
            </p>
            {funnel === null ? (
              <Callout tone="attention" compact>
                The funnel could not be read just now — a read failure, not an empty funnel.
              </Callout>
            ) : (
              <>
                <DataTable
                  caption="Stage conversion, last ninety days"
                  columns={[
                    { key: "stage", label: "Stage" },
                    { key: "entered", label: "Entered", align: "end" },
                    { key: "forward", label: "Moved on", align: "end" },
                    { key: "lost", label: "Lost", align: "end" },
                    { key: "here", label: "Still here", align: "end" },
                    { key: "conversion", label: "Conversion", align: "end" },
                    { key: "days", label: "Median days", align: "end" },
                  ]}
                >
                  {funnel.stages.map((stage) => (
                    <tr key={stage.key}>
                      <td>{stage.label}</td>
                      <td className="num">{stage.entered}</td>
                      <td className="num">{stage.advanced + stage.won_from_here}</td>
                      <td className="num">{stage.lost_from_here}</td>
                      <td className="num">{stage.still_here}</td>
                      <td className="num">
                        {stage.conversion === null ? "—" : formatPercent(stage.conversion)}
                      </td>
                      <td className="num">
                        {stage.median_days === null ? "—" : formatNumber(stage.median_days)}
                      </td>
                    </tr>
                  ))}
                </DataTable>
                <p className="table-sub">
                  {funnel.deals_moved} {funnel.deals_moved === 1 ? "deal" : "deals"} moved since{" "}
                  {formatDate(funnel.since)} · {funnel.closed.won} won · {funnel.closed.lost} lost
                  {funnel.closed.win_rate !== null &&
                    ` · ${formatPercent(funnel.closed.win_rate)} win rate`}
                  .
                </p>
              </>
            )}
          </section>

          <section className="record-section report-section" aria-labelledby="report-pipeline">
            <h2 className="record-section__title" id="report-pipeline">
              Pipeline now · {report.pipeline.open_count} open ·{" "}
              {formatMrrBy(report.pipeline.open_mrr)} · {formatMrrBy(report.pipeline.weighted)}{" "}
              weighted
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
                  <td className="data-table__num">{formatMrrBy(stage.mrr)}</td>
                  <td className="data-table__num">{formatMoneyBy(stage.weighted)}</td>
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
                    <strong>{formatMrrBy(report.forecast.commit_mrr)}</strong>
                  </li>
                  <li>
                    <span>Best case</span>
                    <strong>{formatMrrBy(report.forecast.best_case_mrr)}</strong>
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
                  description="A CSV, a spreadsheet or a PDF on the letterhead, for work outside HQ. It needs a reason, and the export is kept in the audit log."
                >
                  {quota && (
                    <p className="field__hint">
                      {quota.left.toLocaleString("en-GB")} of {quota.limit.toLocaleString("en-GB")}{" "}
                      records left in any {quota.window_hours} hours.
                      {quota.marked &&
                        " Every file with addresses carries one marker row that names it if it is ever seen outside HQ."}
                    </p>
                  )}
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
                    action="/exports"
                  >
                    <input type="hidden" name="back" value="/reports" />
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
                        {EXPORT_KINDS.filter((kind) =>
                          canExportKind(context.me.capabilities, kind),
                        ).map((kind) => (
                          <option key={kind} value={kind}>
                            {EXPORT_LABELS[kind]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <div className="field__label">
                        <label htmlFor="export-format">Format</label>
                      </div>
                      <select
                        id="export-format"
                        className="select"
                        name="format"
                        defaultValue="pdf"
                        disabled={!context.me.sudo_fresh}
                      >
                        {EXPORT_FORMATS.map((format) => (
                          <option key={format} value={format}>
                            {FORMAT_LABELS[format].label} —{" "}
                            {FORMAT_LABELS[format].hint.toLowerCase()}
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
                      Download
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
