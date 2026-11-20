"use server";

import { redirect } from "next/navigation";

import { attemptOf, routeIdOf } from "@/components/data/closing/form-copy";
import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/questionnaires";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * Questionnaires' writes (ws-notes/security/spec.md §9.5, §9.7): the two-step import, an answer
 * from the library or typed, accept the matches by ID, save a typed answer to the library, keep
 * a copy in Files, mark as sent (which records what he did: nothing is sent from here), close
 * and reopen. Every one is `gate()` first and passes the service's own sentence back.
 */

const BASE = "/data/waitlist/diligence/questionnaires";
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const NOT_HERE: ActionState = { status: "error", message: "That questionnaire is not here." };

function refreshQuestionnaire(questionnaireId: string, entryId = ""): void {
  refreshData(
    BASE,
    "/data/waitlist/diligence",
    "/data/waitlist/diligence/answers",
    "/data/files",
    ...(questionnaireId ? [`${BASE}/${questionnaireId}`] : []),
    ...(entryId ? [`/data/waitlist/${entryId}`] : []),
  );
}

const rowOf = (formData: FormData): number => {
  const value = Number(fieldValue(formData, "row", 8));
  return Number.isInteger(value) && value > 0 ? value : 0;
};

/** Step 1, and any read again with another sheet or header row: the preview travels back as JSON. */
export async function previewQuestionnaireAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, `${BASE}/new`);
  if (refused(context)) return context;
  const importId = fieldValue(formData, "import_id", 64);
  const sheet = fieldValue(formData, "sheet", 64);
  const headerRow = fieldValue(formData, "header_row", 6);
  const step = {
    kind: fieldValue(formData, "kind", 10) || "buyer",
    entry_id: routeIdOf(formData, "entry_id"),
  };
  let input: Parameters<typeof api.previewQuestionnaire>[0];
  if (importId) {
    input = {
      import_id: importId,
      ...(sheet ? { sheet } : {}),
      ...(headerRow ? { header_row: headerRow } : {}),
    };
  } else {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0)
      return { status: "error", message: "Choose their file: a CSV or an .xlsx workbook." };
    if (file.size > MAX_FILE_BYTES)
      return {
        status: "error",
        message:
          "That file is over 3 MB. Save the questionnaire's sheet on its own as .xlsx or CSV.",
      };
    input = {
      content: Buffer.from(await file.arrayBuffer()).toString("base64"),
      name: file.name.slice(0, 200),
    };
  }
  try {
    const preview = await api.previewQuestionnaire(input, staffOf(context));
    return { status: "idle", message: null, detail: JSON.stringify({ step, preview }) };
  } catch (error) {
    return refusal(error);
  }
}

