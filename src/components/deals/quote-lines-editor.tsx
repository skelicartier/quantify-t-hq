"use client";

import { useActionState, useState, useTransition } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

type PlanOption = {
  key: string;
  name: string;
  unit_amount: number;
  currency: string;
  min_seats: number;
};
type EditorLine = {
  key: string;
  line_id: string;
  plan_key: string | null;
  kind: "recurring" | "one_off";
  description: string;
  quantity: string;
  unit_price: string;
  /** The list price the line is pinned to; null for a line of our own (it has none). */
  list_unit: number | null;
};
type SavedLine = {
  line_id: string;
  plan_key: string | null;
  kind: "recurring" | "one_off";
  description: string;
  quantity: number;
  unit_price: number;
  list_unit: number;
};

const money = (value: number, currency: string) =>
  new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    ...(Math.round(value * 100) % 100 === 0
      ? { maximumFractionDigits: 0, minimumFractionDigits: 0 }
      : {}),
  }).format(value);

/** How far under the list, unrounded; a price over the list is no discount. */
const exact = (list: number, net: number) =>
  list <= 0 ? 0 : Math.max(0, ((list - net) / list) * 100);

let counter = 0;
const nextKey = () => `line-${(counter += 1)}`;

/**
 * The quote's lines, edited in place: from the price list (the list price shown beside
 * the price asked) or written in. The totals and the approval it will need are worked out
 * as you type, with the service's own thresholds; the service decides when it is saved.
 */
