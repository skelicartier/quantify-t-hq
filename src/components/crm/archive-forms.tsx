"use client";

import { useActionState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * "Archive" on a company or a person: off every list, kept whole, put back from Archived.
 * The reason is kept with it; a refusal says what keeps the record on the lists.
 */
export function ArchiveForm({
  action,
  kind,
  recordId,
  noun,
}: {
  action: Action;
  kind: "companies" | "people";
  recordId: string;
  noun: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <details className="popover popover--start archive-menu">
      <summary className="btn btn--small btn--ghost popover__trigger">Archive</summary>
      <div className="popover__panel popover__panel--narrow">
        <form className="stack-form stack-form--tight" action={formAction}>
          <AttemptField state={state} />
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="record_id" value={recordId} />
          <p className="field__hint">
            The {noun} leaves every list, search and mail audience, and keeps everything linked to
            it. Put it back from Archived at any time.
          </p>
          <div className="field">
            <div className="field__label">
              <label htmlFor={`archive-${recordId}`}>Why</label>
            </div>
            <input
              id={`archive-${recordId}`}
              className="input"
              name="reason"
              minLength={4}
              maxLength={400}
              required
              placeholder="e.g. Wound up its fund"
            />
          </div>
          <Button type="submit" variant="danger" disabled={isPending}>
            {isPending ? "Archiving…" : `Archive this ${noun}`}
          </Button>
          <FormFeedback state={state} />
        </form>
      </div>
    </details>
  );
}
