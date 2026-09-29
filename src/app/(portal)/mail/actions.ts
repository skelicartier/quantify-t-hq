"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasCapability, requireStaff } from "@/lib/access/core";
import * as mailApi from "@/lib/api/mail";
import { fieldValue } from "@/lib/auth/forms";
import { crmRefusal } from "@/lib/crm/refusal";
import type { ActionState } from "@/lib/forms/action-state";
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

// --- campaigns ---------------------------------------------------------------------------

function campaignInput(formData: FormData): Record<string, unknown> | ActionState {
  const kind = fieldValue(formData, "audience_kind", 12);
  let audience: Record<string, unknown>;
  if (kind === "segment") {
    audience = { kind, segment_id: fieldValue(formData, "segment_id", 64) };
  } else if (kind === "people" || kind === "leads" || kind === "companies") {
    const ids = jsonField<string[]>(formData, "audience_ids", 200_000) ?? [];
    audience = { kind, ids };
  } else if (kind === "csv") {
    const rows = jsonField<Record<string, string>[]>(formData, "csv_rows", 2_000_000) ?? [];
    audience = { kind, rows, label: fieldValue(formData, "csv_label", 120) };
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
  try {
    const result = await mailApi.addSuppression(
      context.token,
      fieldValue(formData, "email", 254).trim(),
      fieldValue(formData, "detail", 400).trim(),
    );
    refresh("/mail/suppressions");
    return sent(
      `Stopped. ${result.cancelled ? `${result.cancelled} queued ${result.cancelled === 1 ? "message" : "messages"} cancelled.` : "Nothing was queued."}`,
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
