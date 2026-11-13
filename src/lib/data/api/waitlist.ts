import "server-only";

import { z } from "zod";

import { fileRowSchema } from "@/lib/data/api/files";
import { leadRowSchema } from "@/lib/data/api/leads";
import { staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * The waitlist: firms that said yes, one each, with their proof, next step and people;
 * the hold preview and the hold itself (Mail merge's own stop list); the investor view,
 * which the service builds without an address, a name or a phone in it.
 */

export const stageSchema = z.enum([
  "joined",
  "call_booked",
  "call_held",
  "pilot",
  "customer",
  "dropped",
]);
export type Stage = z.infer<typeof stageSchema>;

const stageCounts = z.object({
  joined: z.number(),
  call_booked: z.number(),
  call_held: z.number(),
  pilot: z.number(),
  customer: z.number(),
  dropped: z.number(),
});
export type StageCounts = z.infer<typeof stageCounts>;

export const roleSchema = z.enum([
  "not_set",
  "decision_maker",
  "champion",
  "daily_user",
  "technical",
  "compliance",
]);
export type ColleagueRoleKey = z.infer<typeof roleSchema>;

export const entrySchema = z.object({
  entry_id: z.string(),
  firm_key: z.string(),
  firm: z.string(),
  domain: z.string(),
  firm_type: z.string(),
  city: z.string(),
  country: z.string(),
  contact_email: z.string(),
  joined_on: z.string(),
  how_joined: z.string(),
  proof: z.object({
    reply_id: z.string().nullable(),
    quote: z.string(),
    from: z.string(),
    subject: z.string(),
    received_at: z.string().nullable(),
    file_id: z.string().nullable(),
    recorded_by: z.string().default(""),
  }),
  stage: stageSchema,
  stage_since: z.string(),
  next_step: z.string(),
  next_step_on: z.string().nullable(),
  call_at: z.string().nullable(),
  dropped: z.object({ reason: z.string(), look_again_on: z.string().nullable() }).nullable(),
  pilot: z
    .object({
      starts_on: z.string().nullable(),
      ends_on: z.string().nullable(),
      success: z.string(),
    })
    .nullable(),
  owner: z.string(),
  naming: z.enum(["named", "described"]),
  described_as: z.string(),
  people: z.array(
    z.object({
      email: z.string(),
      role: roleSchema,
      added: z.enum(["reply", "copied", "hand"]),
    }),
  ),
  created_at: z.string(),
  updated_at: z.string(),
});
export type WaitlistEntry = z.infer<typeof entrySchema>;

export const entryRowSchema = z.object({
  entry_id: z.string(),
  firm: z.string(),
  domain: z.string(),
  free_mail: z.boolean(),
  stage: stageSchema,
  stage_since: z.string(),
  next_step: z.string(),
  next_step_on: z.string().nullable(),
  joined_on: z.string(),
  how_joined: z.string(),
  naming: z.enum(["named", "described"]),
  contact: z.object({
    email: z.string(),
    name: z.string(),
    title: z.string(),
    lead_id: z.string().nullable(),
  }),
  colleagues: z.object({ on_file: z.number(), not_written: z.number() }),
});
export type EntryRow = z.infer<typeof entryRowSchema>;

export const waitlistPageSchema = ok.extend({
  entries: z.array(entryRowSchema),
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  counts: stageCounts.extend({ all: z.number() }),
  now: stageCounts,
  ever: stageCounts,
  firms: z.number(),
  today: z.string(),
});
export type WaitlistPage = z.infer<typeof waitlistPageSchema>;

export const eventSchema = z.object({
  event_id: z.string(),
  entry_id: z.string(),
  kind: z.enum([
    "stage",
    "note",
    "call",
    "next_step",
    "person",
    "hold",
    "release",
    "edit",
    "proof",
  ]),
  at: z.string(),
  by: staffSchema,
  from: stageSchema.optional(),
  to: stageSchema.optional(),
  text: z.string().optional(),
  when: z.string().optional(),
});
export type WaitlistEvent = z.infer<typeof eventSchema>;

export const holdSchema = z.object({
  hold_id: z.string(),
  entry_id: z.string(),
  domain: z.string(),
  emails: z.array(z.string()),
  made_at: z.string(),
  made_by: staffSchema,
  released: z.array(z.object({ email: z.string(), at: z.string(), by: staffSchema })),
  stopped_at: z.record(z.string(), z.string()).optional(),
  open: z.array(z.string()),
});
export type Hold = z.infer<typeof holdSchema>;

export const colleagueSchema = leadRowSchema.extend({
  role: roleSchema,
  added: z.enum(["reply", "copied", "hand"]).nullable(),
  on_page: z.boolean(),
});
export type Colleague = z.infer<typeof colleagueSchema>;

export const entryDetailSchema = ok.extend({
  entry: entrySchema,
  events: z.array(eventSchema),
  people: z.array(colleagueSchema),
  holds: z.array(holdSchema),
  proof_file: fileRowSchema.nullable(),
  contact: leadRowSchema.nullable(),
  free_mail: z.boolean(),
  files: z.boolean(),
  today: z.string(),
});
export type EntryDetail = z.infer<typeof entryDetailSchema>;

export const candidateSchema = z.object({
  email: z.string(),
  name: z.string(),
  title: z.string(),
  lists: z.array(z.string()),
});
export type Candidate = z.infer<typeof candidateSchema>;

export const holdPreviewSchema = ok.extend({
  candidates: z.array(candidateSchema),
  people_at_domain: z.number(),
  large: z.boolean(),
  free_mail: z.boolean(),
  domain: z.string(),
});
export type HoldPreview = z.infer<typeof holdPreviewSchema>;

export const investorRowSchema = z.object({
  joined_on: z.string(),
  firm: z.string(),
  named: z.boolean(),
  firm_type: z.string(),
  place: z.string(),
  contact_role: z.string(),
  how_joined: z.string(),
  stage: stageSchema,
  since: z.string(),
  proof: z.enum(["reply", "call"]),
  proof_on: z.string(),
});
export type InvestorRow = z.infer<typeof investorRowSchema>;

export const investorPageSchema = ok.extend({
  as_of: z.string(),
  rows: z.array(investorRowSchema),
  now: stageCounts,
  ever: stageCounts,
});
export type InvestorPage = z.infer<typeof investorPageSchema>;

// ------------------------------------------------------------------ reads

export function readWaitlist(query: { stage?: string; q?: string; offset?: number } = {}) {
  const params = new URLSearchParams();
  if (query.stage) params.set("stage", query.stage);
  if (query.q) params.set("q", query.q);
  if (query.offset) params.set("offset", String(query.offset));
  const rendered = params.toString();
  return dataAsk(waitlistPageSchema, "GET", `/data/waitlist${rendered ? `?${rendered}` : ""}`);
}

export const readEntry = (entryId: string) =>
  dataAsk(entryDetailSchema, "GET", `/data/waitlist/${id(entryId)}`);

export const readHoldPreview = (entryId: string) =>
  dataAsk(holdPreviewSchema, "GET", `/data/waitlist/${id(entryId)}/hold-preview`);

export const readForInvestors = () =>
  dataAsk(investorPageSchema, "GET", "/data/waitlist/for-investors");

// ------------------------------------------------------------------ writes

const entryAnswer = ok.extend({ entry: entrySchema });

export const addFirm = (
  input: { email: string; firm: string; joined_on: string; how_joined: string; quote: string },
  by: Staff,
  attempt: string,
) =>
  dataAsk(ok.extend({ entry: entrySchema, href: z.string() }), "POST", "/data/waitlist", {
    ...input,
    by,
    attempt,
  });

export const updateEntry = (entryId: string, field: string, value: string, by: Staff) =>
  dataAsk(entryAnswer, "POST", `/data/waitlist/${id(entryId)}/update`, { field, value, by });

export type StageMoveInput = {
  stage: Stage;
  from?: Stage;
  next_step?: string;
  next_step_on?: string;
  call_at?: string;
  notes?: string;
  pilot?: { starts_on: string; ends_on: string; success: string };
  dropped?: { reason: string; look_again_on: string };
};

export const moveStage = (entryId: string, input: StageMoveInput, by: Staff) =>
  dataAsk(entryAnswer, "POST", `/data/waitlist/${id(entryId)}/stage`, { ...input, by });

export const addEntryNote = (
  entryId: string,
  input: { text: string; kind: "note" | "call"; at?: string },
  by: Staff,
  attempt: string,
) =>
  dataAsk(ok.extend({ event: eventSchema }), "POST", `/data/waitlist/${id(entryId)}/notes`, {
    ...input,
    by,
    attempt,
  });

export const addColleague = (
  entryId: string,
  input: { email: string; name: string; title: string; role: string },
  by: Staff,
) =>
  dataAsk(
    ok.extend({ entry: entrySchema, lead: leadRowSchema }),
    "POST",
    `/data/waitlist/${id(entryId)}/people`,
    { ...input, by },
  );

export const setColleagueRole = (entryId: string, email: string, role: string, by: Staff) =>
  dataAsk(entryAnswer, "POST", `/data/waitlist/${id(entryId)}/people/role`, { email, role, by });

export const attachProof = (
  entryId: string,
  input: { file_id: string } | { name: string; content: string },
  by: Staff,
  attempt: string,
) =>
  dataAsk(
    ok.extend({ entry: entrySchema, file: fileRowSchema }),
    "POST",
    `/data/waitlist/${id(entryId)}/proof-file`,
    { ...input, by, attempt },
  );

export const holdBack = (entryId: string, emails: string[], by: Staff) =>
  dataAsk(
    ok.extend({
      hold: holdSchema.nullable(),
      added: z.array(z.string()),
      already: z.array(z.string()),
      skipped: z.array(z.string()),
    }),
    "POST",
    `/data/waitlist/${id(entryId)}/hold`,
    { emails, by },
  );

export const releaseHold = (holdId: string, emails: string[] | null, by: Staff) =>
  dataAsk(
    ok.extend({
      released: z.array(z.string()),
      not_stopped: z.array(z.string()),
      kept: z.array(z.object({ email: z.string(), why: z.string() })),
      hold: holdSchema,
    }),
    "POST",
    `/data/holds/${id(holdId)}/release`,
    emails ? { emails, by } : { by },
  );

export const importOldWaitlist = (
  input: { text: string; file_name: string },
  by: Staff,
  attempt: string,
) =>
  dataAsk(
    ok.extend({
      added: z.number(),
      already: z.number(),
      refused: z.array(z.object({ line: z.number(), reason: z.string() })),
    }),
    "POST",
    "/data/waitlist/import",
    { ...input, by, attempt },
  );
