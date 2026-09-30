"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError } from "@/lib/api/core";
import * as pv from "@/lib/api/privacy";
import { fieldValue, refusalMessage } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

const NOT_WRITER: ActionState = {
  status: "error",
  message: "The privacy desk is run by Support, Admins and Owners.",
};

function refusal(error: unknown): ActionState {
  if (error instanceof HqApiRequestError) {
    if (error.details["sudo_required"])
      return { status: "error", message: "Confirm it's you first: enter a fresh code above." };
    const detail = Object.values(error.details).find((value) => typeof value === "string");
    if (error.code === "malformed_request" && typeof detail === "string")
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
    const value = fieldValue(formData, name, limit);
    if (value.trim()) body[name] = value.trim();
  }
  return body;
}

/** A local date-and-time from a form, sent with the viewer's offset so it means one moment. */
function moment(formData: FormData, name: string): string {
  const value = fieldValue(formData, name, 20).trim();
  if (!value) return "";
  const offset = fieldValue(formData, "tz_offset", 8).trim();
  return /^[+-]\d{2}:\d{2}$/.test(offset) ? `${value}${offset}` : value;
}

function refreshRequest(requestId?: string, companyId?: string) {
  revalidatePath("/privacy");
  if (requestId) revalidatePath(`/privacy/requests/${requestId}`);
  if (companyId) revalidatePath(`/companies/${companyId}`);
  revalidatePath("/", "layout");
}

// --- rights requests -------------------------------------------------------------------------

export async function logRequestAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/privacy");
  if (!hasCapability(context, "privacy:write")) return NOT_WRITER;
  const body = collect(formData, [
    ["kind", 20],
    ["regime", 12],
    ["channel", 12],
    ["requester_name", 160],
    ["requester_email", 254],
    ["received_on", 10],
    ["identity", 12],
    ["company_id", 64],
    ["description", 4000],
  ]);
  let requestId = "";
  try {
    requestId = (await pv.logPrivacyRequest(context.token, body)).request.id;
  } catch (error) {
    return refusal(error);
  }
  refreshRequest(requestId, body.company_id);
  redirect(`/privacy/requests/${requestId}`);
}

const REQUEST_SAID: Record<string, string> = {
  assign: "Handed over.",
  request_identity: "Identity asked for. The month waits for it.",
  confirm_identity: "Identity confirmed. The month runs from then.",
  request_fee: "Fee asked for. The clock waits until it is paid.",
  fee_paid: "Fee recorded as paid.",
  stop_clock: "Clock stopped until they answer.",
  resume_clock: "Clock running again; the deadline moved by the stopped days.",
  review: "In review.",
  extend: "Extended by two months.",
  acknowledge: "Acknowledged.",
  respond: "Response recorded. The request is closed.",
  refuse: "Refusal recorded. The request is closed.",
  withdraw: "Withdrawn.",
  note: "Note added.",
};

export async function actOnRequestAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const requestId = fieldValue(formData, "request_id", 64);
  const context = await requireStaff(`/privacy/requests/${requestId}`);
  if (!hasCapability(context, "privacy:write")) return NOT_WRITER;
  const action = fieldValue(formData, "action", 24);
  const body = {
    action,
    ...collect(formData, [
      ["assignee_staff_id", 64],
      ["on", 10],
      ["method", 200],
      ["question", 1000],
      ["reason", 1000],
      ["told_on", 10],
      ["outcome", 16],
      ["detail", 2000],
      ["note", 2000],
    ]),
  };
  try {
    await pv.actOnPrivacyRequest(context.token, requestId, body);
  } catch (error) {
    return refusal(error);
  }
  refreshRequest(requestId, fieldValue(formData, "company_id", 64));
  return sent(REQUEST_SAID[action] ?? "Saved.");
}

export async function markSearchAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const requestId = fieldValue(formData, "request_id", 64);
  const context = await requireStaff(`/privacy/requests/${requestId}`);
  if (!hasCapability(context, "privacy:write")) return NOT_WRITER;
  const system = fieldValue(formData, "system", 24);
  const state = fieldValue(formData, "state", 16);
  const note = fieldValue(formData, "note", 1000).trim();
  try {
    await pv.markPrivacySearch(context.token, requestId, { system, state, note });
  } catch (error) {
    return refusal(error);
  }
  refreshRequest(requestId);
  return sent("Checklist updated.");
}