export function QuoteLinesEditor({
  action,
  dealId,
  quoteId,
  currency,
  termMonths,
  lines: saved,
  plans,
  peerAbove,
  adminAbove,
  disabled,
}: {
  action: Action;
  dealId: string;
  quoteId: string;
  currency: string;
  termMonths: number;
  lines: SavedLine[];
  plans: PlanOption[];
  peerAbove: number;
  adminAbove: number;
  disabled: boolean;
}) {
  const [state, formAction, isSaving] = useActionState(action, INITIAL_ACTION_STATE);
  const [isSubmitting, startSubmit] = useTransition();
  const pending = isSaving || isSubmitting;
  const choices = plans.filter((plan) => plan.currency === currency);
  const [lines, setLines] = useState<EditorLine[]>(() =>
    // Saved lines are keyed by position: their keys become element ids, which the server
    // and the browser must agree on. Lines added later are only ever made in the browser.
    saved.map((line, index) => ({
      key: `saved-${index}`,
      line_id: line.line_id,
      plan_key: line.plan_key,
      kind: line.kind,
      description: line.description,
      quantity: String(line.quantity),
      unit_price: String(line.unit_price),
      list_unit: line.plan_key ? line.list_unit : null,
    })),
  );
  const [nextPlan, setNextPlan] = useState(choices[0]?.key ?? "");
  const [nextKind, setNextKind] = useState<"recurring" | "one_off">("one_off");
  const off = disabled || pending;

  const change = (key: string, patch: Partial<EditorLine>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  let listRecurring = 0;
  let netRecurring = 0;
  let netOneOff = 0;
  let deepest = 0;
  let offList = false;
  for (const line of lines) {
    const quantity = Number(line.quantity) || 0;
    const unit = Number(line.unit_price) || 0;
    const list = line.list_unit ?? unit;
    if (line.kind === "recurring") {
      listRecurring += list * quantity;
      netRecurring += unit * quantity;
      if (!line.plan_key) offList = true;
    } else netOneOff += unit * quantity;
    deepest = Math.max(deepest, exact(list, unit));
  }
  const tier =
    deepest > adminAbove
      ? "An owner or admin approves it"
      : deepest > peerAbove || offList
        ? "A second person approves it"
        : "No approval needed";

  const payload = lines.map((line) => ({
    ...(line.line_id ? { line_id: line.line_id } : {}),
    ...(line.plan_key ? { plan_key: line.plan_key } : { kind: line.kind }),
    description: line.description,
    quantity: line.quantity,
    unit_price: line.unit_price,
  }));

  return (
    <form
      className="stack-form quote-editor"
      onSubmit={(event) => {
        event.preventDefault();
        startSubmit(() => formAction(new FormData(event.currentTarget)));
      }}
    >
      <AttemptField state={state} />
      <input type="hidden" name="deal_id" value={dealId} />
      <input type="hidden" name="quote_id" value={quoteId} />
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />
      {lines.length === 0 && (
        <p className="muted">No lines yet. Add one from the price list or write one in.</p>
      )}
      <ol className="quote-editor__lines">
        {lines.map((line, index) => {
          const quantity = Number(line.quantity) || 0;
          const unit = Number(line.unit_price) || 0;
          const cut = line.list_unit === null ? 0 : exact(line.list_unit, unit);
          return (
            <li key={line.key} className="quote-editor__line">
              <Field id={`${line.key}-what`} label={`Line ${index + 1}`}>
                <Input
                  id={`${line.key}-what`}
                  value={line.description}
                  maxLength={300}
                  disabled={off}
                  onChange={(event) => change(line.key, { description: event.target.value })}
                />
              </Field>
              <Field id={`${line.key}-qty`} label={line.plan_key ? "Seats" : "Quantity"}>
                <Input
                  id={`${line.key}-qty`}
                  inputMode="numeric"
                  value={line.quantity}
                  maxLength={6}
                  disabled={off}
                  onChange={(event) => change(line.key, { quantity: event.target.value })}
                />
              </Field>
              <Field
                id={`${line.key}-price`}
                label={line.kind === "recurring" ? "Price a month" : "Price, once"}
              >
                <Input
                  id={`${line.key}-price`}
                  inputMode="decimal"
                  value={line.unit_price}
                  maxLength={12}
                  disabled={off}
                  onChange={(event) => change(line.key, { unit_price: event.target.value })}
                />
              </Field>
              <p className="quote-editor__figure">
                <span className="quiet">
                  {line.list_unit === null
                    ? line.kind === "recurring"
                      ? "Not on the price list"
                      : "One-off"
                    : `List ${money(line.list_unit, currency)}${cut > 0 ? ` · ${Math.round(cut * 10) / 10}% off` : ""}`}
                </span>
                <strong>{money(unit * quantity, currency)}</strong>
              </p>
              <Button
                type="button"
                variant="ghost"
                size="small"
                disabled={off}
                aria-label={`Remove line ${index + 1}, ${line.description || "unnamed"}`}
                onClick={() =>
                  setLines((current) => current.filter((item) => item.key !== line.key))
                }
              >
                Remove
              </Button>
            </li>
          );
        })}
      </ol>
      <div className="quote-editor__add">
        {choices.length > 0 && (
          <div className="quote-editor__adder">
            <Field id={`${quoteId}-plan`} label="From the price list">
              <Select
                id={`${quoteId}-plan`}
                value={nextPlan}
                disabled={off}
                onChange={(event) => setNextPlan(event.target.value)}
              >
                {choices.map((plan) => (
                  <option key={plan.key} value={plan.key}>
                    {plan.name} · {money(plan.unit_amount, plan.currency)} a seat
                    {plan.min_seats > 1 ? ` · at least ${plan.min_seats}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              type="button"
              size="small"
              disabled={off || !nextPlan}
              onClick={() => {
                const plan = choices.find((item) => item.key === nextPlan);
                if (!plan) return;
                setLines((current) => [
                  ...current,
                  {
                    key: nextKey(),
                    line_id: "",
                    plan_key: plan.key,
                    kind: "recurring",
                    description: plan.name,
                    quantity: String(plan.min_seats),
                    unit_price: String(plan.unit_amount),
                    list_unit: plan.unit_amount,
                  },
                ]);
              }}
            >
              Add the plan
            </Button>
          </div>
        )}
        <div className="quote-editor__adder">
          <Field id={`${quoteId}-kind`} label="A line of your own">
            <Select
              id={`${quoteId}-kind`}
              value={nextKind}
              disabled={off}
              onChange={(event) =>
                setNextKind(event.target.value === "recurring" ? "recurring" : "one_off")
              }
            >
              <option value="one_off">Charged once (set-up, training)</option>
              <option value="recurring">Charged monthly (off the price list)</option>
            </Select>
          </Field>
          <Button
            type="button"
            size="small"
            disabled={off}
            onClick={() =>
              setLines((current) => [
                ...current,
                {
                  key: nextKey(),
                  line_id: "",
                  plan_key: null,
                  kind: nextKind,
                  description: "",
                  quantity: "1",
                  unit_price: "",
                  list_unit: null,
                },
              ])
            }
          >
            Add a line
          </Button>
        </div>
      </div>
      <dl className="quote-editor__totals">
        <div>
          <dt>A month</dt>
          <dd>
            {money(netRecurring, currency)}
            {listRecurring > netRecurring && (
              <span className="quiet"> of {money(listRecurring, currency)} list</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Once</dt>
          <dd>{money(netOneOff, currency)}</dd>
        </div>
        <div>
          <dt>First {termMonths} months</dt>
          <dd>{money(netRecurring * termMonths + netOneOff, currency)}</dd>
        </div>
        <div>
          <dt>Approval</dt>
          <dd>{tier}</dd>
        </div>
      </dl>
      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={off}>
          {pending ? "Saving…" : "Save the lines"}
        </Button>
      </div>
      <FormFeedback state={state} />
    </form>
  );
}
