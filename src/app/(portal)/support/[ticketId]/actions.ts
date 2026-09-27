"use server";

import { revalidatePath } from "next/cache";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import * as ticketsApi from "@/lib/api/tickets";
import { fieldValue } from "@/lib/auth/forms";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

import type { DeskActionState } from "@/lib/support/desk-state";

function deskRefusal(error: unknown): DeskActionState {
  if (error instanceof HqApiRequestError) {
    if (error.status === 404) {
      return { status: "error", message: "This conversation is no longer available." };
    }
    if (error.status === 403) {
      return { status: "error", message: "Your role cannot do that on the desk." };
    }
    if (error.code === "malformed_request") {
      return { status: "error", message: "That change was not accepted. Check the values." };
    }
  }
  if (error instanceof HqApiRequestError || error instanceof HqApiUnavailableError) {
    return {
      status: "error",
      message: "The desk could not be reached. Nothing was sent — your text is kept.",
    };
  }
  throw error;
}

/** One action for the composer: `mode` picks a public reply or an internal note. */
export async function sendMessage(
  _previous: DeskActionState,
  formData: FormData,
): Promise<DeskActionState> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/support");
  if (!hasCapability(context, "tickets:write")) {
    return { status: "error", message: "Your role cannot write on the desk." };
  }
  const ticketId = fieldValue(formData, "ticket_id", 64);
  const mode = fieldValue(formData, "mode", 16) === "note" ? "note" : "reply";
  const body = fieldValue(formData, "body", 8_000).trim();
  const usedReplyId = fieldValue(formData, "used_reply_id", 64);
  if (!body) return { status: "error", message: "Write something first." };
  try {
    if (mode === "note") {
      await ticketsApi.noteOnTicket(context.token, ticketId, body);
    } else {
      await ticketsApi.replyToTicket(context.token, ticketId, body);
    }
    if (usedReplyId && hasCapability(context, "tickets:manage")) {
      // Best effort: a lost usage count must never fail a sent reply.
      try {
        await ticketsApi.updateSavedReply(context.token, usedReplyId, { used: true });
      } catch {
        /* counted next time */
      }
    }
  } catch (error) {
    return deskRefusal(error);
  }
  revalidatePath(`/support/${ticketId}`);
  revalidatePath("/support");
  return { status: "sent", message: null, sentAt: Date.now() };
}

export async function manageTicketAction(
  _previous: DeskActionState,
  formData: FormData,
): Promise<DeskActionState> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/support");
  if (!hasCapability(context, "tickets:manage")) {
    return { status: "error", message: "Your role cannot run the queue." };
  }
  const ticketId = fieldValue(formData, "ticket_id", 64);
  const changes: ticketsApi.ManageChanges = {};
  if (formData.has("status")) {
    const status = fieldValue(formData, "status", 16);
    if (status) changes.status = status;
  }
  if (formData.has("priority")) {
    const priority = fieldValue(formData, "priority", 16);
    if (priority) changes.priority = priority;
  }
  if (formData.has("assignee_staff_id")) {
    changes.assignee_staff_id = fieldValue(formData, "assignee_staff_id", 64);
  }
  if (formData.has("tags")) {
    changes.tags = fieldValue(formData, "tags", 400)
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  if (formData.has("snoozed_until")) {
    changes.snoozed_until = fieldValue(formData, "snoozed_until", 40);
  }
  if (formData.has("linked_issue_url")) {
    changes.linked_issue_url = fieldValue(formData, "linked_issue_url", 400).trim();
  }
  if (Object.keys(changes).length === 0) {
    return { status: "error", message: "Nothing to change." };
  }
  try {
    await ticketsApi.manageTicket(context.token, ticketId, changes);
  } catch (error) {
    return deskRefusal(error);
  }
  revalidatePath(`/support/${ticketId}`);
  revalidatePath("/support");
  return { status: "sent", message: null, sentAt: Date.now() };
}
