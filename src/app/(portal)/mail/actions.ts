"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError } from "@/lib/api/core";
import * as mailApi from "@/lib/api/mail";
import { fieldValue } from "@/lib/auth/forms";
import { crmRefusal } from "@/lib/crm/refusal";
import { formatDate, pluralize } from "@/lib/format";
import type { ActionState } from "@/lib/forms/action-state";
import { domainOf, mailHostOf } from "@/lib/mail/mail-host";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

const NOT_WRITER: ActionState = {
  status: "error",
  message: "Your role reads mail without drafting it.",
};
const NOT_SENDER: ActionState = {
  status: "error",
  message: "Only an owner or admin makes mail leave: approving, scheduling, switching sending on.",
};
const NOT_ADMIN: ActionState = { status: "error", message: "Only HQ admins change mail settings." };

function refresh(...paths: string[]) {
  for (const path of ["/mail", ...paths]) revalidatePath(path);
}

function sent(message: string | null, extra: Partial<ActionState> = {}): ActionState {
  return { status: "sent", message, sentAt: Date.now(), ...extra };
}

function wholeNumber(formData: FormData, name: string): number | null {
  const raw = fieldValue(formData, name, 12).trim();
  if (!/^-?\d+$/.test(raw)) return null;
  return Number.parseInt(raw, 10);
}

function decimal(formData: FormData, name: string): number | null {
  const raw = fieldValue(formData, name, 12).trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  return Number.parseFloat(raw);
}

function jsonField<T>(formData: FormData, name: string, limit = 400_000): T | null {
  try {
    return JSON.parse(fieldValue(formData, name, limit)) as T;
  } catch {
    return null;
  }
}

// --- settings and senders -------------------------------------------------------------

export async function saveMailSettingsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/settings");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  const input: Record<string, unknown> = {};
  for (const name of [
    "global_daily_cap",
    "hourly_cap",
    "frequency_cap_per_week",
    "approval_threshold",
  ]) {
    if (!formData.has(name)) continue;
    const value = wholeNumber(formData, name);
    if (value === null) return { status: "error", message: "Caps are whole numbers." };
    input[name] = value;
  }
  for (const name of ["bounce_pause_pct", "complaint_pause_pct"]) {
    if (!formData.has(name)) continue;
    const value = decimal(formData, name);
    if (value === null) return { status: "error", message: "Pause thresholds are percentages." };
    input[name] = value;
  }
  for (const name of ["window_start", "window_end", "fallback_timezone", "postal_address"]) {
    if (formData.has(name)) input[name] = fieldValue(formData, name, 400).trim();
  }
  if (formData.has("seed_addresses")) {
    input.seed_addresses = fieldValue(formData, "seed_addresses", 1200)
      .split(/[\s,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (formData.has("sending_enabled")) {
    input.sending_enabled = fieldValue(formData, "sending_enabled", 4) === "1";
  }
  try {
    await mailApi.updateMailSettings(context.token, input);
  } catch (error) {
    return crmRefusal(error);
  }
  refresh("/mail/settings");
  return sent("Saved.");
}

export async function saveSenderAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/settings");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  const dailyCap = wholeNumber(formData, "daily_cap");
  if (dailyCap === null) return { status: "error", message: "The daily cap is a whole number." };
  const input: Record<string, unknown> = {
    from_email: fieldValue(formData, "from_email", 254).trim().toLowerCase(),
    from_name: fieldValue(formData, "from_name", 120).trim(),
    reply_to: fieldValue(formData, "reply_to", 254).trim().toLowerCase(),
    kind: fieldValue(formData, "kind", 12) || "marketing",
    staff_id: fieldValue(formData, "staff_id", 64) || null,
    daily_cap: dailyCap,
    verified: formData.get("verified") === "on",
    active: formData.get("active") !== null ? formData.get("active") === "on" : true,
  };
  const senderId = fieldValue(formData, "sender_id", 64);
  if (senderId) input.sender_id = senderId;
  try {
    await mailApi.saveSender(context.token, input);
  } catch (error) {
    return crmRefusal(error);
  }
  refresh("/mail/settings");
  return sent(senderId ? "Sender updated." : "Sender added.");
}

export async function checkSenderAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/settings");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  try {
    const answer = await mailApi.checkSender(context.token, fieldValue(formData, "sender_id", 64));
    refresh("/mail/settings", "/mail");
    return answer.check.status === "ok"
      ? sent(answer.check.detail)
      : { status: "error", message: answer.check.detail };
  } catch (error) {
    return crmRefusal(error);
  }
}

export async function pauseSenderAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/settings");
  if (!hasCapability(context, "mail:send")) return NOT_SENDER;
  const resume = fieldValue(formData, "resume", 4) === "1";
  try {
    const answer = await mailApi.pauseSender(context.token, fieldValue(formData, "sender_id", 64), {
      resume,
      note: fieldValue(formData, "note", 200),
    });
    refresh("/mail/settings", "/mail");
    return sent(
      resume
        ? `Resumed; ${answer.released ?? 0} held ${answer.released === 1 ? "email goes" : "emails go"} back in the queue.`
        : "Paused; its sequence mail waits until it is resumed.",
    );
  } catch (error) {
    return crmRefusal(error);
  }
}

export async function rotateWebhookAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/settings");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  try {
    const rotated = await mailApi.rotateMailWebhook(context.token);
    refresh("/mail/settings");
    return sent("Paste this into the provider's webhook settings. It is shown once.", {
      secret: rotated.webhook_url,
    });
  } catch (error) {
    return crmRefusal(error);
  }
}

