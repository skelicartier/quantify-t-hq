import Link from "next/link";

import { PrivacyTabs } from "@/components/privacy/privacy-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Stat, StatGrid } from "@/components/ui/stat";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCommitments, type CommitmentsList } from "@/lib/api/privacy";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Customer commitments" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "customer", label: "Customer" },
  { key: "contact", label: "Privacy contact" },
  { key: "incident", label: "Incident notice", align: "end" as const },
  { key: "notice", label: "Sub-processor notice", align: "end" as const },
  { key: "audit", label: "Audit rights" },
  { key: "dora", label: "DORA" },
  { key: "flags", label: "Departs from the standard" },
  { key: "reviewed", label: "Reviewed" },
];

const AUDIT: Record<string, string> = {
  none: "Reports only",
  questionnaire: "Questionnaire",
  remote: "Remote",
  onsite: "On-site",
};

const DORA: Record<string, string> = {
  none: "—",
  ict_service: "ICT service",
  critical_important: "Critical or important",
};

/**
 * What every customer's contract promises on privacy: incident notice hours, sub-processor
 * notice and objection windows, audit rights, where data may live, how a DORA firm
 * classifies us. Recorded as the contract says it; departures from the standard flagged.
 */
export default async function CommitmentsPage() {
  const context = await requireStaff("/privacy/commitments");
  if (!hasCapability(context, "privacy:read")) {
    return (
      <>
        <PageHeader eyebrow="Desk" title="Customer commitments" />
        <Callout tone="neutral">The privacy desk is run by Support, Admins and Owners.</Callout>
      </>
    );
  }
  let page: CommitmentsList | null = null;
  try {
    page = await readCommitments(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }

  return (
    <>
      <PageHeader
        eyebrow="Privacy desk"
        title="Customer commitments"
        description="What each contract promises on incidents, sub-processor changes, audits and data location — so a breach or a new vendor reaches every customer inside the time they were promised."
        actions={<PrivacyTabs current="/privacy/commitments" />}
      />
      {page === null ? (
        <Callout tone="danger" role="alert">
          The commitments could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <StatGrid columns={4} label="How complete the record is">
            <Stat
              label="Customers recorded"
              value={`${page.stats.recorded} of ${page.stats.customers}`}
              hint="Contracts in force"
            />
            <Stat
              label="No privacy contact"
              value={page.stats.no_contact}
              hint="Notices cannot be mailed to them"
              tone={page.stats.no_contact > 0 ? "danger" : "default"}
            />
            <Stat
              label="Non-standard"
              value={page.stats.nonstandard}
              hint="A promise beyond the standard contract"
            />
            <Stat label="DORA firms" value={page.stats.dora} hint="Their own clocks run on ours" />
          </StatGrid>
          <Section id="commitments" title="By customer">
            <p className="page-note">
              The standard contract: incidents within {page.standard.incident_notice_hours} hours,
              sub-processor changes {page.standard.subprocessor_notice_days} days ahead, objections
              within {page.standard.objection_window_days} days. Record a customer on their
              company&apos;s Privacy tab.
            </p>
            <DataTable
              caption="Customer commitments"
              columns={COLUMNS}
              isEmpty={page.commitments.length === 0}
              empty={<p className="muted">No customers yet.</p>}
            >
              {page.commitments.map((row) => (
                <tr key={row.company_id}>
                  <td>
                    <Link href={`/companies/${row.company_id}?tab=privacy`}>
                      {row.company_name}
                    </Link>
                    {!row.customer && <span className="quiet"> · no contract in force</span>}
                  </td>
                  <td>{row.recorded ? row.privacy_contact_email || "None" : "Not recorded"}</td>
                  <td className="data-table__num">
                    {row.incident_notice_hours === null ? "—" : `${row.incident_notice_hours}h`}
                  </td>
                  <td className="data-table__num">
                    {row.subprocessor_notice_days === null
                      ? "—"
                      : `${row.subprocessor_notice_days} days`}
                  </td>
                  <td>{row.recorded ? (AUDIT[row.audit_rights] ?? row.audit_rights) : "—"}</td>
                  <td>{DORA[row.dora_classification] ?? row.dora_classification}</td>
                  <td>{row.flags.length ? row.flags.join("; ") : "—"}</td>
                  <td>{formatDate(row.reviewed_on, "—")}</td>
                </tr>
              ))}
            </DataTable>
          </Section>
        </div>
      )}
    </>
  );
}
