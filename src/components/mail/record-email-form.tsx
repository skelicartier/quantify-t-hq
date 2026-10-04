"use client";

import { useActionState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";
import { submitWithoutReset } from "@/lib/forms/submit-without-reset";

export type EmailRecipient = { value: string; label: string };

/**
 * The words of an email written on a record. Sent with `onSubmit` rather than a form
 * action, so a refusal (a stop, the mailbox's day used up) leaves what was typed in the
 * box; a sent one clears it.
 */
export function RecordEmailForm({
  action,
  recipients,
  mailboxes,
  returnPath,
  dealId = "",
  idPrefix,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  recipients: readonly EmailRecipient[];
  /** The writer's own mailboxes that are sending; the email goes from the one chosen. */
  mailboxes: readonly EmailRecipient[];
  returnPath: string;
  dealId?: string;
  idPrefix: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const only = recipients.length === 1 ? recipients[0] : undefined;
  const oneMailbox = mailboxes.length === 1 ? mailboxes[0] : undefined;
  return (
    <form
      className="record-email"
      onSubmit={submitWithoutReset(formAction)}
      key={state.sentAt ?? "record-email"}
    >
      <AttemptField state={state} />
      <input type="hidden" name="return_path" value={returnPath} />
      {dealId && <input type="hidden" name="deal_id" value={dealId} />}
      {oneMailbox ? (
        <>
          <input type="hidden" name="mailbox_id" value={oneMailbox.value} />
          <p className="record-email__from">
            From your mailbox, <span className="mono">{oneMailbox.label}</span>
          </p>
        </>
      ) : (
        <Field id={`${idPrefix}-from`} label="From">
          <Select id={`${idPrefix}-from`} name="mailbox_id" disabled={isPending}>
            {mailboxes.map((mailbox) => (
              <option key={mailbox.value} value={mailbox.value}>
                {mailbox.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {only ? (
        <>
          <input type="hidden" name="recipient" value={only.value} />
          <p className="record-email__to">To {only.label}</p>
        </>
      ) : (
        <Field id={`${idPrefix}-to`} label="To">
          <Select id={`${idPrefix}-to`} name="recipient" disabled={isPending}>
            {recipients.map((recipient) => (
              <option key={recipient.value} value={recipient.value}>
                {recipient.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field id={`${idPrefix}-subject`} label="Subject">
        <Input
          id={`${idPrefix}-subject`}
          name="subject"
          maxLength={200}
          required
          disabled={isPending}
        />
      </Field>
      <Field
        id={`${idPrefix}-body`}
        label="Email"
        hint="Sent as you wrote it, with the line that lets them say no more."
      >
        <Textarea
          id={`${idPrefix}-body`}
          name="body"
          rows={8}
          maxLength={10_000}
          required
          disabled={isPending}
        />
      </Field>
      <Button type="submit" variant="primary" disabled={isPending}>
        {isPending ? "Sending…" : "Send now"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}
