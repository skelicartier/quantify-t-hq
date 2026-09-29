"use client";

import { useActionState, type ReactNode } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * One mail form: hidden fields, whatever inputs the page composes, one submit, the
 * outcome under it — and, for the one response that carries a secret (a new webhook
 * address), the secret shown once.
 */
export function MailForm({
  action,
  fields = {},
  children,
  submitLabel,
  pendingLabel = "Working…",
  variant = "default",
  className = "stack-form stack-form--tight",
  disabled = false,
  secretHint,
  buttonName,
  buttonValue,
}: {
  action: Action;
  fields?: Record<string, string>;
  children?: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  variant?: ButtonVariant;
  className?: string;
  disabled?: boolean;
  secretHint?: string;
  buttonName?: string;
  buttonValue?: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const showSecret = state.status === "sent" && Boolean(state.secret);
  return (
    <>
      <form className={className} action={formAction}>
        <AttemptField state={state} />
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        {children}
        <div className="form-actions">
          <Button
            type="submit"
            size="small"
            variant={variant}
            disabled={isPending || disabled}
            name={buttonName}
            value={buttonValue}
          >
            {isPending ? pendingLabel : submitLabel}
          </Button>
        </div>
        {!showSecret && <FormFeedback state={state} />}
      </form>
      {showSecret && (
        <div className="one-time-secret" role="status">
          <p className="one-time-secret__label">{state.message}</p>
          <code className="one-time-secret__value">{state.secret}</code>
          {secretHint && <p className="one-time-secret__hint">{secretHint}</p>}
        </div>
      )}
    </>
  );
}
