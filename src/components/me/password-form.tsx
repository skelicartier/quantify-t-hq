"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input, describedBy } from "@/components/ui/field";
import { AttemptField } from "@/components/ui/attempt-field";
import { INITIAL_AUTH_STATE, type AuthFormState } from "@/lib/auth/form-state";

export function PasswordForm({
  action,
}: {
  action: (previous: AuthFormState, formData: FormData) => Promise<AuthFormState>;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_AUTH_STATE);
  return (
    <form className="stack-form" action={formAction} noValidate>
      <AttemptField state={state} />
      <Field id="current_password" label="Current password">
        <Input
          id="current_password"
          name="current_password"
          type="password"
          autoComplete="current-password"
          maxLength={1_024}
          required
          disabled={isPending}
          aria-describedby={describedBy("current_password", {})}
        />
      </Field>
      <Field
        id="new_password"
        label="New password"
        hint="At least 12 characters. Every other session signs out."
      >
        <Input
          id="new_password"
          name="new_password"
          type="password"
          autoComplete="new-password"
          maxLength={1_024}
          required
          disabled={isPending}
          aria-describedby={describedBy("new_password", {
            hint: "At least 12 characters. Every other session signs out.",
          })}
        />
      </Field>
      <Button variant="primary" type="submit" disabled={isPending}>
        {isPending ? "Updating…" : "Update password"}
      </Button>
      {state.message && (
        <Callout tone={state.status === "error" ? "danger" : "success"} role="status" compact>
          {state.message}
        </Callout>
      )}
    </form>
  );
}
