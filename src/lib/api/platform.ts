import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });

// --- validation rules ------------------------------------------------------------------------

const ruleSchema = z.object({
  rule_id: z.string(),
  record_type: z.string(),
  field: z.string(),
  field_label: z.string(),
  check_kind: z.string(),
  value: z.string(),
  message: z.string(),
  active: z.boolean(),
  created_by_name: z.string(),
  updated_at: z.string().nullable(),
});
export type ValidationRule = z.infer<typeof ruleSchema>;

const rulesSchema = okEnvelope.extend({
  rules: z.array(ruleSchema),
  fields: z.record(
    z.string(),
    z.array(z.object({ key: z.string(), label: z.string(), kind: z.string() })),
  ),
  checks: z.array(z.object({ key: z.string(), label: z.string() })),
});
export type RulesBoard = z.infer<typeof rulesSchema>;

export function readRules(token: string) {
  return fetchHqJson("hq/settings/rules", rulesSchema, { token });
}

export function createRule(token: string, body: Record<string, string>) {
  return postHqJson("hq/settings/rules/create", okEnvelope.extend({ rule: ruleSchema }), {
    token,
    body,
  });
}

export function updateRule(token: string, ruleId: string, body: Record<string, unknown>) {
  return postHqJson(
    `hq/settings/rules/${ruleId}/update`,
    okEnvelope.extend({ updated: z.literal(true) }),
    {
      token,
      body,
    },
  );
}

// --- comments ------------------------------------------------------------------------------------

const commentSchema = z.object({
  comment_id: z.string(),
  parent_id: z.string(),
  body: z.string(),
  deleted: z.boolean(),
  author_id: z.string(),
  author_name: z.string(),
  mine: z.boolean(),
  created_at: z.string().nullable(),
  edited_at: z.string().nullable(),
  resolved_at: z.string().nullable(),
  resolved_by_name: z.string(),
});
export type Comment = z.infer<typeof commentSchema>;

const threadsSchema = okEnvelope.extend({
  threads: z.array(commentSchema.extend({ replies: z.array(commentSchema) })),
  open: z.number(),
  resolved: z.number(),
});
export type CommentThreads = z.infer<typeof threadsSchema>;

export const COMMENT_SUBJECTS = [
  "company",
  "person",
  "lead",
  "deal",
  "meeting",
  "contract",
  "ticket",
] as const;

export function readComments(token: string, subjectType: string, subjectId: string) {
  return fetchHqJson("hq/comments", threadsSchema, {
    token,
    query: { subject_type: subjectType, subject_id: subjectId },
  });
}

export function addComment(
  token: string,
  body: { subject_type: string; subject_id: string; body: string; parent_id?: string },
) {
  return postHqJson(
    "hq/comments/create",
    okEnvelope.extend({ comment: commentSchema, mentioned: z.array(z.string()) }),
    { token, body },
  );
}

export function resolveComment(token: string, commentId: string, resolved: boolean) {
  return postHqJson(
    `hq/comments/${commentId}/resolve`,
    okEnvelope.extend({ resolved: z.boolean() }),
    {
      token,
      body: { resolved },
    },
  );
}

export function deleteComment(token: string, commentId: string) {
  return postHqJson(
    `hq/comments/${commentId}/delete`,
    okEnvelope.extend({ deleted: z.literal(true) }),
    {
      token,
      body: {},
    },
  );
}

// --- record templates ------------------------------------------------------------------------------

const templateSchema = z.object({
  template_id: z.string(),
  name: z.string(),
  applies_to: z.string(),
  description: z.string(),
  items: z.array(z.object({ title: z.string(), due_in_days: z.number(), priority: z.string() })),
  archived: z.boolean(),
  created_by_name: z.string(),
  updated_at: z.string().nullable(),
});
export type RecordTemplate = z.infer<typeof templateSchema>;

export function readTemplates(token: string, appliesTo = "") {
  return fetchHqJson("hq/templates", okEnvelope.extend({ templates: z.array(templateSchema) }), {
    token,
    query: appliesTo ? { applies_to: appliesTo } : {},
  });
}

export function createTemplate(token: string, body: Record<string, unknown>) {
  return postHqJson("hq/templates/create", okEnvelope.extend({ template: templateSchema }), {
    token,
    body,
  });
}

export function updateTemplate(token: string, templateId: string, body: Record<string, unknown>) {
  return postHqJson(
    `hq/templates/${templateId}/update`,
    okEnvelope.extend({ updated: z.literal(true) }),
    {
      token,
      body,
    },
  );
}

export function applyTemplate(token: string, templateId: string, subjectId: string) {
  return postHqJson(
    `hq/templates/${templateId}/apply`,
    okEnvelope.extend({ created: z.number(), task_ids: z.array(z.string()) }),
    { token, body: { subject_id: subjectId } },
  );
}

// --- outbound webhooks ------------------------------------------------------------------------------

const endpointSchema = z.object({
  endpoint_id: z.string(),
  url: z.string(),
  description: z.string(),
  event_types: z.array(z.string()),
  secret_hint: z.string(),
  active: z.boolean(),
  failing_since: z.string().nullable(),
  disabled_at: z.string().nullable(),
  disabled_reason: z.string(),
  created_at: z.string().nullable(),
  delivered: z.number(),
  failed: z.number(),
  waiting: z.number(),
});
export type WebhookEndpoint = z.infer<typeof endpointSchema>;

const deliverySchema = z.object({
  delivery_id: z.string(),
  event_id: z.string(),
  event_type: z.string(),
  attempts: z.number(),
  state: z.enum(["delivered", "gave_up", "waiting"]),
  last_status: z.number().nullable(),
  last_error: z.string(),
  next_attempt_at: z.string().nullable(),
  created_at: z.string().nullable(),
  delivered_at: z.string().nullable(),
});
export type WebhookDelivery = z.infer<typeof deliverySchema>;

const webhooksSchema = okEnvelope.extend({
  endpoints: z.array(endpointSchema),
  events: z.array(z.object({ key: z.string(), label: z.string() })),
  can_seal: z.boolean(),
});
export type WebhookBoard = z.infer<typeof webhooksSchema>;

export function readWebhooks(token: string) {
  return fetchHqJson("hq/outbound-webhooks", webhooksSchema, { token });
}

export function readWebhook(token: string, endpointId: string) {
  return fetchHqJson(
    `hq/outbound-webhooks/${endpointId}`,
    okEnvelope.extend({ endpoint: endpointSchema, deliveries: z.array(deliverySchema) }),
    { token },
  );
}

export function createWebhook(
  token: string,
  body: { url: string; description: string; event_types: string[] },
) {
  return postHqJson(
    "hq/outbound-webhooks/create",
    okEnvelope.extend({ endpoint: endpointSchema, secret: z.string() }),
    { token, body },
  );
}

export function updateWebhook(token: string, endpointId: string, body: Record<string, unknown>) {
  return postHqJson(
    `hq/outbound-webhooks/${endpointId}/update`,
    okEnvelope.extend({ updated: z.literal(true) }),
    { token, body },
  );
}

export function rotateWebhook(token: string, endpointId: string) {
  return postHqJson(
    `hq/outbound-webhooks/${endpointId}/rotate`,
    okEnvelope.extend({ secret: z.string() }),
    {
      token,
      body: {},
    },
  );
}

export function testWebhook(token: string, endpointId: string) {
  return postHqJson(
    `hq/outbound-webhooks/${endpointId}/test`,
    okEnvelope.extend({ queued: z.number() }),
    {
      token,
      body: {},
    },
  );
}
