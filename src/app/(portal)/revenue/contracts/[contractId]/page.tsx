import Link from "next/link";
import { notFound } from "next/navigation";

import {
  cancelContractAction,
  changePriceAction,
  updateContractAction,
} from "@/app/(portal)/revenue/actions";
import { TrendChart, type TrendPoint } from "@/components/charts/trend-chart";
import { PageHeader } from "@/components/shell/page-header";
import { ContractCancelForm, ContractPriceForm } from "@/components/revenue/contract-forms";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { InlineField } from "@/components/ui/inline-field";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
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
import { formatDate, formatMoney, formatMonthShort, formatMrr } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Contract" };
export const dynamic = "force-dynamic";

const MOVEMENT_COLUMNS = [
  { key: "date", label: "Effective" },
  { key: "kind", label: "Movement" },
  { key: "amount", label: "Change", align: "end" as const },
  { key: "note", label: "Note" },
];

const CADENCES = [
  { value: "monthly", label: "Monthly" },
  { value: "annual", label: "Annually" },
];

/** The contract's monthly value after each movement that has taken effect: its shape. */
function valueHistory(movements: ContractDetail["movements"], today: string): TrendPoint[] {
  let running = 0;
  return movements
    .filter((movement) => movement.effective_on && movement.effective_on <= today)
    .sort((a, b) => (a.effective_on ?? "").localeCompare(b.effective_on ?? ""))
    .map((movement) => {
      running += movement.amount;
      return {
        label: formatMonthShort(movement.effective_on),
        title: `${formatDate(movement.effective_on)} · ${MOVEMENT_KIND_LABELS[movement.kind] ?? movement.kind}`,
        value: running,
      };
    });
}

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
  const inline = {
    action: updateContractAction,
    idName: "contract_id",
    id: contract.contract_id,
    readOnly: !canWrite || !active,
  };
  const history = valueHistory(movements, today);

  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/revenue/contracts", label: "Contracts" }]}
        title={contract.company_name || "Contract"}
        status={
          <StatusPill
            value={contract.state}
            label={CONTRACT_STATE_LABELS[contract.state] ?? contract.state}
            tone={contractStateTone(contract.state)}
          />
        }
        readouts={[
          { label: "Monthly", value: formatMrr(contract.mrr_amount, contract.currency) },
          { label: "Plan", value: contract.plan_name || "—" },
          { label: "Seats", value: contract.seats },
          {
            label: "Billed",
            value: contract.billing_cadence === "annual" ? "Annually" : "Monthly",
          },
        ]}
      />
      {contract.state === "ending" && (
        <Callout tone="attention" title={`Ends ${formatDate(contract.ends_on)}`}>
          Notice given ({CANCEL_REASON_LABELS[contract.cancel_reason] ?? contract.cancel_reason}).
          Revenue continues until then; the churn is dated that day.
        </Callout>
      )}
      <RecordGrid
        side={
          <>
            <Properties title="Agreement">
              <Property label="Customer">
                <Link href={`/companies/${contract.company_id}`}>
                  {contract.company_name || "Company"}
                </Link>
              </Property>
              <InlineField
                {...inline}
                name="plan_name"
                label="Plan"
                value={contract.plan_name}
                placeholder="e.g. Professional desk"
              />
              <InlineField
                {...inline}
                name="seats"
                label="Seats"
                type="number"
                value={String(contract.seats)}
              />
              <Property label="Monthly value">
                {formatMrr(contract.mrr_amount, contract.currency)}
                {canWrite && active && (
                  <span className="table-sub">Changes below, with an effective date</span>
                )}
              </Property>
              <InlineField
                {...inline}
                name="billing_cadence"
                label="Billed"
                type="select"
                options={CADENCES}
                value={contract.billing_cadence}
              />
              <Property label="Term">
                {contract.term_months} {contract.term_months === 1 ? "month" : "months"}
              </Property>
              <Property label="Started">{formatDate(contract.starts_on)}</Property>
              {active ? (
                <InlineField
                  {...inline}
                  name="renews_on"
                  label="Renews"
                  type="date"
                  value={contract.renews_on ?? ""}
                  display={contract.renews_on ? formatDate(contract.renews_on) : "Not set"}
                />
              ) : (
                <Property label={contract.state === "ending" ? "Ends" : "Ended"}>
                  {formatDate(contract.ends_on, "—")}
                </Property>
              )}
              {contract.cancel_reason && (
                <Property label="Reason">
                  {CANCEL_REASON_LABELS[contract.cancel_reason] ?? contract.cancel_reason}
                </Property>
              )}
              {contract.deal_id && (
                <Property label="From deal">
                  <Link href={`/deals/${contract.deal_id}`}>Open the deal</Link>
                </Property>
              )}
              <InlineField
                {...inline}
                name="notes"
                label="Notes"
                type="textarea"
                value={contract.notes}
                placeholder="Who signs renewals, what was agreed…"
              />
            </Properties>
            {canWrite && active && (
              <>
                <Card
                  title="Change the price"
                  titleAs="h3"
                  description="An upgrade, a downgrade or a seat change, from a date."
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
              </>
            )}
          </>
        }
      >
        {history.length >= 2 && (
          <RecordSection id="contract-history" title="Monthly value over time">
            <TrendChart
              ariaLabel={`This contract's monthly value after each of ${history.length} movements, now ${formatMrr(contract.mrr_amount, contract.currency)}.`}
              format={(value) => formatMoney(value, contract.currency)}
              points={history}
            />
          </RecordSection>
        )}
        <RecordSection id="contract-movements" title="Revenue movements">
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
                <td className={`data-table__num ${movement.amount < 0 ? "num--down" : "num--up"}`}>
                  {movement.amount > 0 ? "+" : ""}
                  {formatMoney(movement.amount, movement.currency)}
                </td>
                <td>{movement.note || <span className="table-sub">—</span>}</td>
              </tr>
            ))}
          </DataTable>
        </RecordSection>
      </RecordGrid>
    </>
  );
}
