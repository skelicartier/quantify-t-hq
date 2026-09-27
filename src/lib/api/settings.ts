import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });

const slaRowSchema = z.object({
  priority: z.string(),
  first_reply_minutes: z.number(),
  next_reply_minutes: z.number(),
});
export type SlaRow = z.infer<typeof slaRowSchema>;

const supportSettingsSchema = okEnvelope.extend({
  sla: z.array(slaRowSchema),
  bounds: z.object({ min_minutes: z.number(), max_minutes: z.number() }),
});
export type SupportSettings = z.infer<typeof supportSettingsSchema>;

export function readSupportSettings(token: string) {
  return fetchHqJson("hq/settings/support", supportSettingsSchema, { token });
}

export function updateSla(token: string, input: Record<string, unknown>) {
  return postHqJson(
    "hq/settings/sla/update",
    okEnvelope.extend({ updated: z.boolean(), sla: z.array(slaRowSchema) }),
    { token, body: input },
  );
}

export function updateSource(token: string, input: Record<string, unknown>) {
  return postHqJson(
    "hq/settings/sources/update",
    okEnvelope.extend({ updated: z.boolean(), key: z.string() }),
    { token, body: input },
  );
}

const webhookEventSchema = z.object({
  provider: z.string(),
  event_id: z.string(),
  received_at: z.string().nullable(),
  state: z.string(),
  outcome: z.string(),
  duplicates: z.number(),
});
export type WebhookEvent = z.infer<typeof webhookEventSchema>;

export function readWebhooks(token: string) {
  return fetchHqJson(
    "hq/webhooks",
    okEnvelope.extend({ events: z.array(webhookEventSchema), kept_days: z.number() }),
    { token },
  );
}

const retentionSchema = okEnvelope.extend({
  rules: z.array(
    z.object({
      rule: z.string(),
      days: z.number(),
      untouched_since: z.string().nullable(),
      due: z.number(),
    }),
  ),
  due: z.number(),
  this_run: z.number(),
  batch: z.number(),
  confirm_phrase: z.string(),
  min_days: z.number(),
  max_days: z.number(),
  webhook_ledger_days: z.number(),
  last_sweep: z
    .object({ at: z.string().nullable(), by_staff: z.boolean(), leads: z.number() })
    .nullable(),
  sign_out_phrase: z.string(),
});
export type Retention = z.infer<typeof retentionSchema>;

export function readRetention(token: string) {
  return fetchHqJson("hq/retention", retentionSchema, { token });
}

export function updateRetention(token: string, input: Record<string, unknown>) {
  return postHqJson(
    "hq/retention/update",
    okEnvelope.extend({ updated: z.boolean(), rules: z.record(z.string(), z.number()) }),
    { token, body: input },
  );
}

export function runRetention(token: string, input: { confirm: string; reason: string }) {
  return postHqJson(
    "hq/retention/run",
    okEnvelope.extend({
      ran: z.boolean(),
      anonymised: z.record(z.string(), z.number()),
      skipped: z.number(),
      webhook_events_pruned: z.number(),
      remaining: z.number(),
    }),
    { token, body: input },
  );
}

export function signEveryoneOut(token: string, input: { confirm: string; reason: string }) {
  return postHqJson("hq/sessions/revoke-all", okEnvelope.extend({ revoked: z.number() }), {
    token,
    body: input,
  });
}
