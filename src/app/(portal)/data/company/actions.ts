"use server";

import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/company";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";
import { formatDate } from "@/lib/format";

/**
 * The company record's writes (company spec §6.4): one group of facts at a time, a director
 * added, edited or ceased, a contact change on the MCA record (with its KYC-Web filing added
 * to Key dates while the box stays ticked), that change filed, and a DIR-3 KYC filing.
 * Every check is the service's; it answers in sentences.
 */

const BASE = "/data/company";
const DIRECTORS = `${BASE}/directors`;
const ROUTE_ID = /^[A-Za-z0-9-]{1,64}$/;
const NO_DIRECTOR: ActionState = { status: "error", message: "That director is not here." };

const GROUP_FIELDS: Record<api.FactsGroup, readonly string[]> = {
  identity: ["legal_name", "cin", "pan", "tan", "gstin", "registered_state", "registered_office"],
  dates: ["incorporated_on", "first_fy_end"],
  class: ["small", "startup", "subsidiary", "foreign_investment", "gst_registered", "exports"],
  registrations: [
    "auditor_name",
    "auditor_firm_number",
    "auditor_appointed_on",
    "auditor_appointed_by",
    "auditor_contact_id",
    "bank_name",
    "bank_branch",
    "bank_contact_id",
    "firms_registered_on",
    "firms_user_note",
    "dpiit_number",
    "dpiit_recognised_on",
  ],
};

const DIRECTOR_FIELDS = [
  "name",
  "din",
  "din_allotted_on",
  "designation",
  "appointed_on",
  "dsc_expires_on",
  "dsc_kept",
  "kyc_filed_on",
  "kyc_srn",
] as const;

const attemptOf = (formData: FormData): string =>
  fieldValue(formData, "attempt", 64) || crypto.randomUUID();

const directorIdFrom = (formData: FormData): string => {
  const value = fieldValue(formData, "director_id", 64);
  return ROUTE_ID.test(value) ? value : "";
};

function refreshCompany(directorId = ""): void {
  refreshData(
    BASE,
    DIRECTORS,
    "/data/dates",
    ...(directorId ? [`${DIRECTORS}/${directorId}`] : []),
  );
}

export async function saveFactsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const group = fieldValue(formData, "group", 20) as api.FactsGroup;
  const fields = GROUP_FIELDS[group];
  if (!fields) return { status: "error", message: "Choose which facts to save." };
  const input: Record<string, string> = {};
  for (const name of fields) if (formData.has(name)) input[name] = fieldValue(formData, name, 400);
  try {
    await api.saveFacts(group, input, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshCompany();
  return sent("Saved.");
}

function directorInput(formData: FormData, adding: boolean): api.DirectorInput {
  const input: api.DirectorInput = {};
  for (const name of DIRECTOR_FIELDS)
    if (formData.has(name)) input[name] = fieldValue(formData, name, 400);
  input.is_founder = formData.get("is_founder") === "on";
  if (adding)
    for (const name of ["mca_email", "mca_mobile", "mca_address"] as const)
      if (formData.has(name)) input[name] = fieldValue(formData, name, 400);
  return input;
}

export async function addDirectorAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, DIRECTORS);
  if (refused(context)) return context;
  let name = "";
  try {
    name = (
      await api.addDirector(directorInput(formData, true), staffOf(context), attemptOf(formData))
    ).director.name;
  } catch (error) {
    return refusal(error);
  }
  refreshCompany();
  return sent(`Added ${name}.`);
}

export async function updateDirectorAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const directorId = directorIdFrom(formData);
  const context = await gate(formData, `${DIRECTORS}/${directorId}`);
  if (refused(context)) return context;
  if (!directorId) return NO_DIRECTOR;
  try {
    await api.updateDirector(directorId, directorInput(formData, false), staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshCompany(directorId);
  return sent("Saved.");
}

export async function contactChangeAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const directorId = directorIdFrom(formData);
  const context = await gate(formData, `${DIRECTORS}/${directorId}`);
  if (refused(context)) return context;
  if (!directorId) return NO_DIRECTOR;
  const addDate = formData.get("add_date") === "on";
  let message = "Recorded.";
  try {
    const answer = await api.recordContactChange(
      directorId,
      {
        field: fieldValue(formData, "field", 10),
        to: fieldValue(formData, "to", 400),
        changed_on: fieldValue(formData, "changed_on", 10),
        add_date: addDate,
      },
      staffOf(context),
      attemptOf(formData),
    );
    if (addDate && answer.key_dates.length > 0)
      message = `Recorded. File the update by ${formatDate(answer.change.file_by)}.`;
  } catch (error) {
    return refusal(error);
  }
  refreshCompany(directorId);
  return sent(message);
}

export async function changeFiledAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const directorId = directorIdFrom(formData);
  const context = await gate(formData, `${DIRECTORS}/${directorId}`);
  if (refused(context)) return context;
  const changeId = fieldValue(formData, "change_id", 64);
  if (!directorId || !ROUTE_ID.test(changeId))
    return { status: "error", message: "That contact change is not here." };
  try {
    await api.recordChangeFiled(
      directorId,
      changeId,
      { filed_on: fieldValue(formData, "filed_on", 10), srn: fieldValue(formData, "srn", 40) },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshCompany(directorId);
  return sent("Recorded.");
}

export async function kycAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const directorId = directorIdFrom(formData);
  const context = await gate(formData, `${DIRECTORS}/${directorId}`);
  if (refused(context)) return context;
  if (!directorId) return NO_DIRECTOR;
  let message = "Recorded. Ask your CS when the next one is due.";
  try {
    const answer = await api.recordKyc(
      directorId,
      { filed_on: fieldValue(formData, "filed_on", 10), srn: fieldValue(formData, "srn", 40) },
      staffOf(context),
    );
    if (answer.next_kyc?.due_on)
      message = `Recorded. The next KYC is due by ${formatDate(answer.next_kyc.due_on)}.`;
  } catch (error) {
    return refusal(error);
  }
  refreshCompany(directorId);
  return sent(message);
}

export async function ceaseDirectorAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const directorId = directorIdFrom(formData);
  const context = await gate(formData, `${DIRECTORS}/${directorId}`);
  if (refused(context)) return context;
  if (!directorId) return NO_DIRECTOR;
  try {
    await api.ceaseDirector(directorId, fieldValue(formData, "ceased_on", 10), staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshCompany(directorId);
  return sent("Marked as ceased.");
}