export async function runWorkerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/settings");
  if (!hasCapability(context, "mail:send")) return NOT_SENDER;
  try {
    const { report } = await mailApi.runMailWorker(context.token);
    refresh("/mail/settings", "/mail/campaigns");
    const sentCount = Number(report.sent ?? 0);
    const deferred = Number(report.deferred ?? 0);
    return sent(
      report.paused
        ? "Sending is off or backing off; nothing was sent."
        : `${sentCount} sent, ${deferred} waiting for a cap or a window.`,
    );
  } catch (error) {
    return crmRefusal(error);
  }
}

// --- templates -------------------------------------------------------------------------

export async function saveTemplateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/templates");
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  const templateId = fieldValue(formData, "template_id", 64);
  const input: Record<string, unknown> = {
    name: fieldValue(formData, "name", 120).trim(),
    kind: fieldValue(formData, "kind", 12) || "campaign",
    subject: fieldValue(formData, "subject", 400).trim(),
    body_html: fieldValue(formData, "body_html", 200_000),
    body_text: fieldValue(formData, "body_text", 100_000),
  };
  if (templateId) input.template_id = templateId;
  let saved: Awaited<ReturnType<typeof mailApi.saveTemplate>>;
  try {
    saved = await mailApi.saveTemplate(context.token, input);
  } catch (error) {
    return crmRefusal(error);
  }
  refresh("/mail/templates", `/mail/templates/${saved.template.template_id}`);
  if (!templateId) redirect(`/mail/templates/${saved.template.template_id}`);
  return sent(`Saved as version ${saved.template.current_version}.`);
}

export async function archiveTemplateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/templates");
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  const templateId = fieldValue(formData, "template_id", 64);
  const restore = fieldValue(formData, "restore", 4) === "1";
  try {
    await mailApi.archiveTemplate(context.token, templateId, restore);
  } catch (error) {
    return crmRefusal(error);
  }
  refresh("/mail/templates", `/mail/templates/${templateId}`);
  return sent(restore ? "Restored." : "Archived. Campaigns already scheduled still send it.");
}

// --- segments ---------------------------------------------------------------------------

export async function saveSegmentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/segments");
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  const conditions = jsonField<string[]>(formData, "conditions_json", 8000) ?? [];
  const segmentId = fieldValue(formData, "segment_id", 64);
  const input: Record<string, unknown> = {
    name: fieldValue(formData, "name", 120).trim(),
    kind: fieldValue(formData, "kind", 8) || "people",
    conditions,
  };
  if (segmentId) input.segment_id = segmentId;
  try {
    const saved = await mailApi.saveSegment(context.token, input);
    refresh("/mail/segments");
    return sent(`Saved. ${saved.segment.last_count ?? 0} match today.`);
  } catch (error) {
    return crmRefusal(error);
  }
}

export async function previewSegmentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // A read: every check gets its own attempt, so changing the conditions never reuses a key.
  await requireSameOriginServerAction();
  const context = await requireStaff("/mail/segments");
  const conditions = jsonField<string[]>(formData, "conditions_json", 8000) ?? [];
  try {
    const preview = await mailApi.previewSegment(context.token, {
      kind: fieldValue(formData, "kind", 8) || "people",
      conditions,
      topic: fieldValue(formData, "topic", 20) || "updates",
    });
    return sent(null, { detail: JSON.stringify(preview) });
  } catch (error) {
    return crmRefusal(error);
  }
}

export async function archiveSegmentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/segments");
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  try {
    await mailApi.archiveSegment(
      context.token,
      fieldValue(formData, "segment_id", 64),
      fieldValue(formData, "restore", 4) === "1",
    );
  } catch (error) {
    return crmRefusal(error);
  }
  refresh("/mail/segments");
  return sent("Done.");
}

// --- mailing lists -------------------------------------------------------------------------

const LIST_STANDARD = ["first_name", "last_name", "company", "title", "country"] as const;

function listRowFrom(formData: FormData): mailApi.ListRow {
  const row: mailApi.ListRow = { email: fieldValue(formData, "email", 254).trim() };
  for (const name of LIST_STANDARD) {
    const value = fieldValue(formData, name, 200).trim();
    if (value) row[name] = value;
  }
  const fields: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("field:") || typeof value !== "string") continue;
    const text = value.trim().slice(0, 500);
    if (text) fields[key.slice(6)] = text;
  }
  if (Object.keys(fields).length) row.fields = fields;
  return row;
}

function basisOf(formData: FormData): string {
  return fieldValue(formData, "basis", 24) === "consent" ? "consent" : "legitimate_interest";
}

export async function saveListAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/lists");
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  const listId = fieldValue(formData, "list_id", 64);
  let saved: string;
  try {
    saved = (
      await mailApi.saveList(context.token, {
        ...(listId ? { list_id: listId } : {}),
        name: fieldValue(formData, "name", 120).trim(),
        description: fieldValue(formData, "description", 400).trim(),
      })
    ).list.list_id;
  } catch (error) {
    return crmRefusal(error);
  }
  refresh("/mail/lists", `/mail/lists/${saved}`);
  if (!listId) redirect(`/mail/lists/${saved}?tab=import`);
  return sent("Saved.");
}

/**
 * One part of an import. The browser reads the file, maps its columns and sends the rows
 * in parts of at most a thousand, calling this once per part; the page refreshes at the end.
 */
