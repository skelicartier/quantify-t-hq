"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/ui/form-feedback";
import { Field, Input } from "@/components/ui/field";
import { AttemptField } from "@/components/ui/attempt-field";
import { INITIAL_DESK_STATE, type DeskActionState } from "@/lib/support/desk-state";

type Candidate = { id: string; subject: string };

type MergeFormProps = {
  ticketId: string;
  /** Other open conversations from the same account: the usual duplicates. */
  candidates: readonly Candidate[];
  action: (previous: DeskActionState, formData: FormData) => Promise<DeskActionState>;
};

/**
 * Fold this conversation into another. The kept one gets every message in time order,
 * the tags, the followers and the more urgent priority; this one is resolved and tagged
 * `merged`, with a note on both sides. Permanent, so the button says what it does.
 */
export function MergeForm({ ticketId, candidates, action }: MergeFormProps) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_DESK_STATE);
  const listId = `merge-into-options-${ticketId}`;
  return (
    <form className="stack-form" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="ticket_id" value={ticketId} />
      <Field
        id="ticket-merge-into"
        label="Merge into"
        hint="The conversation that carries on. This one is resolved and tagged merged; the messages move across in time order. Cannot be undone."
      >
        <Input
          id="ticket-merge-into"
          name="into"
          list={listId}
          placeholder="sup_…"
          defaultValue={candidates[0]?.id ?? ""}
          maxLength={64}
          disabled={isPending}
          required
        />
        <datalist id={listId}>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.subject}
            </option>
          ))}
        </datalist>
      </Field>
      <Button type="submit" variant="ghost" disabled={isPending}>
        {isPending ? "Merging…" : "Merge and resolve this one"}
      </Button>
      <FormFeedback state={state} sentLabel="Merged." />
    </form>
  );
}
