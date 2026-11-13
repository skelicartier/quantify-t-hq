"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasCapability, requireStaff, type StaffContext } from "@/lib/access/core";
import { fieldValue } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";
import * as merge from "@/lib/merge/api";
import { MERGE_ROLE_LINE } from "@/lib/merge/access";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

/**
 * Mail merge's writes. Each one checks for itself, as every action here does: the request
 * came from this portal, the person is signed in, their role may make mail leave, and,
 * for the two that open a door (the provider key, a real send), that they confirmed it is
 * them in the last ten minutes. Only then is the sender asked.
 */

const NOT_ALLOWED: ActionState = { status: "error", message: MERGE_ROLE_LINE };
const NEEDS_CODE: ActionState = {
  status: "error",
  message: "Confirm it's you first: enter a code from your authenticator app above.",
};
const MAX_FILE_BYTES = 3_500_000;

function sent(message: string | null): ActionState {
  return { status: "sent", message, sentAt: Date.now() };
}

function refresh(...paths: string[]): void {
  for (const path of ["/mail/merge", ...paths]) revalidatePath(path);
}

/** The sender's own sentence when it says no; a plain one when it is not there. */
function refusal(error: unknown): ActionState {
  if (error instanceof merge.MergeRequestError) return { status: "error", message: error.message };
  if (error instanceof merge.MergeUnavailableError)
    return { status: "error", message: "The sender is not running, so nothing was changed." };
  throw error;
}

async function gate(
  formData: FormData,
  path: string,
  options: { fresh?: boolean } = {},
): Promise<StaffContext | ActionState> {
  await requireSameOriginServerAction(formData);
  if (!merge.mergeConfigured())
    return { status: "error", message: "Mail merge is not set up here." };
  const context = await requireStaff(path);
  if (!hasCapability(context, "mail:send")) return NOT_ALLOWED;
  if (options.fresh && !context.me.sudo_fresh) return NEEDS_CODE;
  return context;
}

const refused = (value: StaffContext | ActionState): value is ActionState => "status" in value;

/** A spreadsheet's export as text: UTF-8, UTF-16 by its mark, or the old Windows page. */
function decode(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

// --- setup ----------------------------------------------------------------------------

export async function saveProviderKeyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/mail/merge/setup", { fresh: true });
  if (refused(context)) return context;
  const key = fieldValue(formData, "provider_key", 300).trim();
  if (!key) return { status: "error", message: "Paste the key first." };
  try {
    await merge.setProviderKey(key);
  } catch (error) {
    return refusal(error);
  }
  refresh("/mail/merge/setup");
  return sent("The provider accepted the key. The sender keeps it; it is not shown again.");
}

export async function removeProviderKeyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/mail/merge/setup", { fresh: true });
  if (refused(context)) return context;
  try {
    await merge.clearProviderKey();
  } catch (error) {
    return refusal(error);
  }
  refresh("/mail/merge/setup");
  return sent("The key is removed. Every send is practice until one is added.");
}

export async function checkProviderAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/mail/merge/setup");
  if (refused(context)) return context;
  try {
    await merge.checkProvider();
  } catch (error) {
    return refusal(error);
  }
  refresh("/mail/merge/setup");
  return sent("Checked with the provider.");
}

export async function saveMergeSettingsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/mail/merge/setup");
  if (refused(context)) return context;
  const input: Record<string, unknown> = {};
  for (const name of ["from_email", "from_name", "reply_to", "footer"]) {
    if (formData.has(name)) input[name] = fieldValue(formData, name, 1_200);
  }
  for (const name of ["per_minute", "daily_cap"]) {
    if (!formData.has(name)) continue;
    const raw = fieldValue(formData, name, 12).trim();
    if (!/^\d+$/.test(raw))
      return { status: "error", message: "The pace and the limit are whole numbers." };
    input[name] = Number.parseInt(raw, 10);
  }
  try {
    const status = await merge.saveMergeSettings(input);
    // A new sender address is asked about at once, where there is a key to ask with.
    if ("from_email" in input && status.provider.key_set && status.settings.from_email)
      await merge.checkProvider().catch(() => undefined);
  } catch (error) {
    return refusal(error);
  }
  refresh("/mail/merge/setup");
  return sent("Saved.");
}

export async function addStopsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/mail/merge/setup");
  if (refused(context)) return context;
  const emails = fieldValue(formData, "emails", 200_000);
  if (!emails.trim()) return { status: "error", message: "Paste the addresses first." };
  const reason = fieldValue(formData, "reason", 12) === "asked" ? "asked" : "manual";
  try {
    const result = await merge.addMergeStops(emails, reason);
    refresh("/mail/merge/setup");
    const parts = [`${result.added} added`];
    if (result.already > 0) parts.push(`${result.already} already there`);
    if (result.refused.length > 0)
      parts.push(
        `${result.refused.length} not addresses (${result.refused.slice(0, 3).join(", ")})`,
      );
    return sent(`${parts.join("; ")}.`);
  } catch (error) {
    return refusal(error);
  }
}

