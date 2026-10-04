import Link from "next/link";

import { TrendChart } from "@/components/charts/trend-chart";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Stat, StatGrid } from "@/components/ui/stat";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readDeskReport, type DeskReport } from "@/lib/api/tickets";
import { formatNumber, formatSentence } from "@/lib/format";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "The desk over time" };
export const dynamic = "force-dynamic";

const BASE = "/reports/desk";
const WINDOWS = [14, 30, 90] as const;

type DeskReportPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function minutesWords(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "—";
  if (minutes < 120) return `${formatNumber(minutes)} min`;
  return `${formatNumber(Math.round((minutes / 60) * 10) / 10)} h`;
}

function hoursWords(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return "—";
  if (hours < 48) return `${formatNumber(hours)} h`;
  return `${formatNumber(Math.round((hours / 24) * 10) / 10)} days`;
}

function dayLabel(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  return `${date.getUTCDate()} ${date.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`;
}

const COLUMNS = [
  { key: "day", label: "Day" },
  { key: "open", label: "Open at the day's end", align: "end" as const },
  { key: "opened", label: "Came in", align: "end" as const },
  { key: "resolved", label: "Resolved", align: "end" as const },
];

const AGE_LABELS: Record<string, string> = {
  under_a_day: "Under a day",
  one_to_three_days: "One to three days",
  three_to_seven_days: "Three to seven days",
  over_a_week: "Over a week",
};

export default async function DeskReportPage({ searchParams }: DeskReportPageProps) {
  const context = await requireStaff(BASE);
  if (!hasCapability(context, "tickets:read")) {
    return (
      <>
        <PageHeader eyebrow="Desk" title="The desk over time" />
        <Callout tone="neutral">
          The desk&rsquo;s figures are read by the roles that read the desk.
        </Callout>
      </>
    );
  }
  const parameters = await searchParams;
  const asked = Number(firstSearchValue(parameters.days) ?? "30");
  const days = (WINDOWS as readonly number[]).includes(asked) ? asked : 30;
  let report: DeskReport | null = null;
  try {
    report = await readDeskReport(context.token, days);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const series = report?.series ?? [];
  const latest = series[series.length - 1];

  return (
    <>
      <PageHeader
        eyebrow="Desk"
        title="The desk over time"
        description="How many conversations were open at each day's end, what came in and what was resolved, and how long first replies and resolutions took. A conversation reopened and resolved again counts from its latest resolution."
        actions={
          <nav className="week-nav" aria-label="Window">
            {WINDOWS.map((window) =>
              window === days ? (
                <span key={window} className="week-nav__current" aria-current="page">
                  {window} days
                </span>
              ) : (
                <Link key={window} className="btn btn--small" href={`${BASE}?days=${window}`}>
                  {window} days
                </Link>
              ),
            )}
          </nav>
        }
      />
      <div className="page-content">
        {report === null || !report.available ? (
          <Callout tone="danger" role="alert">
            {report?.reason || "The desk's figures could not be read just now."} This is a read
            failure, not a quiet desk.
          </Callout>
        ) : (
          <>
            <StatGrid label="The window at a glance">
              <Stat
                label="Open now"
                value={formatNumber(latest?.open ?? 0)}
                hint={`${formatNumber(report.open_ages?.over_a_week ?? 0)} over a week old`}
              />
              <Stat
                label="First reply, median"
                value={minutesWords(report.first_reply?.median_minutes)}
                hint={`Slowest tenth ${minutesWords(report.first_reply?.slowest_tenth_minutes)} · ${formatNumber(report.first_reply?.count ?? 0)} answered`}
              />
              <Stat
                label="Resolution, median"
                value={hoursWords(report.resolution?.median_hours)}
                hint={`Slowest tenth ${hoursWords(report.resolution?.slowest_tenth_hours)} · ${formatNumber(report.resolution?.count ?? 0)} resolved`}
              />
              <Stat
                label="Came in"
                value={formatNumber(series.reduce((sum, row) => sum + row.opened, 0))}
                hint={`Last ${days} days`}
              />
            </StatGrid>
            <section className="rsection" aria-labelledby="desk-backlog">
              <div className="rsection__head">
                <h2 className="rsection__title" id="desk-backlog">
                  The backlog
                </h2>
              </div>
              <TrendChart
                points={series.map((row) => ({
                  label: dayLabel(row.day),
                  value: row.open,
                  title: `${dayLabel(row.day)}: ${row.open} open, ${row.opened} came in, ${row.resolved} resolved`,
                }))}
                format={(value) => formatNumber(value)}
                ariaLabel="Conversations open at each day's end"
              />
            </section>
            <section className="rsection" aria-labelledby="desk-priority">
              <div className="rsection__head">
                <h2 className="rsection__title" id="desk-priority">
                  By priority
                </h2>
              </div>
              <DataTable
                caption="Open and resolved by priority"
                columns={[
                  { key: "priority", label: "Priority" },
                  { key: "open", label: "Open now", align: "end" as const },
                  { key: "resolved", label: "Resolved in the window", align: "end" as const },
                  { key: "median", label: "Resolution, median", align: "end" as const },
                ]}
                isEmpty={!(report.by_priority ?? []).length}
                empty={<p className="page-note">Nothing in the window.</p>}
              >
                {(report.by_priority ?? []).map((row) => (
                  <tr key={row.priority}>
                    <td>{formatSentence(row.priority)}</td>
                    <td className="data-table__num">{formatNumber(row.open)}</td>
                    <td className="data-table__num">{formatNumber(row.resolved)}</td>
                    <td className="data-table__num">{hoursWords(row.median_resolution_hours)}</td>
                  </tr>
                ))}
              </DataTable>
              <dl className="handover-list desk-ages">
                {Object.entries(report.open_ages ?? {}).map(([key, value]) => (
                  <div key={key}>
                    <dt>Open {AGE_LABELS[key]?.toLowerCase() ?? key}</dt>
                    <dd className="num">{formatNumber(value)}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section className="rsection" aria-labelledby="desk-days">
              <div className="rsection__head">
                <h2 className="rsection__title" id="desk-days">
                  Day by day
                </h2>
              </div>
              <DataTable
                caption="The desk day by day"
                columns={COLUMNS}
                isEmpty={series.length === 0}
                empty={<p className="page-note">No days in the window.</p>}
              >
                {[...series].reverse().map((row) => (
                  <tr key={row.day}>
                    <td>{dayLabel(row.day)}</td>
                    <td className="data-table__num">{formatNumber(row.open)}</td>
                    <td className="data-table__num">{formatNumber(row.opened)}</td>
                    <td className="data-table__num">{formatNumber(row.resolved)}</td>
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
