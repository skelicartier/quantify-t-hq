import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });
const option = z.object({ value: z.string(), label: z.string() });
const fieldOption = option.extend({ kind: z.string() });

/** What the builder edits and the engine runs. Loose where the service is the judge. */
export const definitionSchema = z.object({
  trigger: z.object({
    kind: z.string(),
    field: z.string().optional(),
    to: z.string().optional(),
    stage_key: z.string().optional(),
    days: z.number().optional(),
  }),
  conditions: z
    .array(z.object({ field: z.string(), op: z.string(), value: z.string() }))
    .default([]),
  actions: z
    .array(
      z.object({
        kind: z.string(),
        title: z.string().optional(),
        due_in_days: z.number().optional(),
        priority: z.string().optional(),
        to: z.string().optional(),
        message: z.string().optional(),
        field: z.string().optional(),
        value: z.string().optional(),
        label: z.string().optional(),
      }),
    )
    .default([]),
});
export type AutomationDefinition = z.infer<typeof definitionSchema>;

export const AUTOMATION_STATUSES = ["draft", "active", "paused", "archived"] as const;

const automationSchema = z.object({
  automation_id: z.string(),
  name: z.string(),
  record_type: z.string(),
  record_label: z.string(),
  status: z.enum(AUTOMATION_STATUSES),
  version: z.number(),
  trigger: z.string(),
  trigger_label: z.string(),
  failure_streak: z.number(),
  paused_reason: z.string(),
  runs_30_days: z.number(),
  failed_30_days: z.number(),
  skipped_30_days: z.number(),
  last_run_at: z.string().nullable(),
  draft_differs: z.boolean(),
  created_by_name: z.string(),
  updated_at: z.string().nullable(),
});
export type Automation = z.infer<typeof automationSchema>;

export const RUN_OUTCOMES = ["done", "failed", "skipped_loop"] as const;

const runSchema = z.object({
  run_id: z.string(),
  automation_id: z.string(),
  version: z.number(),
  record_type: z.string(),
  record_id: z.string(),
  record_label: z.string(),
  trigger: z.string(),
  outcome: z.enum(RUN_OUTCOMES),
  detail: z.string(),
  depth: z.number(),
  started_by_name: z.string(),
  at: z.string().nullable(),
});
export type AutomationRun = z.infer<typeof runSchema>;

const listSchema = okEnvelope.extend({
  automations: z.array(automationSchema),
  record_types: z.array(option),
  paused: z.number(),
});
export type AutomationList = z.infer<typeof listSchema>;

export function readAutomations(token: string) {
  return fetchHqJson("hq/automations", listSchema, { token });
}

const optionsSchema = z.object({
  triggers: z.array(option),
  ops: z.array(option),
  action_kinds: z.array(option),
  fields: z.array(fieldOption),
  settable: z.array(fieldOption),
  date_fields: z.array(option),
  stages: z.array(option),
  lifecycles: z.array(z.string()),
  priorities: z.array(z.string()),
  staff: z.array(z.object({ staff_id: z.string(), name: z.string() })),
});
export type AutomationOptions = z.infer<typeof optionsSchema>;

const detailSchema = okEnvelope.extend({
  automation: automationSchema,
  draft: definitionSchema,
  published: definitionSchema.nullable(),
  published_summary: z.array(z.string()),
  versions: z.array(
    z.object({
      version: z.number(),
      published_by_name: z.string(),
      published_at: z.string().nullable(),
    }),
  ),
  runs: z.array(runSchema),
  options: optionsSchema,
  limits: z.object({
    conditions: z.number(),
    actions: z.number(),
    depth: z.number(),
    pause_after: z.number(),
    dry_run: z.number(),
  }),
});
export type AutomationDetail = z.infer<typeof detailSchema>;

export function readAutomation(token: string, automationId: string) {
  return fetchHqJson(`hq/automations/${automationId}`, detailSchema, { token });
}

const automationEnvelope = okEnvelope.extend({ automation: automationSchema });

export function createAutomation(token: string, body: Record<string, string>) {
  return postHqJson("hq/automations/create", automationEnvelope, { token, body });
}

export function saveAutomationDraft(
  token: string,
  automationId: string,
  body: Record<string, unknown>,
) {
  return postHqJson(`hq/automations/${automationId}/draft`, automationEnvelope, { token, body });
}

export function publishAutomation(token: string, automationId: string) {
  return postHqJson(`hq/automations/${automationId}/publish`, automationEnvelope, {
    token,
    body: {},
  });
}

export function actOnAutomation(token: string, automationId: string, body: Record<string, string>) {
  return postHqJson(`hq/automations/${automationId}/act`, automationEnvelope, { token, body });
}

const dryRunSchema = okEnvelope.extend({
  results: z.array(
    z.object({
      record_id: z.string(),
      label: z.string(),
      matches: z.boolean(),
      why_not: z.array(z.string()),
      would: z.array(z.string()),
    }),
  ),
  checked: z.number(),
  would_match: z.number(),
  trigger_note: z.string(),
});
export type DryRun = z.infer<typeof dryRunSchema>;

export function dryRunAutomation(token: string, automationId: string) {
  return postHqJson(`hq/automations/${automationId}/dry-run`, dryRunSchema, { token, body: {} });
}

export function runAutomation(token: string, automationId: string, recordId: string) {
  return postHqJson(
    `hq/automations/${automationId}/run`,
    okEnvelope.extend({ outcome: z.string(), detail: z.array(z.string()) }),
    { token, body: { record_id: recordId } },
  );
}

const recordSchema = okEnvelope.extend({
  buttons: z.array(z.object({ automation_id: z.string(), name: z.string() })),
  runs: z.array(runSchema.extend({ automation_name: z.string() })),
  can_press: z.boolean(),
});
export type RecordAutomations = z.infer<typeof recordSchema>;

export function readRecordAutomations(token: string, recordType: string, recordId: string) {
  return fetchHqJson("hq/record-automations", recordSchema, {
    token,
    query: { record_type: recordType, record_id: recordId },
  });
}
