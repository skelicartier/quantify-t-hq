import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });
const option = z.object({ value: z.string(), label: z.string() });

export const CONTROL_STATES = ["draft", "operating", "retired"] as const;
export const LINK_TYPES = [
  "risk",
  "finding",
  "change",
  "continuity_test",
  "answer",
  "processing",
] as const;

const summarySchema = z.object({
  control_id: z.string(),
  ref: z.string(),
  title: z.string(),
  domain: z.string(),
  domain_label: z.string(),
  frequency: z.string(),
  frequency_label: z.string(),
  state: z.enum(CONTROL_STATES),
  state_label: z.string(),
  owner_staff_id: z.string().nullable(),
  owner_name: z.string(),
  frameworks: z.array(z.string()),
  evidence_count: z.number(),
  last_evidence_on: z.string().nullable(),
  evidence_due_on: z.string().nullable(),
  evidence_due: z.boolean(),
  links: z.number(),
});
export type ControlSummary = z.infer<typeof summarySchema>;

const evidenceSchema = z.object({
  evidence_id: z.string(),
  title: z.string(),
  reference: z.string(),
  period_start: z.string().nullable(),
  period_end: z.string().nullable(),
  collected_on: z.string(),
  collected_by_name: z.string(),
  note: z.string(),
});

const controlSchema = summarySchema.extend({
  description: z.string(),
  operating_since: z.string().nullable(),
  evidence: z.array(evidenceSchema),
  linked: z.array(
    z.object({
      link_id: z.string(),
      record_type: z.enum(LINK_TYPES),
      record_id: z.string(),
      label: z.string(),
      path: z.string(),
    }),
  ),
});
export type Control = z.infer<typeof controlSchema>;

const boardSchema = okEnvelope.extend({
  controls: z.array(summarySchema),
  counts: z.object({
    total: z.number(),
    operating: z.number(),
    draft: z.number(),
    evidence_due: z.number(),
  }),
  domains: z.array(option),
  frequencies: z.array(option),
  staff: z.array(z.object({ staff_id: z.string(), name: z.string() })),
  auditor_links: z.array(
    z.object({
      link_id: z.string(),
      label: z.string(),
      expires_at: z.string().nullable(),
      state: z.enum(["live", "expired", "revoked"]),
      views: z.number(),
      last_viewed_at: z.string().nullable(),
      created_by_name: z.string(),
    }),
  ),
});
export type ControlBoard = z.infer<typeof boardSchema>;

const choice = z.object({ record_id: z.string(), label: z.string() });
const controlReadSchema = okEnvelope.extend({
  control: controlSchema,
  link_choices: z.object({
    risk: z.array(choice),
    finding: z.array(choice),
    change: z.array(choice),
    continuity_test: z.array(choice),
    answer: z.array(choice),
    processing: z.array(choice),
  }),
});
export type ControlRead = z.infer<typeof controlReadSchema>;

const controlEnvelope = okEnvelope.extend({ control: controlSchema });

export function readControls(token: string) {
  return fetchHqJson("hq/controls", boardSchema, { token });
}

export function readControl(token: string, controlId: string) {
  return fetchHqJson(`hq/controls/${controlId}`, controlReadSchema, { token });
}

export function createControl(token: string, body: Record<string, string>) {
  return postHqJson("hq/controls/create", controlEnvelope, { token, body });
}

export function actOnControl(token: string, controlId: string, body: Record<string, string>) {
  return postHqJson(`hq/controls/${controlId}/act`, controlEnvelope, { token, body });
}

export function createAuditorLink(token: string, body: Record<string, string>) {
  return postHqJson(
    "hq/controls/auditor-links/create",
    okEnvelope.extend({
      link_id: z.string(),
      token: z.string(),
      expires_at: z.string().nullable(),
    }),
    { token, body },
  );
}

export function revokeAuditorLink(token: string, linkId: string) {
  return postHqJson(
    `hq/controls/auditor-links/${linkId}/revoke`,
    okEnvelope.extend({ link_id: z.string(), state: z.literal("revoked") }),
    { token, body: {} },
  );
}

// --- the auditor's page: no session, the token is the key ------------------------------------

const auditViewSchema = okEnvelope.extend({
  label: z.string(),
  expires_at: z.string().nullable(),
  read_at: z.string().nullable(),
  controls: z.array(
    summarySchema.omit({ control_id: true, owner_staff_id: true }).extend({
      description: z.string(),
      operating_since: z.string().nullable(),
      evidence: z.array(evidenceSchema.omit({ evidence_id: true, collected_by_name: true })),
      linked: z.array(z.object({ record_type: z.enum(LINK_TYPES), label: z.string() })),
    }),
  ),
});
export type AuditView = z.infer<typeof auditViewSchema>;

/** An auditor's token is `qta_` and URL-safe characters; anything else never leaves this server. */
export const AUDIT_TOKEN = /^qta_[A-Za-z0-9_-]{16,80}$/;

export function readAuditView(auditToken: string) {
  return fetchHqJson(`public/audit/${auditToken}`, auditViewSchema);
}
