"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import {
  AccountApiRequestError,
  fetchAccountApiMe,
  fetchAccountApiAdminNotifications,
  updateAccountApiAdminNotifications,
} from "@/lib/product/account-api";
import {
  canManageNotifications,
  hasAdminPortalAccess,
  hasSatisfiedPrivilegedAssurance,
} from "@/lib/product/access";
import { getCurrentAssurance } from "@/lib/product/assurance-guard";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { createServerAzureClient } from "@/lib/product/session";
import {
  notificationInputSchema,
  notificationRevisionSchema,
  NOTIFICATION_DOCUMENT_BYTE_LIMIT,
  type NotificationActionState,
} from "@/lib/product/notifications/input";

const failure = (message: string): NotificationActionState => ({ status: "error", message });

export async function saveAdminNotification(
  _previous: NotificationActionState,
  formData: FormData,
): Promise<NotificationActionState> {
  const revision = notificationRevisionSchema.safeParse(formData.get("revision"));
  const raw = formData.get("notification");
  if (
    !revision.success ||
    typeof raw !== "string" ||
    raw.length > 300_000 ||
    formData.getAll("revision").length !== 1 ||
    formData.getAll("notification").length !== 1
  ) {
    return failure("Check the notification fields and try again.");
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return failure("Check the notification fields and try again.");
  }
  const parsed = notificationInputSchema.safeParse(value);
  if (!parsed.success) return failure("Check the content, recipients, HTTPS links, and schedule.");

  try {
    await requireSameOriginServerAction();
    const azure = await createServerAzureClient();
    const accessToken = azure.getAccessToken();
    if (!accessToken) return failure("Sign in again to save notifications.");
    const me = await fetchAccountApiMe(accessToken);
    if (!hasAdminPortalAccess(me) || !canManageNotifications(me)) {
      return failure("This account cannot publish notifications.");
    }
    if (!hasSatisfiedPrivilegedAssurance(await getCurrentAssurance())) {
      return failure("Verify your authenticator code before saving notifications.");
    }
    const current = await fetchAccountApiAdminNotifications(accessToken);
    if (current.revision !== revision.data)
      return failure("Notifications changed. Reload the page before saving again.");
    const note = parsed.data;
    const existing = current.notifications.find((item) => item.id === note.id);
    if (note.id && !existing)
      return failure("This notification no longer exists. Reload the page.");
    if (!note.id && current.notifications.length >= 200)
      return failure("The notification limit has been reached.");
    const saved = {
      ...note,
      id: note.id || randomUUID(),
      created_at: existing?.created_at || new Date().toISOString(),
    };
    const notifications = existing
      ? current.notifications.map((item) => (item.id === saved.id ? saved : item))
      : [...current.notifications, saved];
    const body = { notifications, expected_revision: revision.data };
    if (Buffer.byteLength(JSON.stringify(body), "utf8") > NOTIFICATION_DOCUMENT_BYTE_LIMIT) {
      return failure(
        "The notification collection is too large. Shorten messages or recipient lists before saving.",
      );
    }
    await updateAccountApiAdminNotifications(accessToken, body, {
      idempotencyKey: `portal-${randomUUID()}`,
    });
    revalidatePath("/product/notifications");
    return {
      status: "success",
      message: saved.active ? "Notification saved." : "Notification paused.",
    };
  } catch (error) {
    if (error instanceof AccountApiRequestError) {
      if (error.code === "notification_document_incompatible") {
        return failure(
          "Existing notifications need a source migration before editing. No changes were saved.",
        );
      }
      if (error.status === 409) {
        return failure("Notifications changed. Reload the page before saving again.");
      }
    }
    return failure(
      "Notifications could not be saved. Reload to check the latest state before trying again.",
    );
  }
}
