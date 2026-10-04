import { TicketArticles } from "@/components/help/ticket-articles";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  followTicketAction,
  manageTicketAction,
  mergeTicketAction,
  sendMessage,
} from "@/app/(portal)/support/[ticketId]/actions";
import { DocumentTools } from "@/components/documents/document-tools";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { AiReplyDraft, AiTriage } from "@/components/ai/ai-assist";
import {
  aiFeedbackAction,
  applyTriageAction,
  draftReplyAction,
  triageAction,
} from "@/app/(portal)/_actions/ai";
import { Composer } from "@/components/support/composer";
import { DeskKeys } from "@/components/support/desk-keys";
import { MergeForm } from "@/components/support/merge-form";
import { SlaChip } from "@/components/support/sla-chip";
import { TicketControls } from "@/components/support/ticket-controls";
import { Callout } from "@/components/ui/callout";
import { Properties, Property } from "@/components/ui/record-shell";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import { TableKeys } from "@/components/ui/table-keys";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, type StaffContext } from "@/lib/access/core";
import { RecordHistory } from "@/components/crm/record-history";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { directoryOrNull, listStaff } from "@/lib/api/staff";
import {
  listSavedReplies,
  readQueue,
  readTicket,
  readTicketContext,
  type Queue,
  type SavedReply,
  type Ticket,
  type TicketContext,
  type TicketSummary,
} from "@/lib/api/tickets";
import { requestNow } from "@/lib/request-time";

export type DeskFilters = {
  view: string;
  sla: string;
  assignee: string;
  /** "1" to show only the conversations this person follows. */
  following: string;
  q: string;
};

/** The queue's sections, Front's Open / Later / Done made specific to this desk. */
const VIEWS: ReadonlyArray<{ key: string; label: string; status: string }> = [
  { key: "open", label: "Needs an answer", status: "open" },
  { key: "waiting", label: "Waiting", status: "pending" },
  { key: "later", label: "Snoozed", status: "snoozed" },
  { key: "done", label: "Resolved", status: "resolved" },
  { key: "all", label: "Everything", status: "" },
];

const STATUS_WORDS: Record<string, string> = {
  open: "Needs an answer",
  pending: "Waiting on customer",
  resolved: "Resolved",
};

function statusTone(ticket: TicketSummary): "attention" | "live" | "neutral" {
  if (ticket.snoozed) return "neutral";
  if (ticket.status === "open") return "attention";
  if (ticket.status === "resolved") return "live";
  return "neutral";
}

/** "Followed by A, B" when the names are known, else how many. */
function followersLine(
  followers: readonly string[],
  teammates: readonly { staff_id: string; display_name: string }[],
  self: { staff_id: string; display_name: string },
): string {
  const names = followers.map((id) => {
    if (id === self.staff_id) return "you";
    return teammates.find((member) => member.staff_id === id)?.display_name ?? null;
  });
  if (names.every((name) => name !== null)) {
    return `Followed by ${names.join(", ")}`;
  }
  const others = followers.filter((id) => id !== self.staff_id).length;
  if (others === 0) return "Followed by you";
  return `Followed by ${names.includes("you") ? "you and " : ""}${others} ${others === 1 ? "other" : "others"}`;
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase() || "?";
}

function queueHref(
  filters: DeskFilters,
  selected: string | null,
  patch: Partial<DeskFilters>,
): string {
  const next = { ...filters, ...patch };
  const query = new URLSearchParams();
  if (next.view && next.view !== "open") query.set("view", next.view);
  if (next.sla) query.set("sla", next.sla);
  if (next.assignee) query.set("assignee", next.assignee);
  if (next.following) query.set("following", "1");
  if (next.q) query.set("q", next.q);
  const base = selected ? `/support/${selected}` : "/support";
  const rendered = query.toString();
  return rendered ? `${base}?${rendered}` : base;
}

type DeskProps = {
  context: StaffContext;
  filters: DeskFilters;
  /** The conversation open in the middle pane, if any. */
  selected: string | null;
};

/**
 * The desk as one workspace: the queue on the left, the conversation in the middle,
 * the customer on the right. Filters are URL states, so a view is a link and a
 * refresh keeps the place; the selected conversation is the path.
 */
