"use client";

import { useEffect, useRef } from "react";

/**
 * Any form state: the record forms' `ActionState`, the auth forms' own shapes. Only an
 * error carrying `keepAttempt` changes the behaviour, so nothing more is required.
 */
type AnyFormState = object;

function keepsAttempt(state: AnyFormState): boolean {
  const view = state as { status?: unknown; keepAttempt?: unknown };
  return view.status === "error" && view.keepAttempt === true;
}

/**
 * The id of this submission attempt. The server action opens an attempt with it and
 * mints every idempotency key from it, so sending the same form twice replays the
 * service's stored answer rather than writing twice.
 *
 * The id is written into the hidden input as the form submits — an uncontrolled input,
 * so the server renders it empty and nothing has to agree between server and client.
 * A submit reuses the id while no new outcome has arrived (a double click) or while
 * the last outcome is one the portal could not confirm (`keepAttempt`); any other
 * outcome retires it, and the next submit is a new attempt.
 */
export function AttemptField({ state }: { state: AnyFormState }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const latestRef = useRef<AnyFormState>(state);
  const attemptRef = useRef("");
  const submittedUnderRef = useRef<AnyFormState | null>(null);
  useEffect(() => {
    latestRef.current = state;
  }, [state]);
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const onSubmit = () => {
      const current = latestRef.current;
      const outcomeArrived = submittedUnderRef.current !== current;
      if (!attemptRef.current || (outcomeArrived && !keepsAttempt(current))) {
        attemptRef.current = crypto.randomUUID();
      }
      submittedUnderRef.current = current;
      if (inputRef.current) inputRef.current.value = attemptRef.current;
    };
    // Registered on the form itself, so it runs before the framework reads the form.
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, []);
  return <input ref={inputRef} type="hidden" name="attempt" defaultValue="" />;
}