export async function removeStopAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/mail/merge/setup");
  if (refused(context)) return context;
  try {
    await merge.removeMergeStop(fieldValue(formData, "email", 254));
  } catch (error) {
    return refusal(error);
  }
  refresh("/mail/merge/setup");
  return sent("Taken off the stop list.");
}

export async function syncStopsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/mail/merge/setup");
  if (refused(context)) return context;
  try {
    const result = await merge.syncMergeStops();
    refresh("/mail/merge/setup");
    return sent(
      result.added > 0
        ? `${result.added} addresses the provider will not mail were added.`
        : "Nothing new: the provider is refusing nobody who is not already here.",
    );
  } catch (error) {
    return refusal(error);
  }
}

// --- lists ----------------------------------------------------------------------------

export async function importListAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/mail/merge");
  if (refused(context)) return context;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { status: "error", message: "Choose the file first." };
  if (file.size > MAX_FILE_BYTES)
    return {
      status: "error",
      message: "That file is over 3.5 MB. Split it into two and add each as its own list.",
    };
  let listId: string;
  try {
    const imported = await merge.importMergeList({
      name: fieldValue(formData, "name", 120).trim(),
      file_name: file.name.slice(0, 200),
      text: decode(new Uint8Array(await file.arrayBuffer())),
    });
    listId = imported.list.id;
  } catch (error) {
    return refusal(error);
  }
  refresh();
  redirect(`/mail/merge/lists/${encodeURIComponent(listId)}?added=1`);
}

/** The `value_<key>` fields of a form, as a person's words. */
function typedValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    if (name.startsWith("value_") && typeof value === "string")
      values[name.slice("value_".length)] = value.slice(0, 4_000);
  }
  return values;
}

export async function addRowAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const listId = fieldValue(formData, "list_id", 64);
  const context = await gate(formData, `/mail/merge/lists/${listId}`);
  if (refused(context)) return context;
  try {
    await merge.addMergeRow(listId, fieldValue(formData, "email", 254), typedValues(formData));
  } catch (error) {
    return refusal(error);
  }
  refresh(`/mail/merge/lists/${listId}`);
  return sent("Added to this list.");
}

export async function updateRowAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const listId = fieldValue(formData, "list_id", 64);
  const context = await gate(formData, `/mail/merge/lists/${listId}`);
  if (refused(context)) return context;
  try {
    await merge.updateMergeRow(listId, fieldValue(formData, "row_id", 64), {
      email: fieldValue(formData, "email", 254),
      values: typedValues(formData),
    });
  } catch (error) {
    return refusal(error);
  }
  refresh(`/mail/merge/lists/${listId}`);
  return sent("Saved. Drafts use this from now on; a send already going keeps what it had.");
}

export async function renameListAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const listId = fieldValue(formData, "list_id", 64);
  const context = await gate(formData, `/mail/merge/lists/${listId}`);
  if (refused(context)) return context;
  try {
    await merge.renameMergeList(listId, fieldValue(formData, "name", 120));
  } catch (error) {
    return refusal(error);
  }
  refresh(`/mail/merge/lists/${listId}`);
  return sent("Renamed.");
}

export async function deleteListAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const listId = fieldValue(formData, "list_id", 64);
  const context = await gate(formData, `/mail/merge/lists/${listId}`);
  if (refused(context)) return context;
  try {
    await merge.deleteMergeList(listId);
  } catch (error) {
    return refusal(error);
  }
  refresh();
  redirect("/mail/merge");
}

export async function removeRowAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const listId = fieldValue(formData, "list_id", 64);
  const context = await gate(formData, `/mail/merge/lists/${listId}`);
  if (refused(context)) return context;
  try {
    await merge.removeMergeRow(listId, fieldValue(formData, "row_id", 64));
  } catch (error) {
    return refusal(error);
  }
  refresh(`/mail/merge/lists/${listId}`);
  return sent(null);
}

// --- mailings -------------------------------------------------------------------------

const mailingPath = (mailingId: string) => `/mail/merge/mailings/${encodeURIComponent(mailingId)}`;

export async function createMailingAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/mail/merge");
  if (refused(context)) return context;
  let mailingId: string;
  try {
    mailingId = (await merge.createMergeMailing(fieldValue(formData, "name", 120))).mailing.id;
  } catch (error) {
    return refusal(error);
  }
  refresh();
  redirect(mailingPath(mailingId));
}

export async function saveMailingAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const mailingId = fieldValue(formData, "mailing_id", 64);
  const context = await gate(formData, mailingPath(mailingId));
  if (refused(context)) return context;
  const who = fieldValue(formData, "who", 12);
  try {
    await merge.updateMergeMailing(mailingId, {
      name: fieldValue(formData, "name", 120),
      subject: fieldValue(formData, "subject", 200),
      body: fieldValue(formData, "body", 20_001),
      list_ids: formData.getAll("list_ids").map(String).slice(0, 200),
      only_column: who === "where" ? fieldValue(formData, "only_column", 60) : "",
      only_value: who === "where" ? fieldValue(formData, "only_value", 200) : "",
      hold_column: fieldValue(formData, "hold_column", 60),
      pick_only: who === "picked",
      skip_written: formData.get("skip_written") === "on",
    });
  } catch (error) {
    return refusal(error);
  }
  refresh(mailingPath(mailingId));
  return sent("Saved. The preview and the checks below are of these words.");
}

