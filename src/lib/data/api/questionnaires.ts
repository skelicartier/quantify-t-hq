import "server-only";

import { z } from "zod";

import { staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * Questionnaires and the answer library (ws-notes/security/spec.md §9.5): approved answers
 * with their IDs, evidence and yearly look; buyers' questionnaires imported in two steps,
 * matched, answered and exported back with their own columns. Kept on this computer by the
 * local service; nothing here sends a questionnaire anywhere.
 */

export const shortSchema = z.enum(["", "yes", "no", "partly", "not_applicable"]);
export const ssrmSchema = z.enum([
  "",
  "csp_owned",
  "csc_owned",
  "third_party",
  "shared_csc",
  "shared_third_party",
]);
export const topicSchema = z.enum([
  "company",
  "access",
  "devices",
  "backups",
  "logging",
  "incidents",
  "policies",
  "suppliers",
  "development",
  "data_protection",
  "certification",
  "insurance",
  "other",
]);

export const evidenceOptionSchema = z.object({
  ref: z.string(),
  label: z.string(),
  href: z.string(),
  current: z.boolean(),
  why: z.string(),
});
export type EvidenceOptionView = z.infer<typeof evidenceOptionSchema>;

export const evidenceViewSchema = z.union([
  evidenceOptionSchema,
  z.object({ ref: z.string(), missing: z.string() }),
]);
export type EvidenceView = z.infer<typeof evidenceViewSchema>;

export const fileOptionSchema = z.object({
  file_id: z.string(),
  title: z.string(),
  folder: z.string(),
});

export const libraryAnswerSchema = z.object({
  answer_id: z.string(),
  question: z.string(),
  answer: z.string(),
  short: shortSchema,
  topic: topicSchema,
  caiq_ids: z.array(z.string()),
  other_ids: z.array(z.string()),
  ssrm: ssrmSchema,
  evidence: z.array(z.string()),
  owner: z.string(),
  state: z.enum(["draft", "approved", "archived"]),
  approved: z.object({ by_name: z.string(), on: z.string() }).nullable(),
  review_by: z.string().nullable(),
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
});
export type LibraryAnswer = z.infer<typeof libraryAnswerSchema>;

export const answerRowSchema = libraryAnswerSchema.extend({
  review_due: z.boolean(),
  evidence_lapsed: z.number(),
  evidence_missing: z.number(),
  used: z.number(),
});
export type AnswerRow = z.infer<typeof answerRowSchema>;

const topicOptionSchema = z.object({ key: z.string(), label: z.string() });

export const answersPageSchema = ok.extend({
  answers: z.array(answerRowSchema),
  counts: z.object({
    approved: z.number(),
    draft: z.number(),
    archived: z.number(),
    review_due: z.number(),
  }),
  topics: z.array(topicOptionSchema),
  evidence_options: z.array(evidenceOptionSchema),
  sources_absent: z.array(z.string()),
  files: z.array(fileOptionSchema),
  files_here: z.boolean(),
  review_months: z.number().nullable(),
  state: z.string(),
  topic: z.string(),
  q: z.string(),
  today: z.string(),
});
export type AnswersPage = z.infer<typeof answersPageSchema>;

const eventSchema = z.object({
  event_id: z.string(),
  target: z.string(),
  id: z.string(),
  verb: z.string(),
  detail: z.string(),
  by: staffSchema,
  at: z.string(),
});

export const answerPageSchema = ok.extend({
  answer: answerRowSchema,
  used_in: z.array(z.object({ questionnaire_id: z.string(), title: z.string(), row: z.number() })),
  evidence: z.array(evidenceViewSchema),
  events: z.array(eventSchema),
  topics: z.array(topicOptionSchema),
  evidence_options: z.array(evidenceOptionSchema),
  sources_absent: z.array(z.string()),
  files: z.array(fileOptionSchema),
  files_here: z.boolean(),
  review_months: z.number().nullable(),
  today: z.string(),
});
export type AnswerPage = z.infer<typeof answerPageSchema>;

export const questionAnswerSchema = z.object({
  short: shortSchema,
  text: z.string(),
  ssrm: ssrmSchema,
  answer_id: z.string().nullable(),
  at: z.string(),
  by: staffSchema,
});

export const suggestionSchema = z.object({
  answer_id: z.string(),
  score: z.number(),
  how: z.enum(["id", "likely", "possible"]),
});
export type Suggestion = z.infer<typeof suggestionSchema>;

export const questionViewSchema = z.object({
  row: z.number(),
  qid: z.string(),
  section: z.string(),
  text: z.string(),
  answer: questionAnswerSchema.nullable(),
  suggestions: z.array(suggestionSchema),
});
export type QuestionView = z.infer<typeof questionViewSchema>;

export const kindSchema = z.enum(["buyer", "caiq", "other"]);
export const questionnaireStateSchema = z.enum(["open", "sent", "closed"]);

export const questionnaireRowSchema = z.object({
  questionnaire_id: z.string(),
  title: z.string(),
  answered: z.number(),
  total: z.number(),
  state: questionnaireStateSchema,
  href: z.string(),
  kind: kindSchema,
  firm: z.string(),
  entry_id: z.string().nullable(),
  diligence_id: z.string().nullable(),
  received_on: z.string(),
  due_on: z.string().nullable(),
});
export type QuestionnaireRow = z.infer<typeof questionnaireRowSchema>;

export const firmOptionSchema = z.object({
  entry_id: z.string(),
  firm: z.string(),
  stage: z.string(),
  diligence_id: z.string().nullable(),
  due_on: z.string().nullable(),
});
export type FirmOption = z.infer<typeof firmOptionSchema>;

export const questionnairesPageSchema = ok.extend({
  questionnaires: z.array(questionnaireRowSchema),
  counts: z.object({ open: z.number(), sent: z.number(), closed: z.number() }),
  firms: z.array(firmOptionSchema),
  files_here: z.boolean(),
  state: z.string(),
  today: z.string(),
});
export type QuestionnairesPage = z.infer<typeof questionnairesPageSchema>;

export const columnMapSchema = z.object({
  id: z.number().nullable(),
  question: z.number(),
  section: z.number().nullable(),
  answer: z.number().nullable(),
  comment: z.number().nullable(),
  ssrm: z.number().nullable(),
});
export type ColumnMapView = z.infer<typeof columnMapSchema>;

export const questionnaireDetailSchema = z.object({
  questionnaire_id: z.string(),
  title: z.string(),
  kind: kindSchema,
  entry_id: z.string().nullable(),
  diligence_id: z.string().nullable(),
  firm: z.string(),
  source: z.object({
    file_id: z.string(),
    name: z.string(),
    format: z.enum(["csv", "xlsx"]),
    sheet: z.string().nullable(),
    header_row: z.number(),
    columns: z.array(z.string()),
  }),
  map: columnMapSchema,
  due_on: z.string().nullable(),
  received_on: z.string(),
  sent: z
    .object({
      on: z.string(),
      how: z.string(),
      file_id: z.string().nullable(),
      by_name: z.string(),
    })
    .nullable(),
  kept: z.array(z.object({ file_id: z.string(), format: z.enum(["csv", "xlsx"]), at: z.string() })),
  state: questionnaireStateSchema,
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
  href: z.string(),
  due: z.string().nullable(),
  diligence: z
    .object({
      diligence_id: z.string(),
      entry_id: z.string(),
      firm: z.string(),
      state: z.enum(["open", "closed"]),
      due_on: z.string().nullable(),
      received_on: z.string().nullable(),
      answered_on: z.string().nullable(),
    })
    .nullable(),
});
export type QuestionnaireDetail = z.infer<typeof questionnaireDetailSchema>;

export const libraryLineSchema = z.object({
  answer_id: z.string(),
  question: z.string(),
  short: shortSchema,
  answer: z.string(),
  ssrm: ssrmSchema,
  state: z.enum(["draft", "approved", "archived"]),
  review_by: z.string().nullable(),
  review_due: z.boolean(),
  href: z.string(),
});
export type LibraryLine = z.infer<typeof libraryLineSchema>;

export const questionnairePageSchema = ok.extend({
  questionnaire: questionnaireDetailSchema,
  questions: z.array(questionViewSchema),
  counts: z.object({
    total: z.number(),
    answered: z.number(),
    by_id: z.number(),
    likely: z.number(),
    unanswered: z.number(),
  }),
  library: z.array(libraryLineSchema),
  files: z.array(fileOptionSchema),
  files_here: z.boolean(),
  show: z.enum(["all", "unanswered", "suggested"]),
  today: z.string(),
});
export type QuestionnairePage = z.infer<typeof questionnairePageSchema>;

const guessSchema = z.object({
  id: z.number().nullable(),
  question: z.number().nullable(),
  section: z.number().nullable(),
  answer: z.number().nullable(),
  comment: z.number().nullable(),
  ssrm: z.number().nullable(),
});

export const previewSchema = ok.extend({
  import_id: z.string(),
  name: z.string(),
  format: z.enum(["csv", "xlsx"]),
  sheets: z.array(z.object({ name: z.string(), rows: z.number() })),
  sheet: z.string().nullable(),
  header_row: z.number(),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  guess: guessSchema,
  questions: z.number(),
  notes: z.array(z.string()),
});
export type QuestionnairePreview = z.infer<typeof previewSchema>;

const answerAnswer = ok.extend({ answer: libraryAnswerSchema });
const rowAnswer = ok.extend({ questionnaire: questionnaireRowSchema });
const questionAnswer = ok.extend({ question: z.object({ row: z.number() }).passthrough() });

// ------------------------------------------------------------------ the library

export const readAnswers = (filters: { state?: string; topic?: string; q?: string } = {}) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
  const text = query.toString();
  return dataAsk(answersPageSchema, "GET", `/data/answers${text ? `?${text}` : ""}`);
};

