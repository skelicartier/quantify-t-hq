import Link from "next/link";

import { PageHeader } from "@/components/shell/page-header";
import { SlaChip } from "@/components/support/sla-chip";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireStaff, hasCapability } from "@/lib/access/core";
import { HqApiUnavailableError } from "@/lib/api/core";
import { readQueue, type Queue } from "@/lib/api/tickets";

export const metadata = { title: "Today" };
export const dynamic = "force-dynamic";

/**
 * The attention surface. Each card fills in as its module lands; until then it says
 * honestly what will create its data, because a dashboard of silent zeros teaches
 * people to stop looking at it.
 */
export default async function HomePage() {
  const context = await requireStaff("/home");
  const crm = hasCapability(context, "crm:read");
  const desk = hasCapability(context, "tickets:read");

  let queue: Queue | null = null;
  let queueFailed = false;
  if (desk) {
    try {
      queue = await readQueue(context.token);
    } catch (error) {
      if (!(error instanceof HqApiUnavailableError)) throw error;
      queueFailed = true;
    }
  }
  const attention = (queue?.tickets ?? []).filter(
    (ticket) => ticket.sla.status === "breached" || ticket.sla.status === "at-risk",
  );

  return (
    <>
      <PageHeader eyebrow="Command" title="Today" description="What needs a person, first." />
      <div className="card-grid">
        {desk && (
          <Card
            title="Tickets breaching"
            important={attention.length > 0}
            actions={
              <Link className="btn btn--small" href="/support">
                Open the desk
              </Link>
            }
          >
            {queueFailed ? (
              <Callout tone="danger" compact>
                The desk could not be read — not an empty queue.
              </Callout>
            ) : attention.length === 0 ? (
              <EmptyState
                title="No reply timer is close to breach"
                description={
                  queue
                    ? `${queue.counts.open} waiting on the desk, ${queue.counts.unassigned} unassigned.`
                    : undefined
                }
                compact
              />
            ) : (
              <ul className="attention-list">
                {attention.slice(0, 5).map((ticket) => (
                  <li key={ticket.id}>
                    <Link href={`/support/${ticket.id}`}>{ticket.subject}</Link>
                    <SlaChip sla={ticket.sla} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        <Card title="Meetings today">
          <EmptyState
            title="Nothing scheduled"
            description="Booked demos and calls appear here once the calendar is connected."
            compact
          />
        </Card>
        {crm && (
          <Card title="Needs first reply">
            <EmptyState
              title="No lead is waiting"
              description="Early-access requests land here the moment website intake is connected."
              compact
            />
          </Card>
        )}
        <Card title="Overdue tasks">
          <EmptyState title="Nothing overdue" description="Tasks arrive with the CRM." compact />
        </Card>
        {crm && (
          <Card title="Deals needing attention">
            <EmptyState
              title="Pipeline is empty"
              description="Deals appear when the first lead is qualified."
              compact
            />
          </Card>
        )}
      </div>
      <Callout tone="neutral" className="home-first-run">
        HQ fills module by module — the desk is live; leads, companies and deals come next.{" "}
        <Link href="/me/security">Review your security</Link>.
      </Callout>
    </>
  );
}