export async function stopContactAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const requestId = fieldValue(formData, "request_id", 64);
  const context = await requireStaff(`/privacy/requests/${requestId}`);
  if (!hasCapability(context, "privacy:write")) return NOT_WRITER;
  let done: Awaited<ReturnType<typeof pv.stopContact>>;
  try {
    done = await pv.stopContact(context.token, requestId);
  } catch (error) {
    return refusal(error);
  }
  refreshRequest(requestId);
  return sent(
    done.suppressed
      ? "Stopped: marked do not contact and added to the suppression list."
      : "Stopped: marked do not contact; the address was already suppressed.",
  );
}

export async function eraseAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const requestId = fieldValue(formData, "request_id", 64);
  const context = await requireStaff(`/privacy/requests/${requestId}`);
  if (!hasCapability(context, "hq:admin"))
    return { status: "error", message: "Erasing a person is for Admins and Owners." };
  const reason = fieldValue(formData, "reason", 400).trim();
  if (!reason) return { status: "error", message: "Say why erasure applies." };
  if (fieldValue(formData, "confirm", 10).trim().toUpperCase() !== "ERASE")
    return { status: "error", message: "Type ERASE to confirm. It cannot be undone." };
  let done: Awaited<ReturnType<typeof pv.erasePerson>>;
  try {
    done = await pv.erasePerson(context.token, requestId, reason);
  } catch (error) {
    return refusal(error);
  }
  refreshRequest(requestId);
  const leads = done.erased["leads"] ?? 0;
  return sent(`Erased: the person record and ${leads} lead${leads === 1 ? "" : "s"}.`);
}

// --- incidents -------------------------------------------------------------------------------

export async function logIncidentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/privacy/incidents");
  if (!hasCapability(context, "privacy:write")) return NOT_WRITER;
  const body: Record<string, unknown> = collect(formData, [
    ["title", 200],
    ["summary", 4000],
    ["kind", 16],
    ["severity", 10],
    ["data_categories", 400],
  ]);
  body.personal_data = formData.get("personal_data") === "on";
  for (const name of ["detected_at", "aware_at", "occurred_at"]) {
    const value = moment(formData, name);
    if (value) body[name] = value;
  }
  let incidentId = "";
  try {
    incidentId = (await pv.logIncident(context.token, body)).incident.id;
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/privacy/incidents");
  redirect(`/privacy/incidents/${incidentId}`);
}

const INCIDENT_SAID: Record<string, string> = {
  update: "Saved.",
  status: "Status changed.",
  assess: "Assessment recorded.",
  regulator: "Regulator notification recorded.",
  individuals: "Recorded that the people affected were told.",
  add_customers: "Customers added, each with the hours their contract gives.",
  customer_notified: "Recorded as told.",
  lessons: "Lessons recorded.",
  note: "Note added.",
};

export async function actOnIncidentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const incidentId = fieldValue(formData, "incident_id", 64);
  const context = await requireStaff(`/privacy/incidents/${incidentId}`);
  if (!hasCapability(context, "privacy:write")) return NOT_WRITER;
  const action = fieldValue(formData, "action", 24);
  const body: Record<string, unknown> = {
    action,
    ...collect(formData, [
      ["status", 12],
      ["risk", 8],
      ["reason", 2000],
      ["reference", 80],
      ["late_reason", 1000],
      ["how", 1000],
      ["company_id", 64],
      ["note", 2000],
      ["lessons", 4000],
      ["summary", 4000],
      ["data_categories", 400],
      ["subjects_estimate", 12],
      ["records_estimate", 12],
      ["severity", 10],
    ]),
  };
  const at = moment(formData, "at");
  if (at) body.at = at;
  if (action === "update") {
    const aware = moment(formData, "aware_at");
    if (aware) body.aware_at = aware;
    body.personal_data = formData.get("personal_data") === "on";
  }
  if (action === "add_customers") {
    body.company_ids = formData.getAll("company_ids").map(String).slice(0, 200);
  }
  try {
    await pv.actOnIncident(context.token, incidentId, body);
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/privacy/incidents");
  revalidatePath(`/privacy/incidents/${incidentId}`);
  revalidatePath("/", "layout");
  return sent(INCIDENT_SAID[action] ?? "Saved.");
}

