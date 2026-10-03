"use client";

import { useActionState, useState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";
import { submitWithoutReset } from "@/lib/forms/submit-without-reset";
import { INBOX_REASONS, PRIORITY_DEFAULT } from "@/lib/inbox/reasons";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/** Which reasons put a line in this person's Priority; the rest wait in Other. */
export function PriorityRuleForm({
  action,
  reasons,
  isDefault,
}: {
  action: Action;
  reasons: readonly string[];
  isDefault: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(reasons));
  const toggle = (reason: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(reason)) next.delete(reason);
      else next.add(reason);
      return next;
    });
  return (
    // The boxes are controlled: a reset after saving would show the rule before it.
    <form className="stack-form" onSubmit={submitWithoutReset(formAction)}>
      <AttemptField state={state} />
      <fieldset className="prefs-modes">
        <legend className="field__label">What counts as Priority</legend>
        {INBOX_REASONS.map((item) => (
          <label key={item.reason} className="prefs-mode">
            <input
              type="checkbox"
              name="priority_reason"
              value={item.reason}
              checked={picked.has(item.reason)}
              onChange={() => toggle(item.reason)}
              disabled={isPending}
            />
            <span>
              <strong>{item.label}</strong>
              <span className="prefs-mode__hint">
                {item.hint}
                {PRIORITY_DEFAULT.includes(item.reason) && " In Priority by default."}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="form-actions">
        <Button type="submit" variant="primary" name="intent" value="save" disabled={isPending}>
          {isPending ? "Saving…" : "Save the rule"}
        </Button>
        {!isDefault && (
          <Button
            type="submit"
            variant="ghost"
            name="intent"
            value="default"
            disabled={isPending}
            onClick={() => setPicked(new Set(PRIORITY_DEFAULT))}
          >
            Put the default back
          </Button>
        )}
      </div>
      <FormFeedback state={state} />
    </form>
  );
}
