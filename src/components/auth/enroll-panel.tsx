"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input, describedBy } from "@/components/ui/field";
import { AttemptField } from "@/components/ui/attempt-field";
import { INITIAL_ENROLLMENT_STATE, type EnrollmentState } from "@/lib/auth/form-state";

type EnrollPanelProps = {
  beginAction: (previous: EnrollmentState, formData: FormData) => Promise<EnrollmentState>;
  confirmAction: (previous: EnrollmentState, formData: FormData) => Promise<EnrollmentState>;
  nextPath: string;
};

/**
 * First sign-in: mint the secret, add it to an authenticator, prove one code, save
 * the recovery codes. The secret and the codes each render exactly once — neither is
 * retrievable after this screen.
 */
export function EnrollPanel({ beginAction, confirmAction, nextPath }: EnrollPanelProps) {
  const [state, formAction, isPending] = useActionState(
    async (previous: EnrollmentState, formData: FormData) =>
      previous.step === "begin"
        ? beginAction(previous, formData)
        : confirmAction(previous, formData),
    INITIAL_ENROLLMENT_STATE,
  );

  if (state.step === "done") {
    return (
      <div className="auth-form">
        <h2>Save your recovery codes</h2>
        <p className="auth__desc">
          Each code signs you in once if your authenticator is lost. They are shown only now — keep
          them somewhere that is not this computer.
        </p>
        <ol className="recovery-codes">
          {state.recoveryCodes.map((code) => (
            <li key={code}>
              <code>{code}</code>
            </li>
          ))}
        </ol>
        <Link className="btn btn--primary btn--block" href={state.next}>
          I saved them — continue
        </Link>
      </div>
    );
  }

  if (state.step === "show-secret") {
    return (
      <>
        <form className="auth-form" action={formAction} noValidate>
          <AttemptField state={state} />
          <input type="hidden" name="next" value={nextPath} />
          <h2>Add HQ to your authenticator</h2>
          <p className="auth__desc">
            In your authenticator app, add an account by entering this key (or open the setup link
            on the device that has the app).
          </p>
          <p className="secret-once">
            <code>{state.secret}</code>
          </p>
          <p className="auth__alt">
            <a href={state.otpauthUri}>Open in an authenticator app</a>
          </p>
          <Field
            id="enroll-code"
            label="Enter the six-digit code it shows"
            hint="This proves the app holds the key before anything depends on it."
          >
            <Input
              id="enroll-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              autoFocus
              required
              disabled={isPending}
              aria-describedby={describedBy("enroll-code", {})}
            />
          </Field>
          <Button variant="primary" type="submit" block disabled={isPending}>
            {isPending ? "Confirming…" : "Confirm and finish"}
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

  return (
    <>
      <form className="auth-form" action={formAction} noValidate>
        <AttemptField state={state} />
        <input type="hidden" name="next" value={nextPath} />
        <p className="auth__desc">
          Your account needs an authenticator app before it can sign in. You will get a setup key,
          confirm one code, and save ten recovery codes.
        </p>
        <Button variant="primary" type="submit" block disabled={isPending}>
          {isPending ? "Preparing…" : "Set up my authenticator"}
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
