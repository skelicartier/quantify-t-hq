import "server-only";

import { z } from "zod";

import { fileChoiceSchema, type CopyInput } from "@/lib/data/api/meetings";
import { staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * The legal-document register (ws-notes/company/spec.md §7.8), kept on this computer by the
 * local service: the company's agreements, their worked-out end, renewal and notice-by
 * days, "What is missing", and every write.
 */

export const agreementTypeSchema = z.enum([
  "founder_ip",
  "ip_assignment",
  "appointment",
  "internship",
  "contractor",
  "nda",
  "msa",
  "order_form",
  "dpa",
  "pilot",
  "trial",
  "investment",
  "side_letter",
  "vendor",
  "lease",
  "other",
]);
export type AgreementType = z.infer<typeof agreementTypeSchema>;
export const agreementStatusSchema = z.enum([
  "draft",
  "out_for_signature",
  "signed",
  "expired",
  "terminated",
]);
export type AgreementStatus = z.infer<typeof agreementStatusSchema>;
export const partyKindSchema = z.enum(["person", "investor", "waitlist", "director", "other"]);
export type PartyKind = z.infer<typeof partyKindSchema>;
const flagSchema = z.enum(["yes", "no", ""]);
const linkSchema = z.object({ file_id: z.string(), title: z.string() }).nullable();

export const partySchema = z.object({
  kind: partyKindSchema,
  ref_id: z.string().nullable(),
  name: z.string(),
  entity: z.string(),
  country: z.string(),
});
export type Party = z.infer<typeof partySchema>;

export const agreementSchema = z.object({
  agreement_id: z.string(),
  title: z.string(),
  type: agreementTypeSchema,
  parties: z.array(partySchema),
  status: agreementStatusSchema,
  status_on: z.string().nullable(),
  effective_on: z.string().nullable(),
  signed_on: z.string().nullable(),
  term: z.object({ months: z.number().nullable(), ends_on: z.string().nullable() }),
  renewal: z.object({
    auto: z.boolean(),
    months: z.number().nullable(),
    renews_on: z.string().nullable(),
    notice_days: z.number().nullable(),
    notice_given: z.object({ on: z.string(), note: z.string() }).nullable(),
  }),
  terminate_for_convenience: z.string(),
  governing_law: z.string(),
  forum: z.string(),
  value: z.object({ amount: z.number(), currency: z.enum(["INR", "USD"]) }).nullable(),
  signing: z.enum(["aadhaar_esign", "dsc", "wet_ink", "other", ""]),
  stamp: z
    .object({ state: z.string(), amount: z.number().nullable(), certificate_no: z.string() })
    .nullable(),
  related_party: z.boolean(),
  personal_data: z.boolean(),
  ip_clause: flagSchema,
  confidentiality_clause: flagSchema,
  signed_file_id: z.string().nullable(),
  audit_trail_file_id: z.string().nullable(),
  owner: z.string(),
  review_on: z.string().nullable(),
  notes: z.string(),
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
});
export type Agreement = z.infer<typeof agreementSchema>;

const noticeStateSchema = z.enum(["none", "given", "open", "passed"]);

export const agreementRowSchema = agreementSchema.extend({
  ends_on: z.string().nullable(),
  renews_on: z.string().nullable(),
  notice_by: z.string().nullable(),
  notice_state: noticeStateSchema,
  signed_file: linkSchema,
});
export type AgreementRow = z.infer<typeof agreementRowSchema>;

export const mustRowSchema = z.object({
  key: z.string(),
  item: z.string(),
  found: z.string(),
  state: z.enum(["here", "missing", "not_needed", "not_checked"]),
  why: z.string(),
  source_url: z.string(),
  missing: z.array(z.object({ name: z.string(), href: z.string() })),
});
export type MustRow = z.infer<typeof mustRowSchema>;

const optionSchema = z.object({ id: z.string(), name: z.string() });
export const pickersSchema = z.object({
  investor: z.array(optionSchema).nullable(),
  waitlist: z.array(optionSchema).nullable(),
  director: z.array(optionSchema).nullable(),
});
export type Pickers = z.infer<typeof pickersSchema>;

export const agreementsPageSchema = ok.extend({
  agreements: z.array(agreementRowSchema),
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  counts: z.record(z.string(), z.number()),
  signed: z.number(),
  missing: z.array(mustRowSchema),
  pickers: pickersSchema,
  files: z.array(fileChoiceSchema),
  files_here: z.boolean(),
  today: z.string(),
});
export type AgreementsPage = z.infer<typeof agreementsPageSchema>;

export const agreementsEventSchema = z.object({
  event_id: z.string(),
  agreement_id: z.string(),
  verb: z.string(),
  detail: z.string(),
  by: staffSchema,
  at: z.string(),
});
export type AgreementsEvent = z.infer<typeof agreementsEventSchema>;

export const agreementPageSchema = ok.extend({
  agreement: agreementSchema,
  worked: z.object({
    ends_on: z.string().nullable(),
    renews_on: z.string().nullable(),
    notice_by: z.string().nullable(),
    renewed: z.array(z.string()),
    notice_state: noticeStateSchema,
  }),
  party_links: z.array(z.string().nullable()),
  signed_file: linkSchema,
  audit_file: linkSchema,
  pickers: pickersSchema,
  files: z.array(fileChoiceSchema),
  files_here: z.boolean(),
  events: z.array(agreementsEventSchema),
  today: z.string(),
});
export type AgreementPage = z.infer<typeof agreementPageSchema>;

const agreementAnswer = ok.extend({ agreement: agreementSchema });

export type AgreementsQuery = {
  type?: string;
  status?: string;
  q?: string;
  ended?: boolean;
  offset?: number;
};

export function readAgreements(input: AgreementsQuery = {}) {
  const params = new URLSearchParams();
  if (input.type) params.set("type", input.type);
  if (input.status) params.set("status", input.status);
  if (input.q) params.set("q", input.q);
  if (input.ended) params.set("ended", "1");
  if (input.offset) params.set("offset", String(input.offset));
  const rendered = params.toString();
  return dataAsk(agreementsPageSchema, "GET", `/data/agreements${rendered ? `?${rendered}` : ""}`);
}

export const readAgreement = (agreementId: string) =>
  dataAsk(agreementPageSchema, "GET", `/data/agreements/${id(agreementId)}`);

export type PartyInput = {
  kind: PartyKind;
  ref_id: string | null;
  name: string;
  entity: string;
  country: string;
};

export type AgreementInput = {
  title: string;
  type: AgreementType;
  parties: PartyInput[];
  status: AgreementStatus;
  effective_on: string;
  signed_on: string;
  term_months: number | string;
  ends_on: string;
  auto_renews: boolean;
  renews_on: string;
  renewal_months: number | string;
  notice_days: number | string;
  terminate_for_convenience: string;
  governing_law: string;
  forum: string;
  value_amount: number | string;
  value_currency: "INR" | "USD";
  signing: Agreement["signing"];
  stamp_state: string;
  stamp_amount: number | string;
  stamp_certificate_no: string;
  related_party: boolean;
  personal_data: boolean;
  ip_clause: Agreement["ip_clause"];
  confidentiality_clause: Agreement["confidentiality_clause"];
  owner: string;
  review_on: string;
  notes: string;
};

export const addAgreement = (input: AgreementInput & CopyInput, by: Staff, attempt: string) =>
  dataAsk(agreementAnswer, "POST", "/data/agreements", { ...input, by, attempt });

export const updateAgreement = (agreementId: string, input: Partial<AgreementInput>, by: Staff) =>
  dataAsk(agreementAnswer, "POST", `/data/agreements/${id(agreementId)}/update`, {
    ...input,
    by,
  });

export const setAgreementStatus = (
  agreementId: string,
  input: { status: AgreementStatus; on: string },
  by: Staff,
) =>
  dataAsk(agreementAnswer, "POST", `/data/agreements/${id(agreementId)}/status`, {
    ...input,
    by,
  });

export const attachAgreementCopy = (
  agreementId: string,
  input: CopyInput & { kind: "signed" | "audit_trail" },
  by: Staff,
) =>
  dataAsk(agreementAnswer, "POST", `/data/agreements/${id(agreementId)}/signed-copy`, {
    ...input,
    by,
  });

export const recordNoticeGiven = (
  agreementId: string,
  input: { on: string; note: string },
  by: Staff,
) =>
  dataAsk(agreementAnswer, "POST", `/data/agreements/${id(agreementId)}/notice-given`, {
    ...input,
    by,
  });
