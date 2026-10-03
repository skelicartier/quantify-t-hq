"use client";

import { useActionState, useState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";
import { submitWithoutReset } from "@/lib/forms/submit-without-reset";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

const MODES = [
  {
    value: "unread",
    label: "Mail me what stays unread",
    hint: "One mail listing what you have not read after the delay below.",
  },
  {
    value: "priority",
    label: "Mail me for Priority alone",
    hint: "The same mail, for what stays unread in your Priority; the rest waits in the inbox.",
  },
  { value: "digest", label: "One digest a day", hint: "Early each morning, UTC." },
  { value: "off", label: "No mail", hint: "Only the inbox, and the count beside it." },
] as const;

const DELAYS = [5, 15, 30, 60, 120, 240];
const ZONES = [
  "UTC",
  "Europe/London",
  "Europe/Zurich",
  "Europe/Paris",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Dubai",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
];

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function NotificationPrefsForm({
  action,
  prefs,
}: {
  action: Action;
  prefs: {
    email_mode: string;
    delay_minutes: number;
    quiet_from: number | null;
    quiet_to: number | null;
    time_zone: string;
  };
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [mode, setMode] = useState(prefs.email_mode);
  const zones = ZONES.includes(prefs.time_zone) ? ZONES : [prefs.time_zone, ...ZONES];
  return (
    // The mode is a controlled choice: a reset after saving would show the old one.
    <form className="stack-form" onSubmit={submitWithoutReset(formAction)}>
      <AttemptField state={state} />
      <fieldset className="prefs-modes">
        <legend className="field__label">When to mail you</legend>
        {MODES.map((option) => (
          <label key={option.value} className="prefs-mode">
            <input
              type="radio"
              name="email_mode"
              value={option.value}
              checked={mode === option.value}
              onChange={() => setMode(option.value)}
              disabled={isPending}
            />
            <span>
              <strong>{option.label}</strong>
              <span className="prefs-mode__hint">{option.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Field
        id="prefs-delay"
        label="Wait before mailing"
        hint="Anything you read in the meantime is never mailed."
      >
        <Select
          id="prefs-delay"
          name="delay_minutes"
          defaultValue={String(prefs.delay_minutes)}
          disabled={isPending || (mode !== "unread" && mode !== "priority")}
        >
          {DELAYS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes < 60
                ? `${minutes} minutes`
                : `${minutes / 60} hour${minutes === 60 ? "" : "s"}`}
            </option>
          ))}
        </Select>
      </Field>
      <div className="form-grid">
        <Field id="prefs-quiet-from" label="Quiet from" hint="No mail between these hours.">
          <Select
            id="prefs-quiet-from"
            name="quiet_from"
            defaultValue={prefs.quiet_from === null ? "" : String(prefs.quiet_from)}
            disabled={isPending}
          >
            <option value="">No quiet hours</option>
            {Array.from({ length: 24 }, (_, hour) => (
              <option key={hour} value={hour}>
                {hourLabel(hour)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="prefs-quiet-to" label="Quiet until">
          <Select
            id="prefs-quiet-to"
            name="quiet_to"
            defaultValue={prefs.quiet_to === null ? "" : String(prefs.quiet_to)}
            disabled={isPending}
          >
            <option value="">No quiet hours</option>
            {Array.from({ length: 24 }, (_, hour) => (
              <option key={hour} value={hour}>
                {hourLabel(hour)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id="prefs-zone" label="Your time zone" hint="Quiet hours are read in this zone.">
        <Select
          id="prefs-zone"
          name="time_zone"
          defaultValue={prefs.time_zone}
          disabled={isPending}
        >
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" variant="primary" disabled={isPending}>
        {isPending ? "Saving…" : "Save"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}
