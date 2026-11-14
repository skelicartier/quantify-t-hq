import "server-only";

import { z } from "zod";

import { staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * Key dates: the filings, payments, board meetings and renewals he keeps, and the dates
 * suggested for an Indian private company, worked out from the company record where it
 * can. A suggestion is only a row until he adds it; each one says where its rule comes
 * from, when it was checked and to confirm it with the CA or CS. The rule book holds every
 * clock with his amounts and who confirmed them (company spec §6.4, §6.8).
 */

export const dateKindSchema = z.enum(["filing", "tax", "board", "renewal", "other"]);
export const dateStateSchema = z.enum([
  "coming_up",
  "in_progress",
  "done",
  "not_for_us",
  "taken_back",
]);
export const shownStateSchema = z.enum([
  "coming_up",
  "due_this_week",
  "in_progress",
  "done",
  "not_for_us",
  "taken_back",
]);
export const confirmRoleSchema = z.enum(["CA", "CS", "lawyer"]);
export const ownerRoleSchema = z.enum(["founder", "ca", "cs", "lawyer", "other", ""]);

export const evidenceSchema = z.object({
  srn: z.string(),
  challan: z.string(),
  filed_on: z.string().nullable(),
  fee_paid: z.number().nullable(),
  filed_file_id: z.string().nullable(),
  note: z.string(),
});
export type Evidence = z.infer<typeof evidenceSchema>;

export const sourceSchema = z.object({ name: z.string(), url: z.string() });

/** One clock of the rule book, as the Rules view shows it (company spec §6.4). */
export const ruleViewSchema = z.object({
  key: z.string(),
  area: z.enum(["company", "meetings", "close", "calendar"]),
  title: z.string(),
  from: z.string(),
  clock: z.string(),
  amount: z.number().nullable(),
  default_amount: z.number().nullable(),
  unit: z.enum(["days", "months", "years", "people"]).nullable(),
  changed: z.boolean(),
  sources: z.array(sourceSchema),
  verified_on: z.string(),
  confirm_with: confirmRoleSchema,
  confirmed: z.object({ name: z.string(), role: confirmRoleSchema, on: z.string() }).nullable(),
  confirmation_dropped: z.boolean(),
  late_words: z.string(),
  only_when_confirmed: z.boolean(),
  note: z.string(),
  used_by: z.number(),
  movable: z.number(),
});
export type RuleView = z.infer<typeof ruleViewSchema>;

export const lateSchema = z.object({
  days: z.number(),
  amount: z.number().nullable(),
  words: z.string(),
});
export type Late = z.infer<typeof lateSchema>;
export const repeatsSchema = z.enum(["never", "monthly", "quarterly", "yearly"]);
export const remindSchema = z.union([z.literal(0), z.literal(2), z.literal(7), z.literal(14)]);

export const keyDateSchema = z.object({
  date_id: z.string(),
  title: z.string(),
  kind: dateKindSchema,
  due_on: z.string(),
  repeats: repeatsSchema,
  entity: z.string(),
  handled_by: z.string(),
  remind_days: remindSchema,
  notes: z.string(),
  file_id: z.string().nullable(),
  from_suggestion: z.string().nullable(),
  state: dateStateSchema,
  state_note: z.string(),
  history: z.array(
    z.object({
      due_on: z.string(),
      done_at: z.string(),
      by: staffSchema,
      note: z.string(),
      evidence: evidenceSchema,
    }),
  ),
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  rule_key: z.string().nullable(),
  statutory: z.boolean(),
  origin: z.object({ key: z.string(), label: z.string(), href: z.string() }).nullable(),
  base_on: z.string().nullable(),
  owner_role: ownerRoleSchema,
  evidence: evidenceSchema,
  sign_off: z
    .object({
      name: z.string(),
      role: confirmRoleSchema,
      on: z.string(),
      contact_id: z.string().nullable(),
    })
    .nullable(),
  shown_state: shownStateSchema,
  overdue: z.boolean(),
  reminding: z.boolean(),
  file: z.object({ file_id: z.string(), title: z.string() }).nullable(),
  filed_file: z.object({ file_id: z.string(), title: z.string() }).nullable(),
  late: lateSchema.nullable(),
  rule: ruleViewSchema.nullable(),
});
export type KeyDate = z.infer<typeof keyDateSchema>;

export const suggestionSchema = z.object({
  key: z.string(),
  title: z.string(),
  kind: dateKindSchema,
  group: z.enum(["monthly", "quarterly", "yearly", "renewal", "company"]),
  rule: z.string(),
  applies: z.string(),
  repeats: repeatsSchema,
  needs_agm: z.boolean(),
  typed: z.boolean(),
  next: z.string().nullable(),
  checked_on: z.string(),
  rule_key: z.string().nullable(),
  source_url: z.string().nullable(),
  sources: z.array(sourceSchema),
  verified_on: z.string(),
  confirm_with: confirmRoleSchema.nullable(),
  confirmed: z.object({ name: z.string(), role: confirmRoleSchema, on: z.string() }).nullable(),
  from_fact: z.string().nullable(),
  needs: z.string().nullable(),
  earliest: z.string().nullable(),
});
export type DateSuggestion = z.infer<typeof suggestionSchema>;

export const datesPageSchema = ok.extend({
  view: z.enum(["upcoming", "all", "done", "rules"]),
  dates: z.array(keyDateSchema),
  counts: z.object({ upcoming: z.number(), done: z.number(), all: z.number() }),
  suggestions: z.array(suggestionSchema),
  hidden: z.array(z.object({ key: z.string(), title: z.string(), why: z.string() })),
  facts: z.object({ agm_on: z.string().nullable() }),
  facts_known: z.boolean(),
  checked_on: z.string(),
  files: z.array(z.object({ file_id: z.string(), title: z.string(), folder: z.string() })),
  files_here: z.boolean(),
  today: z.string(),
});
export type DatesPage = z.infer<typeof datesPageSchema>;

const dateAnswer = ok.extend({ date: keyDateSchema });

export const readDates = (view: "upcoming" | "all" | "done" | "rules" = "upcoming") =>
  dataAsk(datesPageSchema, "GET", `/data/dates?view=${view}`);

export const rulesPageSchema = ok.extend({
  rules: z.array(ruleViewSchema),
  counts: z.object({ all: z.number(), confirmed: z.number(), changed: z.number() }),
});
export type RulesPage = z.infer<typeof rulesPageSchema>;

const ruleAnswer = ok.extend({ rule: ruleViewSchema });

export const readRules = () => dataAsk(rulesPageSchema, "GET", "/data/dates/rules");

export const setRuleAmount = (key: string, amount: string | number, by: Staff) =>
  dataAsk(ruleAnswer, "POST", `/data/dates/rules/${id(key)}/amount`, { amount, by });

export type ConfirmInput = { name: string; role: string; on: string; contact_id?: string };

export const confirmRule = (key: string, input: ConfirmInput, by: Staff) =>
  dataAsk(ruleAnswer, "POST", `/data/dates/rules/${id(key)}/confirm`, { ...input, by });

export const unconfirmRule = (key: string, by: Staff) =>
  dataAsk(ruleAnswer, "POST", `/data/dates/rules/${id(key)}/unconfirm`, { by });

export const moveRuleDates = (key: string, by: Staff) =>
  dataAsk(ok.extend({ moved: z.number() }), "POST", `/data/dates/rules/${id(key)}/move`, { by });

export type DateFields = {
  title: string;
  kind: z.infer<typeof dateKindSchema>;
  due_on: string;
  repeats: z.infer<typeof repeatsSchema>;
  entity: string;
  handled_by: string;
  remind_days: number;
  notes: string;
  file_id: string;
};

export const addDate = (fields: DateFields, by: Staff, attempt: string) =>
  dataAsk(dateAnswer, "POST", "/data/dates", { ...fields, by, attempt });

export const updateDate = (
  dateId: string,
  fields: Partial<DateFields> & { state?: "coming_up" },
  by: Staff,
) => dataAsk(dateAnswer, "POST", `/data/dates/${id(dateId)}/update`, { ...fields, by });

/** What a "Done" keeps besides its note: the filing's evidence, and its filed copy. */
export type EvidenceInput = {
  srn?: string;
  challan?: string;
  filed_on?: string;
  fee_paid?: string | number;
} & ({ filed_file_id?: string } | { content: string; name: string });

export const doneDate = (dateId: string, note: string, by: Staff, evidence: EvidenceInput = {}) =>
  dataAsk(dateAnswer, "POST", `/data/dates/${id(dateId)}/done`, { ...evidence, note, by });

/** Who confirmed a filing does not apply: needed on a statutory date. */
export type SignOffInput = {
  sign_off_name: string;
  sign_off_role: string;
  sign_off_on: string;
  sign_off_contact_id?: string;
};

export const notForUsDate = (
  dateId: string,
  note: string,
  by: Staff,
  signOff: Partial<SignOffInput> = {},
) => dataAsk(dateAnswer, "POST", `/data/dates/${id(dateId)}/not-for-us`, { ...signOff, note, by });

export const markInProgress = (dateId: string, note: string, by: Staff) =>
  dataAsk(dateAnswer, "POST", `/data/dates/${id(dateId)}/in-progress`, { note, by });

export const setDateOwner = (
  dateId: string,
  input: { owner_role: string; handled_by?: string },
  by: Staff,
) => dataAsk(dateAnswer, "POST", `/data/dates/${id(dateId)}/owner`, { ...input, by });

export const recordSignOff = (dateId: string, input: SignOffInput, by: Staff) =>
  dataAsk(dateAnswer, "POST", `/data/dates/${id(dateId)}/sign-off`, { ...input, by });

export const deleteDate = (dateId: string, by: Staff) =>
  dataAsk(ok.extend({ deleted: z.string() }), "POST", `/data/dates/${id(dateId)}/delete`, { by });

export const addSuggestedDate = (
  key: string,
  input: { due_on?: string; agm_on?: string; entity?: string; handled_by?: string },
  by: Staff,
  attempt: string,
) => dataAsk(dateAnswer, "POST", `/data/dates/suggested/${id(key)}/add`, { ...input, by, attempt });

export const setDateFacts = (agmOn: string, by: Staff) =>
  dataAsk(
    ok.extend({ facts: z.object({ agm_on: z.string().nullable() }) }),
    "POST",
    "/data/dates/facts",
    { agm_on: agmOn, by },
  );
