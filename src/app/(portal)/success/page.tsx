import Link from "next/link";

import { SignalList } from "@/components/success/signal-list";
import { SuccessTabs } from "@/components/success/success-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Stat, StatGrid } from "@/components/ui/stat";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readSuccess, type SuccessBoard } from "@/lib/api/success";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata = { title: "Customer success" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "customer", label: "Customer" },
  { key: "seats", label: "Seats in use", align: "end" as const },
  { key: "last", label: "Last sign-in" },
  { key: "renews", label: "Renews" },
  { key: "signals", label: "Signals" },
  { key: "owner", label: "Owner" },
];

/**
 * Every customer with a contract in force: how many of the seats they pay for are used,
 * when anyone last signed in, when they renew, and the signals that match — each with its
 * rule and its evidence. There is no health score: a number summing unlike things hides
 * which one is wrong.
 */
export default async function SuccessPage() {
  const context = await requireStaff("/success");
  let page: SuccessBoard | null = null;
  try {
    page = await readSuccess(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const seesMoney = hasCapability(context, "revenue:read");

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Customer success"
        description="Each customer's seat use, sign-ins and renewal, and the signals that match — each with its rule and its evidence. No score: the signals are read one by one."
        actions={<SuccessTabs current="/success" />}
      />
      {page === null ? (
        <Callout tone="danger" role="alert">
          The customers could not be read just now. This is a read failure, not a quiet book.
        </Callout>
      ) : (
        <div className="page-content">
          <StatGrid columns={4} label="Signals across the book">
            <Stat
              label="Nobody signing in"
              value={page.counts["no_sign_in"] ?? 0}
              hint={`No sign-in for ${page.rules.silent_days} days`}
              tone={(page.counts["no_sign_in"] ?? 0) > 0 ? "danger" : "default"}
            />
            <Stat
              label="Seats going unused"
              value={page.counts["seat_use_low"] ?? 0}
              hint={`Under half signed in within ${page.rules.active_days} days`}
            />
            <Stat
              label="Renewal at risk"
              value={page.counts["renewal_risk"] ?? 0}
              hint={`Within ${page.rules.renewal_days} days, at risk or not called`}
              tone={(page.counts["renewal_risk"] ?? 0) > 0 ? "danger" : "default"}
            />
            <Stat
              label="Near the seat limit"
              value={page.counts["near_limit"] ?? 0}
              hint="Room to grow"
            />
          </StatGrid>
          {(page.counts["unlinked"] ?? 0) > 0 && (
            <Callout tone="attention" compact>
              {page.counts["unlinked"]} customer{page.counts["unlinked"] === 1 ? " has" : "s have"}{" "}
              no product account linked, so their usage cannot be read. Link accounts on the company
              page.
            </Callout>
          )}
          <Section id="customers" title="Customers">
            <DataTable
              caption="Customers with a contract in force, most urgent signal first"
              columns={COLUMNS}
              isEmpty={page.customers.length === 0}
              empty={<p className="muted">No contract in force yet.</p>}
            >
              {page.customers.map((row) => (
                <tr key={row.company.id}>
                  <td>
                    <Link href={`/companies/${row.company.id}?tab=success`}>
                      {row.company.name}
                    </Link>
                    {seesMoney && Object.keys(row.mrr).length > 0 && (
                      <span className="table-sub">
                        {Object.entries(row.mrr)
                          .map(
                            ([currency, amount]) => `${formatMoney(Number(amount), currency)}/mo`,
                          )
                          .join(" · ")}
                      </span>
                    )}
                  </td>
                  <td className="data-table__num">
                    {row.usage.accounts === 0
                      ? "—"
                      : `${row.usage.active_30d} of ${row.usage.seats_paid}`}
                  </td>
                  <td>{row.usage.last_sign_in ? formatDate(row.usage.last_sign_in) : "—"}</td>
                  <td>
                    {formatDate(row.renews_on, "—")}
                    {row.notice_date && row.notice_date !== row.renews_on && (
                      <span className="table-sub">notice by {formatDate(row.notice_date)}</span>
                    )}
                  </td>
                  <td>
                    <SignalList signals={row.signals} compact />
                  </td>
                  <td>{row.owner || "—"}</td>
                </tr>
              ))}
            </DataTable>
          </Section>
        </div>
      )}
    </>
  );
}
