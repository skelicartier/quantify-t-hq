"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input, describedBy } from "@/components/ui/field";
import { AttemptField } from "@/components/ui/attempt-field";
import { INITIAL_AUTH_STATE, type AuthFormState } from "@/lib/auth/form-state";

type SingleFieldFormProps = {
  action: (previous: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  kind: "email" | "new-password";
  /** Carried through as a hidden field (the reset or invite token). */
  token?: string;
  submitLabel: string;
  pendingLabel: string;
  hint?: string;
};

/** The forgot/reset/invite screens are one field and one button; this is that form. */
export function SingleFieldForm({
  action,
  kind,
  token,
  submitLabel,
  pendingLabel,
  hint,
}: SingleFieldFormProps) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_AUTH_STATE);
  const isEmail = kind === "email";
  const id = isEmail ? "email" : "password";
  return (
    <>
      <form className="auth-form" action={formAction} noValidate>
        <AttemptField state={state} />
        {token !== undefined && <input type="hidden" name="token" value={token} />}
        <Field id={id} label={isEmail ? "Email address" : "New password"} hint={hint ?? null}>
          <Input
            id={id}
            name={id}
            type={isEmail ? "email" : "password"}
            autoComplete={isEmail ? "email" : "new-password"}
            maxLength={isEmail ? 254 : 1_024}
            {...(isEmail ? { autoCapitalize: "none" as const, spellCheck: false } : {})}
            autoFocus
            required
            disabled={isPending}
            aria-describedby={describedBy(id, { hint: hint ?? null })}
          />
        </Field>
        <Button variant="primary" type="submit" block disabled={isPending}>
          {isPending ? pendingLabel : submitLabel}
        </Button>
      </form>
      {state.message && (
        <Callout tone="danger" role="alert" compact className="auth__note">
          {state.message}
        </Callout>
      )}
    </>
  );
}
