import Link from "next/link";

import {
  handleReplyAction,
  outcomeAction,
  resumeEnrolmentAction,
} from "@/app/(portal)/mail/actions";
import { MailForm } from "@/components/mail/mail-form";
import { MailTabs } from "@/components/mail/mail-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RecordSection } from "@/components/ui/record-shell";
import { RowAction } from "@/components/ui/row-action";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readReplies, type MailReply, type MailRepliesPage } from "@/lib/api/mail";
import { formatDate } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Replies" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "who", label: "Person" },
  { key: "sequence", label: "Sequence" },
  { key: "step", label: "Step" },
  { key: "last", label: "Last email" },
  { key: "owner", label: "Owner" },
  { key: "record", label: "What happened" },
];

/** The outcomes a reply can be recorded as in one press, in the order a person reaches for them. */
const QUICK = [
  "replied_positive",
  "meeting_booked",
  "not_now",
  "not_interested",
  "wrong_person",
  "unsubscribe",
] as const;

const KIND_LABELS: Record<string, string> = {
  reply: "Replied",
  auto_reply: "Automatic reply",
  bounce: "Bounce notice",
};

/** Longer than this, a reply shows its opening and keeps the rest a press away. */
const EXCERPT = 700;

function contactHref(kind: string, id: string): string {
  return kind === "lead" ? `/leads/${id}` : `/people/${id}`;
}

function who(reply: MailReply): string {
  return reply.contact_name || reply.from_name || reply.from_email || "Someone";
}

function ReplyItem({
  reply,
  now,
  labels,
  canWrite,
}: {
  reply: MailReply;
  now: number;
  labels: Record<string, string>;
  canWrite: boolean;
}) {
  const name = who(reply);
  const opening =
    reply.text.length > EXCERPT ? `${reply.text.slice(0, EXCERPT).trimEnd()}…` : reply.text;
  const order: string[] = reply.proposed
    ? [reply.proposed, ...QUICK.filter((key) => key !== reply.proposed)]
    : [...QUICK];
  return (
    <li className="reply-item">
      <div className="reply-item__head">
        <span className="thread__author">
          {reply.contact_id ? (
            <Link className="text-link" href={contactHref(reply.contact_kind, reply.contact_id)}>
              {name}
            </Link>
          ) : (
            name
          )}
        </span>
        <span className="reply-item__meta">
          {[reply.company_name, reply.from_email].filter(Boolean).join(" · ")}
        </span>
        <Timestamp value={reply.received_at} now={now} mode="relative" />
      </div>
      <p className="reply-item__context">
        {KIND_LABELS[reply.kind] ?? "Replied"}
        {reply.sequence_name ? ` to ${reply.sequence_name}` : ""}
        {reply.mailbox ? `, in ${reply.mailbox}` : ""}
      </p>
      {reply.subject && <p className="reply-item__subject">{reply.subject}</p>}
      {opening ? (
        <p className="reply-item__text">{opening}</p>
      ) : (
        <p className="reply-item__said">No words were kept.</p>
      )}
      {reply.text.length > EXCERPT && (
        <details className="reply-item__more">
          <summary className="text-link">All of it</summary>
          <p className="reply-item__text">{reply.text}</p>
        </details>
      )}
      {(reply.auto_label || reply.proposed_label) && (
        <p className="reply-item__said">
          {reply.auto_label &&
            `${reply.auto_label}${
              reply.auto_action === "paused_until" && reply.auto_detail
                ? ` (${formatDate(reply.auto_detail)})`
                : ""
            }. `}
          {reply.proposed_label && (
            <>
              It reads as <strong>{reply.proposed_label.toLowerCase()}</strong>
              {reply.proposed_why ? ` (“${reply.proposed_why}”)` : ""}.
            </>
          )}
        </p>
      )}
      {reply.handled_at ? (
        <p className="reply-item__said">
          {reply.outcome === "resumed"
            ? "Read; the sequence carried on"
            : reply.outcome === "dismissed"
              ? "Read; nothing to record"
              : reply.outcome
                ? `Recorded: ${(labels[reply.outcome] ?? reply.outcome).toLowerCase()}`
                : "Settled on its own"}
          {" · "}
          <Timestamp value={reply.handled_at} now={now} mode="relative" />
        </p>
      ) : (
        canWrite &&
        reply.may_handle && (
          <div className="reply-item__actions">
            <RowAction
              action={handleReplyAction}
              fields={{ reply_id: reply.reply_id }}
              className="inline-actions"
              buttons={[
                ...order.map((key, index) => ({
                  label:
                    index === 0 && reply.proposed
                      ? `Record: ${labels[key] ?? key}`
                      : (labels[key] ?? key),
                  className:
                    index === 0 && reply.proposed
                      ? "btn btn--small btn--primary"
                      : "btn btn--small btn--ghost",
                  name: "outcome",
                  value: key,
                  ariaLabel: `${name}: ${labels[key] ?? key}`,
                })),
                {
                  label: "Nothing to record",
                  className: "btn btn--small btn--ghost",
                  name: "outcome",
                  value: "dismissed",
                  ariaLabel: `${name}: nothing to record`,
                },
              ]}
            />
            {reply.enrolment_state === "paused" && reply.enrolment_id && (
              <RowAction
                action={resumeEnrolmentAction}
                fields={{ enrolment_id: reply.enrolment_id }}
                buttons={[
                  {
                    label: "Not a reply: carry on",
                    className: "btn btn--small btn--ghost",
                    ariaLabel: `${name}: not a reply, carry on with the sequence`,
                  },
                ]}
              />
            )}
          </div>
        )
      )}
    </li>
  );
}

