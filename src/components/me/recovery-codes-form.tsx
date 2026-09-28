"use client";

import { useActionState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

/**
 * Ten new recovery codes, shown once in the response to the person who asked. The old
 * codes die the moment these exist, so the button says so before it is pressed.
 */
export function RecoveryCodesForm({
  action,
  disabled,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const codes = state.status === "sent" && state.secret ? state.secret.split(" ") : [];
  return (
    <form action={formAction} className="stack-form">
      <AttemptField state={state} />
      <Button type="submit" size="small" disabled={disabled || isPending}>
        {isPending ? "Generating…" : "Generate new recovery codes"}
      </Button>
      <p className="muted">Generating new codes retires every code you hold now.</p>
      {codes.length > 0 && (
        <div className="one-time-secret" role="status">
          <p className="one-time-secret__label">Copy them now. They will not be shown again.</p>
          <ul className="one-time-secret__list">
            {codes.map((code) => (
              <li key={code}>
                <code className="one-time-secret__value">{code}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      {codes.length === 0 && <FormFeedback state={state} />}
    </form>
  );
}