export async function importListAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/lists");
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  const rows = jsonField<mailApi.ListRow[]>(formData, "rows_json", 4_000_000) ?? [];
  if (!rows.length) return { status: "error", message: "No rows to send." };
  try {
    const result = await mailApi.importListRows(
      context.token,
      fieldValue(formData, "list_id", 64),
      {
        rows,
        basis: basisOf(formData),
        update_existing: formData.get("update_existing") === "on",
        label: fieldValue(formData, "label", 120),
      },
    );
    return sent(null, { detail: JSON.stringify(result) });
  } catch (error) {
    return crmRefusal(error);
  }
}

export async function addListMemberAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/lists");
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  const listId = fieldValue(formData, "list_id", 64);
  const member = listRowFrom(formData);
  if (!member.email) return { status: "error", message: "An email address is needed." };
  try {
    const result = await mailApi.addListMembers(context.token, listId, {
      member,
      basis: basisOf(formData),
    });
    refresh("/mail/lists", `/mail/lists/${listId}`);
    return sent(
      result.added
        ? `${member.email} is on the list.`
        : result.updated
          ? `${member.email} was on the list already; their details are updated.`
          : `${member.email} was on the list already.`,
    );
  } catch (error) {
    return crmRefusal(error);
  }
}

export async function addListContactsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/lists");
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  const listId = fieldValue(formData, "list_id", 64);
  const contacts =
    jsonField<{ kind: "person" | "lead"; id: string }[]>(formData, "contacts_json", 200_000) ?? [];
  if (!contacts.length) return { status: "error", message: "Choose at least one person or lead." };
  try {
    const result = await mailApi.addListMembers(context.token, listId, {
      contacts,
      basis: basisOf(formData),
    });
    refresh("/mail/lists", `/mail/lists/${listId}`);
    return sent(
      `Added ${result.added}; ${result.unchanged + result.updated} already on the list; ${result.skipped_count} skipped.`,
      { detail: JSON.stringify(result) },
    );
  } catch (error) {
    return crmRefusal(error);
  }
}

export async function updateListMemberAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/lists");
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  const listId = fieldValue(formData, "list_id", 64);
  const input: Record<string, unknown> = {};
  for (const name of LIST_STANDARD) input[name] = fieldValue(formData, name, 200).trim();
  // Every column the form showed is sent, so emptying one clears it.
  const fields: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("field:") && typeof value === "string") fields[key.slice(6)] = value.trim();
  }
  if (Object.keys(fields).length) input.fields = fields;
  try {
    await mailApi.updateListMember(
      context.token,
      listId,
      fieldValue(formData, "member_id", 64),
      input,
    );
  } catch (error) {
    return crmRefusal(error);
  }
  refresh(`/mail/lists/${listId}`);
  return sent("Saved.");
}

export async function removeListMembersAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/lists");
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  const listId = fieldValue(formData, "list_id", 64);
  // Ticked rows arrive as repeated `member_id` fields; a script may send a JSON list instead.
  const ticked = formData.getAll("member_id").map(String).filter(Boolean);
  const ids = ticked.length
    ? ticked
    : (jsonField<string[]>(formData, "member_ids_json", 1_000_000) ?? []);
  if (!ids.length) return { status: "error", message: "Choose who to take off the list." };
  try {
    const result = await mailApi.removeListMembers(context.token, listId, ids);
    refresh("/mail/lists", `/mail/lists/${listId}`);
    return sent(
      `${result.removed} taken off the list. Anything recorded about their addresses (a stop, a bounce, consent) stays.`,
    );
  } catch (error) {
    return crmRefusal(error);
  }
}

export async function archiveListAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/lists");
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  const listId = fieldValue(formData, "list_id", 64);
  const restore = fieldValue(formData, "restore", 4) === "1";
  try {
    await mailApi.archiveList(context.token, listId, restore);
  } catch (error) {
    return crmRefusal(error);
  }
  refresh("/mail/lists", `/mail/lists/${listId}`);
  return sent(
    restore ? "Restored." : "Archived. Nobody can be added and no new campaign can use it.",
  );
}

// --- campaigns ---------------------------------------------------------------------------

function campaignInput(formData: FormData): Record<string, unknown> | ActionState {
  const kind = fieldValue(formData, "audience_kind", 12);
  let audience: Record<string, unknown>;
  if (kind === "segment") {
    audience = { kind, segment_id: fieldValue(formData, "segment_id", 64) };
    // "The first N, best fit first": empty means everyone who matches.
    const cap = fieldValue(formData, "audience_limit", 8).trim();
    if (cap) {
      const limit = Number(cap);
      if (!Number.isInteger(limit) || limit < 1 || limit > 25_000)
        return {
          status: "error",
          message: "Send to at most: a whole number from 1 to 25,000, or empty for everyone.",
        };
      audience.limit = limit;
    }
  } else if (kind === "people" || kind === "leads" || kind === "companies") {
    const ids = jsonField<string[]>(formData, "audience_ids", 200_000) ?? [];
    audience = { kind, ids };
  } else if (kind === "csv") {
    const rows = jsonField<Record<string, string>[]>(formData, "csv_rows", 2_000_000) ?? [];
    audience = { kind, rows, label: fieldValue(formData, "csv_label", 120) };
  } else if (kind === "list") {
    audience = { kind, list_id: fieldValue(formData, "list_id", 64) };
  } else {
    return { status: "error", message: "Choose who it goes to." };
  }
  return {
    name: fieldValue(formData, "name", 160).trim(),
    sender_id: fieldValue(formData, "sender_id", 64),
    template_id: fieldValue(formData, "template_id", 64),
    topic: fieldValue(formData, "topic", 20) || "updates",
    audience,
    send_anytime: formData.get("send_anytime") === "on",
    dry_run: formData.get("dry_run") === "on",
  };
}

