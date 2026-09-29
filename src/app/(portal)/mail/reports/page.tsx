import Link from "next/link";

import { BarList } from "@/components/charts/bar-list";
import { ColumnChart } from "@/components/charts/column-chart";
import { MailTabs } from "@/components/mail/mail-tabs";
import { CampaignStatePill, Rate, formatPct } from "@/components/mail/pills";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Stat, StatGrid } from "@/components/ui/stat";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import {
  EXIT_REASON_LABELS,
  SUPPRESSION_REASON_LABELS,
  readMailReport,
  type MailReport,
} from "@/lib/api/mail";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Mail reports" };
export const dynamic = "force-dynamic";

const CAMPAIGN_COLUMNS = [
  { key: "campaign", label: "Campaign" },
  { key: "state", label: "State" },
  { key: "sent", label: "Sent", align: "end" as const },
  { key: "delivered", label: "Delivered", align: "end" as const },
  { key: "bounced", label: "Hard bounces", align: "end" as const },
  { key: "complaints", label: "Complaints", align: "end" as const },
  { key: "unsubscribed", label: "Unsubscribed", align: "end" as const },
  { key: "clicked", label: "Clicked", align: "end" as const },
];

const SEQUENCE_COLUMNS = [
  { key: "sequence", label: "Sequence" },
  { key: "enrolled", label: "Enrolled", align: "end" as const },
  { key: "active", label: "In it now", align: "end" as const },
  { key: "replied", label: "Replied", align: "end" as const },
  { key: "meetings", label: "Meetings", align: "end" as const },
  { key: "exits", label: "How they ended" },
];

