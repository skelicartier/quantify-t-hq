import Link from "next/link";

import {
  recordInvoiceAction,
  recordReceiptAction,
} from "@/app/(portal)/revenue/receivables/actions";
import { RecordInvoiceForm, RecordReceiptForm } from "@/components/revenue/receivable-forms";
import { RevenueTabs } from "@/components/revenue/revenue-tabs";
import { CollectionPill } from "@/components/revenue/receivable-pills";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Popover } from "@/components/ui/popover";
import { Stat, StatGrid } from "@/components/ui/stat";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCompanies } from "@/lib/api/crm";
import { readReceivables, type Receivables } from "@/lib/api/receivables";
import { readContracts } from "@/lib/api/revenue";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata = { title: "Receivables" };
export const dynamic = "force-dynamic";

const WORK_COLUMNS = [
  { key: "invoice", label: "Invoice" },
  { key: "customer", label: "Customer" },
  { key: "due", label: "Due" },
  { key: "late", label: "Days late", align: "end" as const },
  { key: "owed", label: "Outstanding", align: "end" as const },
  { key: "state", label: "Collection" },
  { key: "next", label: "Next reminder" },
];

const SCHEDULE_COLUMNS = [
  { key: "customer", label: "Customer" },
  { key: "plan", label: "Plan" },
  { key: "period", label: "Period" },
  { key: "amount", label: "Amount", align: "end" as const },
];

function money(value: string, currency: string): string {
  return formatMoney(Number(value), currency);
}

/**
 * Money owed to the company and the work of getting it in. HQ records invoices as the
 * accounting system issued them and works the collection; the ledger stays there. Every
 * sum is per currency; nothing adds dollars to pounds.
 */
