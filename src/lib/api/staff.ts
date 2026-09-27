import "server-only";

import { cache } from "react";
import { z } from "zod";

import { HqApiRequestError, HqApiUnavailableError, fetchHqJson } from "@/lib/api/core";

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