/**
 * What came back. Replies to a connected mailbox are read by HQ and wait here for a
 * person to say what they were; for anyone written to from an address HQ cannot read,
 * the owner says whether they replied. Each outcome ends the sequence and moves the lead.
 */
export default async function RepliesPage() {
  const context = await requireStaff("/mail/replies");
  const now = requestNow();
  let page: MailRepliesPage | null = null;
  try {
    page = await readReplies(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const canWrite = hasCapability(context, "crm:write");
  const rows = page?.enrolments ?? [];
  const outcomes = page?.outcomes ?? [];
  const labels = Object.fromEntries(outcomes.map((outcome) => [outcome.key, outcome.label]));
  const open = (page?.replies ?? []).filter((reply) => !reply.handled_at);
  const settled = (page?.replies ?? []).filter((reply) => reply.handled_at);
  const awaiting = rows.filter((row) => row.awaiting_reply);
  const paused = rows.filter((row) => row.state === "paused");
  return (
    <>
      <PageHeader
        eyebrow="Mail"
        title="Replies"
        description="What came back. Replies to a connected mailbox are read every few minutes and wait here for you to say what they were; for anyone written to from an address HQ cannot read, say whether they replied. Each outcome ends the sequence and moves the lead."
        actions={<MailTabs current="/mail/replies" />}
      />
      <div className="page-content">
        {page === null ? (
          <Callout tone="danger" role="alert">
            The replies could not be read just now.
          </Callout>
        ) : (
          <>
            <RecordSection id="replies-read" title={`Read from the mailboxes (${open.length})`}>
              {open.length === 0 ? (
                <EmptyState
                  compact
                  title="Nothing waiting"
                  description="An answer to a connected mailbox appears here within minutes, its follow-ups already paused."
                  action={
                    <Link className="text-link" href="/mail/mailboxes">
                      Mailboxes
                    </Link>
                  }
                />
              ) : (
                <ul className="reply-list" aria-label="Replies to read">
                  {open.map((reply) => (
                    <ReplyItem
                      key={reply.reply_id}
                      reply={reply}
                      now={now}
                      labels={labels}
                      canWrite={canWrite}
                    />
                  ))}
                </ul>
              )}
            </RecordSection>

            <RecordSection id="replies-awaiting" title="Waiting for your word">
              <DataTable
                caption="Waiting for your word"
                columns={COLUMNS}
                isEmpty={awaiting.length === 0}
                empty={
                  <p className="page-note">
                    Nobody to ask about. Someone written to from an address HQ cannot read appears
                    here once their last email is a working day old.
                  </p>
                }
              >
                {awaiting.map((row) => (
                  <tr key={row.enrolment_id}>
                    <td>
                      <Link
                        className="table-title"
                        href={contactHref(row.contact_kind, row.contact_id)}
                      >
                        {row.contact_name || row.email}
                      </Link>
                      <span className="table-sub">
                        {[row.company_name, row.email].filter(Boolean).join(" · ")}
                      </span>
                    </td>
                    <td>
                      <Link href={`/mail/sequences/${row.sequence_id}`}>
                        {row.sequence_name ?? "Sequence"}
                      </Link>
                    </td>
                    <td>
                      {row.current_step} of {row.steps_total}
                    </td>
                    <td>
                      <Timestamp value={row.last_sent_at} now={now} mode="relative" />
                    </td>
                    <td>{row.owner_name}</td>
                    <td>
                      {canWrite && (
                        <div className="outcome-row">
                          <RowAction
                            action={outcomeAction}
                            fields={{ enrolment_id: row.enrolment_id }}
                            buttons={[
                              {
                                label: "Interested",
                                className: "btn btn--small",
                                name: "outcome",
                                value: "replied_positive",
                                ariaLabel: `${row.contact_name}: replied, interested`,
                              },
                              {
                                label: "Meeting",
                                className: "btn btn--small",
                                name: "outcome",
                                value: "meeting_booked",
                                ariaLabel: `${row.contact_name}: meeting booked`,
                              },
                              {
                                label: "Not now",
                                className: "btn btn--small btn--ghost",
                                name: "outcome",
                                value: "not_now",
                                ariaLabel: `${row.contact_name}: not now`,
                              },
                            ]}
                          />
                          <Popover label="More" align="end">
                            <MailForm
                              action={outcomeAction}
                              fields={{ enrolment_id: row.enrolment_id }}
                              submitLabel="Record"
                            >
                              <Field id={`outcome-${row.enrolment_id}`} label="What happened">
                                <Select
                                  id={`outcome-${row.enrolment_id}`}
                                  name="outcome"
                                  defaultValue="not_interested"
                                >
                                  {outcomes.map((outcome) => (
                                    <option key={outcome.key} value={outcome.key}>
                                      {outcome.label}
                                    </option>
                                  ))}
                                </Select>
                              </Field>
                              <Field
                                id={`back-${row.enrolment_id}`}
                                label="Back on (out of office only)"
                              >
                                <Input
                                  id={`back-${row.enrolment_id}`}
                                  name="pause_until"
                                  type="date"
                                />
                              </Field>
                              <Field id={`note-${row.enrolment_id}`} label="Note">
                                <Input
                                  id={`note-${row.enrolment_id}`}
                                  name="note"
                                  maxLength={400}
                                />
                              </Field>
                            </MailForm>
                          </Popover>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </DataTable>
            </RecordSection>

            {paused.length > 0 && (
              <RecordSection id="replies-paused" title="Paused">
                <DataTable caption="Paused" columns={COLUMNS}>
                  {paused.map((row) => (
                    <tr key={row.enrolment_id}>
                      <td>
                        <span className="table-title">{row.contact_name || row.email}</span>
                        <span className="table-sub">{row.company_name}</span>
                      </td>
                      <td>{row.sequence_name ?? "Sequence"}</td>
                      <td>
                        {row.current_step} of {row.steps_total}
                      </td>
                      <td>
                        <Timestamp
                          value={row.last_sent_at}
                          now={now}
                          mode="relative"
                          fallback="Not yet"
                        />
                      </td>
                      <td>{row.owner_name}</td>
                      <td>
                        <span className="table-sub">
                          {row.pause_reason === "REPLY_RECEIVED"
                            ? "They replied: read it above"
                            : row.pause_reason === "COMPANY_ENGAGED"
                              ? `A colleague at ${row.company_name || "the firm"} engaged; decide by ${row.paused_until ? formatDate(row.paused_until) : "soon"}`
                              : row.pause_reason === "OUT_OF_OFFICE"
                                ? `Out of office until ${row.paused_until ? formatDate(row.paused_until) : "they are back"}`
                                : row.pause_reason.startsWith("MISSING_TOKEN")
                                  ? "The copy needs a name this record lacks"
                                  : row.pause_reason}
                        </span>
                        {canWrite && row.pause_reason !== "REPLY_RECEIVED" && (
                          <RowAction
                            action={resumeEnrolmentAction}
                            fields={{ enrolment_id: row.enrolment_id }}
                            buttons={[{ label: "Carry on", className: "btn btn--small" }]}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </RecordSection>
            )}

            {settled.length > 0 && (
              <RecordSection id="replies-settled" title="Settled in the last fortnight">
                <ul className="reply-list" aria-label="Settled replies">
                  {settled.map((reply) => (
                    <ReplyItem
                      key={reply.reply_id}
                      reply={reply}
                      now={now}
                      labels={labels}
                      canWrite={canWrite}
                    />
                  ))}
                </ul>
              </RecordSection>
            )}
          </>
        )}
      </div>
    </>
  );
}
