"use client";

import { useActionState, useState, useTransition } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;
type Option = { value: string; label: string };
type FieldOption = Option & { kind: string };

type Trigger = {
  kind: string;
  field?: string | undefined;
  to?: string | undefined;
  stage_key?: string | undefined;
  days?: number | undefined;
};
type Condition = { field: string; op: string; value: string };
type Step = {
  kind: string;
  title?: string | undefined;
  due_in_days?: number | undefined;
  priority?: string | undefined;
  to?: string | undefined;
  message?: string | undefined;
  field?: string | undefined;
  value?: string | undefined;
  label?: string | undefined;
  sequence_id?: string | undefined;
};
export type BuilderDefinition = { trigger: Trigger; conditions: Condition[]; actions: Step[] };

export type BuilderOptions = {
  triggers: readonly Option[];
  ops: readonly Option[];
  action_kinds: readonly Option[];
  fields: readonly FieldOption[];
  settable: readonly FieldOption[];
  date_fields: readonly Option[];
  stages: readonly Option[];
  lifecycles: readonly string[];
  priorities: readonly string[];
  staff: readonly { staff_id: string; name: string }[];
  sequences: readonly { sequence_id: string; name: string; state: string }[];
};

const VALUE_OPS = new Set(["is", "not", "has", "gt", "lt"]);

function newStep(kind: string): Step {
  switch (kind) {
    case "task":
      return { kind, title: "", due_in_days: 1, priority: "medium", to: "owner" };
    case "notify":
      return { kind, to: "owner", message: "" };
    case "set_field":
      return { kind, field: "", value: "" };
    case "enrol":
      return { kind, sequence_id: "" };
    default:
      return { kind, label: "" };
  }
}

