"use client";

import { useActionState, useState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

function hoursOptions(max: number) {
  return Array.from({ length: Math.max(1, max) }, (_, index) => index + 1);
}

/** Take a role you are eligible for: how long, and why. Needs a fresh code. */
export function TakeElevationForm({
  action,
  eligibilityId,
  roleLabel,
  maxHours,
  disabled,
}: {
  action: Action;
  eligibilityId: string;
  roleLabel: string;
  maxHours: number;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const off = isPending || disabled;
  const id = `take-${eligibilityId.slice(0, 8)}`;
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="eligibility_id" value={eligibilityId} />
      <div className="form-grid">
        <Field id={`${id}-hours`} label="For how long">
          <Select id={`${id}-hours`} name="hours" defaultValue="1" disabled={off}>
            {hoursOptions(maxHours).map((hours) => (
              <option key={hours} value={hours}>
                {hours} {hours === 1 ? "hour" : "hours"}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          id={`${id}-reason`}
          label="What it is for"
          hint="The owners are told, and it is kept with everything you do."
        >
          <Input id={`${id}-reason`} name="reason" maxLength={400} required disabled={off} />
        </Field>
      </div>
      <Button type="submit" variant="primary" disabled={off}>
        {isPending ? "Elevating…" : `Take ${roleLabel}`}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/** An owner makes someone eligible for a role above their own, never Owner. */
export function GrantEligibilityForm({
  action,
  people,
  roleLabels,
  maxHours,
  disabled,
}: {
  action: Action;
  people: ReadonlyArray<{ staff_id: string; display_name: string; roles: readonly string[] }>;
  roleLabels: Readonly<Record<string, string>>;
  maxHours: number;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const choosable = people.filter((person) => person.roles.length > 0);
  const [who, setWho] = useState(choosable[0]?.staff_id ?? "");
  const roles = choosable.find((person) => person.staff_id === who)?.roles ?? [];
  const off = isPending || disabled || choosable.length === 0;
  return (
    <form className="stack-form" action={formAction}>
      <AttemptField state={state} />
      <div className="form-grid">
        <Field id="grant-person" label="Who">
          <Select
            id="grant-person"
            name="staff_id"
            value={who}
            onChange={(event) => setWho(event.target.value)}
            disabled={off}
          >
            {choosable.map((person) => (
              <option key={person.staff_id} value={person.staff_id}>
                {person.display_name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="grant-role" label="May take">
          <Select
            id="grant-role"
            name="role"
            key={who}
            defaultValue={roles[0] ?? ""}
            disabled={off}
          >
            {roles.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role] ?? role}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="grant-hours" label="Up to">
          <Select id="grant-hours" name="max_hours" defaultValue="4" disabled={off}>
            {hoursOptions(maxHours).map((hours) => (
              <option key={hours} value={hours}>
                {hours} {hours === 1 ? "hour" : "hours"} at a time
              </option>
            ))}
          </Select>
        </Field>
        <Field
          id="grant-until"
          label="Eligible until"
          hint="Empty: until revoked, or their engagement ends."
        >
          <Input id="grant-until" name="eligible_until" type="date" disabled={off} />
        </Field>
      </div>
      <Field id="grant-reason" label="Why they may need it">
        <Input id="grant-reason" name="reason" maxLength={400} required disabled={off} />
      </Field>
      <Button type="submit" disabled={off}>
        {isPending ? "Granting…" : "Make eligible"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/** Mark an Owner account as the sealed break-glass account. */
export function MarkBreakGlassForm({
  action,
  owners,
  disabled,
}: {
  action: Action;
  owners: ReadonlyArray<{ staff_id: string; display_name: string }>;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const off = isPending || disabled || owners.length === 0;
  return (
    <form className="stack-form" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="on" value="true" />
      <Field
        id="glass-owner"
        label="Owner account"
        hint="A second account kept sealed, never the one you use every day."
      >
        <Select id="glass-owner" name="staff_id" disabled={off}>
          {owners.map((owner) => (
            <option key={owner.staff_id} value={owner.staff_id}>
              {owner.display_name}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="glass-reason" label="Where its credentials are kept">
        <Input id="glass-reason" name="reason" maxLength={400} required disabled={off} />
      </Field>
      <Button type="submit" disabled={off}>
        {isPending ? "Marking…" : "Mark as break-glass"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/** One line of text and a button: record a test, unmark an account. */
export function NoteForm({
  action,
  hidden,
  id,
  name,
  label,
  hint,
  button,
  pending,
  disabled,
}: {
  action: Action;
  hidden: Record<string, string>;
  id: string;
  name: string;
  label: string;
  hint?: string;
  button: string;
  pending: string;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const off = isPending || disabled;
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <AttemptField state={state} />
      {Object.entries(hidden).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <Field id={id} label={label} hint={hint}>
        <Input id={id} name={name} maxLength={400} required disabled={off} />
      </Field>
      <Button type="submit" disabled={off}>
        {isPending ? pending : button}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/** More records for someone, for a day, with a reason. */
export function LiftQuotaForm({
  action,
  people,
  disabled,
}: {
  action: Action;
  people: ReadonlyArray<{ staff_id: string; display_name: string }>;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const off = isPending || disabled || people.length === 0;
  return (
    <form className="stack-form" action={formAction}>
      <AttemptField state={state} />
      <div className="form-grid">
        <Field id="lift-person" label="Who">
          <Select id="lift-person" name="staff_id" disabled={off}>
            {people.map((person) => (
              <option key={person.staff_id} value={person.staff_id}>
                {person.display_name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="lift-rows" label="More records">
          <Input id="lift-rows" name="extra_rows" inputMode="numeric" required disabled={off} />
        </Field>
      </div>
      <Field id="lift-reason" label="What the larger export is for">
        <Input id="lift-reason" name="reason" maxLength={400} required disabled={off} />
      </Field>
      <Button type="submit" disabled={off}>
        {isPending ? "Lifting…" : "Lift for 24 hours"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}
