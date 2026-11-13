import "server-only";

import { z } from "zod";

import { staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * Key dates: the filings, payments, board meetings and renewals he keeps, and the dates
 * suggested for an Indian private company. A suggestion is only a row until he adds it;
 * each one says when its rule was checked and to check it with the CA.
 */

export const dateKindSchema = z.enum(["filing", "tax", "board", "renewal", "other"]);
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
  state: z.enum(["coming_up", "done", "not_for_us"]),
  state_note: z.string(),
  history: z.array(
    z.object({ due_on: z.string(), done_at: z.string(), by: staffSchema, note: z.string() }),
  ),
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  shown_state: z.enum(["coming_up", "due_this_week", "done", "not_for_us"]),
  overdue: z.boolean(),
  reminding: z.boolean(),
  file: z.object({ file_id: z.string(), title: z.string() }).nullable(),
});
export type KeyDate = z.infer<typeof keyDateSchema>;

export const suggestionSchema = z.object({
  key: z.string(),
  title: z.string(),
  kind: dateKindSchema,
  group: z.enum(["monthly", "quarterly", "yearly", "renewal"]),
  rule: z.string(),
  applies: z.string(),
  repeats: repeatsSchema,
  needs_agm: z.boolean(),
  typed: z.boolean(),
  next: z.string().nullable(),
  checked_on: z.string(),
});
export type DateSuggestion = z.infer<typeof suggestionSchema>;

export const datesPageSchema = ok.extend({
  view: z.enum(["upcoming", "all", "done"]),
  dates: z.array(keyDateSchema),
  counts: z.object({ upcoming: z.number(), done: z.number(), all: z.number() }),
  suggestions: z.array(suggestionSchema),
  facts: z.object({ agm_on: z.string().nullable() }),
  checked_on: z.string(),
  files: z.array(z.object({ file_id: z.string(), title: z.string(), folder: z.string() })),
  files_here: z.boolean(),
  today: z.string(),
});
export type DatesPage = z.infer<typeof datesPageSchema>;

const dateAnswer = ok.extend({ date: keyDateSchema });

export const readDates = (view: "upcoming" | "all" | "done" = "upcoming") =>
  dataAsk(datesPageSchema, "GET", `/data/dates?view=${view}`);

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

export const doneDate = (dateId: string, note: string, by: Staff) =>
  dataAsk(dateAnswer, "POST", `/data/dates/${id(dateId)}/done`, { note, by });

export const notForUsDate = (dateId: string, note: string, by: Staff) =>
  dataAsk(dateAnswer, "POST", `/data/dates/${id(dateId)}/not-for-us`, { note, by });

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