const columnOf = (formData: FormData, name: string): number | null => {
  const value = fieldValue(formData, name, 4);
  if (value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
};

/** Step 2: the questionnaire is made, its file kept in Files; the page goes to it. */
export async function importQuestionnaireAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, `${BASE}/new`);
  if (refused(context)) return context;
  let made: Awaited<ReturnType<typeof api.importQuestionnaire>>;
  try {
    made = await api.importQuestionnaire(
      {
        import_id: fieldValue(formData, "import_id", 64),
        map: {
          id: columnOf(formData, "map_id"),
          question: columnOf(formData, "map_question"),
          section: columnOf(formData, "map_section"),
          answer: columnOf(formData, "map_answer"),
          comment: columnOf(formData, "map_comment"),
          ssrm: columnOf(formData, "map_ssrm"),
        },
        header_row: fieldValue(formData, "header_row", 6),
        sheet: fieldValue(formData, "sheet", 64),
        title: fieldValue(formData, "title", 200).trim(),
        kind: fieldValue(formData, "kind", 10),
        entry_id: routeIdOf(formData, "entry_id"),
        diligence_id: "",
        due_on: fieldValue(formData, "due_on", 10).trim(),
        received_on: fieldValue(formData, "received_on", 10).trim(),
      },
      staffOf(context),
      attemptOf(formData),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshQuestionnaire(made.questionnaire.questionnaire_id, made.questionnaire.entry_id ?? "");
  redirect(`${BASE}/${made.questionnaire.questionnaire_id}`);
}

/** "Use this" (an approved answer from the library), or "Answer" (typed). */
export async function answerQuestionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = routeIdOf(formData, "questionnaire_id");
  const context = await gate(formData, `${BASE}/${id}`);
  if (refused(context)) return context;
  const row = rowOf(formData);
  if (!id || !row) return NOT_HERE;
  const answerId = routeIdOf(formData, "answer_id");
  try {
    await api.answerQuestion(
      id,
      row,
      answerId
        ? { answer_id: answerId }
        : {
            short: fieldValue(formData, "short", 20),
            text: fieldValue(formData, "text", 4_000).trim(),
            ssrm: fieldValue(formData, "ssrm", 30),
          },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshQuestionnaire(id, routeIdOf(formData, "entry_id"));
  return sent("Answered.");
}

export async function clearQuestionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = routeIdOf(formData, "questionnaire_id");
  const context = await gate(formData, `${BASE}/${id}`);
  if (refused(context)) return context;
  const row = rowOf(formData);
  if (!id || !row) return NOT_HERE;
  try {
    await api.clearQuestion(id, row, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshQuestionnaire(id, routeIdOf(formData, "entry_id"));
  return sent("Cleared.");
}

/** "Save to the library": a draft library answer from a typed one. */
export async function toLibraryAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = routeIdOf(formData, "questionnaire_id");
  const context = await gate(formData, `${BASE}/${id}`);
  if (refused(context)) return context;
  const row = rowOf(formData);
  if (!id || !row) return NOT_HERE;
  try {
    await api.questionToLibrary(id, row, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshQuestionnaire(id);
  return sent("Saved to the library as a draft.");
}

export async function acceptByIdAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = routeIdOf(formData, "questionnaire_id");
  const context = await gate(formData, `${BASE}/${id}`);
  if (refused(context)) return context;
  if (!id) return NOT_HERE;
  let accepted = 0;
  try {
    accepted = (await api.acceptById(id, staffOf(context))).accepted;
  } catch (error) {
    return refusal(error);
  }
  refreshQuestionnaire(id, routeIdOf(formData, "entry_id"));
  return sent(
    accepted === 1
      ? "Accepted 1 match by ID."
      : `Accepted ${accepted.toLocaleString("en-GB")} matches by ID.`,
  );
}

export async function keepCopyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = routeIdOf(formData, "questionnaire_id");
  const context = await gate(formData, `${BASE}/${id}`);
  if (refused(context)) return context;
  if (!id) return NOT_HERE;
  try {
    await api.keepQuestionnaireCopy(
      id,
      fieldValue(formData, "format", 8) || "xlsx",
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshQuestionnaire(id);
  return sent("A copy is kept in Files.");
}

/** Records that he sent it (on, how, the kept copy). HQ never sends it. */
export async function markSentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = routeIdOf(formData, "questionnaire_id");
  const context = await gate(formData, `${BASE}/${id}`);
  if (refused(context)) return context;
  if (!id) return NOT_HERE;
  try {
    await api.markQuestionnaireSent(
      id,
      {
        on: fieldValue(formData, "on", 10).trim(),
        how: fieldValue(formData, "how", 200).trim(),
        file_id: routeIdOf(formData, "file_id"),
      },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshQuestionnaire(id, routeIdOf(formData, "entry_id"));
  return sent("Recorded as sent.");
}

export async function closeQuestionnaireAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = routeIdOf(formData, "questionnaire_id");
  const context = await gate(formData, `${BASE}/${id}`);
  if (refused(context)) return context;
  if (!id) return NOT_HERE;
  try {
    if (fieldValue(formData, "reopen", 4) === "1")
      await api.reopenQuestionnaire(id, staffOf(context));
    else await api.closeQuestionnaire(id, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshQuestionnaire(id, routeIdOf(formData, "entry_id"));
  return sent("Done.");
}

export async function updateQuestionnaireAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = routeIdOf(formData, "questionnaire_id");
  const context = await gate(formData, `${BASE}/${id}`);
  if (refused(context)) return context;
  if (!id) return NOT_HERE;
  try {
    await api.updateQuestionnaire(
      id,
      {
        title: fieldValue(formData, "title", 200).trim(),
        due_on: fieldValue(formData, "due_on", 10).trim(),
      },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshQuestionnaire(id);
  return sent("Saved.");
}
