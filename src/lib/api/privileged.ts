import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });

const eligibilitySchema = z.object({
  eligibility_id: z.string(),
  staff_id: z.string(),
  staff_name: z.string(),
  role: z.string(),
  role_label: z.string(),
  max_hours: z.number(),
  eligible_until: z.string().nullable(),
  reason: z.string(),
  granted_by_name: z.string(),
  created_at: z.string().nullable(),
  live: z.boolean(),
});
export type Eligibility = z.infer<typeof eligibilitySchema>;

const elevationSchema = z.object({
  elevation_id: z.string(),
  staff_id: z.string(),
  staff_name: z.string(),
  role: z.string(),
  role_label: z.string(),
  reason: z.string(),
  starts_at: z.string().nullable(),
  ends_at: z.string().nullable(),
  ended_at: z.string().nullable(),
  ended_by_name: z.string(),
  state: z.enum(["live", "ended", "expired"]),
});
export type Elevation = z.infer<typeof elevationSchema>;

const myElevationSchema = okEnvelope.extend({
  standing_role: z.string(),
  standing_role_label: z.string(),
  active: elevationSchema.nullable(),
  eligible: z.array(eligibilitySchema),
  history: z.array(elevationSchema),
  max_hours: z.number(),
});
export type MyElevation = z.infer<typeof myElevationSchema>;

/** The caller's own: what they may take, what is live, what they took. */
export function readMyElevation(token: string) {
  return fetchHqJson("hq/elevation", myElevationSchema, { token });
}

export function activateElevation(
  token: string,
  body: { eligibility_id: string; hours: number; reason: string },
) {
  return postHqJson("hq/elevation/activate", okEnvelope.extend({ elevation: elevationSchema }), {
    token,
    body,
  });
}

export function endElevation(token: string, elevationId: string) {
  return postHqJson(
    `hq/elevation/${elevationId}/end`,
    okEnvelope.extend({ ended: z.literal(true) }),
    { token, body: {} },
  );
}

export function grantEligibility(
  token: string,
  staffId: string,
  body: { role: string; max_hours: number; eligible_until: string; reason: string },
) {
  return postHqJson(
    `hq/staff/${staffId}/eligibility`,
    okEnvelope.extend({ eligibility: eligibilitySchema }),
    { token, body },
  );
}

export function revokeEligibility(token: string, staffId: string, eligibilityId: string) {
  return postHqJson(
    `hq/staff/${staffId}/eligibility/${eligibilityId}/revoke`,
    okEnvelope.extend({ revoked: z.literal(true), ended: z.number() }),
    { token, body: {} },
  );
}

const breakGlassSchema = z.object({
  staff_id: z.string(),
  display_name: z.string(),
  email: z.string(),
  is_active: z.boolean(),
  tested_at: z.string().nullable(),
  test_note: z.string(),
  days_since_test: z.number().nullable(),
  test_due: z.boolean(),
  last_login_at: z.string().nullable(),
  has_passkey: z.boolean(),
});
export type BreakGlass = z.infer<typeof breakGlassSchema>;

const exportSchema = z.object({
  export_id: z.string(),
  staff_id: z.string(),
  staff_name: z.string(),
  kind: z.string(),
  kind_label: z.string(),
  rows: z.number(),
  reason: z.string(),
  created_at: z.string().nullable(),
  marked: z.boolean(),
  tripped_at: z.string().nullable(),
  tripped_via: z.string(),
});
export type ExportRow = z.infer<typeof exportSchema>;

const privilegedSchema = okEnvelope.extend({
  break_glass: z.array(breakGlassSchema),
  owners: z.array(
    z.object({ staff_id: z.string(), display_name: z.string(), break_glass: z.boolean() }),
  ),
  eligibility: z.array(eligibilitySchema),
  elevations: z.array(elevationSchema),
  exports: z.array(exportSchema),
  quota: z.object({
    rows: z.number(),
    window_hours: z.number(),
    lifts: z.array(
      z.object({
        staff_id: z.string(),
        staff_name: z.string(),
        extra_rows: z.number(),
        until: z.string().nullable(),
        reason: z.string(),
        granted_by_name: z.string(),
      }),
    ),
  }),
  marker_domain_set: z.boolean(),
  grantable: z.array(
    z.object({
      staff_id: z.string(),
      display_name: z.string(),
      role: z.string(),
      roles: z.array(z.string()),
    }),
  ),
  role_labels: z.record(z.string(), z.string()),
  max_hours: z.number(),
  test_days: z.number(),
  viewer_is_owner: z.boolean(),
});
export type Privileged = z.infer<typeof privilegedSchema>;

export function readPrivileged(token: string) {
  return fetchHqJson("hq/security/privileged", privilegedSchema, { token });
}

export function markBreakGlass(token: string, staffId: string, on: boolean, reason: string) {
  return postHqJson(
    `hq/staff/${staffId}/break-glass`,
    okEnvelope.extend({ break_glass: z.boolean() }),
    { token, body: { on, reason } },
  );
}

export function recordBreakGlassTest(token: string, staffId: string, note: string) {
  return postHqJson(
    `hq/staff/${staffId}/break-glass/test`,
    okEnvelope.extend({ break_glass: breakGlassSchema }),
    { token, body: { note } },
  );
}

const quotaSchema = z.object({
  used: z.number(),
  limit: z.number(),
  left: z.number(),
  window_hours: z.number(),
});
export type ExportQuota = z.infer<typeof quotaSchema> & { marked: boolean };

export function readExportQuota(token: string) {
  return fetchHqJson(
    "hq/export-quota",
    okEnvelope.merge(quotaSchema).extend({ marked: z.boolean() }),
    {
      token,
    },
  );
}

export function liftExportQuota(token: string, staffId: string, extraRows: number, reason: string) {
  return postHqJson(`hq/staff/${staffId}/export-lift`, okEnvelope.extend({ quota: quotaSchema }), {
    token,
    body: { extra_rows: extraRows, reason },
  });
}

export function revealField(
  token: string,
  staffId: string,
  body: { field: string; reason: string; one_on_one_id?: string },
) {
  return postHqJson(
    `hq/team/${staffId}/reveal`,
    okEnvelope.extend({ field: z.string(), value: z.string(), seconds: z.number() }),
    { token, body },
  );
}