export async function createCampaignAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/campaigns/new");
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  const input = campaignInput(formData);
  if ("status" in input) return input as ActionState;
  let campaignId: string;
  try {
    campaignId = (await mailApi.createCampaign(context.token, input)).campaign.campaign_id;
  } catch (error) {
    return crmRefusal(error);
  }
  refresh("/mail/campaigns");
  redirect(`/mail/campaigns/${campaignId}`);
}

export async function updateCampaignAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/campaigns");
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  const campaignId = fieldValue(formData, "campaign_id", 64);
  const input = campaignInput(formData);
  if ("status" in input) return input as ActionState;
  try {
    await mailApi.updateCampaign(context.token, campaignId, input);
  } catch (error) {
    return crmRefusal(error);
  }
  refresh("/mail/campaigns", `/mail/campaigns/${campaignId}`);
  redirect(`/mail/campaigns/${campaignId}`);
}

export async function testCampaignAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/campaigns");
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  const campaignId = fieldValue(formData, "campaign_id", 64);
  const toEmail = fieldValue(formData, "to_email", 254).trim().toLowerCase();
  try {
    const result = await mailApi.testCampaign(
      context.token,
      campaignId,
      toEmail ? { to_email: toEmail } : {},
    );
    refresh(`/mail/campaigns/${campaignId}`);
    return result.status === "sent"
      ? sent(`Test sent to ${toEmail || context.me.staff.email}.`)
      : {
          status: "error",
          message: `The provider refused the test (${result.error_code || result.status}).`,
        };
  } catch (error) {
    return crmRefusal(error);
  }
}

export async function submitCampaignAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/campaigns");
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  const campaignId = fieldValue(formData, "campaign_id", 64);
  try {
    const result = await mailApi.submitCampaign(context.token, campaignId);
    refresh("/mail/campaigns", `/mail/campaigns/${campaignId}`, "/home");
    return sent(
      result.requires_approval
        ? `Sent for approval: ${result.eligible} recipients. A second owner or admin approves it.`
        : `Approved: ${result.eligible} recipients. Schedule it when ready.`,
    );
  } catch (error) {
    return crmRefusal(error);
  }
}

export async function decideCampaignAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/campaigns");
  if (!hasCapability(context, "mail:send")) return NOT_SENDER;
  const campaignId = fieldValue(formData, "campaign_id", 64);
  const decision = fieldValue(formData, "decision", 8) === "decline" ? "decline" : "approve";
  try {
    await mailApi.decideCampaign(
      context.token,
      campaignId,
      decision,
      fieldValue(formData, "note", 400),
    );
  } catch (error) {
    const refusal = crmRefusal(error);
    if (
      error &&
      typeof error === "object" &&
      "details" in error &&
      (error as { details: Record<string, unknown> }).details["reason"] === "own-request"
    ) {
      return {
        status: "error",
        message: "A campaign is approved by somebody other than its author.",
      };
    }
    return refusal;
  }
  refresh("/mail/campaigns", `/mail/campaigns/${campaignId}`, "/home");
  return sent(decision === "approve" ? "Approved." : "Sent back to draft.");
}

export async function scheduleCampaignAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/campaigns");
  if (!hasCapability(context, "mail:send")) return NOT_SENDER;
  const campaignId = fieldValue(formData, "campaign_id", 64);
  const when = fieldValue(formData, "scheduled_at", 40).trim();
  let iso = "";
  if (when) {
    const parsed = new Date(when);
    if (Number.isNaN(parsed.getTime()))
      return { status: "error", message: "Pick a date and time." };
    iso = parsed.toISOString();
  }
  try {
    const result = await mailApi.scheduleCampaign(context.token, campaignId, iso);
    refresh("/mail/campaigns", `/mail/campaigns/${campaignId}`, "/home");
    return sent(
      result.state === "running"
        ? `Sending to ${result.eligible} people, in each recipient's working hours.`
        : `Scheduled: ${result.eligible} recipients.`,
    );
  } catch (error) {
    return crmRefusal(error);
  }
}

export async function campaignControlAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/campaigns");
  if (!hasCapability(context, "mail:send")) return NOT_SENDER;
  const campaignId = fieldValue(formData, "campaign_id", 64);
  const op = fieldValue(formData, "op", 10);
  const note = fieldValue(formData, "note", 400);
  try {
    if (op === "pause") await mailApi.pauseCampaign(context.token, campaignId, note);
    else if (op === "resume") await mailApi.resumeCampaign(context.token, campaignId, note);
    else if (op === "cancel") await mailApi.cancelCampaign(context.token, campaignId, note);
    else return { status: "error", message: "Unknown step." };
  } catch (error) {
    return crmRefusal(error);
  }
  refresh("/mail/campaigns", `/mail/campaigns/${campaignId}`);
  return sent(op === "pause" ? "Paused." : op === "resume" ? "Resumed." : "Cancelled.");
}

// --- sequences ---------------------------------------------------------------------------

