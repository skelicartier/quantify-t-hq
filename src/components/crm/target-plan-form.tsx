"use client";

import { useActionState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";
import { TIER_LABELS } from "@/lib/crm/targets";
import { submitWithoutReset } from "@/lib/forms/submit-without-reset";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * A target account's tier and short plan: why it matters, who at the firm to reach, the
 * next step and its day. It keeps what was typed after saving — a reset would show the
 * plan before it.
 */
export function TargetPlanForm({
  action,
  companyId,
  people,
  initial,
  submitLabel,
}: {
  action: Action;
  companyId: string;
  people: readonly { person_id: string; full_name: string; title: string; role_category: string }[];
  initial: {
    tier: number;
    why: string;
    next_step: string;
    next_step_due: string;
    reach: readonly string[];
  };
  submitLabel: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const chosen = new Set(initial.reach);
  return (
    <form className="stack-form" onSubmit={submitWithoutReset(formAction)}>
      <AttemptField state={state} />
      <input type="hidden" name="company_id" value={companyId} />
      <Field id={`target-tier-${companyId}`} label="Tier">
        <Select id={`target-tier-${companyId}`} name="tier" defaultValue={String(initial.tier)}>
          {[1, 2, 3].map((tier) => (
            <option key={tier} value={tier}>
              {TIER_LABELS[tier]}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        id={`target-why-${companyId}`}
        label="Why this firm"
        hint="A line or two the team can act on."
      >
        <Textarea
          id={`target-why-${companyId}`}
          name="why"
          rows={2}
          maxLength={400}
          defaultValue={initial.why}
        />
      </Field>
      <div className="form-grid">
        <Field id={`target-step-${companyId}`} label="Next step">
          <Input
            id={`target-step-${companyId}`}
            name="next_step"
            maxLength={200}
            defaultValue={initial.next_step}
          />
        </Field>
        <Field id={`target-due-${companyId}`} label="By">
          <Input
            id={`target-due-${companyId}`}
            name="next_step_due"
            type="date"
            defaultValue={initial.next_step_due}
          />
        </Field>
      </div>
      <fieldset className="prefs-modes">
        <legend className="field__label">Who to reach</legend>
        {people.length === 0 ? (
          <p className="side-quiet">Nobody at this firm is on file yet. Add a person first.</p>
        ) : (
          people.map((person) => (
            <label key={person.person_id} className="prefs-mode">
              <input
                type="checkbox"
                name="reach"
                value={person.person_id}
                defaultChecked={chosen.has(person.person_id)}
              />
              <span>
                <strong>{person.full_name}</strong>
                {(person.title || person.role_category) && (
                  <span className="prefs-mode__hint">
                    {[person.title, person.role_category.replace(/_/g, " ")]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
              </span>
            </label>
          ))
        )}
      </fieldset>
      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? "Saving…" : submitLabel}
        </Button>
      </div>
      <FormFeedback state={state} />
    </form>
  );
}
