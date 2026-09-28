"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/ui/form-feedback";
import { Field, Input, Textarea } from "@/components/ui/field";
import { AttemptField } from "@/components/ui/attempt-field";
import { INITIAL_DESK_STATE, type DeskActionState } from "@/lib/support/desk-state";

export function SavedReplyForm({
  action,
}: {
  action: (previous: DeskActionState, formData: FormData) => Promise<DeskActionState>;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_DESK_STATE);
  return (
    <form className="stack-form" action={formAction} key={state.sentAt ?? "form"}>
      <AttemptField state={state} />
      <Field id="reply-title" label="Title" hint="What the desk picks from the list.">
        <Input id="reply-title" name="title" maxLength={120} required disabled={isPending} />
      </Field>
      <Field id="reply-body" label="Body" hint="Inserted into the composer; edit before sending.">
        <Textarea
          id="reply-body"
          name="body"
          rows={5}
          maxLength={8000}
          required
          disabled={isPending}
        />
      </Field>
      <Button variant="primary" type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Save reply"}
      </Button>
      <FormFeedback state={state} sentLabel="Reply saved." />
    </form>
  );
}
