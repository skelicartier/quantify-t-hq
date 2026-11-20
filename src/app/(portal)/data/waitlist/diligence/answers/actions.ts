"use server";

import { attemptOf, routeIdOf } from "@/components/data/closing/form-copy";
import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/questionnaires";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * The answer library's writes (ws-notes/security/spec.md §9.5, §9.7): add, edit, approve (who
 * and the day; the review day follows), archive and restore, and his own months between looks.
 * Nothing is ever deleted: an answer a buyer saw stays, archived.
 */

const BASE = "/data/waitlist/diligence/answers";
const NOT_HERE: ActionState = { status: "error", message: "That answer is not in the library." };

function refreshAnswers(answerId = ""): void {
  refreshData(
    BASE,
    "/data/waitlist/diligence/questionnaires",
    ...(answerId ? [`${BASE}/${answerId}`] : []),
  );
}

/** The fields of the answer form; evidence may be ticked more than once. */
function inputOf(formData: FormData): api.AnswerInput {
  const evidence = formData
    .getAll("evidence")
    .filter((value): value is string => typeof value === "string" && value !== "")
    .map((value) => value.slice(0, 140));
  const file = routeIdOf(formData, "evidence_file");
  return {
    question: fieldValue(formData, "question", 500).trim(),
    answer: fieldValue(formData, "answer", 4_000).trim(),
    short: fieldValue(formData, "short", 20),
    topic: fieldValue(formData, "topic", 30),
    caiq_ids: fieldValue(formData, "caiq_ids", 1_000),
    other_ids: fieldValue(formData, "other_ids", 1_000),
    ssrm: fieldValue(formData, "ssrm", 30),
    evidence: [...evidence, ...(file ? [`file:${file}`] : [])],
    owner: fieldValue(formData, "owner", 120).trim(),
    ...(fieldValue(formData, "review_by", 10)
      ? { review_by: fieldValue(formData, "review_by", 10) }
      : {}),
  };
}

export async function addAnswerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  try {
    await api.addAnswer(inputOf(formData), staffOf(context), attemptOf(formData));
  } catch (error) {
    return refusal(error);
  }
  refreshAnswers();
  return sent("Added as a draft. Approve it to have it matched.");
}

export async function updateAnswerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const answerId = routeIdOf(formData, "answer_id");
  const context = await gate(formData, `${BASE}/${answerId}`);
  if (refused(context)) return context;
  if (!answerId) return NOT_HERE;
  try {
    await api.updateAnswer(answerId, inputOf(formData), staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshAnswers(answerId);
  return sent("Saved.");
}

export async function approveAnswerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const answerId = routeIdOf(formData, "answer_id");
  const context = await gate(formData, `${BASE}/${answerId}`);
  if (refused(context)) return context;
  if (!answerId) return NOT_HERE;
  try {
    await api.approveAnswer(
      answerId,
      {
        by_name: fieldValue(formData, "by_name", 120).trim(),
        on: fieldValue(formData, "on", 10).trim(),
        review_by: fieldValue(formData, "review_by", 10).trim(),
      },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshAnswers(answerId);
  return sent("Approved.");
}

export async function archiveAnswerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const answerId = routeIdOf(formData, "answer_id");
  const context = await gate(formData, `${BASE}/${answerId}`);
  if (refused(context)) return context;
  if (!answerId) return NOT_HERE;
  try {
    if (fieldValue(formData, "restore", 4) === "1")
      await api.restoreAnswer(answerId, staffOf(context));
    else await api.archiveAnswer(answerId, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshAnswers(answerId);
  return sent("Done.");
}

export async function answerSetupAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  try {
    await api.saveAnswerSetup(fieldValue(formData, "review_months", 4).trim(), staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshAnswers();
  return sent("Saved.");
}
