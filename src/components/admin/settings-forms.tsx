"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { AttemptField } from "@/components/ui/attempt-field";
import type { SlaRow } from "@/lib/api/settings";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/** Minutes as a person says them: "45 min", "8 h", "2 days". Exact, never rounded. */
export function spokenMinutes(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440} ${minutes === 1440 ? "day" : "days"}`;
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  if (minutes > 60) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  return `${minutes} min`;
}

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
};

/** One priority's two targets, edited in place. */
export function SlaRowForm({
  action,
  row,
  bounds,
}: {
  action: Action;
  row: SlaRow;
  bounds: { min_minutes: number; max_minutes: number };
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const id = `sla-${row.priority}`;
  return (
    <form className="sla-row" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="priority" value={row.priority} />
      <p className="sla-row__name">{PRIORITY_LABELS[row.priority] ?? row.priority}</p>
      <Field
        id={`${id}-first`}
        label="First reply (minutes)"
        hint={`Now ${spokenMinutes(row.first_reply_minutes)}`}
      >
        <Input
          id={`${id}-first`}
          name="first_reply_minutes"
          type="number"
          inputMode="numeric"
          min={bounds.min_minutes}
          max={bounds.max_minutes}
          defaultValue={row.first_reply_minutes}
          required
          disabled={isPending}
        />
      </Field>
      <Field
        id={`${id}-next`}
        label="Next reply (minutes)"
        hint={`Now ${spokenMinutes(row.next_reply_minutes)}`}
      >
        <Input
          id={`${id}-next`}
          name="next_reply_minutes"
          type="number"
          inputMode="numeric"
          min={bounds.min_minutes}
          max={bounds.max_minutes}
          defaultValue={row.next_reply_minutes}
          required
          disabled={isPending}
        />
      </Field>
      <div className="sla-row__foot">
        <Button type="submit" size="small" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
        <FormFeedback state={state} />
      </div>
    </form>
  );
}

/** A lead source: renamed in place, archived out of the pickers, or restored. */
export function SourceRowForm({
  action,
  source,
  archived,
  fixed,
}: {
  action: Action;
  source: { key: string; label: string };
  archived: boolean;
  /** New leads fall back to it, so it cannot be archived. */
  fixed: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const id = `source-${source.key}`;
  return (
    <form className="source-row" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="key" value={source.key} />
      <label className="sr-only" htmlFor={id}>
        Name of {source.key}
      </label>
      <Input
        id={id}
        name="label"
        defaultValue={source.label}
        maxLength={80}
        required
        disabled={isPending || archived}
      />
      <span className="source-row__key mono">{source.key}</span>
      <div className="source-row__actions">
        {archived ? (
          <Button
            type="submit"
            size="small"
            variant="ghost"
            name="archived"
            value="false"
            disabled={isPending}
          >
            Restore
          </Button>
        ) : (
          <>
            <Button type="submit" size="small" disabled={isPending}>
              Save
            </Button>
            {fixed ? (
              <span className="source-row__fixed">Default</span>
            ) : (
              <Button
                type="submit"
                size="small"
                variant="ghost"
                name="archived"
                value="true"
                disabled={isPending}
              >
                Archive
              </Button>
            )}
          </>
        )}
      </div>
      <FormFeedback state={state} />
    </form>
  );
}

export function NewSourceForm({ action }: { action: Action }) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form" action={formAction} key={state.sentAt ?? "new"}>
      <AttemptField state={state} />
      <Field id="source-new-label" label="Name" hint="As it reads on a lead: “Podcast”.">
        <Input id="source-new-label" name="label" maxLength={80} required disabled={isPending} />
      </Field>
      <Field id="source-new-key" label="Key" hint="Lowercase, e.g. podcast. Fixed once added.">
        <Input
          id="source-new-key"
          name="key"
          pattern="[a-z][a-z0-9_]{1,31}"
          maxLength={32}
          required
          autoCapitalize="none"
          spellCheck={false}
          disabled={isPending}
        />
      </Field>
      <Button type="submit" size="small" variant="primary" disabled={isPending}>
        {isPending ? "Adding…" : "Add source"}
      </Button>
      <FormFeedback state={state} sentLabel="Added." />
    </form>
  );
}
