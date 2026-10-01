import type { AccountApiAdminAuditFilters } from "@/lib/product/account-api";
import { firstSearchValue, type SearchParams } from "@/lib/search-params";

/**
 * The bounded exact-match filters the audit search accepts, in the order the console
 * shows them. Shared by the audit explorer and the report queue form so both surfaces
 * offer the same vocabulary.
 */
export type AuditFilterField = {
  name: keyof AccountApiAdminAuditFilters;
  label: string;
  placeholder: string;
};

export const AUDIT_FILTER_FIELDS: readonly AuditFilterField[] = [
  { name: "event_type", label: "Event", placeholder: "session.revoked" },
  { name: "outcome", label: "Outcome", placeholder: "success" },
  { name: "source", label: "Source", placeholder: "portal" },
  { name: "subject_user_id", label: "Subject", placeholder: "Account ID" },
  { name: "actor_user_id", label: "Actor", placeholder: "Account ID" },
  { name: "session_id", label: "Session", placeholder: "Session ID" },
  { name: "request_id", label: "Request", placeholder: "Request ID" },
] as const;

const MAX_FILTER_LENGTH = 160;

export function parseAuditFilters(params: SearchParams): AccountApiAdminAuditFilters {
  const filters: AccountApiAdminAuditFilters = {};
  for (const field of AUDIT_FILTER_FIELDS) {
    const value = String(firstSearchValue(params[field.name]) ?? "")
      .trim()
      .slice(0, MAX_FILTER_LENGTH);
    if (value) filters[field.name] = value;
  }
  return filters;
}

export function countActiveFilters(filters: AccountApiAdminAuditFilters): number {
  return Object.values(filters).filter((value) => String(value ?? "").trim()).length;
}
