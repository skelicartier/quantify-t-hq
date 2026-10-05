"use client";

import { Send } from "lucide-react";
import { useActionState, useState } from "react";

import { RecipientPicker, type RecipientAccount } from "@/components/product/recipient-picker";
import { useTimeZone } from "@/components/shell/time-zone-context";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ShortId } from "@/components/ui/short-id";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import type { AccountApiAdminNotificationEmailQueue } from "@/lib/product/account-api";
import { formatNumber, isoToLocalInput, localInputToIso } from "@/lib/format";
import {
  INITIAL_NOTIFICATION_EMAIL_STATE,
  type NotificationEmailActionState,
  type NotificationEmailInput,
} from "@/lib/product/notifications/email-input";

type Props = {
  queue: AccountApiAdminNotificationEmailQueue;
  action: (
    state: NotificationEmailActionState,
    data: FormData,
  ) => Promise<NotificationEmailActionState>;
  now?: number | undefined;
};

const blank: NotificationEmailInput = {
  subject: "",
  body: "",
  scheduled_at: "",
  target: { mode: "all", user_ids: [], emails: [] },
};

const COLUMNS = [
  { key: "subject", label: "Subject" },
  { key: "status", label: "Status" },
  { key: "recipients", label: "Recipients" },
  { key: "scheduled", label: "Scheduled" },
  { key: "attempts", label: "Attempts", align: "end" },
  { key: "detail", label: "Detail" },
] as const;

function recipientLabel(target: AccountApiAdminNotificationEmailQueue["jobs"][number]["target"]) {
  if (target.mode === "all") return "All accounts";
  if (target.mode === "active") return "Active accounts";
  return `Selected (${formatNumber(target.user_ids.length + target.emails.length)})`;
}

function JobDetail({
  job,
  now,
}: {
  job: AccountApiAdminNotificationEmailQueue["jobs"][number];
  now?: number | undefined;
}) {
  if (job.status === "sent") {
    return (
      <span className="quiet">
        Sent <Timestamp value={job.completed_at} now={now} fallback="" />
      </span>
    );
  }
  if (job.status === "dead")
    return <span className="field__error">{job.last_error || "Delivery failed"}</span>;
  if (job.status === "retry") {
    return (
      <span className="quiet">
        {job.last_error ? `${job.last_error} · ` : ""}
        Next attempt <Timestamp value={job.next_attempt_at} now={now} fallback="soon" />
      </span>
    );
  }
  return (
    <span className="quiet">
      <Timestamp value={job.next_attempt_at} now={now} fallback="Waiting for the worker" />
    </span>
  );
}

