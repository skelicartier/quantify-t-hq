"use client";

import { useActionState, useEffect, useState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

const SHOWN_FOR_MS = 60_000;

/**
 * A masked value with a way to see it: a reason, a fresh code, and the value for a
 * minute before it is masked again. The value travels only in the action's answer to
 * the person who asked; the page itself never holds it.
 */
export function RevealField({
  action,
  staffId,
  field,
  masked,
  label,
  oneOnOneId,
  disabled,
}: {
  action: Action;
  staffId: string;
  field: string;
  masked: string;
  label: string;
  oneOnOneId?: string;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [open, setOpen] = useState(false);
  const [hiddenFor, setHiddenFor] = useState(0);
  useEffect(() => {
    if (state.status !== "sent" || !state.sentAt) return;
    const at = state.sentAt;
    const timer = setTimeout(() => setHiddenFor(at), SHOWN_FOR_MS);
    return () => clearTimeout(timer);
  }, [state.status, state.sentAt]);
  const showing = state.status === "sent" && Boolean(state.sentAt) && hiddenFor !== state.sentAt;
  const id = `reveal-${field}-${(oneOnOneId ?? staffId).slice(0, 8)}`;

  if (showing) {
    return (
      <span className="reveal reveal--shown">
        <span className="reveal__value">{state.secret || "—"}</span>
        <span className="reveal__note">Shown for a minute; the reveal is in the audit log.</span>
      </span>
    );
  }
  return (
    <span className="reveal">
      <span className="reveal__masked">{masked || "Hidden"}</span>
      {!open ? (
        <button type="button" className="btn btn--small btn--ghost" onClick={() => setOpen(true)}>
          Reveal
        </button>
      ) : (
        <form className="stack-form stack-form--tight reveal__form" action={formAction} id={id}>
          <AttemptField state={state} />
          <input type="hidden" name="staff_id" value={staffId} />
          <input type="hidden" name="field" value={field} />
          {oneOnOneId && <input type="hidden" name="one_on_one_id" value={oneOnOneId} />}
          <Field
            id={`${id}-reason`}
            label={`Why you need the ${label.toLowerCase()}`}
            hint={
              disabled
                ? "Confirm a fresh code from your authenticator app first."
                : "Kept in the audit log, with your name."
            }
          >
            <Input
              id={`${id}-reason`}
              name="reason"
              maxLength={400}
              required
              disabled={isPending || disabled}
            />
          </Field>
          <Button type="submit" disabled={isPending || disabled}>
            {isPending ? "Revealing…" : "Show it"}
          </Button>
          <FormFeedback state={state} />
        </form>
      )}
    </span>
  );
}
