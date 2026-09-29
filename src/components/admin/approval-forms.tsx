"use client";

import { useActionState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Field, Input } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/** Approve or decline one request, with a note the requester reads. */
export function DecideApprovalForm({
  action,
  approvalId,
  disabled,
}: {
  action: Action;
  approvalId: string;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const settled = state.status === "sent";
  const locked = isPending || disabled || settled;
  return (
    <form className="approval__decide" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="approval_id" value={approvalId} />
      <Field
        id={`approval-note-${approvalId}`}
        label="Note"
        hint="Optional. The requester reads it."
      >
        <Input id={`approval-note-${approvalId}`} name="note" maxLength={400} disabled={locked} />
      </Field>
      <div className="approval__buttons">
        <button
          type="submit"
          name="decision"
          value="approve"
          className="btn btn--small btn--primary"
          disabled={locked}
        >
          {isPending ? "Working…" : "Approve"}
        </button>
        <button
          type="submit"
          name="decision"
          value="decline"
          className="btn btn--small btn--ghost"
          disabled={locked}
        >
          Decline
        </button>
      </div>
      <FormFeedback state={state} />
    </form>
  );
}

/** The requester mints an approved key. The secret is shown here, to them, once. */
export function CollectKeyForm({
  action,
  approvalId,
  disabled,
}: {
  action: Action;
  approvalId: string;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const minted = state.status === "sent" && Boolean(state.secret);
  return (
    <>
      <form className="approval__collect" action={formAction}>
        <AttemptField state={state} />
        <input type="hidden" name="approval_id" value={approvalId} />
        <button
          type="submit"
          className="btn btn--small btn--primary"
          disabled={isPending || disabled || minted}
        >
          {isPending ? "Minting…" : "Collect the key"}
        </button>
        {!minted && <FormFeedback state={state} />}
      </form>
      {minted && (
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