export default async function ReceivablesPage() {
  const context = await requireStaff("/revenue/receivables");
  if (!hasCapability(context, "revenue:read")) {
    return (
      <>
        <PageHeader eyebrow="Business" title="Receivables" />
        <Callout tone="neutral">Receivables are visible to Sales, Admins and Owners.</Callout>
      </>
    );
  }
  const canWrite = hasCapability(context, "revenue:write");
  let page: Receivables | null = null;
  try {
    page = await readReceivables(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  let companies: Array<{ id: string; name: string }> = [];
  let contracts: Array<{
    contract_id: string;
    company_id: string;
    label: string;
    currency: string;
  }> = [];
  if (canWrite) {
    try {
      companies = (await readCompanies(context.token)).companies
        .map((row) => ({ id: row.company_id, name: row.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      contracts = (await readContracts(context.token, { state: "active" })).contracts.map(
        (row) => ({
          contract_id: row.contract_id,
          company_id: row.company_id,
          label: `${row.plan_name} · ${row.seats} seats · from ${row.starts_on ?? "—"}`,
          currency: row.currency,
        }),
      );
    } catch (error) {
      if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
        throw error;
    }
  }
  const currencies = page ? Object.keys(page.ageing) : [];

  return (
    <>
      <PageHeader
        eyebrow="Business"
        title="Receivables"
        description="Invoices as the accounting system issued them, what is still owed and how late, and the work of collecting it. Every figure is per currency."
        actions={
          <>
            <RevenueTabs current="/revenue/receivables" />
            {canWrite && (
              <>
                <Popover label="Record a receipt" width="wide">
                  <RecordReceiptForm
                    action={recordReceiptAction}
                    companies={companies}
                    openInvoices={(page?.worklist ?? []).map((row) => ({
                      invoice_id: row.invoice_id,
                      company_id: row.company.company_id,
                      number: row.number,
                      currency: row.currency,
                      outstanding: row.outstanding,
                      due_on: row.due_on,
                    }))}
                  />
                </Popover>
                <Popover label="Record an invoice" variant="primary" width="wide">
                  <RecordInvoiceForm
                    action={recordInvoiceAction}
                    companies={companies}
                    contracts={contracts}
                  />
                </Popover>
              </>
            )}
          </>
        }
      />
      {page === null ? (
        <Callout tone="danger" role="alert">
          Receivables could not be read just now. This is a read failure, not nothing owed.
        </Callout>
      ) : (
        <div className="page-content">
          <StatGrid columns={4} label="Collection">
            <Stat
              label="Reminders due"
              value={page.reminders_due}
              tone={page.reminders_due > 0 ? "danger" : "default"}
              hint="Drafted, waiting to be sent"
            />
            <Stat label="Promised" value={page.promised} hint="Reminders paused" />
            <Stat label="Disputed" value={page.disputed} hint="Reminders paused" />
            <Stat
              label="Billed late"
              value={page.billed_late.length}
              tone={page.billed_late.length > 0 ? "danger" : "default"}
              hint="Periods begun, no invoice"
            />
          </StatGrid>

          <Section id="ageing" title="Owed, by how late">
            {currencies.length === 0 ? (
              <EmptyState
                compact
                title={page.invoices === 0 ? "No invoices recorded yet" : "Nothing is owed"}
                description={
                  page.invoices === 0
                    ? "Record invoices as the accounting system issues them; ageing and reminders start from there."
                    : undefined
                }
              />
            ) : (
              <DataTable
                caption="Outstanding by days past due, per currency"
                columns={[
                  { key: "currency", label: "Currency" },
                  ...page.buckets.map((bucket) => ({
                    key: bucket.key,
                    label: bucket.label,
                    align: "end" as const,
                  })),
                  { key: "total", label: "All", align: "end" as const },
                ]}
              >
                {currencies.map((currency) => (
                  <tr key={currency}>
                    <td className="mono">{currency}</td>
                    {page.buckets.map((bucket) => (
                      <td key={bucket.key} className="data-table__num">
                        {money(page.ageing[currency]?.[bucket.key] ?? "0", currency)}
                      </td>
                    ))}
                    <td className="data-table__num">
                      <strong>{money(page.ageing[currency]?.total ?? "0", currency)}</strong>
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
            {Object.keys(page.withheld_awaiting_certificate).length > 0 && (
              <Callout tone="attention" compact>
                Tax withheld and still waiting on its certificate:{" "}
                {Object.entries(page.withheld_awaiting_certificate)
                  .map(([currency, amount]) => money(amount, currency))
                  .join(", ")}
                . Without the certificate the credit is lost; record it on the receipt when it
                arrives.
              </Callout>
            )}
          </Section>

          <Section id="worklist" title="Collections worklist">
            <p className="page-note">
              Worst first: what is owed times how late. Reminders go at a week before the due date,
              on it, and 7, 14 and 30 days after — each drafted for you to read and send.
            </p>
            <DataTable
              caption="Open invoices, worst first"
              columns={WORK_COLUMNS}
              isEmpty={page.worklist.length === 0}
              empty={<EmptyState compact title="Nothing is owed" />}
            >
              {page.worklist.map((row) => (
                <tr key={row.invoice_id}>
                  <td>
                    <Link href={`/revenue/invoices/${row.invoice_id}`}>{row.number}</Link>
                  </td>
                  <td>
                    <Link href={`/companies/${row.company.company_id}`}>{row.company.name}</Link>
                  </td>
                  <td>{formatDate(row.due_on)}</td>
                  <td className="data-table__num">
                    {row.days_past_due > 0 ? row.days_past_due : "—"}
                  </td>
                  <td className="data-table__num">{money(row.outstanding, row.currency)}</td>
                  <td>
                    <CollectionPill state={row.collection_state} />
                  </td>
                  <td>
                    {row.next_reminder
                      ? row.next_reminder.due_now
                        ? "Due now"
                        : formatDate(row.next_reminder.on)
                      : "—"}
                  </td>
                </tr>
              ))}
            </DataTable>
          </Section>

          <Section id="billed-late" title="Billed late">
            <p className="page-note">
              {page.tracked_from
                ? `Contract periods that began with no invoice recorded, counted from ${formatDate(page.tracked_from)} — when invoices began to be recorded here.`
                : "Nothing can be called late until invoices are recorded here; the first one starts the count."}
            </p>
            <DataTable
              caption="Periods begun with no invoice recorded"
              columns={[
                ...SCHEDULE_COLUMNS,
                { key: "late", label: "Days late", align: "end" as const },
              ]}
              isEmpty={page.billed_late.length === 0}
              empty={<p className="muted">None.</p>}
            >
              {page.billed_late.map((item) => (
                <tr key={`${item.contract_id}-${item.period_start}`}>
                  <td>
                    <Link href={`/companies/${item.company_id}`}>{item.company_name}</Link>
                  </td>
                  <td>{item.plan_name}</td>
                  <td>
                    {formatDate(item.period_start)} – {formatDate(item.period_end)}
                  </td>
                  <td className="data-table__num">{money(item.amount, item.currency)}</td>
                  <td className="data-table__num">{item.days_late ?? "—"}</td>
                </tr>
              ))}
            </DataTable>
          </Section>

          <Section id="to-bill" title="To bill in the next 30 days">
            <p className="page-note">From each active contract&apos;s cadence and price.</p>
            <DataTable
              caption="Contract periods starting in the next 30 days"
              columns={SCHEDULE_COLUMNS}
              isEmpty={page.to_bill.length === 0}
              empty={<p className="muted">Nothing starts in the next 30 days.</p>}
            >
              {page.to_bill.map((item) => (
                <tr key={`${item.contract_id}-${item.period_start}`}>
                  <td>
                    <Link href={`/companies/${item.company_id}`}>{item.company_name}</Link>
                  </td>
                  <td>{item.plan_name}</td>
                  <td>
                    {formatDate(item.period_start)} – {formatDate(item.period_end)}
                  </td>
                  <td className="data-table__num">{money(item.amount, item.currency)}</td>
                </tr>
              ))}
            </DataTable>
          </Section>
        </div>
      )}
    </>
  );
}
