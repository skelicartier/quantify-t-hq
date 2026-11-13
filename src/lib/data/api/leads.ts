import "server-only";

import { z } from "zod";

import { followUpSchema, replyRowSchema, staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * All leads: every address from the lead files and Mail merge's lists, one row each, read
 * a page at a time; one lead whole; the lead sources. Edits stay in Data and never change
 * a Mail merge list; a stop goes onto Mail merge's own stop list.
 */

export const leadStatusSchema = z.enum([
  "not_sent",
  "held_back",
  "sent",
  "yes",
  "later",
  "question",
  "wrong_person",
  "no",
  "stopped",
]);
export type LeadStatusKey = z.infer<typeof leadStatusSchema>;

export const LEAD_FIELD_KEYS = [
  "first_name",
  "last_name",
  "full_name",
  "title",
  "company",
  "firm_type",
  "website",
  "country",
  "city",
  "phone",
  "registration_no",
  "source",
  "source_url",
  "email_kind",
  "notes",
] as const;
export const leadFieldSchema = z.enum(LEAD_FIELD_KEYS);
export type LeadFieldKey = z.infer<typeof leadFieldSchema>;

export const leadRowSchema = z.object({
  lead_id: z.string(),
  email: z.string(),
  name: z.string(),
  title: z.string(),
  company: z.string(),
  firm_type: z.string(),
  city: z.string(),
  country: z.string(),
  domain: z.string(),
  email_kind: z.string(),
  status: leadStatusSchema,
  status_detail: z.string(),
  status_at: z.string().nullable(),
  times_written: z.number(),
  last_written_at: z.string().nullable(),
  last_mailing: z.string(),
  batches: z.array(z.string()),
  tags: z.array(z.string()),
  badges: z.array(z.string()),
});
export type LeadRow = z.infer<typeof leadRowSchema>;

export const facetEntrySchema = z.object({
  value: z.string(),
  label: z.string(),
  count: z.number(),
});
export type FacetEntry = z.infer<typeof facetEntrySchema>;

export const leadsPageSchema = ok.extend({
  leads: z.array(leadRowSchema),
  total: z.number(),
  listable: z.number(),
  all: z.number(),
  offset: z.number(),
  limit: z.number(),
  counts: z.object({
    status: z.record(z.string(), z.number()),
    reply: z.record(z.string(), z.number()),
  }),
  book: z.object({
    leads: z.number(),
    written: z.number(),
    not_sent: z.number(),
    replied: z.number(),
    held_back: z.number(),
    stopped: z.number(),
  }),
  facets: z.object({
    firm_type: z.array(facetEntrySchema),
    country: z.array(facetEntrySchema),
    email_kind: z.array(facetEntrySchema),
    batch: z.array(facetEntrySchema),
    source: z.array(facetEntrySchema),
    tag: z.array(facetEntrySchema),
  }),
  read_at: z.string(),
  sending: z.boolean(),
  reading: z.boolean(),
});
export type LeadsPage = z.infer<typeof leadsPageSchema>;

export const sentMailSchema = z.discriminatedUnion("gone", [
  z.object({
    mailing_id: z.string(),
    mailing: z.string(),
    at: z.string(),
    state: z.enum(["sent", "unknown"]),
    gone: z.literal(false),
    from: z.string(),
    reply_to: z.string(),
    to: z.string(),
    subject: z.string(),
    text: z.string(),
  }),
  z.object({
    mailing_id: z.string(),
    mailing: z.string(),
    at: z.string(),
    state: z.enum(["sent", "unknown"]),
    gone: z.literal(true),
  }),
]);
export type SentMail = z.infer<typeof sentMailSchema>;

export const activitySchema = z.object({
  kind: z.string(),
  title: z.string(),
  detail: z.string(),
  at: z.string(),
  by: staffSchema.nullable(),
  href: z.string().nullable(),
  note_id: z.string().optional(),
});
export type LeadActivity = z.infer<typeof activitySchema>;

export const leadDetailSchema = leadRowSchema.extend({
  fields: z.record(leadFieldSchema, z.string()),
  other: z.record(z.string(), z.string()),
  edited: z.array(leadFieldSchema),
  first_written_at: z.string().nullable(),
  sent: z.array(sentMailSchema),
  replies: z.array(replyRowSchema),
  notes: z.array(
    z.object({ note_id: z.string(), text: z.string(), by: staffSchema, at: z.string() }),
  ),
  activity: z.array(activitySchema),
  stop: z
    .object({
      reason: z.enum(["manual", "asked", "bounced", "blocked"]),
      at: z.string(),
      detail: z.string(),
      why: z.enum(["said_no", "firm_hold", "by_hand"]).nullable(),
    })
    .nullable(),
  held: z.object({ reason: z.string(), source: z.string() }).nullable(),
  firm_hold: z.object({ reason: z.string(), firm: z.string(), on: z.string() }).nullable(),
  follow_up: followUpSchema.nullable(),
  waitlist: z.object({ entry_id: z.string(), firm: z.string(), stage: z.string() }).nullable(),
  investor: z.object({ investor_id: z.string(), firm: z.string(), stage: z.string() }).nullable(),
  stale_in: z.string().nullable(),
  stale_seen_in: z.number().nullable(),
  sources: z.array(z.object({ label: z.string(), values: z.record(z.string(), z.string()) })),
  firm: z.object({
    domain: z.string(),
    free_mail: z.boolean(),
    people: z.array(leadRowSchema),
    total: z.number(),
  }),
  sending_to_them: z.boolean(),
  origin: z.enum(["hand", "referral", "reply", "copied"]).nullable(),
});
export type LeadDetail = z.infer<typeof leadDetailSchema>;

const leftOutSchema = z.object({ line: z.number(), reason: z.string(), value: z.string() });

export const leadSourceSchema = z.object({
  source_id: z.string(),
  file_id: z.string(),
  role: z.enum(["leads", "held_back"]),
  reason: z.string(),
  added_at: z.string(),
  added_by: staffSchema,
  state: z.enum(["waiting", "reading", "read", "failed"]),
  detail: z.string(),
  title: z.string(),
  read: z
    .object({
      at: z.string(),
      version_n: z.number(),
      sha256: z.string(),
      rows: z.number(),
      leads: z.number(),
      left_out_total: z.number(),
      left_out: z.array(leftOutSchema),
    })
    .nullable(),
  folder_path: z.string(),
  trashed: z.boolean(),
  in_files: z.boolean(),
  progress: z.object({ done: z.number(), total: z.number() }).nullable(),
});
export type LeadSource = z.infer<typeof leadSourceSchema>;

export const csvFileSchema = z.object({
  file_id: z.string(),
  title: z.string(),
  folder_path: z.string(),
  updated_at: z.string(),
});

export const sourcesPageSchema = ok.extend({
  sources: z.array(leadSourceSchema),
  merge: z.object({ lists: z.number(), rows: z.number(), read_at: z.string() }),
  csv_files: z.array(csvFileSchema),
  files: z.boolean(),
  reading: z.boolean(),
});
export type SourcesPage = z.infer<typeof sourcesPageSchema>;

/** The list's query as the page holds it; `""` values are left out. */
export type LeadsQuery = Partial<
  Record<
    | "q"
    | "status"
    | "reply"
    | "firm_type"
    | "country"
    | "email_kind"
    | "batch"
    | "source"
    | "tag"
    | "domain"
    | "sort",
    string
  >
> & { offset?: number };

export function leadsQueryString(query: LeadsQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (key !== "offset" && typeof value === "string" && value) params.set(key, value);
  if (query.offset) params.set("offset", String(query.offset));
  return params.toString();
}

export const readLeads = (query: LeadsQuery = {}) => {
  const rendered = leadsQueryString(query);
  return dataAsk(leadsPageSchema, "GET", `/data/leads${rendered ? `?${rendered}` : ""}`);
};

export const readLead = (leadId: string) =>
  dataAsk(
    ok.extend({ lead: leadDetailSchema, today: z.string() }),
    "GET",
    `/data/leads/${id(leadId)}`,
  );

const leadAnswer = ok.extend({ lead: leadRowSchema });

export const updateLead = (leadId: string, field: LeadFieldKey, value: string, by: Staff) =>
  dataAsk(leadAnswer, "POST", `/data/leads/${id(leadId)}/update`, { field, value, by });

export const tagLead = (leadId: string, change: { add?: string[]; remove?: string[] }, by: Staff) =>
  dataAsk(leadAnswer, "POST", `/data/leads/${id(leadId)}/tags`, { ...change, by });

export const addLeadNote = (leadId: string, text: string, by: Staff, attempt: string) =>
  dataAsk(
    ok.extend({
      note: z.object({ note_id: z.string(), text: z.string(), by: staffSchema, at: z.string() }),
    }),
    "POST",
    `/data/leads/${id(leadId)}/notes`,
    { text, by, attempt },
  );

export const deleteLeadNote = (leadId: string, noteId: string, by: Staff) =>
  dataAsk(
    ok.extend({ deleted: z.boolean() }),
    "POST",
    `/data/leads/${id(leadId)}/notes/${id(noteId)}/delete`,
    { by },
  );

export const stopLead = (leadId: string, reason: "asked" | "manual", note: string, by: Staff) =>
  dataAsk(leadAnswer, "POST", `/data/leads/${id(leadId)}/stop`, { reason, note, by });

export const unstopLead = (leadId: string, by: Staff) =>
  dataAsk(leadAnswer, "POST", `/data/leads/${id(leadId)}/unstop`, { by });

export const addLead = (
  input: { email: string; values: Partial<Record<LeadFieldKey, string>> },
  by: Staff,
  attempt: string,
) => dataAsk(leadAnswer, "POST", "/data/leads/add", { ...input, by, attempt });

export const bulkTagLeads = (
  ids: string[],
  change: { add?: string[]; remove?: string[] },
  by: Staff,
) =>
  dataAsk(ok.extend({ changed: z.number() }), "POST", "/data/leads/bulk-tag", {
    ids,
    ...change,
    by,
  });

export const leadsToMailMerge = (query: string, name: string, by: Staff, attempt: string) =>
  dataAsk(
    ok.extend({ list: z.object({ id: z.string(), name: z.string(), people: z.number() }) }),
    "POST",
    "/data/leads/to-mail-merge",
    { query, name, by, attempt },
  );

export const readLeadSources = () => dataAsk(sourcesPageSchema, "GET", "/data/leads/sources");

export const addLeadSource = (
  input: { file_id: string; role: "leads" | "held_back"; reason: string },
  by: Staff,
) =>
  dataAsk(ok.extend({ source: leadSourceSchema }), "POST", "/data/leads/sources", { ...input, by });

export const readSourceRemovePreview = (sourceId: string) =>
  dataAsk(
    ok.extend({ only_here: z.number(), with_data: z.number() }),
    "GET",
    `/data/leads/sources/${id(sourceId)}/remove-preview`,
  );

export const removeLeadSource = (sourceId: string, by: Staff) =>
  dataAsk(
    ok.extend({ removed: z.number() }),
    "POST",
    `/data/leads/sources/${id(sourceId)}/remove`,
    {
      by,
    },
  );

export const readSourceLeftOut = (sourceId: string) =>
  dataAsk(
    ok.extend({ rows: z.array(leftOutSchema), total: z.number() }),
    "GET",
    `/data/leads/sources/${id(sourceId)}/left-out`,
  );

export const readLeadsAgain = (by: Staff) =>
  dataAsk(ok.extend({ state: z.string() }), "POST", "/data/leads/read-again", { by });
