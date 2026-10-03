import Link from "next/link";
import { notFound } from "next/navigation";

import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import {
  actOnRequestAction,
  eraseAction,
  markSearchAction,
  stopContactAction,
} from "@/app/(portal)/privacy/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
import { EventTimeline } from "@/components/privacy/event-timeline";
import { ClockPill, RequestStatusPill, clockText } from "@/components/privacy/privacy-pills";
import { EraseForm, SearchRowForm } from "@/components/privacy/privacy-forms";
import { ActForm } from "@/components/ui/act-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readPrivacyRequest, type PrivacyRequestDetail } from "@/lib/api/privacy";
import { formatAbsolute, formatDate } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Privacy request" };
export const dynamic = "force-dynamic";

const EVENT_LABELS: Record<string, string> = {
  received: "Received",
  assign: "Handed over",
  request_identity: "Identity asked for",
  confirm_identity: "Identity confirmed",
  request_fee: "Fee asked for",
  fee_paid: "Fee paid",
  stop_clock: "Clock stopped",
  resume_clock: "Clock running",
  review: "In review",
  extend: "Extended",
  acknowledge: "Acknowledged",
  respond: "Responded",
  refuse: "Refused",
  withdraw: "Withdrawn",
  search: "Searched",
  stop_contact: "Contact stopped",
  erased: "Erased",
  packaged: "Data file made",
  note: "Note",
};

const IDENTITY: Record<string, string> = {
  not_needed: "Not needed",
  requested: "Asked for; the month waits",
  confirmed: "Confirmed",
};

const CHANNELS: Record<string, string> = {
  email: "Email",
  form: "Web form",
  in_app: "In the app",
  post: "Post",
  phone: "Phone",
  other: "Other",
};

type Params = Promise<{ requestId: string }>;

/** What the page says when a data file came back refused, keyed by `?package=`. */
const PACKAGE_OUTCOMES: Record<string, string> = {
  sudo: "Confirm it's you first, then make the file again.",
  identity: "Confirm who is asking before their data is gathered.",
  forbidden: "Your role cannot make this file.",
  failed: "The file could not be made just now. Nothing left HQ.",
};

/**
 * One request and its clock: who asked for what, when the answer is due and why, where
 * HQ already holds their data, the checklist of every system searched, and the acts —
 * stop the clock, extend, respond, refuse — each recorded on the timeline.
 */
