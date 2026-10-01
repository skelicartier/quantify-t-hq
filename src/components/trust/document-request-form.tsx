"use client";

import { useActionState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/** Ask for a document. A person reads it and replies; nothing is sent automatically. */
export function DocumentRequestForm({
  action,
  documents,
}: {
  action: Action;
  documents: ReadonlyArray<{ document_id: string; title: string; requires_nda: boolean }>;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form" action={formAction} key={state.sentAt ?? "request"}>
      <AttemptField state={state} />
      <Field id="request-document" label="Which document">
        <Select
          id="request-document"
          name="document_id"
          defaultValue={documents[0]?.document_id}
          disabled={isPending}
        >
          {documents.map((document) => (
            <option key={document.document_id} value={document.document_id}>
              {document.title}
              {document.requires_nda ? " (after an NDA)" : ""}
            </option>
          ))}
        </Select>
      </Field>
      <div className="form-grid">
        <Field id="request-name" label="Your name">
          <Input
            id="request-name"
            name="name"
            maxLength={160}
            autoComplete="name"
            required
            disabled={isPending}
          />
        </Field>
        <Field id="request-email" label="Your work email">
          <Input
            id="request-email"
            name="email"
            type="email"
            maxLength={254}
            autoComplete="email"
            required
            disabled={isPending}
          />
        </Field>
      </div>
      <Field id="request-company" label="Your firm">
        <Input
          id="request-company"
          name="company"
          maxLength={160}
          autoComplete="organization"
          required
          disabled={isPending}
        />
      </Field>
      <Field id="request-reason" label="What it is for">
        <Textarea
          id="request-reason"
          name="reason"
          rows={3}
          maxLength={1000}
          disabled={isPending}
        />
      </Field>
      {/* A field people never see; a bot that fills it is thanked and ignored. */}
      <div className="honeypot" aria-hidden="true">
        <label htmlFor="request-website">Leave this empty</label>
        <input id="request-website" type="text" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? "Sending…" : "Ask for it"}
        </Button>
      </div>
      <FormFeedback state={state} />
    </form>
  );
}