export function AdminEmailManager({ queue, action, now }: Props) {
  const zone = useTimeZone();
  const [email, setEmail] = useState(blank);
  const [accounts, setAccounts] = useState<RecipientAccount[]>([]);
  const [emails, setEmails] = useState("");
  const [state, formAction, pending] = useActionState(action, INITIAL_NOTIFICATION_EMAIL_STATE);
  const selectors = (value: string) => [...new Set(value.split(/[\s,;]+/u).filter(Boolean))];
  const set = <K extends keyof NotificationEmailInput>(key: K, value: NotificationEmailInput[K]) =>
    setEmail((current) => ({ ...current, [key]: value }));
  const payload = {
    ...email,
    target: {
      mode: email.target.mode,
      user_ids: email.target.mode === "selected" ? accounts.map((account) => account.id) : [],
      emails: email.target.mode === "selected" ? selectors(emails) : [],
    },
  };
  const quotaFull =
    queue.jobs.length >= queue.quota.queue_limit ||
    queue.quota.queued_24h >= queue.quota.daily_limit;

  return (
    <>
      <Section
        id="admin-email-compose"
        title="Compose"
        eyebrow="New email"
        description="Plain text only. Links must use HTTPS."
      >
        <form action={formAction} className="form">
          <input type="hidden" name="revision" value={queue.revision} />
          <input type="hidden" name="email" value={JSON.stringify(payload)} />
          <fieldset className="fieldset" disabled={pending || quotaFull}>
            <div className="form-grid">
              <label className="field form-grid__span">
                <span className="field__label">Subject</span>
                <input
                  className="input"
                  required
                  maxLength={140}
                  value={email.subject}
                  onChange={(event) => set("subject", event.target.value)}
                />
              </label>
              <label className="field form-grid__span">
                <span className="field__label">Body</span>
                <textarea
                  className="textarea"
                  required
                  rows={6}
                  maxLength={4000}
                  value={email.body}
                  onChange={(event) => set("body", event.target.value)}
                />
              </label>
              <label className="field">
                <span className="field__label">Recipients</span>
                <select
                  className="select"
                  value={email.target.mode}
                  onChange={(event) =>
                    set("target", {
                      ...email.target,
                      mode: event.target.value as NotificationEmailInput["target"]["mode"],
                    })
                  }
                >
                  <option value="all">All accounts</option>
                  <option value="active">Active accounts</option>
                  <option value="selected">Selected accounts</option>
                </select>
              </label>
              <label className="field">
                <span className="field__label">Schedule</span>
                <input
                  className="input"
                  type="datetime-local"
                  aria-describedby="email-schedule-hint"
                  value={isoToLocalInput(email.scheduled_at, zone)}
                  onChange={(event) =>
                    set(
                      "scheduled_at",
                      event.target.value ? localInputToIso(event.target.value, zone) : "",
                    )
                  }
                />
                <span id="email-schedule-hint" className="field__hint">
                  In your time zone. Empty: sent on the next pass.
                </span>
              </label>
              {email.target.mode === "selected" && (
                <>
                  <div className="form-grid__span">
                    <RecipientPicker
                      idPrefix="email-recipients"
                      selected={accounts}
                      onChange={setAccounts}
                      disabled={pending || quotaFull}
                    />
                  </div>
                  <label className="field form-grid__span">
                    <span className="field__label">Email addresses</span>
                    <textarea
                      className="textarea"
                      rows={3}
                      maxLength={190000}
                      placeholder="Addresses outside the directory, one per line"
                      value={emails}
                      onChange={(event) => setEmails(event.target.value)}
                    />
                  </label>
                </>
              )}
            </div>
          </fieldset>
          {quotaFull && (
            <Callout role="status" tone="attention" compact>
              Email queue quota reached. Wait for today&apos;s quota to reset or for queued jobs to
              send.
            </Callout>
          )}
          {state.message && (
            <Callout
              tone={state.status === "error" ? "danger" : "success"}
              role={state.status === "error" ? "alert" : "status"}
              compact
            >
              {state.message}
            </Callout>
          )}
          <div className="form-actions">
            <Button variant="primary" type="submit" disabled={pending || quotaFull}>
              <Send size={16} aria-hidden="true" />
              {pending ? "Queueing…" : "Queue email"}
            </Button>
          </div>
        </form>
      </Section>

      <Section id="admin-email-jobs" title="Queue" eyebrow="Delivery">
        <DataTable
          columns={COLUMNS}
          caption="Queued email"
          isEmpty={queue.jobs.length === 0}
          empty={
            <EmptyState
              title="No email jobs queued."
              description="Queued messages and their delivery status appear here."
              compact
            />
          }
        >
          {queue.jobs.map((job) => (
            <tr key={job.id}>
              <td>
                <span className="data-table__primary">{job.subject}</span>
                <span className="data-table__secondary">
                  <ShortId value={job.id} />
                </span>
              </td>
              <td>
                <StatusPill value={job.status} />
              </td>
              <td>{recipientLabel(job.target)}</td>
              <td>
                <Timestamp value={job.scheduled_at} now={now} fallback="Immediate" />
              </td>
              <td className="data-table__num">
                {formatNumber(job.attempts)} / {formatNumber(job.max_attempts)}
              </td>
              <td>
                <JobDetail job={job} now={now} />
              </td>
            </tr>
          ))}
        </DataTable>
      </Section>
    </>
  );
}
