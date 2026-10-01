"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { roleDescription, roleLabel } from "@/lib/product/role-labels";
import {
  GRANTABLE_STAFF_ROLES,
  INITIAL_ADMIN_STAFF_STATE,
  isGrantableStaffRole,
  STAFF_REASON_MAX_LENGTH,
  type AdminStaffActionState,
  type GrantableStaffRole,
} from "@/lib/product/staff-input";

type StaffAction = (
  state: AdminStaffActionState,
  formData: FormData,
) => Promise<AdminStaffActionState>;

type AdminStaffRoleFormProps = {
  action: StaffAction;
};

/**
 * Grant or remove a staff role.
 *
 * The account is named by id rather than picked from a list on purpose: the list would be
 * every account in the tenancy, and a mis-click in a long select is how the wrong person
 * ends up reading other people's conversations. An id has to be copied deliberately, and
 * it is what the other admin pages already show beside every account.
 *
 * There is no dialog primitive in this codebase, so the confirmation is inline — a
 * required checkbox, the same shape the role form uses.
 */
export function AdminStaffRoleForm({ action }: AdminStaffRoleFormProps) {
  const [state, submit, pending] = useActionState(action, INITIAL_ADMIN_STAFF_STATE);
  const [role, setRole] = useState<GrantableStaffRole>("support");
  const removing = role === "user";

  return (
    <form className="stack" action={submit}>
      <Field
        id="staff-user-id"
        label="Account id"
        hint="Copy it from the account's page. Every table here shows it beside the account."
      >
        <Input
          id="staff-user-id"
          name="userId"
          required
          disabled={pending}
          spellCheck={false}
          autoComplete="off"
          placeholder="00000000-0000-0000-0000-000000000000"
        />
      </Field>

      <Field id="staff-role" label="Role" hint={roleDescription(role)}>
        <Select
          id="staff-role"
          name="role"
          value={role}
          disabled={pending}
          onChange={(event) => {
            const next = event.target.value;
            if (isGrantableStaffRole(next)) setRole(next);
          }}
        >
          {GRANTABLE_STAFF_ROLES.map((value) => (
            <option key={value} value={value}>
              {value === "user" ? "Remove staff access" : roleLabel(value)}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        id="staff-reason"
        label="Why"
        hint="Recorded with the change. A role nobody can account for is how access outlives the reason for it."
      >
        <Textarea
          id="staff-reason"
          name="reason"
          rows={2}
          maxLength={STAFF_REASON_MAX_LENGTH}
          required
          disabled={pending}
          placeholder="Joining the support desk from 1 October."
        />
      </Field>

      <Checkbox
        id="staff-confirm"
        name="confirm"
        label="I understand this changes what this person can see"
        description={
          removing
            ? "Their existing sessions keep working until they expire."
            : "Staff roles read other people's accounts, including anything a customer pasted into a support conversation."
        }
        tone={removing ? "default" : "danger"}
        required
        disabled={pending}
      />

      {state.message && (
        <Callout
          tone={state.status === "success" ? "success" : "danger"}
          role={state.status === "success" ? "status" : "alert"}
          compact
        >
          {state.message}
        </Callout>
      )}

      <div className="form-actions">
        <Button variant={removing ? "danger" : "primary"} type="submit" disabled={pending}>
          {pending ? "Saving…" : removing ? "Remove access" : "Grant access"}
        </Button>
      </div>
    </form>
  );
}