export const readAnswer = (answerId: string) =>
  dataAsk(answerPageSchema, "GET", `/data/answers/${id(answerId)}`);

export type AnswerInput = {
  question: string;
  answer: string;
  short: string;
  topic: string;
  caiq_ids: string;
  other_ids: string;
  ssrm: string;
  evidence: string[];
  owner: string;
  review_by?: string;
};

export const addAnswer = (input: AnswerInput, by: Staff, attempt: string) =>
  dataAsk(answerAnswer, "POST", "/data/answers", { ...input, by, attempt });

export const updateAnswer = (answerId: string, input: AnswerInput, by: Staff) =>
  dataAsk(answerAnswer, "POST", `/data/answers/${id(answerId)}/update`, { ...input, by });

export const approveAnswer = (
  answerId: string,
  input: { by_name: string; on: string; review_by: string },
  by: Staff,
) => dataAsk(answerAnswer, "POST", `/data/answers/${id(answerId)}/approve`, { ...input, by });

export const archiveAnswer = (answerId: string, by: Staff) =>
  dataAsk(answerAnswer, "POST", `/data/answers/${id(answerId)}/archive`, { by });

export const restoreAnswer = (answerId: string, by: Staff) =>
  dataAsk(answerAnswer, "POST", `/data/answers/${id(answerId)}/restore`, { by });

