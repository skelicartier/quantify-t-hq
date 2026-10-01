"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  INITIAL_ADMIN_USER_SESSION_REVOCATION_STATE,
  type AdminUserSessionRevocationState,
} from "@/lib/product/user-session-revocation";

type AdminUserSessionRevokeFormProps = {
  action: (
    state: AdminUserSessionRevocationState,
    formData: FormData,
  ) => Promise<AdminUserSessionRevocationState>;
  sessionId: string;
  userId: string;
};

export function AdminUserSessionRevokeForm({
  action,
  sessionId,
  userId,
}: AdminUserSessionRevokeFormProps) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_ADMIN_USER_SESSION_REVOCATION_STATE,
  );

  return (
    <form className="stack stack--tight" action={formAction}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="sessionId" value={sessionId} />
      <Button size="small" type="submit" disabled={pending}>
        {pending ? "Revoking…" : "Revoke"}
      </Button>
      {state.message && (
        <p
          className={state.status === "error" ? "field__error" : "field__hint"}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
