import "server-only";

import { z } from "zod";

import { staffSchema } from "@/lib/data/api/replies";
import { evidenceSchema } from "@/lib/data/api/dates";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * The company record (company spec §6.4, §6.8): the facts kept on this computer, the
 * directors and their contact changes on the MCA record. Checks are sentences, never
 * refusals; what the facts decide is worked out by Key dates as suggestions to confirm with
 * the CA or CS. Nothing here is filed anywhere.
 */

export const flagSchema = z.enum(["yes", "no", ""]);

export const factsSchema = z.object({
  legal_name: z.string(),
  cin: z.string(),
  pan: z.string(),
  tan: z.string(),
  gstin: z.string(),
  registered_state: z.string(),
  registered_office: z.string(),
  incorporated_on: z.string().nullable(),
  first_fy_end: z.string().nullable(),
  auditor: z.object({
    name: z.string(),
    firm_number: z.string(),
    appointed_on: z.string().nullable(),
    appointed_by: z.enum(["board", "agm", ""]),
    contact_id: z.string().nullable(),
  }),
  bank: z.object({ name: z.string(), branch: z.string(), contact_id: z.string().nullable() }),
  firms: z.object({ registered_on: z.string().nullable(), user_note: z.string() }),
  dpiit: z.object({ number: z.string(), recognised_on: z.string().nullable() }),
  flags: z.object({
    small: flagSchema,
    startup: flagSchema,
    subsidiary: flagSchema,
    foreign_investment: flagSchema,
    gst_registered: flagSchema,
    exports: flagSchema,
  }),
  updated_at: z.string().nullable(),
  updated_by: staffSchema.nullable(),
});
export type CompanyFacts = z.infer<typeof factsSchema>;

export const designationSchema = z.enum([
  "director",
  "managing",
  "whole_time",
  "additional",
  "nominee",
]);

export const directorSchema = z.object({
  director_id: z.string(),
  name: z.string(),
  din: z.string(),
  din_allotted_on: z.string().nullable(),
  designation: designationSchema,
  appointed_on: z.string().nullable(),
  ceased_on: z.string().nullable(),
  is_founder: z.boolean(),
  dsc: z.object({ expires_on: z.string().nullable(), kept: z.string() }),
  kyc: z.object({ last_filed_on: z.string().nullable(), srn: z.string() }),
  mca: z.object({ email: z.string(), mobile: z.string(), address: z.string() }),
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
});
export type Director = z.infer<typeof directorSchema>;

export const directorRowSchema = directorSchema.extend({
  in_office: z.boolean(),
  dsc_soon: z.boolean(),
  next_kyc: z.object({ due_on: z.string().nullable(), words: z.string() }).nullable(),
  changes_to_file: z.object({ count: z.number(), first_by: z.string().nullable() }),
});
export type DirectorRow = z.infer<typeof directorRowSchema>;

export const contactChangeSchema = z.object({
  change_id: z.string(),
  director_id: z.string(),
  field: z.enum(["email", "mobile", "address"]),
  from: z.string(),
  to: z.string(),
  changed_on: z.string(),
  filed: z.object({ on: z.string(), srn: z.string() }).nullable(),
  at: z.string(),
  by: staffSchema,
  file_by: z.string(),
});
export type ContactChange = z.infer<typeof contactChangeSchema>;

export const companyEventSchema = z.object({
  event_id: z.string(),
  target: z.enum(["facts", "director"]),
  id: z.string(),
  verb: z.string(),
  detail: z.string(),
  by: staffSchema,
  at: z.string(),
});
export type CompanyEvent = z.infer<typeof companyEventSchema>;

/** A Key date a record started, as the record's page lists it. */
export const keyDateLinkSchema = z.object({
  date_id: z.string(),
  rule_key: z.string().nullable(),
  origin_key: z.string(),
  title: z.string(),
  due_on: z.string(),
  state: z.enum(["coming_up", "in_progress", "done", "not_for_us", "taken_back"]),
  overdue: z.boolean(),
  evidence: evidenceSchema,
  href: z.string(),
});
export type KeyDateLink = z.infer<typeof keyDateLinkSchema>;

