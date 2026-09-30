"use client";

import { useActionState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/** Which features are on, and the caps: calls a person may make a day, tokens a month. */
export function AiSettingsForm({
  action,
  features,
  dailyCalls,
  monthlyTokens,
  disabled,
}: {
  action: Action;
  features: ReadonlyArray<{ key: string; label: string; enabled: boolean; capability: string }>;
  dailyCalls: number;
  monthlyTokens: number;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const off = isPending || disabled;
  return (
    <form className="stack-form" action={formAction}>
      <AttemptField state={state} />
      <fieldset className="pick-list">
        <legend className="field__label">Turned on</legend>
        <div className="pick-list__options">
          {features.map((feature) => (
            <label key={feature.key} className="checkbox">
              <input
                type="checkbox"
                name={`enabled:${feature.key}`}
                defaultChecked={feature.enabled}
                disabled={off}
              />
              <span className="checkbox__label">{feature.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="form-grid">
        <Field id="ai-daily" label="Calls a person may make a day">
          <Input
            id="ai-daily"
            name="daily_calls"
            inputMode="numeric"
            defaultValue={String(dailyCalls)}
            disabled={off}
          />
        </Field>
        <Field id="ai-monthly" label="Tokens the company may spend a month">
          <Input
            id="ai-monthly"
            name="monthly_tokens"
            inputMode="numeric"
            defaultValue={String(monthlyTokens)}
            disabled={off}
          />
        </Field>
      </div>
      <Button type="submit" disabled={off}>
        {isPending ? "Saving…" : "Save"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}