export async function saveSequenceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/sequences");
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  const sequenceId = fieldValue(formData, "sequence_id", 64);
  const steps = jsonField<Record<string, unknown>[]>(formData, "steps_json", 40_000);
  if (!steps) return { status: "error", message: "The steps could not be read." };
  const numbers: Record<string, number> = {};
  for (const name of ["cooling_days", "recent_contact_days", "company_limit"]) {
    const value = wholeNumber(formData, name);
    if (value === null) return { status: "error", message: "The limits are whole numbers." };
    numbers[name] = value;
  }
  const input: Record<string, unknown> = {
    name: fieldValue(formData, "name", 120).trim(),
    kind: fieldValue(formData, "kind", 10) || "prospect",
    sender_id: fieldValue(formData, "sender_id", 64) || null,
    steps,
    ...numbers,
  };
  if (sequenceId) input.sequence_id = sequenceId;
  let savedId: string;
  try {
    savedId = (await mailApi.saveSequence(context.token, input)).sequence.sequence_id;
  } catch (error) {
    return crmRefusal(error);
  }
  refresh("/mail/sequences", `/mail/sequences/${savedId}`);
  if (!sequenceId) redirect(`/mail/sequences/${savedId}`);
  return sent("Saved. People already enrolled carry on with the steps as they now stand.");
}

export async function sequenceStateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/sequences");
  if (!hasCapability(context, "mail:send")) return NOT_SENDER;
  const sequenceId = fieldValue(formData, "sequence_id", 64);
  const state = fieldValue(formData, "state", 10);
  try {
    const result = await mailApi.setSequenceState(context.token, sequenceId, state);
    refresh("/mail/sequences", `/mail/sequences/${sequenceId}`);
    return sent(
      state === "archived"
        ? `Archived; ${result.ended} enrolments ended.`
        : state === "active"
          ? "Live."
          : "Paused.",
    );
  } catch (error) {
    return crmRefusal(error);
  }
}

type Contact = { kind: "person" | "lead"; id: string };

function contactsFrom(formData: FormData): Contact[] {
  const raw = jsonField<Contact[]>(formData, "contacts_json", 20_000) ?? [];
  return raw.filter(
    (item) => (item.kind === "person" || item.kind === "lead") && typeof item.id === "string",
  );
}

/** What a feed with this segment and cap would take today — a read, so no attempt key. */
export async function feedPreviewAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/mail/sequences");
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  const cap = wholeNumber(formData, "daily_cap");
  if (cap === null || cap < 1)
    return { status: "error", message: "Say how many a day, as a whole number." };
  try {
    const judged = await mailApi.previewFeed(
      context.token,
      fieldValue(formData, "sequence_id", 64),
      { segment_id: fieldValue(formData, "segment_id", 64), daily_cap: cap },
    );
    return sent(null, { detail: JSON.stringify(judged) });
  } catch (error) {
    return crmRefusal(error);
  }
}

/** A standing take from a segment: the sequence enrols up to the cap every day. */
export async function feedCreateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/sequences");
  if (!hasCapability(context, "mail:send")) return NOT_SENDER;
  const sequenceId = fieldValue(formData, "sequence_id", 64);
  const cap = wholeNumber(formData, "daily_cap");
  if (cap === null || cap < 1)
    return { status: "error", message: "Say how many a day, as a whole number." };
  try {
    const result = await mailApi.createFeed(context.token, sequenceId, {
      segment_id: fieldValue(formData, "segment_id", 64),
      daily_cap: cap,
      note: fieldValue(formData, "note", 400).trim(),
    });
    refresh("/mail/sequences", `/mail/sequences/${sequenceId}`);
    return sent(
      `Started: up to ${result.feed.daily_cap} a day from “${result.feed.segment.name}”. Today's take would be ${result.today.would_enrol}; it runs with the next sending pass.`,
    );
  } catch (error) {
    return crmRefusal(error);
  }
}

/** A feed paused, resumed, ended, or given a new cap. */
export async function feedUpdateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/sequences");
  if (!hasCapability(context, "mail:send")) return NOT_SENDER;
  const sequenceId = fieldValue(formData, "sequence_id", 64);
  const input: Record<string, unknown> = {};
  const state = fieldValue(formData, "state", 10);
  if (state) input.state = state;
  if (formData.has("daily_cap")) {
    const cap = wholeNumber(formData, "daily_cap");
    if (cap === null || cap < 1)
      return { status: "error", message: "Say how many a day, as a whole number." };
    input.daily_cap = cap;
  }
  try {
    const result = await mailApi.updateFeed(
      context.token,
      fieldValue(formData, "feed_id", 64),
      input,
    );
    refresh("/mail/sequences", `/mail/sequences/${sequenceId}`);
    return sent(
      result.feed.state === "ended"
        ? "Ended. Its record stays."
        : result.feed.state === "paused"
          ? "Paused: no take until it is resumed."
          : `Taking up to ${result.feed.daily_cap} a day.`,
    );
  } catch (error) {
    return crmRefusal(error);
  }
}

/** The next slice of a capped send: a new draft, opened for review. */
export async function continueCampaignAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/campaigns");
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  const campaignId = fieldValue(formData, "campaign_id", 64);
  const raw = fieldValue(formData, "limit", 8).trim();
  const limit = raw ? wholeNumber(formData, "limit") : null;
  if (raw && (limit === null || limit < 1))
    return {
      status: "error",
      message: "The cap is a whole number, or empty to keep the same one.",
    };
  let nextId: string;
  try {
    nextId = (await mailApi.continueCampaign(context.token, campaignId, limit)).campaign
      .campaign_id;
  } catch (error) {
    return crmRefusal(error);
  }
  refresh("/mail/campaigns", `/mail/campaigns/${campaignId}`);
  redirect(`/mail/campaigns/${nextId}`);
}

