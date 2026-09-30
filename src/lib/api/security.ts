import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });
const person = z.object({ staff_id: z.string(), name: z.string() });

export const SECURITY_STATES = ["open", "acknowledged", "resolved"] as const;
export const SECURITY_SEVERITIES = ["info", "warning", "critical"] as const;

/** One thing that happened to someone's sign-in, open until an owner has looked. */
export const securityEventSchema = z.object({
  event_id: z.string(),
  kind: z.string(),
  label: z.string(),
  severity: z.enum(SECURITY_SEVERITIES),
  summary: z.string(),
  subject: person.nullable(),
  actor: person.nullable(),
  ip: z.string(),
  occurred_at: z.string().nullable(),
  state: z.enum(SECURITY_STATES),
  handled_by: person.nullable(),
  handled_at: z.string().nullable(),
  note: z.string(),
  /** When the person pressed "this wasn't me" on the mail about this event. */
  reported_at: z.string().nullable(),
  detail: z.record(z.string(), z.unknown()),
});
export type SecurityEvent = z.infer<typeof securityEventSchema>;

const feedSchema = okEnvelope.extend({
  events: z.array(securityEventSchema),
  counts_90d: z.record(z.string(), z.number()),
  kinds: z.array(z.object({ kind: z.string(), label: z.string(), severity: z.string() })),
});
export type SecurityFeed = z.infer<typeof feedSchema>;

export function readSecurityEvents(
  token: string,
  query: { state?: string; severity?: string; kind?: string } = {},
) {
  const filtered: Record<string, string> = {};
  for (const [name, value] of Object.entries(query)) if (value) filtered[name] = value;
  return fetchHqJson("hq/security/events", feedSchema, { token, query: filtered });
}

export function updateSecurityEvent(token: string, eventId: string, state: string, note: string) {
  return postHqJson(
    `hq/security/events/${eventId}/update`,
    okEnvelope.extend({ event: securityEventSchema }),
    { token, body: { state, note } },
  );
}

export const deviceSchema = z.object({
  device_id: z.string(),
  /** SHA-256 of the browser's device cookie, so the page can say "this browser". */
  device_hash: z.string(),
  label: z.string(),
  first_seen_at: z.string().nullable(),
  last_seen_at: z.string().nullable(),
  last_ip: z.string(),
});
export type Device = z.infer<typeof deviceSchema>;

const myDevicesSchema = okEnvelope.extend({
  devices: z.array(deviceSchema),
  events: z.array(securityEventSchema),
});
export type MyDevices = z.infer<typeof myDevicesSchema>;

export function readMyDevices(token: string) {
  return fetchHqJson("hq/me/devices", myDevicesSchema, { token });
}

export function forgetDevice(token: string, deviceId: string) {
  return postHqJson(
    `hq/me/devices/${deviceId}/forget`,
    okEnvelope.extend({ forgotten: z.boolean() }),
    { token, body: {} },
  );
}

/** "This wasn't me": anonymous, carried by the signed token in the mail. */
export function reportAccount(reportToken: string) {
  return postHqJson(
    "hq/auth/report",
    okEnvelope.extend({ locked: z.boolean(), already: z.boolean() }),
    { body: { token: reportToken } },
  );
}

// --- the read watch ---------------------------------------------------------------------

export const READ_STATES = ["normal", "notified", "step_up", "held"] as const;

export const readWatchPersonSchema = z.object({
  staff_id: z.string(),
  name: z.string(),
  role: z.string(),
  opened_last_hour: z.number(),
  notify_at: z.number(),
  state: z.enum(READ_STATES),
  peak: z.number(),
  held_at: z.string().nullable(),
  cleared_at: z.string().nullable(),
  cleared_by: person.nullable(),
});
export type ReadWatchPerson = z.infer<typeof readWatchPersonSchema>;

const readWatchSchema = okEnvelope.extend({
  people: z.array(readWatchPersonSchema),
  thresholds: z.object({
    notify: z.number(),
    intern_notify: z.number(),
    step_up: z.number(),
    hold: z.number(),
    window_minutes: z.number(),
  }),
});
export type ReadWatch = z.infer<typeof readWatchSchema>;

export function readReadWatch(token: string) {
  return fetchHqJson("hq/security/reads", readWatchSchema, { token });
}

export function clearReadHold(token: string, staffId: string, reason: string) {
  return postHqJson(
    `hq/security/reads/${staffId}/clear`,
    okEnvelope.extend({ person: readWatchPersonSchema }),
    { token, body: { reason } },
  );
}

const recordReadsSchema = okEnvelope.extend({
  readers: z.array(
    z.object({
      staff_id: z.string(),
      name: z.string(),
      reads: z.number(),
      last_read_at: z.string().nullable(),
    }),
  ),
  reads: z.number(),
  days: z.number(),
});
export type RecordReads = z.infer<typeof recordReadsSchema>;

/** Who opened one record in the last 90 days; for people who may read the audit log. */
export function readRecordReads(token: string, entityType: string, record: string) {
  return fetchHqJson(`hq/records/${entityType}/${record}/reads`, recordReadsSchema, { token });
}

// --- decoys (owners only) ---------------------------------------------------------------

export const decoySchema = z.object({
  decoy_id: z.string(),
  entity_type: z.enum(["company", "api_key"]),
  entity_id: z.string(),
  label: z.string(),
  planted_by: person.nullable(),
  planted_at: z.string().nullable(),
  last_touched_at: z.string().nullable(),
  touches: z.number(),
});
export type Decoy = z.infer<typeof decoySchema>;

const decoysSchema = okEnvelope.extend({
  decoys: z.array(decoySchema),
  suggested_firms: z.array(z.string()),
});
export type Decoys = z.infer<typeof decoysSchema>;

export function readDecoys(token: string) {
  return fetchHqJson("hq/security/decoys", decoysSchema, { token });
}

export function plantDecoy(
  token: string,
  input:
    | { kind: "company"; firm_name: string; contact_name: string; contact_email: string }
    | { kind: "api_key"; label: string },
) {
  return postHqJson(
    "hq/security/decoys/plant",
    okEnvelope.extend({
      decoy_id: z.string(),
      company_id: z.string().optional(),
      /** A decoy key's secret, in the only answer that ever carries it. */
      secret: z.string().optional(),
      shown_once: z.array(z.string()).optional(),
    }),
    { token, body: input },
  );
}

export function removeDecoy(token: string, decoyId: string) {
  return postHqJson(
    `hq/security/decoys/${decoyId}/remove`,
    okEnvelope.extend({ removed: z.boolean() }),
    { token, body: {} },
  );
}
