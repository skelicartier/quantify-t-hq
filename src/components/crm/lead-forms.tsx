"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import type { Company, Lead } from "@/lib/api/crm";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";
import { DISQUALIFY_LABELS } from "@/lib/crm/vocabulary";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;
type Option = { key: string; label: string };

export function LeadCreateForm({
  action,
  sources,
}: {
  action: Action;
  sources: readonly Option[];
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <Field id="lead-name" label="Full name">
        <Input id="lead-name" name="full_name" maxLength={160} disabled={isPending} />
      </Field>
      <Field id="lead-email" label="Email">
        <Input
          id="lead-email"
          name="email"
          type="email"
          maxLength={254}
          autoCapitalize="none"
          spellCheck={false}
          disabled={isPending}
        />
      </Field>
      <Field id="lead-company" label="Firm">
        <Input id="lead-company" name="company_name" maxLength={200} disabled={isPending} />
      </Field>
      <Field id="lead-source" label="Where it came from">
        <Select id="lead-source" name="source_key" defaultValue="outbound" disabled={isPending}>
          {sources.map((source) => (
            <option key={source.key} value={source.key}>
              {source.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="lead-message" label="Context">
        <Textarea id="lead-message" name="message" rows={3} maxLength={8000} disabled={isPending} />
      </Field>
      <Button variant="primary" type="submit" disabled={isPending}>
        {isPending ? "Adding…" : "Add lead"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/**
 * Manual stage changes. Qualified is absent on purpose — only conversion reaches it —
 * and disqualifying asks for the reason the funnel report will count.
 */
export function LeadStageForm({ action, lead }: { action: Action; lead: Lead }) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [stage, setStage] = useState(lead.stage === "disqualified" ? "disqualified" : lead.stage);
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <input type="hidden" name="lead_id" value={lead.lead_id} />
      <Field id="lead-stage" label="Stage">
        <Select
          id="lead-stage"
          name="stage"
          value={stage}
          onChange={(event) => setStage(event.target.value)}
          disabled={isPending}
        >
          <option value="new">New</option>
          <option value="attempting">Attempting</option>
          <option value="connected">Connected</option>
          <option value="disqualified">Disqualified</option>
        </Select>
      </Field>
      {stage === "disqualified" && (
        <Field id="lead-dq-reason" label="Why">
          <Select
            id="lead-dq-reason"
            name="disqualify_reason"
            defaultValue={lead.disqualify_reason || "not_a_fit"}
            disabled={isPending}
          >
            {Object.entries(DISQUALIFY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Button type="submit" disabled={isPending || stage === lead.stage}>
        {isPending ? "Saving…" : stage === "disqualified" ? "Disqualify" : "Set stage"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

type ConvertLeadFormProps = {
  action: Action;
  lead: Lead;
  matchedCompany: Company | null;
  /** The email's domain when it can anchor a company; empty for personal mail. */
  suggestedDomain: string;
  stages: readonly Option[];
  defaultDue: string;
};

/**
 * Qualification in one step: the lead becomes a person at a company, and — when the
 * box stays ticked — a deal with a dated next step, because a qualified lead with no
 * next step is the first thing a pipeline loses.
 */
export function ConvertLeadForm({
  action,
  lead,
  matchedCompany,
  suggestedDomain,
  stages,
  defaultDue,
}: ConvertLeadFormProps) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [withDeal, setWithDeal] = useState(true);
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <input type="hidden" name="lead_id" value={lead.lead_id} />
      {matchedCompany ? (
        <>
          <input type="hidden" name="company_id" value={matchedCompany.company_id} />
          <p className="convert-note">
            Joins <strong>{matchedCompany.name}</strong>, matched on {matchedCompany.domain}.
          </p>
        </>
      ) : (
        <>
          <Field id="convert-company" label="Company">
            <Input
              id="convert-company"
              name="company_name"
              defaultValue={lead.company_name}
              maxLength={200}
              required={!suggestedDomain}
              disabled={isPending}
            />
          </Field>
          <Field
            id="convert-domain"
            label="Web domain"
            hint={
              suggestedDomain
                ? "Taken from their email address."
                : "Their address is personal mail, so no domain was taken from it."
            }
          >
            <Input
              id="convert-domain"
              name="domain"
              defaultValue={suggestedDomain}
              maxLength={255}
              autoCapitalize="none"
              spellCheck={false}
              disabled={isPending}
            />
          </Field>
        </>
      )}
      <Checkbox
        id="convert-with-deal"
        name="with_deal"
        checked={withDeal}
        onChange={(event) => setWithDeal(event.target.checked)}
        disabled={isPending}
        label="Open a deal now"
      />
      {withDeal && (
        <fieldset className="subform">
          <legend className="subform__legend">The deal</legend>
          <div className="form-row">
            <Field id="convert-stage" label="Stage">
              <Select
                id="convert-stage"
                name="stage_key"
                defaultValue="demo_booked"
                disabled={isPending}
              >
                {stages.map((stage) => (
                  <option key={stage.key} value={stage.key}>
                    {stage.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="convert-mrr" label="Monthly value (USD)">
              <Input
                id="convert-mrr"
                name="mrr_amount"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                disabled={isPending}
              />
            </Field>
          </div>
          <Field id="convert-step" label="Next step">
            <Input
              id="convert-step"
              name="next_step"
              maxLength={400}
              required
              placeholder="e.g. Run the demo with their PM"
              disabled={isPending}
            />
          </Field>
          <Field id="convert-due" label="By">
            <Input
              id="convert-due"
              name="next_step_due"
              type="date"
              defaultValue={defaultDue}
              required
              disabled={isPending}
            />
          </Field>
        </fieldset>
      )}
      <Button variant="primary" type="submit" disabled={isPending}>
        {isPending ? "Converting…" : "Qualify and convert"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}
