import "server-only";

import { z } from "zod";

import { flagSchema } from "@/lib/data/api/company";
import { staffSchema } from "@/lib/data/api/replies";
import {
  dutyReadingSchema,
  fileChoiceSchema,
  fileLinkSchema,
  ruleLineSchema,
} from "@/lib/data/api/registers";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * Trademarks (ws-notes/duties/spec.md §6.4, §6.6): one record per mark and class, its dates
 * worked out from the rule book with each rule's line, the startup fee compared only once a
 * reading is confirmed, renewals, watch notes and papers in Files.
 */

export const markStatusSchema = z.enum([
  "drafting",
  "filed",
  "vienna",
  "formalities_pass",
  "formalities_fail",
  "marked_for_exam",
  "objected",
  "show_cause_hearing",
  "accepted",
  "advertised_before_accepted",
  "accepted_and_advertised",
  "opposed",
  "registered",
  "refused",
  "abandoned",
  "withdrawn",
  "removed",
]);
export type MarkStatus = z.infer<typeof markStatusSchema>;

export const markClockKeySchema = z.enum([
  "deficiency",
  "exam_reply",
  "hearing",
  "opposition",
  "counter_statement",
  "expiry",
  "renewal_opens",
  "late_renewal_ends",
  "restoration_ends",
]);

export const markRowSchema = z.object({
  mark_id: z.string(),
  name: z.string(),
  kind: z.enum(["word", "device", "combined"]),
  class_number: z.number(),
  goods: z.string(),
  application_number: z.string(),
  applied_on: z.string().nullable(),
  applicant: z.string(),
  agent: z.string(),
  agent_contact_id: z.string().nullable(),
  filed_as_startup: flagSchema,
  fee_paid: z.number().nullable(),
  status: markStatusSchema,
  status_on: z.string().nullable(),
  steps: z.object({
    deficiency_notice_on: z.string().nullable(),
    deficiency_fixed_on: z.string().nullable(),
    exam_report_on: z.string().nullable(),
    exam_reply_on: z.string().nullable(),
    hearing_on: z.string().nullable(),
    journal_number: z.string(),
    journal_on: z.string().nullable(),
    opposition_notice_on: z.string().nullable(),
    counter_statement_on: z.string().nullable(),
    registered_on: z.string().nullable(),
    certificate_number: z.string(),
    expires_on: z.string().nullable(),
  }),
  renewals: z.array(
    z.object({
      renewed_on: z.string(),
      expires_on: z.string(),
      srn: z.string(),
      by: staffSchema,
      at: z.string(),
    }),
  ),
  watch: z.array(
    z.object({
      note_id: z.string(),
      on: z.string(),
      text: z.string(),
      by: staffSchema,
      at: z.string(),
    }),
  ),
  file_ids: z.array(z.string()),
  notes: z.string(),
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
  status_label: z.string(),
  expires_on_now: z.string().nullable(),
  next: z.object({ key: markClockKeySchema, on: z.string(), words: z.string() }).nullable(),
});
export type MarkRow = z.infer<typeof markRowSchema>;

export const markClockSchema = z.object({
  key: markClockKeySchema,
  title: z.string(),
  base_on: z.string().nullable(),
  due_on: z.string().nullable(),
  done: z.boolean(),
  open: z.boolean(),
  rule: ruleLineSchema.nullable(),
});
export type MarkClock = z.infer<typeof markClockSchema>;

const feeSchema = z.object({
  rule: ruleLineSchema.nullable(),
  readings: z.array(dutyReadingSchema),
});

export const marksPageSchema = ok.extend({
  marks: z.array(markRowSchema),
  counts: z.object({ all: z.number(), live: z.number() }),
  fee: feeSchema,
  rules_here: z.boolean(),
  today: z.string(),
});
export type MarksPage = z.infer<typeof marksPageSchema>;

export const markPageSchema = ok.extend({
  mark: markRowSchema,
  clocks: z.array(markClockSchema),
  fee_check: z.object({ words: z.string().nullable(), rule: ruleLineSchema.nullable() }).nullable(),
  fee: feeSchema,
  renewal_expires_on: z.string().nullable(),
  events: z.array(
    z.object({
      event_id: z.string(),
      mark_id: z.string(),
      verb: z.string(),
      detail: z.string(),
      by: staffSchema,
      at: z.string(),
    }),
  ),
  files: z.array(z.object({ file_id: z.string(), file: fileLinkSchema.nullable() })),
  file_choices: z.array(fileChoiceSchema),
  files_here: z.boolean(),
  rules_here: z.boolean(),
  today: z.string(),
});
export type MarkPage = z.infer<typeof markPageSchema>;

const markAnswer = ok.extend({ mark: markRowSchema });

type Fields = Record<string, string>;

export const readMarks = () => dataAsk(marksPageSchema, "GET", "/data/marks");

export const readMark = (markId: string) =>
  dataAsk(markPageSchema, "GET", `/data/marks/${id(markId)}`);

export const addMark = (input: Fields, by: Staff, attempt: string) =>
  dataAsk(markAnswer, "POST", "/data/marks", { ...input, by, attempt });

export const updateMark = (markId: string, input: Fields, by: Staff) =>
  dataAsk(markAnswer, "POST", `/data/marks/${id(markId)}/update`, { ...input, by });

export const recordMarkStep = (
  markId: string,
  input: { step: string; on: string; number?: string },
  by: Staff,
) => dataAsk(markAnswer, "POST", `/data/marks/${id(markId)}/step`, { ...input, by });

export const setMarkStatus = (markId: string, input: { status: string; on: string }, by: Staff) =>
  dataAsk(markAnswer, "POST", `/data/marks/${id(markId)}/status`, { ...input, by });

export const recordRenewal = (
  markId: string,
  input: { renewed_on: string; expires_on: string; srn: string },
  by: Staff,
) => dataAsk(markAnswer, "POST", `/data/marks/${id(markId)}/renewed`, { ...input, by });

export const addWatchNote = (
  markId: string,
  input: { text: string; on: string },
  by: Staff,
  attempt: string,
) => dataAsk(markAnswer, "POST", `/data/marks/${id(markId)}/watch`, { ...input, by, attempt });

export const markFiles = (
  markId: string,
  input: { file_id?: string; content?: string; name?: string; detach?: boolean },
  by: Staff,
) => dataAsk(markPageSchema, "POST", `/data/marks/${id(markId)}/files`, { ...input, by });
