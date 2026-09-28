import "server-only";

import { cache } from "react";
import { z } from "zod";

import { HqApiRequestError, HqApiUnavailableError, fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });

export const staffMemberSchema = z.object({
  staff_id: z.string(),
  email: z.string(),
  display_name: z.string(),
  role: z.string(),
  kind: z.string(),
  is_active: z.boolean(),
  starts_on: z.string().nullable(),
  ends_on: z.string().nullable(),
  last_login_at: z.string().nullable(),
  created_at: z.string().nullable(),
  totp_enrolled: z.boolean().nullable(),
});
export type StaffMember = z.infer<typeof staffMemberSchema>;

export const staffListSchema = okEnvelope.extend({ staff: z.array(staffMemberSchema) });

export function listStaff(token: string) {
  return fetchHqJson("hq/staff", staffListSchema, { token });
}

const staffDetailSchema = okEnvelope.extend({
  staff: staffMemberSchema.extend({
    live_sessions: z.number(),
    personal_email: z.string(),
    /** Ever accepted an invite: decides between reinvite and reactivate. */
    joined: z.boolean(),
  }),
});
export type StaffDetail = z.infer<typeof staffDetailSchema>["staff"];

export function readStaffMember(token: string, staffId: string) {
  return fetchHqJson(`hq/staff/${staffId}`, staffDetailSchema, { token });
}

const invitedSchema = okEnvelope.extend({
  staff_id: z.string(),
  /** A secret: shown once to the inviter, for handing over when mail is not set up. */
  invite_url: z.string(),
  emailed: z.boolean(),
});

export function inviteStaff(token: string, input: Record<string, unknown>) {
  return postHqJson("hq/staff/invite", invitedSchema, { token, body: input });
}

export function reinviteStaff(token: string, staffId: string) {
  return postHqJson(`hq/staff/${staffId}/reinvite`, invitedSchema, { token, body: {} });
}

export function updateStaffMember(token: string, staffId: string, input: Record<string, unknown>) {
  return postHqJson(`hq/staff/${staffId}/update`, okEnvelope.extend({ staff: staffMemberSchema }), {
    token,
    body: input,
  });
}

export function deactivateStaffMember(token: string, staffId: string, reason: string) {
  return postHqJson(
    `hq/staff/${staffId}/deactivate`,
    okEnvelope.extend({ deactivated: z.boolean(), sessions_revoked: z.number() }),
    { token, body: { reason } },
  );
}

export function reactivateStaffMember(token: string, staffId: string, reason: string) {
  return postHqJson(
    `hq/staff/${staffId}/reactivate`,
    okEnvelope.extend({ reactivated: z.boolean() }),
    {
      token,
      body: { reason },
    },
  );
}

export function resetStaffAuthenticator(token: string, staffId: string, reason: string) {
  return postHqJson(
    `hq/staff/${staffId}/totp/reset`,
    okEnvelope.extend({ reset: z.boolean(), sessions_revoked: z.number() }),
    { token, body: { reason } },
  );
}

const rolesMatrixSchema = okEnvelope.extend({
  roles: z.record(z.string(), z.array(z.string())),
  grantable_by_admin: z.array(z.string()),
});
export type RolesMatrix = z.infer<typeof rolesMatrixSchema>;

export function readRolesMatrix(token: string) {
  return fetchHqJson("hq/roles/matrix", rolesMatrixSchema, { token });
}

export const auditEventSchema = z.object({
  occurred_at: z.string().nullable(),
  staff_id: z.string(),
  actor_label: z.string(),
  action: z.string(),
  entity_type: z.string(),
  entity_id: z.string(),
  reason: z.string(),
  detail: z.record(z.string(), z.unknown()),
  correlation_id: z.string(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

const auditPageSchema = okEnvelope.extend({
  events: z.array(auditEventSchema),
  limit: z.number(),
  offset: z.number(),
});
export type AuditPage = z.infer<typeof auditPageSchema>;

export function searchAudit(
  token: string,
  filters: Partial<Record<"staff_id" | "action" | "entity_type" | "entity_id", string>>,
  page: { limit: number; offset: number },
) {
  const query: Record<string, string> = {
    limit: String(page.limit),
    offset: String(page.offset),
  };
  for (const [name, value] of Object.entries(filters)) if (value) query[name] = value;
  return fetchHqJson("hq/audit", auditPageSchema, { token, query });
}

const directorySchema = okEnvelope.extend({
  staff: z.array(
    z.object({
      staff_id: z.string(),
      display_name: z.string(),
      kind: z.string(),
      is_active: z.boolean(),
    }),
  ),
});
export type DirectoryEntry = z.infer<typeof directorySchema>["staff"][number];

/**
 * Names behind owner and assignee ids, readable by every role. Cached per request so a
 * page that names six owners makes one call.
 */
export const readDirectory = cache(async (token: string): Promise<Map<string, DirectoryEntry>> => {
  const payload = await fetchHqJson("hq/directory", directorySchema, { token });
  return new Map(payload.staff.map((entry) => [entry.staff_id, entry]));
});

/**
 * The directory, or null when it cannot be read. Staff are never deleted, so a name
 * missing from a directory that WAS read is not a former colleague; it is a read
 * failure, and the page should say so rather than invent a departure.
 */
export async function directoryOrNull(token: string): Promise<Map<string, DirectoryEntry> | null> {
  try {
    return await readDirectory(token);
  } catch (error) {
    if (error instanceof HqApiRequestError || error instanceof HqApiUnavailableError) {
      return null;
    }
    throw error;
  }
}

/** The directory, or an empty map when it cannot be read — names degrade to "—". */
export async function directoryOrEmpty(token: string): Promise<Map<string, DirectoryEntry>> {
  try {
    return await readDirectory(token);
  } catch (error) {
    if (error instanceof HqApiRequestError || error instanceof HqApiUnavailableError) {
      return new Map();
    }
    throw error;
  }
}
