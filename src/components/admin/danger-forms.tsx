"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { AttemptField } from "@/components/ui/attempt-field";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

export function RetentionRulesForm({
  action,
  rules,
  minDays,
  maxDays,
  disabled,
}: {
  action: Action;
  rules: { disqualified: number; quiet: number };
  minDays: number;
  maxDays: number;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const off = isPending || disabled;
  return (
    <form className="stack-form" action={formAction}>
      <AttemptField state={state} />
      <div className="stage-form__grid">
        <Field
          id="retention-disqualified"
          label="Disqualified leads (days)"
          hint="Untouched this long after disqualifying. 0 keeps them."
        >
          <Input
            id="retention-disqualified"
            name="disqualified_lead_days"
            type="number"
            inputMode="numeric"
            min={0}
            max={maxDays}
            defaultValue={rules.disqualified}
            required
            disabled={off}
          />
        </Field>
        <Field
          id="retention-quiet"
          label="Open leads nobody works (days)"
          hint="New, attempting or connected, untouched this long. 0 keeps them."
        >
          <Input
            id="retention-quiet"
            name="quiet_lead_days"
            type="number"
            inputMode="numeric"
            min={0}
            max={maxDays}
            defaultValue={rules.quiet}
            required
            disabled={off}
          />
        </Field>
      </div>
      <p className="field__hint">
        Otherwise {minDays} to {maxDays} days. A shorter rule reaches more leads at the next run.
      </p>
      <Field id="retention-reason" label="Why" hint="Kept in the audit log with the change.">
        <Input
          id="retention-reason"
          name="reason"
          minLength={8}
          maxLength={400}
          required
          disabled={off}
        />
      </Field>
      <div className="stage-form__foot">
        <Button type="submit" size="small" disabled={off}>
          {isPending ? "Saving…" : "Save the rules"}
        </Button>
      </div>
      <FormFeedback state={state} />
    </form>
  );
}

/**
 * An act that cannot be taken back: the button arms only when the exact phrase is
 * typed. The service checks the phrase again, and for a run the phrase carries the
 * count shown, so a number that moved since the page loaded is refused, not applied.
 *
 * The component stays mounted when there is nothing left to do (`phrase` empty), so
 * the result of the act that emptied the queue is still on screen after the page
 * refreshes around it — and focus moves to that result, since the button that held it
 * is gone.
 */
function TypedConfirmForm({
  action,
  phrase,
  idPrefix,
  reasonLabel,
  buttonLabel,
  pendingLabel,
  disabled,
  lead,
  idle,
}: {
  action: Action;
  phrase: string;
  idPrefix: string;
  reasonLabel: string;
  buttonLabel: string;
  pendingLabel: string;
  disabled: boolean;
  /** What will happen, above the form. */
  lead?: ReactNode;
  /** Shown instead of the form when there is nothing to do. */
  idle?: ReactNode;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [typed, setTyped] = useState("");
  const armed = phrase !== "" && typed.trim().toLowerCase() === phrase;
  const off = isPending || disabled;
  const result = useRef<HTMLDivElement>(null);
  const settled = !phrase && state.status === "sent";
  useEffect(() => {
    if (settled) result.current?.focus();
  }, [settled, state.sentAt]);
  if (!phrase) {
    return (
      <div ref={result} tabIndex={-1} className="danger-result">
        <FormFeedback state={state} />
        {idle}
      </div>
    );
  }
  return (
    <form className="stack-form" action={formAction} key={state.sentAt ?? "ready"}>
      <AttemptField state={state} />
      {lead}
      <Field id={`${idPrefix}-reason`} label={reasonLabel} hint="Kept in the audit log.">
        <Input
          id={`${idPrefix}-reason`}
          name="reason"
          minLength={8}
          maxLength={400}
          required
          disabled={off}
        />
      </Field>
      <Field
        id={`${idPrefix}-confirm`}
        label={
          <>
            Type <span className="mono typed-phrase">{phrase}</span> to confirm
          </>
        }
      >
        <Input
          id={`${idPrefix}-confirm`}
          name="confirm"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          disabled={off}
        />
      </Field>
      <div className="stage-form__foot">
        <Button type="submit" size="small" variant="danger" disabled={off || !armed}>
          {isPending ? pendingLabel : buttonLabel}
        </Button>
      </div>
      <FormFeedback state={state} />
    </form>
  );
}

export function RetentionRunForm({
  action,
  phrase,
  thisRun,
  due,
  batch,
  disabled,
}: {
  action: Action;
  /** Empty when nothing is due. */
  phrase: string;
  thisRun: number;
  due: number;
  batch: number;
  disabled: boolean;
}) {
  return (
    <TypedConfirmForm
      action={action}
      phrase={phrase}
      idPrefix="retention-run"
      reasonLabel="Why run it now"
      buttonLabel="Anonymise now"
      pendingLabel="Anonymising…"
      disabled={disabled}
      lead={
        <p className="danger-count">
          <strong>
            {thisRun} {thisRun === 1 ? "lead" : "leads"}
          </strong>{" "}
          will be anonymised.
          {due > thisRun && ` ${due - thisRun} more are due; a run takes ${batch} at a time.`}
        </p>
      }
      idle={<p className="side-quiet">Nothing is due under the current rules.</p>}
    />
  );
}

export function SignEveryoneOutForm({
  action,
  phrase,
  disabled,
}: {
  action: Action;
  phrase: string;
  disabled: boolean;
}) {
  return (
    <TypedConfirmForm
      action={action}
      phrase={phrase}
      idPrefix="sign-out"
      reasonLabel="What happened"
      buttonLabel="Sign everyone out"
      pendingLabel="Signing out…"
      disabled={disabled}
    />
  );
}
