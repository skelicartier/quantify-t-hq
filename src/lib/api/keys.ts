import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });

export const apiKeySchema = z.object({
  key_id: z.string(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(z.string()),
  created_by: z.string(),
  created_at: z.string().nullable(),
  last_used_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
});
export type ApiKey = z.infer<typeof apiKeySchema>;

const keysSchema = okEnvelope.extend({
  keys: z.array(apiKeySchema),
  grantable_scopes: z.array(z.string()),
});

export function readApiKeys(token: string) {
  return fetchHqJson("hq/api-keys", keysSchema, { token });
}

const mintedSchema = okEnvelope.extend({
  key: apiKeySchema,
  /** The full key, in the only response that ever carries it. */
  secret: z.string(),
});
export type MintedKey = z.infer<typeof mintedSchema>;

export function mintApiKey(token: string, input: { name: string; reason: string }) {
  return postHqJson("hq/api-keys/create", mintedSchema, { token, body: input });
}

export function revokeApiKey(token: string, keyId: string, reason: string) {
  return postHqJson(`hq/api-keys/${keyId}/revoke`, okEnvelope.extend({ revoked: z.boolean() }), {
    token,
    body: { reason },
  });
}
