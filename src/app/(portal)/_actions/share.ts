"use server";

import { revalidatePath } from "next/cache";

import { hasCapability, requireStaff } from "@/lib/access/core";
import * as archiveApi from "@/lib/api/archive";
import { HqApiRequestError } from "@/lib/api/core";
import * as quotesApi from "@/lib/api/quotes";
import * as shareApi from "@/lib/api/share";
import { fieldValue } from "@/lib/auth/forms";
import { crmRefusal } from "@/lib/crm/refusal";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

const GUID = /^[0-9a-fA-F-]{36}$/;

/** Send a record to colleagues with a line: it lands in their inbox as "Shared with you". */
export async function shareRecordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const subjectType = fieldValue(formData, "subject_type", 20);
  const subjectId = fieldValue(formData, "subject_id", 64);
  const context = await requireStaff(fieldValue(formData, "return_path", 200) || "/home");
  if (!(shareApi.SHAREABLE as readonly string[]).includes(subjectType) || !subjectId)
    return { status: "error", message: "That record cannot be shared from here." };
  const staffIds = formData
    .getAll("staff_ids")
    .map(String)
    .filter((value) => GUID.test(value))
    .slice(0, 10);
  if (staffIds.length === 0) return { status: "error", message: "Choose who to send it to." };
  try {
    const sent = await shareApi.shareRecord(context.token, {
      subject_type: subjectType as shareApi.Shareable,
      subject_id: subjectId,
      staff_ids: staffIds,
      note: fieldValue(formData, "note", 400).trim(),
    });
    return {
      status: "sent",
      message: `Sent to ${sent.shared_with === 1 ? "one colleague" : `${sent.shared_with} colleagues`}.`,
      sentAt: Date.now(),
    };
  } catch (error) {
    return crmRefusal(error);
  }
}

function refreshArchive(kind: archiveApi.ArchiveKind, id: string) {
  revalidatePath(`/${kind}`);
  revalidatePath(`/${kind}/${id}`);
  revalidatePath("/archive");
}

/** Off every list, kept whole: the record is archived with a reason. */
export async function archiveRecordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const kind = fieldValue(formData, "kind", 12) === "people" ? "people" : "companies";
  const id = fieldValue(formData, "record_id", 64);
  const context = await requireStaff(`/${kind}/${id}`);
  if (!hasCapability(context, "crm:write"))
    return { status: "error", message: "Your role cannot archive records." };
  if (!GUID.test(id)) return { status: "error", message: "That record is no longer available." };
  const reason = fieldValue(formData, "reason", 400).trim();
  if (reason.length < 4) return { status: "error", message: "Say why, in a few words." };
  try {
    await archiveApi.archiveRecord(context.token, kind, id, reason);
  } catch (error) {
    if (error instanceof HqApiRequestError && typeof error.details["archived"] === "string") {
      const why = String(error.details["archived"]);
      return { status: "error", message: `It stays: ${why}.` };
    }
    return crmRefusal(error);
  }
  refreshArchive(kind, id);
  return {
    status: "sent",
    message: "Archived. It is under Archived until it is put back.",
    sentAt: Date.now(),
  };
}

/** Back on every list, whole. */
export async function restoreRecordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const kind = fieldValue(formData, "kind", 12) === "people" ? "people" : "companies";
  const id = fieldValue(formData, "record_id", 64);
  const context = await requireStaff(`/${kind}/${id}`);
  if (!hasCapability(context, "crm:write"))
    return { status: "error", message: "Your role cannot put records back." };
  if (!GUID.test(id)) return { status: "error", message: "That record is no longer available." };
  try {
    await archiveApi.restoreRecord(context.token, kind, id);
  } catch (error) {
    if (error instanceof HqApiRequestError && typeof error.details["archived"] === "string") {
      const why = String(error.details["archived"]);
      return { status: "error", message: `It cannot come back: ${why}.` };
    }
    return crmRefusal(error);
  }
  refreshArchive(kind, id);
  return { status: "sent", message: "Put back.", sentAt: Date.now() };
}

/** A link for the quote's customer; its address is shown once, to the person who made it. */
export async function createQuoteLinkAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const dealId = fieldValue(formData, "deal_id", 64);
  const quoteId = fieldValue(formData, "quote_id", 64);
  const context = await requireStaff(`/deals/${dealId}/quotes/${quoteId}`);
  if (!hasCapability(context, "deals:write"))
    return { status: "error", message: "Your role cannot send quotes." };
  const days = Number(fieldValue(formData, "days", 3) || "30");
  try {
    const made = await quotesApi.createQuoteLink(context.token, quoteId, days);
    revalidatePath(`/deals/${dealId}/quotes/${quoteId}`);
    revalidatePath("/admin/links");
    return {
      status: "sent",
      message: "The customer's link. Copy it now: it is shown once, then only its views are.",
      secret: made.url,
      sentAt: Date.now(),
    };
  } catch (error) {
    return crmRefusal(error);
  }
}

export async function revokeQuoteLinkAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const dealId = fieldValue(formData, "deal_id", 64);
  const quoteId = fieldValue(formData, "quote_id", 64);
  const context = await requireStaff(`/deals/${dealId}/quotes/${quoteId}`);
  if (!hasCapability(context, "deals:write"))
    return { status: "error", message: "Your role cannot send quotes." };
  try {
    await quotesApi.revokeQuoteLink(context.token, quoteId, fieldValue(formData, "link_id", 64));
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath(`/deals/${dealId}/quotes/${quoteId}`);
  revalidatePath("/admin/links");
  return { status: "sent", message: "Revoked: the link now opens nothing.", sentAt: Date.now() };
}
