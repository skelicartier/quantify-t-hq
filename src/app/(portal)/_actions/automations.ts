"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasCapability, requireStaff } from "@/lib/access/core";
import * as autoApi from "@/lib/api/automations";
import { HqApiRequestError } from "@/lib/api/core";
import { sanitizeNextPath } from "@/lib/auth/route-policy";
import { fieldValue, refusalMessage } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

const NOT_ADMIN: ActionState = {
  status: "error",
  message: "Automations are kept by HQ owners and admins.",
};

const PARTS: Record<string, string> = {
  trigger: "The trigger",
  conditions: "The conditions",
  actions: "The actions",
  definition: "The automation",
  draft: "The draft",
  name: "The name",
  status: "It",
  automation: "This automation",
  action: "That",
};

function refusal(error: unknown): ActionState {
  if (error instanceof HqApiRequestError) {
    const entry = Object.entries(error.details).find(([, value]) => typeof value === "string");
    if (entry && (error.code === "malformed_request" || error.code === "forbidden")) {
      const [part, detail] = entry as [string, string];
      return { status: "error", message: `${PARTS[part] ?? "It"}: ${detail}.` };
    }
  }
  return { status: "error", message: refusalMessage(error) };
}

function sent(message: string, extra: Partial<ActionState> = {}): ActionState {
  return { status: "sent", message, sentAt: Date.now(), ...extra };
}

async function admin(formData: FormData, path: string) {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff(path);
  return { context, allowed: hasCapability(context, "hq:admin") };
}

export async function createAutomationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, allowed } = await admin(formData, "/admin/automations");
  if (!allowed) return NOT_ADMIN;
  let automationId = "";
  try {
    automationId = (
      await autoApi.createAutomation(context.token, {
        name: fieldValue(formData, "name", 120).trim(),
        record_type: fieldValue(formData, "record_type", 12),
      })
    ).automation.automation_id;
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/admin/automations");
  redirect(`/admin/automations/${automationId}`);
}

/** The builder's draft: its name and the definition it holds as JSON. Nothing runs yet. */
export async function saveAutomationDraftAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const automationId = fieldValue(formData, "automation_id", 64);
  const path = `/admin/automations/${automationId}`;
  const { context, allowed } = await admin(formData, path);
  if (!allowed) return NOT_ADMIN;
  let definition: unknown;
  try {
    definition = JSON.parse(fieldValue(formData, "definition", 20_000) || "{}");
  } catch {
    return { status: "error", message: "The builder sent something unreadable; reload the page." };
  }
  try {
    await autoApi.saveAutomationDraft(context.token, automationId, {
      name: fieldValue(formData, "name", 120).trim(),
      definition,
    });
  } catch (error) {
    return refusal(error);
  }
  revalidatePath(path);
  return sent("Draft saved. Nothing runs until it is published.");
}

export async function publishAutomationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const automationId = fieldValue(formData, "automation_id", 64);
  const path = `/admin/automations/${automationId}`;
  const { context, allowed } = await admin(formData, path);
  if (!allowed) return NOT_ADMIN;
  let version = 0;
  try {
    version = (await autoApi.publishAutomation(context.token, automationId)).automation.version;
  } catch (error) {
    return refusal(error);
  }
  revalidatePath(path);
  revalidatePath("/admin/automations");
  return sent(`Version ${version} is running.`);
}

export async function actOnAutomationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const automationId = fieldValue(formData, "automation_id", 64);
  const path = `/admin/automations/${automationId}`;
  const { context, allowed } = await admin(formData, path);
  if (!allowed) return NOT_ADMIN;
  const action = fieldValue(formData, "action", 12);
  try {
    await autoApi.actOnAutomation(context.token, automationId, {
      action,
      reason: fieldValue(formData, "reason", 400).trim(),
    });
  } catch (error) {
    return refusal(error);
  }
  revalidatePath(path);
  revalidatePath("/admin/automations");
  const said: Record<string, string> = {
    pause: "Paused. Nothing runs until it is resumed.",
    resume: "Running again.",
    archive: "Archived.",
    restore: "Restored, paused until someone resumes it.",
  };
  return sent(said[action] ?? "Saved.");
}

/** The saved draft against the last fifty records; the results come back as JSON. */
export async function dryRunAutomationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const automationId = fieldValue(formData, "automation_id", 64);
  const { context, allowed } = await admin(formData, `/admin/automations/${automationId}`);
  if (!allowed) return NOT_ADMIN;
  try {
    const result = await autoApi.dryRunAutomation(context.token, automationId);
    return sent(
      `Tried on ${result.checked} record${result.checked === 1 ? "" : "s"}: ${result.would_match} would match. Nothing was changed.`,
      { detail: JSON.stringify(result) },
    );
  } catch (error) {
    return refusal(error);
  }
}

/** A record page's button: runs as the person who pressed it. */
export async function runAutomationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const path = sanitizeNextPath(fieldValue(formData, "return_path", 200));
  const context = await requireStaff(path);
  let outcome = "";
  let lines: string[] = [];
  try {
    const result = await autoApi.runAutomation(
      context.token,
      fieldValue(formData, "automation_id", 64),
      fieldValue(formData, "record_id", 64),
    );
    outcome = result.outcome;
    lines = result.detail;
  } catch (error) {
    return refusal(error);
  }
  revalidatePath(path);
  if (outcome === "failed") return { status: "error", message: lines.at(-1) ?? "It failed." };
  return sent(lines.join(" ") || "Done.");
}
