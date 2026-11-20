import "server-only";

import { z } from "zod";

import type { CopyInput } from "@/lib/data/api/meetings";
import { fileChoiceSchema, fileLinkSchema } from "@/lib/data/api/registers";
import { staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";
import {
  CERT_STATUS_KEYS,
  INSURANCE_KIND_KEYS,
  REVIEW_INPUT_KEYS,
} from "@/lib/data/labels-assurance";

/**
 * Assurance (ws-notes/security/spec.md §8.4): the Summary (each area's lines, the modules not
 * loaded here, whether it was asked as the Owner), certifications with their worked-out days,
 * insurance policies, management reviews with their actions, and his months between reviews.
 */

const stamp = {
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
};

export const summaryAreaSchema = z.enum(["systems", "assurance", "buyers"]);
export type SummaryArea = z.infer<typeof summaryAreaSchema>;

export const summaryLineSchema = z.object({
  key: z.string(),
  area: summaryAreaSchema,
  title: z.string(),
  words: z.string(),
  attention: z.boolean(),
  href: z.string(),
});
export type SummaryLine = z.infer<typeof summaryLineSchema>;

export const summarySchema = ok.extend({
  areas: z.array(z.object({ area: summaryAreaSchema, lines: z.array(summaryLineSchema) })),
  absent: z.array(
    z.object({
      name: z.string(),
      area: summaryAreaSchema,
      title: z.string(),
      words: z.string(),
      href: z.string(),
    }),
  ),
  owner: z.boolean(),
  today: z.string(),
});
export type AssuranceSummary = z.infer<typeof summarySchema>;

export const certDaySchema = z.object({
  key: z.enum(["stage1", "stage2", "s1", "s2", "expiry"]),
  title: z.string(),
  on: z.string(),
  ahead: z.number(),
  audit: z.boolean(),
});
export type CertDay = z.infer<typeof certDaySchema>;

export const certificationSchema = z.object({
  cert_id: z.string(),
  standard: z.enum(["iso27001", "soc2", "other"]),
  name: z.string(),
  status: z.enum(CERT_STATUS_KEYS),
  body: z.string(),
  accredited_by: z.string(),
  accreditation_checked_on: z.string().nullable(),
  consultant: z.string(),
  scope: z.string(),
  stage1_on: z.string().nullable(),
  stage2_on: z.string().nullable(),
  certificate_number: z.string(),
  issued_on: z.string().nullable(),
  expires_on: z.string().nullable(),
  report: z
    .object({
      kind: z.enum(["type1", "type2"]),
      from: z.string().nullable(),
      to: z.string().nullable(),
    })
    .nullable(),
  surveillance: z.array(
    z.object({
      n: z.union([z.literal(1), z.literal(2)]),
      due_on: z.string().nullable(),
      held_on: z.string().nullable(),
      outcome: z.string(),
      file_id: z.string().nullable(),
    }),
  ),
  certificate_file_id: z.string().nullable(),
  notes: z.string(),
  ...stamp,
  standard_words: z.string(),
  status_label: z.string(),
  expiry: z.string().nullable(),
  expiry_typed: z.boolean(),
  days: z.array(certDaySchema),
  next_audit: certDaySchema.nullable(),
  words: z.string(),
  certificate_file: fileLinkSchema.nullable(),
  surveillance_files: z.array(z.object({ n: z.number(), file: fileLinkSchema.nullable() })),
  href: z.string(),
});
export type CertificationRow = z.infer<typeof certificationSchema>;

export const insuranceSchema = z.object({
  insurance_id: z.string(),
  kind: z.enum(INSURANCE_KIND_KEYS),
  name: z.string(),
  insurer: z.string(),
  policy_number: z.string(),
  cover_minor: z.number().nullable(),
  currency: z.string(),
  premium_minor: z.number().nullable(),
  starts_on: z.string().nullable(),
  ends_on: z.string().nullable(),
  broker: z.string(),
  certificate_file_id: z.string().nullable(),
  renewed_by: z.string().nullable(),
  notes: z.string(),
  ...stamp,
  cover_label: z.string(),
  cover_words: z.string(),
  amount_words: z.string(),
  premium_words: z.string(),
  ended_unrenewed: z.boolean(),
  renewed_from: z.string().nullable(),
  certificate_file: fileLinkSchema.nullable(),
  href: z.string(),
});
export type InsuranceRow = z.infer<typeof insuranceSchema>;

export const reviewActionSchema = z.object({
  action_id: z.string(),
  what: z.string(),
  owner: z.string(),
  due_on: z.string().nullable(),
  done_on: z.string().nullable(),
});

export const reviewSchema = z.object({
  review_id: z.string(),
  held_on: z.string(),
  attendees: z.string(),
  inputs: z.partialRecord(z.enum(REVIEW_INPUT_KEYS), z.string()),
  decisions: z.string(),
  actions: z.array(reviewActionSchema),
  minutes_file_id: z.string().nullable(),
  ...stamp,
  actions_open: z.number(),
  actions_late: z.number(),
  minutes_file: fileLinkSchema.nullable(),
  href: z.string(),
});
export type ReviewRow = z.infer<typeof reviewSchema>;

const eventSchema = z.object({
  event_id: z.string(),
  target: z.string(),
  id: z.string(),
  verb: z.string(),
  detail: z.string(),
  by: staffSchema,
  at: z.string(),
});
export type AssuranceEvent = z.infer<typeof eventSchema>;

const inputsSchema = z.array(z.object({ key: z.enum(REVIEW_INPUT_KEYS), label: z.string() }));

export const certificationsPageSchema = ok.extend({
  certifications: z.array(certificationSchema),
  files: z.array(fileChoiceSchema),
  files_here: z.boolean(),
  today: z.string(),
});
export type CertificationsPage = z.infer<typeof certificationsPageSchema>;

export const certificationPageSchema = ok.extend({
  certification: certificationSchema,
  events: z.array(eventSchema),
  files: z.array(fileChoiceSchema),
  files_here: z.boolean(),
  today: z.string(),
});
export type CertificationPage = z.infer<typeof certificationPageSchema>;

export const insurancePageSchema = ok.extend({
  insurance: z.array(insuranceSchema),
  files: z.array(fileChoiceSchema),
  files_here: z.boolean(),
  today: z.string(),
});
export type InsurancePage = z.infer<typeof insurancePageSchema>;

export const reviewsPageSchema = ok.extend({
  reviews: z.array(reviewSchema),
  next: z.object({
    next_on: z.string().nullable(),
    last_held: z.string().nullable(),
    months: z.number(),
    yours: z.boolean(),
  }),
  inputs: inputsSchema,
  files: z.array(fileChoiceSchema),
  files_here: z.boolean(),
  today: z.string(),
});
export type ReviewsPage = z.infer<typeof reviewsPageSchema>;

export const reviewPageSchema = ok.extend({
  review: reviewSchema,
  events: z.array(eventSchema),
  inputs: inputsSchema,
  files: z.array(fileChoiceSchema),
  files_here: z.boolean(),
  today: z.string(),
});
export type ReviewPage = z.infer<typeof reviewPageSchema>;

const certAnswer = ok.extend({ certification: certificationSchema });
const insuranceAnswer = ok.extend({ insurance: insuranceSchema });
const reviewAnswer = ok.extend({ review: reviewSchema });

/** The Summary: `owner` true only when the portal's own context says the Owner is asking. */
export const readAssuranceSummary = (owner: boolean) =>
  dataAsk(summarySchema, "GET", `/data/assurance${owner ? "?owner=1" : ""}`);

export const readCertifications = () =>
  dataAsk(certificationsPageSchema, "GET", "/data/assurance/certifications");

export const readCertification = (certId: string) =>
  dataAsk(certificationPageSchema, "GET", `/data/assurance/certifications/${id(certId)}`);

export type CertificationInput = Partial<
  Record<
    | "standard"
    | "name"
    | "status"
    | "body"
    | "accredited_by"
    | "accreditation_checked_on"
    | "consultant"
    | "scope"
    | "stage1_on"
    | "stage2_on"
    | "certificate_number"
    | "issued_on"
    | "expires_on"
    | "report_kind"
    | "report_from"
    | "report_to"
    | "notes",
    string
  >
>;

export const addCertification = (
  input: CertificationInput & CopyInput,
  by: Staff,
  attempt: string,
) => dataAsk(certAnswer, "POST", "/data/assurance/certifications", { ...input, by, attempt });

export const updateCertification = (
  certId: string,
  input: CertificationInput & CopyInput,
  by: Staff,
) =>
  dataAsk(certAnswer, "POST", `/data/assurance/certifications/${id(certId)}/update`, {
    ...input,
    by,
  });

export const recordSurveillance = (
  certId: string,
  n: 1 | 2,
  input: { due_on?: string; held_on?: string; outcome?: string } & CopyInput,
  by: Staff,
) =>
  dataAsk(certAnswer, "POST", `/data/assurance/certifications/${id(certId)}/surveillance/${n}`, {
    ...input,
    by,
  });

export const readInsurance = () => dataAsk(insurancePageSchema, "GET", "/data/assurance/insurance");

export type InsuranceInput = Partial<
  Record<
    | "kind"
    | "name"
    | "insurer"
    | "policy_number"
    | "cover"
    | "currency"
    | "premium"
    | "starts_on"
    | "ends_on"
    | "broker"
    | "notes",
    string
  >
>;

export const addInsurance = (input: InsuranceInput & CopyInput, by: Staff, attempt: string) =>
  dataAsk(insuranceAnswer, "POST", "/data/assurance/insurance", { ...input, by, attempt });

export const updateInsurance = (
  insuranceId: string,
  input: InsuranceInput & CopyInput,
  by: Staff,
) =>
  dataAsk(insuranceAnswer, "POST", `/data/assurance/insurance/${id(insuranceId)}/update`, {
    ...input,
    by,
  });

export const renewInsurance = (
  insuranceId: string,
  input: InsuranceInput & CopyInput,
  by: Staff,
  attempt: string,
) =>
  dataAsk(insuranceAnswer, "POST", `/data/assurance/insurance/${id(insuranceId)}/renew`, {
    ...input,
    by,
    attempt,
  });

export const readReviews = () => dataAsk(reviewsPageSchema, "GET", "/data/assurance/reviews");

export const readReview = (reviewId: string) =>
  dataAsk(reviewPageSchema, "GET", `/data/assurance/reviews/${id(reviewId)}`);

export type ReviewInput = {
  held_on?: string;
  attendees?: string;
  decisions?: string;
  inputs?: Partial<Record<(typeof REVIEW_INPUT_KEYS)[number], string>>;
  actions?: { what: string; owner: string; due_on: string }[];
};

export const addReview = (input: ReviewInput & CopyInput, by: Staff, attempt: string) =>
  dataAsk(reviewAnswer, "POST", "/data/assurance/reviews", { ...input, by, attempt });

export const updateReview = (reviewId: string, input: ReviewInput & CopyInput, by: Staff) =>
  dataAsk(reviewAnswer, "POST", `/data/assurance/reviews/${id(reviewId)}/update`, {
    ...input,
    by,
  });

export const addReviewAction = (
  reviewId: string,
  input: { what: string; owner: string; due_on: string },
  by: Staff,
) =>
  dataAsk(reviewAnswer, "POST", `/data/assurance/reviews/${id(reviewId)}/actions`, {
    ...input,
    by,
  });

export const reviewActionDone = (
  actionId: string,
  input: { undo?: true; on?: string },
  by: Staff,
) =>
  dataAsk(reviewAnswer, "POST", `/data/assurance/reviews/actions/${id(actionId)}/done`, {
    ...input,
    by,
  });

export const saveAssuranceSetup = (input: { review_months: string }, by: Staff) =>
  dataAsk(
    ok.extend({ review_months: z.number().nullable(), months: z.number() }),
    "POST",
    "/data/assurance/setup",
    { ...input, by },
  );
