import Link from "next/link";

import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import { adjustMrrAction } from "@/app/(portal)/revenue/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
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
import { readCompanies } from "@/lib/api/crm";
import { readMrrBridge, type MrrBridge } from "@/lib/api/revenue";
import { isoDay } from "@/lib/crm/dates";
import { MOVEMENT_KIND_LABELS } from "@/lib/crm/vocabulary";
import { formatAbsolute, formatDate, formatMoney, formatMrr } from "@/lib/format";
import { requestNow } from "@/lib/request-time";
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
  try {
    bridge = await readMrrBridge(context.token, currency, 12);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const canWrite = hasCapability(context, "revenue:write");
  let companies: { id: string; label: string }[] = [];
  if (canWrite) {
    try {
      companies = (await readCompanies(context.token)).companies.map((company) => ({
        id: company.company_id,
        label: company.name,
      }));
    } catch (error) {
      if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
        throw error;
    }
  }
  const signed = (value: number) =>
    value === 0 ? "—" : `${value > 0 ? "+" : ""}${formatMoney(value, currency)}`;
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;

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
      {bridge === null ? (
        <Callout tone="danger" role="alert">
          Revenue could not be read just now. This is a read failure, not zero revenue.
        </Callout>
      ) : (
        <>
          <StatGrid columns={4} label={`Recurring revenue in ${currency}`}>
            <Stat label="MRR today" value={formatMrr(bridge.current.mrr, currency)} text />
            <Stat label="ARR" value={formatMoney(bridge.current.arr, currency)} text />
            <Stat label="Paying customers" value={bridge.current.customers} />
            <Stat label="Per customer" value={formatMrr(bridge.current.arpa, currency)} text />
          </StatGrid>
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
                  <td className="data-table__num">{formatMoney(month.start, currency)}</td>
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
                  <td className="data-table__num num--strong">
                    {formatMoney(month.end, currency)}
                  </td>
                </tr>
              ))}
            </DataTable>
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
                    companies={companies}
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
