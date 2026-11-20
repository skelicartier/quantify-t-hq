/**
 * U4's own seam between diligence and questionnaires (ws-notes/security/spec.md §9.6), not in
 * the contract: the diligence module provides `diligence-questionnaire` so an imported
 * questionnaire can fill in its diligence's count and received day, and marking it sent can
 * record the answered day and the copy; the questionnaires module's `questionnaires` service
 * also answers `forDiligence`, so the diligence's Due row and list can carry the count. Each
 * side reads the other at request time and does without it when it is absent.
 */

import type { QuestionnaireLine, QuestionnairesLookup } from "../security-contracts";
import type { Staff } from "../protocol";

export const DILIGENCE_QUESTIONNAIRE = "diligence-questionnaire";

export type DiligenceQuestionnaireView = {
  diligence_id: string;
  entry_id: string;
  firm: string;
  state: "open" | "closed";
  due_on: string | null;
  received_on: string | null;
  answered_on: string | null;
};

export type DiligenceQuestionnaire = {
  /** The firm's open diligence, or null. */
  openFor(entryId: string): DiligenceQuestionnaireView | null;
  get(diligenceId: string): DiligenceQuestionnaireView | null;
  /** An import linked to it: the count and the received day, each only when empty; the file likewise. */
  imported(
    diligenceId: string,
    input: { questions: number; received_on: string; file_id: string | null },
    by: Staff,
  ): void;
  /** Marked as sent: the answered day, and the copy kept, when one was. */
  sent(diligenceId: string, input: { on: string; file_id: string | null }, by: Staff): void;
};

/** The questionnaires service as diligence reads it: the linked questionnaire's count. */
export type QuestionnairesForDiligence = QuestionnairesLookup & {
  forDiligence?: (diligenceId: string) => QuestionnaireLine | null;
};
