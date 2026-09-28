import Link from "next/link";

import { createContractAction } from "@/app/(portal)/revenue/actions";
import { PageHeader } from "@/components/shell/page-header";
import { ContractCreateForm, type ContractPrefill } from "@/components/revenue/contract-forms";
import { RevenueTabs } from "@/components/revenue/revenue-tabs";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCompanies } from "@/lib/api/crm";
import { readContracts, type ContractsPage } from "@/lib/api/revenue";
import { isoDay } from "@/lib/crm/dates";
import { CONTRACT_STATE_LABELS, contractStateTone } from "@/lib/crm/vocabulary";
import { formatDate, formatMoney, formatMrr } from "@/lib/format";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Contracts" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "company", label: "Customer" },
  { key: "plan", label: "Plan" },
  { key: "seats", label: "Seats", align: "end" as const },
  { key: "mrr", label: "Monthly value", align: "end" as const },
  { key: "billed", label: "Billed" },
  { key: "state", label: "State" },
  { key: "renews", label: "Renews or ends" },
];

type ContractsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ContractsIndexPage({ searchParams }: ContractsPageProps) {
  const context = await requireStaff("/revenue/contracts");
  if (!hasCapability(context, "revenue:read")) {
    return (
      <>
        <PageHeader eyebrow="Business" title="Revenue" />
        <Callout tone="neutral">Revenue is visible to Sales, Admins and Owners.</Callout>
      </>
    );
  }
  const parameters = await searchParams;
  const now = requestNow();
  const today = isoDay(now);
  // Arriving from a won deal: the form opens already filled from it.
  const prefill: ContractPrefill = {};
  for (const name of ["company_id", "deal_id", "mrr_amount", "seats"] as const) {
    const value = firstSearchValue(parameters[name]);
    if (value && /^[A-Za-z0-9.-]{1,64}$/.test(value)) prefill[name] = value;
  }

  let page: ContractsPage | null = null;
  try {
    page = await readContracts(context.token);
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
  const usd = page?.totals.USD;
  const others = Object.entries(page?.totals ?? {}).filter(
    ([currency, totals]) => currency !== "USD" && totals.mrr !== 0,
  );

  return (
    <>
      <PageHeader
        eyebrow="Business"
        title="Revenue"
        description="What customers pay today, and when each agreement renews or ends."
        actions={
          <>
            <RevenueTabs current="/revenue/contracts" />
            {canWrite && (
              <details className="popover popover--end" open={Boolean(prefill.company_id)}>
                <summary className="btn btn--primary btn--small popover__trigger">
                  Record contract
                </summary>
                <div className="popover__panel popover__panel--wide">
                  <ContractCreateForm
                    action={createContractAction}
                    companies={companies}
                    today={today}
                    prefill={prefill}
                  />
                </div>
              </details>
            )}
          </>
        }
      />
      {page === null ? (
        <Callout tone="danger" role="alert">
          Contracts could not be read just now. This is a read failure, not an empty book.
        </Callout>
      ) : (
        <>
          <StatGrid columns={4} label="Recurring revenue in US dollars">
            <Stat label="MRR" value={usd ? formatMrr(usd.mrr, "USD") : "—"} text />
            <Stat
              label="ARR"
              value={usd ? formatMoney(usd.arr, "USD") : "—"}
              text
              hint="MRR × 12"
            />
            <Stat label="Paying customers" value={usd ? usd.customers : "—"} />
            <Stat
              label="Per customer"
              value={usd ? formatMrr(usd.arpa, "USD") : "—"}
              text
              hint="Average"
            />
          </StatGrid>
          {others.length > 0 && (
            <p className="currency-note">
              Also billed in other currencies, never added to the dollar figures:{" "}
              {others
                .map(
                  ([currency, totals]) =>
                    `${formatMrr(totals.mrr, currency)} (${totals.customers})`,
                )
                .join(" · ")}
            </p>
          )}
          <div className="record-layout">
            <div className="record-layout__main">
              <DataTable
                caption="Contracts"
                columns={COLUMNS}
                isEmpty={page.contracts.length === 0}
                empty={
                  <EmptyState
                    title="No contracts yet"
                    description="Record one when a deal is won; MRR and the bridge are built from them."
                  />
                }
              >
                {page.contracts.map((contract) => (
                  <tr
                    key={contract.contract_id}
                    className={contract.state === "ended" ? "row--muted" : undefined}
                  >
                    <td>
                      <Link
                        className="table-title"
                        href={`/revenue/contracts/${contract.contract_id}`}
                      >
                        {contract.company_name || "Customer"}
                      </Link>
                      <span className="table-sub">Since {formatDate(contract.starts_on)}</span>
                    </td>
                    <td>{contract.plan_name || <span className="table-sub">—</span>}</td>
                    <td className="data-table__num">{contract.seats}</td>
                    <td className="data-table__num">
                      {formatMrr(contract.mrr_amount, contract.currency)}
                    </td>
                    <td>{contract.billing_cadence === "annual" ? "Annually" : "Monthly"}</td>
                    <td>
                      <StatusPill
                        value={contract.state}
                        label={CONTRACT_STATE_LABELS[contract.state] ?? contract.state}
                        tone={contractStateTone(contract.state)}
                      />
                    </td>
                    <td>
                      {contract.state === "active"
                        ? contract.renews_on
                          ? `Renews ${formatDate(contract.renews_on)}`
                          : "—"
                        : `${contract.state === "ending" ? "Ends" : "Ended"} ${formatDate(contract.ends_on)}`}
                    </td>
                  </tr>
                ))}
              </DataTable>
            </div>
            <aside className="record-layout__side">
              <Card title="Renewing in 90 days" titleAs="h3">
                {page.renewing_soon.length === 0 ? (
                  <p className="side-quiet">No renewals due in the next 90 days.</p>
                ) : (
                  <ul className="side-list">
                    {page.renewing_soon.map((contract) => (
                      <li key={contract.contract_id} className="renewal">
                        <Link href={`/revenue/contracts/${contract.contract_id}`}>
                          {contract.company_name}
                        </Link>
                        <span
                          className={
                            contract.renews_in_days !== null && contract.renews_in_days <= 30
                              ? "due due--today"
                              : "due"
                          }
                        >
                          {contract.renews_in_days === null
                            ? "—"
                            : contract.renews_in_days === 0
                              ? "Today"
                              : `${contract.renews_in_days}d`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </aside>
          </div>
        </>
      )}
    </>
  );
}
