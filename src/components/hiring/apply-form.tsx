"use client";

import { useActionState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/** Apply for one role. Six months after a decision we forget you, unless you tick the box. */
export function ApplyForm({
  action,
  openingId,
  title,
}: {
  action: Action;
  openingId: string;
  title: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const id = openingId.slice(0, 8);
  return (
    <form
      className="stack-form"
      action={formAction}
      key={state.sentAt ?? "apply"}
      aria-label={`Apply for ${title}`}
    >
      <AttemptField state={state} />
      <input type="hidden" name="opening_id" value={openingId} />
      <div className="form-grid">
        <Field id={`apply-name-${id}`} label="Your name">
          <Input
            id={`apply-name-${id}`}
            name="full_name"
            maxLength={160}
            autoComplete="name"
            required
            disabled={isPending}
          />
        </Field>
        <Field id={`apply-email-${id}`} label="Your email">
          <Input
            id={`apply-email-${id}`}
            name="email"
            type="email"
            maxLength={254}
            autoComplete="email"
            required
            disabled={isPending}
          />
        </Field>
      </div>
      <Field
        id={`apply-links-${id}`}
        label="Links"
        hint="A CV, a portfolio, code you are proud of."
      >
        <Input id={`apply-links-${id}`} name="links" maxLength={1000} disabled={isPending} />
      </Field>
      <Field id={`apply-note-${id}`} label="Why this role">
        <Textarea
          id={`apply-note-${id}`}
          name="cover_note"
          rows={4}
          maxLength={4000}
          disabled={isPending}
        />
      </Field>
      <Checkbox
        id={`apply-keep-${id}`}
        name="keep_longer"
        label="Keep my application for two years, for other roles"
        description="Otherwise it is erased six months after a decision."
      />
      <div className="honeypot" aria-hidden="true">
        <label htmlFor={`apply-website-${id}`}>Leave this empty</label>
        <input
          id={`apply-website-${id}`}
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? "Sending…" : "Apply"}
        </Button>
      </div>
      <FormFeedback state={state} />
    </form>
  );
}
