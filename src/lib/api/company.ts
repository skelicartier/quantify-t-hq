import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });

export const COMPANY_FIELDS = [
  "legal_name",
  "entity_type",
  "former_name",
  "name_changed_on",
  "registration_number",
  "incorporated_on",
  "pan",
  "gstin",
  "udyam",
  "dpiit",
  "registered_address",
  "operating_address",
  "phone",
  "email",
  "website",
  "signatory_name",
  "signatory_title",
  "document_note",
] as const;
export type CompanyField = (typeof COMPANY_FIELDS)[number];

const recordSchema = z.object(
  Object.fromEntries(COMPANY_FIELDS.map((field) => [field, z.string()])) as Record<
    CompanyField,
    z.ZodString
  >,
);
export type CompanyRecord = z.infer<typeof recordSchema>;

export const letterheadSchema = z.object({
  brand: z.string(),
  name: z.string(),
  name_note: z.string(),
  former_name: z.string(),
  trading_as: z.string(),
  liability: z.string(),
  numbers: z.string(),
  address: z.string(),
  contact: z.string(),
  signatory: z.object({ name: z.string(), title: z.string() }),
  note: z.string(),
  complete: z.boolean(),
});
export type Letterhead = z.infer<typeof letterheadSchema>;

export const REQUIREMENT_STATES = ["met", "missing", "optional", "not_applicable"] as const;

const requirementSchema = z.object({
  key: z.string(),
  label: z.string(),
  law: z.string(),
  state: z.enum(REQUIREMENT_STATES),
  detail: z.string(),
});
export type Requirement = z.infer<typeof requirementSchema>;

const companySchema = okEnvelope.extend({
  company: recordSchema,
  letterhead: letterheadSchema,
  requirements: z.array(requirementSchema),
  entity_types: z.array(z.object({ value: z.string(), label: z.string() })),
  updated_at: z.string().nullable(),
  updated_by_name: z.string(),
  can_edit: z.boolean(),
});
export type CompanyRead = z.infer<typeof companySchema>;

/** The particulars, the letterhead worked out from them, and what the law asks for. */
export function readCompany(token: string) {
  return fetchHqJson("hq/company", companySchema, { token });
}

export function updateCompany(token: string, body: Partial<CompanyRecord>) {
  return postHqJson("hq/company/update", companySchema, { token, body });
}

/** What every document prints when the particulars cannot be read: the brand and nothing it cannot vouch for. */
export const FALLBACK_LETTERHEAD: Letterhead = {
  brand: "Quantify Terminal",
  name: "Quantify Terminal",
  name_note: "",
  former_name: "",
  trading_as: "",
  liability: "",
  numbers: "",
  address: "",
  contact: "",
  signatory: { name: "", title: "" },
  note: "",
  complete: false,
};
