"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { AttemptField } from "@/components/ui/attempt-field";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/** Leaves for the calendar's consent screen; the browser returns to Integrations. */
export function CalendarConnectForm({
  action,
  disabled,
  reconnect = false,
}: {
  action: Action;
  disabled: boolean;
  reconnect?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="inline-form" action={formAction}>
      <AttemptField state={state} />
      <Button
        type="submit"
        variant={reconnect ? "default" : "primary"}
        size="small"
        disabled={isPending || disabled}
      >
        {isPending ? "Opening…" : reconnect ? "Reconnect" : "Connect calendar"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

export function CalendarSyncForm({ action }: { action: Action }) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="inline-form" action={formAction}>
      <AttemptField state={state} />
      <Button type="submit" size="small" disabled={isPending}>
        {isPending ? "Syncing…" : "Sync now"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

export function CalendarDisconnectForm({
  action,
  disabled,
}: {
  action: Action;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <AttemptField state={state} />
      <Field id="calendar-disconnect-reason" label="Reason" hint="Kept in the audit log.">
        <Input
          id="calendar-disconnect-reason"
          name="reason"
          maxLength={400}
          required
          disabled={isPending || disabled}
        />
      </Field>
      <Button type="submit" variant="danger" size="small" disabled={isPending || disabled}>
        {isPending ? "Disconnecting…" : "Disconnect"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}
