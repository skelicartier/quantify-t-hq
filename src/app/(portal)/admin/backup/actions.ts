"use server";

import { revalidatePath } from "next/cache";

import { requireStaff } from "@/lib/access/core";
import { approverText } from "@/lib/api/approval-schema";
import * as backupApi from "@/lib/api/backup";
import { HqApiRequestError } from "@/lib/api/core";
import { fieldValue, refusalMessage } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

/**
 * Ask for a backup when a second Owner exists: it waits for them, and the asker downloads
 * it from this page once it is approved.
 */
export async function requestBackupAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/admin/backup");
  if (context.me.role !== "owner")
    return { status: "error", message: "A backup is an Owner's to ask for." };
  const reason = fieldValue(formData, "reason", 400).trim();
  if (reason.length < 8) return { status: "error", message: "Say what the backup is for." };
  try {
    const asked = await backupApi.requestBackup(context.token, reason);
    revalidatePath("/admin/backup");
    revalidatePath("/admin/approvals");
    return {
      status: "sent",
      message: asked.pending_approval
        ? `Sent for approval: ${approverText(asked.approval)} must approve it within 48 hours. You will be mailed either way.`
        : "No second Owner exists, so the backup can be made now.",
      sentAt: Date.now(),
    };
  } catch (error) {
    if (error instanceof HqApiRequestError) {
      const request = error.details["request"];
      if (typeof request === "string")
        return { status: "error", message: `${request[0]!.toUpperCase()}${request.slice(1)}.` };
      return { status: "error", message: refusalMessage(error) };
    }
    throw error;
  }
}
