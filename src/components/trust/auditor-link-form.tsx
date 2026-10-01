"use client";

import { useActionState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * An auditor's link: who it is for, how long it lasts, why. The link is shown once, here,
 * after it is made — HQ keeps only its hash.
 */
export function AuditorLinkForm({ action, disabled }: { action: Action; disabled: boolean }) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form" action={formAction}>
      <AttemptField state={state} />
      <Field id="auditor-label" label="Who it is for" hint="The audit firm and the auditor.">
        <Input id="auditor-label" name="label" maxLength={160} disabled={disabled || isPending} />
      </Field>
      <div className="form-grid">
        <Field id="auditor-days" label="Lasts (days)" hint="1 to 30.">
          <Input
            id="auditor-days"
            name="days"
            type="number"
            min={1}
            max={30}
            defaultValue={14}
            disabled={disabled || isPending}
          />
        </Field>
        <Field id="auditor-reason" label="Why">
          <Input
            id="auditor-reason"
            name="reason"
            maxLength={400}
            disabled={disabled || isPending}
          />
        </Field>
      </div>
      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={disabled || isPending}>
          {isPending ? "Making it…" : "Make the link"}
        </Button>
      </div>
      {state.status === "sent" && state.secret ? (
        <div className="one-time-secret" role="status">
          <p className="one-time-secret__label">{state.message}</p>
          <code className="one-time-secret__value">{state.secret}</code>
        </div>
      ) : (
        <FormFeedback state={state} />
      )}
    </form>
  );
}
