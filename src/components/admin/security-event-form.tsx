"use client";

import { useActionState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * What an owner does with one event: acknowledge it (seen, being looked at), resolve it
 * with what was found, or reopen it. A critical event cannot close without a note.
 */
export function SecurityEventForm({
  action,
  eventId,
  state,
  critical,
}: {
  action: Action;
  eventId: string;
  state: string;
  critical: boolean;
}) {
  const [result, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const noteId = `note-${eventId}`;
  return (
    <form className="security-event__form" action={formAction}>
      <AttemptField state={result} />
      <input type="hidden" name="event_id" value={eventId} />
      {state !== "resolved" && (
        <label className="security-event__note" htmlFor={noteId}>
          <span className="sr-only">Note</span>
          <input
            id={noteId}
            className="input input--small"
            name="note"
            maxLength={400}
            placeholder={critical ? "What was found (needed to resolve)" : "Note (optional)"}
            disabled={isPending}
          />
        </label>
      )}
      <div className="security-event__buttons">
        {state === "open" && (
          <button
            type="submit"
            name="state"
            value="acknowledged"
            className="btn btn--small btn--ghost"
            disabled={isPending}
          >
            Acknowledge
          </button>
        )}
        {state !== "resolved" ? (
          <button
            type="submit"
            name="state"
            value="resolved"
            className="btn btn--small"
            disabled={isPending}
          >
            {isPending ? "Saving…" : "Resolve"}
          </button>
        ) : (
          <button
            type="submit"
            name="state"
            value="open"
            className="btn btn--small btn--ghost"
            disabled={isPending}
          >
            Reopen
          </button>
        )}
      </div>
      <FormFeedback state={result} />
    </form>
  );
}
