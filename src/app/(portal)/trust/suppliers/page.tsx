import Link from "next/link";

import { PageHeader } from "@/components/shell/page-header";
import { TrustPill, TrustTabs } from "@/components/trust/trust-parts";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readSuppliers, type SupplierBoard } from "@/lib/api/trust";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Suppliers" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "supplier", label: "Supplier" },
  { key: "service", label: "Service" },
  { key: "tier", label: "Tier" },
  { key: "every", label: "Reviewed every", align: "end" as const },
  { key: "last", label: "Last review" },
  { key: "outcome", label: "Outcome" },
  { key: "next", label: "Next due" },
  { key: "state", label: "State" },
];

/**
 * The sub-processor register seen as suppliers to be checked: each gets a tier by what it
 * holds, the tier sets how often it is reviewed, and each review names its evidence.
 */
export default async function SuppliersPage() {
  const context = await requireStaff("/trust/suppliers");
  if (!hasCapability(context, "audit:read")) {
    return (
      <>
        <PageHeader title="Suppliers" />
        <Callout tone="neutral">The trust registers are kept by Admins and Owners.</Callout>
      </>
    );
  }
  let board: SupplierBoard | null = null;
  try {
    board = await readSuppliers(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }

  return (
    <>
      <PageHeader
        title="Supplier reviews"
        description="Critical suppliers — holding customer data or running the service — are reviewed every year, high every two, standard every three. A supplier still being proposed is reviewed before it goes live. Suppliers are added on the privacy desk's sub-processor register."
        actions={<TrustTabs context={context} current="/trust/suppliers" />}
      />
      {board === null ? (
        <Callout tone="danger" role="alert">
          The supplier reviews could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <Section
            id="suppliers"
            title={
              board.due
                ? `${board.due} review${board.due === 1 ? "" : "s"} owed`
                : "Every review in date"
            }
          >
            <DataTable
              caption="Suppliers, reviews owed first"
              columns={COLUMNS}
              isEmpty={board.suppliers.length === 0}
              empty={
                <p className="muted">
                  No suppliers yet. Add them on the{" "}
                  <Link href="/privacy/subprocessors">sub-processor register</Link>.
                </p>
              }
            >
              {board.suppliers.map((supplier) => (
                <tr key={supplier.subprocessor_id}>
                  <td>
                    <Link href={`/trust/suppliers/${supplier.subprocessor_id}`}>
                      {supplier.legal_name}
                    </Link>
                  </td>
                  <td>{supplier.service || "—"}</td>
                  <td>{supplier.tier.charAt(0).toUpperCase() + supplier.tier.slice(1)}</td>
                  <td className="data-table__num">{supplier.every_months} months</td>
                  <td>
                    {supplier.last_reviewed_on
                      ? `${formatDate(supplier.last_reviewed_on)} · ${supplier.last_reviewer_name}`
                      : "Never"}
                  </td>
                  <td>
                    {supplier.last_outcome ? <TrustPill state={supplier.last_outcome} /> : "—"}
                  </td>
                  <td>
                    {supplier.state === "due"
                      ? supplier.reason
                      : formatDate(supplier.next_due, "—")}
                  </td>
                  <td>
                    <TrustPill state={supplier.state} />
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
