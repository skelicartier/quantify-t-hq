import { startTransition, type FormEvent } from "react";

/**
 * Send a form to its action without React's reset afterwards. A `<form action>` is reset
 * once its action succeeds, which puts controlled checkboxes and radios back to what the
 * server first rendered while React's state still holds the person's choice: the page
 * then shows one answer and has saved another. Calling the action from `onSubmit` keeps
 * the fields as the person left them. The button pressed travels with the form data.
 */
export function submitWithoutReset(action: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(event.currentTarget, submitter);
    startTransition(() => action(data));
  };
}
