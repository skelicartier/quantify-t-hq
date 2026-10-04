"use client";

import { useActionState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { CopyLink } from "@/components/ui/copy-link";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

type ShareMenuProps = {
  subjectType: string;
  subjectId: string;
  /** The record's own page, copied as a link and sent with the record. */
  path: string;
  /** The colleagues it can go to; the caller is left out. */
  colleagues: readonly { staff_id: string; name: string }[];
  action: Action;
};

/**
 * "Share" on a record: copy its link, or send it to colleagues with a line — it lands in
 * their inbox as "Shared with you". The service refuses a colleague whose role cannot open
 * the record, and says who.
 */
export function ShareMenu({ subjectType, subjectId, path, colleagues, action }: ShareMenuProps) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const id = `share-${subjectType}`;
  return (
    <details className="popover popover--start share-menu">
      <summary className="btn btn--small popover__trigger">Share</summary>
      <div className="popover__panel popover__panel--narrow">
        <div className="share-menu__copy">
          <CopyLink path={path} />
        </div>
        <form
          className="stack-form stack-form--tight"
          action={formAction}
          key={state.sentAt ?? "share"}
        >
          <AttemptField state={state} />
          <input type="hidden" name="subject_type" value={subjectType} />
          <input type="hidden" name="subject_id" value={subjectId} />
          <input type="hidden" name="return_path" value={path} />
          <fieldset className="share-menu__people">
            <legend className="share-menu__legend">Send it to</legend>
            {colleagues.length === 0 ? (
              <p className="field__hint">Nobody else is on the team yet.</p>
            ) : (
              colleagues.map((person) => (
                <label key={person.staff_id} className="share-menu__person">
                  <input type="checkbox" name="staff_ids" value={person.staff_id} />
                  <span>{person.name}</span>
                </label>
              ))
            )}
          </fieldset>
          <div className="field">
            <div className="field__label">
              <label htmlFor={`${id}-note`}>A line with it</label>
            </div>
            <input
              id={`${id}-note`}
              className="input"
              name="note"
              maxLength={400}
              placeholder="e.g. Worth a call before Thursday?"
            />
          </div>
          <Button type="submit" variant="primary" disabled={isPending || colleagues.length === 0}>
            {isPending ? "Sending…" : "Send"}
          </Button>
          <FormFeedback state={state} />
        </form>
      </div>
    </details>
  );
}
