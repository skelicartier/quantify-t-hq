import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });

const archivedRow = {
  name: z.string(),
  archived_at: z.string().nullable(),
  by: z.string(),
  reason: z.string(),
  merged: z.boolean(),
  can_restore: z.boolean(),
  why_not: z.string(),
};

const archiveSchema = okEnvelope.extend({
  companies: z.array(z.object({ company_id: z.string(), domain: z.string(), ...archivedRow })),
  people: z.array(
    z.object({ person_id: z.string(), email: z.string(), company: z.string(), ...archivedRow }),
  ),
});
export type Archive = z.infer<typeof archiveSchema>;

/** Every archived company and person, with who archived each, when and why. */
export function readArchive(token: string) {
  return fetchHqJson("hq/archive", archiveSchema, { token });
}

export type ArchiveKind = "companies" | "people";

const archivedSchema = okEnvelope.extend({
  archived: z.literal(true),
  archived_at: z.string().nullable(),
});
const restoredSchema = okEnvelope.extend({ archived: z.literal(false) });

// Each route spelled out, so the route-parity test reads it.
export function archiveRecord(token: string, kind: ArchiveKind, id: string, reason: string) {
  const options = { token, body: { reason } };
  return kind === "companies"
    ? postHqJson(`hq/companies/${id}/archive`, archivedSchema, options)
    : postHqJson(`hq/people/${id}/archive`, archivedSchema, options);
}

export function restoreRecord(token: string, kind: ArchiveKind, id: string) {
  const options = { token, body: {} };
  return kind === "companies"
    ? postHqJson(`hq/companies/${id}/restore`, restoredSchema, options)
    : postHqJson(`hq/people/${id}/restore`, restoredSchema, options);
}
