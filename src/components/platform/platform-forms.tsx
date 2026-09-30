"use client";

import { useActionState, useState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

function Hidden({ fields }: { fields: Record<string, string> }) {
  return (
    <>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}

function SecretOnce({ state }: { state: ActionState }) {
  if (state.status !== "sent" || !state.secret) return null;
  return (
    <div className="one-time-secret" role="status">
      <p className="one-time-secret__label">{state.message}</p>
      <code className="one-time-secret__value">{state.secret}</code>
    </div>
  );
}

// --- comments ------------------------------------------------------------------------------------

/** A new thread, or a reply to one. Mention a colleague with @ and their first name. */
export function CommentForm({
  action,
  subjectType,
  subjectId,
  returnPath,
  parentId = "",
  compact = false,
}: {
  action: Action;
  subjectType: string;
  subjectId: string;
  returnPath: string;
  parentId?: string;
  compact?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const id = `comment-${parentId ? parentId.slice(0, 8) : "new"}`;
  return (
    <form
      className="stack-form stack-form--tight comment-form"
      action={formAction}
      key={state.sentAt ?? "comment"}
    >
      <AttemptField state={state} />
      <Hidden
        fields={{
          subject_type: subjectType,
          subject_id: subjectId,
          parent_id: parentId,
          return_path: returnPath,
        }}
      />
      <Field
        id={id}
        label={parentId ? "Reply" : "Start a thread"}
        hint={
          compact ? undefined : "Mention a colleague with @ and their first name; they are told."
        }
      >
        <Textarea
          id={id}
          name="body"
          rows={compact ? 2 : 3}
          maxLength={4000}
          required
          disabled={isPending}
        />
      </Field>
      <Button type="submit" size="small" disabled={isPending}>
        {isPending ? "Posting…" : parentId ? "Reply" : "Post"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

// --- templates -----------------------------------------------------------------------------------

/** Apply a named set of tasks to this record. */
export function ApplyTemplateForm({
  action,
  templates,
  subjectId,
  returnPath,
}: {
  action: Action;
  templates: ReadonlyArray<{ template_id: string; name: string; items: ReadonlyArray<unknown> }>;
  subjectId: string;
  returnPath: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  if (templates.length === 0)
    return <p className="muted">No templates for this kind of record yet.</p>;
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <AttemptField state={state} />
      <Hidden fields={{ subject_id: subjectId, return_path: returnPath }} />
      <Field id={`template-${subjectId.slice(0, 8)}`} label="Template">
        <Select id={`template-${subjectId.slice(0, 8)}`} name="template_id" disabled={isPending}>
          {templates.map((template) => (
            <option key={template.template_id} value={template.template_id}>
              {template.name} ({template.items.length}{" "}
              {template.items.length === 1 ? "task" : "tasks"})
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" size="small" disabled={isPending}>
        {isPending ? "Adding…" : "Add its tasks"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

type TemplateItem = { title: string; due_in_days: number; priority: string };
const PRIORITIES = ["low", "medium", "high", "urgent"];

/** A template's tasks: a title, days after it is applied, and a priority. */
export function TemplateEditor({
  action,
  template,
  appliesTo = "deal",
}: {
  action: Action;
  template?: {
    template_id: string;
    name: string;
    description: string;
    applies_to: string;
    items: readonly TemplateItem[];
  };
  appliesTo?: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [rows, setRows] = useState<number>(Math.max(template?.items.length ?? 0, 2));
  const id = template?.template_id.slice(0, 8) ?? "new";
  return (
    <form
      className="stack-form"
      action={formAction}
      key={template ? "edit" : (state.sentAt ?? "new")}
    >
      <AttemptField state={state} />
      {template && <input type="hidden" name="template_id" value={template.template_id} />}
      <div className="form-grid">
        <Field id={`tpl-name-${id}`} label="Name">
          <Input
            id={`tpl-name-${id}`}
            name="name"
            defaultValue={template?.name}
            maxLength={120}
            required
            disabled={isPending}
          />
        </Field>
        {!template && (
          <Field id={`tpl-applies-${id}`} label="For">
            <Select
              id={`tpl-applies-${id}`}
              name="applies_to"
              defaultValue={appliesTo}
              disabled={isPending}
            >
              <option value="deal">Deals</option>
              <option value="company">Companies</option>
              <option value="lead">Leads</option>
            </Select>
          </Field>
        )}
      </div>
      <Field id={`tpl-desc-${id}`} label="When to use it">
        <Input
          id={`tpl-desc-${id}`}
          name="description"
          defaultValue={template?.description}
          maxLength={400}
          disabled={isPending}
        />
      </Field>
      <fieldset className="template-items">
        <legend className="field__label">Tasks</legend>
        {Array.from({ length: rows }, (_, index) => {
          const item = template?.items[index];
          return (
            <div key={index} className="template-items__row">
              <Field id={`tpl-${id}-title-${index}`} label={`Task ${index + 1}`}>
                <Input
                  id={`tpl-${id}-title-${index}`}
                  name="item_title"
                  defaultValue={item?.title}
                  maxLength={200}
                  disabled={isPending}
                />
              </Field>
              <Field id={`tpl-${id}-days-${index}`} label="Due after (days)">
                <Input
                  id={`tpl-${id}-days-${index}`}
                  name="item_days"
                  type="number"
                  min={0}
                  max={365}
                  defaultValue={String(item?.due_in_days ?? 0)}
                  disabled={isPending}
                />
              </Field>
              <Field id={`tpl-${id}-priority-${index}`} label="Priority">
                <Select
                  id={`tpl-${id}-priority-${index}`}
                  name="item_priority"
                  defaultValue={item?.priority ?? "medium"}
                  disabled={isPending}
                >
                  {PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority.charAt(0).toUpperCase() + priority.slice(1)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          );
        })}
        {rows < 20 && (
          <Button
            type="button"
            size="small"
            variant="ghost"
            onClick={() => setRows(rows + 1)}
            disabled={isPending}
          >
            Another task
          </Button>
        )}
      </fieldset>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : template ? "Save template" : "Add template"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

// --- validation rules ----------------------------------------------------------------------------

const RECORD_LABELS: Record<string, string> = {
  deal: "Deal",
  lead: "Lead",
  company: "Company",
  person: "Person",
};

export function RuleForm({
  action,
  fields,
  checks,
  disabled,
}: {
  action: Action;
  fields: Readonly<Record<string, ReadonlyArray<{ key: string; label: string; kind: string }>>>;
  checks: ReadonlyArray<{ key: string; label: string }>;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const off = isPending || disabled;
  return (
    <form className="stack-form" action={formAction} key={state.sentAt ?? "rule"}>
      <AttemptField state={state} />
      <div className="form-grid">
        <Field id="rule-target" label="Field">
          <Select id="rule-target" name="target" disabled={off}>
            {Object.entries(fields).map(([recordType, list]) => (
              <optgroup key={recordType} label={RECORD_LABELS[recordType] ?? recordType}>
                {list.map((field) => (
                  <option key={field.key} value={`${recordType}:${field.key}`}>
                    {RECORD_LABELS[recordType] ?? recordType}: {field.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field id="rule-check" label="Rule">
          <Select id="rule-check" name="check_kind" disabled={off}>
            {checks.map((check) => (
              <option key={check.key} value={check.key}>
                {check.label.charAt(0).toUpperCase() + check.label.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="rule-value" label="Bound" hint="For at least or at most.">
          <Input id="rule-value" name="value" inputMode="decimal" maxLength={60} disabled={off} />
        </Field>
      </div>
      <Field id="rule-message" label="What the person is told">
        <Input id="rule-message" name="message" maxLength={200} required disabled={off} />
      </Field>
      <Button type="submit" disabled={off}>
        {isPending ? "Adding…" : "Add rule"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

// --- outbound webhooks ----------------------------------------------------------------------------

export function CreateWebhookForm({
  action,
  events,
  disabled,
}: {
  action: Action;
  events: ReadonlyArray<{ key: string; label: string }>;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const off = isPending || disabled;
  return (
    <form className="stack-form" action={formAction}>
      <AttemptField state={state} />
      <Field id="hook-url" label="Where to send" hint="An https address the receiver answers on.">
        <Input
          id="hook-url"
          name="url"
          type="url"
          maxLength={500}
          required
          disabled={off}
          placeholder="https://"
        />
      </Field>
      <Field id="hook-desc" label="What it is for">
        <Input id="hook-desc" name="description" maxLength={200} disabled={off} />
      </Field>
      <fieldset className="pick-list">
        <legend className="field__label">Events</legend>
        <div className="pick-list__options">
          {events.map((event) => (
            <label key={event.key} className="checkbox">
              <input type="checkbox" name="event_types" value={event.key} disabled={off} />
              <span className="checkbox__label">{event.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" variant="primary" disabled={off}>
        {isPending ? "Adding…" : "Add receiver"}
      </Button>
      <SecretOnce state={state} />
      {!state.secret && <FormFeedback state={state} />}
    </form>
  );
}

/** Test, rotate, switch on or off — one button each, the new secret shown once. */
export function WebhookActs({
  action,
  endpointId,
  active,
  disabled,
}: {
  action: Action;
  endpointId: string;
  active: boolean;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="webhook-acts" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="endpoint_id" value={endpointId} />
      <div className="ai-panel__actions">
        <Button type="submit" size="small" name="act" value="test" disabled={isPending}>
          Send a test event
        </Button>
        <Button
          type="submit"
          size="small"
          name="act"
          value={active ? "off" : "on"}
          disabled={isPending || disabled}
        >
          {active ? "Switch off" : "Switch on"}
        </Button>
        <Button
          type="submit"
          size="small"
          variant="ghost"
          name="act"
          value="rotate"
          disabled={isPending || disabled}
        >
          Replace the signing secret
        </Button>
      </div>
      <SecretOnce state={state} />
      {!state.secret && <FormFeedback state={state} />}
    </form>
  );
}
