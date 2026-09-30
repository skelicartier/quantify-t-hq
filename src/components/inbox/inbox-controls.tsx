"use client";

import { useActionState, useMemo } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/** Times worth snoozing to, in the reader's own zone: an hour, tomorrow at nine, Monday at nine. */
function snoozeChoices(now: Date): Array<{ label: string; value: string }> {
  const inAnHour = new Date(now.getTime() + 60 * 60 * 1000);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const monday = new Date(now);
  monday.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
  monday.setHours(9, 0, 0, 0);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return [
    { label: "In an hour", value: inAnHour.toISOString() },
    { label: "Tomorrow, 09:00", value: tomorrow.toISOString() },
    { label: "Monday, 09:00", value: monday.toISOString() },
    { label: "In a week", value: nextWeek.toISOString() },
  ];
}

/**
 * The buttons on one inbox line: read or unread, done (or back to the inbox from Done),
 * and snooze. One form; each button names its act.
 */
export function InboxItemControls({
  action,
  notificationId,
  state,
  label,
}: {
  action: Action;
  notificationId: string;
  state: "unread" | "read" | "snoozed" | "done";
  label: string;
}) {
  const [result, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const choices = useMemo(() => snoozeChoices(new Date()), []);
  return (
    <form className="inbox-item__controls" action={formAction}>
      <AttemptField state={result} />
      <input type="hidden" name="notification_id" value={notificationId} />
      {state === "done" ? (
        <button
          type="submit"
          name="action"
          value="undone"
          className="btn btn--small btn--ghost"
          disabled={isPending}
          aria-label={`Move “${label}” back to the inbox`}
        >
          Back to inbox
        </button>
      ) : (
        <>
          <button
            type="submit"
            name="action"
            value={state === "unread" ? "read" : "unread"}
            className="btn btn--small btn--ghost"
            disabled={isPending}
            aria-label={`Mark “${label}” ${state === "unread" ? "read" : "unread"}`}
          >
            {state === "unread" ? "Mark read" : "Mark unread"}
          </button>
          <details className="popover popover--end inbox-item__snooze">
            <summary className="btn btn--small btn--ghost" aria-label={`Snooze “${label}”`}>
              Snooze
            </summary>
            <div className="popover__panel popover__panel--narrow">
              <p className="inbox-item__snooze-title">Bring it back</p>
              <div className="inbox-item__snooze-choices">
                {choices.map((choice) => (
                  <button
                    key={choice.label}
                    type="submit"
                    name="until"
                    value={choice.value}
                    className="btn btn--small btn--ghost"
                    disabled={isPending}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            </div>
          </details>
          <button
            type="submit"
            name="action"
            value="done"
            className="btn btn--small"
            disabled={isPending}
            aria-label={`Mark “${label}” done`}
          >
            Done
          </button>
        </>
      )}
      <FormFeedback state={result} />
    </form>
  );
}
