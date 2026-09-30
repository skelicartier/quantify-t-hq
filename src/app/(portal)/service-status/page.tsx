import Link from "next/link";

import {
  addComponentAction,
  cancelMaintenanceAction,
  openIncidentAction,
  scheduleMaintenanceAction,
} from "@/app/(portal)/service-status/actions";
import { StatusBars } from "@/components/status/status-bars";
import { ComponentForm, MaintenanceForm, OpenIncidentForm } from "@/components/status/status-forms";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Popover } from "@/components/ui/popover";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { STATE_TONES, readStatusBoard, type StatusBoard } from "@/lib/api/status";
import { formatAbsolute } from "@/lib/format";

export const metadata = { title: "Status" };
export const dynamic = "force-dynamic";

/**
 * The status page from the desk's side: each component's state (computed from the open
 * incidents and running maintenance, never set by hand), the incidents being worked, the
 * windows ahead, the history and who is subscribed. The public page shows the same, less
 * the names of who posted.
 */
export default async function ServiceStatusPage() {
  const context = await requireStaff("/service-status");
  let board: StatusBoard | null = null;
  try {
    board = await readStatusBoard(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const canManage = hasCapability(context, "tickets:manage");
  const components = (board?.components ?? []).map((row) => ({ id: row.id, name: row.name }));

  return (
    <>
      <PageHeader
        eyebrow="Desk"
        title="Status"
        description="What customers see on the public status page: each part of the service, the incidents being worked and the maintenance ahead."
        actions={
          canManage && board ? (
            <>
              <Popover label="Add a component">
                <ComponentForm action={addComponentAction} />
              </Popover>
              <Popover label="Schedule maintenance" width="wide">
                <MaintenanceForm
                  action={scheduleMaintenanceAction}
                  components={components}
                  mailReady={board.mail_ready}
                />
              </Popover>
              {components.length > 0 && (
                <Popover label="Report an incident" variant="primary" width="wide">
                  <OpenIncidentForm
                    action={openIncidentAction}
                    components={components}
                    impacts={board.impacts}
                    statuses={board.statuses}
                    mailReady={board.mail_ready}
                  />
                </Popover>
              )}
            </>
          ) : undefined
        }
      />
      {board === null ? (
        <Callout tone="danger" role="alert">
          The status page could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <div className={`status-banner status-banner--${board.overall}`}>
            <strong>{board.overall_label}</strong>
            <span>
              Public page: <Link href="/status">{board.public_url}</Link>
            </span>
          </div>
          <StatGrid columns={4} label="The page">
            <Stat
              label="Open incidents"
              value={board.open_incidents.length}
              tone={board.open_incidents.length ? "danger" : "default"}
            />
            <Stat label="Maintenance ahead" value={board.maintenance.length} />
            <Stat
              label="Subscribers"
              value={board.subscribers.confirmed}
              hint={`${board.subscribers.waiting} waiting to confirm`}
            />
            <Stat label="Components" value={board.components.length} />
          </StatGrid>

          <Section id="open" title="Open incidents">
            {board.open_incidents.length === 0 ? (
              <p className="muted">None. Everything customers can see is running.</p>
            ) : (
              <ul className="ask-list">
                {board.open_incidents.map((incident) => (
                  <li key={incident.id} className="ask-list__item">
                    <div className="ask-list__head">
                      <StatusPill
                        value={incident.status}
                        label={incident.status_label}
                        tone="danger"
                      />
                      <Link href={`/service-status/incidents/${incident.id}`}>
                        {incident.title}
                      </Link>
                      <span className="quiet">
                        · since {formatAbsolute(incident.started_at ?? "")}
                      </span>
                    </div>
                    <p className="clock-line">{incident.updates[0]?.body}</p>
                    <p className="field__hint">
                      {incident.components
                        .map((item) => `${item.name}: ${item.impact_label.toLowerCase()}`)
                        .join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section id="components" title="Components">
            {board.components.length === 0 ? (
              <p className="muted">Add the parts of the service a customer would name.</p>
            ) : (
              <ul className="status-components">
                {board.components.map((component) => (
                  <li key={component.id} className="status-components__item">
                    <div className="status-components__head">
                      <strong>{component.name}</strong>
                      <StatusPill
                        value={component.state}
                        label={component.state_label}
                        tone={STATE_TONES[component.state] ?? "neutral"}
                      />
                    </div>
                    {component.description && (
                      <p className="field__hint">{component.description}</p>
                    )}
                    <StatusBars component={component} />
                  </li>
                ))}
              </ul>
            )}
            <p className="field__hint">{board.bars_note}</p>
          </Section>

          <Section id="maintenance" title="Maintenance ahead">
            <DataTable
              caption="Scheduled and running maintenance"
              columns={[
                { key: "title", label: "What" },
                { key: "when", label: "When" },
                { key: "touches", label: "Touches" },
                { key: "state", label: "State" },
                ...(canManage ? [{ key: "act", label: "Action" }] : []),
              ]}
              isEmpty={board.maintenance.length === 0}
              empty={<p className="muted">Nothing scheduled.</p>}
              columnMenu={false}
            >
              {board.maintenance.map((row) => (
                <tr key={row.id}>
                  <td>{row.title}</td>
                  <td>
                    {formatAbsolute(row.starts_at ?? "")} – {formatAbsolute(row.ends_at ?? "")}
                  </td>
                  <td>{row.components.map((item) => item.name).join(", ")}</td>
                  <td>{row.state === "in_progress" ? "In progress" : "Scheduled"}</td>
                  {canManage && (
                    <td>
                      <ActForm
                        action={cancelMaintenanceAction}
                        hidden={{ maintenance_id: row.id }}
                        act="cancel"
                        label="Cancel"
                      />
                    </td>
                  )}
                </tr>
              ))}
            </DataTable>
          </Section>

          <Section id="history" title="History">
            <DataTable
              caption="Incidents, newest first"
              columns={[
                { key: "title", label: "Incident" },
                { key: "impact", label: "Impact" },
                { key: "started", label: "Started" },
                { key: "resolved", label: "Resolved" },
              ]}
              isEmpty={board.history.length === 0}
              empty={<p className="muted">No incident reported yet.</p>}
            >
              {board.history.map((incident) => (
                <tr key={incident.id}>
                  <td>
                    <Link href={`/service-status/incidents/${incident.id}`}>{incident.title}</Link>
                  </td>
                  <td>{incident.impact === "none" ? "—" : incident.impact}</td>
                  <td>{formatAbsolute(incident.started_at ?? "")}</td>
                  <td>{incident.resolved_at ? formatAbsolute(incident.resolved_at) : "Open"}</td>
                </tr>
              ))}
            </DataTable>
          </Section>
        </div>
      )}
    </>
  );
}
