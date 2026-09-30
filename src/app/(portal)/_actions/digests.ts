"use server";

import { revalidatePath } from "next/cache";

import { requireStaff } from "@/lib/access/core";
import * as digestApi from "@/lib/api/digests";
import { fieldValue } from "@/lib/auth/forms";
import { renderDigest } from "@/lib/digests/render";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { privilegedRefusal } from "@/lib/security/privileged-refusal";

const PATH = "/me/digests";

function sent(message: string): ActionState {
  return { status: "sent", message, sentAt: Date.now() };
}

function schedule(formData: FormData): Record<string, unknown> {
  const cadence = fieldValue(formData, "cadence", 10);
  return {
    cadence,
    hour_utc: Number(fieldValue(formData, "hour_utc", 2) || 8),
    ...(cadence === "weekly" ? { weekday: Number(fieldValue(formData, "weekday", 1) || 0) } : {}),
  };
}

export async function createDigestAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff(PATH);
  try {
    await digestApi.createDigest(context.token, {
      view_id: fieldValue(formData, "view_id", 64),
      send_empty: formData.get("send_empty") === "on",
      ...schedule(formData),
    });
  } catch (error) {
    return privilegedRefusal(error);
  }
  revalidatePath(PATH);
  return sent("Added. The first one comes at the next time you chose.");
}

export async function updateDigestAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff(PATH);
  const digestId = fieldValue(formData, "digest_id", 64);
  const action = fieldValue(formData, "action", 12);
  const body: Record<string, unknown> =
    action === "pause"
      ? { active: false }
      : action === "resume"
        ? { active: true }
        : { ...schedule(formData), send_empty: formData.get("send_empty") === "on" };
  try {
    if (action === "delete") await digestApi.deleteDigest(context.token, digestId);
    else await digestApi.updateDigest(context.token, digestId, body);
  } catch (error) {
    return privilegedRefusal(error);
  }
  revalidatePath(PATH);
  const said: Record<string, string> = {
    pause: "Paused.",
    resume: "Resumed; the next one comes at its time.",
    delete: "Removed.",
  };
  return sent(said[action] ?? "Saved.");
}

/**
 * "Send me one now": rendered here with the person's own session — what they would see
 * on the list — and mailed without moving the schedule.
 */
export async function previewDigestAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff(PATH);
  const digestId = fieldValue(formData, "digest_id", 64);
  try {
    const digest = (await digestApi.readDigests(context.token)).digests.find(
      (item) => item.digest_id === digestId,
    );
    if (!digest) return { status: "error", message: "That digest is no longer yours." };
    const table = await renderDigest(context.token, digest.list_key, digest.query);
    const result = await digestApi.deliverDigest(context.token, digestId, table);
    revalidatePath(PATH);
    return sent(`Sent to your address: ${result.rows} ${result.rows === 1 ? "match" : "matches"}.`);
  } catch (error) {
    return privilegedRefusal(error);
  }
}
