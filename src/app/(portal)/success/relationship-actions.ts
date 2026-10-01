"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError } from "@/lib/api/core";
import * as rel from "@/lib/api/relationships";
import { fieldValue, refusalMessage } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

const NOT_CRM: ActionState = {
  status: "error",
  message: "Your role reads customers; it does not change them.",
};

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

async function writer(formData: FormData, path: string) {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff(path);
  return { context, allowed: hasCapability(context, "crm:write") };
}

function collect(formData: FormData, fields: ReadonlyArray<readonly [string, number]>) {
  const body: Record<string, string> = {};
  for (const [name, limit] of fields) {
    if (formData.has(name)) body[name] = fieldValue(formData, name, limit).trim();
  }
  return body;
}

// --- references ------------------------------------------------------------------------------------

export async function recordReferenceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const companyId = fieldValue(formData, "company_id", 64);
  const { context, allowed } = await writer(formData, `/companies/${companyId}`);
  if (!allowed) return NOT_CRM;
  const body: Record<string, unknown> = {
    company_id: companyId,
    kinds: formData.getAll("kinds").map(String).slice(0, 4),
    ...collect(formData, [
      ["person_id", 64],
      ["contact_name", 160],
      ["evidence", 400],
      ["given_on", 10],
      ["expires_on", 10],
      ["calls_per_quarter", 2],
      ["scope", 1000],
    ]),
  };
  for (const name of ["person_id", "expires_on"]) if (body[name] === "") delete body[name];
  try {
    await rel.createReference(context.token, body);
  } catch (error) {
    return refusal(error);
  }
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/success/references");
  return sent("Recorded, with where the yes is kept.");
}

const SAID: Record<string, string> = {
  use: "Use recorded.",
  withdraw: "Withdrawn.",
  renew: "Renewed.",
  edit: "Saved.",
};

export async function referenceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const referenceId = fieldValue(formData, "reference_id", 64);
  const { context, allowed } = await writer(formData, `/success/references/${referenceId}`);
  if (!allowed) return NOT_CRM;
  const action = fieldValue(formData, "action", 10);
  const body: Record<string, unknown> = {
    action,
    ...collect(formData, [
      ["kind", 12],
      ["deal_id", 64],
      ["used_on", 10],
      ["note", 400],
      ["reason", 400],
      ["evidence", 400],
      ["given_on", 10],
      ["expires_on", 10],
      ["calls_per_quarter", 2],
      ["scope", 1000],
    ]),
  };
  if (formData.has("kinds")) body.kinds = formData.getAll("kinds").map(String).slice(0, 4);
  for (const name of ["deal_id", "used_on", "given_on", "expires_on"])
    if (body[name] === "") delete body[name];
  let result: Awaited<ReturnType<typeof rel.actOnReference>>;
  try {
    result = await rel.actOnReference(context.token, referenceId, body);
  } catch (error) {
    return refusal(error);
  }
  revalidatePath(`/success/references/${referenceId}`);
  revalidatePath("/success/references");
  revalidatePath(`/companies/${result.reference.company_id}`);
  if (action === "withdraw" && result.task_created)
    return sent("Withdrawn. A task to take it down within a week is on your list.");
  return sent(SAID[action] ?? "Saved.");
}

// --- business reviews ------------------------------------------------------------------------------

export async function createReviewAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const companyId = fieldValue(formData, "company_id", 64);
  const { context, allowed } = await writer(formData, `/companies/${companyId}`);
  if (!allowed) return NOT_CRM;
  let reviewId = "";
  try {
    reviewId = (
      await rel.createReview(
        context.token,
        companyId,
        collect(formData, [
          ["title", 160],
          ["period_start", 10],
          ["period_end", 10],
        ]),
      )
    ).review.review_id;
  } catch (error) {
    return refusal(error);
  }
  revalidatePath(`/companies/${companyId}`);
  redirect(`/success/reviews/${reviewId}`);
}

export async function reviewAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const reviewId = fieldValue(formData, "review_id", 64);
  const { context, allowed } = await writer(formData, `/success/reviews/${reviewId}`);
  if (!allowed) return NOT_CRM;
  const action = fieldValue(formData, "action", 10);
  let companyId = "";
  try {
    companyId = (
      await rel.actOnReview(context.token, reviewId, {
        action,
        ...collect(formData, [
          ["title", 160],
          ["goals", 4000],
          ["wins", 4000],
          ["risks", 4000],
          ["actions", 4000],
          ["attendees", 1000],
          ["held_on", 10],
        ]),
      })
    ).review.company_id;
  } catch (error) {
    return refusal(error);
  }
  revalidatePath(`/success/reviews/${reviewId}`);
  revalidatePath(`/companies/${companyId}`);
  const said: Record<string, string> = {
    edit: "Saved.",
    refresh: "The figures are read again. Your words stay.",
    finalise: "Final: kept as it was held.",
  };
  return sent(said[action] ?? "Saved.");
}
