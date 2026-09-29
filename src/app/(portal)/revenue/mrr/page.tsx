import Link from "next/link";

import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import { adjustMrrAction } from "@/app/(portal)/revenue/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
import { BarList } from "@/components/charts/bar-list";
import { ShareBar } from "@/components/charts/share-bar";
import { TrendChart } from "@/components/charts/trend-chart";
import { PageHeader } from "@/components/shell/page-header";
import { BridgeChart } from "@/components/revenue/bridge-chart";
import { MrrAdjustForm } from "@/components/revenue/contract-forms";
import { RevenueTabs } from "@/components/revenue/revenue-tabs";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Stat, StatGrid } from "@/components/ui/stat";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCompanies, type CompanyRow } from "@/lib/api/crm";
import {
  readContracts,
  readMrrBridge,
  type Contract,
  type ContractsPage,
  type MrrBridge,
} from "@/lib/api/revenue";
import { isoDay } from "@/lib/crm/dates";
import { MOVEMENT_KIND_LABELS } from "@/lib/crm/vocabulary";
import {
  formatAbsolute,
  formatDate,
  formatDeltaPercent,
  formatMoney,
  formatMonth,
  formatMonthShort,
  formatMrr,
  formatMultiple,
  formatNumber,
  formatPercent,
  formatRatePercent,
} from "@/lib/format";
import { requestNow } from "@/lib/request-time";
import {
  concentration,
  customersByMonth,
  growthMetrics,
  logoChurn,
  paying,
  seatFigures,
  sliceBy,
  topSlices,
} from "@/lib/revenue/metrics";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "MRR" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "month", label: "Month" },
  { key: "start", label: "Start", align: "end" as const },
  { key: "new", label: "New", align: "end" as const },
  { key: "expansion", label: "Expansion", align: "end" as const },
  { key: "reactivation", label: "Reactivation", align: "end" as const },
  { key: "contraction", label: "Contraction", align: "end" as const },
  { key: "churn", label: "Churn", align: "end" as const },
  { key: "adjustment", label: "Adjustment", align: "end" as const },
  { key: "end", label: "End", align: "end" as const },
];

type MrrPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function isReadFailure(error: unknown): boolean {
  return error instanceof HqApiUnavailableError || error instanceof HqApiRequestError;
}

/** The biggest customer, the next four, the next five, everyone else. */
function concentrationSegments(contracts: readonly Contract[]) {
  const sorted = [...contracts].sort((a, b) => b.mrr_amount - a.mrr_amount);
  const sum = (from: number, to: number) =>
    sorted.slice(from, to).reduce((total, contract) => total + contract.mrr_amount, 0);
  return [
    { key: "largest", label: sorted[0]?.company_name || "Largest customer", value: sum(0, 1) },
    { key: "next4", label: "Next four", value: sum(1, 5) },
    { key: "next5", label: "Next five", value: sum(5, 10) },
    {
      key: "rest",
      label: `Everyone else (${Math.max(sorted.length - 10, 0)})`,
      value: sum(10, sorted.length),
    },
  ].filter((segment) => segment.value > 0);
}

