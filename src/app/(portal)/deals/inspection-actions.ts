"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError } from "@/lib/api/core";
import * as ins from "@/lib/api/inspection";
import { fieldValue, refusalMessage } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

const NOT_WRITER: ActionState = {
  status: "error",
  message: "Working the pipeline is for Sales, Admins and Owners.",
};

function refusal(error: unknown): ActionState {
  if (error instanceof HqApiRequestError) {
    const detail = Object.values(error.details).find((value) => typeof value === "string");
    if (error.code === "malformed_request" && typeof detail === "string")
      return { status: "error", message: `${detail.charAt(0).toUpperCase()}${detail.slice(1)}.` };
  }
  return { status: "error", message: refusalMessage(error) };
}

function sent(message: string): ActionState {
  return { status: "sent", message, sentAt: Date.now() };
}

export async function submitForecastAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/deals/forecast");
  if (!hasCapability(context, "deals:write")) return NOT_WRITER;
  const body = {
    period: fieldValue(formData, "period", 7),
    currency: fieldValue(formData, "currency", 3),
    commit: fieldValue(formData, "commit", 20).trim(),
    best_case: fieldValue(formData, "best_case", 20).trim(),
    note: fieldValue(formData, "note", 2000).trim(),
  };
  try {
    await ins.submitForecast(context.token, body);
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/deals/forecast");
  return sent("Submitted. The call is frozen with the deals behind it.");
}

export async function setTargetAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/deals/forecast");
  if (!hasCapability(context, "revenue:write"))
    return { status: "error", message: "Targets are set by Owners and Admins." };
  try {
    await ins.setTarget(context.token, {
      period: fieldValue(formData, "period", 7),
      currency: fieldValue(formData, "currency", 3),
      amount: fieldValue(formData, "amount", 20).trim(),
    });
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/deals/forecast");
  return sent("Target set.");
}

function cardBody(formData: FormData): Record<string, unknown> {
  let objections: unknown = [];
  try {
    objections = JSON.parse(fieldValue(formData, "objections", 40_000) || "[]");
  } catch {
    objections = [];
  }
  return {
    name: fieldValue(formData, "name", 120).trim(),
    website: fieldValue(formData, "website", 200).trim(),
    summary: fieldValue(formData, "summary", 1000).trim(),
    quick_dismiss: fieldValue(formData, "quick_dismiss", 1000).trim(),
    why_we_win: fieldValue(formData, "why_we_win", 2000).trim(),
    why_we_lose: fieldValue(formData, "why_we_lose", 2000).trim(),
    objections,
  };
}

export async function createCompetitorAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/deals/competitors");
  if (!hasCapability(context, "deals:write")) return NOT_WRITER;
  let competitorId = "";
  try {
    competitorId = (await ins.createCompetitor(context.token, cardBody(formData))).competitor.id;
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/deals/competitors");
  redirect(`/deals/competitors/${competitorId}`);
}

export async function updateCompetitorAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const competitorId = fieldValue(formData, "competitor_id", 64);
  const context = await requireStaff(`/deals/competitors/${competitorId}`);
  if (!hasCapability(context, "deals:write")) return NOT_WRITER;
  try {
    await ins.updateCompetitor(context.token, competitorId, cardBody(formData));
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/deals/competitors");
  revalidatePath(`/deals/competitors/${competitorId}`);
  return sent("Saved. The card counts as reviewed today.");
}

export async function reviewCompetitorAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const competitorId = fieldValue(formData, "competitor_id", 64);
  const context = await requireStaff(`/deals/competitors/${competitorId}`);
  if (!hasCapability(context, "deals:write")) return NOT_WRITER;
  try {
    // An empty update is a review: the card is read and still true.
    await ins.updateCompetitor(context.token, competitorId, {});
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/deals/competitors");
  revalidatePath(`/deals/competitors/${competitorId}`);
  return sent("Marked as reviewed: still true.");
}

export async function dealCompetitorAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const dealId = fieldValue(formData, "deal_id", 64);
  const context = await requireStaff(`/deals/${dealId}`);
  if (!hasCapability(context, "deals:write")) return NOT_WRITER;
  const action = fieldValue(formData, "action", 12);
  const body: Record<string, string> = {
    action,
    competitor_id: fieldValue(formData, "competitor_id", 64),
  };
  for (const name of ["strengths", "weaknesses"])
    if (formData.has(name)) body[name] = fieldValue(formData, name, 1000).trim();
  try {
    await ins.actOnDealCompetitor(context.token, dealId, body);
  } catch (error) {
    return refusal(error);
  }
  revalidatePath(`/deals/${dealId}`);
  const said: Record<string, string> = {
    add: "Added to the deal.",
    update: "Saved.",
    eliminate: "Marked out of the running.",
    restore: "Back in the running.",
    remove: "Removed from the deal.",
  };
  return sent(said[action] ?? "Saved.");
}

export async function recordInterviewAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const dealId = fieldValue(formData, "deal_id", 64);
  const context = await requireStaff(`/deals/${dealId}`);
  if (!hasCapability(context, "deals:write")) return NOT_WRITER;
  const drivers: Array<{ driver: string; effect: string }> = [];
  for (const [name, value] of formData.entries()) {
    if (!name.startsWith("driver:") || typeof value !== "string" || !value) continue;
    drivers.push({ driver: name.slice("driver:".length, 40), effect: value.slice(0, 10) });
  }
  try {
    await ins.recordInterview(context.token, dealId, {
      held_on: fieldValue(formData, "held_on", 10),
      interviewee_name: fieldValue(formData, "interviewee_name", 160).trim(),
      interviewee_title: fieldValue(formData, "interviewee_title", 120).trim(),
      buyer_reason: fieldValue(formData, "buyer_reason", 400).trim(),
      quotes: fieldValue(formData, "quotes", 4000).trim(),
      summary: fieldValue(formData, "summary", 4000).trim(),
      drivers,
    });
  } catch (error) {
    return refusal(error);
  }
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals/win-loss");
  return sent("Interview recorded.");
}
