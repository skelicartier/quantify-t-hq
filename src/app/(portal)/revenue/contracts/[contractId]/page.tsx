import Link from "next/link";
import { notFound } from "next/navigation";

import { cancelContractAction, changePriceAction } from "@/app/(portal)/revenue/actions";
import { PageHeader } from "@/components/shell/page-header";
import { ContractCancelForm, ContractPriceForm } from "@/components/revenue/contract-forms";
import { RevenueTabs } from "@/components/revenue/revenue-tabs";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import { StatusPill } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError } from "@/lib/api/core";
import { readContract, type ContractDetail } from "@/lib/api/revenue";
import { isoDay } from "@/lib/crm/dates";
import {
  CANCEL_REASON_LABELS,
  CONTRACT_STATE_LABELS,
  MOVEMENT_KIND_LABELS,
  contractStateTone,
} from "@/lib/crm/vocabulary";
import { formatDate, formatMoney, formatMrr } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Contract" };
export const dynamic = "force-dynamic";

const MOVEMENT_COLUMNS = [
  { key: "date", label: "Effective" },
  { key: "kind", label: "Movement" },
  { key: "amount", label: "Change", align: "end" as const },
  { key: "note", label: "Note" },
];

type ContractPageProps = { params: Promise<{ contractId: string }> };

export default async function ContractPage({ params }: ContractPageProps) {
  const { contractId } = await params;
  const context = await requireStaff(`/revenue/contracts/${contractId}`);
  if (!hasCapability(context, "revenue:read")) {
    return (
      <>
        <PageHeader eyebrow="Business" title="Contract" />
        <Callout tone="neutral">Revenue is visible to Sales, Admins and Owners.</Callout>
      </>
    );
  }
  const now = requestNow();
  const today = isoDay(now);

  let detail: ContractDetail;
  try {
    detail = await readContract(context.token, contractId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    throw error;
  }
  const { contract, movements } = detail;
  const canWrite = hasCapability(context, "revenue:write");
  const active = contract.state === "active";
  // Notice usually runs to the end of the month.
  const monthEnd = new Date(
    Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() + 1, 0),
  )
    .toISOString()
    .slice(0, 10);

  return (
    <>
      <PageHeader
        eyebrow="Contract"
        title={contract.company_name || "Contract"}
        breadcrumbs={[{ label: "Revenue", href: "/revenue/contracts" }]}
        description={`${contract.plan_name || "Plan"} · ${contract.seats} ${contract.seats === 1 ? "seat" : "seats"} · ${formatMrr(contract.mrr_amount, contract.currency)}`}
        meta={
          <StatusPill
            value={contract.state}
            label={CONTRACT_STATE_LABELS[contract.state] ?? contract.state}
            tone={contractStateTone(contract.state)}
          />
        }
        actions={<RevenueTabs current="/revenue/contracts" />}
      />
      {contract.state === "ending" && (
        <Callout tone="attention" title={`Ends ${formatDate(contract.ends_on)}`}>
          Notice given ({CANCEL_REASON_LABELS[contract.cancel_reason] ?? contract.cancel_reason}).
          Revenue continues until then; the churn is dated that day.
        </Callout>
      )}
      <div className="record-layout">
        <div className="record-layout__main">
          <Card title="Agreement" titleAs="h2">
            <KeyValue columns={2}>
              <KeyValueRow label="Customer">
                <Link href={`/companies/${contract.company_id}`}>{contract.company_name}</Link>
              </KeyValueRow>
              <KeyValueRow label="Monthly value">
                {formatMrr(contract.mrr_amount, contract.currency)}
              </KeyValueRow>
              <KeyValueRow label="Billed">
                {contract.billing_cadence === "annual" ? "Annually" : "Monthly"}
              </KeyValueRow>
              <KeyValueRow label="Term">{contract.term_months} months</KeyValueRow>
              <KeyValueRow label="Started">{formatDate(contract.starts_on)}</KeyValueRow>
              <KeyValueRow label={active ? "Renews" : "Ends"}>
                {formatDate(active ? contract.renews_on : contract.ends_on, "—")}
              </KeyValueRow>
              {contract.deal_id && (
                <KeyValueRow label="From deal">
                  <Link href={`/deals/${contract.deal_id}`}>Open the deal</Link>
                </KeyValueRow>
              )}
            </KeyValue>
            {contract.notes && <p className="prose-block prose-block--side">{contract.notes}</p>}
          </Card>
          <section className="record-section" aria-labelledby="contract-movements">
            <h2 className="record-section__title" id="contract-movements">
              Revenue movements
            </h2>
            <DataTable caption="Revenue movements" columns={MOVEMENT_COLUMNS} scroll={false}>
              {movements.map((movement, index) => (
                <tr key={`${movement.effective_on}-${movement.kind}-${index}`}>
                  <td>
                    {formatDate(movement.effective_on)}
                    {movement.effective_on && movement.effective_on > today && (
                      <span className="table-sub">Scheduled</span>
                    )}
                  </td>
                  <td>{MOVEMENT_KIND_LABELS[movement.kind] ?? movement.kind}</td>
                  <td
                    className={`data-table__num ${movement.amount < 0 ? "num--down" : "num--up"}`}
                  >
                    {movement.amount > 0 ? "+" : ""}
                    {formatMoney(movement.amount, movement.currency)}
                  </td>
                  <td>{movement.note || <span className="table-sub">—</span>}</td>
                </tr>
              ))}
            </DataTable>
          </section>
        </div>
        {canWrite && active && (
          <aside className="record-layout__side">
            <Card
              title="Change the price"
              titleAs="h3"
              description="An upgrade, a downgrade or a seat change."
            >
              <ContractPriceForm
                action={changePriceAction}
                contractId={contract.contract_id}
                currentMrr={contract.mrr_amount}
                currentSeats={contract.seats}
                currency={contract.currency}
                today={today}
              />
            </Card>
            <Card title="They are leaving" titleAs="h3" danger>
              <ContractCancelForm
                action={cancelContractAction}
                contractId={contract.contract_id}
                defaultEnd={monthEnd}
              />
            </Card>
          </aside>
        )}
      </div>
    </>
  );
}