export async function Desk({ context, filters, selected }: DeskProps) {
  const now = requestNow();
  const view = VIEWS.find((candidate) => candidate.key === filters.view) ?? VIEWS[0]!;
  const canWrite = hasCapability(context, "tickets:write");
  const canManage = hasCapability(context, "tickets:manage");

  let queue: Queue | null = null;
  try {
    queue = await readQueue(context.token, {
      status: view.status,
      sla: filters.sla,
      assignee: filters.assignee === "mine" ? context.me.staff.staff_id : filters.assignee,
      following: filters.following,
      q: filters.q,
    });
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }

  let ticket: Ticket | null = null;
  let firmContext: TicketContext | null = null;
  let savedReplies: readonly SavedReply[] = [];
  let teammates: { staff_id: string; display_name: string }[] = [];
  if (selected) {
    try {
      ticket = (await readTicket(context.token, selected)).ticket;
    } catch (error) {
      if (error instanceof HqApiRequestError && error.status === 404) notFound();
      if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
        throw error;
    }
    if (ticket) {
      try {
        firmContext = await readTicketContext(context.token, selected);
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
    }
  }

  const self = {
    staff_id: context.me.staff.staff_id,
    display_name: context.me.staff.display_name || context.me.staff.email,
  };
  // What a saved reply's variables become for this ticket.
  const requesterName =
    firmContext?.account?.name || (ticket?.contact_email ?? "").split("@")[0] || "";
  const replyVariables = {
    name: requesterName,
    first_name: requesterName.split(/[\s.]+/)[0] ?? "",
    email: ticket?.contact_email ?? "",
    plan: firmContext?.account?.plan ?? "",
    me: self.display_name,
  };
  const inADay = new Date(now + 24 * 60 * 60 * 1000).toISOString().slice(0, 16);

  return (
    <div className={ticket ? "desk desk--open" : "desk"}>
      <section className="desk__queue" aria-label="Queue">
        <TableKeys />
        <header className="desk__queue-head">
          <nav className="desk__views" aria-label="Queue sections">
            {VIEWS.map((candidate) => {
              const count =
                queue === null
                  ? null
                  : candidate.key === "open"
                    ? queue.counts.open
                    : candidate.key === "waiting"
                      ? queue.counts.pending
                      : candidate.key === "later"
                        ? queue.counts.snoozed
                        : candidate.key === "done"
                          ? queue.counts.resolved
                          : null;
              return (
                <Link
                  key={candidate.key}
                  href={queueHref(filters, selected, { view: candidate.key })}
                  aria-current={view.key === candidate.key ? "page" : undefined}
                >
                  {candidate.label}
                  {count !== null && <span className="desk__view-count">{count}</span>}
                </Link>
              );
            })}
          </nav>
          <form
            className="desk__search"
            action={selected ? `/support/${selected}` : "/support"}
            role="search"
          >
            {filters.view !== "open" && <input type="hidden" name="view" value={filters.view} />}
            {filters.sla && <input type="hidden" name="sla" value={filters.sla} />}
            {filters.assignee && <input type="hidden" name="assignee" value={filters.assignee} />}
            {filters.following && <input type="hidden" name="following" value="1" />}
            <label className="sr-only" htmlFor="desk-q">
              Search the queue
            </label>
            <input
              id="desk-q"
              className="input input--small"
              name="q"
              defaultValue={filters.q}
              placeholder="Search subject or sender"
            />
          </form>
          {selected === null && (
            <div className="desk__tools">
              <DocumentTools context={context} kind="tickets" returnPath="/support" />
            </div>
          )}
          <div className="desk__chips" aria-label="Queue filters">
            <Link
              href={queueHref(filters, selected, {
                sla: filters.sla === "breached" ? "" : "breached",
              })}
              aria-current={filters.sla === "breached" ? "page" : undefined}
            >
              Breached{queue ? ` ${queue.counts.breached}` : ""}
            </Link>
            <Link
              href={queueHref(filters, selected, {
                sla: filters.sla === "at-risk" ? "" : "at-risk",
              })}
              aria-current={filters.sla === "at-risk" ? "page" : undefined}
            >
              At risk{queue ? ` ${queue.counts.at_risk}` : ""}
            </Link>
            <Link
              href={queueHref(filters, selected, {
                assignee: filters.assignee === "unassigned" ? "" : "unassigned",
              })}
              aria-current={filters.assignee === "unassigned" ? "page" : undefined}
            >
              Unassigned{queue ? ` ${queue.counts.unassigned}` : ""}
            </Link>
            <Link
              href={queueHref(filters, selected, {
                assignee: filters.assignee === "mine" ? "" : "mine",
              })}
              aria-current={filters.assignee === "mine" ? "page" : undefined}
            >
              Mine
            </Link>
            <Link
              href={queueHref(filters, selected, {
                following: filters.following ? "" : "1",
                view: filters.following ? filters.view : "all",
              })}
              aria-current={filters.following ? "page" : undefined}
            >
              Following
            </Link>
          </div>
        </header>
        <div className="desk__queue-meta">
          <LiveRefresh intervalSeconds={30} label="Queue" />
          {canManage && (
            <Link className="desk__replies-link" href="/support/replies">
              Saved replies
            </Link>
          )}
        </div>
        {queue === null ? (
          <Callout tone="danger" role="alert" compact>
            The queue could not be read. This is a read failure, not an empty desk — it retries on
            the next refresh.
          </Callout>
        ) : queue.tickets.length === 0 ? (
          <p className="desk__empty">
            {filters.q || filters.sla || filters.assignee || filters.following
              ? "No conversation matches these filters."
              : view.key === "open"
                ? "Nothing needs an answer."
                : "Nothing here."}
          </p>
        ) : (
          <ol className="queue" aria-label="Conversations">
            {queue.tickets.map((row) => (
              <li key={row.id}>
                <Link
                  className={row.id === selected ? "queue__row queue__row--current" : "queue__row"}
                  href={queueHref(filters, row.id, {})}
                  aria-current={row.id === selected ? "page" : undefined}
                  data-nav-row=""
                >
                  <span className="queue__mark" aria-hidden="true">
                    {row.unread && <span className="unread-dot" />}
                  </span>
                  <span className="queue__main">
                    <span className="queue__top">
                      <span
                        className={
                          row.unread ? "queue__subject queue__subject--unread" : "queue__subject"
                        }
                      >
                        {row.unread && <span className="sr-only">Unread. </span>}
                        {row.subject}
                      </span>
                      <span className="queue__right">
                        {row.assignee_name ? (
                          <span className="queue__assignee" title={row.assignee_name}>
                            {initials(row.assignee_name)}
                          </span>
                        ) : (
                          <span
                            className="queue__assignee queue__assignee--none"
                            title="Unassigned"
                          >
                            –
                          </span>
                        )}
                        <span className="queue__age">
                          <Timestamp value={row.last_at} now={now} mode="relative" />
                        </span>
                      </span>
                    </span>
                    <span className="queue__bottom">
                      <span className="queue__sender">{row.contact_email || "Unknown sender"}</span>
                      {row.priority === "urgent" || row.priority === "high" ? (
                        <span className={`queue__priority queue__priority--${row.priority}`}>
                          {row.priority}
                        </span>
                      ) : null}
                      <SlaChip sla={row.sla} />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="desk__thread" aria-label="Conversation">
        {ticket === null ? (
          selected ? (
            <div className="desk__blank">
              <p>This conversation could not be read just now.</p>
            </div>
          ) : (
            <div className="desk__blank">
              <p className="desk__blank-title">Pick a conversation</p>
              <p>
                <kbd className="keycap">j</kbd> <kbd className="keycap">k</kbd> move down the queue,{" "}
                <kbd className="keycap">↵</kbd> opens.
              </p>
              {queue && (
                <p className="desk__blank-counts">
                  {queue.counts.open} need an answer · {queue.counts.breached} breaching ·{" "}
                  {queue.counts.unassigned} unassigned
                </p>
              )}
            </div>
          )
        ) : (
          <>
            <header className="convo-head">
              <div className="convo-head__lead">
                <h1 className="convo-head__title">{ticket.subject}</h1>
                <p className="convo-head__sub">
                  {ticket.contact_email || "Unknown sender"} · opened{" "}
                  <Timestamp value={ticket.created_at} now={now} mode="relative" /> ·{" "}
                  {ticket.message_count} {ticket.message_count === 1 ? "message" : "messages"}
                </p>
              </div>
              <div className="convo-head__chips">
                <StatusPill
                  value={ticket.snoozed ? "snoozed" : ticket.status}
                  label={
                    ticket.snoozed ? "Snoozed" : (STATUS_WORDS[ticket.status] ?? ticket.status)
                  }
                  tone={statusTone(ticket)}
                />
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
                <SlaChip sla={ticket.sla} />
                {ticket.reopened_count > 0 && (
                  <StatusPill
                    value="reopened"
                    label={
                      ticket.reopened_count === 1
                        ? "Reopened once"
                        : `Reopened ${ticket.reopened_count} times`
                    }
                    tone="attention"
                  />
                )}
                <span className="convo-head__assignee">
                  {ticket.assignee_name ? ticket.assignee_name : "Unassigned"}
                </span>
                {ticket.tags.map((tag) => (
                  <span key={tag} className="tag">
                    {tag}
                  </span>
                ))}
                {ticket.followers.length > 0 && (
                  <span className="convo-head__followers">
                    {followersLine(ticket.followers, teammates, self)}
                  </span>
                )}
              </div>
              <div className="convo-head__actions">
                <RowAction
                  action={followTicketAction}
                  fields={{ ticket_id: ticket.id, following: ticket.following ? "0" : "1" }}
                  buttons={[
                    {
                      id: "ticket-follow",
                      label: ticket.following ? "Following" : "Follow",
                      className: ticket.following
                        ? "btn btn--small btn--follow-on"
                        : "btn btn--small btn--ghost",
                      ariaPressed: ticket.following,
                      ariaLabel: ticket.following
                        ? "Stop following this conversation"
                        : "Follow this conversation",
                      pendingLabel: ticket.following ? "Leaving…" : "Following…",
                    },
                  ]}
                />
                {canManage && (
                  <>
                    {!ticket.assignee_staff_id && (
                      <RowAction
                        action={manageTicketAction}
                        fields={{ ticket_id: ticket.id, assignee_staff_id: self.staff_id }}
                        buttons={[
                          {
                            label: "Take it",
                            className: "btn btn--small",
                            pendingLabel: "Taking…",
                          },
                        ]}
                      />
                    )}
                    {ticket.status !== "resolved" && (
                      <RowAction
                        action={manageTicketAction}
                        fields={{ ticket_id: ticket.id, snoozed_until: inADay }}
                        buttons={[
                          { label: "Snooze a day", className: "btn btn--small btn--ghost" },
                        ]}
                      />
                    )}
                    {ticket.status !== "resolved" ? (
                      <RowAction
                        action={manageTicketAction}
                        fields={{ ticket_id: ticket.id, status: "resolved" }}
                        buttons={[
                          {
                            label: "Resolve",
                            className: "btn btn--small btn--primary",
                            pendingLabel: "Resolving…",
                          },
                        ]}
                      />
                    ) : (
                      <RowAction
                        action={manageTicketAction}
                        fields={{ ticket_id: ticket.id, status: "open" }}
                        buttons={[{ label: "Reopen", className: "btn btn--small" }]}
                      />
                    )}
                  </>
                )}
              </div>
            </header>
            <ol className="thread" aria-label="Messages">
              {ticket.messages.map((message) => (
                <li
                  key={message.id}
                  className={
                    message.visibility === "internal"
                      ? "thread__note thread__note--internal"
                      : message.author === "system"
                        ? "thread__note"
                        : message.author === "customer"
                          ? "thread__message thread__message--customer"
                          : "thread__message"
                  }
                >
                  <p className="thread__meta">
                    <span className="thread__author">
                      {message.visibility === "internal"
                        ? `${message.author_name} · Internal note`
                        : message.author === "customer"
                          ? message.author_name || "Customer"
                          : message.author === "system"
                            ? "System"
                            : message.author_name || "Desk"}
                    </span>
                    <Timestamp value={message.at} now={now} mode="both" />
                  </p>
                  <p className="thread__body">{message.body}</p>
                </li>
              ))}
            </ol>
            <div className="desk__composer">
              {canWrite ? (
                <>
                  <DeskKeys />
                  {context.me.ai?.features.includes("reply_draft") && (
                    <AiReplyDraft
                      ticketId={ticket.id}
                      action={draftReplyAction}
                      feedback={aiFeedbackAction}
                    />
                  )}
                  <Composer
                    ticketId={ticket.id}
                    action={sendMessage}
                    savedReplies={savedReplies}
                    variables={replyVariables}
                  />
                </>
              ) : (
                <Callout tone="neutral" compact>
                  Your role reads the desk without writing to it.
                </Callout>
              )}
            </div>
          </>
        )}
      </section>

      {ticket && (
        <aside className="desk__context" aria-label="Customer and controls">
          {canWrite && context.me.ai?.features.includes("triage") && (
            <section className="props" aria-label="Suggested filing">
              <h2 className="props__title">Filing</h2>
              <AiTriage
                ticketId={ticket.id}
                action={triageAction}
                apply={applyTriageAction}
                feedback={aiFeedbackAction}
              />
            </section>
          )}
          <Properties title="Who is asking">
            {firmContext === null ? (
              <Property label="Account">Could not be read. Not empty — unavailable.</Property>
            ) : firmContext.account === null ? (
              <Property label="Account">No product account matches this sender.</Property>
            ) : (
              <>
                <Property label="Name">{firmContext.account.name || "—"}</Property>
                <Property label="Email" mono>
                  {firmContext.account.email}
                </Property>
                <Property label="Plan">{firmContext.account.plan || "—"}</Property>
                <Property label="Last sign-in">
                  <Timestamp value={firmContext.account.last_login_at} now={now} mode="relative" />
                </Property>
              </>
            )}
            <Property label="Runs" mono>
              {`${ticket.app_version || "version not reported"} on ${ticket.platform || "platform not reported"}`}
            </Property>
            {ticket.linked_issue_url && (
              <Property label="Linked issue" mono>
                <a href={ticket.linked_issue_url} rel="noreferrer noopener" target="_blank">
                  {ticket.linked_issue_url.replace(/^https?:\/\//, "")}
                </a>
              </Property>
            )}
          </Properties>
          {canManage && ticket.status !== "resolved" && (
            <section className="props" aria-label="Merge">
              <h2 className="props__title">Duplicate?</h2>
              <MergeForm
                ticketId={ticket.id}
                candidates={(firmContext?.related_tickets ?? [])
                  .filter((related) => related.status !== "resolved")
                  .map((related) => ({ id: related.id, subject: related.subject }))}
                action={mergeTicketAction}
              />
            </section>
          )}
          {firmContext !== null && firmContext.related_tickets.length > 0 && (
            <section className="props" aria-label="Also from this account">
              <h2 className="props__title">Also from this account</h2>
              <ul className="desk__related">
                {firmContext.related_tickets.map((related) => (
                  <li key={related.id}>
                    <Link href={queueHref(filters, related.id, {})}>{related.subject}</Link>
                    <span className="quiet">
                      {" "}
                      · {STATUS_WORDS[related.status] ?? related.status}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="props" aria-label="Answered with">
            <h2 className="props__title">Answered with</h2>
            <TicketArticles token={context.token} ticketId={ticket.id} canWrite={canWrite} />
          </section>
          {hasCapability(context, "audit:read") && (
            <section className="props" aria-label="Changes">
              <h2 className="props__title">Changes</h2>
              <RecordHistory
                token={context.token}
                entityType="ticket"
                entityId={ticket.id}
                names={await directoryOrNull(context.token)}
                canRead
                now={requestNow()}
              />
            </section>
          )}
          {canManage && (
            <section className="props" aria-label="Manage">
              <h2 className="props__title">Manage</h2>
              <TicketControls
                ticket={ticket}
                action={manageTicketAction}
                teammates={teammates}
                self={self}
              />
            </section>
          )}
        </aside>
      )}
    </div>
  );
}

export function deskFilters(
  parameters: Record<string, string | string[] | undefined>,
): DeskFilters {
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
  const view = first(parameters.view);
  return {
    view: VIEWS.some((candidate) => candidate.key === view) ? view : "open",
    sla: ["breached", "at-risk"].includes(first(parameters.sla)) ? first(parameters.sla) : "",
    assignee: ["unassigned", "mine"].includes(first(parameters.assignee))
      ? first(parameters.assignee)
      : "",
    following: first(parameters.following) === "1" ? "1" : "",
    q: first(parameters.q).slice(0, 120),
  };
}
