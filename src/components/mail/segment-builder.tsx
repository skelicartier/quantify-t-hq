"use client";

import { useActionState, useState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { CONDITION_OPS, SKIP_REASON_LABELS, type MailPreview } from "@/lib/api/mail-schema";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;
type Condition = { field: string; op: string; value: string };
type Fields = {
  people: readonly { key: string; label: string }[];
  leads: readonly { key: string; label: string }[];
};

const VALUE_HINTS: Record<string, string> = {
  lifecycle: "prospect, early_access, customer, former_customer",
  marketing: "subscribed, unknown, unsubscribed",
  do_not_contact: "yes or no",
  stage: "new, attempting, connected, qualified, disqualified",
  origin: "inbound or prospect",
  region: "India, Americas, Europe, Asia-Pacific, Middle East, Africa",
  email_kind: "named, role, personal-domain",
  fit_band: "A, B or C",
  fit_score: "a number of points",
  verified: "valid, risky, invalid, unchecked",
  named: "yes or no",
  tags: "a tag, or several with commas",
  last_emailed_days: "a number of days",
  emails_sent: "a number of emails; 0 for never written to",
  verified_days: "a number of days",
  firm_domain: "a web domain, such as fund.com",
  customer_days: "a number of days",
  created_days: "a number of days",
};

function parsePreview(detail: string | undefined): MailPreview | null {
  if (!detail) return null;
  try {
    return JSON.parse(detail) as MailPreview;
  } catch {
    return null;
  }
}

/**
 * A segment: who matches every condition today. Checking shows how many match and how
 * many of those a campaign could not mail, and why — before anything is saved.
 */
export function SegmentBuilder({
  saveAction,
  previewAction,
  fields,
  initial,
}: {
  saveAction: Action;
  previewAction: Action;
  fields: Fields;
  initial: { segment_id?: string; name: string; kind: "people" | "leads"; conditions: Condition[] };
}) {
  const [saveState, save, saving] = useActionState(saveAction, INITIAL_ACTION_STATE);
  const [previewState, preview, previewing] = useActionState(previewAction, INITIAL_ACTION_STATE);
  const [kind, setKind] = useState(initial.kind);
  const [conditions, setConditions] = useState<Condition[]>(
    initial.conditions.length
      ? initial.conditions
      : [{ field: "lifecycle", op: "is", value: "customer" }],
  );
  const available = fields[kind];
  const result = previewState.status === "sent" ? parsePreview(previewState.detail) : null;
  const serialised = JSON.stringify(
    conditions
      .filter((row) => row.field)
      .map((row) => `${row.field}:${row.op}:${["empty", "set"].includes(row.op) ? "" : row.value}`),
  );

  const update = (index: number, patch: Partial<Condition>) =>
    setConditions(
      conditions.map((row, position) => (position === index ? { ...row, ...patch } : row)),
    );

  return (
    <form className="segment-builder" action={save}>
      <AttemptField state={saveState} />
      {initial.segment_id && <input type="hidden" name="segment_id" value={initial.segment_id} />}
      <input type="hidden" name="conditions_json" value={serialised} />
      <div className="form-row">
        <Field id="segment-name" label="Name">
          <Input
            id="segment-name"
            name="name"
            defaultValue={initial.name}
            maxLength={120}
            required
          />
        </Field>
        <Field id="segment-kind" label="Of">
          <Select
            id="segment-kind"
            name="kind"
            value={kind}
            onChange={(event) => {
              const next = event.target.value as "people" | "leads";
              setKind(next);
              setConditions([{ field: fields[next][0]?.key ?? "", op: "set", value: "" }]);
            }}
          >
            <option value="people">People (at companies)</option>
            <option value="leads">Leads</option>
          </Select>
        </Field>
      </div>
      <ol className="conditions" aria-label="Conditions, all of which must hold">
        {conditions.map((row, index) => (
          <li key={index} className="condition">
            <span className="condition__join">{index === 0 ? "Where" : "and"}</span>
            <select
              className="select select--small"
              aria-label="Field"
              value={row.field}
              onChange={(event) => update(index, { field: event.target.value })}
            >
              {available.map((field) => (
                <option key={field.key} value={field.key}>
                  {field.label}
                </option>
              ))}
            </select>
            <select
              className="select select--small"
              aria-label="Comparison"
              value={row.op}
              onChange={(event) => update(index, { op: event.target.value })}
            >
              {Object.entries(CONDITION_OPS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            {!["empty", "set"].includes(row.op) && (
              <input
                className="input input--small"
                aria-label="Value"
                value={row.value}
                placeholder={VALUE_HINTS[row.field] ?? "value"}
                maxLength={120}
                onChange={(event) => update(index, { value: event.target.value })}
              />
            )}
            <button
              type="button"
              className="btn btn--small btn--ghost"
              aria-label={`Remove condition ${index + 1}`}
              onClick={() => setConditions(conditions.filter((_, position) => position !== index))}
            >
              Remove
            </button>
          </li>
        ))}
      </ol>
      <div className="form-actions">
        <button
          type="button"
          className="btn btn--small btn--ghost"
          disabled={conditions.length >= 8}
          onClick={() =>
            setConditions([...conditions, { field: available[0]?.key ?? "", op: "set", value: "" }])
          }
        >
          Add a condition
        </button>
        {/* A check needs no name: skip the form's required-field validation for it. */}
        <Button
          type="submit"
          size="small"
          formAction={preview}
          formNoValidate
          disabled={previewing}
        >
          {previewing ? "Checking…" : "Check who matches"}
        </Button>
        <Button type="submit" size="small" variant="primary" disabled={saving}>
          {saving ? "Saving…" : initial.segment_id ? "Save changes" : "Save segment"}
        </Button>
      </div>
      <FormFeedback state={saveState} />
      {previewState.status === "error" && <FormFeedback state={previewState} />}
      {result && (
        <div className="segment-result" role="status">
          <p>
            <strong>{result.total}</strong> match today; a product-update campaign could mail{" "}
            <strong>{result.eligible}</strong>.
          </p>
          {Object.keys(result.skipped_by_reason).length > 0 && (
            <ul className="reason-list">
              {Object.entries(result.skipped_by_reason).map(([reason, count]) => (
                <li key={reason}>
                  <span>{SKIP_REASON_LABELS[reason] ?? reason}</span>
                  <span className="reason-list__count">{count}</span>
                </li>
              ))}
            </ul>
          )}
          {result.sample.length > 0 && (
            <p className="page-note">
              For example:{" "}
              {result.sample
                .map((row) => `${row.name || row.email}${row.company ? ` (${row.company})` : ""}`)
                .join(", ")}
              .
            </p>
          )}
        </div>
      )}
    </form>
  );
}
