"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input, describedBy } from "@/components/ui/field";
import { AttemptField } from "@/components/ui/attempt-field";
import { INITIAL_AUTH_STATE, type AuthFormState } from "@/lib/auth/form-state";

const TOTP_CODE_LENGTH = 6;

type CodeFormProps = {
  action: (previous: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  nextPath: string;
  /** The recovery variant takes the longer dashed code instead of six digits. */
  mode: "code" | "recovery";
};

export function CodeForm({ action, nextPath, mode }: CodeFormProps) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_AUTH_STATE);
  const isRecovery = mode === "recovery";
  const id = isRecovery ? "recovery-code" : "totp-code";
  return (
    <>
      <form className="auth-form" action={formAction} noValidate>
        <AttemptField state={state} />
        <input type="hidden" name="next" value={nextPath} />
        <Field
          id={id}
          label={isRecovery ? "Recovery code" : "Authenticator code"}
          hint={
            isRecovery
              ? "One of the codes you saved when you enrolled. Each works once."
              : "The six digits your authenticator app shows."
          }
        >
          <Input
            id={id}
            name={isRecovery ? "recovery_code" : "code"}
            inputMode={isRecovery ? "text" : "numeric"}
            autoComplete="one-time-code"
            {...(isRecovery ? {} : { pattern: `\\d{${TOTP_CODE_LENGTH}}` })}
            maxLength={isRecovery ? 16 : TOTP_CODE_LENGTH}
            autoFocus
            required
            disabled={isPending}
            aria-describedby={describedBy(id, {})}
          />
        </Field>
        <Button variant="primary" type="submit" block disabled={isPending}>
          {isPending ? "Verifying…" : "Verify and continue"}
        </Button>
      </form>
      <p className="auth__alt">
        {isRecovery ? (
          <Link href={`/login/verify?next=${encodeURIComponent(nextPath)}`}>
            Use your authenticator instead
          </Link>
        ) : (
          <Link href={`/login/verify?mode=recovery&next=${encodeURIComponent(nextPath)}`}>
            Lost your device? Use a recovery code
          </Link>
        )}
      </p>
      {state.message && (
        <Callout tone="danger" role="alert" compact className="auth__note">
          {state.message}
        </Callout>
      )}
    </>
  );
}
