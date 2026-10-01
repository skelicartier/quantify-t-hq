/**
 * The shapes the access-control forms and their Server Action agree on.
 *
 * No Account API import, so the browser half of each form can use them. The rule that
 * matters: a result carries a fixed message, never text that came back from the service.
 */

export type AdminStaffActionState = {
  status: "idle" | "success" | "error";
  message: string;
  /** Which row the message belongs beside; empty until a submission has been made. */
  userId: string;
};

export const INITIAL_ADMIN_STAFF_STATE: AdminStaffActionState = {
  status: "idle",
  message: "",
  userId: "",
};

/**
 * The roles this section may grant.
 *
 * Owner and Admin are deliberately absent, and that is the point of the section existing
 * separately: an Admin can staff a support desk without also being able to promote
 * somebody to their own level. Changing either of those goes through Roles, which only an
 * Owner holds.
 */
export const GRANTABLE_STAFF_ROLES = [
  "support_manager",
  "billing_manager",
  "auditor",
  "support",
  "user",
] as const;

export type GrantableStaffRole = (typeof GRANTABLE_STAFF_ROLES)[number];

export function isGrantableStaffRole(value: unknown): value is GrantableStaffRole {
  return typeof value === "string" && (GRANTABLE_STAFF_ROLES as readonly string[]).includes(value);
}

/** A reason is required on a grant, so a role somebody holds can always be accounted for. */
export const STAFF_REASON_MAX_LENGTH = 280;