export const companyPageSchema = ok.extend({
  facts: factsSchema,
  empty: z.boolean(),
  checks: z.array(z.string()),
  decides: z.array(z.object({ rule: z.string(), worked_out: z.string(), from: z.string() })),
  changes: z.array(companyEventSchema),
  first_fy_end_options: z.array(z.string()),
  directors_in_office: z.number(),
  last_agm: z.object({ on: z.string(), from: z.enum(["meetings", "typed"]) }).nullable(),
  contacts_here: z.boolean(),
  today: z.string(),
});
export type CompanyPage = z.infer<typeof companyPageSchema>;

export const directorsPageSchema = ok.extend({
  directors: z.array(directorRowSchema),
  counts: z.object({ in_office: z.number(), ceased: z.number() }),
  today: z.string(),
});
export type DirectorsPage = z.infer<typeof directorsPageSchema>;

export const directorPageSchema = ok.extend({
  director: directorRowSchema,
  changes: z.array(contactChangeSchema),
  key_dates: z.array(keyDateLinkSchema),
  key_dates_here: z.boolean(),
  events: z.array(companyEventSchema),
  today: z.string(),
});
export type DirectorPage = z.infer<typeof directorPageSchema>;

const directorAnswer = ok.extend({ director: directorRowSchema });

export const readCompany = () => dataAsk(companyPageSchema, "GET", "/data/company");

export type FactsGroup = "identity" | "dates" | "class" | "registrations";

export const saveFacts = (group: FactsGroup, input: Record<string, string>, by: Staff) =>
  dataAsk(
    ok.extend({ facts: factsSchema, checks: z.array(z.string()) }),
    "POST",
    "/data/company/facts",
    { ...input, group, by },
  );

export const readDirectors = (ceased = false) =>
  dataAsk(directorsPageSchema, "GET", `/data/company/directors${ceased ? "?ceased=1" : ""}`);

export const readDirector = (directorId: string) =>
  dataAsk(directorPageSchema, "GET", `/data/company/directors/${id(directorId)}`);

/** The director form's fields; the MCA contact only when adding (later it changes by a contact change). */
export type DirectorInput = {
  name?: string;
  din?: string;
  din_allotted_on?: string;
  designation?: string;
  appointed_on?: string;
  is_founder?: boolean;
  dsc_expires_on?: string;
  dsc_kept?: string;
  kyc_filed_on?: string;
  kyc_srn?: string;
  mca_email?: string;
  mca_mobile?: string;
  mca_address?: string;
};

export const addDirector = (input: DirectorInput, by: Staff, attempt: string) =>
  dataAsk(directorAnswer, "POST", "/data/company/directors", { ...input, by, attempt });

export const updateDirector = (directorId: string, input: DirectorInput, by: Staff) =>
  dataAsk(directorAnswer, "POST", `/data/company/directors/${id(directorId)}/update`, {
    ...input,
    by,
  });

export const recordContactChange = (
  directorId: string,
  input: { field: string; to: string; changed_on: string; add_date: boolean },
  by: Staff,
  attempt: string,
) =>
  dataAsk(
    ok.extend({
      director: directorRowSchema,
      change: contactChangeSchema,
      key_dates: z.array(keyDateLinkSchema),
    }),
    "POST",
    `/data/company/directors/${id(directorId)}/contact-change`,
    { ...input, by, attempt },
  );

export const recordChangeFiled = (
  directorId: string,
  changeId: string,
  input: { filed_on: string; srn: string },
  by: Staff,
) =>
  dataAsk(
    ok.extend({ change: contactChangeSchema }),
    "POST",
    `/data/company/directors/${id(directorId)}/contact-change/${id(changeId)}/filed`,
    { ...input, by },
  );

export const recordKyc = (
  directorId: string,
  input: { filed_on: string; srn: string },
  by: Staff,
) =>
  dataAsk(
    directorAnswer.extend({
      next_kyc: z.object({ due_on: z.string().nullable(), words: z.string() }).nullable(),
    }),
    "POST",
    `/data/company/directors/${id(directorId)}/kyc`,
    { ...input, by },
  );

export const ceaseDirector = (directorId: string, ceasedOn: string, by: Staff) =>
  dataAsk(directorAnswer, "POST", `/data/company/directors/${id(directorId)}/ceased`, {
    ceased_on: ceasedOn,
    by,
  });
