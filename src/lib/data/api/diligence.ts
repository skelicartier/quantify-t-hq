import "server-only";

import { z } from "zod";

import { agreementViewSchema } from "@/lib/data/api/pilots";
import { staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * Buyer diligence and Labs dataset trials (ws-notes/company/spec.md §9.8): questionnaires,
 * security reviews, references (shared only with consent), redlines, and trials that are
 * cleared before data goes and never renew on their own. Kept on this computer.
 */

export const referenceSchema = z.object({
  reference_id: z.string(),
  name: z.string(),
  firm: z.string(),
  role: z.string(),
  consent_on: z.string().nullable(),
  shared_on: z.string().nullable(),
  outcome: z.string(),
});
export type Reference = z.infer<typeof referenceSchema>;

export const redlineSchema = z.object({
  redline_id: z.string(),
  document: z.string(),
  agreement_id: z.string().nullable(),
  round: z.number(),
  sent_on: z.string().nullable(),
  received_on: z.string().nullable(),
  status: z.enum(["with_us", "with_them", "agreed"]),
  file_id: z.string().nullable(),
});
export type Redline = z.infer<typeof redlineSchema>;

export const diligenceSchema = z.object({
  diligence_id: z.string(),
  entry_id: z.string(),
  firm: z.string(),
  state: z.enum(["open", "closed"]),
  questionnaire: z.object({
    received_on: z.string().nullable(),
    due_on: z.string().nullable(),
    answered_on: z.string().nullable(),
    questions: z.number().nullable(),
    file_id: z.string().nullable(),
    answers_file_id: z.string().nullable(),
  }),
  security_review: z.object({
    started_on: z.string().nullable(),
    finished_on: z.string().nullable(),
    outcome: z.enum(["passed", "conditions", "failed", ""]),
    note: z.string(),
  }),
  references: z.array(referenceSchema),
  redlines: z.array(redlineSchema),
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
});
export type Diligence = z.infer<typeof diligenceSchema>;

export const trialSchema = z.object({
  trial_id: z.string(),
  entry_id: z.string(),
  firm: z.string(),
  dataset: z.string(),
  dictionary_version: z.string(),
  compliance: z.object({ cleared_on: z.string().nullable(), by_name: z.string() }),
  sample: z.object({ sent_on: z.string(), file_id: z.string().nullable() }).nullable(),
  starts_on: z.string().nullable(),
  ends_on: z.string().nullable(),
  go_no_go_on: z.string().nullable(),
  decision: z
    .object({
      outcome: z.enum(["go", "no_go"]),
      on: z.string(),
      note: z.string(),
      by: staffSchema,
    })
    .nullable(),
  auto_renews: z.literal(false),
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
});
export type Trial = z.infer<typeof trialSchema>;

export const diligenceRowSchema = diligenceSchema.extend({ entry_stage: z.string().nullable() });
export type DiligenceRow = z.infer<typeof diligenceRowSchema>;
export const trialRowSchema = trialSchema.extend({ entry_stage: z.string().nullable() });
export type TrialRow = z.infer<typeof trialRowSchema>;

export const diligencePageSchema = ok.extend({
  diligence: z.array(diligenceRowSchema),
  trials: z.array(trialRowSchema),
  counts: z.object({
    open: z.number(),
    closed: z.number(),
    trials: z.number(),
    trials_open: z.number(),
  }),
  today: z.string(),
});
export type DiligencePage = z.infer<typeof diligencePageSchema>;

export const entryDiligenceSchema = ok.extend({
  diligence: diligenceSchema.nullable(),
  closed: z.number(),
  trials: z.array(trialSchema),
  agreements: z.array(agreementViewSchema).nullable(),
  today: z.string(),
});
export type EntryDiligence = z.infer<typeof entryDiligenceSchema>;

const diligenceAnswer = ok.extend({ diligence: diligenceSchema });
const trialAnswer = ok.extend({ trial: trialSchema });

/** A copy to keep: a file already in Files, or the bytes of a new one. */
export type CopyInput = { file_id: string } | { content: string; name: string } | null;

function copyFields(copy: CopyInput, prefix = ""): Record<string, string> {
  if (!copy) return {};
  return "file_id" in copy
    ? { [`${prefix}file_id`]: copy.file_id }
    : { [`${prefix}content`]: copy.content, [`${prefix}name`]: copy.name };
}

export const readDiligence = () => dataAsk(diligencePageSchema, "GET", "/data/diligence");

export const readEntryDiligence = (entryId: string) =>
  dataAsk(entryDiligenceSchema, "GET", `/data/diligence/for-entry/${id(entryId)}`);

export const openDiligence = (entryId: string, by: Staff, attempt: string) =>
  dataAsk(diligenceAnswer, "POST", "/data/diligence", { entry_id: entryId, by, attempt });

export const saveQuestionnaire = (
  diligenceId: string,
  input: {
    received_on: string;
    due_on: string;
    answered_on: string;
    questions: string;
    file: CopyInput;
    answers: CopyInput;
  },
  by: Staff,
) =>
  dataAsk(diligenceAnswer, "POST", `/data/diligence/${id(diligenceId)}/questionnaire`, {
    received_on: input.received_on,
    due_on: input.due_on,
    answered_on: input.answered_on,
    questions: input.questions,
    ...copyFields(input.file),
    ...copyFields(input.answers, "answers_"),
    by,
  });

export const saveSecurityReview = (
  diligenceId: string,
  input: { started_on: string; finished_on: string; outcome: string; note: string },
  by: Staff,
) =>
  dataAsk(diligenceAnswer, "POST", `/data/diligence/${id(diligenceId)}/security-review`, {
    ...input,
    by,
  });

export type ReferenceInput = {
  name: string;
  firm: string;
  role: string;
  consent_on: string;
  shared_on: string;
  outcome: string;
};

export const addReference = (diligenceId: string, input: ReferenceInput, by: Staff) =>
  dataAsk(diligenceAnswer, "POST", `/data/diligence/${id(diligenceId)}/references`, {
    ...input,
    by,
  });

export const updateReference = (
  diligenceId: string,
  referenceId: string,
  input: ReferenceInput,
  by: Staff,
) =>
  dataAsk(
    diligenceAnswer,
    "POST",
    `/data/diligence/${id(diligenceId)}/references/${id(referenceId)}/update`,
    { ...input, by },
  );

export type RedlineInput = {
  document: string;
  agreement_id: string;
  round: string;
  sent_on: string;
  received_on: string;
  status: string;
  file: CopyInput;
};

const redlineBody = (input: RedlineInput) => ({
  document: input.document,
  agreement_id: input.agreement_id,
  round: input.round,
  sent_on: input.sent_on,
  received_on: input.received_on,
  status: input.status,
  ...copyFields(input.file),
});

export const addRedline = (diligenceId: string, input: RedlineInput, by: Staff) =>
  dataAsk(diligenceAnswer, "POST", `/data/diligence/${id(diligenceId)}/redlines`, {
    ...redlineBody(input),
    by,
  });

export const updateRedline = (
  diligenceId: string,
  redlineId: string,
  input: RedlineInput,
  by: Staff,
) =>
  dataAsk(
    diligenceAnswer,
    "POST",
    `/data/diligence/${id(diligenceId)}/redlines/${id(redlineId)}/update`,
    { ...redlineBody(input), by },
  );

export const closeDiligence = (diligenceId: string, by: Staff) =>
  dataAsk(diligenceAnswer, "POST", `/data/diligence/${id(diligenceId)}/close`, { by });

export const reopenDiligence = (diligenceId: string, by: Staff) =>
  dataAsk(diligenceAnswer, "POST", `/data/diligence/${id(diligenceId)}/reopen`, { by });

export type TrialInput = {
  dataset: string;
  dictionary_version: string;
  starts_on: string;
  ends_on: string;
  go_no_go_on: string;
};

export const addTrial = (entryId: string, input: TrialInput, by: Staff, attempt: string) =>
  dataAsk(trialAnswer, "POST", "/data/trials", { entry_id: entryId, ...input, by, attempt });

export const updateTrial = (trialId: string, input: TrialInput, by: Staff) =>
  dataAsk(trialAnswer, "POST", `/data/trials/${id(trialId)}/update`, { ...input, by });

export const recordClearance = (
  trialId: string,
  input: { cleared_on: string; by_name: string },
  by: Staff,
) => dataAsk(trialAnswer, "POST", `/data/trials/${id(trialId)}/clearance`, { ...input, by });

export const sendSample = (
  trialId: string,
  input: { sent_on: string; file: CopyInput },
  by: Staff,
) =>
  dataAsk(trialAnswer, "POST", `/data/trials/${id(trialId)}/sample`, {
    sent_on: input.sent_on,
    ...copyFields(input.file),
    by,
  });

export const recordTrialDecision = (
  trialId: string,
  input: { outcome: string; on: string; note: string },
  by: Staff,
) => dataAsk(trialAnswer, "POST", `/data/trials/${id(trialId)}/decision`, { ...input, by });