function pct(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(value > 0 && value < 1 ? 2 : 1)}%`;
}

type ReportsProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function MailReportsPage({ searchParams }: ReportsProps) {
  const context = await requireStaff("/mail/reports");
  const raw = Number(firstSearchValue((await searchParams).days) ?? 30);
  const days = [7, 30, 90].includes(raw) ? raw : 30;
  let report: MailReport | null = null;
  try {
    report = await readMailReport(context.token, days);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  return (
    <>
      <PageHeader
        eyebrow="Mail"
        title="Reports"
        description="What went out and what came back. Every percentage sits beside its count; opens are left out because privacy proxies open everything."
        actions={<MailTabs current="/mail/reports" />}
      />
      <div className="page-content">
        <SegmentedLinks
          label="Period"
          items={[7, 30, 90].map((value) => ({
            href: `/mail/reports?days=${value}`,
            label: `${value} days`,
            current: value === days,
          }))}
        />
        {report === null ? (
          <Callout tone="danger" role="alert">
            The mail report could not be read just now.
          </Callout>
        ) : (
          <>
            <StatGrid columns={6} label="Deliverability">
              <Stat
                label="Sent"
                value={report.totals.sent}
                hint={`${report.totals.skipped} skipped`}
              />
              <Stat
                label="Delivered"
                value={report.totals.delivered}
                hint={
                  report.totals.sent
                    ? `${formatPct((report.totals.delivered * 100) / report.totals.sent)} of sent`
                    : "—"
                }
              />
              <Stat
                label="Hard bounces"
                value={pct(report.totals.hard_bounce_pct)}
                hint={`${report.totals.hard_bounced}; stop at ${report.totals.thresholds.hard_bounce_pct}%`}
                tone={
                  (report.totals.hard_bounce_pct ?? 0) >= report.totals.thresholds.hard_bounce_pct
                    ? "danger"
                    : "default"
                }
              />
              <Stat
                label="Complaints"
                value={pct(report.totals.complaint_pct)}
                hint={`${report.totals.complained}; watch at ${report.totals.thresholds.complaint_pct_watch}%`}
                tone={
                  (report.totals.complaint_pct ?? 0) >= report.totals.thresholds.complaint_pct_watch
                    ? "danger"
                    : "default"
                }
              />
              <Stat
                label="Unsubscribed"
                value={pct(report.totals.unsubscribe_pct)}
                hint={`${report.totals.unsubscribed} people`}
              />
              <Stat
                label="Clicked"
                value={pct(report.totals.click_pct)}
                hint={`${report.totals.clicked} people`}
              />
            </StatGrid>
            <div className="chart-grid">
              <Card title="Sent per day, last two weeks" titleAs="h2" titleId="mail-per-day">
                <ColumnChart
                  columns={report.per_day.map((row) => ({
                    label: row.day.slice(5),
                    value: row.sent,
                    title: `${row.day}: ${row.sent} sent`,
                  }))}
                  format={(value) => String(value)}
                  ariaLabel="Messages sent per day"
                />
                <p className="chart-note">
                  Today: {report.caps_today.global.sent} of {report.caps_today.global.cap}; this
                  hour {report.caps_today.hour.sent} of {report.caps_today.hour.cap}.
                </p>
              </Card>
              <Card title="Why addresses are stopped" titleAs="h2" titleId="mail-stops">
                <BarList
                  label="Stopped addresses by reason"
                  rows={Object.entries(report.suppressions_by_reason)
                    .sort((a, b) => b[1] - a[1])
                    .map(([reason, count]) => ({
                      key: reason,
                      label: SUPPRESSION_REASON_LABELS[reason] ?? reason,
                      value: count,
                      tone: reason === "complaint" ? ("loss" as const) : ("muted" as const),
                    }))}
                  format={(value) => String(value)}
                  empty="Nobody is stopped."
                />
                <p className="chart-note">
                  Consent on record: {report.consent.subscribed ?? 0} said yes,{" "}
                  {report.consent.unsubscribed ?? 0} unsubscribed, {report.consent.sales_stop ?? 0}{" "}
                  asked sales to stop.
                </p>
              </Card>
            </div>
            <section className="record-section" aria-labelledby="mail-report-campaigns">
              <h2 className="record-section__title" id="mail-report-campaigns">
                Campaigns
              </h2>
              <DataTable
                caption="Campaigns"
                columns={CAMPAIGN_COLUMNS}
                isEmpty={report.campaigns.length === 0}
                empty={<EmptyState compact title="No campaigns sent yet" />}
              >
                {report.campaigns.map((campaign) => (
                  <tr key={campaign.campaign_id}>
                    <td>
                      <Link
                        className="table-title"
                        href={`/mail/campaigns/${campaign.campaign_id}`}
                      >
                        {campaign.name}
                      </Link>
                      <span className="table-sub">{campaign.audience_description}</span>
                    </td>
                    <td>
                      <CampaignStatePill state={campaign.state} />
                    </td>
                    <td className="data-table__num">{campaign.counts.sent}</td>
                    <td className="data-table__num">
                      <Rate
                        part={campaign.counts.delivered}
                        whole={campaign.counts.sent}
                        pct={campaign.rates.delivered_pct}
                      />
                    </td>
                    <td className="data-table__num">
                      <Rate
                        part={campaign.counts.hard_bounced}
                        whole={campaign.counts.sent}
                        pct={campaign.rates.hard_bounce_pct}
                      />
                    </td>
                    <td className="data-table__num">
                      <Rate
                        part={campaign.counts.complained}
                        whole={campaign.counts.sent}
                        pct={campaign.rates.complaint_pct}
                      />
                    </td>
                    <td className="data-table__num">
                      <Rate
                        part={campaign.counts.unsubscribed}
                        whole={campaign.counts.delivered}
                        pct={campaign.rates.unsubscribe_pct}
                      />
                    </td>
                    <td className="data-table__num">
                      <Rate
                        part={campaign.counts.clicked}
                        whole={campaign.counts.delivered}
                        pct={campaign.rates.click_pct}
                      />
                    </td>
                  </tr>
                ))}
              </DataTable>
            </section>
            <section className="record-section" aria-labelledby="mail-report-sequences">
              <h2 className="record-section__title" id="mail-report-sequences">
                Sequences
              </h2>
              <DataTable
                caption="Sequences"
                columns={SEQUENCE_COLUMNS}
                isEmpty={report.sequences.length === 0}
                empty={<EmptyState compact title="No sequences yet" />}
              >
                {report.sequences.map((sequence) => (
                  <tr key={sequence.sequence_id}>
                    <td>
                      <Link
                        className="table-title"
                        href={`/mail/sequences/${sequence.sequence_id}`}
                      >
                        {sequence.name}
                      </Link>
                    </td>
                    <td className="data-table__num">{sequence.enrolled}</td>
                    <td className="data-table__num">{sequence.active}</td>
                    <td className="data-table__num">
                      {sequence.replied}
                      {sequence.enrolled > 0 && (
                        <span className="table-sub">
                          {((sequence.replied * 100) / sequence.enrolled).toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td className="data-table__num">{sequence.meetings}</td>
                    <td>
                      {Object.entries(sequence.exits)
                        .sort((a, b) => b[1] - a[1])
                        .map(
                          ([reason, count]) => `${EXIT_REASON_LABELS[reason] ?? reason} ${count}`,
                        )
                        .join(" · ") || <span className="table-sub">None yet</span>}
                    </td>
                  </tr>
                ))}
              </DataTable>
            </section>
          </>
        )}
      </div>
    </>
  );
}
