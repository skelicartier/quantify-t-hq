"use client";

import { useOptimistic, useState, useTransition } from "react";

import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * The tick beside a person. It changes at once and is put right if the sender says no;
 * the row itself is the server's, so a search or a page still reads what was saved.
 */
export function PickBox({
  action,
  mailingId,
  email,
  picked,
  label,
}: {
  action: Action;
  mailingId: string;
  email: string;
  picked: boolean;
  label: string;
}) {
  const [shown, setShown] = useOptimistic(picked);
  const [failed, setFailed] = useState("");
  const [, startTransition] = useTransition();
  return (
    <>
      <input
        type="checkbox"
        className="merge-pick"
        checked={shown}
        aria-label={label}
        onChange={(event) => {
          const next = event.currentTarget.checked;
          startTransition(async () => {
            setShown(next);
            setFailed("");
            const form = new FormData();
            form.set("mailing_id", mailingId);
            form.set("email", email);
            form.set("picked", next ? "1" : "0");
            try {
              const answer = await action(INITIAL_ACTION_STATE, form);
              if (answer.status === "error") setFailed(answer.message ?? "That did not save.");
            } catch {
              setFailed("That did not save. Try again.");
            }
          });
        }}
      />
      {failed && (
        <span className="field__error" role="alert">
          {failed}
        </span>
      )}
    </>
  );
}
