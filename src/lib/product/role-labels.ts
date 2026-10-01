import { formatLabel, formatSentence } from "@/lib/format";

/**
 * Human names for the backend's role, capability, and reconciliation vocabularies.
 *
 * The API speaks in stable tokens (`roles:write`, `missing-in-database`); the console
 * speaks to people. Keeping the translation in one file means a token never leaks into
 * the UI by accident, and a new token degrades to a readable label rather than crashing.
 */

/**
 * Every role the API will accept, in descending order of reach — which is the order the
 * picker shows them in, so the list reads as a ladder rather than an alphabet.
 *
 * This mirrors `CANONICAL_ROLES` in the Account API's `capabilities.py`, which is the
 * authority: the console never computes what a role may do, it reads `me.capabilities`
 * as the API resolved them. What it must keep in step is the vocabulary, because a role
 * the console does not know is a role whose `/me` fails to parse.
 */
export const ASSIGNABLE_ROLES = [
  "owner",
  "admin",
  "support_manager",
  "billing_manager",
  "auditor",
  "support",
  "user",
] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export function isAssignableRole(value: unknown): value is AssignableRole {
  return typeof value === "string" && (ASSIGNABLE_ROLES as readonly string[]).includes(value);
}

const ROLE_LABELS: Record<AssignableRole, string> = {
  owner: "Owner",
  admin: "Admin",
  support_manager: "Support manager",
  billing_manager: "Billing manager",
  auditor: "Auditor",
  support: "Support agent",
  user: "User",
};

const ROLE_DESCRIPTIONS: Record<AssignableRole, string> = {
  owner: "Full control, including assigning roles and viewing platform configuration.",
  admin: "Manage people, notifications, email, audit and reports. Cannot assign roles.",
  support_manager:
    "Runs the support desk: reads every conversation, assigns them, and closes them.",
  billing_manager: "Changes plans, limits and trials. No access to conversations or audit.",
  auditor: "Reads the audit trail, the role report and configuration. Changes nothing.",
  support: "Answers their own queue and the unassigned pile. Cannot read another agent's.",
  user: "A regular account with access to its own data only.",
};

/**
 * Badge tones. Deliberately fewer than there are roles: the badge says how much reach a
 * role has, and five near-identical outlines would read as five unrelated things rather
 * than as a scale.
 */
export type RoleTone = "owner" | "admin" | "support" | "user";

const ROLE_TONES: Record<AssignableRole, RoleTone> = {
  owner: "owner",
  admin: "admin",
  support_manager: "admin",
  billing_manager: "admin",
  auditor: "support",
  support: "support",
  user: "user",
};

export function roleLabel(role: string | null | undefined): string {
  return isAssignableRole(role) ? ROLE_LABELS[role] : formatLabel(role || "user");
}

export function roleDescription(role: string | null | undefined): string {
  return isAssignableRole(role) ? ROLE_DESCRIPTIONS[role] : "";
}

export function roleTone(role: string | null | undefined): RoleTone {
  return isAssignableRole(role) ? ROLE_TONES[role] : "user";
}

const CAPABILITY_LABELS: Record<string, string> = {
  "account:read-self": "View own account",
  "account:read-any": "Administration access",
  "roles:read-report": "Role report access",
  "roles:write": "Manage roles",
  "audit:read": "Audit access",
  "audit:write": "Record audit events",
  "subscription:write": "Manage subscriptions",
  "users:set-active": "Activate or deactivate people",
  "sessions:revoke-any": "Revoke sessions",
  "notifications:write": "Publish notifications and email",
  "configuration:read": "View configuration",
  "credentials:read-status": "View credential status",
  "releases:read-status": "View release status",
  "releases:publish": "Publish and roll back releases",
  "secrets:read": "View provider key status",
  "secrets:write": "Replace provider keys",
  "support:read": "Read support conversations",
  "support:read-all": "Read every support conversation",
  "support:reply": "Answer support conversations",
  "support:manage": "Assign and close support conversations",
  "staff:write": "Manage staff access",
};

export function capabilityLabel(capability: string): string {
  return CAPABILITY_LABELS[capability] ?? formatSentence(capability.replace(":", " "));
}

const MISMATCH_LABELS: Record<string, string> = {
  match: "In sync",
  "missing-in-database": "Missing from database",
  "missing-in-legacy": "Missing from legacy registry",
  "expected-owner-projection": "Expected owner projection",
  divergent: "Stores disagree",
  "break-glass-override": "Set by configuration",
};

export function mismatchLabel(value: string | null | undefined): string {
  if (!value) return "Unknown";
  return MISMATCH_LABELS[value] ?? formatSentence(value);
}

export type MismatchTone = "live" | "attention" | "neutral";

export function mismatchTone(value: string | null | undefined): MismatchTone {
  if (value === "match" || value === "expected-owner-projection") return "live";
  if (value === "missing-in-legacy") return "neutral";
  return "attention";
}

type RoleReportLike = {
  legacy_source_available: boolean;
  legacy_unparsable_entry_count: number;
  legacy_retirement_ready: boolean;
};

/** The one-line verdict shown on the dashboard and the reconciliation page. */
export function roleReportStatus(report: RoleReportLike | null | undefined): string {
  if (!report) return "Not permitted";
  if (!report.legacy_source_available) return "Legacy store unreadable";
  if (report.legacy_unparsable_entry_count > 0) return "Legacy entries need review";
  if (report.legacy_retirement_ready) return "Ready for reviewed cutover";
  return "Differences need review";
}
