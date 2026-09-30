"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError } from "@/lib/api/core";
import * as cs from "@/lib/api/success";
import { fieldValue, refusalMessage } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

const NOT_WRITER: ActionState = {
  status: "error",
  message: "Working the customer book is for Sales, Admins and Owners.",
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

function collect(formData: FormData, fields: ReadonlyArray<readonly [string, number]>) {
  const body: Record<string, string> = {};
  for (const [name, limit] of fields) {
    const value = fieldValue(formData, name, limit).trim();
    if (value) body[name] = value;
  }
  return body;
}

export async function createRequestAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/success/requests");
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  let requestId = "";
  try {
    requestId = (
      await cs.createFeatureRequest(
        context.token,
        collect(formData, [
          ["title", 200],
          ["description", 4000],
        ]),
      )
    ).request.id;
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/success/requests");
  redirect(`/success/requests/${requestId}`);
}

export async function updateRequestAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const requestId = fieldValue(formData, "request_id", 64);
  const context = await requireStaff(`/success/requests/${requestId}`);
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  try {
    await cs.updateFeatureRequest(
      context.token,
      requestId,
      collect(formData, [
        ["status", 12],
        ["declined_reason", 1000],
        ["title", 200],
        ["description", 4000],
      ]),
    );
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/success/requests");
  revalidatePath(`/success/requests/${requestId}`);
  return sent("Saved.");
}

export async function addAskAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const requestId = fieldValue(formData, "request_id", 64);
  const context = await requireStaff(`/success/requests/${requestId}`);
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  try {
    await cs.addAsk(
      context.token,
      requestId,
      collect(formData, [
        ["company_id", 64],
        ["person_id", 64],
        ["quote", 1000],
        ["importance", 10],
        ["source", 12],
        ["deal_id", 64],
      ]),
    );
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/success/requests");
  revalidatePath(`/success/requests/${requestId}`);
  return sent("Ask added.");
}

export async function shipRequestAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const requestId = fieldValue(formData, "request_id", 64);
  const context = await requireStaff(`/success/requests/${requestId}`);
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  let done: Awaited<ReturnType<typeof cs.shipFeatureRequest>>;
  try {
    done = await cs.shipFeatureRequest(
      context.token,
      requestId,
      collect(formData, [
        ["shipped_on", 10],
        ["tell", 10],
        ["subject", 200],
        ["body", 4000],
      ]),
    );
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/success/requests");
  revalidatePath(`/success/requests/${requestId}`);
  return sent(
    `Shipped. ${done.told} ask${done.told === 1 ? "" : "s"} told` +
      (done.skipped
        ? `; ${done.skipped} not mailed (no address, or they asked not to be contacted).`
        : "."),
  );
}

export async function startOnboardingAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/success/onboarding");
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  try {
    await cs.startOnboarding(
      context.token,
      collect(formData, [
        ["company_id", 64],
        ["kickoff_on", 10],
        ["target_live_on", 10],
      ]),
    );
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/success/onboarding");
  return sent("Onboarding started, with its steps.");
}

const ONBOARDING_SAID: Record<string, string> = {
  dates: "Dates saved.",
  status: "Status changed.",
  step_done: "Step done.",
  step_undone: "Step reopened.",
  add_step: "Step added.",
  notes: "Notes saved.",
};

export async function actOnOnboardingAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/success/onboarding");
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  const onboardingId = fieldValue(formData, "onboarding_id", 64);
  const action = fieldValue(formData, "action", 16);
  const body: Record<string, string> = {
    action,
    ...collect(formData, [
      ["status", 12],
      ["step_id", 64],
      ["title", 200],
      ["due_on", 10],
      ["notes", 2000],
    ]),
  };
  // Dates are sent even when emptied, so a wrong date can be cleared.
  for (const name of ["kickoff_on", "first_sign_in_on", "live_on", "target_live_on"])
    if (formData.has(name)) body[name] = fieldValue(formData, name, 10).trim();
  try {
    await cs.actOnOnboarding(context.token, onboardingId, body);
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/success/onboarding");
  return sent(ONBOARDING_SAID[action] ?? "Saved.");
}

export async function startPlaybookAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const contractId = fieldValue(formData, "contract_id", 64);
  const context = await requireStaff(`/revenue/contracts/${contractId}`);
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  let done: Awaited<ReturnType<typeof cs.startPlaybook>>;
  try {
    done = await cs.startPlaybook(context.token, contractId);
  } catch (error) {
    return refusal(error);
  }
  revalidatePath(`/revenue/contracts/${contractId}`);
  revalidatePath("/revenue/renewals");
  revalidatePath("/tasks");
  return sent(`${done.tasks} tasks put on the calendar, the last on the notice date.`);
}
