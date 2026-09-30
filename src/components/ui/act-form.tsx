"use client";

import { useActionState, useSyncExternalStore } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

// Nothing to subscribe to: the store only tells the server render from the browser's,
// the one place the viewer's offset is knowable.
const subscribe = () => () => {};
function browserOffset(): string {
  const minutes = -new Date().getTimezoneOffset();
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/**
 * The viewer's UTC offset, so a date and time typed into a form means the moment they
 * meant. Empty on the server render; the service reads a missing offset as UTC.
 */
export function TzOffsetField() {
  const offset = useSyncExternalStore(subscribe, browserOffset, () => "");
  return <input type="hidden" name="tz_offset" value={offset} />;
}

/** One act on a record: hidden ids, the act, optional fields, one button. */
export function ActForm({
  action,
  hidden,
  act,
  label,
  children,
  danger = false,
  primary = false,
  disabled = false,
  tight = true,
}: {
  action: Action;
  hidden: Record<string, string>;
  act: string;
  label: string;
  children?: React.ReactNode;
  danger?: boolean;
  primary?: boolean;
  disabled?: boolean;
  tight?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className={tight ? "stack-form stack-form--tight" : "stack-form"} action={formAction}>
      <AttemptField state={state} />
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <input type="hidden" name="action" value={act} />
      <TzOffsetField />
      {children}
      <Button
        type="submit"
        variant={danger ? "danger" : primary ? "primary" : "default"}
        disabled={isPending || disabled}
      >
        {isPending ? "Saving…" : label}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}