function sentence(value: string): string {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1).replace(/_/g, " ")}` : value;
}

/**
 * When · If · Then, edited in place and saved as the draft. The draft never runs: the
 * page's Publish makes it the next version. Every choice offered is one the service
 * accepts, and the service checks the whole of it again on save.
 */
export function AutomationBuilder({
  action,
  automationId,
  name: initialName,
  draft,
  options,
  limits,
  disabled,
}: {
  action: Action;
  automationId: string;
  name: string;
  draft: BuilderDefinition;
  options: BuilderOptions;
  limits: { conditions: number; actions: number };
  disabled: boolean;
}) {
  const [state, formAction, isSaving] = useActionState(action, INITIAL_ACTION_STATE);
  const [isSubmitting, startSubmit] = useTransition();
  const isPending = isSaving || isSubmitting;
  const [name, setName] = useState(initialName);
  const [trigger, setTrigger] = useState<Trigger>(draft.trigger);
  const [conditions, setConditions] = useState<Condition[]>(draft.conditions);
  const [steps, setSteps] = useState<Step[]>(draft.actions);
  const [nextKind, setNextKind] = useState(options.action_kinds[0]?.value ?? "task");
  const off = disabled || isPending;
  const fieldKind = (key: string) =>
    options.fields.find((field) => field.value === key)?.kind ?? "text";
  const definition = { trigger, conditions, actions: steps };

  const setCondition = (index: number, next: Partial<Condition>) =>
    setConditions((rows) => rows.map((row, at) => (at === index ? { ...row, ...next } : row)));
  const setStep = (index: number, next: Partial<Step>) =>
    setSteps((rows) => rows.map((row, at) => (at === index ? { ...row, ...next } : row)));

  const staffOptions = (withOwner: boolean) => (
    <>
      {withOwner && <option value="owner">The record&apos;s owner</option>}
      {options.staff.map((person) => (
        <option key={person.staff_id} value={person.staff_id}>
          {person.name}
        </option>
      ))}
    </>
  );

  const valueInput = (
    id: string,
    kind: string,
    field: string,
    value: string,
    onChange: (value: string) => void,
  ) => {
    if (field === "lifecycle")
      return (
        <Select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={off}
        >
          <option value="">Choose</option>
          {options.lifecycles.map((item) => (
            <option key={item} value={item}>
              {sentence(item)}
            </option>
          ))}
        </Select>
      );
    if (kind === "staff")
      return (
        <Select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={off}
        >
          <option value="">Choose</option>
          {staffOptions(false)}
        </Select>
      );
    if (kind === "bool")
      return (
        <Select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={off}
        >
          <option value="true">Yes</option>
          <option value="false">No</option>
        </Select>
      );
    return (
      <Input
        id={id}
        type={kind === "date" ? "date" : "text"}
        inputMode={kind === "number" ? "decimal" : undefined}
        value={value}
        maxLength={200}
        onChange={(event) => onChange(event.target.value)}
        disabled={off}
      />
    );
  };

  return (
    // Submitted through a transition rather than the form's action: React resets a form
    // after its action succeeds, and the reset would put every select back on its first
    // option while the builder's state (and the draft it saves) still held the choices.
    <form
      className="stack-form automation-builder"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startSubmit(() => formAction(data));
      }}
    >
      <AttemptField state={state} />
      <input type="hidden" name="automation_id" value={automationId} />
      <input type="hidden" name="definition" value={JSON.stringify(definition)} />
      <Field id="auto-name" label="Name">
        <Input
          id="auto-name"
          name="name"
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          disabled={off}
        />
      </Field>

      <fieldset className="fieldset automation-builder__part">
        <legend>When</legend>
        <div className="form-grid">
          <Field id="auto-trigger" label="Trigger">
            <Select
              id="auto-trigger"
              value={trigger.kind}
              onChange={(event) => setTrigger({ kind: event.target.value })}
              disabled={off}
            >
              {options.triggers.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          {trigger.kind === "field_changed" && (
            <Field id="auto-trigger-field" label="Field">
              <Select
                id="auto-trigger-field"
                value={trigger.field ?? ""}
                onChange={(event) => setTrigger({ ...trigger, field: event.target.value, to: "" })}
                disabled={off}
              >
                <option value="">Choose</option>
                {options.fields.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {trigger.kind === "stage_entered" && (
            <Field id="auto-trigger-stage" label="Stage">
              <Select
                id="auto-trigger-stage"
                value={trigger.stage_key ?? ""}
                onChange={(event) => setTrigger({ ...trigger, stage_key: event.target.value })}
                disabled={off}
              >
                <option value="">Choose</option>
                {options.stages.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {trigger.kind === "date_before" && (
            <>
              <Field id="auto-trigger-date" label="Date">
                <Select
                  id="auto-trigger-date"
                  value={trigger.field ?? ""}
                  onChange={(event) => setTrigger({ ...trigger, field: event.target.value })}
                  disabled={off}
                >
                  <option value="">Choose</option>
                  {options.date_fields.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="auto-trigger-days" label="Days before" hint="0 runs on the day itself.">
                <Input
                  id="auto-trigger-days"
                  type="number"
                  min={0}
                  max={365}
                  value={trigger.days ?? 7}
                  onChange={(event) => setTrigger({ ...trigger, days: Number(event.target.value) })}
                  disabled={off}
                />
              </Field>
            </>
          )}
        </div>
        {trigger.kind === "field_changed" && trigger.field && (
          <Field
            id="auto-trigger-to"
            label="Changes to"
            hint="Leave empty to run on any change to the field."
          >
            {valueInput(
              "auto-trigger-to",
              fieldKind(trigger.field),
              trigger.field,
              trigger.to ?? "",
              (to) => setTrigger({ ...trigger, to }),
            )}
          </Field>
        )}
      </fieldset>

      <fieldset className="fieldset automation-builder__part">
        <legend>If</legend>
        {conditions.length === 0 && (
          <p className="muted">No conditions: every record the trigger fires on.</p>
        )}
        {conditions.map((condition, index) => (
          <div key={index} className="automation-builder__row">
            <Field id={`auto-cond-field-${index}`} label={`Condition ${index + 1}`}>
              <Select
                id={`auto-cond-field-${index}`}
                value={condition.field}
                onChange={(event) => setCondition(index, { field: event.target.value, value: "" })}
                disabled={off}
              >
                <option value="">Choose a field</option>
                {options.fields.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id={`auto-cond-op-${index}`} label="Test">
              <Select
                id={`auto-cond-op-${index}`}
                value={condition.op}
                onChange={(event) => setCondition(index, { op: event.target.value })}
                disabled={off}
              >
                {options.ops.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
            {VALUE_OPS.has(condition.op) && (
              <Field id={`auto-cond-value-${index}`} label="Value">
                {valueInput(
                  `auto-cond-value-${index}`,
                  fieldKind(condition.field),
                  condition.field,
                  condition.value,
                  (value) => setCondition(index, { value }),
                )}
              </Field>
            )}
            <Button
              type="button"
              size="small"
              variant="ghost"
              onClick={() => setConditions((rows) => rows.filter((_, at) => at !== index))}
              disabled={off}
              aria-label={`Remove condition ${index + 1}`}
            >
              Remove
            </Button>
          </div>
        ))}
        {conditions.length < limits.conditions && (
          <Button
            type="button"
            size="small"
            onClick={() => setConditions((rows) => [...rows, { field: "", op: "is", value: "" }])}
            disabled={off}
          >
            Add a condition
          </Button>
        )}
      </fieldset>

      <fieldset className="fieldset automation-builder__part">
        <legend>Then</legend>
        {steps.length === 0 && (
          <p className="muted">No actions yet. It cannot be published without one.</p>
        )}
        {steps.map((step, index) => {
          const label =
            options.action_kinds.find((item) => item.value === step.kind)?.label ?? step.kind;
          const settable = options.settable.find((item) => item.value === step.field);
          return (
            <div key={index} className="automation-builder__step">
              <p className="automation-builder__step-title">
                {index + 1}. {label}
              </p>
              {step.kind === "task" && (
                <>
                  <Field id={`auto-step-title-${index}`} label="Task">
                    <Input
                      id={`auto-step-title-${index}`}
                      value={step.title ?? ""}
                      maxLength={200}
                      onChange={(event) => setStep(index, { title: event.target.value })}
                      disabled={off}
                    />
                  </Field>
                  <div className="form-grid">
                    <Field id={`auto-step-to-${index}`} label="For">
                      <Select
                        id={`auto-step-to-${index}`}
                        value={step.to ?? "owner"}
                        onChange={(event) => setStep(index, { to: event.target.value })}
                        disabled={off}
                      >
                        {staffOptions(true)}
                      </Select>
                    </Field>
                    <Field id={`auto-step-due-${index}`} label="Due in days">
                      <Input
                        id={`auto-step-due-${index}`}
                        type="number"
                        min={0}
                        max={365}
                        value={step.due_in_days ?? 0}
                        onChange={(event) =>
                          setStep(index, { due_in_days: Number(event.target.value) })
                        }
                        disabled={off}
                      />
                    </Field>
                    <Field id={`auto-step-priority-${index}`} label="Priority">
                      <Select
                        id={`auto-step-priority-${index}`}
                        value={step.priority ?? "medium"}
                        onChange={(event) => setStep(index, { priority: event.target.value })}
                        disabled={off}
                      >
                        {options.priorities.map((item) => (
                          <option key={item} value={item}>
                            {sentence(item)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                </>
              )}
              {step.kind === "notify" && (
                <div className="form-grid">
                  <Field id={`auto-step-to-${index}`} label="Tell">
                    <Select
                      id={`auto-step-to-${index}`}
                      value={step.to ?? "owner"}
                      onChange={(event) => setStep(index, { to: event.target.value })}
                      disabled={off}
                    >
                      {staffOptions(true)}
                    </Select>
                  </Field>
                  <Field id={`auto-step-message-${index}`} label="Message">
                    <Input
                      id={`auto-step-message-${index}`}
                      value={step.message ?? ""}
                      maxLength={300}
                      onChange={(event) => setStep(index, { message: event.target.value })}
                      disabled={off}
                    />
                  </Field>
                </div>
              )}
              {step.kind === "set_field" && (
                <div className="form-grid">
                  <Field id={`auto-step-field-${index}`} label="Field">
                    <Select
                      id={`auto-step-field-${index}`}
                      value={step.field ?? ""}
                      onChange={(event) => setStep(index, { field: event.target.value, value: "" })}
                      disabled={off}
                    >
                      <option value="">Choose</option>
                      {options.settable.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {step.field && (
                    <Field id={`auto-step-value-${index}`} label="Set to">
                      {valueInput(
                        `auto-step-value-${index}`,
                        settable?.kind ?? "text",
                        step.field,
                        step.value ?? "",
                        (value) => setStep(index, { value }),
                      )}
                    </Field>
                  )}
                </div>
              )}
              {step.kind === "enrol" && (
                <Field
                  id={`auto-step-sequence-${index}`}
                  label="Sequence"
                  hint="As you, under every rule an enrolment by hand is judged by; a refusal is written on the run."
                >
                  <Select
                    id={`auto-step-sequence-${index}`}
                    value={step.sequence_id ?? ""}
                    onChange={(event) => setStep(index, { sequence_id: event.target.value })}
                    disabled={off}
                  >
                    <option value="">Choose</option>
                    {options.sequences.map((item) => (
                      <option key={item.sequence_id} value={item.sequence_id}>
                        {item.name}
                        {item.state === "active" ? "" : ` (${item.state})`}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {step.kind === "webhook" && (
                <Field
                  id={`auto-step-label-${index}`}
                  label="Label"
                  hint="Sent as automation.fired to every receiver that takes it."
                >
                  <Input
                    id={`auto-step-label-${index}`}
                    value={step.label ?? ""}
                    maxLength={80}
                    onChange={(event) => setStep(index, { label: event.target.value })}
                    disabled={off}
                  />
                </Field>
              )}
              <Button
                type="button"
                size="small"
                variant="ghost"
                onClick={() => setSteps((rows) => rows.filter((_, at) => at !== index))}
                disabled={off}
                aria-label={`Remove action ${index + 1}`}
              >
                Remove
              </Button>
            </div>
          );
        })}
        {steps.length < limits.actions && (
          <div className="automation-builder__add">
            <Field id="auto-next-kind" label="Add an action">
              <Select
                id="auto-next-kind"
                value={nextKind}
                onChange={(event) => setNextKind(event.target.value)}
                disabled={off}
              >
                {options.action_kinds.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              type="button"
              size="small"
              onClick={() => setSteps((rows) => [...rows, newStep(nextKind)])}
              disabled={off}
            >
              Add
            </Button>
          </div>
        )}
      </fieldset>
      <Button type="submit" variant="primary" disabled={off}>
        {isPending ? "Saving…" : "Save the draft"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

type DryRunResult = {
  results: {
    record_id: string;
    label: string;
    matches: boolean;
    why_not: string[];
    would: string[];
  }[];
  checked: number;
  would_match: number;
  trigger_note: string;
};

/** Tries the saved draft on the last fifty records and lists what it would do. */
export function DryRunPanel({ action, automationId }: { action: Action; automationId: string }) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  let result: DryRunResult | null = null;
  if (state.status === "sent" && state.detail) {
    try {
      result = JSON.parse(state.detail) as DryRunResult;
    } catch {
      result = null;
    }
  }
  return (
    <div className="stack-form">
      <form action={formAction}>
        <AttemptField state={state} />
        <input type="hidden" name="automation_id" value={automationId} />
        <Button type="submit" disabled={isPending}>
          {isPending ? "Trying…" : "Try the saved draft"}
        </Button>
      </form>
      <FormFeedback state={state} />
      {result && (
        <>
          {result.trigger_note && <p className="page-note">{result.trigger_note}</p>}
          <ul className="dry-run">
            {result.results.map((item) => (
              <li key={item.record_id} className="dry-run__row">
                <span className="dry-run__label">{item.label}</span>
                <span className={item.matches ? "dry-run__yes" : "quiet"}>
                  {item.matches
                    ? `Would: ${item.would.join("; ")}`
                    : `No: ${item.why_not.join("; ")}`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
