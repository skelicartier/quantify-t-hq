import Link from "next/link";

import { PageHeader } from "@/components/shell/page-header";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { SlaChip } from "@/components/support/sla-chip";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readQueue, type Queue } from "@/lib/api/tickets";
import { firstSearchValue as firstParam } from "@/lib/search-params";

export const metadata = { title: "Support" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "conversation", label: "Conversation" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "sla", label: "Reply timer" },
  { key: "assignee", label: "Assignee" },
  { key: "last", label: "Last message" },
];

const STATUS_LABELS: Record<string, string> = {
  "": "Everything",
  open: "Needs an answer",
  pending: "Waiting on customer",
  snoozed: "Snoozed",
  resolved: "Resolved",
};

type SupportPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SupportPage({ searchParams }: SupportPageProps) {
  const context = await requireStaff("/support");
  const parameters = await searchParams;
  const filters = {
    status: firstParam(parameters.status) ?? "",
    priority: firstParam(parameters.priority) ?? "",
    assignee: firstParam(parameters.assignee) ?? "",
    tag: firstParam(parameters.tag) ?? "",
    sla: firstParam(parameters.sla) ?? "",
    q: firstParam(parameters.q) ?? "",
  };
  let queue: Queue | null = null;
  try {
    queue = await readQueue(context.token, filters);
  } catch (error) {
    // A refusal (a throttle on the 30-second refresh, a capability change) is a
    // failed read like an outage: the queue says so instead of the error screen.
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const canManage = hasCapability(context, "tickets:manage");

  const filterLink = (name: string, value: string) => {
    const next = new URLSearchParams();
    for (const [key, current] of Object.entries(filters)) {
      const chosen = key === name ? value : current;
      if (chosen) next.set(key, chosen);
    }
    const rendered = next.toString();
    return rendered ? `/support?${rendered}` : "/support";
  };

  return (
    <>
      <PageHeader
        eyebrow="Desk"
        title="Support"
        description="Customers file from the desktop app; everything lands here. Breaches sort first."
        actions={
          canManage ? (
            <Link className="btn btn--small" href="/support/replies">
              Saved replies
            </Link>
          ) : undefined
        }
      />
      <LiveRefresh intervalSeconds={30} label="Support queue" />
      {queue === null ? (
        <Callout tone="danger" role="alert">
          The queue could not be read just now. This is a read failure, not an empty desk — it
          retries on the next refresh.
        </Callout>
      ) : (
        <>
          <StatGrid columns={4} label="Desk state">
            <Stat label="Needs an answer" value={queue.counts.open} />
            <Stat
              label="Breaching"
              value={queue.counts.breached}
              tone={queue.counts.breached > 0 ? "danger" : "default"}
            />
            <Stat label="At risk" value={queue.counts.at_risk} />
            <Stat
              label="Unassigned"
              value={queue.counts.unassigned}
              hint={`${queue.counts.unread} unread`}
            />
          </StatGrid>

          <nav className="filter-strip" aria-label="Queue filters">
            <span className="eyebrow">Show</span>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <Link
                key={value || "all"}
                href={filterLink("status", value)}
                aria-current={filters.status === value ? "page" : undefined}
              >
                {label}
              </Link>
            ))}
            <span className="filter-strip__divider" aria-hidden="true" />
            <span className="eyebrow">Timer</span>
            {["", "breached", "at-risk"].map((value) => (
              <Link
                key={value || "any"}
                href={filterLink("sla", value)}
                aria-current={filters.sla === value ? "page" : undefined}
              >
                {value === "" ? "Any" : value === "breached" ? "Breached" : "At risk"}
              </Link>
            ))}
            <span className="filter-strip__divider" aria-hidden="true" />
            <Link
              href={filterLink("assignee", filters.assignee === "unassigned" ? "" : "unassigned")}
              aria-current={filters.assignee === "unassigned" ? "page" : undefined}
            >
              Unassigned only
            </Link>
          </nav>

          <DataTable
            caption="Support queue"
            columns={COLUMNS}
            isEmpty={queue.tickets.length === 0}
            empty={
              <EmptyState
                title="Nothing matches"
                description={
                  Object.values(filters).some(Boolean)
                    ? "No conversation matches these filters."
                    : "The desk is clear. Customers file tickets from the desktop app; they land here the moment they do."
                }
              />
            }
          >
            {queue.tickets.map((ticket) => (
              <tr key={ticket.id}>
                <td>
                  <Link className="table-title" href={`/support/${ticket.id}`}>
                    {ticket.unread && (
                      <span className="unread-dot">
                        <span className="sr-only">Unread. </span>
                      </span>
                    )}
                    {ticket.subject}
                  </Link>
                  <span className="table-sub">
                    {ticket.contact_email || "Unknown sender"} · {ticket.message_count}{" "}
                    {ticket.message_count === 1 ? "message" : "messages"}
                    {ticket.notes_count > 0 && ` · ${ticket.notes_count} internal`}
                    {ticket.tags.length > 0 && ` · ${ticket.tags.join(", ")}`}
                  </span>
                </td>
                <td>
                  <StatusPill
                    value={ticket.snoozed ? "snoozed" : ticket.status}
                    label={
                      ticket.snoozed ? "Snoozed" : (STATUS_LABELS[ticket.status] ?? ticket.status)
                    }
                    tone={
                      ticket.snoozed
                        ? "neutral"
                        : ticket.status === "open"
                          ? "attention"
                          : ticket.status === "resolved"
                            ? "live"
                            : "neutral"
                    }
                  />
                </td>
                <td>
                  <StatusPill
                    value={ticket.priority}
                    label={ticket.priority}
                    tone={
                      ticket.priority === "urgent"
                        ? "danger"
                        : ticket.priority === "high"
                          ? "attention"
                          : "neutral"
                    }
                  />
                </td>
                <td>
                  <SlaChip sla={ticket.sla} />
                </td>
                <td>{ticket.assignee_name || <span className="table-sub">Unassigned</span>}</td>
                <td>
                  <Timestamp value={ticket.last_at} mode="relative" />
                  <span className="table-sub">
                    {ticket.last_author === "customer" ? " from them" : " from the desk"}
                  </span>
                </td>
              </tr>
            ))}
          </DataTable>
        </>
      )}
    </>
  );
}
