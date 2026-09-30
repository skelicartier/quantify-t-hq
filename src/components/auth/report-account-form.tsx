"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { AttemptField } from "@/components/ui/attempt-field";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/** One press, confirmed by the page's own words; the answer replaces the button. */
export function ReportAccountForm({ action, token }: { action: Action; token: string }) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  if (state.status === "sent") {
    return (
      <div className="auth-form">
        <Callout tone="success" role="status" compact>
          {state.message}
        </Callout>
      </div>
    );
  }
  return (
    <>
      <form className="auth-form" action={formAction}>
        <AttemptField state={state} />
        <input type="hidden" name="token" value={token} />
        <Button variant="danger" type="submit" block disabled={isPending}>
          {isPending ? "Locking…" : "This wasn't me — lock my account"}
        </Button>
      </form>
      {state.status === "error" && state.message && (
        <Callout tone="danger" role="alert" compact className="auth__note">
          {state.message}
        </Callout>
      )}
    </>
  );
}
