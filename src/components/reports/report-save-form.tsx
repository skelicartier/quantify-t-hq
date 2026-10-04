"use client";

import { useActionState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

const SHARING = [
  { value: "private", label: "Only me" },
  { value: "team", label: "The team can open it" },
  { value: "team_edits", label: "The team can open it and change its filters" },
] as const;

/**
 * Saving the report on screen. A new report takes a name and who sees it; the report's
 * owner (or an admin) can rename it and change its sharing; anyone the team-edit share
 * reaches can save new filters over it, and nothing else.
 */
export function ReportSaveForm({
  action,
  kind,
  query,
  reportId = "",
  name = "",
  sharing = "private",
  canManage = true,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  kind: string;
  query: string;
  reportId?: string;
  name?: string;
  sharing?: string;
  canManage?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="report-save" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="query" value={query} />
      {reportId && <input type="hidden" name="report_id" value={reportId} />}
      {canManage && (
        <>
          <Field id="report-name" label="Report name">
            <Input
              id="report-name"
              name="name"
              defaultValue={name}
              maxLength={80}
              required
              disabled={isPending}
            />
          </Field>
          <fieldset className="report-save__sharing">
            <legend className="field__label">Who sees it</legend>
            {SHARING.map((option) => (
              <label key={option.value} className="report-save__option">
                <input
                  type="radio"
                  name="sharing"
                  value={option.value}
                  defaultChecked={option.value === sharing}
                  disabled={isPending}
                />
                {option.label}
              </label>
            ))}
            <p className="field__hint">
              Everyone reads it as themselves: what their role cannot see is not in their copy.
            </p>
          </fieldset>
        </>
      )}
      <Button type="submit" variant="primary" disabled={isPending}>
        {isPending ? "Saving…" : reportId ? "Save changes" : "Save report"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}
