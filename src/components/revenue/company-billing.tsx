import Link from "next/link";

import {
  certificateAction,
  recordReceiptAction,
  updateBillingAction,
} from "@/app/(portal)/revenue/receivables/actions";
import { BillingProfileForm, RecordReceiptForm } from "@/components/revenue/receivable-forms";
import { CollectionPill, InvoiceStatusPill } from "@/components/revenue/receivable-pills";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { RowAction } from "@/components/ui/row-action";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import {
  readBilling,
  readInvoices,
  readReceipts,
  type Billing,
  type Invoice,
  type Receipt,
} from "@/lib/api/receivables";
import { formatDate, formatMoney } from "@/lib/format";

const INVOICE_COLUMNS = [
  { key: "number", label: "Invoice" },
  { key: "issued", label: "Issued" },
  { key: "due", label: "Due" },
  { key: "total", label: "Total", align: "end" as const },
  { key: "owed", label: "Outstanding", align: "end" as const },
  { key: "status", label: "Status" },
];

const RECEIPT_COLUMNS = [
  { key: "received", label: "Received" },
  { key: "amount", label: "In the bank", align: "end" as const },
  { key: "withheld", label: "Tax withheld", align: "end" as const },
  { key: "settles", label: "Settles" },
  { key: "unapplied", label: "Unapplied", align: "end" as const },
  { key: "certificate", label: "Certificate" },
];

/**
 * A customer's billing: the profile every invoice to them must follow (and what it is
 * still missing), their invoices, and the money received from them.
 */
export async function CompanyBilling({
  token,
  companyId,
  canWrite,
}: {
  token: string;
  companyId: string;
  canWrite: boolean;
}) {
  let billing: Billing | null = null;
  let invoices: Invoice[] | null = null;
  let receipts: Receipt[] | null = null;
  try {
    [billing, invoices, receipts] = await Promise.all([
      readBilling(token, companyId),
      readInvoices(token, { company_id: companyId }).then((page) => page.invoices),
      readReceipts(token, companyId).then((page) => page.receipts),
    ]);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (billing === null || invoices === null || receipts === null) {
    return (
      <Callout tone="danger" role="alert">
        Billing could not be read just now. This is a read failure, not an empty account.
      </Callout>
    );
  }
  const { profile } = billing;
  const open = invoices.filter((row) => row.status === "open" || row.status === "partially_paid");
  return (
    <div className="page-content">
      {profile.gaps.length > 0 && (
        <Callout tone="attention" title="What an invoice to them would be missing">
          <ul className="gap-list">
            {profile.gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </Callout>
      )}
      <Card title="Invoices" titleAs="h3" description="As the accounting system issued them.">
        <DataTable
          caption="This customer's invoices"
          columns={INVOICE_COLUMNS}
          isEmpty={invoices.length === 0}
          empty={<EmptyState compact title="No invoices recorded" />}
        >
          {invoices.map((row) => (
            <tr key={row.invoice_id}>
              <td>
                <Link href={`/revenue/invoices/${row.invoice_id}`}>{row.number}</Link>
              </td>
              <td>{formatDate(row.issued_on)}</td>
              <td>{formatDate(row.due_on)}</td>
              <td className="data-table__num">{formatMoney(Number(row.gross), row.currency)}</td>
              <td className="data-table__num">
                {formatMoney(Number(row.outstanding), row.currency)}
              </td>
              <td>
                <span className="pill-pair">
                  <InvoiceStatusPill status={row.status} />
                  {(row.status === "open" || row.status === "partially_paid") && (
                    <CollectionPill state={row.collection_state} />
                  )}
                </span>
              </td>
            </tr>
          ))}
        </DataTable>
      </Card>
      <Card title="Money received" titleAs="h3">
        <DataTable
          caption="Receipts from this customer"
          columns={RECEIPT_COLUMNS}
          isEmpty={receipts.length === 0}
          empty={<EmptyState compact title="Nothing received yet" />}
        >
          {receipts.map((receipt) => (
            <tr key={receipt.receipt_id}>
              <td>{formatDate(receipt.received_on)}</td>
              <td className="data-table__num">
                {formatMoney(Number(receipt.amount), receipt.currency)}
              </td>
              <td className="data-table__num">
                {Number(receipt.tax_withheld) > 0
                  ? formatMoney(Number(receipt.tax_withheld), receipt.currency)
                  : "—"}
              </td>
              <td>
                {receipt.allocations.length === 0
                  ? "—"
                  : receipt.allocations.map((item) => item.number).join(", ")}
              </td>
              <td className="data-table__num">
                {Number(receipt.unapplied) > 0
                  ? formatMoney(Number(receipt.unapplied), receipt.currency)
                  : "—"}
              </td>
              <td>
                {Number(receipt.tax_withheld) === 0 ? (
                  "—"
                ) : receipt.certificate_received_on ? (
                  `Received ${formatDate(receipt.certificate_received_on)}`
                ) : canWrite ? (
                  <RowAction
                    action={certificateAction}
                    fields={{ receipt_id: receipt.receipt_id, company_id: companyId }}
                    buttons={[
                      {
                        label: "Certificate in",
                        pendingLabel: "Saving…",
                        className: "btn btn--small btn--ghost",
                      },
                    ]}
                  />
                ) : (
                  "Awaited"
                )}
              </td>
            </tr>
          ))}
        </DataTable>
        {canWrite && (
          <details className="disclosure">
            <summary>Record money received from them</summary>
            <RecordReceiptForm
              action={recordReceiptAction}
              companies={[]}
              fixedCompany={companyId}
              openInvoices={open.map((row) => ({
                invoice_id: row.invoice_id,
                company_id: companyId,
                number: row.number,
                currency: row.currency,
                outstanding: row.outstanding,
                due_on: row.due_on,
              }))}
            />
          </details>
        )}
      </Card>
      <Card
        title="Billing profile"
        titleAs="h3"
        description="Where their invoices go and what each must carry. The accounting system issues the invoice; this is what it needs from us."
      >
        <BillingProfileForm
          action={updateBillingAction}
          companyId={companyId}
          profile={profile}
          treatments={billing.treatments}
          disabled={!canWrite}
        />
      </Card>
    </div>
  );
}
