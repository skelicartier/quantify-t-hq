"use client";

import { useActionState, useRef, useState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";
import { submitWithoutReset } from "@/lib/forms/submit-without-reset";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

type EditorProps = {
  action: Action;
  mailingId: string;
  name: string;
  subject: string;
  body: string;
  listIds: readonly string[];
  onlyColumn: string;
  onlyValue: string;
  holdColumn: string;
  pickOnly: boolean;
  skipWritten: boolean;
  lists: readonly { id: string; name: string; people: number }[];
  fields: readonly { key: string; label: string; in_all: boolean }[];
};

/**
 * The words and who they go to. Sent with `onSubmit`, so a refusal leaves a long message
 * in the box. A field pressed goes in where the cursor was, in the subject or the message.
 */
export function MergeEditor({
  action,
  mailingId,
  name,
  subject,
  body,
  listIds,
  onlyColumn,
  onlyValue,
  holdColumn,
  pickOnly,
  skipWritten,
  lists,
  fields,
}: EditorProps) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const lastBox = useRef<"merge-subject" | "merge-body">("merge-body");
  const [who, setWho] = useState(pickOnly ? "picked" : onlyColumn ? "where" : "everyone");

  const insert = (key: string) => {
    const box = document.getElementById(lastBox.current) as
      HTMLInputElement | HTMLTextAreaElement | null;
    if (!box) return;
    const text = `{{${key}}}`;
    const at = box.selectionStart ?? box.value.length;
    box.setRangeText(text, at, box.selectionEnd ?? at, "end");
    box.focus();
  };

  return (
    <form className="stack-form" onSubmit={submitWithoutReset(formAction)}>
      <AttemptField state={state} />
      <input type="hidden" name="mailing_id" value={mailingId} />
      <Field id="merge-name" label="Name" hint="For you: the people written to never see it.">
        <Input id="merge-name" name="name" maxLength={120} defaultValue={name} required />
      </Field>
      <fieldset className="fieldset">
        <legend className="fieldset__legend">Who it goes to</legend>
        {lists.length === 0 ? (
          <p className="side-quiet">Add a list first, from Mail merge.</p>
        ) : (
          <div className="merge-lists">
            {lists.map((list) => (
              <Checkbox
                key={list.id}
                id={`merge-list-${list.id}`}
                name="list_ids"
                value={list.id}
                defaultChecked={listIds.includes(list.id)}
                label={`${list.name} (${list.people.toLocaleString("en-GB")})`}
              />
            ))}
          </div>
        )}
        {fields.length > 0 && (
          <div className="form-grid">
            <Field
              id="merge-who"
              label="Send to"
              hint={
                who === "picked"
                  ? "Save, then tick the people below."
                  : "Everyone on the lists above, one column's value, or people you tick."
              }
            >
              <Select
                id="merge-who"
                name="who"
                value={who}
                onChange={(event) => setWho(event.currentTarget.value)}
              >
                <option value="everyone">Everyone on the lists</option>
                <option value="where">Only where a column says</option>
                <option value="picked">Only the people I pick</option>
              </Select>
            </Field>
            {who === "where" && (
              <>
                <Field id="merge-only-column" label="Column">
                  <Select id="merge-only-column" name="only_column" defaultValue={onlyColumn}>
                    {fields.map((field) => (
                      <option key={field.key} value={field.key}>
                        {field.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field id="merge-only-value" label="Is" hint="For example 1, for Tier 1.">
                  <Input
                    id="merge-only-value"
                    name="only_value"
                    maxLength={200}
                    defaultValue={onlyValue}
                    required
                  />
                </Field>
              </>
            )}
            <Field
              id="merge-hold-column"
              label="Hold back anyone with something in"
              hint={
                who === "picked"
                  ? "Ticking someone by name overrides this."
                  : "They are left out, with what the column says as the reason."
              }
            >
              <Select id="merge-hold-column" name="hold_column" defaultValue={holdColumn}>
                <option value="">Nobody held back</option>
                {fields.map((field) => (
                  <option key={field.key} value={field.key}>
                    {field.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        <Checkbox
          id="merge-skip-written"
          name="skip_written"
          defaultChecked={skipWritten}
          label="Leave out anyone another mailing already reached"
          description="Untick this for a follow-up to the same people."
        />
      </fieldset>
      <Field
        id="merge-subject"
        label="Subject"
        hint="Keep it short and about them: it is the one line everyone reads."
      >
        <Input
          id="merge-subject"
          name="subject"
          maxLength={200}
          defaultValue={subject}
          onFocus={() => {
            lastBox.current = "merge-subject";
          }}
        />
      </Field>
      <Field
        id="merge-body"
        label="Message"
        hint="Plain words, as you would write an email. A blank line starts a paragraph; [words](https://…) is a link; **words** is bold. A column in braces is filled in for each person: {Greeting} or {{first_name|there}}, which says “there” to anyone with no first name."
      >
        <Textarea
          id="merge-body"
          name="body"
          rows={14}
          maxLength={20_000}
          defaultValue={body}
          onFocus={() => {
            lastBox.current = "merge-body";
          }}
        />
      </Field>
      {fields.length > 0 && (
        <div className="merge-insert">
          <p className="field__hint">Press a field to put it in at the cursor.</p>
          <div className="merge-insert__row">
            {fields.map((field) => (
              <button
                key={field.key}
                type="button"
                className="merge-field merge-field--button"
                title={
                  field.in_all ? field.label : `${field.label}: not a column of every list chosen`
                }
                onClick={() => insert(field.key)}
              >
                {`{{${field.key}}}`}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="form-actions">
        <Button type="submit" size="small" variant="primary" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
      <FormFeedback state={state} />
    </form>
  );
}
