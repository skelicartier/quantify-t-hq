import Link from "next/link";

import { logIncidentAction } from "@/app/(portal)/privacy/actions";
import {
  IncidentStatusPill,
  RegulatorPill,
  SeverityPill,
} from "@/components/privacy/privacy-pills";
import { LogIncidentForm } from "@/components/privacy/privacy-forms";
import { PrivacyTabs } from "@/components/privacy/privacy-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Popover } from "@/components/ui/popover";
import { Stat, StatGrid } from "@/components/ui/stat";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readIncidents, type Incidents } from "@/lib/api/privacy";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Incidents" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "ref", label: "Reference" },
  { key: "what", label: "What happened" },
  { key: "severity", label: "Severity" },
  { key: "detected", label: "Detected" },
  { key: "regulator", label: "Regulator" },
  { key: "customers", label: "Customers owed", align: "end" as const },
  { key: "status", label: "Status" },
];

/**
 * The incident and breach register. Every personal-data breach is here whether it was
 * reported or not (UK GDPR Art 33(5)); each shows the regulator's 72 hours from
 * awareness and the customers still owed notice under their contracts.
 */
export default async function IncidentsPage() {
  const context = await requireStaff("/privacy/incidents");
  if (!hasCapability(context, "privacy:read")) {
    return (
      <>
        <PageHeader eyebrow="Desk" title="Incidents" />
        <Callout tone="neutral">The privacy desk is run by Support, Admins and Owners.</Callout>
      </>
    );
  }
  const canWrite = hasCapability(context, "privacy:write");
  let page: Incidents | null = null;
  try {
    page = await readIncidents(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const now = requestNow();

  return (
    <>
      <PageHeader
        eyebrow="Privacy desk"
        title="Incidents"
        description="Every incident, and every personal-data breach whether reported or not, with the regulator's 72 hours and the notice each affected customer is owed."
        actions={
          <>
            <PrivacyTabs current="/privacy/incidents" />
            {canWrite && (
              <Popover label="Log an incident" variant="primary" width="wide">
                <LogIncidentForm action={logIncidentAction} />
              </Popover>
            )}
          </>
        }
      />
      {page === null ? (
        <Callout tone="danger" role="alert">
          The register could not be read just now. This is a read failure, not a quiet week.
        </Callout>
      ) : (
        <div className="page-content">
          <StatGrid columns={4} label="Where the incidents stand">
            <Stat
              label="Open"
              value={page.stats.open}
              tone={page.stats.open > 0 ? "danger" : "default"}
            />
            <Stat
              label="Regulator clock running"
              value={page.stats.regulator_due}
              hint="Not assessed, or notifiable and not yet reported"
              tone={page.stats.regulator_due > 0 ? "danger" : "default"}
            />
            <Stat
              label="Customers owed notice"
              value={page.stats.customers_owed}
              hint="Under their contracts"
            />
            <Stat
              label="Breaches on the register"
              value={page.stats.breaches_logged}
              hint="Personal data involved, all time"
            />
          </StatGrid>
          <Section id="register" title="The register">
            <DataTable
              caption="Incidents, open first, newest first"
              columns={COLUMNS}
              isEmpty={page.incidents.length === 0}
              empty={<p className="muted">Nothing logged.</p>}
            >
              {page.incidents.map((row) => (
                <tr key={row.id}>
                  <td className="mono nowrap">
                    <Link href={`/privacy/incidents/${row.id}`}>{row.reference}</Link>
                  </td>
                  <td>
                    {row.title}
                    <span className="quiet"> · {row.kind_label}</span>
                  </td>
                  <td>
                    <SeverityPill severity={row.severity} />
                  </td>
                  <td>
                    <Timestamp value={row.detected_at} now={now} mode="relative" />
                  </td>
                  <td>
                    <RegulatorPill regulator={row.regulator} />
                  </td>
                  <td className="data-table__num">{row.customers_owed}</td>
                  <td>
                    <IncidentStatusPill status={row.status} />
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
