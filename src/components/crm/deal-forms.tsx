"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import type { DealSummary } from "@/lib/api/crm";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";
import { LOSS_REASON_LABELS } from "@/lib/crm/vocabulary";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;
type StageOption = { key: string; label: string };
type PersonOption = { person_id: string; label: string };

export function DealCreateForm({
  action,
  companyId,
  stages,
  people,
  defaultDue,
}: {
  action: Action;
  companyId: string;
  stages: readonly StageOption[];
  people: readonly PersonOption[];
  defaultDue: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <input type="hidden" name="company_id" value={companyId} />
      <Field id="deal-name" label="Deal name" hint="Leave empty for “Firm — new business”.">
        <Input id="deal-name" name="name" maxLength={200} disabled={isPending} />
      </Field>
      <div className="form-row">
        <Field id="deal-stage" label="Stage">
          <Select id="deal-stage" name="stage_key" defaultValue="demo_booked" disabled={isPending}>
            {stages.map((stage) => (
              <option key={stage.key} value={stage.key}>
                {stage.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="deal-mrr" label="Monthly value (USD)">
          <Input
            id="deal-mrr"
            name="mrr_amount"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            disabled={isPending}
          />
        </Field>
      </div>
      <div className="form-row">
        <Field id="deal-seats" label="Seats">
          <Input
            id="deal-seats"
            name="seats"
            type="number"
            min={1}
            step={1}
            defaultValue={1}
            disabled={isPending}
          />
        </Field>
        <Field id="deal-person" label="Main contact">
          <Select id="deal-person" name="primary_person_id" disabled={isPending}>
            <option value="">Nobody yet</option>
            {people.map((person) => (
              <option key={person.person_id} value={person.person_id}>
                {person.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id="deal-step" label="Next step">
        <Input
          id="deal-step"
          name="next_step"
          maxLength={400}
          required
          placeholder="e.g. Book the demo"
          disabled={isPending}
        />
      </Field>
      <Field id="deal-due" label="By">
        <Input
          id="deal-due"
          name="next_step_due"
          type="date"
          defaultValue={defaultDue}
          required
          disabled={isPending}
        />
      </Field>
      <Button variant="primary" type="submit" disabled={isPending}>
        {isPending ? "Opening…" : "Open deal"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/**
 * A stage move always names the next step. The service refuses a move without one;
 * the form asks up front so nobody types a move twice.
 */
export function DealStageForm({
  action,
  deal,
  stages,
  defaultDue,
}: {
  action: Action;
  deal: DealSummary;
  stages: readonly StageOption[];
  defaultDue: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const targets = stages.filter((stage) => stage.key !== deal.stage_key);
  return (
    <form className="stack-form stack-form--tight" action={formAction} key={state.sentAt ?? "move"}>
      <input type="hidden" name="deal_id" value={deal.deal_id} />
      <Field id="move-stage" label="Move to">
        <Select id="move-stage" name="stage_key" disabled={isPending}>
          {targets.map((stage) => (
            <option key={stage.key} value={stage.key}>
              {stage.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="move-step" label="Next step">
        <Input
          id="move-step"
          name="next_step"
          maxLength={400}
          required
          placeholder="What happens next, and who does it"
          disabled={isPending}
        />
      </Field>
      <Field id="move-due" label="By">
        <Input
          id="move-due"
          name="next_step_due"
          type="date"
          defaultValue={defaultDue}
          required
          disabled={isPending}
        />
      </Field>
      <Button variant="primary" type="submit" disabled={isPending || targets.length === 0}>
        {isPending ? "Moving…" : "Move deal"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/** Reschedule or reword the next step without moving the stage. */
export function NextStepForm({ action, deal }: { action: Action; deal: DealSummary }) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="next-step-form" action={formAction}>
      <input type="hidden" name="deal_id" value={deal.deal_id} />
      <label className="sr-only" htmlFor="next-step-text">
        Next step
      </label>
      <input
        id="next-step-text"
        className="input"
        name="next_step"
        defaultValue={deal.next_step}
        maxLength={400}
        required
        placeholder="Name the next step"
        disabled={isPending}
      />
      <label className="sr-only" htmlFor="next-step-due">
        Due
      </label>
      <input
        id="next-step-due"
        className="input"
        name="next_step_due"
        type="date"
        defaultValue={deal.next_step_due}
        required
        disabled={isPending}
      />
      <Button type="submit" size="small" disabled={isPending}>
        {isPending ? "Saving…" : "Update"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

export function DealEditForm({
  action,
  deal,
}: {
  action: Action;
  deal: DealSummary & { notes: string };
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <input type="hidden" name="deal_id" value={deal.deal_id} />
      <Field id="edit-deal-name" label="Deal name">
        <Input
          id="edit-deal-name"
          name="name"
          defaultValue={deal.name}
          maxLength={200}
          required
          disabled={isPending}
        />
      </Field>
      <div className="form-row">
        <Field id="edit-deal-mrr" label="Monthly value">
          <Input
            id="edit-deal-mrr"
            name="mrr_amount"
            type="number"
            min={0}
            step={1}
            defaultValue={deal.mrr_amount ?? undefined}
            disabled={isPending}
          />
        </Field>
        <Field id="edit-deal-seats" label="Seats">
          <Input
            id="edit-deal-seats"
            name="seats"
            type="number"
            min={1}
            step={1}
            defaultValue={deal.seats}
            disabled={isPending}
          />
        </Field>
      </div>
      <Field id="edit-deal-close" label="Expected to close">
        <Input
          id="edit-deal-close"
          name="expected_close_date"
          type="date"
          defaultValue={deal.expected_close_date}
          disabled={isPending}
        />
      </Field>
      <Field id="edit-deal-notes" label="Notes">
        <Textarea
          id="edit-deal-notes"
          name="notes"
          defaultValue={deal.notes}
          rows={4}
          maxLength={8000}
          disabled={isPending}
        />
      </Field>
      <Button variant="primary" type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Save deal"}
      </Button>
      <FormFeedback state={state} sentLabel="Saved." />
    </form>
  );
}

/**
 * Closing is final and the reasons are a closed list: "other" hides everything, and a
 * loss to a competitor names the competitor, or the loss report cannot say who wins.
 */
export function DealCloseForm({ action, deal }: { action: Action; deal: DealSummary }) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [outcome, setOutcome] = useState("won");
  const [reason, setReason] = useState("no_decision");
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <input type="hidden" name="deal_id" value={deal.deal_id} />
      <fieldset className="choice-row">
        <legend className="sr-only">Outcome</legend>
        {[
          ["won", "Won"],
          ["lost", "Lost"],
          ["unqualified", "Unqualified"],
        ].map(([value, label]) => (
          <label key={value} className="choice">
            <input
              type="radio"
              name="outcome"
              value={value}
              checked={outcome === value}
              onChange={() => setOutcome(value!)}
              disabled={isPending}
            />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      {outcome === "lost" && (
        <>
          <Field id="close-reason" label="Why we lost it">
            <Select
              id="close-reason"
              name="loss_reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={isPending}
            >
              {Object.entries(LOSS_REASON_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          {reason === "competitor" && (
            <Field id="close-competitor" label="Which competitor">
              <Input
                id="close-competitor"
                name="loss_competitor"
                maxLength={120}
                required
                disabled={isPending}
              />
            </Field>
          )}
          <Field id="close-detail" label="In a sentence">
            <Input id="close-detail" name="loss_detail" maxLength={400} disabled={isPending} />
          </Field>
        </>
      )}
      <Button variant={outcome === "won" ? "primary" : "danger"} type="submit" disabled={isPending}>
        {isPending
          ? "Closing…"
          : outcome === "won"
            ? "Close as won"
            : outcome === "lost"
              ? "Close as lost"
              : "Close as unqualified"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}
