"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { AttemptField } from "@/components/ui/attempt-field";
import type { DeskRules, SlaRow } from "@/lib/api/settings";
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

type PlanRowProps = {
  action: Action;
  plan: {
    key: string;
    name: string;
    unit_amount: number;
    currency: string;
    billing_cadence: string;
    min_seats: number;
  };
  archived: boolean;
};

/** A plan on the price list: renamed or repriced in place, archived out of the pickers, or restored. */
export function PlanRowForm({ action, plan, archived }: PlanRowProps) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const id = `plan-${plan.key}`;
  const off = isPending || archived;
  return (
    <form className="plan-row" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="key" value={plan.key} />
      <label className="sr-only" htmlFor={`${id}-name`}>
        Name of {plan.key}
      </label>
      <Input
        id={`${id}-name`}
        name="name"
        defaultValue={plan.name}
        maxLength={80}
        required
        disabled={off}
      />
      <label className="plan-row__field">
        <span className="sr-only">Price per seat per month</span>
        <Input
          id={`${id}-amount`}
          name="unit_amount"
          type="number"
          min={0.01}
          step={0.01}
          defaultValue={plan.unit_amount}
          required
          disabled={off}
        />
      </label>
      <Input
        id={`${id}-currency`}
        name="currency"
        defaultValue={plan.currency}
        maxLength={3}
        pattern="[A-Za-z]{3}"
        aria-label="Currency"
        disabled={off}
      />
      <Select
        id={`${id}-cadence`}
        name="billing_cadence"
        defaultValue={plan.billing_cadence}
        aria-label="Billed"
        disabled={off}
      >
        <option value="monthly">Monthly</option>
        <option value="annual">Annually</option>
      </Select>
      <Input
        id={`${id}-seats`}
        name="min_seats"
        type="number"
        min={1}
        step={1}
        defaultValue={plan.min_seats}
        aria-label="Minimum seats"
        disabled={off}
      />
      <span className="plan-row__key mono">{plan.key}</span>
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
          </>
        )}
      </div>
      <FormFeedback state={state} />
    </form>
  );
}

export function NewPlanForm({ action }: { action: Action }) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form" action={formAction} key={state.sentAt ?? "new"}>
      <AttemptField state={state} />
      <Field id="plan-new-name" label="Name" hint="As it reads on a contract: “Professional desk”.">
        <Input id="plan-new-name" name="name" maxLength={80} required disabled={isPending} />
      </Field>
      <div className="form-row">
        <Field id="plan-new-amount" label="Per seat, per month">
          <Input
            id="plan-new-amount"
            name="unit_amount"
            type="number"
            min={0.01}
            step={0.01}
            required
            disabled={isPending}
          />
        </Field>
        <Field id="plan-new-currency" label="Currency">
          <Input
            id="plan-new-currency"
            name="currency"
            defaultValue="USD"
            maxLength={3}
            pattern="[A-Za-z]{3}"
            disabled={isPending}
          />
        </Field>
      </div>
      <div className="form-row">
        <Field id="plan-new-cadence" label="Billed">
          <Select
            id="plan-new-cadence"
            name="billing_cadence"
            defaultValue="monthly"
            disabled={isPending}
          >
            <option value="monthly">Monthly</option>
            <option value="annual">Annually</option>
          </Select>
        </Field>
        <Field id="plan-new-seats" label="Minimum seats">
          <Input
            id="plan-new-seats"
            name="min_seats"
            type="number"
            min={1}
            step={1}
            defaultValue={1}
            disabled={isPending}
          />
        </Field>
      </div>
      <Field id="plan-new-key" label="Key" hint="Lowercase, e.g. pro. Fixed once added.">
        <Input
          id="plan-new-key"
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
        {isPending ? "Adding…" : "Add plan"}
      </Button>
      <FormFeedback state={state} sentLabel="Added." />
    </form>
  );
}

/**
 * The desk's standing rules in one form: when a thread waiting on the customer is nudged
 * and then closed, whether an assignee is mailed about a reply timer, and who new
 * conversations are dealt to. Saved together because the two day counts constrain each
 * other.
 */
export function DeskRulesForm({
  action,
  rules,
  staff,
}: {
  action: Action;
  rules: DeskRules;
  /** Active staff who can write on the desk; the pool is chosen from these. */
  staff: readonly { staff_id: string; display_name: string }[];
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form" action={formAction}>
      <AttemptField state={state} />
      <div className="form-row">
        <Field
          id="desk-nudge"
          label="Nudge after (days)"
          hint="Waiting on the customer, since the desk last wrote. 0 turns it off."
        >
          <Input
            id="desk-nudge"
            name="nudge_days"
            type="number"
            inputMode="numeric"
            min={0}
            max={rules.max_days}
            defaultValue={rules.nudge_days}
            required
            disabled={isPending}
          />
        </Field>
        <Field
          id="desk-autoclose"
          label="Close after (days)"
          hint="Resolved by rule with a public line; a reply reopens it. 0 turns it off."
        >
          <Input
            id="desk-autoclose"
            name="autoclose_days"
            type="number"
            inputMode="numeric"
            min={0}
            max={rules.max_days}
            defaultValue={rules.autoclose_days}
            required
            disabled={isPending}
          />
        </Field>
      </div>
      <Checkbox
        id="desk-alert"
        name="alert_assignee"
        label="Email the assignee when a reply timer is at risk or breached"
        description="One mail per deadline, to the person the conversation is assigned to."
        defaultChecked={rules.alert_assignee}
        disabled={isPending}
      />
      <fieldset className="checkbox-group" disabled={isPending}>
        <legend className="field__label">Deal new conversations to</legend>
        <p className="field__hint">
          Whoever has the fewest open conversations takes the next one. Nobody ticked means
          conversations wait in the unassigned queue.
        </p>
        {staff.length === 0 ? (
          <p className="table-sub">No active desk staff to choose from.</p>
        ) : (
          staff.map((member) => (
            <Checkbox
              key={member.staff_id}
              id={`desk-pool-${member.staff_id}`}
              name="assign_pool"
              value={member.staff_id}
              label={member.display_name}
              defaultChecked={rules.assign_pool.includes(member.staff_id)}
            />
          ))
        )}
      </fieldset>
      <div className="sla-row__foot">
        <Button type="submit" size="small" disabled={isPending}>
          {isPending ? "Saving…" : "Save rules"}
        </Button>
        <FormFeedback state={state} />
      </div>
    </form>
  );
}
