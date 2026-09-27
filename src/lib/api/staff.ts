import "server-only";

import { z } from "zod";

import { fetchHqJson } from "@/lib/api/core";

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
