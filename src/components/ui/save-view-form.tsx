"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

/** "Save this view": a name, and whether the team sees it, for the list's current query. */
export function SaveViewForm({
  action,
  listKey,
  basePath,
  query,
  canShare,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  listKey: string;
  basePath: string;
  query: string;
  canShare: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [naming, setNaming] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (naming) nameRef.current?.focus();
  }, [naming]);
  if (!naming) {
    return (
      <button type="button" className="btn btn--small btn--ghost" onClick={() => setNaming(true)}>
        Save this view
      </button>
    );
  }
  return (
    <form className="views__save" action={formAction} key={state.sentAt ?? "new"}>
      <AttemptField state={state} />
      <input type="hidden" name="list_key" value={listKey} />
      <input type="hidden" name="base_path" value={basePath} />
      <input type="hidden" name="query" value={query} />
      <input
        className="input input--small"
        name="name"
        placeholder="Name this view"
        maxLength={80}
        aria-label="View name"
        ref={nameRef}
        required
        disabled={isPending}
        onKeyDown={(event) => {
          if (event.key === "Escape") setNaming(false);
        }}
      />
      {canShare && (
        <label className="views__share">
          <input type="checkbox" name="shared" value="on" disabled={isPending} /> Team
        </label>
      )}
      <button type="submit" className="btn btn--small btn--primary" disabled={isPending}>
        {isPending ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        className="btn btn--small btn--ghost"
        onClick={() => setNaming(false)}
        disabled={isPending}
      >
        Cancel
      </button>
      <FormFeedback state={state} />
    </form>
  );
}
