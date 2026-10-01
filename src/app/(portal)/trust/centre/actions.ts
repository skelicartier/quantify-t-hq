"use server";

import { revalidatePath } from "next/cache";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError } from "@/lib/api/core";
import * as tc from "@/lib/api/trust-centre";
import { fieldValue, refusalMessage } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

const NOT_ADMIN: ActionState = {
  status: "error",
  message: "The trust centre is kept by Admins and Owners.",
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

async function admin(formData: FormData) {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/trust/centre");
  return { context, allowed: hasCapability(context, "hq:admin") };
}

function done(message: string): ActionState {
  revalidatePath("/trust/centre");
  revalidatePath("/trust-centre");
  return { status: "sent", message, sentAt: Date.now() };
}

export async function saveSectionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, allowed } = await admin(formData);
  if (!allowed) return NOT_ADMIN;
  try {
    await tc.saveSection(context.token, {
      ...(formData.get("section_id") ? { section_id: fieldValue(formData, "section_id", 64) } : {}),
      title: fieldValue(formData, "title", 160).trim(),
      body: fieldValue(formData, "body", 20_000).trim(),
      published: formData.get("published") === "on",
      ...(formData.get("position") ? { position: fieldValue(formData, "position", 3) } : {}),
    });
  } catch (error) {
    return refusal(error);
  }
  return done(formData.get("published") === "on" ? "Saved and public." : "Saved, not public.");
}

export async function saveDocumentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, allowed } = await admin(formData);
  if (!allowed) return NOT_ADMIN;
  try {
    await tc.saveDocument(context.token, {
      ...(formData.get("document_id")
        ? { document_id: fieldValue(formData, "document_id", 64) }
        : {}),
      title: fieldValue(formData, "title", 160).trim(),
      description: fieldValue(formData, "description", 1000).trim(),
      requires_nda: formData.get("requires_nda") === "on",
      available: formData.get("available") === "on",
    });
  } catch (error) {
    return refusal(error);
  }
  return done("Saved.");
}

const SAID: Record<string, string> = {
  approve: "Approved. Send it, then record the day it went.",
  decline: "Declined, with your note.",
  sent: "Recorded as sent.",
};

export async function documentRequestAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, allowed } = await admin(formData);
  if (!allowed) return NOT_ADMIN;
  const action = fieldValue(formData, "action", 10);
  try {
    await tc.actOnDocumentRequest(context.token, fieldValue(formData, "request_id", 64), {
      action,
      note: fieldValue(formData, "note", 1000).trim(),
    });
  } catch (error) {
    return refusal(error);
  }
  return done(SAID[action] ?? "Saved.");
}
