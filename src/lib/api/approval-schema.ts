import { z } from "zod";

/**
 * A request under dual control: an Owner or Admin seat, an intake key, an Owner's or
 * Admin's authenticator reset, an invoice written off, or a backup of everything, waiting
 * for a second person with the standing to approve. A leaf module, so the key, staff,
 * receivables, backup and Home clients can all share it without importing one another.
 */
export const APPROVAL_KINDS = [
  "role_grant",
  "api_key",
  "factor_reset",
  "write_off",
  "backup",
] as const;

export const approvalSchema = z.object({
  approval_id: z.string(),
  kind: z.enum(APPROVAL_KINDS),
  status: z.enum(["pending", "approved", "declined", "withdrawn", "expired", "done"]),
  /** One clause, as a person would say it: "invite x as admin". */
  summary: z.string(),
  payload: z.object({
    name: z.string().optional(),
    scopes: z.array(z.string()).optional(),
    expires_in_days: z.number().optional(),
    role: z.string().optional(),
    email: z.string().optional(),
    display_name: z.string().optional(),
    kind: z.string().optional(),
    from: z.string().optional(),
    target_label: z.string().optional(),
    target_role: z.string().optional(),
    number: z.string().optional(),
    currency: z.string().optional(),
    amount: z.string().optional(),
    company: z.string().optional(),
  }),
  reason: z.string(),
  requested_by: z.object({ staff_id: z.string(), name: z.string() }).nullable(),
  requested_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  target_staff_id: z.string(),
  decided_by: z.object({ staff_id: z.string(), name: z.string() }).nullable(),
  decided_at: z.string().nullable(),
  decision_note: z.string(),
  result_id: z.string(),
  approver_roles: z.array(z.string()),
  /** Present when the service knows who is asking. */
  can_decide: z.boolean().optional(),
  can_withdraw: z.boolean().optional(),
  can_collect: z.boolean().optional(),
});
export type Approval = z.infer<typeof approvalSchema>;

/**
 * An authenticator reset carried out: the one-time enrolment link rides this response and
 * no other, for the person who reset it to hand over after seeing the colleague.
 */
export const factorResetSchema = z.object({
  ok: z.literal(true),
  reset: z.literal(true),
  sessions_revoked: z.number(),
  passkeys_removed: z.number(),
  enrol_url: z.string(),
  enrol_expires_at: z.string().nullable(),
  shown_once: z.array(z.string()),
});
export type FactorReset = z.infer<typeof factorResetSchema>;

/** What a request that had to wait comes back as, in place of the act's own payload. */
export const pendingApprovalSchema = z.object({
  ok: z.literal(true),
  pending_approval: z.literal(true),
  approval: approvalSchema,
});

export const APPROVAL_STATUS_LABELS: Record<Approval["status"], string> = {
  pending: "Waiting",
  approved: "Approved",
  declined: "Declined",
  withdrawn: "Withdrawn",
  expired: "Lapsed",
  done: "Done",
};

const ROLE_LABELS: Record<string, string> = { owner: "Owner", admin: "Admin" };

/** "a second Owner", "a second Owner or Admin". */
export function approverText(approval: Pick<Approval, "approver_roles">): string {
  return `a second ${approval.approver_roles.map((role) => ROLE_LABELS[role] ?? role).join(" or ")}`;
}
