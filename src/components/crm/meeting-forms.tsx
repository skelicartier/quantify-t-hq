"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { MEETING_KINDS, MEETING_KIND_LABELS, MEETING_OUTCOME_LABELS } from "@/lib/crm/vocabulary";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";
import { localInputToIso } from "@/lib/format";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;
type Option = { id: string; label: string };

const DURATIONS: ReadonlyArray<[number, string]> = [
  [15, "15 minutes"],
  [30, "30 minutes"],
  [45, "45 minutes"],
  [60, "1 hour"],
  [90, "90 minutes"],
];

/**
 * Log a meeting by hand. The time is typed as the reader's own wall clock and sent
 * as a UTC instant: only the browser knows which zone "3 pm" meant.
 */
export function MeetingCreateForm({
  action,
  companies,
  fixedCompanyId,
}: {
  action: Action;
  companies: readonly Option[];
  fixedCompanyId?: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [localStart, setLocalStart] = useState("");
  const [minutes, setMinutes] = useState(30);
  const startsIso = localInputToIso(localStart);
  const endsIso = startsIso ? new Date(Date.parse(startsIso) + minutes * 60_000).toISOString() : "";
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <input type="hidden" name="starts_at" value={startsIso} />
      <input type="hidden" name="ends_at" value={endsIso} />
      <Field id="meeting-title" label="Title">
        <Input
          id="meeting-title"
          name="title"
          maxLength={200}
          required
          placeholder="e.g. Demo with Arkstone's PM"
          disabled={isPending}
        />
      </Field>
      <div className="form-row">
        <Field id="meeting-kind" label="Kind">
          <Select id="meeting-kind" name="kind" defaultValue="demo" disabled={isPending}>
            {MEETING_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {MEETING_KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="meeting-length" label="Length">
          <Select
            id="meeting-length"
            value={minutes}
            onChange={(event) => setMinutes(Number(event.target.value))}
            disabled={isPending}
          >
            {DURATIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id="meeting-start" label="Starts" hint="Your local time.">
        <Input
          id="meeting-start"
          type="datetime-local"
          value={localStart}
          onChange={(event) => setLocalStart(event.target.value)}
          required
          disabled={isPending}
        />
      </Field>
      {fixedCompanyId ? (
        <input type="hidden" name="company_id" value={fixedCompanyId} />
      ) : (
        <Field id="meeting-company" label="Company">
          <Select id="meeting-company" name="company_id" disabled={isPending}>
            <option value="">None yet</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field
        id="meeting-guests"
        label="Guests"
        hint="Email addresses, separated by commas. People on file are matched."
      >
        <Textarea
          id="meeting-guests"
          name="attendees"
          rows={2}
          maxLength={4000}
          spellCheck={false}
          disabled={isPending}
        />
      </Field>
      <Button variant="primary" type="submit" disabled={isPending || !startsIso}>
        {isPending ? "Logging…" : "Log meeting"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

export function PrepNotesForm({
  action,
  meetingId,
  prepNotes,
  recordingUrl,
}: {
  action: Action;
  meetingId: string;
  prepNotes: string;
  recordingUrl: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <input type="hidden" name="meeting_id" value={meetingId} />
      <Field
        id="prep-notes"
        label="Prep"
        hint="Their situation, the pain, what you want them to decide, who else must agree."
      >
        <Textarea
          id="prep-notes"
          name="prep_notes"
          rows={6}
          maxLength={8000}
          defaultValue={prepNotes}
          disabled={isPending}
        />
      </Field>
      <Field id="recording-url" label="Recording link">
        <Input
          id="recording-url"
          name="recording_url"
          type="url"
          maxLength={400}
          placeholder="https://"
          defaultValue={recordingUrl}
          disabled={isPending}
        />
      </Field>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Save prep"}
      </Button>
      <FormFeedback state={state} sentLabel="Saved." />
    </form>
  );
}

/**
 * What happened. Held and no-show write the follow-up tasks; the form says so, so
 * nobody adds the same tasks by hand afterwards.
 */
export function MeetingOutcomeForm({
  action,
  meetingId,
  hasHappened,
}: {
  action: Action;
  meetingId: string;
  hasHappened: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [status, setStatus] = useState(hasHappened ? "completed" : "canceled");
  const [outcome, setOutcome] = useState("advanced");
  const choices: ReadonlyArray<[string, string]> = hasHappened
    ? [
        ["completed", "Held"],
        ["no_show", "No-show"],
        ["canceled", "Canceled"],
      ]
    : [["canceled", "Canceled"]];
  const hint =
    status === "no_show"
      ? "Adds three tasks: call tomorrow, a rebook link on day three, a last nudge on day seven."
      : status === "completed" && outcome !== "not_a_fit"
        ? "Adds three tasks: the recap today, materials on day two, a check-in on day seven."
        : "No follow-ups. Any already running are stood down.";
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <input type="hidden" name="meeting_id" value={meetingId} />
      <fieldset className={`choice-row choice-row--${choices.length}`}>
        <legend className="sr-only">What happened</legend>
        {choices.map(([value, label]) => (
          <label key={value} className="choice">
            <input
              type="radio"
              name="status"
              value={value}
              checked={status === value}
              onChange={() => setStatus(value)}
              disabled={isPending}
            />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      {status === "completed" && (
        <Field id="meeting-outcome" label="Result">
          <Select
            id="meeting-outcome"
            name="outcome"
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
            disabled={isPending}
          >
            {["advanced", "qualified", "not_a_fit", "other"].map((value) => (
              <option key={value} value={value}>
                {MEETING_OUTCOME_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field id="meeting-notes" label="Notes" hint={hint}>
        <Textarea
          id="meeting-notes"
          name="outcome_notes"
          rows={3}
          maxLength={2000}
          disabled={isPending}
        />
      </Field>
      <Button variant="primary" type="submit" disabled={isPending}>
        {isPending ? "Recording…" : "Record outcome"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/** Attach the meeting to a company when the calendar could not tell whose it was. */
export function MeetingLinkForm({
  action,
  meetingId,
  companies,
}: {
  action: Action;
  meetingId: string;
  companies: readonly Option[];
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <input type="hidden" name="meeting_id" value={meetingId} />
      <Field id="meeting-link-company" label="Company">
        <Select id="meeting-link-company" name="company_id" required disabled={isPending}>
          <option value="">Choose a company</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.label}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" size="small" disabled={isPending}>
        {isPending ? "Linking…" : "Link"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}
