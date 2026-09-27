import Link from "next/link";
import { notFound } from "next/navigation";

import { manageTicketAction, sendMessage } from "@/app/(portal)/support/[ticketId]/actions";
import { PageHeader } from "@/components/shell/page-header";
import { Composer } from "@/components/support/composer";
import { SlaChip } from "@/components/support/sla-chip";
import { TicketControls } from "@/components/support/ticket-controls";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { listStaff } from "@/lib/api/staff";
import {
  listSavedReplies,
  readTicket,
  readTicketContext,
  type SavedReply,
  type Ticket,
  type TicketContext,
} from "@/lib/api/tickets";

export const metadata = { title: "Conversation" };
export const dynamic = "force-dynamic";

type TicketPageProps = { params: Promise<{ ticketId: string }> };

export default async function TicketPage({ params }: TicketPageProps) {
  const { ticketId } = await params;
  const context = await requireStaff(`/support/${ticketId}`);

  let ticket: Ticket;
  try {
    ticket = (await readTicket(context.token, ticketId)).ticket;
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    throw error;
  }

  // The sidebar, the macros and the teammate picker are trimmings: each one arrives
  // if it can and states itself missing if it cannot, and none of them may take the
  // thread down with it.
  let firmContext: TicketContext | null = null;
  let savedReplies: readonly SavedReply[] = [];
  let teammates: { staff_id: string; display_name: string }[] = [];
  try {
    firmContext = await readTicketContext(context.token, ticketId);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  try {
    savedReplies = (await listSavedReplies(context.token)).replies;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (hasCapability(context, "hq:admin")) {
    try {
      teammates = (await listStaff(context.token)).staff
        .filter((member) => member.is_active)
        .map((member) => ({
          staff_id: member.staff_id,
          display_name: member.display_name || member.email,
        }));
    } catch (error) {
      if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
        throw error;
    }
  }

  const canWrite = hasCapability(context, "tickets:write");
  const canManage = hasCapability(context, "tickets:manage");
  const self = {
    staff_id: context.me.staff.staff_id,
    display_name: context.me.staff.display_name || context.me.staff.email,
  };

  return (
    <>
      <PageHeader
        eyebrow="Desk"
        title={ticket.subject}
        breadcrumbs={[{ label: "Support", href: "/support" }]}
        description={
          <>
            {ticket.contact_email || "Unknown sender"} · opened{" "}
            <Timestamp value={ticket.created_at} mode="relative" />
          </>
        }
        meta={
          <>
            <StatusPill
              value={ticket.snoozed ? "snoozed" : ticket.status}
              label={
                ticket.snoozed
                  ? "Snoozed"
                  : ticket.status === "open"
                    ? "Needs an answer"
                    : ticket.status === "pending"
                      ? "Waiting on customer"
                      : "Resolved"
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
            <SlaChip sla={ticket.sla} />
          </>
        }
      />
      <div className="ticket-layout">
        <div className="ticket-layout__thread">
          <ol className="thread" aria-label="Conversation">
            {ticket.messages.map((message) => (
              <li
                key={message.id}
                className={
                  message.visibility === "internal"
                    ? "thread__note thread__note--internal"
                    : message.author === "system"
                      ? "thread__note"
                      : "thread__message"
                }
              >
                <p className="thread__meta">
                  <span className="thread__author">
                    {message.visibility === "internal"
                      ? `${message.author_name} · Internal`
                      : message.author === "customer"
                        ? message.author_name || "Customer"
                        : message.author === "system"
                          ? "System"
                          : message.author_name || "Desk"}
                  </span>
                  <Timestamp value={message.at} mode="both" />
                </p>
                <p className="thread__body">{message.body}</p>
              </li>
            ))}
          </ol>
          {canWrite ? (
            <Composer
              ticketId={ticket.id}
              action={sendMessage}
              savedReplies={savedReplies}
              canManage={canManage}
            />
          ) : (
            <Callout tone="neutral" compact>
              Your role reads the desk without writing to it.
            </Callout>
          )}
        </div>
        <aside className="ticket-layout__side">
          <Card title="Who is asking" titleAs="h3">
            {firmContext === null ? (
              <Callout tone="danger" compact>
                The account card could not be read. Not empty — unavailable.
              </Callout>
            ) : firmContext.account === null ? (
              <p className="side-quiet">No product account matches this sender.</p>
            ) : (
              <KeyValue>
                <KeyValueRow label="Name">{firmContext.account.name || "—"}</KeyValueRow>
                <KeyValueRow label="Email" mono>
                  {firmContext.account.email}
                </KeyValueRow>
                <KeyValueRow label="Plan">{firmContext.account.plan || "—"}</KeyValueRow>
                <KeyValueRow label="Last sign-in">
                  <Timestamp value={firmContext.account.last_login_at} mode="relative" />
                </KeyValueRow>
                <KeyValueRow label="Runs" mono>
                  {`${ticket.app_version || "?"} on ${ticket.platform || "?"}`}
                </KeyValueRow>
              </KeyValue>
            )}
          </Card>
          {firmContext !== null && firmContext.related_tickets.length > 0 && (
            <Card title="Also from this account" titleAs="h3">
              <ul className="side-list">
                {firmContext.related_tickets.map((related) => (
                  <li key={related.id}>
                    <Link href={`/support/${related.id}`}>{related.subject}</Link>
                    <span className="side-quiet"> · {related.status}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {ticket.linked_issue_url && (
            <Card title="Linked issue" titleAs="h3">
              <p>
                <a href={ticket.linked_issue_url} rel="noreferrer noopener" target="_blank">
                  {ticket.linked_issue_url.replace(/^https?:\/\//, "")}
                </a>
              </p>
            </Card>
          )}
          {canManage && (
            <Card title="Run the queue" titleAs="h3">
              <TicketControls
                ticket={ticket}
                action={manageTicketAction}
                teammates={teammates}
                self={self}
              />
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
