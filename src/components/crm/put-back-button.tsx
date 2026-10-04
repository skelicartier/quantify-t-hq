"use client";

import { useActionState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

/** "Put back" on one change in a record's History: the field returns to its value before. */
export function PutBackButton({
  action,
  kind,
  recordId,
  field,
  from,
  to,
  returnPath,
  label,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  kind: string;
  recordId: string;
  field: string;
  from: string;
  to: string;
  returnPath: string;
  /** The field's name in words, for the button's accessible name. */
  label: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form action={formAction} className="put-back">
      <AttemptField state={state} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="record_id" value={recordId} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      <input type="hidden" name="return_path" value={returnPath} />
      <button
        type="submit"
        className="put-back__button"
        disabled={isPending}
        aria-label={`Put ${label} back to its value before this change`}
      >
        {isPending ? "Putting back…" : "Put back"}
      </button>
      {state.status === "error" && state.message && (
        <span className="put-back__error" role="alert">
          {state.message}
        </span>
      )}
    </form>
  );
}
