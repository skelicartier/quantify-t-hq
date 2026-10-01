"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Checkbox, Field, Select } from "@/components/ui/field";
import {
  ASSIGNABLE_ROLES,
  isAssignableRole,
  roleDescription,
  roleLabel,
  type AssignableRole,
} from "@/lib/product/role-labels";
import { INITIAL_ADMIN_USER_ROLE_STATE, type AdminUserRoleState } from "@/lib/product/user-role";

type AdminUserRoleFormProps = {
  userId: string;
  currentRole: string;
  action: (state: AdminUserRoleState, formData: FormData) => Promise<AdminUserRoleState>;
};

/**
 * Every role except `user` reads somebody else's account, so moving into any of them is
 * the change worth making somebody stop and read the checkbox. Stated as "not a user"
 * rather than as a list, so a role added to the vocabulary is treated as elevated by
 * default instead of slipping through as ordinary.
 */
const isElevated = (role: AssignableRole): boolean => role !== "user";

export function AdminUserRoleForm({ userId, currentRole, action }: AdminUserRoleFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_ADMIN_USER_ROLE_STATE);
  const initial: AssignableRole = isAssignableRole(currentRole) ? currentRole : "user";
  const [selected, setSelected] = useState<AssignableRole>(initial);
  const unchanged = selected === initial;
  const elevating = isElevated(selected) && !isElevated(initial);

  return (
    <form className="role-form" action={formAction}>
      <input type="hidden" name="userId" value={userId} />
      <Field id={`role-${userId}`} label="Role" hint={roleDescription(selected)}>
        <Select
          id={`role-${userId}`}
          name="role"
          value={selected}
          disabled={pending}
          onChange={(event) => {
            const next = event.target.value;
            if (isAssignableRole(next)) setSelected(next);
          }}
          aria-describedby={`role-${userId}-hint`}
        >
          {ASSIGNABLE_ROLES.map((role) => (
            <option key={role} value={role}>
              {roleLabel(role)}
              {role === initial ? " (current)" : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Checkbox
        id={`role-confirm-${userId}`}
        name="confirm"
        label="I understand this changes what this person can do"
        description={
          elevating
            ? "Elevated roles can see other people's accounts and change platform settings."
            : undefined
        }
        tone={elevating ? "danger" : "default"}
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
        <Button variant="primary" type="submit" disabled={pending || unchanged}>
          {pending ? "Changing role…" : "Change role"}
        </Button>
      </div>
    </form>
  );
}