export default async function MrrPage({ searchParams }: MrrPageProps) {
  const context = await requireStaff("/revenue/mrr");
  if (!hasCapability(context, "revenue:read")) {
    return (
      <>
        <PageHeader eyebrow="Business" title="MRR" />
        <Callout tone="neutral">Revenue is visible to Sales, Admins and Owners.</Callout>
      </>
    );
  }
  const requested = (firstSearchValue((await searchParams).currency) ?? "USD").toUpperCase();
  const currency = /^[A-Z]{3}$/.test(requested) ? requested : "USD";
  const today = isoDay(requestNow());

  let bridge: MrrBridge | null = null;
  let contracts: ContractsPage | null = null;
  let companies: CompanyRow[] | null = null;
  const [bridgeRead, contractsRead, companiesRead] = await Promise.allSettled([
    readMrrBridge(context.token, currency, 12),
    readContracts(context.token),
    readCompanies(context.token),
  ]);
  for (const read of [bridgeRead, contractsRead, companiesRead]) {
    if (read.status === "rejected" && !isReadFailure(read.reason)) throw read.reason;
  }
  if (bridgeRead.status === "fulfilled") bridge = bridgeRead.value;
  if (contractsRead.status === "fulfilled") contracts = contractsRead.value;
  if (companiesRead.status === "fulfilled") companies = companiesRead.value.companies;

  const canWrite = hasCapability(context, "revenue:write");
  const companyOptions = (companies ?? []).map((company) => ({
    id: company.company_id,
    label: company.name,
  }));
  const companyById = new Map((companies ?? []).map((company) => [company.company_id, company]));
  const signed = (value: number) =>
    value === 0 ? "—" : `${value > 0 ? "+" : ""}${formatMoney(value, currency)}`;
  const money = (value: number) => formatMoney(value, currency);
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;

  // Everything below the first strip is arithmetic on the figures above it.
  const growth = bridge ? growthMetrics(bridge.months) : null;
  const book = contracts ? paying(contracts.contracts, currency) : null;
  const inCurrency = contracts
    ? contracts.contracts.filter((contract) => contract.currency === currency)
    : null;
  const customers =
    bridge && inCurrency
      ? customersByMonth(
          inCurrency,
          bridge.months.map((month) => month.month),
        )
      : null;
  const churn = inCurrency ? logoChurn(inCurrency, today, 12) : null;
  const byPlan = book ? sliceBy(book, (contract) => contract.plan_name || "No plan named") : [];
  const byFirm = book
    ? sliceBy(book, (contract) => companyById.get(contract.company_id)?.firm_type || "Unknown")
    : [];
  const byCountry = book
    ? topSlices(
        sliceBy(book, (contract) => companyById.get(contract.company_id)?.country || "Unknown"),
        6,
      )
    : [];
  const spread = book ? concentration(book) : null;
  const seats = book ? seatFigures(book) : null;
  const annualMrr = book
    ? book
        .filter((contract) => contract.billing_cadence === "annual")
        .reduce((sum, contract) => sum + contract.mrr_amount, 0)
    : 0;
  const monthlyMrr = book
    ? book.reduce((sum, contract) => sum + contract.mrr_amount, 0) - annualMrr
    : 0;
  const contractsNote = (
    <Callout tone="attention" compact>
      Contracts could not be read just now, so this breakdown is missing — a read failure, not an
      empty book.
    </Callout>
  );

  return (
    <>
      <PageHeader
        eyebrow="Business"
        title="MRR"
        description="Monthly recurring revenue, month by month, and exactly what moved it. Each month ends where the next begins."
        actions={
          <>
            <RevenueTabs current="/revenue/mrr" />
            {bridge && bridge.currencies.length > 1 && (
              <SegmentedLinks
                label="Currency"
                items={bridge.currencies.map((code) => ({
                  href: code === "USD" ? "/revenue/mrr" : `/revenue/mrr?currency=${code}`,
                  label: code,
                  current: code === currency,
                }))}
              />
            )}
          </>
        }
      />
      {bridge === null || growth === null ? (
        <Callout tone="danger" role="alert">
          Revenue could not be read just now. This is a read failure, not zero revenue.
        </Callout>
      ) : (
        <>
          <StatGrid columns={4} label={`Recurring revenue in ${currency}`}>
            <Stat label="MRR today" value={formatMrr(bridge.current.mrr, currency)} text />
            <Stat label="ARR" value={money(bridge.current.arr)} text />
            <Stat label="Paying customers" value={bridge.current.customers} />
            <Stat label="Per customer" value={formatMrr(bridge.current.arpa, currency)} text />
          </StatGrid>

          <StatGrid columns={6} label="Growth and retention">
            <Stat
              label={growth.latest ? `Growth, ${formatMonth(growth.latest.month)}` : "Growth"}
              value={formatDeltaPercent(growth.momGrowth)}
              text
              tone={growth.momGrowth !== null && growth.momGrowth < 0 ? "danger" : "default"}
              hint={
                growth.netNew === null
                  ? "No completed month yet"
                  : `Net new ${signed(growth.netNew)}`
              }
            />
            <Stat
              label="Compound monthly growth"
              value={formatDeltaPercent(growth.cmgr)}
              text
              hint={
                growth.cmgrMonths > 0
                  ? `Over ${growth.cmgrMonths} ${growth.cmgrMonths === 1 ? "month" : "months"}`
                  : "Needs two completed months"
              }
            />
            <Stat
              label="Gross MRR churn"
              value={formatRatePercent(growth.grossChurnRate)}
              text
              hint={
                growth.churnMonths > 0
                  ? `Monthly, ${growth.churnMonths}-month average`
                  : "No completed month yet"
              }
            />
            <Stat
              label="Net revenue retention"
              value={formatRatePercent(growth.netRetention)}
              text
              tone={growth.netRetention !== null && growth.netRetention < 1 ? "danger" : "default"}
              hint={`${growth.retentionMonths} ${growth.retentionMonths === 1 ? "month" : "months"}, bridge basis`}
            />
            <Stat
              label="Quick ratio"
              value={
                growth.hadLosses
                  ? formatMultiple(growth.quickRatio)
                  : growth.quickMonths > 0
                    ? "No losses"
                    : "—"
              }
              text
              hint="Gains ÷ losses, last 3 months"
            />
            <Stat
              label="Logo churn, 12 months"
              value={churn ? formatRatePercent(churn.rate) : "—"}
              text
              hint={
                churn
                  ? churn.atStart === 0
                    ? "No customers a year ago"
                    : `${churn.churned} of the ${churn.atStart} paying a year ago`
                  : "Contracts not read"
              }
            />
          </StatGrid>

          <div className="chart-grid">
            <Card
              title="MRR at month end"
              titleAs="h2"
              description={`Where the ledger stood at the close of each month, in ${currency}.`}
            >
              <TrendChart
                ariaLabel={`Monthly recurring revenue at each month's end over ${bridge.months.length} months, ending at ${money(bridge.current.mrr)}.`}
                format={money}
                points={bridge.months.map((month) => ({
                  label: formatMonthShort(month.month),
                  title: month.partial
                    ? `${formatMonth(month.month)} so far`
                    : formatMonth(month.month),
                  value: month.end,
                }))}
              />
            </Card>
            <Card
              title="Paying customers at month end"
              titleAs="h2"
              description="Contracts begun by the month's close and not yet ended."
            >
              {customers ? (
                <TrendChart
                  tone="success"
                  ariaLabel={`Paying customers at each month's end over ${customers.length} months, ending at ${customers[customers.length - 1]?.count ?? 0}.`}
                  format={(value) => formatNumber(Math.round(value))}
                  points={customers.map((row) => ({
                    label: formatMonthShort(row.month),
                    title: formatMonth(row.month),
                    value: row.count,
                  }))}
                />
              ) : (
                contractsNote
              )}
            </Card>
          </div>

          <Card title="The bridge" titleAs="h2" className="bridge-card">
            <BridgeChart months={bridge.months} currency={currency} />
          </Card>
          <section className="record-section bridge-table" aria-labelledby="bridge-table">
            <h2 className="record-section__title" id="bridge-table">
              Month by month ({currency})
            </h2>
            <DataTable caption={`MRR bridge in ${currency}`} columns={COLUMNS} scroll={false}>
              {bridge.months.map((month) => (
                <tr key={month.month}>
                  <td className="nowrap">
                    {month.month}
                    {month.partial && <span className="table-sub">So far</span>}
                  </td>
                  <td className="data-table__num">{money(month.start)}</td>
                  <td className={`data-table__num${month.new ? " num--up" : ""}`}>
                    {signed(month.new)}
                  </td>
                  <td className={`data-table__num${month.expansion ? " num--up" : ""}`}>
                    {signed(month.expansion)}
                  </td>
                  <td className={`data-table__num${month.reactivation ? " num--up" : ""}`}>
                    {signed(month.reactivation)}
                  </td>
                  <td className={`data-table__num${month.contraction ? " num--down" : ""}`}>
                    {signed(month.contraction)}
                  </td>
                  <td className={`data-table__num${month.churn ? " num--down" : ""}`}>
                    {signed(month.churn)}
                  </td>
                  <td className="data-table__num">{signed(month.adjustment)}</td>
                  <td className="data-table__num num--strong">{money(month.end)}</td>
                </tr>
              ))}
            </DataTable>
          </section>

          <section className="record-section report-section" aria-labelledby="mrr-book">
            <h2 className="record-section__title" id="mrr-book">
              Where the revenue is ·{" "}
              {book ? `${book.length} paying contracts in ${currency}` : currency}
            </h2>
            {book === null || spread === null || seats === null ? (
              contractsNote
            ) : (
              <div className="chart-grid">
                <Card title="By plan" titleAs="h3">
                  <BarList
                    label="MRR by plan"
                    format={(value) => formatMrr(value, currency)}
                    rows={byPlan.map((slice) => ({
                      key: slice.key,
                      label: slice.label,
                      value: slice.mrr,
                      share: slice.share,
                      sub: `${slice.count} ${slice.count === 1 ? "customer" : "customers"}`,
                    }))}
                  />
                </Card>
                <Card title="By firm type" titleAs="h3">
                  {companies === null ? (
                    <p className="side-quiet">Company details could not be read.</p>
                  ) : (
                    <BarList
                      label="MRR by firm type"
                      format={(value) => formatMrr(value, currency)}
                      rows={byFirm.map((slice) => ({
                        key: slice.key,
                        label: slice.label,
                        value: slice.mrr,
                        share: slice.share,
                        sub: `${slice.count} ${slice.count === 1 ? "customer" : "customers"}`,
                      }))}
                    />
                  )}
                </Card>
                <Card title="By country" titleAs="h3">
                  {companies === null ? (
                    <p className="side-quiet">Company details could not be read.</p>
                  ) : (
                    <BarList
                      label="MRR by country"
                      format={(value) => formatMrr(value, currency)}
                      rows={byCountry.map((slice) => ({
                        key: slice.key,
                        label: slice.label,
                        value: slice.mrr,
                        share: slice.share,
                        sub: `${slice.count} ${slice.count === 1 ? "customer" : "customers"}`,
                        tone: slice.key === "rest" ? "muted" : "accent",
                      }))}
                    />
                  )}
                </Card>
                <Card
                  title="Concentration"
                  titleAs="h3"
                  description="How much of the book the biggest customers are."
                >
                  <ShareBar
                    label="MRR by customer rank"
                    format={(value) => formatMrr(value, currency)}
                    segments={concentrationSegments(book)}
                  />
                  <ul className="report-facts report-note">
                    <li>
                      <span>Largest customer</span>
                      <strong>
                        {spread.largest
                          ? `${spread.largest.name} · ${formatPercent(spread.largest.share)}`
                          : "—"}
                      </strong>
                    </li>
                    <li>
                      <span>Top five</span>
                      <strong>{formatPercent(spread.top5Share)}</strong>
                    </li>
                    <li>
                      <span>Top ten</span>
                      <strong>{formatPercent(spread.top10Share)}</strong>
                    </li>
                  </ul>
                </Card>
                <Card
                  title="Billing and seats"
                  titleAs="h3"
                  description="Annual agreements are paid up front; monthly ones can leave at a month's end."
                >
                  <ShareBar
                    label="MRR by billing cadence"
                    format={(value) => formatMrr(value, currency)}
                    segments={[
                      { key: "annual", label: "Billed annually", value: annualMrr },
                      { key: "monthly", label: "Billed monthly", value: monthlyMrr },
                    ]}
                  />
                  <ul className="report-facts report-note">
                    <li>
                      <span>Seats</span>
                      <strong>{formatNumber(seats.seats)}</strong>
                    </li>
                    <li>
                      <span>Per seat</span>
                      <strong>
                        {seats.perSeat === null ? "—" : formatMrr(seats.perSeat, currency)}
                      </strong>
                    </li>
                    <li>
                      <span>Per customer</span>
                      <strong>{formatMrr(bridge.current.arpa, currency)}</strong>
                    </li>
                  </ul>
                </Card>
              </div>
            )}
          </section>

          <div className="record-layout">
            <div className="record-layout__main">
              <Card
                title="Booked, not yet revenue"
                titleAs="h2"
                description="Changes dated after today: a contract starting later, a churn at the end of a notice period."
              >
                {bridge.scheduled.length === 0 ? (
                  <p className="side-quiet">Nothing scheduled.</p>
                ) : (
                  <ul className="side-list">
                    {bridge.scheduled.map((movement, index) => (
                      <li key={`${movement.effective_on}-${index}`} className="renewal">
                        <span>
                          {MOVEMENT_KIND_LABELS[movement.kind] ?? movement.kind} ·{" "}
                          {formatDate(movement.effective_on)}
                          {movement.contract_id && (
                            <>
                              {" · "}
                              <Link href={`/revenue/contracts/${movement.contract_id}`}>
                                Contract
                              </Link>
                            </>
                          )}
                        </span>
                        <span className={movement.amount < 0 ? "num--down" : "num--up"}>
                          {signed(movement.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
            {canWrite && (
              <aside className="record-layout__side">
                <Card
                  title="Correct a figure"
                  titleAs="h3"
                  description="For what no contract change explains: a credit note, a billing error. Dated, signed and reasoned."
                >
                  <SudoGate
                    action={confirmSudoAction}
                    fresh={context.me.sudo_fresh}
                    untilLabel={untilLabel}
                    returnPath="/revenue/mrr"
                    purpose="Corrections need a fresh code from your authenticator app."
                  />
                  <MrrAdjustForm
                    action={adjustMrrAction}
                    companies={companyOptions}
                    currency={currency}
                    today={today}
                    disabled={!context.me.sudo_fresh}
                  />
                </Card>
              </aside>
            )}
          </div>
        </>
      )}
    </>
  );
}
