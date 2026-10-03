"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireStaff } from "@/lib/access/core";
import { HqApiRequestError } from "@/lib/api/core";
import * as inboxApi from "@/lib/api/inbox";
import { fieldValue, refusalMessage } from "@/lib/auth/forms";
import { sanitizeNextPath } from "@/lib/auth/route-policy";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

/** The rail's count sits in the layout; every inbox change refreshes it. */
function refresh() {
  revalidatePath("/", "layout");
}

function refusal(error: unknown): ActionState {
  if (error instanceof HqApiRequestError && error.code === "malformed_request") {
    const detail = Object.values(error.details).find((value) => typeof value === "string");
    if (typeof detail === "string")
      return { status: "error", message: `${detail.charAt(0).toUpperCase()}${detail.slice(1)}.` };
  }
  return { status: "error", message: refusalMessage(error) };
}

const ACTIONS = ["read", "unread", "done", "undone", "snooze"] as const;
type ItemAction = (typeof ACTIONS)[number];

export async function inboxItemAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const { token } = await requireStaff("/inbox");
  // A snooze button submits the time it stands for; any other button names its act.
  const until = fieldValue(formData, "until", 40);
  const action = (until ? "snooze" : fieldValue(formData, "action", 10)) as ItemAction;
  if (!ACTIONS.includes(action)) return { status: "error", message: "Choose what to do." };
  try {
    await inboxApi.updateInboxItem(
      token,
      fieldValue(formData, "notification_id", 64),
      action,
      until || undefined,
    );
  } catch (error) {
    return refusal(error);
  }
  refresh();
  const said: Record<ItemAction, string> = {
    read: "Marked read.",
    unread: "Marked unread.",
    done: "Done.",
    undone: "Back in the inbox.",
    snooze: "Snoozed.",
  };
  return { status: "sent", message: said[action], sentAt: Date.now() };
}

/** Open a line: it is read now, and the record it points at opens. */
export async function openInboxItemAction(formData: FormData): Promise<void> {
  await requireSameOriginServerAction(formData);
  const { token } = await requireStaff("/inbox");
  const target = sanitizeNextPath(fieldValue(formData, "link_path", 300));
  try {
    await inboxApi.updateInboxItem(token, fieldValue(formData, "notification_id", 64), "read");
  } catch {
    // Opening the record matters more than the mark; the inbox shows it unread still.
  }
  refresh();
  redirect(target);
}

export async function inboxBulkAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const { token } = await requireStaff("/inbox");
  const action = fieldValue(formData, "action", 12);
  if (action !== "read_all" && action !== "clear_read")
    return { status: "error", message: "Choose what to do." };
  let changed = 0;
  try {
    changed = (await inboxApi.inboxBulk(token, action)).changed;
  } catch (error) {
    return refusal(error);
  }
  refresh();
  return {
    status: "sent",
    message: action === "read_all" ? `${changed} marked read.` : `${changed} cleared to Done.`,
    sentAt: Date.now(),
  };
}

export async function followAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const returnPath = sanitizeNextPath(fieldValue(formData, "return_path", 300));
  const { token } = await requireStaff(returnPath);
  const follow = fieldValue(formData, "follow", 5) === "yes";
  try {
    await inboxApi.setSubscription(
      token,
      fieldValue(formData, "subject_type", 20),
      fieldValue(formData, "subject", 64),
      follow,
    );
  } catch (error) {
    return refusal(error);
  }
  revalidatePath(returnPath);
  return {
    status: "sent",
    message: follow ? "Following." : "Not following.",
    sentAt: Date.now(),
  };
}

export async function remindAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const returnPath = sanitizeNextPath(fieldValue(formData, "link_path", 300));
  const { token } = await requireStaff(returnPath);
  const remindAt = fieldValue(formData, "remind_at", 40);
  if (!remindAt) return { status: "error", message: "Choose when." };
  try {
    await inboxApi.createReminder(token, {
      subject_type: fieldValue(formData, "subject_type", 20),
      subject_id: fieldValue(formData, "subject_id", 64),
      subject_label: fieldValue(formData, "subject_label", 200),
      link_path: returnPath,
      remind_at: remindAt,
      note: fieldValue(formData, "note", 400).trim(),
    });
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/inbox");
  return {
    status: "sent",
    message: "Reminder set. It will land in your inbox.",
    sentAt: Date.now(),
  };
}

export async function cancelReminderAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const { token } = await requireStaff("/inbox");
  try {
    await inboxApi.cancelReminder(token, fieldValue(formData, "reminder_id", 64));
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/inbox");
  return { status: "sent", message: "Cancelled.", sentAt: Date.now() };
}

/** Which reasons count as Priority for this person, or the default rule back. */
export async function priorityRuleAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const { token } = await requireStaff("/me/notifications");
  const reasons = formData
    .getAll("priority_reason")
    .map((value) => String(value).slice(0, 20))
    .slice(0, 20);
  try {
    await inboxApi.updatePriorityRule(
      token,
      fieldValue(formData, "intent", 8) === "default" ? "default" : reasons,
    );
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/me/notifications");
  revalidatePath("/inbox");
  return { status: "sent", message: "Saved.", sentAt: Date.now() };
}

export async function notificationPrefsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const { token } = await requireStaff("/me/notifications");
  const hour = (name: string): number | "" => {
    const raw = fieldValue(formData, name, 3);
    return raw === "" ? "" : Number(raw);
  };
  try {
    await inboxApi.updateNotificationPrefs(token, {
      email_mode: fieldValue(formData, "email_mode", 8),
      delay_minutes: Number(fieldValue(formData, "delay_minutes", 4) || 15),
      quiet_from: hour("quiet_from"),
      quiet_to: hour("quiet_to"),
      time_zone: fieldValue(formData, "time_zone", 64),
    });
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/me/notifications");
  return { status: "sent", message: "Saved.", sentAt: Date.now() };
}
