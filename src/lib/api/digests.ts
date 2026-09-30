import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });

const digestSchema = z.object({
  digest_id: z.string(),
  view_id: z.string(),
  view_name: z.string(),
  list_key: z.string(),
  list_label: z.string(),
  query: z.string(),
  cadence: z.string(),
  weekday: z.number().nullable(),
  hour_utc: z.number(),
  schedule: z.string(),
  send_empty: z.boolean(),
  active: z.boolean(),
  next_due_at: z.string().nullable(),
  last_sent_at: z.string().nullable(),
  last_rows: z.number().nullable(),
  last_outcome: z.string(),
});
export type Digest = z.infer<typeof digestSchema>;

const digestsSchema = okEnvelope.extend({
  digests: z.array(digestSchema),
  views: z.array(
    z.object({
      view_id: z.string(),
      name: z.string(),
      list_key: z.string(),
      list_label: z.string(),
      shared: z.boolean(),
      subscribed: z.boolean(),
    }),
  ),
  cadences: z.array(z.object({ value: z.string(), label: z.string() })),
  weekdays: z.array(z.string()),
  mail_ready: z.boolean(),
});
export type DigestSettings = z.infer<typeof digestsSchema>;

export function readDigests(token: string) {
  return fetchHqJson("hq/digests", digestsSchema, { token });
}

const digestEnvelope = okEnvelope.extend({ digest: digestSchema });

export function createDigest(token: string, body: Record<string, unknown>) {
  return postHqJson("hq/digests/create", digestEnvelope, { token, body });
}

export function updateDigest(token: string, digestId: string, body: Record<string, unknown>) {
  return postHqJson(`hq/digests/${digestId}/update`, digestEnvelope, { token, body });
}

export function deleteDigest(token: string, digestId: string) {
  return postHqJson(`hq/digests/${digestId}/delete`, okEnvelope.extend({ deleted: z.boolean() }), {
    token,
    body: {},
  });
}

/**
 * The rendered rows, for the service to lay out and mail. With a digest token this is the
 * scheduled send; with the person's own session, "send me one now".
 */
export function deliverDigest(
  token: string,
  digestId: string,
  table: { columns: string[]; rows: { cells: string[]; path: string }[]; total: number },
) {
  return postHqJson(
    `hq/digests/${digestId}/deliver`,
    okEnvelope.extend({ sent: z.boolean(), outcome: z.string(), rows: z.number() }),
    { token, body: table },
  );
}
