import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });

const deviceSchema = z.object({
  subscription_id: z.string(),
  label: z.string(),
  created_at: z.string().nullable(),
  last_sent_at: z.string().nullable(),
  /** What the device's push service last answered; null before the first notice. */
  last_status: z.number().nullable(),
});
export type PushDevice = z.infer<typeof deviceSchema>;

const pushSchema = okEnvelope.extend({
  /** Whether the service holds the keys push needs; off, the page says so. */
  enabled: z.boolean(),
  /** What a browser subscribes with; nothing secret. */
  public_key: z.string(),
  devices: z.array(deviceSchema),
});
export type PushSettings = z.infer<typeof pushSchema>;

export function readPush(token: string) {
  return fetchHqJson("hq/push", pushSchema, { token });
}

export function subscribePush(
  token: string,
  input: { endpoint: string; p256dh: string; auth: string; label: string },
) {
  return postHqJson("hq/push/subscribe", okEnvelope.extend({ device: deviceSchema }), {
    token,
    body: {
      endpoint: input.endpoint,
      keys: { p256dh: input.p256dh, auth: input.auth },
      label: input.label,
    },
  });
}

/** One of the person's devices off, by its id or by the address the browser holds. */
export function unsubscribePush(
  token: string,
  device: { subscription_id: string } | { endpoint: string },
) {
  return postHqJson("hq/push/unsubscribe", okEnvelope.extend({ removed: z.boolean() }), {
    token,
    body: device,
  });
}

export function testPush(token: string) {
  return postHqJson(
    "hq/push/test",
    okEnvelope.extend({
      results: z.array(
        z.object({
          subscription_id: z.string(),
          label: z.string(),
          status: z.number(),
          removed: z.boolean(),
        }),
      ),
    }),
    { token, body: {} },
  );
}
