import Link from "next/link";

import { BarList } from "@/components/charts/bar-list";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Stat, StatGrid } from "@/components/ui/stat";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readAttribution, type AttributionReport } from "@/lib/api/reports";
import { channelLabel } from "@/lib/crm/attribution";
import { formatMrrBy, formatNumber, formatPercent, formatSentence } from "@/lib/format";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Lead sources" };
export const dynamic = "force-dynamic";

const BASE = "/reports/attribution";
const WINDOWS = [30, 90, 180, 365] as const;

type LeadSourcesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function share(part: number, whole: number): string {
  return whole > 0 ? formatPercent(part / whole) : "—";
}

function monthName(month: string): string {
  const [year, number] = month.split("-").map(Number);
  if (!year || !number) return month;
  return new Date(Date.UTC(year, number - 1, 1)).toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function LeadSourcesPage({ searchParams }: LeadSourcesPageProps) {
  const context = await requireStaff(BASE);
  if (!hasCapability(context, "revenue:read")) {
    return (
      <>
        <PageHeader eyebrow="Business" title="Lead sources" />
        <Callout tone="neutral">
          Where leads come from is read by the roles that read the weekly report.
        </Callout>
      </>
    );
  }
  const parameters = await searchParams;
  const asked = Number(firstSearchValue(parameters.days) ?? "90");
  const days = (WINDOWS as readonly number[]).includes(asked) ? asked : 90;
  let report: AttributionReport | null = null;
  try {
    report = await readAttribution(context.token, days);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }

  return (
    <>
      <PageHeader
        eyebrow="Business"
        title="Lead sources"
        description="Every lead who wrote in, read two ways: what they said when the form asked how they heard of us, and what their visit showed — its campaign tags or the page that sent it. Each channel is then followed on to a meeting, a deal and a win. Prospects the team found are not counted here."
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
        {report === null ? (
          <Callout tone="danger" role="alert">
            Where leads came from could not be read just now. This is a read failure, not a quiet
            stretch.
          </Callout>
        ) : report.leads === 0 ? (
          <Callout tone="neutral">
            No lead wrote in during the last {days} days, so there is nothing to trace yet.
          </Callout>
        ) : (
          <SourcesBody report={report} />
        )}
      </div>
    </>
  );
}

function SourcesBody({ report }: { report: AttributionReport }) {
  const names = report.channels;
  const qualified = report.chain.reduce((sum, row) => sum + row.qualified, 0);
  const won = report.chain.reduce((sum, row) => sum + row.won, 0);
  const wonMoney: Record<string, number> = {};
  for (const row of report.chain)
    for (const [currency, amount] of Object.entries(row.won_mrr))
      wonMoney[currency] = (wonMoney[currency] ?? 0) + amount;
  // Of those who answered, how many named what their visit showed.
  const agreed = report.matrix.reduce(
    (sum, row) => sum + (row.seen.find((cell) => cell.channel === row.said)?.count ?? 0),
    0,
  );

  return (
    <>
      <StatGrid label="The window at a glance">
        <Stat
          label="Leads who wrote in"
          value={formatNumber(report.leads)}
          hint={`Last ${report.days} days`}
        />
        <Stat
          label="Said how they heard"
          value={share(report.answered, report.leads)}
          hint={`${report.answered} of ${report.leads}`}
        />
        <Stat
          label="Qualified"
          value={formatNumber(qualified)}
          hint={`${share(qualified, report.leads)} of leads`}
        />
        <Stat
          label="Won"
          value={formatNumber(won)}
          hint={Object.keys(wonMoney).length ? `${formatMrrBy(wonMoney)}` : "Nothing won yet"}
        />
      </StatGrid>

      <section className="record-section report-section" aria-labelledby="sources-chain">
        <h2 className="record-section__title" id="sources-chain">
          Each channel, from lead to won
        </h2>
        <p className="page-note">
          A lead counts under what it said; when it said nothing, under what its visit showed. A
          meeting counts once it was held, a deal once it was opened, and money only in the currency
          it was won in.
        </p>
        <BarList
          label="Leads by channel"
          rows={report.chain.map((row) => ({
            key: row.channel,
            label: channelLabel(row.channel, names),
            value: row.leads,
            share: row.leads / report.leads,
          }))}
          format={(value) => formatNumber(value)}
        />
        <DataTable
          caption="Each channel, from lead to won"
          columns={[
            { key: "channel", label: "Channel" },
            { key: "leads", label: "Leads", align: "end" },
            { key: "qualified", label: "Qualified", align: "end" },
            { key: "met", label: "Meeting held", align: "end" },
            { key: "deals", label: "Deal opened", align: "end" },
            { key: "won", label: "Won", align: "end" },
            { key: "money", label: "Won monthly value", align: "end" },
            { key: "rate", label: "Lead to won", align: "end" },
          ]}
        >
          {report.chain.map((row) => (
            <tr key={row.channel}>
              <td>{channelLabel(row.channel, names)}</td>
              <td className="data-table__num">{formatNumber(row.leads)}</td>
              <td className="data-table__num">{formatNumber(row.qualified)}</td>
              <td className="data-table__num">{formatNumber(row.met)}</td>
              <td className="data-table__num">{formatNumber(row.deals)}</td>
              <td className="data-table__num">{formatNumber(row.won)}</td>
              <td className="data-table__num">
                {Object.keys(row.won_mrr).length ? formatMrrBy(row.won_mrr) : "—"}
              </td>
              <td className="data-table__num">{share(row.won, row.leads)}</td>
            </tr>
          ))}
        </DataTable>
      </section>

      <section className="record-section report-section" aria-labelledby="sources-forms">
        <h2 className="record-section__title" id="sources-forms">
          Each form, from lead to won
        </h2>
        <p className="page-note">
          The same chain for each way in — the form or booking a lead came through — with what its
          people said when they were asked.
        </p>
        <DataTable
          caption="Each form, from lead to won"
          columns={[
            { key: "form", label: "Came in by" },
            { key: "leads", label: "Leads", align: "end" },
            { key: "said", label: "They said" },
            { key: "qualified", label: "Qualified", align: "end" },
            { key: "met", label: "Meeting held", align: "end" },
            { key: "deals", label: "Deal opened", align: "end" },
            { key: "won", label: "Won", align: "end" },
            { key: "money", label: "Won monthly value", align: "end" },
          ]}
        >
          {report.by_source.map((row) => (
            <tr key={row.source_key || "none"}>
              <td>
                {row.label || (row.source_key ? formatSentence(row.source_key) : "No source")}
              </td>
              <td className="data-table__num">{formatNumber(row.leads)}</td>
              <td>
                {row.said
                  .map((cell) => `${channelLabel(cell.channel, names)} ${cell.count}`)
                  .join(" · ")}
              </td>
              <td className="data-table__num">{formatNumber(row.qualified)}</td>
              <td className="data-table__num">{formatNumber(row.met)}</td>
              <td className="data-table__num">{formatNumber(row.deals)}</td>
              <td className="data-table__num">{formatNumber(row.won)}</td>
              <td className="data-table__num">
                {Object.keys(row.won_mrr).length ? formatMrrBy(row.won_mrr) : "—"}
              </td>
            </tr>
          ))}
        </DataTable>
      </section>

      <section className="record-section report-section" aria-labelledby="sources-said">
        <h2 className="record-section__title" id="sources-said">
          What they said, against what their visit showed
        </h2>
        <p className="page-note">
          The two disagree more often than either is wrong: someone who heard a podcast, searched
          for the name and clicked an advert is paid advertising to the visit and a podcast in their
          own words.{" "}
          {report.answered > 0
            ? `${agreed} of the ${report.answered} who answered named what their visit showed.`
            : "Nobody in this window answered the question yet."}
        </p>
        <DataTable
          caption="What they said, against what their visit showed"
          columns={[
            { key: "said", label: "They said" },
            { key: "leads", label: "Leads", align: "end" },
            { key: "seen", label: "Their visit showed" },
          ]}
        >
          {report.matrix.map((row) => (
            <tr key={row.said}>
              <td>{channelLabel(row.said, names)}</td>
              <td className="data-table__num">
                {formatNumber(row.seen.reduce((sum, cell) => sum + cell.count, 0))}
              </td>
              <td>
                {row.seen
                  .map((cell) => `${channelLabel(cell.channel, names)} ${cell.count}`)
                  .join(" · ")}
              </td>
            </tr>
          ))}
        </DataTable>
      </section>

      <section className="record-section report-section" aria-labelledby="sources-months">
        <h2 className="record-section__title" id="sources-months">
          By the month they wrote in
        </h2>
        <DataTable
          caption="By the month they wrote in"
          columns={[
            { key: "month", label: "Month" },
            { key: "leads", label: "Leads", align: "end" },
            { key: "answered", label: "Said how they heard", align: "end" },
            { key: "qualified", label: "Qualified", align: "end" },
            { key: "met", label: "Meeting held", align: "end" },
            { key: "won", label: "Won", align: "end" },
          ]}
        >
          {report.months.map((row) => (
            <tr key={row.month}>
              <td>{monthName(row.month)}</td>
              <td className="data-table__num">{formatNumber(row.leads)}</td>
              <td className="data-table__num">{formatNumber(row.answered)}</td>
              <td className="data-table__num">{formatNumber(row.qualified)}</td>
              <td className="data-table__num">{formatNumber(row.met)}</td>
              <td className="data-table__num">{formatNumber(row.won)}</td>
            </tr>
          ))}
        </DataTable>
        <p className="table-sub">
          A month&rsquo;s leads keep moving after it ends, so the newest months have had the least
          time to qualify, meet and close.
        </p>
      </section>
    </>
  );
}
