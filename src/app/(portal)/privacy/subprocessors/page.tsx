import Link from "next/link";

import { addSubprocessorAction } from "@/app/(portal)/privacy/actions";
import { SubprocessorStatusPill } from "@/components/privacy/privacy-pills";
import { AddSubprocessorForm } from "@/components/privacy/privacy-forms";
import { PrivacyTabs } from "@/components/privacy/privacy-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Popover } from "@/components/ui/popover";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readSubprocessors, type Subprocessors } from "@/lib/api/privacy";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Sub-processors" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "name", label: "Sub-processor" },
  { key: "service", label: "Service" },
  { key: "where", label: "Where" },
  { key: "transfer", label: "Transfer safeguard" },
  { key: "status", label: "Status" },
  { key: "since", label: "Since" },
  { key: "notices", label: "Customers told", align: "end" as const },
  { key: "objections", label: "Open objections", align: "end" as const },
];

/**
 * Who processes personal data for us, and the change notices customers are owed before a
 * new one goes live: proposed, told (each customer's objection window running), active,
 * retired. Nothing goes live while a customer is untold or an objection is unsettled.
 */
export default async function SubprocessorsPage() {
  const context = await requireStaff("/privacy/subprocessors");
  if (!hasCapability(context, "privacy:read")) {
    return (
      <>
        <PageHeader eyebrow="Desk" title="Sub-processors" />
        <Callout tone="neutral">The privacy desk is run by Support, Admins and Owners.</Callout>
      </>
    );
  }
  const canWrite = hasCapability(context, "privacy:write");
  let page: Subprocessors | null = null;
  try {
    page = await readSubprocessors(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }

  return (
    <>
      <PageHeader
        eyebrow="Privacy desk"
        title="Sub-processors"
        description="Who handles personal data for us, where, under what transfer safeguard — and the notice every customer gets before a new one goes live."
        actions={
          <>
            <PrivacyTabs current="/privacy/subprocessors" />
            {canWrite && page && (
              <Popover label="Add a sub-processor" variant="primary" width="wide">
                <AddSubprocessorForm action={addSubprocessorAction} transfers={page.transfers} />
              </Popover>
            )}
          </>
        }
      />
      {page === null ? (
        <Callout tone="danger" role="alert">
          The register could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <Section id="register" title="The register">
            <p className="page-note">
              {page.customers} customer{page.customers === 1 ? "" : "s"} with a contract in force
              are told of every change.
            </p>
            <DataTable
              caption="Sub-processors, changes in progress first"
              columns={COLUMNS}
              isEmpty={page.subprocessors.length === 0}
              empty={<p className="muted">Nobody on the register yet.</p>}
            >
              {page.subprocessors.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={`/privacy/subprocessors/${row.id}`}>{row.legal_name}</Link>
                  </td>
                  <td>{row.service || "—"}</td>
                  <td>{row.locations || "—"}</td>
                  <td>{row.transfer_label}</td>
                  <td>
                    <SubprocessorStatusPill status={row.status} />
                  </td>
                  <td>
                    {row.status === "active"
                      ? formatDate(row.activated_on, "—")
                      : row.status === "retired"
                        ? formatDate(row.retired_on, "—")
                        : row.effective_on
                          ? `Earliest ${formatDate(row.effective_on)}`
                          : "—"}
                  </td>
                  <td className="data-table__num">
                    {row.status === "proposed" || row.status === "notice_sent"
                      ? `${row.notices_sent} of ${row.notices_sent + row.customers_unnoticed}`
                      : row.notices_sent || "—"}
                  </td>
                  <td className="data-table__num">{row.open_objections}</td>
                </tr>
              ))}
            </DataTable>
          </Section>
        </div>
      )}
    </>
  );
}
