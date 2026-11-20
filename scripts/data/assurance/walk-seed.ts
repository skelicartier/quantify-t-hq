/**
 * The walk's invented names for certification, insurance and management reviews
 * (ws-notes/security/spec.md §8.7 AS2): a certification body, an insurer, a policy number
 * starting `WALK-`, and an action from the review. Nothing here is real.
 */

export const WALK_ASSURANCE = {
  body: "Walk Certification Body",
  insurer: "Walk Insurance",
  policy_number: "WALK-POL-0001",
  certificate_number: "WALK-CERT-0001",
  attendees: "Walk Owner, Walk Admin",
  action: "Walk action: turn on two-step sign-in everywhere",
} as const;
