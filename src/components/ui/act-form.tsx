"use client";

import { useActionState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * One act on a record: hidden ids, the act, optional fields, one button. A date and
 * time typed into one of its fields is a wall clock in the person's zone; the action
 * reads it there (`typedInstant`), so no offset travels with the form.
 */
export function ActForm({
  action,
  hidden,
  act,
  label,
  children,
  danger = false,
  primary = false,
  disabled = false,
  tight = true,
}: {
  action: Action;
  hidden: Record<string, string>;
  act: string;
  label: string;
  children?: React.ReactNode;
  danger?: boolean;
  primary?: boolean;
  disabled?: boolean;
  tight?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className={tight ? "stack-form stack-form--tight" : "stack-form"} action={formAction}>
      <AttemptField state={state} />
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <input type="hidden" name="action" value={act} />
      {children}
      <Button
        type="submit"
        variant={danger ? "danger" : primary ? "primary" : "default"}
        disabled={isPending || disabled}
      >
        {isPending ? "Saving…" : label}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}