export default async function PrivacyRequestPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { requestId } = await params;
  const packageParam = (await searchParams).package;
  const packageOutcome =
    PACKAGE_OUTCOMES[(Array.isArray(packageParam) ? packageParam[0] : packageParam) ?? ""];
  const context = await requireStaff(`/privacy/requests/${requestId}`);
  if (!hasCapability(context, "privacy:read")) {
    return (
      <>
        <PageHeader eyebrow="Desk" title="Privacy request" />
        <Callout tone="neutral">The privacy desk is run by Support, Admins and Owners.</Callout>
      </>
    );
  }
  let detail: PrivacyRequestDetail | null = null;
  try {
    detail = await readPrivacyRequest(context.token, requestId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (detail === null) {
    return (
      <>
        <PageHeader eyebrow="Privacy desk" title="Privacy request" />
        <Callout tone="danger" role="alert">
          This request could not be read just now.
        </Callout>
      </>
    );
  }
  const now = requestNow();
  const { request, matches } = detail;
  const clock = request.clock;
  const canWrite = hasCapability(context, "privacy:write") && request.open;
  const isAdmin = hasCapability(context, "hq:admin");
  const complaint = request.kind === "complaint";
  const hidden = { request_id: request.id, company_id: request.company?.id ?? "" };
  const today = new Date(now).toISOString().slice(0, 10);
  const fresh = context.me.sudo_fresh;
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  const pending = detail.searches.filter((item) => item.state === "pending").length;

  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/privacy", label: "Privacy desk" }]}
        title={`${request.reference} · ${request.kind_label}`}
        status={
          <>
            <RequestStatusPill status={request.status} />
            <ClockPill clock={clock} complaint={complaint} />
          </>
        }
        readouts={[
          { label: "Received", value: formatDate(request.received_on) },
          {
            label: complaint ? "Acknowledge by" : "Clock started",
            value: complaint
              ? formatDate(clock.due_on, "—")
              : clock.starts_on
                ? formatDate(clock.starts_on)
                : "Not yet",
          },
          {
            label: complaint ? "Acknowledged" : "Due",
            value: complaint
              ? formatDate(request.acknowledged_on, "—")
              : formatDate(clock.due_on, "—"),
          },
          { label: "Clock", value: clockText(clock, complaint) },
        ]}
      />
      {clock.overdue && (
        <Callout tone="danger" role="alert" compact>
          Past the deadline of {formatDate(clock.due_on)}. Answer now, and say why it is late.
        </Callout>
      )}
      {clock.state === "stopped" && (
        <Callout tone="attention" compact>
          The clock is stopped while we wait for: {request.paused_question || "their answer"}.{" "}
          {clock.days_left_when_stopped !== null &&
            `${clock.days_left_when_stopped} days will be left when it runs again.`}
        </Callout>
      )}
      {clock.state === "not_started" && (
        <Callout tone="neutral" compact>
          {clock.reason}
        </Callout>
      )}
      {!clock.holidays_known && (
        <Callout tone="neutral" compact>
          Bank holidays after 2028 are not in HQ yet; this date only steps over weekends.
        </Callout>
      )}
      <RecordGrid
        side={
          <>
            <Properties title="Request">
              <Property label="Who">{request.requester_name || "—"}</Property>
              <Property label="Email">{request.requester_email || "—"}</Property>
              <Property label="Firm">
                {request.company ? (
                  <Link href={`/companies/${request.company.id}?tab=privacy`}>
                    {request.company.name}
                  </Link>
                ) : (
                  "—"
                )}
              </Property>
              <Property label="In the CRM">
                {detail.person ? (
                  detail.person.erased ? (
                    "Erased"
                  ) : (
                    <Link href={`/people/${detail.person.id}`}>
                      {detail.person.name || detail.person.email}
                    </Link>
                  )
                ) : (
                  "No matching person"
                )}
              </Property>
              <Property label="Law">{request.regime_label}</Property>
              <Property label="Arrived by">{CHANNELS[request.channel] ?? request.channel}</Property>
              {!complaint && (
                <Property label="Identity">
                  {IDENTITY[request.identity_state] ?? request.identity_state}
                  {request.identity_confirmed_on && (
                    <span className="quiet">
                      {" "}
                      · {formatDate(request.identity_confirmed_on)} · {request.identity_method}
                    </span>
                  )}
                </Property>
              )}
              {request.fee_requested_on && (
                <Property label="Fee">
                  Asked {formatDate(request.fee_requested_on)}
                  {request.fee_paid_on
                    ? `, paid ${formatDate(request.fee_paid_on)}`
                    : ", not yet paid"}
                </Property>
              )}
              <Property label="Days stopped">{clock.paused_days}</Property>
              {clock.extended && (
                <Property label="Extended">
                  {request.extension_reason}
                  <span className="quiet"> · told {formatDate(request.extension_told_on)}</span>
                </Property>
              )}
              <Property label="Handled by">{request.assignee?.name || "Nobody yet"}</Property>
              {request.responded_on && (
                <Property label="Answered">
                  {formatDate(request.responded_on)}
                  {request.outcome && (
                    <span className="quiet"> · {request.outcome.replace("_", " ")}</span>
                  )}
                </Property>
              )}
            </Properties>
            <p className="field__hint">{clock.reason}</p>
          </>
        }
      >
        {request.description && (
          <RecordSection id="wrote" title="What they wrote">
            <p className="prewrap">{request.description}</p>
          </RecordSection>
        )}
        {request.outcome_detail && (
          <RecordSection id="answer" title="What they were told">
            <p className="prewrap">{request.outcome_detail}</p>
          </RecordSection>
        )}

        {!complaint && (
          <RecordSection
            id="holds"
            title={matches.email ? `What HQ holds under ${matches.email}` : "What HQ holds"}
          >
            {!matches.email ? (
              <p className="muted">No email on the request, so HQ cannot be searched by it.</p>
            ) : (
              <ul className="match-list">
                <li className="match-list__row">
                  <span className="match-list__what">People</span>
                  <span>
                    {matches.people.length === 0
                      ? "None"
                      : matches.people.map((person, index) => (
                          <span key={person.id}>
                            {index > 0 && ", "}
                            {person.erased ? (
                              "an erased record"
                            ) : (
                              <Link href={`/people/${person.id}`}>{person.name || "Unnamed"}</Link>
                            )}
                          </span>
                        ))}
                  </span>
                </li>
                <li className="match-list__row">
                  <span className="match-list__what">Leads</span>
                  <span>
                    {matches.leads.length === 0
                      ? "None"
                      : matches.leads.map((lead, index) => (
                          <span key={lead.id}>
                            {index > 0 && ", "}
                            {lead.anonymised ? (
                              "an anonymised lead"
                            ) : (
                              <Link href={`/leads/${lead.id}`}>
                                {lead.name || "Unnamed"} ({lead.stage})
                              </Link>
                            )}
                          </span>
                        ))}
                  </span>
                </li>
                <li className="match-list__row">
                  <span className="match-list__what">Mailing lists</span>
                  <span>
                    {matches.list_memberships.length === 0
                      ? "None"
                      : matches.list_memberships.map((item, index) => (
                          <span key={item.list_id}>
                            {index > 0 && ", "}
                            <Link href={`/mail/lists/${item.list_id}`}>{item.list_name}</Link>
                          </span>
                        ))}
                  </span>
                </li>
                <li className="match-list__row">
                  <span className="match-list__what">Meetings</span>
                  <span>
                    {matches.meetings.length === 0
                      ? "None"
                      : matches.meetings.map((item, index) => (
                          <span key={item.id}>
                            {index > 0 && ", "}
                            <Link href={`/meetings/${item.id}`}>{item.title || "Untitled"}</Link>
                          </span>
                        ))}
                  </span>
                </li>
                <li className="match-list__row">
                  <span className="match-list__what">Mail sent to it</span>
                  <span>
                    {matches.mail_messages} message{matches.mail_messages === 1 ? "" : "s"}
                    {matches.suppressed ? " · on the suppression list" : ""}
                    {matches.consent
                      ? ` · consent: ${matches.consent.state || "unknown"}${
                          matches.consent.basis ? ` (${matches.consent.basis})` : ""
                        }`
                      : ""}
                  </span>
                </li>
                <li className="match-list__row">
                  <span className="match-list__what">Support tickets</span>
                  <span>
                    {!matches.tickets_searched
                      ? "Not searchable until the desk runs on SQL; search the desk by hand."
                      : matches.tickets.length === 0
                        ? "None"
                        : matches.tickets.map((ticket, index) => (
                            <span key={ticket.id}>
                              {index > 0 && ", "}
                              <Link href={`/support/${ticket.id}`}>
                                {ticket.subject || ticket.id}
                              </Link>
                            </span>
                          ))}
                  </span>
                </li>
              </ul>
            )}
          </RecordSection>
        )}

        {!complaint && (
          <RecordSection id="checklist" title="Searched">
            <p className="page-note">
              {pending > 0
                ? `${pending} of ${detail.searches.length} still to search. A response waits until every one is searched or marked not applicable.`
                : "Every system searched."}
            </p>
            <ul className="search-list">
              {detail.searches.map((item) => (
                <li key={item.system}>
                  <SearchRowForm
                    action={markSearchAction}
                    requestId={request.id}
                    system={item.system}
                    label={item.label}
                    state={item.state}
                    note={item.note}
                    disabled={!canWrite}
                  />
                  {item.by && (
                    <p className="search-row__done">
                      Marked by {item.by}
                      {item.at ? ` · ${formatAbsolute(item.at)}` : ""}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </RecordSection>
        )}

        {(request.kind === "access" || request.kind === "portability") && (
          <RecordSection id="copy" title="A copy of their data">
            <p className="page-note">
              Everything HQ holds under {request.requester_email || "their address"}, as one file: a
              CSV for each kind of record and the whole as JSON. Notes our team wrote are in it,
              marked internal; read it before it is sent. Making it is written on the timeline.
            </p>
            {packageOutcome && (
              <Callout tone="danger" role="alert" compact>
                {packageOutcome}
              </Callout>
            )}
            {!request.open ? (
              <p className="muted">The request is closed.</p>
            ) : request.identity_state === "requested" ? (
              <p className="muted">
                Their data is gathered once identity is confirmed, so it cannot go to the wrong
                person.
              </p>
            ) : !canWrite ? (
              <p className="muted">The desk makes the file; your role reads the request.</p>
            ) : (
              <>
                <SudoGate
                  action={confirmSudoAction}
                  fresh={fresh}
                  untilLabel={untilLabel}
                  returnPath={`/privacy/requests/${request.id}`}
                  purpose="Gathering a person's data needs a fresh code from your authenticator app."
                />
                <form
                  className="stack-form stack-form--tight"
                  method="post"
                  action={`/privacy/requests/${request.id}/package`}
                >
                  <button className="btn btn--primary" type="submit" disabled={!fresh}>
                    Download the data file
                  </button>
                </form>
              </>
            )}
          </RecordSection>
        )}

        {canWrite && (
          <RecordSection id="work" title="Work it">
            <div className="form-grid">
              {complaint && !request.acknowledged_on && (
                <Card title="Acknowledge it" titleAs="h3" description="Within 30 days of receipt.">
                  <ActForm
                    action={actOnRequestAction}
                    hidden={hidden}
                    act="acknowledge"
                    label="Record the acknowledgement"
                    primary
                  >
                    <Field id="ack-on" label="Acknowledged on">
                      <Input id="ack-on" name="on" type="date" defaultValue={today} max={today} />
                    </Field>
                  </ActForm>
                </Card>
              )}
              {!complaint && request.identity_state === "requested" && (
                <Card
                  title="Confirm identity"
                  titleAs="h3"
                  description="The month starts from the day it was confirmed."
                >
                  <ActForm
                    action={actOnRequestAction}
                    hidden={hidden}
                    act="confirm_identity"
                    label="Confirm identity"
                  >
                    <Field id="identity-on" label="Confirmed on">
                      <Input
                        id="identity-on"
                        name="on"
                        type="date"
                        defaultValue={today}
                        max={today}
                      />
                    </Field>
                    <Field id="identity-method" label="How">
                      <Input
                        id="identity-method"
                        name="method"
                        maxLength={200}
                        placeholder="Replied from the address on file"
                      />
                    </Field>
                  </ActForm>
                </Card>
              )}
              {!complaint && request.identity_state === "not_needed" && (
                <Card
                  title="Unsure who is asking?"
                  titleAs="h3"
                  description="Ask for proof only when there is real doubt. The month then waits for it."
                >
                  <ActForm
                    action={actOnRequestAction}
                    hidden={hidden}
                    act="request_identity"
                    label="Ask for proof of identity"
                  />
                </Card>
              )}
              {!complaint && clock.state === "running" && (
                <Card
                  title="Stop the clock"
                  titleAs="h3"
                  description="Only while waiting for what you need to scope the request."
                >
                  <ActForm
                    action={actOnRequestAction}
                    hidden={hidden}
                    act="stop_clock"
                    label="Stop the clock"
                  >
                    <Field id="stop-question" label="What you asked them">
                      <Textarea id="stop-question" name="question" rows={2} maxLength={1000} />
                    </Field>
                    <Field id="stop-on" label="Asked on">
                      <Input id="stop-on" name="on" type="date" defaultValue={today} max={today} />
                    </Field>
                  </ActForm>
                </Card>
              )}
              {clock.state === "stopped" && (
                <Card
                  title="They answered"
                  titleAs="h3"
                  description="The clock runs again from the next day; every stopped day moves the deadline."
                >
                  <ActForm
                    action={actOnRequestAction}
                    hidden={hidden}
                    act="resume_clock"
                    label="Start the clock again"
                    primary
                  >
                    <Field id="resume-on" label="Answer received on">
                      <Input
                        id="resume-on"
                        name="on"
                        type="date"
                        defaultValue={today}
                        max={today}
                      />
                    </Field>
                  </ActForm>
                </Card>
              )}
              {clock.can_extend && (
                <Card
                  title="Extend by two months"
                  titleAs="h3"
                  description={`Only for a complex request or one of many, and they must be told why by ${formatDate(clock.extend_by)}.`}
                >
                  <ActForm action={actOnRequestAction} hidden={hidden} act="extend" label="Extend">
                    <Field id="extend-reason" label="Why (as they were told)">
                      <Textarea id="extend-reason" name="reason" rows={2} maxLength={1000} />
                    </Field>
                    <Field id="extend-told" label="Told on">
                      <Input
                        id="extend-told"
                        name="told_on"
                        type="date"
                        defaultValue={today}
                        max={today}
                      />
                    </Field>
                  </ActForm>
                </Card>
              )}
              <Card title="Hand it over" titleAs="h3">
                <ActForm action={actOnRequestAction} hidden={hidden} act="assign" label="Hand over">
                  <Field id="assign-to" label="To">
                    <Select
                      id="assign-to"
                      name="assignee_staff_id"
                      defaultValue={request.assignee?.id ?? ""}
                    >
                      <option value="">Choose someone</option>
                      {detail.staff.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </ActForm>
              </Card>
            </div>
            <div className="form-grid">
              <Card
                title={complaint ? "The outcome" : "Respond"}
                titleAs="h3"
                description={
                  complaint
                    ? "What was found and what changes, as they were told."
                    : "What they were sent or told. Every system must be searched first."
                }
              >
                <ActForm
                  action={actOnRequestAction}
                  hidden={hidden}
                  act="respond"
                  label="Record the response"
                  primary
                >
                  <Field id="respond-outcome" label="Outcome">
                    <Select id="respond-outcome" name="outcome" defaultValue="fulfilled">
                      <option value="fulfilled">Done in full</option>
                      <option value="partly">Done in part (with reasons)</option>
                      <option value="none_held">We hold nothing on them</option>
                    </Select>
                  </Field>
                  <Field id="respond-detail" label="What they were told">
                    <Textarea id="respond-detail" name="detail" rows={3} maxLength={2000} />
                  </Field>
                  <Field id="respond-on" label="Sent on">
                    <Input id="respond-on" name="on" type="date" defaultValue={today} max={today} />
                  </Field>
                </ActForm>
              </Card>
              <Card
                title="Refuse it"
                titleAs="h3"
                description="Tell them why, and that they may complain to the regulator."
              >
                <ActForm
                  action={actOnRequestAction}
                  hidden={hidden}
                  act="refuse"
                  label="Record the refusal"
                  danger
                >
                  <Field id="refuse-reason" label="Ground">
                    <Select id="refuse-reason" name="reason" defaultValue="">
                      <option value="">Choose the ground</option>
                      {detail.refusals.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field id="refuse-detail" label="What they were told">
                    <Textarea id="refuse-detail" name="detail" rows={3} maxLength={2000} />
                  </Field>
                </ActForm>
              </Card>
            </div>
            <div className="form-grid">
              <Card title="A note on the timeline" titleAs="h3">
                <ActForm
                  action={actOnRequestAction}
                  hidden={hidden}
                  act="note"
                  label="Add the note"
                >
                  <Field id="request-note" label="Note">
                    <Textarea id="request-note" name="note" rows={2} maxLength={2000} />
                  </Field>
                </ActForm>
              </Card>
              <Card
                title="They withdrew it"
                titleAs="h3"
                description="Only on their word; keep what they said in the note."
              >
                <ActForm
                  action={actOnRequestAction}
                  hidden={hidden}
                  act="withdraw"
                  label="Mark withdrawn"
                >
                  <Field id="withdraw-note" label="What they said">
                    <Input id="withdraw-note" name="note" maxLength={400} />
                  </Field>
                </ActForm>
              </Card>
            </div>
          </RecordSection>
        )}

        {(detail.can_stop_contact || detail.can_erase) && (
          <RecordSection id="act" title="Stop and erase">
            <div className="form-grid">
              {detail.can_stop_contact && hasCapability(context, "privacy:write") && (
                <Card
                  title="Stop contacting them"
                  titleAs="h3"
                  description="Marks the person do-not-contact and puts the address on the suppression list, so no campaign, sequence or list mail reaches it."
                >
                  <ActForm
                    action={stopContactAction}
                    hidden={{ request_id: request.id }}
                    act="stop_contact"
                    label="Stop contact"
                  />
                </Card>
              )}
              {detail.can_erase && (
                <Card
                  title="Erase from the CRM"
                  titleAs="h3"
                  description="Empties the person record, their leads, list memberships, meeting invitations and notes filed on them alone. Notes on a firm or deal are that record's history and stay. It cannot be undone."
                >
                  {isAdmin ? (
                    <>
                      <SudoGate
                        action={confirmSudoAction}
                        fresh={fresh}
                        untilLabel={untilLabel}
                        returnPath={`/privacy/requests/${request.id}`}
                        purpose="Erasing a person needs a fresh code from your authenticator app."
                      />
                      <EraseForm action={eraseAction} requestId={request.id} disabled={!fresh} />
                    </>
                  ) : (
                    <p className="muted">An Admin or Owner erases; ask one to open this request.</p>
                  )}
                </Card>
              )}
            </div>
          </RecordSection>
        )}

        <RecordSection id="timeline" title="Timeline">
          <EventTimeline events={detail.events} labels={EVENT_LABELS} now={now} />
        </RecordSection>
      </RecordGrid>
    </>
  );
}
