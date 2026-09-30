import Link from "next/link";

import { logRequestAction } from "@/app/(portal)/privacy/actions";
import { ClockPill, RequestStatusPill } from "@/components/privacy/privacy-pills";
import { LogRequestForm } from "@/components/privacy/privacy-forms";
import { PrivacyTabs } from "@/components/privacy/privacy-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Popover } from "@/components/ui/popover";
import { Stat, StatGrid } from "@/components/ui/stat";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCompanies } from "@/lib/api/crm";
import { readPrivacyRequests, type PrivacyRequests } from "@/lib/api/privacy";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Privacy desk" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "ref", label: "Reference" },
  { key: "kind", label: "Asked for" },
  { key: "who", label: "Who" },
  { key: "received", label: "Received" },
  { key: "due", label: "Due" },
  { key: "clock", label: "Clock" },
  { key: "status", label: "Status" },
  { key: "owner", label: "Handled by" },
];

const SCOPES = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
] as const;

type SearchParams = Promise<{ scope?: string }>;

/**
 * Rights requests and complaints, each on its legal clock: the UK month from the latest
 * of receipt, identity and fee, stopped only while scoping, moved to the next working
 * day; complaints acknowledged within 30 days. Soonest deadline first.
 */
export default async function PrivacyPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await requireStaff("/privacy");
  if (!hasCapability(context, "privacy:read")) {
    return (
      <>
        <PageHeader eyebrow="Desk" title="Privacy desk" />
        <Callout tone="neutral">The privacy desk is run by Support, Admins and Owners.</Callout>
      </>
    );
  }
  const { scope: raw } = await searchParams;
  const scope = SCOPES.some((item) => item.value === raw)
    ? (raw as "open" | "closed" | "all")
    : "open";
  const canWrite = hasCapability(context, "privacy:write");
  let page: PrivacyRequests | null = null;
  try {
    page = await readPrivacyRequests(context.token, { scope });
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  let companies: Array<{ id: string; name: string }> = [];
  if (canWrite) {
    try {
      companies = (await readCompanies(context.token)).companies
        .map((row) => ({ id: row.company_id, name: row.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
        throw error;
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Desk"
        title="Privacy desk"
        description="Rights requests and complaints on their legal clocks, breaches on the regulator's 72 hours, what each customer's contract promises, and the sub-processors they are told about."
        actions={
          <>
            <PrivacyTabs current="/privacy" />
            {canWrite && page && (
              <Popover label="Log a request" variant="primary" width="wide">
                <LogRequestForm
                  action={logRequestAction}
                  kinds={page.kinds}
                  regimes={page.regimes}
                  companies={companies}
                />
              </Popover>
            )}
          </>
        }
      />
      {page === null ? (
        <Callout tone="danger" role="alert">
          The privacy desk could not be read just now. This is a read failure, not an empty desk.
        </Callout>
      ) : (
        <div className="page-content">
          <StatGrid columns={4} label="Where the requests stand">
            <Stat
              label="Overdue"
              value={page.stats.overdue}
              hint="Past the legal deadline"
              tone={page.stats.overdue > 0 ? "danger" : "default"}
            />
            <Stat
              label="Due within 7 days"
              value={page.stats.due_soon}
              hint="Open, clock running"
            />
            <Stat
              label="Clock stopped"
              value={page.stats.stopped + page.stats.not_started}
              hint="Scoping, or waiting on identity or a fee"
            />
            <Stat
              label="Complaints to acknowledge"
              value={page.stats.complaints_unacknowledged}
              hint="Within 30 days of receipt"
              tone={page.stats.complaints_unacknowledged > 0 ? "danger" : "default"}
            />
          </StatGrid>

          <Section id="requests" title="Requests and complaints">
            <div className="list-tools">
              <SegmentedLinks
                label="Which requests"
                items={SCOPES.map((item) => ({
                  href: item.value === "open" ? "/privacy" : `/privacy?scope=${item.value}`,
                  label: item.label,
                  current: item.value === scope,
                }))}
              />
            </div>
            <DataTable
              caption="Privacy requests, soonest deadline first"
              columns={COLUMNS}
              isEmpty={page.requests.length === 0}
              empty={
                <p className="muted">
                  {scope === "open" ? "No open requests." : "No requests here."}
                </p>
              }
            >
              {page.requests.map((row) => (
                <tr key={row.id}>
                  <td className="mono nowrap">
                    <Link href={`/privacy/requests/${row.id}`}>{row.reference}</Link>
                  </td>
                  <td>{row.kind_label}</td>
                  <td>
                    {row.requester_name || row.requester_email || "—"}
                    {row.company && <span className="quiet"> · {row.company.name}</span>}
                  </td>
                  <td>{formatDate(row.received_on)}</td>
                  <td>{row.clock.due_on ? formatDate(row.clock.due_on) : "—"}</td>
                  <td>
                    <ClockPill clock={row.clock} complaint={row.kind === "complaint"} />
                  </td>
                  <td>
                    <RequestStatusPill status={row.status} />
                  </td>
                  <td>{row.assignee?.name || "—"}</td>
                </tr>
              ))}
            </DataTable>
          </Section>
        </div>
      )}
    </>
  );
}
