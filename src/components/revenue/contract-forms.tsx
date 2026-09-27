"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { CANCEL_REASON_LABELS } from "@/lib/crm/vocabulary";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;
type Option = { id: string; label: string };

const CURRENCIES = ["USD", "EUR", "GBP", "CHF", "INR", "SGD"] as const;

export type ContractPrefill = {
  company_id?: string;
  deal_id?: string;
  mrr_amount?: string;
  seats?: string;
};

export function ContractCreateForm({
  action,
  companies,
  today,
  prefill = {},
}: {
  action: Action;
  companies: readonly Option[];
  today: string;
  prefill?: ContractPrefill;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      {prefill.deal_id && <input type="hidden" name="deal_id" value={prefill.deal_id} />}
      <Field id="contract-company" label="Company">
        <Select
          id="contract-company"
          name="company_id"
          defaultValue={prefill.company_id ?? ""}
          required
          disabled={isPending}
        >
          <option value="">Choose a company</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="contract-plan" label="Plan">
        <Input
          id="contract-plan"
          name="plan_name"
          maxLength={80}
          placeholder="e.g. Professional desk"
          disabled={isPending}
        />
      </Field>
      <div className="form-row">
        <Field id="contract-mrr" label="Monthly value">
          <Input
            id="contract-mrr"
            name="mrr_amount"
            type="number"
            min={0.01}
            step={0.01}
            required
            defaultValue={prefill.mrr_amount}
            disabled={isPending}
          />
        </Field>
        <Field id="contract-currency" label="Currency">
          <Select id="contract-currency" name="currency" defaultValue="USD" disabled={isPending}>
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="form-row">
        <Field id="contract-seats" label="Seats">
          <Input
            id="contract-seats"
            name="seats"
            type="number"
            min={1}
            step={1}
            defaultValue={prefill.seats ?? "1"}
            disabled={isPending}
          />
        </Field>
        <Field id="contract-cadence" label="Billed">
          <Select
            id="contract-cadence"
            name="billing_cadence"
            defaultValue="monthly"
            disabled={isPending}
          >
            <option value="monthly">Monthly</option>
            <option value="annual">Annually</option>
          </Select>
        </Field>
      </div>
      <div className="form-row">
        <Field id="contract-start" label="Starts">
          <Input
            id="contract-start"
            name="starts_on"
            type="date"
            defaultValue={today}
            required
            disabled={isPending}
          />
        </Field>
        <Field id="contract-term" label="Term (months)">
          <Input
            id="contract-term"
            name="term_months"
            type="number"
            min={1}
            max={60}
            defaultValue={12}
            disabled={isPending}
          />
        </Field>
      </div>
      <Button variant="primary" type="submit" disabled={isPending}>
        {isPending ? "Recording…" : "Record contract"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/** A price or seat change, dated when it takes effect: that date is the movement's. */
export function ContractPriceForm({
  action,
  contractId,
  currentMrr,
  currentSeats,
  currency,
  today,
}: {
  action: Action;
  contractId: string;
  currentMrr: number;
  currentSeats: number;
  currency: string;
  today: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form
      className="stack-form stack-form--tight"
      action={formAction}
      key={state.sentAt ?? "price"}
    >
      <input type="hidden" name="contract_id" value={contractId} />
      <div className="form-row">
        <Field id="price-mrr" label={`New monthly value (${currency})`}>
          <Input
            id="price-mrr"
            name="mrr_amount"
            type="number"
            min={0.01}
            step={0.01}
            defaultValue={currentMrr}
            required
            disabled={isPending}
          />
        </Field>
        <Field id="price-seats" label="Seats">
          <Input
            id="price-seats"
            name="seats"
            type="number"
            min={1}
            defaultValue={currentSeats}
            disabled={isPending}
          />
        </Field>
      </div>
      <Field
        id="price-effective"
        label="From"
        hint="The day the new price applies; the movement is dated then."
      >
        <Input
          id="price-effective"
          name="effective_on"
          type="date"
          defaultValue={today}
          required
          disabled={isPending}
        />
      </Field>
      <Field id="price-note" label="Note">
        <Input
          id="price-note"
          name="note"
          maxLength={400}
          placeholder="e.g. Second desk added"
          disabled={isPending}
        />
      </Field>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Change price"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

export function ContractCancelForm({
  action,
  contractId,
  defaultEnd,
}: {
  action: Action;
  contractId: string;
  defaultEnd: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <input type="hidden" name="contract_id" value={contractId} />
      <Field
        id="cancel-ends"
        label="Last day of service"
        hint="Revenue continues until then; the churn is dated that day."
      >
        <Input
          id="cancel-ends"
          name="ends_on"
          type="date"
          defaultValue={defaultEnd}
          required
          disabled={isPending}
        />
      </Field>
      <Field id="cancel-reason" label="Why they are leaving">
        <Select id="cancel-reason" name="cancel_reason" defaultValue="price" disabled={isPending}>
          {Object.entries(CANCEL_REASON_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="cancel-note" label="In their words">
        <Textarea id="cancel-note" name="note" rows={2} maxLength={400} disabled={isPending} />
      </Field>
      <Button type="submit" variant="danger" disabled={isPending}>
        {isPending ? "Canceling…" : "Record cancellation"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/** A correction no contract change explains: signed, dated, and reasoned in writing. */
export function MrrAdjustForm({
  action,
  companies,
  currency,
  today,
  disabled,
}: {
  action: Action;
  companies: readonly Option[];
  currency: string;
  today: string;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const off = isPending || disabled;
  return (
    <form
      className="stack-form stack-form--tight"
      action={formAction}
      key={state.sentAt ?? "adjust"}
    >
      <input type="hidden" name="currency" value={currency} />
      <Field id="adjust-company" label="Company">
        <Select id="adjust-company" name="company_id" required disabled={off}>
          <option value="">Choose a company</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="form-row">
        <Field id="adjust-amount" label={`Amount (${currency})`} hint="Negative to reduce.">
          <Input
            id="adjust-amount"
            name="amount"
            type="number"
            step={0.01}
            required
            disabled={off}
          />
        </Field>
        <Field id="adjust-date" label="Effective">
          <Input
            id="adjust-date"
            name="effective_on"
            type="date"
            defaultValue={today}
            required
            disabled={off}
          />
        </Field>
      </div>
      <Field id="adjust-reason" label="Reason" hint="Kept with the movement and in the audit log.">
        <Input id="adjust-reason" name="reason" maxLength={400} required disabled={off} />
      </Field>
      <Button type="submit" disabled={off}>
        {isPending ? "Recording…" : "Record adjustment"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}
