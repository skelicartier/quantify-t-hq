"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { AttemptField } from "@/components/ui/attempt-field";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Mint a key. The full key comes back once, in this form's own state, and is shown
 * until the page is left — it is never stored in HQ or rendered into a page again.
 */
export function MintKeyForm({ action, disabled }: { action: Action; disabled: boolean }) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <>
      <form className="stack-form stack-form--tight" action={formAction}>
        <AttemptField state={state} />
        <Field id="key-name" label="What will hold it" hint="e.g. Website early-access form.">
          <Input
            id="key-name"
            name="name"
            maxLength={80}
            required
            disabled={isPending || disabled}
          />
        </Field>
        <Field id="key-reason" label="Why a new key" hint="Kept with the key in the audit log.">
          <Input
            id="key-reason"
            name="reason"
            maxLength={400}
            required
            disabled={isPending || disabled}
          />
        </Field>
        <Field
          id="key-lifetime"
          label="Lives for"
          hint="Every key expires. Rotate before the day; the old key keeps working until then."
        >
          <Select
            id="key-lifetime"
            name="expires_in_days"
            defaultValue="180"
            disabled={isPending || disabled}
          >
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="180">180 days</option>
          </Select>
        </Field>
        <Button variant="primary" type="submit" disabled={isPending || disabled}>
          {isPending ? "Minting…" : "Mint key"}
        </Button>
        {!(state.status === "sent" && state.secret) && <FormFeedback state={state} />}
      </form>
      {state.status === "sent" && state.secret && (
        <div className="one-time-secret" role="status">
          <p className="one-time-secret__label">Copy it now. It will not be shown again.</p>
          <code className="one-time-secret__value">{state.secret}</code>
          <p className="one-time-secret__hint">
            Store it as the website&apos;s intake key. Only the first eight characters after the
            prefix stay visible in HQ.
          </p>
        </div>
      )}
    </>
  );
}

export function RevokeKeyForm({
  action,
  keyId,
  keyName,
  disabled,
}: {
  action: Action;
  keyId: string;
  keyName: string;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="inline-form" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="key_id" value={keyId} />
      <label className="sr-only" htmlFor={`revoke-reason-${keyId}`}>
        Reason for revoking {keyName}
      </label>
      <input
        id={`revoke-reason-${keyId}`}
        className="input input--small"
        name="reason"
        maxLength={400}
        required
        placeholder="Reason"
        disabled={isPending || disabled}
      />
      <Button type="submit" size="small" variant="danger" disabled={isPending || disabled}>
        {isPending ? "Revoking…" : "Revoke"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}
