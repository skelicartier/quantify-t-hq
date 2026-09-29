"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/ui/form-feedback";
import { Field, Input } from "@/components/ui/field";
import { AttemptField } from "@/components/ui/attempt-field";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Candidate = { id: string; label: string };

/**
 * Fold THIS record into another. The kept record gets everything that pointed here —
 * people, deals, notes, activity — and any blank filled from this one; this one is
 * archived and marked. Permanent, so the button says exactly that.
 */
export function MergeRecordForm({
  action,
  idField,
  recordId,
  noun,
  candidates,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  /** "company_id" or "person_id". */
  idField: string;
  recordId: string;
  noun: "company" | "person";
  /** Likely targets first; anything else can be typed as an id. */
  candidates: readonly Candidate[];
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const listId = `merge-${noun}-${recordId}`;
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name={idField} value={recordId} />
      <Field
        id={`${listId}-into`}
        label={`Keep which ${noun}?`}
        hint={`Everything here moves to it; this ${noun} is archived and its ${noun === "company" ? "domain" : "address"} released. Cannot be undone.`}
      >
        <Input
          id={`${listId}-into`}
          name="into"
          list={listId}
          placeholder="Pick, or paste an id"
          defaultValue={candidates[0]?.id ?? ""}
          maxLength={64}
          required
          disabled={isPending}
        />
        <datalist id={listId}>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.label}
            </option>
          ))}
        </datalist>
      </Field>
      <Button type="submit" size="small" variant="ghost" disabled={isPending}>
        {isPending ? "Merging…" : `Merge and archive this ${noun}`}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}
