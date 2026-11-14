"use client";

import { useActionState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

/**
 * "Add a monthly reminder to Key dates" (raise spec §8.8): one press adds the Key date
 * "Send the monthly investor update" on the 10th of every month, through the Key dates
 * client. The page renders this always and says whether the reminder is still `wanted`
 * (none set, or the date is gone from Key dates); the component stays mounted, so once
 * the date is added the form gives way to the sentence that says so, and on the next
 * visit there is nothing at all.
 */
export function ReminderForm({
  action,
  wanted,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  wanted: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  if (state.status === "sent")
    return (
      <div className="hqdata-reminder">
        <FormFeedback state={state} />
      </div>
    );
  if (!wanted) return null;
  return (
    <div className="hqdata-reminder">
      <p className="page-note">
        Send the update on the same day each month: a Key date on the 10th, with a reminder two days
        before.
      </p>
      <form className="inline-form" action={formAction}>
        <AttemptField state={state} />
        <div className="form-actions">
          <Button type="submit" size="small" disabled={isPending}>
            {isPending ? "Adding…" : "Add a monthly reminder to Key dates"}
          </Button>
        </div>
        <FormFeedback state={state} />
      </form>
    </div>
  );
}
