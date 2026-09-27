"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import type { PipelineStage } from "@/lib/api/crm";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/** One working stage, tuned in place. `stage` absent means "add a new stage". */
export function PipelineStageForm({ action, stage }: { action: Action; stage?: PipelineStage }) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const id = stage?.key ?? "new";
  return (
    <form className="stage-form" action={formAction} key={stage ? "edit" : (state.sentAt ?? "new")}>
      {stage ? (
        <input type="hidden" name="key" value={stage.key} />
      ) : (
        <Field
          id={`stage-key-${id}`}
          label="Key"
          hint="Lowercase, e.g. security_review. Fixed once created."
        >
          <Input
            id={`stage-key-${id}`}
            name="key"
            pattern="[a-z][a-z0-9_]{1,31}"
            maxLength={32}
            required
            autoCapitalize="none"
            spellCheck={false}
            disabled={isPending}
          />
        </Field>
      )}
      <div className="stage-form__grid">
        <Field id={`stage-label-${id}`} label="Name">
          <Input
            id={`stage-label-${id}`}
            name="label"
            defaultValue={stage?.label}
            maxLength={80}
            required
            disabled={isPending}
          />
        </Field>
        <Field id={`stage-position-${id}`} label="Order">
          <Input
            id={`stage-position-${id}`}
            name="position"
            type="number"
            min={0}
            max={100}
            defaultValue={stage?.position ?? 5}
            disabled={isPending}
          />
        </Field>
        <Field id={`stage-probability-${id}`} label="Win chance %">
          <Input
            id={`stage-probability-${id}`}
            name="win_probability"
            type="number"
            min={0}
            max={100}
            defaultValue={stage?.win_probability ?? 0}
            disabled={isPending}
          />
        </Field>
        <Field id={`stage-stale-${id}`} label="Stuck after (days)">
          <Input
            id={`stage-stale-${id}`}
            name="stale_after_days"
            type="number"
            min={0}
            max={365}
            defaultValue={stage?.stale_after_days ?? 14}
            disabled={isPending}
          />
        </Field>
      </div>
      <Field
        id={`stage-criteria-${id}`}
        label="To leave this stage"
        hint="What must be true before a deal moves on."
      >
        <Textarea
          id={`stage-criteria-${id}`}
          name="exit_criteria"
          defaultValue={stage?.exit_criteria}
          rows={2}
          maxLength={1000}
          disabled={isPending}
        />
      </Field>
      <div className="stage-form__foot">
        <Button
          type="submit"
          size="small"
          variant={stage ? "default" : "primary"}
          disabled={isPending}
        >
          {isPending ? "Saving…" : stage ? "Save stage" : "Add stage"}
        </Button>
        {stage && (
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
      </div>
      <FormFeedback state={state} sentLabel="Saved." />
    </form>
  );
}