export async function pickPersonAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const mailingId = fieldValue(formData, "mailing_id", 64);
  const context = await gate(formData, mailingPath(mailingId));
  if (refused(context)) return context;
  try {
    await merge.pickMergePeople(mailingId, {
      emails: [fieldValue(formData, "email", 254)],
      picked: fieldValue(formData, "picked", 2) === "1",
    });
  } catch (error) {
    return refusal(error);
  }
  refresh(mailingPath(mailingId));
  return sent(null);
}

export async function pickAllAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const mailingId = fieldValue(formData, "mailing_id", 64);
  const context = await gate(formData, mailingPath(mailingId));
  if (refused(context)) return context;
  const picked = fieldValue(formData, "picked", 2) === "1";
  try {
    const result = await merge.pickMergePeople(mailingId, {
      all: true,
      picked,
      q: fieldValue(formData, "q", 200),
    });
    refresh(mailingPath(mailingId));
    return sent(`${result.changed} ${picked ? "picked" : "taken off"}.`);
  } catch (error) {
    return refusal(error);
  }
}

export async function addPeopleAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const mailingId = fieldValue(formData, "mailing_id", 64);
  const context = await gate(formData, mailingPath(mailingId));
  if (refused(context)) return context;
  try {
    const result = await merge.addMergePeople(mailingId, {
      emails: fieldValue(formData, "emails", 60_000),
      values: typedValues(formData),
    });
    refresh(mailingPath(mailingId));
    const parts = [`${result.added} added`];
    if (result.already > 0) parts.push(`${result.already} already on the lists`);
    if (result.stopped > 0) parts.push(`${result.stopped} on the stop list, so left out`);
    if (result.refused.length > 0)
      parts.push(`not addresses: ${result.refused.slice(0, 3).join(", ")}`);
    return sent(`${parts.join("; ")}.`);
  } catch (error) {
    return refusal(error);
  }
}

export async function duplicateMailingAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const mailingId = fieldValue(formData, "mailing_id", 64);
  const context = await gate(formData, mailingPath(mailingId));
  if (refused(context)) return context;
  let copyId: string;
  try {
    copyId = (await merge.duplicateMergeMailing(mailingId)).mailing.id;
  } catch (error) {
    return refusal(error);
  }
  refresh();
  redirect(mailingPath(copyId));
}

export async function deleteMailingAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const mailingId = fieldValue(formData, "mailing_id", 64);
  const context = await gate(formData, mailingPath(mailingId));
  if (refused(context)) return context;
  try {
    await merge.deleteMergeMailing(mailingId);
  } catch (error) {
    return refusal(error);
  }
  refresh();
  redirect("/mail/merge");
}

export async function testMailingAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const mailingId = fieldValue(formData, "mailing_id", 64);
  const context = await gate(formData, mailingPath(mailingId));
  if (refused(context)) return context;
  try {
    const result = await merge.testMergeMailing(mailingId, fieldValue(formData, "to", 254));
    refresh(mailingPath(mailingId));
    return sent(`A test went to ${result.to}, made out as ${result.made_out_to}'s message.`);
  } catch (error) {
    return refusal(error);
  }
}

export async function practiseMailingAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const mailingId = fieldValue(formData, "mailing_id", 64);
  const context = await gate(formData, mailingPath(mailingId));
  if (refused(context)) return context;
  try {
    await merge.startMergeMailing(mailingId, { practice: true });
  } catch (error) {
    return refusal(error);
  }
  refresh(mailingPath(mailingId));
  return sent(null);
}

export async function startMailingAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const mailingId = fieldValue(formData, "mailing_id", 64);
  const context = await gate(formData, mailingPath(mailingId), { fresh: true });
  if (refused(context)) return context;
  const typed = fieldValue(formData, "confirm", 12).replace(/[\s,]/g, "");
  if (!/^\d+$/.test(typed))
    return { status: "error", message: "Type the number of people it goes to, to send." };
  try {
    await merge.startMergeMailing(mailingId, {
      practice: false,
      confirm: Number.parseInt(typed, 10),
    });
  } catch (error) {
    return refusal(error);
  }
  refresh(mailingPath(mailingId));
  return sent(null);
}

async function transition(
  formData: FormData,
  act: (mailingId: string) => Promise<unknown>,
): Promise<ActionState> {
  const mailingId = fieldValue(formData, "mailing_id", 64);
  const context = await gate(formData, mailingPath(mailingId));
  if (refused(context)) return context;
  try {
    await act(mailingId);
  } catch (error) {
    return refusal(error);
  }
  refresh(mailingPath(mailingId));
  return sent(null);
}

export async function pauseMailingAction(_previous: ActionState, formData: FormData) {
  return transition(formData, merge.pauseMergeMailing);
}

export async function resumeMailingAction(_previous: ActionState, formData: FormData) {
  return transition(formData, merge.resumeMergeMailing);
}

export async function cancelMailingAction(_previous: ActionState, formData: FormData) {
  return transition(formData, merge.cancelMergeMailing);
}
