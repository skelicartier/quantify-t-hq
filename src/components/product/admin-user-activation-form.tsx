"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import {
  INITIAL_ADMIN_USER_ACTIVATION_STATE,
  type AdminUserActivationState,
} from "@/lib/product/user-activation";

type AdminUserActivationFormProps = {
  userId: string;
  isActive: boolean;
  action: (
    state: AdminUserActivationState,
    formData: FormData,
  ) => Promise<AdminUserActivationState>;
};

export function AdminUserActivationForm({
  userId,
  isActive,
  action,
}: AdminUserActivationFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_ADMIN_USER_ACTIVATION_STATE);
  const nextActive = !isActive;
  return (
    <form className="stack stack--tight" action={formAction}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="isActive" value={String(nextActive)} />
      <Button variant={nextActive ? "primary" : "danger"} type="submit" disabled={pending}>
        {pending ? "Updating…" : nextActive ? "Activate user" : "Deactivate user"}
      </Button>
      {state.message && (
        <Callout
          tone={state.status === "error" ? "danger" : "success"}
          role={state.status === "error" ? "alert" : "status"}
          compact
        >
          {state.message}
        </Callout>
      )}
    </form>
  );
}
