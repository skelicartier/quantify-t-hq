"use client";

import { useActionState, useRef, useState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

const FALLBACKS: Record<string, string> = {
  first_name: "there",
  company: "your desk",
  title: "",
  country: "",
  owner_name: "",
};

/**
 * A template: a subject and a body with tokens. Campaign templates are HTML, sent from the
 * company with its footer added; sequence templates are plain text, sent from one person.
 * Every save is a new version, so what a scheduled campaign sends never changes under it.
 */
export function TemplateForm({
  action,
  variables,
  initial,
  kindLocked,
}: {
  action: Action;
  variables: readonly string[];
  initial: {
    template_id?: string;
    name: string;
    kind: "campaign" | "sequence";
    subject: string;
    body_html: string;
    body_text: string;
  };
  kindLocked: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [kind, setKind] = useState(initial.kind);
  const lastFocused = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  const insert = (name: string) => {
    const target = lastFocused.current;
    const fallback = FALLBACKS[name];
    const token = fallback ? `{{${name} | ${fallback}}}` : `{{${name}}}`;
    if (!target) return;
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;
    target.setRangeText(token, start, end, "end");
    target.focus();
  };
  const track = (event: { currentTarget: HTMLTextAreaElement | HTMLInputElement }) => {
    lastFocused.current = event.currentTarget;
  };

  return (
    <form className="template-form" action={formAction}>
      <AttemptField state={state} />
      {initial.template_id && (
        <input type="hidden" name="template_id" value={initial.template_id} />
      )}
      <div className="form-grid">
        <Field id="template-name" label="Name" hint="Staff-facing.">
          <Input
            id="template-name"
            name="name"
            defaultValue={initial.name}
            maxLength={120}
            required
          />
        </Field>
        <Field id="template-kind" label="Kind" hint={kindLocked ? "Fixed once saved." : undefined}>
          {kindLocked ? (
            <>
              <input type="hidden" name="kind" value={kind} />
              <Input
                id="template-kind"
                value={
                  kind === "campaign"
                    ? "Campaign (HTML, from the company)"
                    : "Sequence (plain text, from one person)"
                }
                readOnly
              />
            </>
          ) : (
            <Select
              id="template-kind"
              name="kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as "campaign" | "sequence")}
            >
              <option value="campaign">Campaign (HTML, from the company)</option>
              <option value="sequence">Sequence (plain text, from one person)</option>
            </Select>
          )}
        </Field>
        <Field id="template-subject" label="Subject" className="form-grid__span">
          <Input
            id="template-subject"
            name="subject"
            defaultValue={initial.subject}
            maxLength={400}
            required
            onFocus={track}
          />
        </Field>
      </div>
      <div className="token-bar" aria-label="Insert a token">
        <span className="token-bar__label">Insert</span>
        {variables
          .filter((name) => !["unsubscribe_url", "preferences_url", "email"].includes(name))
          .map((name) => (
            <button key={name} type="button" className="token" onClick={() => insert(name)}>
              {name}
            </button>
          ))}
      </div>
      {kind === "campaign" ? (
        <>
          <Field
            id="template-html"
            label="Body (HTML)"
            hint="Paragraphs and links. The postal address and the unsubscribe links are added under it on every send."
          >
            <Textarea
              id="template-html"
              name="body_html"
              defaultValue={initial.body_html}
              rows={16}
              className="textarea--code"
              onFocus={track}
            />
          </Field>
          <Field
            id="template-text"
            label="Plain-text part (optional)"
            hint="Left empty, it is made from the HTML."
          >
            <Textarea
              id="template-text"
              name="body_text"
              defaultValue={initial.body_text}
              rows={6}
              onFocus={track}
            />
          </Field>
        </>
      ) : (
        <>
          <input type="hidden" name="body_html" value="" />
          <Field
            id="template-text"
            label="Body (plain text)"
            hint="Short and personal: fifty to a hundred and twenty-five words, one question. A line saying how to stop is added under it."
          >
            <Textarea
              id="template-text"
              name="body_text"
              defaultValue={initial.body_text}
              rows={14}
              onFocus={track}
            />
          </Field>
        </>
      )}
      <p className="page-note">
        A token with no fallback (<code>{"{{first_name}}"}</code>) is required: anyone without it is
        skipped rather than greeted with a gap. Write <code>{"{{first_name | there}}"}</code> to
        fall back.
        {kind === "campaign" && (
          <>
            {" "}
            A campaign to a list can also use the list&rsquo;s own columns:{" "}
            <code>{"{{custom.fund_size}}"}</code> for a column called &ldquo;Fund size&rdquo;.
          </>
        )}
      </p>
      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? "Saving…" : initial.template_id ? "Save a new version" : "Create template"}
        </Button>
      </div>
      <FormFeedback state={state} />
    </form>
  );
}
