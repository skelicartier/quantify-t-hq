"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { AttemptField } from "@/components/ui/attempt-field";
import { STAFF_KINDS, kindLabel, roleDescription, roleLabel } from "@/lib/access/role-labels";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

type InviteFormProps = {
  action: Action;
  /** The roles this caller may grant; the service enforces the same list. */
  grantable: readonly string[];
  disabled: boolean;
};

/**
 * Invite a colleague. The account stays inactive until the invite is accepted, and
 * the invite link comes back once — for handing over when mail is not set up.
 */
export function InviteStaffForm({ action, grantable, disabled }: InviteFormProps) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [kind, setKind] = useState("employee");
  const [role, setRole] = useState(grantable.includes("sales") ? "sales" : (grantable[0] ?? ""));
  const off = isPending || disabled;
  return (
    <>
      <form
        className="stack-form stack-form--tight"
        action={formAction}
        key={state.sentAt ?? "invite"}
      >
        <AttemptField state={state} />
        <Field id="invite-email" label="Work email">
          <Input
            id="invite-email"
            name="email"
            type="email"
            maxLength={254}
            required
            autoCapitalize="none"
            spellCheck={false}
            disabled={off}
          />
        </Field>
        <Field id="invite-name" label="Name">
          <Input id="invite-name" name="display_name" maxLength={120} disabled={off} />
        </Field>
        <Field id="invite-role" label="Role" hint={roleDescription(role)}>
          <Select
            id="invite-role"
            name="role"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            disabled={off}
          >
            {grantable.map((value) => (
              <option key={value} value={value}>
                {roleLabel(value)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="invite-kind" label="Engagement">
          <Select
            id="invite-kind"
            name="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            disabled={off}
          >
            {STAFF_KINDS.map((value) => (
              <option key={value} value={value}>
                {kindLabel(value)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="form-row">
          <Field id="invite-start" label="Starts">
            <Input id="invite-start" name="starts_on" type="date" disabled={off} />
          </Field>
          <Field
            id="invite-end"
            label="Ends"
            hint={
              kind === "intern" || kind === "contractor" ? "Sign-in stops on this date." : undefined
            }
          >
            <Input
              id="invite-end"
              name="ends_on"
              type="date"
              required={kind === "intern"}
              disabled={off}
            />
          </Field>
        </div>
        <Field
          id="invite-personal"
          label="Personal email"
          hint="Where to reach them after they leave."
        >
          <Input
            id="invite-personal"
            name="personal_email"
            type="email"
            maxLength={254}
            autoCapitalize="none"
            spellCheck={false}
            disabled={off}
          />
        </Field>
        <Button variant="primary" type="submit" disabled={off}>
          {isPending ? "Inviting…" : "Send invite"}
        </Button>
        {state.status !== "sent" && <FormFeedback state={state} />}
      </form>
      {state.status === "sent" && state.secret && (
        <div className="one-time-secret" role="status">
          <p className="one-time-secret__label">
            {state.message ?? "Invite created. Share this link privately."}
          </p>
          <code className="one-time-secret__value">{state.secret}</code>
          <p className="one-time-secret__hint">
            It works once, for a limited time. Anyone holding it can set this person&apos;s
            password, so send it only to them.
          </p>
        </div>
      )}
    </>
  );
}

export function StaffRoleForm({
  action,
  staffId,
  current,
  grantable,
  disabled,
}: {
  action: Action;
  staffId: string;
  current: string;
  grantable: readonly string[];
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const options = grantable.includes(current) ? grantable : [current, ...grantable];
  const off = isPending || disabled;
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="staff_id" value={staffId} />
      <Field id="staff-role" label="Role">
        <Select id="staff-role" name="role" defaultValue={current} disabled={off}>
          {options.map((value) => (
            <option key={value} value={value}>
              {roleLabel(value)}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        id="staff-role-reason"
        label="Reason"
        hint="Kept in the audit log. Their sessions end at once."
      >
        <Input id="staff-role-reason" name="reason" maxLength={400} required disabled={off} />
      </Field>
      <Button type="submit" disabled={off}>
        {isPending ? "Changing…" : "Change role"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

export function StaffDetailsForm({
  action,
  staff,
  disabled,
}: {
  action: Action;
  staff: {
    staff_id: string;
    display_name: string;
    kind: string;
    starts_on: string | null;
    ends_on: string | null;
    personal_email: string;
  };
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const off = isPending || disabled;
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="staff_id" value={staff.staff_id} />
      <Field id="staff-name" label="Name">
        <Input
          id="staff-name"
          name="display_name"
          defaultValue={staff.display_name}
          maxLength={120}
          disabled={off}
        />
      </Field>
      <Field id="staff-kind" label="Engagement">
        <Select id="staff-kind" name="kind" defaultValue={staff.kind} disabled={off}>
          {STAFF_KINDS.map((value) => (
            <option key={value} value={value}>
              {kindLabel(value)}
            </option>
          ))}
        </Select>
      </Field>
      <div className="form-row">
        <Field id="staff-start" label="Starts">
          <Input
            id="staff-start"
            name="starts_on"
            type="date"
            defaultValue={staff.starts_on?.slice(0, 10) ?? ""}
            disabled={off}
          />
        </Field>
        <Field id="staff-end" label="Ends" hint="Sign-in stops on this date.">
          <Input
            id="staff-end"
            name="ends_on"
            type="date"
            defaultValue={staff.ends_on?.slice(0, 10) ?? ""}
            disabled={off}
          />
        </Field>
      </div>
      <Field id="staff-personal" label="Personal email">
        <Input
          id="staff-personal"
          name="personal_email"
          type="email"
          defaultValue={staff.personal_email}
          maxLength={254}
          autoCapitalize="none"
          spellCheck={false}
          disabled={off}
        />
      </Field>
      <Button type="submit" disabled={off}>
        {isPending ? "Saving…" : "Save details"}
      </Button>
      <FormFeedback state={state} sentLabel="Saved." />
    </form>
  );
}

/** Deactivate, reactivate or reset the authenticator: each needs a written reason. */
export function StaffReasonForm({
  action,
  staffId,
  label,
  pendingLabel,
  hint,
  danger = false,
  disabled,
}: {
  action: Action;
  staffId: string;
  label: string;
  pendingLabel: string;
  hint: string;
  danger?: boolean;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const id = `${label.toLowerCase().replace(/[^a-z]+/g, "-")}-reason`;
  const off = isPending || disabled;
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="staff_id" value={staffId} />
      <Field id={id} label="Reason" hint={hint}>
        <Input id={id} name="reason" maxLength={400} required disabled={off} />
      </Field>
      <Button type="submit" variant={danger ? "danger" : "default"} disabled={off}>
        {isPending ? pendingLabel : label}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/** A fresh invite for someone who never joined; the old link stops working. */
export function ReinviteForm({
  action,
  staffId,
  disabled,
}: {
  action: Action;
  staffId: string;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <>
      <form className="stack-form stack-form--tight" action={formAction}>
        <AttemptField state={state} />
        <input type="hidden" name="staff_id" value={staffId} />
        <Button type="submit" variant="primary" disabled={isPending || disabled}>
          {isPending ? "Issuing…" : "Issue a new invite"}
        </Button>
        {state.status !== "sent" && <FormFeedback state={state} />}
      </form>
      {state.status === "sent" && state.secret && (
        <div className="one-time-secret" role="status">
          <p className="one-time-secret__label">{state.message}</p>
          <code className="one-time-secret__value">{state.secret}</code>
          <p className="one-time-secret__hint">
            It works once, within a day. Send it only to them.
          </p>
        </div>
      )}
    </>
  );
}
