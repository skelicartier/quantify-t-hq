/**
 * The answer library and buyers' questionnaires (ws-notes/security/spec.md §9.2). The library
 * keeps the HQ service's answer names (`src/lib/api/trust.ts`: `answer_id`, `question`,
 * `answer`, `topic`, `evidence`, `owner_name` ↔ `owner`, `state`, `approved_by_name` and
 * `approved_at` ↔ `approved`, `review_due` ↔ `review_by`), so a later move maps field for field.
 * Nothing here touches a file.
 */

import type { Staff } from "../protocol";

export const ANSWER_TOPICS = [
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
] as const;
export type AnswerTopic = (typeof ANSWER_TOPICS)[number];

/** CAIQ v4's shared-responsibility column, as CSA's own guide names its five values. */
export const SSRM_VALUES = [
  "",
  "csp_owned",
  "csc_owned",
  "third_party",
  "shared_csc",
  "shared_third_party",
] as const;
export type Ssrm = (typeof SSRM_VALUES)[number];

export const SHORT_ANSWERS = ["", "yes", "no", "partly", "not_applicable"] as const;
export type ShortAnswer = (typeof SHORT_ANSWERS)[number];

export type LibraryAnswer = {
  answer_id: string;
  /** His canonical wording. */
  question: string;
  answer: string;
  short: ShortAnswer;
  topic: AnswerTopic;
  caiq_ids: string[];
  /** SIG or a buyer's own, as typed. */
  other_ids: string[];
  ssrm: Ssrm;
  /** EvidenceOption refs, or "file:<file_id>". */
  evidence: string[];
  owner: string;
  state: "draft" | "approved" | "archived";
  approved: { by_name: string; on: string } | null;
  review_by: string | null;
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
};

export type QuestionAnswer = {
  short: ShortAnswer;
  text: string;
  ssrm: Ssrm;
  /** The library answer it came from. */
  answer_id: string | null;
  at: string;
  by: Staff;
};

export type Question = {
  /** Its row in the sheet, 1-based. */
  row: number;
  qid: string;
  section: string;
  text: string;
  /** The whole row as read. */
  cells: string[];
  answer: QuestionAnswer | null;
};

export type ColumnMap = {
  id: number | null;
  question: number;
  section: number | null;
  /** Where the short answer (or the answer) goes. */
  answer: number | null;
  /** Where the text goes when both are mapped. */
  comment: number | null;
  ssrm: number | null;
};

export type QuestionnaireKind = "buyer" | "caiq" | "other";

export type Questionnaire = {
  questionnaire_id: string;
  /** "Walk Capital's security questionnaire". */
  title: string;
  kind: QuestionnaireKind;
  /** The waitlist firm; null for the CAIQ. */
  entry_id: string | null;
  diligence_id: string | null;
  firm: string;
  source: {
    /** The file as received, in Files. */
    file_id: string;
    name: string;
    format: "csv" | "xlsx";
    sheet: string | null;
    header_row: number;
    /** The header row's cells. */
    columns: string[];
  };
  map: ColumnMap;
  questions: Question[];
  /**
   * The rows after the header that hold no question (a section's heading, a note), as read,
   * so the export keeps their rows. Not in §9.2's shape; added so "every row as read" holds.
   */
  other_rows: { row: number; cells: string[] }[];
  /** Only when not linked to a diligence. */
  due_on: string | null;
  received_on: string;
  sent: { on: string; how: string; file_id: string | null; by_name: string } | null;
  /** The copies kept in Files with "Keep a copy in Files", newest last. */
  kept: { file_id: string; format: "csv" | "xlsx"; at: string }[];
  state: "open" | "sent" | "closed";
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
};

export type QuestionnaireEvent = {
  event_id: string;
  target: "answer" | "questionnaire" | "setup";
  id: string;
  verb: string;
  detail: string;
  by: Staff;
  at: string;
};
