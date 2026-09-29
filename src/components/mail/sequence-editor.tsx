"use client";

import { useActionState, useState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;
type Step = {
  kind: "email" | "task";
  delay_days: number;
  template_id: string;
  thread: "new" | "reply";
  task_title: string;
};

export type SequenceInitial = {
  sequence_id?: string;
  name: string;
  kind: "prospect" | "customer";
  sender_id: string;
  cooling_days: number;
  recent_contact_days: number;
  company_limit: number;
  steps: Step[];
};

function summary(steps: readonly Step[]): string {
  let day = 0;
  return steps
    .map((step, index) => {
      day += index === 0 ? 0 : step.delay_days;
      const what =
        step.kind === "task"
          ? "call or task"
          : step.thread === "reply"
            ? "reply in thread"
            : "new email";
      return `day ${day}: ${what}`;
    })
    .join(" → ");
}

/**
 * The steps of a sequence: a first email, then waits in business days, each followed by
 * an email (in the same thread, or a fresh one) or a task for the owner. A task step holds
 * the sequence until it is marked done.
 */
export function SequenceEditor({
  action,
  templates,
  senders,
  initial,
  disabled,
}: {
  action: Action;
  templates: readonly { id: string; label: string }[];
  senders: readonly { id: string; label: string }[];
  initial: SequenceInitial;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const firstTemplate = templates[0]?.id ?? "";
  const [steps, setSteps] = useState<Step[]>(
    initial.steps.length
      ? initial.steps
      : [
          {
            kind: "email",
            delay_days: 0,
            template_id: firstTemplate,
            thread: "new",
            task_title: "",
          },
          {
            kind: "email",
            delay_days: 3,
            template_id: firstTemplate,
            thread: "reply",
            task_title: "",
          },
          { kind: "task", delay_days: 2, template_id: "", thread: "new", task_title: "Call them" },
          {
            kind: "email",
            delay_days: 4,
            template_id: firstTemplate,
            thread: "new",
            task_title: "",
          },
        ],
  );
  const update = (index: number, patch: Partial<Step>) =>
    setSteps(steps.map((step, position) => (position === index ? { ...step, ...patch } : step)));
  const move = (index: number, by: number) => {
    const target = index + by;
    if (target < 1 || target >= steps.length || index === 0) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setSteps(next);
  };
  const payload = steps.map((step, index) =>
    step.kind === "task"
      ? { kind: "task", delay_days: index === 0 ? 0 : step.delay_days, task_title: step.task_title }
      : {
          kind: "email",
          delay_days: index === 0 ? 0 : step.delay_days,
          template_id: step.template_id,
          thread: index === 0 ? "new" : step.thread,
        },
  );

  return (
    <form className="sequence-editor" action={formAction}>
      <AttemptField state={state} />
      {initial.sequence_id && (
        <input type="hidden" name="sequence_id" value={initial.sequence_id} />
      )}
      <input type="hidden" name="steps_json" value={JSON.stringify(payload)} />
      <div className="form-grid">
        <Field id="sequence-name" label="Name" className="form-grid__span">
          <Input
            id="sequence-name"
            name="name"
            defaultValue={initial.name}
            maxLength={120}
            required
            disabled={disabled}
          />
        </Field>
        <Field
          id="sequence-kind"
          label="For"
          hint="A prospect sequence refuses anyone whose firm already pays."
        >
          <Select id="sequence-kind" name="kind" defaultValue={initial.kind} disabled={disabled}>
            <option value="prospect">Prospects</option>
            <option value="customer">Customers</option>
          </Select>
        </Field>
        <Field
          id="sequence-sender"
          label="Sent as"
          hint="By default each person sends as their own sales identity."
        >
          <Select
            id="sequence-sender"
            name="sender_id"
            defaultValue={initial.sender_id}
            disabled={disabled}
          >
            <option value="">Whoever enrols them</option>
            {senders.map((sender) => (
              <option key={sender.id} value={sender.id}>
                {sender.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="sequence-recent" label="Skip anyone emailed within (days)">
          <Input
            id="sequence-recent"
            name="recent_contact_days"
            type="number"
            min={0}
            max={90}
            defaultValue={initial.recent_contact_days}
            disabled={disabled}
          />
        </Field>
        <Field id="sequence-cooling" label="Not again within (days)">
          <Input
            id="sequence-cooling"
            name="cooling_days"
            type="number"
            min={0}
            max={365}
            defaultValue={initial.cooling_days}
            disabled={disabled}
          />
        </Field>
        <Field id="sequence-limit" label="At most per firm at once">
          <Input
            id="sequence-limit"
            name="company_limit"
            type="number"
            min={1}
            max={20}
            defaultValue={initial.company_limit}
            disabled={disabled}
          />
        </Field>
      </div>

      <p className="sequence-summary">{summary(steps)}</p>
      <ol className="steps" aria-label="Steps">
        {steps.map((step, index) => (
          <li key={index} className="step">
            <div className="step__head">
              <span className="step__no">Step {index + 1}</span>
              {index > 0 && (
                <label className="step__delay">
                  after
                  <input
                    className="input input--small"
                    type="number"
                    min={0}
                    max={60}
                    value={step.delay_days}
                    aria-label={`Step ${index + 1}: business days to wait`}
                    onChange={(event) =>
                      update(index, {
                        delay_days: Math.max(0, Math.min(60, Number(event.target.value) || 0)),
                      })
                    }
                    disabled={disabled}
                  />
                  business days
                </label>
              )}
              <select
                className="select select--small"
                aria-label={`Step ${index + 1}: kind`}
                value={step.kind}
                disabled={index === 0 || disabled}
                onChange={(event) => update(index, { kind: event.target.value as Step["kind"] })}
              >
                <option value="email">Email</option>
                <option value="task">Call or task</option>
              </select>
              <span className="step__tools">
                <button
                  type="button"
                  className="btn btn--small btn--ghost"
                  disabled={index <= 1 || disabled}
                  onClick={() => move(index, -1)}
                  aria-label={`Move step ${index + 1} up`}
                >
                  Up
                </button>
                <button
                  type="button"
                  className="btn btn--small btn--ghost"
                  disabled={index === 0 || index === steps.length - 1 || disabled}
                  onClick={() => move(index, 1)}
                  aria-label={`Move step ${index + 1} down`}
                >
                  Down
                </button>
                <button
                  type="button"
                  className="btn btn--small btn--ghost"
                  disabled={index === 0 || disabled}
                  onClick={() => setSteps(steps.filter((_, position) => position !== index))}
                  aria-label={`Remove step ${index + 1}`}
                >
                  Remove
                </button>
              </span>
            </div>
            {step.kind === "email" ? (
              <div className="step__body">
                <select
                  className="select select--small"
                  aria-label={`Step ${index + 1}: template`}
                  value={step.template_id}
                  disabled={disabled}
                  onChange={(event) => update(index, { template_id: event.target.value })}
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.label}
                    </option>
                  ))}
                </select>
                {index > 0 && (
                  <select
                    className="select select--small"
                    aria-label={`Step ${index + 1}: thread`}
                    value={step.thread}
                    disabled={disabled}
                    onChange={(event) =>
                      update(index, { thread: event.target.value as Step["thread"] })
                    }
                  >
                    <option value="reply">In the same thread (Re:)</option>
                    <option value="new">A fresh email</option>
                  </select>
                )}
              </div>
            ) : (
              <div className="step__body">
                <input
                  className="input input--small"
                  aria-label={`Step ${index + 1}: what to do`}
                  value={step.task_title}
                  maxLength={200}
                  placeholder="Call them"
                  disabled={disabled}
                  onChange={(event) => update(index, { task_title: event.target.value })}
                />
              </div>
            )}
          </li>
        ))}
      </ol>
      <div className="form-actions">
        <button
          type="button"
          className="btn btn--small btn--ghost"
          disabled={steps.length >= 8 || disabled}
          onClick={() =>
            setSteps([
              ...steps,
              {
                kind: "email",
                delay_days: 3,
                template_id: firstTemplate,
                thread: "reply",
                task_title: "",
              },
            ])
          }
        >
          Add an email
        </button>
        <button
          type="button"
          className="btn btn--small btn--ghost"
          disabled={steps.length >= 8 || disabled}
          onClick={() =>
            setSteps([
              ...steps,
              {
                kind: "task",
                delay_days: 2,
                template_id: "",
                thread: "new",
                task_title: "Call them",
              },
            ])
          }
        >
          Add a call or task
        </button>
        <Button
          type="submit"
          variant="primary"
          size="small"
          disabled={isPending || disabled || templates.length === 0}
        >
          {isPending ? "Saving…" : initial.sequence_id ? "Save steps" : "Create sequence"}
        </Button>
      </div>
      {templates.length === 0 && (
        <p className="page-note">Write a sequence template (plain text) first.</p>
      )}
      <FormFeedback state={state} />
    </form>
  );
}
