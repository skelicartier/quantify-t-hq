"use client";

import { useActionState, useState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { VERIFIED_LABELS } from "@/lib/crm/prospects";
import { DISQUALIFY_LABELS } from "@/lib/crm/vocabulary";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * The current view as a segment of leads: saved under a name, or saved and taken
 * straight to a new campaign. A segment is asked again when the campaign is scheduled,
 * so it reaches whoever matches then.
 */
export function SaveSegmentForm({
  action,
  conditions,
  suggestedName,
  total,
  blocked,
}: {
  action: Action;
  conditions: readonly string[];
  suggestedName: string;
  total: number;
  /** Why this view cannot be a segment (free-text search is not a condition). */
  blocked: string | null;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  if (blocked) return <p className="page-note">{blocked}</p>;
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="conditions_json" value={JSON.stringify(conditions)} />
      <Field
        id="segment-name"
        label="Name the segment"
        hint={`${total.toLocaleString("en-GB")} match today. Whoever matches when a campaign is scheduled is who it reaches.`}
      >
        <Input
          id="segment-name"
          name="name"
          defaultValue={suggestedName}
          maxLength={120}
          required
          disabled={isPending}
        />
      </Field>
      <div className="form-actions">
        <Button type="submit" size="small" disabled={isPending}>
          {isPending ? "Saving…" : "Save segment"}
        </Button>
        <Button
          type="submit"
          size="small"
          variant="primary"
          name="then"
          value="mail"
          disabled={isPending}
        >
          Save and write a campaign
        </Button>
      </div>
      <FormFeedback state={state} />
    </form>
  );
}

const CHANGES = [
  { key: "owner", label: "Owner" },
  { key: "stage", label: "Stage" },
  { key: "tags_add", label: "Add a tag" },
  { key: "tags_remove", label: "Remove a tag" },
  { key: "verified", label: "Verified" },
  { key: "nurture", label: "Set aside until" },
  { key: "nurture_end", label: "Bring back from set aside" },
] as const;

/**
 * One change to every lead the view matches — not only the page on screen. It is one
 * request and one line in the audit log; the tick box is there because it cannot be
 * undone in one press the way a change to a few selected rows can.
 */
export function BulkViewForm({
  action,
  conditions,
  q,
  stage,
  total,
  staff,
}: {
  action: Action;
  conditions: readonly string[];
  q: string;
  stage: string;
  total: number;
  staff: readonly { value: string; label: string }[];
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [change, setChange] = useState<(typeof CHANGES)[number]["key"]>("owner");
  const [stageValue, setStageValue] = useState("attempting");
  return (
    <form className="stack-form stack-form--tight" action={formAction} key={state.sentAt ?? "bulk"}>
      <AttemptField state={state} />
      <input type="hidden" name="conditions_json" value={JSON.stringify(conditions)} />
      <input type="hidden" name="q" value={q} />
      <input type="hidden" name="stage_filter" value={stage} />
      <Field id="bulk-change" label="Change">
        <Select
          id="bulk-change"
          name="change"
          value={change}
          onChange={(event) => setChange(event.target.value as typeof change)}
          disabled={isPending}
        >
          {CHANGES.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
      {change === "owner" && (
        <Field id="bulk-owner" label="To">
          <Select id="bulk-owner" name="value_owner" defaultValue="" disabled={isPending}>
            <option value="">Unowned</option>
            {staff.map((member) => (
              <option key={member.value} value={member.value}>
                {member.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {change === "stage" && (
        <>
          <Field id="bulk-stage" label="To">
            <Select
              id="bulk-stage"
              name="value_stage"
              value={stageValue}
              onChange={(event) => setStageValue(event.target.value)}
              disabled={isPending}
            >
              <option value="new">New</option>
              <option value="attempting">Attempting</option>
              <option value="connected">Connected</option>
              <option value="disqualified">Disqualified</option>
            </Select>
          </Field>
          {stageValue === "disqualified" && (
            <Field id="bulk-reason" label="Why">
              <Select
                id="bulk-reason"
                name="disqualify_reason"
                defaultValue="not_a_fit"
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
        </>
      )}
      {(change === "tags_add" || change === "tags_remove") && (
        <Field id="bulk-tags" label="Tag" hint="Several with commas.">
          <Input
            id="bulk-tags"
            name={`value_${change}`}
            maxLength={200}
            required
            placeholder="wave 1"
            disabled={isPending}
          />
        </Field>
      )}
      {change === "nurture" && (
        <>
          <Field
            id="bulk-nurture"
            label="Until"
            hint="Off the working lists and the sends till then."
          >
            <Input
              id="bulk-nurture"
              name="value_nurture"
              type="date"
              required
              disabled={isPending}
            />
          </Field>
          <Field id="bulk-nurture-note" label="In a line">
            <Input
              id="bulk-nurture-note"
              name="nurture_note"
              maxLength={400}
              disabled={isPending}
            />
          </Field>
        </>
      )}
      {change === "verified" && (
        <Field id="bulk-verified" label="To">
          <Select
            id="bulk-verified"
            name="value_verified"
            defaultValue="valid"
            disabled={isPending}
          >
            {["valid", "risky", "invalid", ""].map((value) => (
              <option key={value || "unchecked"} value={value}>
                {VERIFIED_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Checkbox
        id="bulk-confirm"
        label={`Change all ${total.toLocaleString("en-GB")} leads in this view`}
        description="Every page of it, not only the rows on screen."
        required
        disabled={isPending}
      />
      <Button type="submit" size="small" variant="primary" disabled={isPending}>
        {isPending ? "Changing…" : "Apply to the whole view"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}
