import Link from "next/link";

import { enrolOneAction, setConsentAction } from "@/app/(portal)/mail/actions";
import { MailForm } from "@/components/mail/mail-form";
import { MessageStatePill } from "@/components/mail/pills";
import { RecordEmail } from "@/components/mail/record-email";
import { Callout } from "@/components/ui/callout";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Timestamp } from "@/components/ui/timestamp";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import {
  EXIT_REASON_LABELS,
  SUPPRESSION_REASON_LABELS,
  readMailHistory,
  readSequences,
  type MailHistory,
  type MailSequence,
} from "@/lib/api/mail";

const TOPICS = [
  { key: "updates", label: "Product updates" },
  { key: "news", label: "Announcements" },
  { key: "events", label: "Events" },
];

async function orNull<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof HqApiUnavailableError || error instanceof HqApiRequestError) return null;
    throw error;
  }
}

/**
 * Mail for one person or lead: what we sent and what came back, whether they may be
 * mailed and on what basis, a way to put them in a sequence or a campaign, and an email
 * written here and sent from the reader's own mailbox.
 */
export async function RecordMail({
  token,
  kind,
  contactId,
  email,
  returnPath,
  canWrite,
  now,
  full,
  staffId,
  name = "",
}: {
  token: string;
  /** The reader: an email written here goes from their own mailbox. */
  staffId: string;
  /** Who the record is, for the email's "To". */
  name?: string;
  kind: "person" | "lead";
  contactId: string;
  email: string;
  returnPath: string;
  canWrite: boolean;
  now: number;
  full: boolean;
}) {
  if (!email) {
    return <p className="muted">No address on this record, so nothing can be sent.</p>;
  }
  const [history, sequences] = await Promise.all([
    orNull<MailHistory>(() => readMailHistory(token, email)),
    orNull<{ sequences: MailSequence[] }>(() => readSequences(token)),
  ]);
  if (history === null) {
    return (
      <Callout tone="danger" compact>
        Mail history could not be read just now.
      </Callout>
    );
  }
  const live = (sequences?.sequences ?? []).filter((sequence) => sequence.state === "active");
  const stops = history.suppressions.filter((row) => row.active);
  const consent = history.consent;
  const campaignHref = `/mail/campaigns/new?${kind === "lead" ? "leads" : "people"}=${contactId}`;
  const current = history.enrolments.find(
    (row) => row.state === "active" || row.state === "paused",
  );

  return (
    <div className="record-mail">
      {stops.length > 0 && (
        <Callout tone="danger" compact title="Stopped">
          {stops.map((row) => SUPPRESSION_REASON_LABELS[row.reason] ?? row.reason).join(", ")}:
          nothing is sent to {email}.
        </Callout>
      )}
      <dl className="record-mail__facts">
        <div>
          <dt>Marketing</dt>
          <dd>
            {consent.marketing_state === "subscribed"
              ? "Said yes"
              : consent.marketing_state === "unsubscribed"
                ? "Unsubscribed"
                : "Not asked (opt-out)"}
            {consent.topics_off.length > 0 && ` · off: ${consent.topics_off.join(", ")}`}
          </dd>
        </div>
        <div>
          <dt>Sales emails</dt>
          <dd>{consent.sales_stop ? "Asked us to stop" : "May be written to"}</dd>
        </div>
        <div>
          <dt>Sequence</dt>
          <dd>
            {current ? (
              <Link href={`/mail/sequences/${current.sequence_id}`}>
                {current.state === "paused" ? "Paused in one" : "In one now"}
              </Link>
            ) : (
              "Not in one"
            )}
          </dd>
        </div>
      </dl>
      {canWrite && stops.length === 0 && (
        <div className="record-mail__actions">
          {live.length > 0 && !current && !consent.sales_stop && (
            <MailForm
              action={enrolOneAction}
              fields={{ contact_kind: kind, contact_id: contactId, return_path: returnPath }}
              submitLabel="Add to sequence"
              className="inline-form"
            >
              <label className="sr-only" htmlFor={`enrol-${contactId}`}>
                Sequence
              </label>
              <select id={`enrol-${contactId}`} name="sequence_id" className="select select--small">
                {live.map((sequence) => (
                  <option key={sequence.sequence_id} value={sequence.sequence_id}>
                    {sequence.name}
                  </option>
                ))}
              </select>
            </MailForm>
          )}
          <Link className="btn btn--small" href={campaignHref}>
            Include in a campaign
          </Link>
        </div>
      )}
      {canWrite && stops.length === 0 && !consent.sales_stop && (
        <RecordEmail
          token={token}
          staffId={staffId}
          recipients={[
            { value: `${kind}:${contactId}`, label: name ? `${name} · ${email}` : email },
          ]}
          returnPath={returnPath}
          idPrefix={`email-${contactId}`}
        />
      )}
      <ol className="mail-history" aria-label="Mail sent">
        {history.messages.slice(0, full ? 50 : 5).map((message) => (
          <li key={message.message_id} className="mail-history__row">
            <MessageStatePill state={message.state} />
            <span className="mail-history__subject">
              {message.subject ||
                (message.kind === "sequence"
                  ? `Sequence step ${message.step_no}`
                  : message.kind === "one_off"
                    ? "An email written here"
                    : "Campaign")}
            </span>
            <span className="table-sub">
              <Timestamp
                value={message.sent_at ?? message.scheduled_at}
                now={now}
                mode="relative"
              />
            </span>
          </li>
        ))}
        {history.messages.length === 0 && <li className="muted">Nothing sent yet.</li>}
      </ol>
      {full && history.enrolments.length > 0 && (
        <ul className="ended-list">
          {history.enrolments.map((row) => (
            <li key={row.enrolment_id}>
              <Link href={`/mail/sequences/${row.sequence_id}`}>Sequence</Link>
              <span>
                {row.state === "active"
                  ? "In it now"
                  : row.state === "paused"
                    ? "Paused"
                    : (EXIT_REASON_LABELS[row.exit_reason] ?? row.exit_reason)}
              </span>
              <Timestamp value={row.enrolled_at} now={now} mode="date" />
            </li>
          ))}
        </ul>
      )}
      {full && canWrite && (
        <details className="record-mail__consent">
          <summary>Change what they may receive</summary>
          <MailForm
            action={setConsentAction}
            fields={{ email, return_path: returnPath }}
            submitLabel="Save"
          >
            <Field
              id={`consent-state-${contactId}`}
              label="Marketing"
              hint="Only record a yes you could show: a form they filled in, an email they sent."
            >
              <Select
                id={`consent-state-${contactId}`}
                name="marketing_state"
                defaultValue={consent.marketing_state}
              >
                <option value="unknown">Not asked (opt-out applies)</option>
                <option value="subscribed">Said yes</option>
                <option value="unsubscribed">Unsubscribed</option>
              </Select>
            </Field>
            <fieldset className="unsub__topics">
              <legend className="field__label">Topics turned off</legend>
              {TOPICS.map((topic) => (
                <label key={topic.key} className="unsub__topic">
                  <input
                    type="checkbox"
                    name="topics_off"
                    value={topic.key}
                    defaultChecked={consent.topics_off.includes(topic.key)}
                  />
                  <span>{topic.label}</span>
                </label>
              ))}
            </fieldset>
            <Checkbox
              id={`consent-sales-${contactId}`}
              name="sales_stop"
              label="Asked sales to stop writing"
              defaultChecked={consent.sales_stop}
            />
            <Field id={`consent-basis-${contactId}`} label="On what basis">
              <Select
                id={`consent-basis-${contactId}`}
                name="lawful_basis"
                defaultValue={consent.lawful_basis}
              >
                <option value="">Not recorded</option>
                <option value="consent">They said yes</option>
                <option value="legitimate_interest">
                  Legitimate interest (a business address)
                </option>
                <option value="customer">They are a customer</option>
              </Select>
            </Field>
            <Field
              id={`consent-zone-${contactId}`}
              label="Their time zone"
              hint="e.g. Europe/Zurich; otherwise guessed from the firm's country."
            >
              <Input
                id={`consent-zone-${contactId}`}
                name="timezone"
                defaultValue={consent.timezone}
                maxLength={64}
              />
            </Field>
          </MailForm>
        </details>
      )}
    </div>
  );
}
