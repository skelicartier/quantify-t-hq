import { FinanceTabs } from "@/components/finance/finance-parts";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readDeferred, type DeferredRevenue } from "@/lib/api/finance";
import { formatDate, formatMoneyExact } from "@/lib/format";

export const metadata = { title: "Revenue earned" };
export const dynamic = "force-dynamic";

const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * Revenue earned from the invoice register, by day of each invoice's service period: what was
 * invoiced, what was earned, and what is still owed in work. The ledger stays in the
 * accounting system; this is the register's own reading, per currency.
 */
export default async function DeferredPage() {
  const context = await requireStaff("/finance/deferred");
  if (!hasCapability(context, "revenue:write")) {
    return (
      <>
        <PageHeader eyebrow="Business" title="Revenue earned" />
        <Callout tone="neutral">Finance is kept by Owners and Admins.</Callout>
      </>
    );
  }
  let report: DeferredRevenue | null = null;
  try {
    report = await readDeferred(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  return (
    <>
      <PageHeader
        eyebrow="Business"
        title="Revenue earned"
        description="Each issued invoice is earned day by day over the period it covers. The balance is what has been invoiced but not yet earned — or, below zero, earned but not yet invoiced. Per currency, never added together; void invoices are left out."
        actions={<FinanceTabs current="/finance/deferred" />}
      />
      {report === null ? (
        <Callout tone="danger" role="alert">
          The invoice register could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <p className="page-note">
            Read from {report.invoices_counted} issued invoice
            {report.invoices_counted === 1 ? "" : "s"}.
          </p>
          {Object.keys(report.schedule).length === 0 && (
            <p className="muted">No issued invoices yet, so nothing has been earned.</p>
          )}
          {Object.entries(report.schedule).map(([currency, rows]) => (
            <Section key={currency} id={`schedule-${currency}`} title={`By month, ${currency}`}>
              <DataTable
                caption={`Invoiced, earned and the balance at each month's end, ${currency}`}
                columns={[
                  { key: "month", label: "Month" },
                  { key: "invoiced", label: "Invoiced", align: "end" as const },
                  { key: "earned", label: "Earned", align: "end" as const },
                  { key: "balance", label: "Balance at month end", align: "end" as const },
                ]}
                isEmpty={rows.length === 0}
                empty={<p className="muted">Nothing.</p>}
                columnMenu={false}
              >
                {rows.map((row) => (
                  <tr key={row.month}>
                    <td>
                      {monthLabel(row.month)}
                      {row.month === report.this_month && (
                        <span className="quiet"> · this month</span>
                      )}
                      {row.month > report.this_month && <span className="quiet"> · ahead</span>}
                    </td>
                    <td className="data-table__num">{formatMoneyExact(row.invoiced, currency)}</td>
                    <td className="data-table__num">
                      {formatMoneyExact(row.recognised, currency)}
                    </td>
                    <td className="data-table__num">{formatMoneyExact(row.balance, currency)}</td>
                  </tr>
                ))}
              </DataTable>
            </Section>
          ))}
          <Section id="deferred" title="Invoices still being earned">
            <DataTable
              caption="Invoices with work still to be done against them, largest first"
              columns={[
                { key: "invoice", label: "Invoice" },
                { key: "period", label: "Covers" },
                { key: "net", label: "Net", align: "end" as const },
                { key: "earned", label: "Earned to date", align: "end" as const },
                { key: "remaining", label: "Still to earn", align: "end" as const },
              ]}
              isEmpty={report.deferred.length === 0}
              empty={<p className="muted">Every issued invoice is fully earned.</p>}
              columnMenu={false}
            >
              {report.deferred.map((item) => (
                <tr key={item.invoice_id}>
                  <td>
                    {item.number}
                    <span className="quiet"> · {item.company_name || "—"}</span>
                  </td>
                  <td>
                    {item.period_start
                      ? `${formatDate(item.period_start)} to ${formatDate(item.period_end, "…")}`
                      : "On issue"}
                  </td>
                  <td className="data-table__num">
                    {formatMoneyExact(item.net_amount, item.currency)}
                  </td>
                  <td className="data-table__num">
                    {formatMoneyExact(item.earned, item.currency)}
                  </td>
                  <td className="data-table__num">
                    {formatMoneyExact(item.remaining, item.currency)}
                  </td>
                </tr>
              ))}
            </DataTable>
          </Section>
        </div>
      )}
    </>
  );
}
