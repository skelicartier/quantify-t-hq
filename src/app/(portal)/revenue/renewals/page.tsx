import Link from "next/link";

import { bulkUndoAction, bulkUpdateAction } from "@/app/(portal)/_actions/bulk";
import { ColumnChart } from "@/components/charts/column-chart";
import { PageHeader } from "@/components/shell/page-header";
import { RevenueTabs } from "@/components/revenue/revenue-tabs";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable, SelectCell, tableIdFor } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectionBar } from "@/components/ui/selection-bar";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readRenewals, type RenewalsPage } from "@/lib/api/revenue";
import { directoryOrNull, nameFor } from "@/lib/api/staff";
import { RENEWAL_STATUS_LABELS, renewalStatusTone } from "@/lib/crm/vocabulary";
import { formatDate, formatMoney, formatMonthShort, formatMrr, formatPercent } from "@/lib/format";
import { parseSort, serializeSort, sortHrefBuilder, sortRows } from "@/lib/lists/sort";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Renewals" };
export const dynamic = "force-dynamic";

const WINDOWS = [60, 120, 180, 365] as const;

const COLUMNS = [
  { key: "customer", label: "Customer", sortable: true },
  { key: "renews", label: "Renews", sortable: true },
  { key: "notice", label: "Notice by" },
  { key: "plan", label: "Plan", sortable: true },
  { key: "mrr", label: "Monthly value", align: "end" as const, sortable: true },
  { key: "expectation", label: "Expectation", sortable: true },
  { key: "confidence", label: "Confidence", align: "end" as const, sortable: true },
  { key: "forecast", label: "Weighted", align: "end" as const, sortable: true },
  { key: "note", label: "Why" },
  { key: "recorded", label: "Recorded by" },
];

type RenewalsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RenewalsIndexPage({ searchParams }: RenewalsPageProps) {
  const context = await requireStaff("/revenue/renewals");
  if (!hasCapability(context, "revenue:read")) {
    return (
      <>
        <PageHeader eyebrow="Business" title="Renewals" />
        <Callout tone="neutral">Revenue is visible to Sales, Admins and Owners.</Callout>
      </>
    );
  }
  const parameters = await searchParams;
  const requestedDays = Number(firstSearchValue(parameters.days) ?? 120);
  const days = (WINDOWS as readonly number[]).includes(requestedDays) ? requestedDays : 120;
  const sort = parseSort(
    firstSearchValue(parameters.sort),
    COLUMNS.map((column) => column.key),
  );
  const query = { days: days === 120 ? "" : String(days), sort: serializeSort(sort) };
  const listHref = (over: Partial<typeof query>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, ...over }))
      if (value) next.set(key, value);
    const rendered = next.toString();
    return rendered ? `/revenue/renewals?${rendered}` : "/revenue/renewals";
  };

  let page: RenewalsPage | null = null;
  try {
    page = await readRenewals(context.token, days, "USD");
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const names = await directoryOrNull(context.token);
  const canWrite = hasCapability(context, "revenue:write");
  const money = (value: number) => formatMoney(value, "USD");
  const rows = sortRows(page?.renewals ?? [], sort, {
    customer: (row) => row.company_name,
    renews: (row) => row.renews_on,
    plan: (row) => row.plan_name,
    mrr: (row) => row.mrr_amount,
    expectation: (row) => RENEWAL_STATUS_LABELS[row.renewal.status] ?? row.renewal.status,
    confidence: (row) => row.renewal.confidence,
    forecast: (row) => row.weighted_mrr,
  });
  const totals = page?.totals;
  const forecastShare = totals && totals.due_mrr > 0 ? totals.forecast_mrr / totals.due_mrr : null;

  return (
    <>
      <PageHeader
        eyebrow="Business"
        title="Renewals"
        description="Every contract renewing in the window, what we expect of each, and the month by month gap between what is due and what the expectations add up to. Nothing here is modelled: a person recorded every expectation."
        actions={
          <>
            <RevenueTabs current="/revenue/renewals" />
            <SegmentedLinks
              label="Window"
              items={WINDOWS.map((window) => ({
                href: listHref({ days: window === 120 ? "" : String(window) }),
                label: `${window} days`,
                current: window === days,
              }))}
            />
          </>
        }
      />
      {page === null || totals === undefined ? (
        <Callout tone="danger" role="alert">
          Renewals could not be read just now. This is a read failure, not an empty book.
        </Callout>
      ) : (
        <>
          <StatGrid columns={6} label={`Renewals in the next ${days} days, in US dollars`}>
            <Stat
              label="Due"
              value={formatMrr(totals.due_mrr, "USD")}
              text
              hint={`${totals.due_count} ${totals.due_count === 1 ? "contract" : "contracts"}`}
            />
            <Stat
              label="Forecast"
              value={formatMrr(totals.forecast_mrr, "USD")}
              text
              hint={
                forecastShare === null
                  ? "Expectations × confidence"
                  : `${formatPercent(forecastShare)} of what is due`
              }
            />
            <Stat
              label="Committed"
              value={formatMrr(totals.committed_mrr, "USD")}
              text
              hint="At the renewal value"
            />
            <Stat
              label="At risk"
              value={formatMrr(totals.at_risk_mrr, "USD")}
              text
              tone={totals.at_risk_mrr > 0 ? "danger" : "default"}
              hint="At today's price"
            />
            <Stat
              label="Undecided"
              value={totals.undecided_count}
              tone={totals.undecided_count > 0 ? "danger" : "default"}
              hint={`${formatMrr(totals.undecided_mrr, "USD")} not yet called`}
            />
            <Stat
              label="Date passed"
              value={totals.overdue_count}
              tone={totals.overdue_count > 0 ? "danger" : "default"}
              hint={
                totals.overdue_count > 0
                  ? `${formatMrr(totals.overdue_mrr, "USD")} still active`
                  : "Every renewal date is ahead"
              }
            />
          </StatGrid>

          <div className="chart-grid">
            <Card
              title="Due by month"
              titleAs="h2"
              description="Monthly value of the contracts renewing in each of the next six months."
            >
              <ColumnChart
                ariaLabel={`Monthly recurring revenue due for renewal in each of the next six months, ${money(page.months.reduce((sum, row) => sum + row.due_mrr, 0))} in all.`}
                format={money}
                columns={page.months.map((row) => ({
                  label: formatMonthShort(row.month),
                  value: row.due_mrr,
                  hint: `${row.due_count} ${row.due_count === 1 ? "contract" : "contracts"}`,
                }))}
              />
            </Card>
            <Card
              title="Forecast by month"
              titleAs="h2"
              description="What the recorded expectations add up to, each weighted by its confidence."
            >
              <ColumnChart
                ariaLabel={`Forecast renewal revenue in each of the next six months, ${money(page.months.reduce((sum, row) => sum + row.forecast_mrr, 0))} in all.`}
                format={money}
                columns={page.months.map((row) => ({
                  label: formatMonthShort(row.month),
                  value: row.forecast_mrr,
                  hint: `${formatMrr(row.due_mrr, "USD")} due · ${row.undecided_count} undecided`,
                }))}
              />
            </Card>
          </div>

          <section className="record-section report-section" aria-labelledby="renewals-months">
            <h2 className="record-section__title" id="renewals-months">
              Month by month (USD)
            </h2>
            <DataTable
              caption="Renewals by month"
              columnMenu={false}
              scroll={false}
              columns={[
                { key: "month", label: "Month" },
                { key: "due", label: "Due", align: "end" },
                { key: "forecast", label: "Forecast", align: "end" },
                { key: "committed", label: "Committed", align: "end" },
                { key: "at_risk", label: "At risk", align: "end" },
                { key: "lost", label: "Lost", align: "end" },
                { key: "undecided", label: "Undecided", align: "end" },
              ]}
            >
              {page.months.map((row) => (
                <tr key={row.month}>
                  <td className="nowrap">{row.month}</td>
                  <td className="data-table__num">
                    {row.due_count === 0 ? "—" : `${money(row.due_mrr)} · ${row.due_count}`}
                  </td>
                  <td className="data-table__num num--strong">
                    {row.due_count === 0 ? "—" : money(row.forecast_mrr)}
                  </td>
                  <td className="data-table__num">
                    {row.committed_mrr ? money(row.committed_mrr) : "—"}
                  </td>
                  <td className={`data-table__num${row.at_risk_mrr ? " num--down" : ""}`}>
                    {row.at_risk_mrr ? money(row.at_risk_mrr) : "—"}
                  </td>
                  <td className={`data-table__num${row.lost_mrr ? " num--down" : ""}`}>
                    {row.lost_mrr ? money(row.lost_mrr) : "—"}
                  </td>
                  <td className={`data-table__num${row.undecided_count ? " num--down" : ""}`}>
                    {row.undecided_count
                      ? `${money(row.undecided_mrr)} · ${row.undecided_count}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </DataTable>
          </section>

          <section className="record-section report-section" aria-labelledby="renewals-list">
            <h2 className="record-section__title" id="renewals-list">
              Every renewal in the window · soonest first · set an expectation on the contract
            </h2>
            {canWrite && (
              <SelectionBar
                tableId={tableIdFor("Renewals")}
                kind="renewals"
                noun={["renewal", "renewals"]}
                action={bulkUpdateAction}
                undoAction={bulkUndoAction}
                fields={[
                  {
                    field: "status",
                    label: "Expectation",
                    choices: [
                      { value: "commit", label: "Commit" },
                      { value: "likely", label: "Likely" },
                      { value: "at_risk", label: "At risk" },
                      { value: "lost", label: "Lost" },
                      { value: "", label: "Undecided" },
                    ],
                  },
                ]}
              />
            )}
            <DataTable
              caption="Renewals"
              columns={COLUMNS}
              sort={sort}
              sortHref={sortHrefBuilder("/revenue/renewals", query, sort)}
              selectable={canWrite}
              isEmpty={rows.length === 0}
              empty={
                <EmptyState
                  title="Nothing renews in this window"
                  description="Widen the window, or record contracts as deals are won."
                />
              }
            >
              {rows.map((row) => {
                const overdue = row.renews_in_days !== null && row.renews_in_days < 0;
                return (
                  <tr key={row.contract_id} className={overdue ? "row--attention" : undefined}>
                    {canWrite && (
                      <SelectCell id={row.contract_id} label={row.company_name || "contract"} />
                    )}
                    <td>
                      <Link className="table-title" href={`/revenue/contracts/${row.contract_id}`}>
                        {row.company_name || "Customer"}
                      </Link>
                      <span className="table-sub">{row.seats} seats</span>
                    </td>
                    <td>
                      {formatDate(row.renews_on)}
                      <span className="table-sub">
                        {overdue ? (
                          <span className="due due--overdue">Date passed</span>
                        ) : row.renews_in_days === 0 ? (
                          "Today"
                        ) : (
                          `in ${row.renews_in_days}d`
                        )}
                      </span>
                    </td>
                    <td>
                      {row.notice_date && row.notice_date !== row.renews_on ? (
                        formatDate(row.notice_date)
                      ) : row.notice_days === null ? (
                        <span className="table-sub">No period written</span>
                      ) : (
                        formatDate(row.notice_date)
                      )}
                      <span className="table-sub">
                        {row.playbook_started_at ? "Playbook running" : "No playbook"}
                      </span>
                    </td>
                    <td>{row.plan_name || <span className="table-sub">—</span>}</td>
                    <td className="data-table__num">{formatMrr(row.mrr_amount, row.currency)}</td>
                    <td>
                      <StatusPill
                        value={row.renewal.status || "undecided"}
                        label={RENEWAL_STATUS_LABELS[row.renewal.status] ?? row.renewal.status}
                        tone={renewalStatusTone(row.renewal.status)}
                      />
                    </td>
                    <td className="data-table__num">
                      {row.renewal.confidence === null ? "—" : `${row.renewal.confidence}%`}
                    </td>
                    <td className="data-table__num">
                      {row.renewal.status ? formatMrr(row.weighted_mrr, row.currency) : "—"}
                    </td>
                    <td>{row.renewal.note || <span className="table-sub">—</span>}</td>
                    <td>
                      {row.renewal.updated_by ? (
                        <>
                          {nameFor(names, row.renewal.updated_by)}
                          <span className="table-sub">{formatDate(row.renewal.updated_at)}</span>
                        </>
                      ) : (
                        <span className="table-sub">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          </section>
        </>
      )}
    </>
  );
}
