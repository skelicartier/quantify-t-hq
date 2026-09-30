"use client";

import { useActionState, useState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;
type Option = { value: string; label: string };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The call for the quarter: commit and best case, prefilled from the deals, with a note. */
export function SubmitForecastForm({
  action,
  period,
  currency,
  suggested,
}: {
  action: Action;
  period: string;
  currency: string;
  suggested: { commit: string; best_case: string };
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="currency" value={currency} />
      <div className="form-grid">
        <Field
          id="forecast-commit"
          label={`Commit (${currency})`}
          hint={`Won so far plus commit deals: ${suggested.commit}.`}
        >
          <Input
            id="forecast-commit"
            name="commit"
            inputMode="decimal"
            defaultValue={suggested.commit}
            disabled={isPending}
          />
        </Field>
        <Field
          id="forecast-best"
          label={`Best case (${currency})`}
          hint={`Adding best-case deals: ${suggested.best_case}.`}
        >
          <Input
            id="forecast-best"
            name="best_case"
            inputMode="decimal"
            defaultValue={suggested.best_case}
            disabled={isPending}
          />
        </Field>
      </div>
      <Field id="forecast-note" label="What the call rests on">
        <Textarea id="forecast-note" name="note" rows={2} maxLength={2000} disabled={isPending} />
      </Field>
      <Button type="submit" variant="primary" disabled={isPending}>
        {isPending ? "Submitting…" : "Submit the call"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/** The quarter's goal for new MRR, per currency. */
export function TargetForm({
  action,
  period,
  currency,
  current,
}: {
  action: Action;
  period: string;
  currency: string;
  current: string | null;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="currency" value={currency} />
      <Field id="target-amount" label={`New MRR to win in ${period} (${currency})`}>
        <Input
          id="target-amount"
          name="amount"
          inputMode="decimal"
          defaultValue={current ?? ""}
          disabled={isPending}
        />
      </Field>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Set the target"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

type Objection = { objection: string; response: string };

/** A battlecard: the quick dismiss, why we win and lose, objections with their answers. */
export function CompetitorForm({
  action,
  competitorId,
  initial,
  submitLabel,
}: {
  action: Action;
  competitorId?: string;
  initial?: {
    name: string;
    website: string;
    summary: string;
    quick_dismiss: string;
    why_we_win: string;
    why_we_lose: string;
    objections: readonly Objection[];
  };
  submitLabel: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [objections, setObjections] = useState<Objection[]>(
    initial?.objections.length ? [...initial.objections] : [{ objection: "", response: "" }],
  );
  const edit = (index: number, key: keyof Objection, value: string) =>
    setObjections((rows) => rows.map((row, at) => (at === index ? { ...row, [key]: value } : row)));
  return (
    <form className="stack-form" action={formAction}>
      <AttemptField state={state} />
      {competitorId && <input type="hidden" name="competitor_id" value={competitorId} />}
      <input
        type="hidden"
        name="objections"
        value={JSON.stringify(objections.filter((row) => row.objection.trim()))}
      />
      <div className="form-grid">
        <Field id="card-name" label="Name">
          <Input
            id="card-name"
            name="name"
            defaultValue={initial?.name ?? ""}
            maxLength={120}
            required
            disabled={isPending}
          />
        </Field>
        <Field id="card-website" label="Website">
          <Input
            id="card-website"
            name="website"
            defaultValue={initial?.website ?? ""}
            maxLength={200}
            disabled={isPending}
          />
        </Field>
      </div>
      <Field id="card-summary" label="Who they are">
        <Textarea
          id="card-summary"
          name="summary"
          rows={2}
          defaultValue={initial?.summary ?? ""}
          maxLength={1000}
          disabled={isPending}
        />
      </Field>
      <Field
        id="card-dismiss"
        label="The quick dismiss"
        hint="One or two sentences a seller can say on a call."
      >
        <Textarea
          id="card-dismiss"
          name="quick_dismiss"
          rows={2}
          defaultValue={initial?.quick_dismiss ?? ""}
          maxLength={1000}
          disabled={isPending}
        />
      </Field>
      <div className="form-grid">
        <Field id="card-win" label="Why we win">
          <Textarea
            id="card-win"
            name="why_we_win"
            rows={3}
            defaultValue={initial?.why_we_win ?? ""}
            maxLength={2000}
            disabled={isPending}
          />
        </Field>
        <Field id="card-lose" label="Why we lose">
          <Textarea
            id="card-lose"
            name="why_we_lose"
            rows={3}
            defaultValue={initial?.why_we_lose ?? ""}
            maxLength={2000}
            disabled={isPending}
          />
        </Field>
      </div>
      <fieldset className="objection-list">
        <legend className="field__label">Objections and answers</legend>
        {objections.map((row, index) => (
          <div key={index} className="objection-row">
            <Input
              aria-label={`Objection ${index + 1}`}
              placeholder="What the buyer says"
              value={row.objection}
              onChange={(event) => edit(index, "objection", event.target.value)}
              maxLength={300}
              disabled={isPending}
            />
            <Input
              aria-label={`Answer ${index + 1}`}
              placeholder="What we say back"
              value={row.response}
              onChange={(event) => edit(index, "response", event.target.value)}
              maxLength={1000}
              disabled={isPending}
            />
          </div>
        ))}
        {objections.length < 20 && (
          <Button
            type="button"
            size="small"
            onClick={() => setObjections((rows) => [...rows, { objection: "", response: "" }])}
            disabled={isPending}
          >
            Add an objection
          </Button>
        )}
      </fieldset>
      <Button type="submit" variant="primary" disabled={isPending}>
        {isPending ? "Saving…" : submitLabel}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/** Put a competitor on a deal, with what they have going for and against them here. */
export function AddDealCompetitorForm({
  action,
  dealId,
  options,
}: {
  action: Action;
  dealId: string;
  options: ReadonlyArray<{ id: string; name: string }>;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="deal_id" value={dealId} />
      <input type="hidden" name="action" value="add" />
      <Field id="deal-competitor" label="Competitor">
        <Select id="deal-competitor" name="competitor_id" defaultValue="" disabled={isPending}>
          <option value="">Choose</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="form-grid">
        <Field id="deal-competitor-strengths" label="Their strengths here">
          <Input
            id="deal-competitor-strengths"
            name="strengths"
            maxLength={1000}
            disabled={isPending}
          />
        </Field>
        <Field id="deal-competitor-weaknesses" label="Their weaknesses here">
          <Input
            id="deal-competitor-weaknesses"
            name="weaknesses"
            maxLength={1000}
            disabled={isPending}
          />
        </Field>
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Adding…" : "Add to the deal"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

const EFFECTS: ReadonlyArray<Option> = [
  { value: "", label: "Not mentioned" },
  { value: "positive", label: "For us" },
  { value: "negative", label: "Against us" },
];

/** A win/loss interview: the buyer's reason in their words, drivers for and against, quotes. */
export function InterviewForm({
  action,
  dealId,
  drivers,
}: {
  action: Action;
  dealId: string;
  drivers: readonly Option[];
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="deal_id" value={dealId} />
      <div className="form-grid">
        <Field id="interview-name" label="Who you spoke to">
          <Input id="interview-name" name="interviewee_name" maxLength={160} disabled={isPending} />
        </Field>
        <Field id="interview-title" label="Their role">
          <Input
            id="interview-title"
            name="interviewee_title"
            maxLength={120}
            disabled={isPending}
          />
        </Field>
      </div>
      <div className="form-grid">
        <Field id="interview-held" label="Held on">
          <Input
            id="interview-held"
            name="held_on"
            type="date"
            defaultValue={today()}
            max={today()}
            disabled={isPending}
          />
        </Field>
      </div>
      <Field
        id="interview-reason"
        label="Why they decided, in their words"
        hint="The buyer's reason, not ours: it sits beside the one on the deal."
      >
        <Input id="interview-reason" name="buyer_reason" maxLength={400} disabled={isPending} />
      </Field>
      <fieldset className="driver-grid">
        <legend className="field__label">What weighed, for or against us</legend>
        {drivers.map((driver) => (
          <label key={driver.value} className="driver-grid__row">
            <span>{driver.label}</span>
            <Select name={`driver:${driver.value}`} defaultValue="" disabled={isPending}>
              {EFFECTS.map((effect) => (
                <option key={effect.value} value={effect.value}>
                  {effect.label}
                </option>
              ))}
            </Select>
          </label>
        ))}
      </fieldset>
      <Field id="interview-quotes" label="Quotes, verbatim">
        <Textarea
          id="interview-quotes"
          name="quotes"
          rows={3}
          maxLength={4000}
          disabled={isPending}
        />
      </Field>
      <Field id="interview-summary" label="Summary">
        <Textarea
          id="interview-summary"
          name="summary"
          rows={3}
          maxLength={4000}
          disabled={isPending}
        />
      </Field>
      <Button type="submit" variant="primary" disabled={isPending}>
        {isPending ? "Saving…" : "Record the interview"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}
