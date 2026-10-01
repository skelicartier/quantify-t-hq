import type { AccountApiAdminUsers } from "@/lib/product/account-api";
import { roleLabel } from "@/lib/product/role-labels";

export const USERS_CSV_COLUMNS = [
  "user_id",
  "email",
  "first_name",
  "last_name",
  "status",
  "role",
  "plan",
  "created_at",
  "last_login_at",
  "updated_at",
] as const;

export type AdminUserSummary = AccountApiAdminUsers["users"][number];

/**
 * One CSV cell. Quotes are doubled and the whole value quoted whenever it could confuse
 * a parser; values that a spreadsheet would evaluate as a formula (leading =, +, -, @,
 * tab or carriage return) are prefixed with an apostrophe so exported text stays text.
 */
export function csvCell(value: string | number | boolean | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/u.test(text)) text = `'${text}`;
  if (/[",\r\n]/u.test(text)) text = `"${text.replace(/"/gu, '""')}"`;
  return text;
}

export function usersCsvRow(summary: AdminUserSummary): string {
  const { user, role } = summary;
  return [
    user.user_id,
    user.email,
    user.first_name,
    user.last_name,
    user.is_active ? "active" : "inactive",
    roleLabel(role.effective),
    user.subscription_tier || "free",
    user.created_at,
    user.last_login_at,
    user.updated_at,
  ]
    .map(csvCell)
    .join(",");
}

/** A complete document with a UTF-8 byte-order mark so spreadsheets open it correctly. */
export function usersCsv(summaries: readonly AdminUserSummary[]): string {
  const lines = [USERS_CSV_COLUMNS.join(","), ...summaries.map(usersCsvRow)];
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function usersCsvFilename(now: Date): string {
  const stamp = now.toISOString().slice(0, 10);
  return `quantify-terminal-users-${stamp}.csv`;
}
