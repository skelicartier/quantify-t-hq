import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });

const sectionSchema = z.object({
  section_id: z.string(),
  position: z.number(),
  title: z.string(),
  body: z.string(),
  published: z.boolean(),
  reviewed_on: z.string().nullable(),
});
export type TrustSection = z.infer<typeof sectionSchema>;

const documentSchema = z.object({
  document_id: z.string(),
  title: z.string(),
  description: z.string(),
  requires_nda: z.boolean(),
  available: z.boolean(),
});
export type TrustDocument = z.infer<typeof documentSchema>;

const supplierSchema = z.object({
  service: z.string(),
  purpose: z.string(),
  locations: z.string(),
});

export const REQUEST_STATUSES = ["received", "approved", "declined", "sent"] as const;

const requestSchema = z.object({
  request_id: z.string(),
  document_id: z.string(),
  document_title: z.string(),
  name: z.string(),
  email: z.string(),
  company: z.string(),
  reason: z.string(),
  status: z.enum(REQUEST_STATUSES),
  decided_by_name: z.string(),
  decided_at: z.string().nullable(),
  decision_note: z.string(),
  sent_on: z.string().nullable(),
  created_at: z.string().nullable(),
});
export type TrustDocumentRequest = z.infer<typeof requestSchema>;

const centreSchema = okEnvelope.extend({
  sections: z.array(sectionSchema),
  documents: z.array(documentSchema),
  requests: z.array(requestSchema),
  subprocessors: z.array(supplierSchema),
  waiting: z.number(),
});
export type TrustCentre = z.infer<typeof centreSchema>;

export function readTrustCentre(token: string) {
  return fetchHqJson("hq/trust-centre", centreSchema, { token });
}

export function saveSection(token: string, body: Record<string, unknown>) {
  return postHqJson(
    "hq/trust-centre/sections/save",
    okEnvelope.extend({ sections: z.array(sectionSchema) }),
    {
      token,
      body,
    },
  );
}

export function saveDocument(token: string, body: Record<string, unknown>) {
  return postHqJson(
    "hq/trust-centre/documents/save",
    okEnvelope.extend({ documents: z.array(documentSchema) }),
    {
      token,
      body,
    },
  );
}

export function actOnDocumentRequest(
  token: string,
  requestId: string,
  body: Record<string, string>,
) {
  return postHqJson(
    `hq/trust-centre/requests/${requestId}/act`,
    okEnvelope.extend({ request: requestSchema }),
    {
      token,
      body,
    },
  );
}

// --- the public side: no session ---------------------------------------------------------------

const publicSchema = okEnvelope.extend({
  sections: z.array(
    z.object({ title: z.string(), body: z.string(), reviewed_on: z.string().nullable() }),
  ),
  subprocessors: z.array(supplierSchema),
  documents: z.array(documentSchema.omit({ available: true })),
});
export type PublicTrustCentre = z.infer<typeof publicSchema>;

export function readPublicTrustCentre() {
  return fetchHqJson("public/trust-centre", publicSchema);
}

export function requestTrustDocument(body: Record<string, string>) {
  return postHqJson(
    "public/trust-centre/request",
    okEnvelope.extend({ received: z.literal(true) }),
    { body },
  );
}