export async function enrolPreviewAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // A read: every check gets its own attempt, so changing the conditions never reuses a key.
  await requireSameOriginServerAction();
  const context = await requireStaff("/mail/sequences");
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  const contacts = contactsFrom(formData);
  if (contacts.length === 0)
    return { status: "error", message: "Choose at least one person or lead." };
  try {
    const preview = await mailApi.previewEnrolment(
      context.token,
      fieldValue(formData, "sequence_id", 64),
      contacts,
    );
    return sent(null, { detail: JSON.stringify(preview) });
  } catch (error) {
    return crmRefusal(error);
  }
}

export async function enrolAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/sequences");
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  const sequenceId = fieldValue(formData, "sequence_id", 64);
  const contacts = contactsFrom(formData);
  if (contacts.length === 0)
    return { status: "error", message: "Choose at least one person or lead." };
  try {
    const result = await mailApi.enrol(context.token, sequenceId, contacts);
    refresh("/mail/sequences", `/mail/sequences/${sequenceId}`, "/mail/replies");
    const skipped = result.verdicts.filter((row) => !row.allowed);
    return sent(
      `${result.enrolled} enrolled${skipped.length ? `; ${skipped.length} skipped` : ""}.`,
      { detail: JSON.stringify({ verdicts: result.verdicts }) },
    );
  } catch (error) {
    return crmRefusal(error);
  }
}

export async function outcomeAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/replies");
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  const enrolmentId = fieldValue(formData, "enrolment_id", 64);
  const outcome = fieldValue(formData, "outcome", 30);
  const input: { outcome: string; note?: string; pause_until?: string } = { outcome };
  const note = fieldValue(formData, "note", 400).trim();
  if (note) input.note = note;
  const until = fieldValue(formData, "pause_until", 10).trim();
  if (until) input.pause_until = until;
  try {
    await mailApi.recordOutcome(context.token, enrolmentId, input);
  } catch (error) {
    return crmRefusal(error);
  }
  refresh("/mail/replies", "/mail/sequences", "/home");
  return sent(
    outcome === "out_of_office" ? "Paused until they are back." : "Recorded; the sequence ended.",
  );
}

/** A person says what a reply read back from a mailbox was. */
export async function handleReplyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/replies");
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  const outcome = fieldValue(formData, "outcome", 30);
  try {
    await mailApi.handleReply(context.token, fieldValue(formData, "reply_id", 64), { outcome });
  } catch (error) {
    return crmRefusal(error);
  }
  refresh("/mail/replies", "/mail/sequences", "/mail/mailboxes", "/home");
  return sent(outcome === "dismissed" ? "Nothing recorded." : "Recorded.");
}

export async function resumeEnrolmentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/replies");
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  try {
    await mailApi.resumeEnrolment(context.token, fieldValue(formData, "enrolment_id", 64));
  } catch (error) {
    return crmRefusal(error);
  }
  refresh("/mail/replies", "/mail/sequences");
  return sent("Carrying on.");
}

// --- the stop list and consent -------------------------------------------------------------

export async function addSuppressionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/suppressions");
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  // One address, or every address at a firm's web domain.
  const domain = fieldValue(formData, "domain", 255).trim().toLowerCase();
  try {
    const result = await mailApi.addSuppression(
      context.token,
      domain ? { domain } : { email: fieldValue(formData, "email", 254).trim() },
      fieldValue(formData, "detail", 400).trim(),
    );
    refresh("/mail/suppressions", "/leads/rules");
    return sent(
      `${domain ? "The firm is stopped" : "Stopped"}. ${result.cancelled ? `${result.cancelled} queued ${result.cancelled === 1 ? "message" : "messages"} cancelled.` : "Nothing was queued."}`,
    );
  } catch (error) {
    return crmRefusal(error);
  }
}

export async function releaseSuppressionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/mail/suppressions");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  try {
    await mailApi.releaseSuppression(
      context.token,
      fieldValue(formData, "suppression_id", 64),
      fieldValue(formData, "note", 400).trim(),
    );
  } catch (error) {
    return crmRefusal(error);
  }
  refresh("/mail/suppressions");
  return sent("Released. Mail may go to this address again.");
}

export async function setConsentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const returnPath = fieldValue(formData, "return_path", 200) || "/mail";
  const context = await requireStaff(returnPath);
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  const input: Record<string, unknown> = {
    email: fieldValue(formData, "email", 254).trim(),
    marketing_state: fieldValue(formData, "marketing_state", 14) || "unknown",
    topics_off: formData.getAll("topics_off").map(String),
    sales_stop: formData.get("sales_stop") === "on",
    lawful_basis: fieldValue(formData, "lawful_basis", 24),
    timezone: fieldValue(formData, "timezone", 64).trim(),
    source: "manual",
  };
  try {
    await mailApi.setConsent(context.token, input);
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath(returnPath);
  return sent("Saved.");
}

// --- from a record: one person or lead into a sequence ------------------------------------

export async function enrolOneAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const returnPath = fieldValue(formData, "return_path", 200) || "/mail/sequences";
  const context = await requireStaff(returnPath);
  if (!hasCapability(context, "crm:write")) return NOT_WRITER;
  const kind = fieldValue(formData, "contact_kind", 8) === "lead" ? "lead" : "person";
  const contactId = fieldValue(formData, "contact_id", 64);
  const sequenceId = fieldValue(formData, "sequence_id", 64);
  if (!sequenceId) return { status: "error", message: "Choose a sequence." };
  try {
    const result = await mailApi.enrol(context.token, sequenceId, [{ kind, id: contactId }]);
    revalidatePath(returnPath);
    refresh("/mail/sequences", `/mail/sequences/${sequenceId}`);
    if (result.enrolled === 1)
      return sent("Enrolled. The first email goes in their working hours.");
    const verdict = result.verdicts[0];
    const label = verdict
      ? (mailApi.SKIP_REASON_LABELS[verdict.reason] ?? verdict.reason)
      : "refused";
    return { status: "error", message: `Not enrolled: ${label}.` };
  } catch (error) {
    return crmRefusal(error);
  }
}

