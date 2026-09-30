import Link from "next/link";
import { notFound } from "next/navigation";

import { postUpdateAction } from "@/app/(portal)/service-status/actions";
import { PostUpdateForm } from "@/components/status/status-forms";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { StatusPill } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readStatusIncident, type StatusIncidentDetail } from "@/lib/api/status";
import { formatAbsolute } from "@/lib/format";

export const metadata = { title: "Status incident" };
export const dynamic = "force-dynamic";

type Params = Promise<{ incidentId: string }>;

/**
 * One incident as customers see it: every public update, what it affects, and — so the desk
 * can tell them it is fixed — the firms whose tickets arrived while it ran.
 */
export default async function StatusIncidentPage({ params }: { params: Params }) {
  const { incidentId } = await params;
  const context = await requireStaff(`/service-status/incidents/${incidentId}`);
  let detail: StatusIncidentDetail | null = null;
  try {
    detail = await readStatusIncident(context.token, incidentId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (detail === null) {
    return (
      <>
        <PageHeader eyebrow="Status" title="Incident" />
        <Callout tone="danger" role="alert">
          This incident could not be read just now.
        </Callout>
      </>
    );
  }
  const { incident } = detail;
  const open = incident.status !== "resolved";
  const canManage = hasCapability(context, "tickets:manage");

  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/service-status", label: "Status" }]}
        title={incident.title}
        status={
          <StatusPill
            value={incident.status}
            label={incident.status_label}
            tone={open ? "danger" : "live"}
          />
        }
        readouts={[
          { label: "Impact", value: incident.impact },
          { label: "Started", value: formatAbsolute(incident.started_at ?? "") },
          {
            label: "Resolved",
            value: incident.resolved_at ? formatAbsolute(incident.resolved_at) : "Open",
          },
        ]}
      />
      <RecordGrid
        side={
          <Properties title="What it affects">
            {incident.components.map((item) => (
              <Property key={item.id} label={item.name}>
                {item.impact_label}
              </Property>
            ))}
          </Properties>
        }
      >
        <RecordSection id="updates" title="Updates, as customers read them">
          <ol className="event-timeline">
            {incident.updates.map((update) => (
              <li key={update.id} className="event-timeline__row">
                <span className="event-timeline__kind">{update.status_label}</span>
                <span className="event-timeline__detail">
                  {update.body}
                  <span className="quiet">
                    {" "}
                    · {update.posted_by || "HQ"} · {formatAbsolute(update.posted_at ?? "")}
                    {update.mailed ? ` · mailed to ${update.mailed}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </RecordSection>
        {canManage && open && (
          <RecordSection id="post" title="Post an update">
            <PostUpdateForm
              action={postUpdateAction}
              incidentId={incident.id}
              components={detail.components}
              impacts={detail.impacts}
              statuses={detail.statuses}
              current={Object.fromEntries(
                incident.components.map((item) => [item.id, item.impact]),
              )}
              currentStatus={incident.status}
              mailReady={detail.mail_ready}
            />
          </RecordSection>
        )}
        <RecordSection id="affected" title="Firms who wrote in while it ran">
          {!detail.affected.searched ? (
            <p className="muted">
              Tickets cannot be searched by when they arrived yet, so this list cannot be drawn.
            </p>
          ) : (
            <DataTable
              caption="Firms whose tickets arrived while the incident ran"
              columns={[
                { key: "firm", label: "Firm" },
                { key: "tickets", label: "Their tickets" },
              ]}
              isEmpty={detail.affected.firms.length === 0}
              empty={<p className="muted">No ticket arrived while it ran.</p>}
              columnMenu={false}
            >
              {detail.affected.firms.map((firm) => (
                <tr key={firm.company_id || firm.company_name}>
                  <td>
                    {firm.company_id ? (
                      <Link href={`/companies/${firm.company_id}`}>{firm.company_name}</Link>
                    ) : (
                      firm.company_name
                    )}
                  </td>
                  <td>
                    {firm.tickets.map((ticket, index) => (
                      <span key={ticket.id}>
                        {index > 0 && ", "}
                        <Link href={`/support/${ticket.id}`}>{ticket.subject || ticket.id}</Link>
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </RecordSection>
      </RecordGrid>
    </>
  );
}
