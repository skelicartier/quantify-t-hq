"use client";

import { useActionState, useId, useState, useSyncExternalStore } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";
import {
  DROP_REASONS,
  WAITLIST_STAGES,
  WAITLIST_STAGE_ORDER,
  type WaitlistStage,
} from "@/lib/data/labels";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

// Nothing to subscribe to: true once the browser runs this, false on the server and while
// hydrating, so without scripts every field shows and the service says what is missing.
const subscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

/** Where a firm usually goes next: the default of the stage select. */
const NEXT: Record<WaitlistStage, WaitlistStage> = {
  joined: "call_booked",
  call_booked: "call_held",
  call_held: "pilot",
  pilot: "customer",
  customer: "dropped",
  dropped: "joined",
};

const PLACEHOLDER: Partial<Record<WaitlistStage, string>> = {
  joined: "Reply and offer call times",
  call_booked: "Hold the call",
  call_held: "Send the pilot terms",
  pilot: "Check in at week two",
};

const needsNextStep = (stage: WaitlistStage) => stage !== "customer" && stage !== "dropped";

/**
 * "Move to a stage": the stage, then only what that stage needs (spec §2.6.1) — a call's
 * time, a next step and its day, a pilot's dates and what success looks like, or why it
 * was dropped. Customer needs nothing more. Every move is kept as an event.
 */
export function StageForm({
  action,
  entryId,
  stage,
  today,
}: {
  action: Action;
  entryId: string;
  /** Where the firm is now; sent back so a second press from a stale page is caught. */
  stage: WaitlistStage;
  /** This Mac's day: a next step is never due before it. */
  today: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const scripted = useSyncExternalStore(subscribe, onClient, onServer);
  // The choice belongs to the stage it was made at: after a move the select starts again
  // from the new stage's usual next one, without remaking the form (and losing its sentence).
  const [pick, setPick] = useState<{ at: WaitlistStage; to: WaitlistStage }>({
    at: stage,
    to: NEXT[stage],
  });
  const chosen = pick.at === stage ? pick.to : NEXT[stage];
  const id = useId();
  const field = (name: string) => `${id}-${name}`;
  /** Shown when this stage is chosen; without scripts, shown always and never required. */
  const shows = (stages: readonly WaitlistStage[]) => !scripted || stages.includes(chosen);
  const required = (stages: readonly WaitlistStage[]) => scripted && stages.includes(chosen);
  const nextStages: WaitlistStage[] = ["joined", "call_booked", "call_held", "pilot", "customer"];

  return (
    <form
      key={state.status === "sent" ? (state.sentAt ?? "sent") : "move"}
      className="stack-form stack-form--tight hqdata-stage-form"
      action={formAction}
    >
      <AttemptField state={state} />
      <input type="hidden" name="entry_id" value={entryId} />
      <input type="hidden" name="from" value={stage} />
      <Field id={field("stage")} label="Move to">
        <Select
          id={field("stage")}
          name="stage"
          value={chosen}
          onChange={(event) => setPick({ at: stage, to: event.target.value as WaitlistStage })}
        >
          {WAITLIST_STAGE_ORDER.filter((key) => key !== stage).map((key) => (
            <option key={key} value={key}>
              {WAITLIST_STAGES[key].label}
            </option>
          ))}
        </Select>
      </Field>

      <fieldset className="hqdata-stage-form__group" hidden={!shows(["call_booked"])}>
        <legend>The call</legend>
        <Field id={field("call")} label="Call on">
          <Input
            id={field("call")}
            name="call_at"
            type="datetime-local"
            required={required(["call_booked"])}
          />
        </Field>
      </fieldset>

      <fieldset className="hqdata-stage-form__group" hidden={!shows(nextStages)}>
        <legend>
          {scripted && !needsNextStep(chosen) ? "Next step, if there is one" : "Next step"}
        </legend>
        <div className="form-grid">
          <Field
            id={field("next")}
            label="Next step"
            hint="It shows in Due and on Home on its day."
          >
            <Input
              id={field("next")}
              name="next_step"
              maxLength={200}
              placeholder={PLACEHOLDER[chosen] ?? ""}
              required={required(["joined", "call_booked", "call_held", "pilot"])}
              aria-describedby={`${field("next")}-hint`}
            />
          </Field>
          <Field id={field("by")} label="By">
            <Input
              id={field("by")}
              name="next_step_on"
              type="date"
              min={today}
              required={required(["joined", "call_booked", "call_held", "pilot"])}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="hqdata-stage-form__group" hidden={!shows(["call_held"])}>
        <legend>What was said</legend>
        <Field
          id={field("notes")}
          label="The call's notes"
          note="Optional"
          hint="Kept on the firm's activity as the call."
        >
          <Textarea
            id={field("notes")}
            name="notes"
            rows={3}
            maxLength={4_000}
            aria-describedby={`${field("notes")}-hint`}
          />
        </Field>
      </fieldset>

      <fieldset className="hqdata-stage-form__group" hidden={!shows(["pilot"])}>
        <legend>The pilot</legend>
        <div className="form-grid">
          <Field id={field("starts")} label="Pilot starts">
            <Input
              id={field("starts")}
              name="pilot_starts_on"
              type="date"
              required={required(["pilot"])}
            />
          </Field>
          <Field id={field("ends")} label="Pilot ends">
            <Input
              id={field("ends")}
              name="pilot_ends_on"
              type="date"
              required={required(["pilot"])}
            />
          </Field>
        </div>
        <Field id={field("success")} label="What success looks like">
          <Textarea
            id={field("success")}
            name="pilot_success"
            rows={2}
            maxLength={4_000}
            required={required(["pilot"])}
          />
        </Field>
      </fieldset>

      <fieldset className="hqdata-stage-form__group" hidden={!shows(["dropped"])}>
        <legend>Why it was dropped</legend>
        <div className="form-grid">
          <Field id={field("why")} label="Why">
            <Select
              id={field("why")}
              name="reason"
              defaultValue=""
              required={required(["dropped"])}
            >
              <option value="">Choose a reason</option>
              {Object.entries(DROP_REASONS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id={field("again")} label="Look again on" note="Optional">
            <Input id={field("again")} name="look_again_on" type="date" min={today} />
          </Field>
        </div>
      </fieldset>

      {scripted && chosen === "customer" && (
        <p className="field__hint">Nothing more is needed to move it to Customer.</p>
      )}
      <div className="form-actions">
        <Button type="submit" size="small" variant="primary" disabled={isPending}>
          {isPending ? "Moving…" : "Move it"}
        </Button>
      </div>
      <FormFeedback state={state} />
    </form>
  );
}
