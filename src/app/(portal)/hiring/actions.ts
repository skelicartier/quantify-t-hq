"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireStaff } from "@/lib/access/core";
import { HqApiRequestError } from "@/lib/api/core";
import * as hiring from "@/lib/api/hiring";
import { fieldValue, refusalMessage } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

function refusal(error: unknown): ActionState {
  if (error instanceof HqApiRequestError) {
    const detail = Object.values(error.details).find((value) => typeof value === "string");
    if (
      (error.code === "malformed_request" || error.code === "forbidden") &&
      typeof detail === "string"
    )
      return { status: "error", message: `${detail.charAt(0).toUpperCase()}${detail.slice(1)}.` };
  }
  return { status: "error", message: refusalMessage(error) };
}

function sent(message: string): ActionState {
  return { status: "sent", message, sentAt: Date.now() };
}

function collect(formData: FormData, fields: ReadonlyArray<readonly [string, number]>) {
  const body: Record<string, string> = {};
  for (const [name, limit] of fields) {
    if (formData.has(name)) body[name] = fieldValue(formData, name, limit).trim();
  }
  return body;
}

export async function createOpeningAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/hiring");
  let openingId = "";
  try {
    const body = collect(formData, [
      ["title", 160],
      ["team", 80],
      ["kind", 12],
      ["location", 120],
      ["description", 20_000],
      ["owner_staff_id", 64],
      ["closes_on", 10],
    ]);
    if (!body.closes_on) delete body.closes_on;
    openingId = (await hiring.createOpening(context.token, body)).opening.opening_id;
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/hiring");
  redirect(`/hiring/openings/${openingId}`);
}

export async function updateOpeningAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const openingId = fieldValue(formData, "opening_id", 64);
  const context = await requireStaff(`/hiring/openings/${openingId}`);
  try {
    await hiring.updateOpening(
      context.token,
      openingId,
      collect(formData, [
        ["title", 160],
        ["team", 80],
        ["location", 120],
        ["description", 20_000],
        ["status", 8],
        ["closes_on", 10],
      ]),
    );
  } catch (error) {
    return refusal(error);
  }
  revalidatePath(`/hiring/openings/${openingId}`);
  revalidatePath("/hiring");
  return sent("Saved.");
}

export async function addApplicantAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const openingId = fieldValue(formData, "opening_id", 64);
  const context = await requireStaff(`/hiring/openings/${openingId}`);
  let applicantId = "";
  try {
    applicantId = (
      await hiring.createApplicant(context.token, {
        opening_id: openingId,
        ...collect(formData, [
          ["full_name", 160],
          ["email", 254],
          ["links", 1000],
          ["source", 12],
          ["referred_by", 160],
        ]),
      })
    ).applicant.applicant_id;
  } catch (error) {
    return refusal(error);
  }
  revalidatePath(`/hiring/openings/${openingId}`);
  redirect(`/hiring/applicants/${applicantId}`);
}

const SAID: Record<string, string> = {
  move: "Moved.",
  note: "Noted.",
  keep: "Kept until the date they agreed.",
  interviewers: "Interviewers set. Anyone new is told.",
};

export async function applicantAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const applicantId = fieldValue(formData, "applicant_id", 64);
  const context = await requireStaff(`/hiring/applicants/${applicantId}`);
  const action = fieldValue(formData, "action", 14);
  const body: Record<string, unknown> = {
    action,
    ...collect(formData, [
      ["to_stage", 10],
      ["reason", 20],
      ["note", 2000],
      ["keep_until", 10],
      ["evidence", 400],
    ]),
  };
  if (action === "interviewers")
    body.staff_ids = formData.getAll("staff_ids").map(String).slice(0, 10);
  try {
    await hiring.actOnApplicant(context.token, applicantId, body);
  } catch (error) {
    return refusal(error);
  }
  revalidatePath(`/hiring/applicants/${applicantId}`);
  revalidatePath("/hiring");
  return sent(SAID[action] ?? "Saved.");
}

export async function scorecardAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const applicantId = fieldValue(formData, "applicant_id", 64);
  const context = await requireStaff(`/hiring/applicants/${applicantId}`);
  const scores: Record<string, string> = {};
  for (const key of ["skills", "judgement", "communication", "ownership"])
    scores[key] = fieldValue(formData, `score_${key}`, 1);
  try {
    await hiring.submitScorecard(context.token, applicantId, {
      stage: fieldValue(formData, "stage", 10),
      recommendation: fieldValue(formData, "recommendation", 10),
      scores,
      notes: fieldValue(formData, "notes", 4000).trim(),
    });
  } catch (error) {
    return refusal(error);
  }
  revalidatePath(`/hiring/applicants/${applicantId}`);
  revalidatePath("/hiring/interviews");
  return sent("Scorecard in. The others' are open to you now.");
}
