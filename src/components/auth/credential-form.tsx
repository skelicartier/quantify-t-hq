"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input, describedBy } from "@/components/ui/field";
import { INITIAL_AUTH_STATE, type AuthFormState } from "@/lib/auth/form-state";

type CredentialFormProps = {
  action: (previous: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  nextPath: string;
};

export function CredentialForm({ action, nextPath }: CredentialFormProps) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_AUTH_STATE);
  return (
    <>
      <form className="auth-form" action={formAction} noValidate>
        <input type="hidden" name="next" value={nextPath} />
        <Field id="email" label="Email address">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@quantifyterminal.com"
            maxLength={254}
            required
            disabled={isPending}
            aria-describedby={describedBy("email", {})}
          />
        </Field>
        <Field id="password" label="Password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            maxLength={1_024}
            required
            disabled={isPending}
            aria-describedby={describedBy("password", {})}
          />
          <Link className="field__assist" href="/forgot-password">
            Forgot password?
          </Link>
        </Field>
        <Button variant="primary" type="submit" block disabled={isPending}>
          {isPending ? "Checking…" : "Continue"}
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