// --- commitments -----------------------------------------------------------------------------

export async function updateCommitmentsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const companyId = fieldValue(formData, "company_id", 64);
  const context = await requireStaff(`/companies/${companyId}`);
  if (!hasCapability(context, "privacy:write")) return NOT_WRITER;
  const body: Record<string, unknown> = collect(formData, [
    ["contract_reference", 120],
    ["privacy_contact_email", 254],
    ["incident_notice_hours", 4],
    ["subprocessor_notice_days", 4],
    ["objection_window_days", 4],
    ["audit_rights", 16],
    ["data_locations", 200],
    ["exit_assistance_days", 4],
    ["dora_classification", 20],
    ["nonstandard_clauses", 2000],
    ["reviewed_on", 10],
  ]);
  body.material_outsourcing = formData.get("material_outsourcing") === "on";
  try {
    await pv.updateCommitments(context.token, companyId, body);
  } catch (error) {
    return refusal(error);
  }
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/privacy/commitments");
  return sent("Commitments saved.");
}

// --- sub-processors --------------------------------------------------------------------------

export async function addSubprocessorAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/privacy/subprocessors");
  if (!hasCapability(context, "privacy:write")) return NOT_WRITER;
  const body = collect(formData, [
    ["legal_name", 200],
    ["service", 200],
    ["purpose", 1000],
    ["data_categories", 400],
    ["locations", 200],
    ["transfer_mechanism", 20],
    ["dpa_signed_on", 10],
    ["in_use_since", 10],
  ]);
  let subprocessorId = "";
  try {
    subprocessorId = (await pv.addSubprocessor(context.token, body)).subprocessor.id;
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/privacy/subprocessors");
  redirect(`/privacy/subprocessors/${subprocessorId}`);
}

const SUBPROCESSOR_SAID: Record<string, string> = {
  update: "Saved.",
  record_notice: "Notice recorded; their objection window runs from that day.",
  objection: "Objection recorded. It must be settled before this goes live.",
  resolve: "Objection settled.",
  activate: "Active. It is now on the list customers are told about.",
  retire: "Retired.",
  note: "Note added.",
};

export async function actOnSubprocessorAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const subprocessorId = fieldValue(formData, "subprocessor_id", 64);
  const context = await requireStaff(`/privacy/subprocessors/${subprocessorId}`);
  if (!hasCapability(context, "privacy:write")) return NOT_WRITER;
  const action = fieldValue(formData, "action", 24);
  const body = {
    action,
    ...collect(formData, [
      ["company_id", 64],
      ["sent_to", 254],
      ["sent_on", 10],
      ["on", 10],
      ["objection", 2000],
      ["resolution", 16],
      ["reason", 1000],
      ["note", 2000],
      ["legal_name", 200],
      ["service", 200],
      ["purpose", 1000],
      ["data_categories", 400],
      ["locations", 200],
      ["transfer_mechanism", 20],
      ["dpa_signed_on", 10],
    ]),
  };
  let done: Awaited<ReturnType<typeof pv.actOnSubprocessor>>;
  try {
    done = await pv.actOnSubprocessor(context.token, subprocessorId, body);
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/privacy/subprocessors");
  revalidatePath(`/privacy/subprocessors/${subprocessorId}`);
  if (action === "send_notices") {
    const count = done.sent?.length ?? 0;
    const missing = done.missing ?? [];
    return sent(
      `Mailed to ${count} customer${count === 1 ? "" : "s"}.` +
        (missing.length ? ` Not sent — no privacy contact: ${missing.join(", ")}.` : ""),
    );
  }
  return sent(SUBPROCESSOR_SAID[action] ?? "Saved.");
}
