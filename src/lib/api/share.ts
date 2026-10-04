import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });

export const SHAREABLE = [
  "company",
  "person",
  "lead",
  "deal",
  "meeting",
  "ticket",
  "contract",
  "quote",
] as const;
export type Shareable = (typeof SHAREABLE)[number];

/** Send a record to colleagues with a line; it lands in their inbox as "Shared with you". */
export function shareRecord(
  token: string,
  body: { subject_type: Shareable; subject_id: string; staff_ids: string[]; note: string },
) {
  return postHqJson(
    "hq/share",
    okEnvelope.extend({ shared_with: z.number(), link_path: z.string() }),
    { token, body },
  );
}

const externalLinksSchema = okEnvelope.extend({
  links: z.array(
    z.object({
      kind: z.enum(["auditor", "quote"]),
      link_id: z.string(),
      label: z.string(),
      manage_path: z.string(),
      state: z.string(),
      created_by_name: z.string(),
      created_at: z.string().nullable(),
      expires_at: z.string().nullable(),
      views: z.number(),
      last_viewed_at: z.string().nullable(),
    }),
  ),
  live: z.number(),
});
export type ExternalLinks = z.infer<typeof externalLinksSchema>;

/** Every link that lets someone outside read something inside HQ. */
export function readExternalLinks(token: string) {
  return fetchHqJson("hq/external-links", externalLinksSchema, { token });
}

/** Who a record can be sent to: active colleagues other than the sender, by name. */
export function colleaguesOf(
  names: ReadonlyMap<string, { staff_id: string; display_name: string; is_active: boolean }> | null,
  selfId: string,
): { staff_id: string; name: string }[] {
  return [...(names ?? new Map()).values()]
    .filter((entry) => entry.is_active && entry.staff_id.toLowerCase() !== selfId.toLowerCase())
    .map((entry) => ({ staff_id: entry.staff_id, name: entry.display_name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