// --- connected mailboxes ----------------------------------------------------------------

const MAILBOXES = "/mail/mailboxes";

const NOT_MAILBOX_WRITER: ActionState = {
  status: "error",
  message: "Your role reads mail without connecting a mailbox.",
};
const NOT_POOL_ADMIN: ActionState = {
  status: "error",
  message: "Only an owner or admin declares a mailbox warm or sets the pool's ceilings.",
};

function sentence(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** A refused mailbox change, in the words of what went wrong. */
function mailboxRefusal(error: unknown): ActionState {
  if (error instanceof HqApiRequestError) {
    const said = (name: string) => {
      const value = error.details[name];
      return typeof value === "string" ? value : "";
    };
    const reason = said("reason");
    if (reason === "sign-in-refused")
      return {
        status: "error",
        message: `The server refused that password${said("password") ? ` (${said("password")})` : ""}. Nothing was kept.`,
      };
    if (reason === "server-unreachable")
      return {
        status: "error",
        message: `${sentence(said("smtp_host") || "nothing answered at that server")}. Check its name and port; nothing was kept.`,
      };
    if (reason === "check-failed")
      return {
        status: "error",
        message: `The server did not accept the sign-in${said("password") ? ` (${said("password")})` : ""}. Nothing was kept.`,
      };
    if (reason === "address-in-use")
      return {
        status: "error",
        message: "This address is already a sender under Settings, so it cannot be a mailbox too.",
      };
    if (reason === "someone-else's" || reason === "someone-else's mailbox")
      return {
        status: "error",
        message: "A colleague connected this mailbox. Only they, or an admin, can change it.",
      };
    if (reason === "not-configured")
      return {
        status: "error",
        message:
          "The service is not set up to keep a mailbox's sign-in yet. An owner gives it its key first.",
      };
  }
  return crmRefusal(error);
}

function connectedMessage(mailbox: mailApi.Mailbox): string {
  return mailbox.phase === "warming" && mailbox.ready_on
    ? `Connected ${mailbox.address}. It sends nothing before ${formatDate(mailbox.ready_on)}, then climbs from ${mailbox.ramp_from} a day.`
    : `Connected ${mailbox.address}. It may send today, climbing from ${mailbox.ramp_from} a day.`;
}

/**
 * Connect the caller's own mailbox, starting from its address. Where the address's mail
 * lives decides the way in: a host with its own consent screen is sent there; any other
 * comes back to the server form, filled in where its servers are known.
 */
export async function connectMailboxAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff(MAILBOXES);
  if (!hasCapability(context, "crm:write")) return NOT_MAILBOX_WRITER;
  const address = fieldValue(formData, "address", 254).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address))
    return { status: "error", message: "Type the mailbox's whole address." };
  const domain = domainOf(address);
  const host = await mailHostOf(address);
  if (host.kind === "none")
    return { status: "error", message: `Nothing receives mail for ${domain}. Check the address.` };
  if (host.kind === "unknown")
    return {
      status: "error",
      message: `Where ${domain}'s mail lives could not be looked up just now. Try again, or add the mailbox by its server below.`,
    };
  if (host.kind === "server") {
    const query = new URLSearchParams({ add: address });
    if (host.servers) {
      query.set("smtp", host.servers.smtp_host);
      query.set("port", String(host.servers.smtp_port));
      query.set("imap", host.servers.imap_host);
    }
    redirect(`${MAILBOXES}?${query.toString()}#add-mailbox`);
  }
  let target: string;
  try {
    target = (await mailApi.startMailboxConnect(context.token, host.kind, address))
      .authorization_url;
  } catch (error) {
    if (error instanceof HqApiRequestError && error.details["reason"] === "not-configured")
      return {
        status: "error",
        message: `Mail for ${domain} signs in through its host's own consent screen, which the service is not set up for yet. Until it is, add the mailbox by its server and an app password below.`,
      };
    return mailboxRefusal(error);
  }
  redirect(target);
}

/** A mailbox on any other host, by its servers and an app password. */
export async function addMailboxAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff(MAILBOXES);
  if (!hasCapability(context, "crm:write")) return NOT_MAILBOX_WRITER;
  const smtpPort = wholeNumber(formData, "smtp_port");
  const imapPort = wholeNumber(formData, "imap_port");
  if (smtpPort === null || imapPort === null)
    return { status: "error", message: "Ports are whole numbers, such as 465 and 993." };
  const input: Record<string, unknown> = {
    address: fieldValue(formData, "address", 254).trim().toLowerCase(),
    display_name: fieldValue(formData, "display_name", 120).trim(),
    smtp_host: fieldValue(formData, "smtp_host", 253).trim().toLowerCase(),
    smtp_port: smtpPort,
    imap_host: fieldValue(formData, "imap_host", 253).trim().toLowerCase(),
    imap_port: imapPort,
    password: fieldValue(formData, "password", 256),
  };
  const username = fieldValue(formData, "username", 254).trim();
  if (username) input.username = username;
  try {
    const result = await mailApi.addMailbox(context.token, input);
    refresh(MAILBOXES, "/leads/rules");
    return sent(connectedMessage(result.mailbox));
  } catch (error) {
    return mailboxRefusal(error);
  }
}

