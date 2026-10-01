"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError } from "@/lib/api/core";
import * as quotes from "@/lib/api/quotes";
import { fieldValue, refusalMessage } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

const NOT_DEALS: ActionState = {
  status: "error",
  message: "Your role reads deals; it does not change them.",
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

function sent(message: string, detail?: string): ActionState {
  return { status: "sent", message, sentAt: Date.now(), ...(detail ? { detail } : {}) };
}

async function dealsWriter(formData: FormData, path: string) {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff(path);
  return { context, allowed: hasCapability(context, "deals:write") };
}

function refresh(dealId: string, quoteId = "") {
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals/quotes");
  if (quoteId) revalidatePath(`/deals/${dealId}/quotes/${quoteId}`);
}

// --- quotes ----------------------------------------------------------------------------------------

export async function createQuoteAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const dealId = fieldValue(formData, "deal_id", 64);
  const { context, allowed } = await dealsWriter(formData, `/deals/${dealId}`);
  if (!allowed) return NOT_DEALS;
  const body: Record<string, unknown> = {};
  for (const [name, limit] of [
    ["title", 160],
    ["term_months", 3],
    ["valid_until", 10],
  ] as const) {
    const value = fieldValue(formData, name, limit).trim();
    if (value) body[name] = value;
  }
  let quoteId = "";
  try {
    quoteId = (await quotes.createQuote(context.token, dealId, body)).quote.quote_id;
  } catch (error) {
    return refusal(error);
  }
  refresh(dealId);
  redirect(`/deals/${dealId}/quotes/${quoteId}`);
}

/** The terms: title, term, validity and the words. Lines are saved by their own editor. */
export async function updateQuoteTermsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const dealId = fieldValue(formData, "deal_id", 64);
  const quoteId = fieldValue(formData, "quote_id", 64);
  const { context, allowed } = await dealsWriter(formData, `/deals/${dealId}/quotes/${quoteId}`);
  if (!allowed) return NOT_DEALS;
  const body: Record<string, unknown> = {};
  for (const [name, limit] of [
    ["title", 160],
    ["term_months", 3],
    ["valid_until", 10],
    ["terms", 4000],
  ] as const) {
    if (formData.has(name)) body[name] = fieldValue(formData, name, limit).trim();
  }
  let cancelled = false;
  try {
    cancelled = (await quotes.updateQuote(context.token, quoteId, body)).approval_cancelled;
  } catch (error) {
    return refusal(error);
  }
  refresh(dealId, quoteId);
  return sent(
    cancelled ? "Saved. The approval is cancelled: it goes for approval again." : "Saved.",
  );
}

export async function saveQuoteLinesAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const dealId = fieldValue(formData, "deal_id", 64);
  const quoteId = fieldValue(formData, "quote_id", 64);
  const { context, allowed } = await dealsWriter(formData, `/deals/${dealId}/quotes/${quoteId}`);
  if (!allowed) return NOT_DEALS;
  let lines: unknown;
  try {
    lines = JSON.parse(fieldValue(formData, "lines", 40_000) || "[]");
  } catch {
    return { status: "error", message: "The lines could not be read; reload the page." };
  }
  let result: Awaited<ReturnType<typeof quotes.updateQuote>>;
  try {
    result = await quotes.updateQuote(context.token, quoteId, { lines });
  } catch (error) {
    return refusal(error);
  }
  refresh(dealId, quoteId);
  const tier = result.quote.tier_label.toLowerCase();
  return sent(
    result.approval_cancelled
      ? `Lines saved. The approval is cancelled; ${tier}.`
      : `Lines saved. ${result.quote.tier_label}.`,
  );
}

const SAID: Record<string, string> = {
  submit: "Sent for approval. The approvers have it in their inbox.",
  recall: "Recalled to a draft.",
  approve: "Approved.",
  request_changes: "Sent back with your note.",
  publish: "Marked as sent.",
  accept: "Signature recorded.",
  decline: "Recorded as declined.",
  withdraw: "Withdrawn.",
  make_primary: "This is the deal's quote now.",
};

export async function actOnQuoteAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const dealId = fieldValue(formData, "deal_id", 64);
  const quoteId = fieldValue(formData, "quote_id", 64);
  const { context, allowed } = await dealsWriter(formData, `/deals/${dealId}/quotes/${quoteId}`);
  if (!allowed) return NOT_DEALS;
  const action = fieldValue(formData, "action", 20);
  const body: Record<string, string> = { action };
  for (const [name, limit] of [
    ["note", 1000],
    ["reason", 400],
    ["signer_name", 160],
    ["signer_email", 254],
    ["signed_on", 10],
    ["signature_ref", 400],
  ] as const) {
    if (formData.has(name)) body[name] = fieldValue(formData, name, limit).trim();
  }
  let result: Awaited<ReturnType<typeof quotes.actOnQuote>>;
  try {
    result = await quotes.actOnQuote(context.token, quoteId, body);
  } catch (error) {
    return refusal(error);
  }
  refresh(dealId, quoteId);
  if (action === "revise") redirect(`/deals/${dealId}/quotes/${result.quote.quote_id}`);
  if (action === "accept" && result.deal_updated)
    return sent("Signature recorded. The deal now carries the signed monthly value.");
  return sent(SAID[action] ?? "Saved.");
}

// --- the mutual action plan ------------------------------------------------------------------------

export async function dealPlanAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const dealId = fieldValue(formData, "deal_id", 64);
  const { context, allowed } = await dealsWriter(formData, `/deals/${dealId}`);
  if (!allowed) return NOT_DEALS;
  const action = fieldValue(formData, "action", 12);
  const body: Record<string, string> = { action };
  for (const [name, limit] of [
    ["step_id", 64],
    ["title", 200],
    ["side", 4],
    ["due_on", 10],
    ["owner_staff_id", 64],
    ["contact_name", 160],
    ["notes", 1000],
    ["direction", 4],
  ] as const) {
    if (formData.has(name)) body[name] = fieldValue(formData, name, limit).trim();
  }
  try {
    await quotes.actOnDealPlan(context.token, dealId, body);
  } catch (error) {
    return refusal(error);
  }
  revalidatePath(`/deals/${dealId}`);
  const said: Record<string, string> = {
    template: "The usual plan is laid in, dated back from the close.",
    add: "Step added.",
    edit: "Saved.",
    done: "Done.",
    reopen: "Reopened.",
    remove: "Removed.",
    move: "Moved.",
  };
  return sent(said[action] ?? "Saved.");
}
