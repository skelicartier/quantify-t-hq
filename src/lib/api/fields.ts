import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });

export const CUSTOM_KINDS = [
  "text",
  "long_text",
  "number",
  "date",
  "choice",
  "multi_choice",
  "checkbox",
  "url",
  "email",
] as const;
export type CustomKind = (typeof CUSTOM_KINDS)[number];
export const CUSTOM_RECORD_TYPES = ["company", "person", "deal", "lead"] as const;
export type CustomRecordType = (typeof CUSTOM_RECORD_TYPES)[number];

const optionSchema = z.object({ value: z.string(), label: z.string(), retired: z.boolean() });
export type CustomOption = z.infer<typeof optionSchema>;

/** A field an admin defined: its key and kind fixed, its label and choices editable. */
export const customFieldSchema = z.object({
  field_id: z.string(),
  record_type: z.string(),
  key: z.string(),
  label: z.string(),
  kind: z.enum(CUSTOM_KINDS),
  kind_label: z.string(),
  options: z.array(optionSchema),
  help: z.string(),
  required: z.boolean(),
  sensitive: z.boolean(),
  position: z.number(),
  archived: z.boolean(),
});
export type CustomField = z.infer<typeof customFieldSchema>;

/** A field on one record, with its value as this reader may see it. */
export const customValueSchema = customFieldSchema.extend({
  value: z.string(),
  display: z.string(),
  masked: z.boolean(),
  editable: z.boolean(),
});
export type CustomValue = z.infer<typeof customValueSchema>;

/** A list row's values: field key → what the list shows. */
export const customMapSchema = z.record(z.string(), z.string());

const fieldsSchema = okEnvelope.extend({
  fields: z.array(customFieldSchema),
  record_types: z.array(z.object({ value: z.string(), label: z.string() })),
  kinds: z.array(z.object({ value: z.string(), label: z.string() })),
  can_manage: z.boolean(),
  per_type: z.number(),
});
export type FieldsSettings = z.infer<typeof fieldsSchema>;

export function readFields(token: string, recordType = "") {
  return fetchHqJson("hq/settings/fields", fieldsSchema, {
    token,
    query: { record_type: recordType },
  });
}

const fieldEnvelope = okEnvelope.extend({ field: customFieldSchema });

export function createField(token: string, body: Record<string, unknown>) {
  return postHqJson("hq/settings/fields/create", fieldEnvelope, { token, body });
}

export function updateField(token: string, fieldId: string, body: Record<string, unknown>) {
  return postHqJson(`hq/settings/fields/${fieldId}/update`, fieldEnvelope, { token, body });
}