export const saveAnswerSetup = (reviewMonths: string, by: Staff) =>
  dataAsk(
    ok.extend({ setup: z.object({ review_months: z.number().nullable() }) }),
    "POST",
    "/data/answers/setup",
    { review_months: reviewMonths, by },
  );

// ------------------------------------------------------------------ questionnaires

export const readQuestionnaires = (state = "") =>
  dataAsk(
    questionnairesPageSchema,
    "GET",
    `/data/questionnaires${state ? `?state=${encodeURIComponent(state)}` : ""}`,
  );

export const readQuestionnaire = (questionnaireId: string, show = "") =>
  dataAsk(
    questionnairePageSchema,
    "GET",
    `/data/questionnaires/${id(questionnaireId)}${show ? `?show=${encodeURIComponent(show)}` : ""}`,
  );

export const previewQuestionnaire = (
  input:
    | { content: string; name: string; sheet?: string; header_row?: string }
    | { import_id: string; sheet?: string; header_row?: string },
  by: Staff,
) => dataAsk(previewSchema, "POST", "/data/questionnaires/preview", { ...input, by });

export type ImportInput = {
  import_id: string;
  map: Record<string, number | null>;
  header_row: string;
  sheet: string;
  title: string;
  kind: string;
  entry_id: string;
  diligence_id: string;
  due_on: string;
  received_on: string;
};

export const importQuestionnaire = (input: ImportInput, by: Staff, attempt: string) =>
  dataAsk(rowAnswer, "POST", "/data/questionnaires", { ...input, by, attempt });

export const answerQuestion = (
  questionnaireId: string,
  row: number,
  input: { answer_id: string } | { short: string; text: string; ssrm: string },
  by: Staff,
) =>
  dataAsk(
    questionAnswer,
    "POST",
    `/data/questionnaires/${id(questionnaireId)}/questions/${row}/answer`,
    { ...input, by },
  );

export const clearQuestion = (questionnaireId: string, row: number, by: Staff) =>
  dataAsk(
    questionAnswer,
    "POST",
    `/data/questionnaires/${id(questionnaireId)}/questions/${row}/clear`,
    { by },
  );

export const questionToLibrary = (questionnaireId: string, row: number, by: Staff) =>
  dataAsk(
    questionAnswer.extend({ answer: libraryAnswerSchema }),
    "POST",
    `/data/questionnaires/${id(questionnaireId)}/questions/${row}/to-library`,
    { by },
  );

export const acceptById = (questionnaireId: string, by: Staff) =>
  dataAsk(
    ok.extend({ accepted: z.number() }),
    "POST",
    `/data/questionnaires/${id(questionnaireId)}/accept-by-id`,
    { by },
  );

export const keepQuestionnaireCopy = (questionnaireId: string, format: string, by: Staff) =>
  dataAsk(
    rowAnswer.extend({ file_id: z.string() }),
    "POST",
    `/data/questionnaires/${id(questionnaireId)}/keep`,
    { format, by },
  );

export const markQuestionnaireSent = (
  questionnaireId: string,
  input: { on: string; how: string; file_id: string },
  by: Staff,
) =>
  dataAsk(rowAnswer, "POST", `/data/questionnaires/${id(questionnaireId)}/sent`, { ...input, by });

export const closeQuestionnaire = (questionnaireId: string, by: Staff) =>
  dataAsk(rowAnswer, "POST", `/data/questionnaires/${id(questionnaireId)}/close`, { by });

export const reopenQuestionnaire = (questionnaireId: string, by: Staff) =>
  dataAsk(rowAnswer, "POST", `/data/questionnaires/${id(questionnaireId)}/reopen`, { by });

export const updateQuestionnaire = (
  questionnaireId: string,
  input: { title: string; due_on: string },
  by: Staff,
) =>
  dataAsk(rowAnswer, "POST", `/data/questionnaires/${id(questionnaireId)}/update`, {
    ...input,
    by,
  });