/** A mailbox's pace and the name its recipients see. */
export async function updateMailboxAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff(MAILBOXES);
  if (!hasCapability(context, "crm:write")) return NOT_MAILBOX_WRITER;
  const input: Record<string, unknown> = {};
  for (const name of ["daily_cap", "ramp_from", "ramp_step", "gap_minutes", "gap_jitter_minutes"]) {
    if (!formData.has(name)) continue;
    const value = wholeNumber(formData, name);
    if (value === null) return { status: "error", message: "A pace is in whole numbers." };
    input[name] = value;
  }
  if (formData.has("display_name"))
    input.display_name = fieldValue(formData, "display_name", 120).trim();
  try {
    await mailApi.updateMailbox(context.token, fieldValue(formData, "mailbox_id", 64), input);
  } catch (error) {
    return mailboxRefusal(error);
  }
  refresh(MAILBOXES, "/leads/rules");
  return sent("Saved. The new pace applies from its next send.");
}

export async function readyMailboxAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff(MAILBOXES);
  if (!hasCapability(context, "hq:admin")) return NOT_POOL_ADMIN;
  const reason = fieldValue(formData, "reason", 400).trim();
  if (reason.length < 4) return { status: "error", message: "Say why it is already warm." };
  try {
    const result = await mailApi.readyMailbox(
      context.token,
      fieldValue(formData, "mailbox_id", 64),
      reason,
    );
    refresh(MAILBOXES, "/leads/rules");
    return sent(`It may send from today, climbing from ${result.mailbox.ramp_from} a day.`);
  } catch (error) {
    return mailboxRefusal(error);
  }
}

/** Pause a mailbox (what is queued on it waits) or let it send again. */
export async function mailboxStateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff(MAILBOXES);
  if (!hasCapability(context, "crm:write")) return NOT_MAILBOX_WRITER;
  const state = fieldValue(formData, "state", 8) === "paused" ? "paused" : "active";
  try {
    const result = await mailApi.setMailboxState(
      context.token,
      fieldValue(formData, "mailbox_id", 64),
      state,
    );
    refresh(MAILBOXES, "/leads/rules");
    if (state === "paused") return sent("Paused. What is queued on it waits.");
    return sent(
      result.released > 0
        ? `Sending again: ${pluralize(result.released, "held message")} released.`
        : "Sending again.",
    );
  } catch (error) {
    return mailboxRefusal(error);
  }
}

/** Read a mailbox's replies now, rather than on the next pass. */
export async function readMailboxNowAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff(MAILBOXES);
  if (!hasCapability(context, "crm:write")) return NOT_MAILBOX_WRITER;
  try {
    const result = await mailApi.readMailboxNow(
      context.token,
      fieldValue(formData, "mailbox_id", 64),
    );
    refresh(MAILBOXES, "/mail/replies", "/home");
    if (result.read.error)
      return {
        status: "error",
        message: `Its inbox could not be read: ${result.mailbox.last_poll_error || result.read.error}.`,
      };
    return sent(
      result.read.kept === 0
        ? "Read: nothing new answers our mail."
        : `Read: ${pluralize(result.read.kept, "reply", "replies")} kept, under Replies.`,
    );
  } catch (error) {
    return mailboxRefusal(error);
  }
}

/** Sign in and say nothing: proof it can send, without sending anything. */
export async function checkMailboxAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff(MAILBOXES);
  if (!hasCapability(context, "crm:write")) return NOT_MAILBOX_WRITER;
  try {
    const result = await mailApi.checkMailbox(
      context.token,
      fieldValue(formData, "mailbox_id", 64),
    );
    refresh(MAILBOXES);
    return result.check.ok
      ? sent("Signed in: it can send.")
      : {
          status: "error",
          message: `It could not sign in: ${result.check.detail || result.check.kind}.`,
        };
  } catch (error) {
    return mailboxRefusal(error);
  }
}

export async function disconnectMailboxAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff(MAILBOXES);
  if (!hasCapability(context, "crm:write")) return NOT_MAILBOX_WRITER;
  const reason = fieldValue(formData, "reason", 400).trim();
  if (reason.length < 4) return { status: "error", message: "Say why it is being disconnected." };
  try {
    const result = await mailApi.disconnectMailbox(
      context.token,
      fieldValue(formData, "mailbox_id", 64),
      reason,
    );
    refresh(MAILBOXES, "/leads/rules");
    return sent(
      result.held > 0
        ? `Disconnected. ${pluralize(result.held, "queued message")} ${result.held === 1 ? "waits" : "wait"} for it to be connected again.`
        : "Disconnected. Nothing was queued on it.",
    );
  } catch (error) {
    return mailboxRefusal(error);
  }
}

/** The pool's ceilings and the warm-up a new mailbox waits out. */
export async function mailboxSettingsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff(MAILBOXES);
  if (!hasCapability(context, "hq:admin")) return NOT_POOL_ADMIN;
  const reason = fieldValue(formData, "reason", 400).trim();
  if (reason.length < 4) return { status: "error", message: "Say why the ceilings are changing." };
  const input: Record<string, unknown> = { reason };
  for (const name of ["pool_daily_cap", "domain_daily_cap", "warm_up_days"]) {
    const value = wholeNumber(formData, name);
    if (value === null) return { status: "error", message: "Ceilings are whole numbers." };
    input[name] = value;
  }
  try {
    await mailApi.updateMailboxSettings(context.token, input);
  } catch (error) {
    return mailboxRefusal(error);
  }
  refresh(MAILBOXES, "/leads/rules");
  return sent("Saved.");
}
