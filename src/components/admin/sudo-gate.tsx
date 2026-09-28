"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/ui/form-feedback";
import { AttemptField } from "@/components/ui/attempt-field";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type SudoGateProps = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  fresh: boolean;
  /** Pre-formatted by the page ("14:32 UTC"), so this component never reads a clock. */
  untilLabel: string | null;
  returnPath: string;
  /** What the window unlocks on this page, in one sentence. */
  purpose: string;
};

/**
 * Confirm-it's-you before a change that opens or closes a door. A code from the
 * authenticator app buys ten minutes; the service checks the window on every such
 * request, so this panel is a convenience, not the control.
 */
export function SudoGate({ action, fresh, untilLabel, returnPath, purpose }: SudoGateProps) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  if (fresh) {
    return (
      <p className="sudo-gate sudo-gate--open" role="status">
        <span className="sudo-gate__mark" aria-hidden="true" />
        Identity confirmed{untilLabel ? ` until ${untilLabel}` : ""}. Sensitive changes are open.
      </p>
    );
  }
  return (
    <form className="sudo-gate" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="return_path" value={returnPath} />
      <div className="sudo-gate__text">
        <strong>Confirm it&apos;s you</strong>
        <span>{purpose}</span>
      </div>
      <label className="sr-only" htmlFor="sudo-code">
        Authenticator code
      </label>
      <input
        id="sudo-code"
        className="input sudo-gate__code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        required
        placeholder="6 digits"
        disabled={isPending}
      />
      <Button type="submit" size="small" variant="primary" disabled={isPending}>
        {isPending ? "Checking…" : "Confirm"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}
