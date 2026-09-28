"use client";

import { useActionState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type RowButton = {
  label: string;
  className: string;
  /** Submitted as `name=value` so one form can carry several decisions. */
  name?: string;
  value?: string;
  ariaLabel?: string;
  ariaPressed?: boolean;
  pendingLabel?: string;
};

type RowActionProps = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  buttons: readonly RowButton[];
  className?: string;
  /** Announced on success; omitted for a tick whose new state is its own message. */
  sentLabel?: string;
};

/**
 * A one-row write — tick a task, approve a request, sign a session out — with what a
 * form owes the person: the button disables while it runs, a refusal is announced
 * beside the row instead of vanishing, and a repeat submit replays rather than repeats.
 */
export function RowAction({ action, fields, buttons, className, sentLabel }: RowActionProps) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form action={formAction} className={className}>
      <AttemptField state={state} />
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {buttons.map((button) => (
        <button
          key={`${button.name ?? "submit"}:${button.value ?? button.label}`}
          type="submit"
          className={button.className}
          name={button.name}
          value={button.value}
          aria-label={button.ariaLabel}
          aria-pressed={button.ariaPressed}
          disabled={isPending}
        >
          {isPending && button.pendingLabel ? button.pendingLabel : button.label}
        </button>
      ))}
      <FormFeedback state={state} sentLabel={sentLabel} />
    </form>
  );
}
