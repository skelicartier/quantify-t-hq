"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError } from "@/lib/api/core";
import * as kb from "@/lib/api/knowledge";
import { fieldValue, refusalMessage } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

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

function sent(message: string): ActionState {
  return { status: "sent", message, sentAt: Date.now() };
}

function collect(formData: FormData, fields: ReadonlyArray<readonly [string, number]>) {
  const body: Record<string, string> = {};
  for (const [name, limit] of fields) {
    if (formData.has(name)) body[name] = fieldValue(formData, name, limit).trim();
  }
  return body;
}

async function staffWith(formData: FormData, path: string, capability: string) {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff(path);
  return { context, allowed: hasCapability(context, capability) };
}

// --- the changelog ---------------------------------------------------------------------------------

export async function createEntryAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, allowed } = await staffWith(formData, "/success/changelog", "crm:write");
  if (!allowed)
    return { status: "error", message: "Your role reads the changelog; it does not write it." };
  let entryId = "";
  try {
    const body = collect(formData, [
      ["title", 160],
      ["kind", 10],
      ["request_id", 64],
    ]);
    if (!body.request_id) delete body.request_id;
    entryId = (await kb.createEntry(context.token, body)).entry.entry_id;
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/success/changelog");
  redirect(`/success/changelog/${entryId}`);
}

const ENTRY_SAID: Record<string, string> = {
  edit: "Saved.",
  link: "Linked.",
  unlink: "Unlinked.",
  publish:
    "Published. What it answers is marked shipped; tell the people who asked from each request.",
  unpublish: "Taken down.",
};

export async function entryAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const entryId = fieldValue(formData, "entry_id", 64);
  const { context, allowed } = await staffWith(
    formData,
    `/success/changelog/${entryId}`,
    "crm:write",
  );
  if (!allowed)
    return { status: "error", message: "Your role reads the changelog; it does not write it." };
  const action = fieldValue(formData, "action", 10);
  try {
    await kb.actOnEntry(context.token, entryId, {
      action,
      ...collect(formData, [
        ["title", 160],
        ["kind", 10],
        ["body", 20_000],
        ["request_id", 64],
        ["published_on", 10],
        ["reason", 400],
      ]),
    });
  } catch (error) {
    return refusal(error);
  }
  revalidatePath(`/success/changelog/${entryId}`);
  revalidatePath("/success/changelog");
  revalidatePath("/success/requests");
  revalidatePath("/changelog");
  return sent(ENTRY_SAID[action] ?? "Saved.");
}

// --- the help centre ---------------------------------------------------------------------------------

export async function createArticleAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, allowed } = await staffWith(formData, "/help", "tickets:write");
  if (!allowed) return { status: "error", message: "Articles are written by the desk." };
  let articleId = "";
  try {
    const body = collect(formData, [
      ["title", 200],
      ["category", 20],
      ["tags", 300],
      ["ticket_id", 40],
    ]);
    if (!body.ticket_id) delete body.ticket_id;
    articleId = (await kb.createArticle(context.token, body)).article.article_id;
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/help");
  redirect(`/help/${articleId}`);
}

const ARTICLE_SAID: Record<string, string> = {
  edit: "Saved.",
  publish: "Published. It comes up for review in its period.",
  archive: "Archived.",
  restore: "Back to a draft.",
  reviewed: "Marked as read again: the review clock restarts.",
  link_ticket: "Linked to the ticket.",
  unlink_ticket: "Unlinked.",
};

export async function articleAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const articleId = fieldValue(formData, "article_id", 64);
  const back = fieldValue(formData, "return_to", 200);
  const { context, allowed } = await staffWith(
    formData,
    back || `/help/${articleId}`,
    "tickets:write",
  );
  if (!allowed) return { status: "error", message: "Articles are written by the desk." };
  const action = fieldValue(formData, "action", 14);
  try {
    await kb.actOnArticle(context.token, articleId, {
      action,
      ...collect(formData, [
        ["title", 200],
        ["body", 20_000],
        ["category", 20],
        ["tags", 300],
        ["owner_staff_id", 64],
        ["review_every_days", 4],
        ["ticket_id", 40],
      ]),
    });
  } catch (error) {
    return refusal(error);
  }
  revalidatePath(`/help/${articleId}`);
  revalidatePath("/help");
  if (back.startsWith("/support/")) revalidatePath(back);
  return sent(ARTICLE_SAID[action] ?? "Saved.");
}
