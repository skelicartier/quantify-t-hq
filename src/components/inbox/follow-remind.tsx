"use client";

import { useActionState, useState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Field, Input } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Follow a record: its notes, replies and changes reach your inbox. The service follows
 * you automatically on what you create, are given or are mentioned on; unfollowing one of
 * those mutes it, so it stays quiet.
 */
export function FollowButton({
  action,
  subjectType,
  subject,
  following,
  returnPath,
}: {
  action: Action;
  subjectType: string;
  subject: string;
  following: boolean;
  returnPath: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="follow-form" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="subject_type" value={subjectType} />
      <input type="hidden" name="subject" value={subject} />
      <input type="hidden" name="return_path" value={returnPath} />
      <input type="hidden" name="follow" value={following ? "no" : "yes"} />
      <button
        type="submit"
        className={following ? "btn btn--small" : "btn btn--small btn--ghost"}
        aria-pressed={following}
        disabled={isPending}
        title={
          following
            ? "You hear of new notes, replies and changes here. Press to stop."
            : "Hear of new notes, replies and changes in your inbox."
        }
      >
        {isPending ? "…" : following ? "Following" : "Follow"}
      </button>
      {state.status === "error" && <FormFeedback state={state} />}
    </form>
  );
}

/** Local "YYYY-MM-DDTHH:mm" for tomorrow at nine, the value a datetime-local field takes. */
function tomorrowNine(): string {
  const at = new Date();
  at.setDate(at.getDate() + 1);
  at.setHours(9, 0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T09:00`;
}

/**
 * "Remind me" on any record: at the time chosen (in this browser's zone, sent as an exact
 * instant) it lands in your inbox with your note and a link back here.
 */
export function RemindMe({
  action,
  subjectType,
  subjectId,
  subjectLabel,
  linkPath,
}: {
  action: Action;
  subjectType: string;
  subjectId: string;
  subjectLabel: string;
  linkPath: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [local, setLocal] = useState(tomorrowNine);
  const instant = (() => {
    const parsed = new Date(local);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
  })();
  return (
    <details className="popover popover--start">
      <summary className="btn btn--small btn--ghost popover__trigger">Remind me</summary>
      <div className="popover__panel popover__panel--narrow">
        <form className="stack-form stack-form--tight" action={formAction}>
          <AttemptField state={state} />
          <input type="hidden" name="subject_type" value={subjectType} />
          <input type="hidden" name="subject_id" value={subjectId} />
          <input type="hidden" name="subject_label" value={subjectLabel} />
          <input type="hidden" name="link_path" value={linkPath} />
          <input type="hidden" name="remind_at" value={instant} />
          <Field id={`remind-at-${subjectId}`} label="When">
            <Input
              id={`remind-at-${subjectId}`}
              type="datetime-local"
              value={local}
              onChange={(event) => setLocal(event.target.value)}
              required
              disabled={isPending}
            />
          </Field>
          <Field id={`remind-note-${subjectId}`} label="Note to yourself">
            <Input
              id={`remind-note-${subjectId}`}
              name="note"
              maxLength={400}
              placeholder="What to do then"
              disabled={isPending}
            />
          </Field>
          <button
            type="submit"
            className="btn btn--small btn--primary"
            disabled={isPending || !instant}
          >
            {isPending ? "Setting…" : "Set reminder"}
          </button>
          <FormFeedback state={state} />
        </form>
      </div>
    </details>
  );
}
