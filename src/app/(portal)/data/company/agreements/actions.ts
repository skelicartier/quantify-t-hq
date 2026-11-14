"use server";

import { PARTY_ROWS } from "@/components/data/agreements/agreement-fields";
import {
  NOT_A_DAY,
  attemptOf,
  copyFrom,
  idOf,
  isState,
  ticked,
  typedDay,
} from "@/components/data/meetings/form-values";
import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/agreements";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import { dayWords } from "@/lib/data/labels-registers";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * The legal-document register's writes: adding an agreement (with its signed copy), editing
 * it, changing its status, attaching the signed copy or the signing record, and recording
 * that notice was given. Each one: the gate, one call to the service, the pages that show it
 * refreshed, and a sentence.
 */

const BASE = "/data/company/agreements";
const TYPES = new Set<string>(api.agreementTypeSchema.options);
const STATUSES = new Set<string>(api.agreementStatusSchema.options);
const KINDS = new Set<string>(api.partyKindSchema.options);
const SIGNINGS = new Set(["aadhaar_esign", "dsc", "wet_ink", "other", ""]);
const FLAGS = new Set(["yes", "no", ""]);
const CHOOSE: ActionState = { status: "error", message: "Choose from the list." };
const NO_AGREEMENT: ActionState = { status: "error", message: "That agreement is not here." };

/** A calendar day minus whole days, with no zone involved. */
function daysBefore(day: string, count: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date - count)).toISOString().slice(0, 10);
}

function partiesOf(formData: FormData): api.PartyInput[] {
  const parties: api.PartyInput[] = [];
  for (let index = 0; index < PARTY_ROWS; index += 1) {
    const ref = fieldValue(formData, `party_ref_${index}`, 80);
    const name = fieldValue(formData, `party_name_${index}`, 200).trim();
    let kind = fieldValue(formData, `party_kind_${index}`, 20) || "other";
    let refId: string | null = null;
    const [refKind = "", refValue = ""] = ref.split(":");
    if (refValue && KINDS.has(refKind) && /^[A-Za-z0-9-]{1,64}$/.test(refValue)) {
      kind = refKind;
      refId = refValue;
    }
    if (!name && !refId) continue;
    parties.push({
      kind: (KINDS.has(kind) ? kind : "other") as api.PartyKind,
      ref_id: refId,
      name,
      entity: fieldValue(formData, `party_entity_${index}`, 200),
      country: fieldValue(formData, `party_country_${index}`, 60),
    });
  }
  return parties;
}

function fieldsOf(formData: FormData): api.AgreementInput | ActionState {
  const type = fieldValue(formData, "type", 20);
  const status = fieldValue(formData, "status", 20) || "draft";
  const signing = fieldValue(formData, "signing", 20);
  const ip = fieldValue(formData, "ip_clause", 5);
  const confidentiality = fieldValue(formData, "confidentiality_clause", 5);
  const currency = fieldValue(formData, "value_currency", 5) === "USD" ? "USD" : "INR";
  if (
    !TYPES.has(type) ||
    !STATUSES.has(status) ||
    !SIGNINGS.has(signing) ||
    !FLAGS.has(ip) ||
    !FLAGS.has(confidentiality)
  )
    return CHOOSE;
  const days: Record<string, string> = {};
  for (const name of ["effective_on", "signed_on", "ends_on", "renews_on", "review_on"]) {
    const day = typedDay(formData, name);
    if (day === null) return NOT_A_DAY;
    days[name] = day;
  }
  return {
    title: fieldValue(formData, "title", 200),
    type: type as api.AgreementType,
    parties: partiesOf(formData),
    status: status as api.AgreementStatus,
    effective_on: days.effective_on ?? "",
    signed_on: days.signed_on ?? "",
    term_months: fieldValue(formData, "term_months", 6).trim(),
    ends_on: days.ends_on ?? "",
    auto_renews: ticked(formData, "auto_renews"),
    renews_on: days.renews_on ?? "",
    renewal_months: fieldValue(formData, "renewal_months", 6).trim(),
    notice_days: fieldValue(formData, "notice_days", 6).trim(),
    terminate_for_convenience: fieldValue(formData, "terminate_for_convenience", 300),
    governing_law: fieldValue(formData, "governing_law", 120),
    forum: fieldValue(formData, "forum", 120),
    value_amount: fieldValue(formData, "value_amount", 16).trim(),
    value_currency: currency,
    signing: signing as api.Agreement["signing"],
    stamp_state: fieldValue(formData, "stamp_state", 120),
    stamp_amount: fieldValue(formData, "stamp_amount", 16).trim(),
    stamp_certificate_no: fieldValue(formData, "stamp_certificate_no", 80),
    related_party: ticked(formData, "related_party"),
    personal_data: ticked(formData, "personal_data"),
    ip_clause: ip as api.Agreement["ip_clause"],
    confidentiality_clause: confidentiality as api.Agreement["confidentiality_clause"],
    owner: fieldValue(formData, "owner", 120),
    review_on: days.review_on ?? "",
    notes: fieldValue(formData, "notes", 4_000),
  };
}

export async function addAgreementAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const fields = fieldsOf(formData);
  if (isState(fields)) return fields;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  let said = "Added.";
  try {
    const { agreement } = await api.addAgreement(
      { ...fields, ...copy },
      staffOf(context),
      attemptOf(formData),
    );
    const { renews_on: renews, notice_days: notice, auto } = agreement.renewal;
    if (auto && renews)
      said = `Added. Notice by ${dayWords(notice ? daysBefore(renews, notice) : renews)}.`;
  } catch (error) {
    return refusal(error);
  }
  refreshData(BASE, "/data/files");
  return sent(said);
}

export async function updateAgreementAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const agreementId = idOf(formData, "agreement_id");
  if (!agreementId) return NO_AGREEMENT;
  const fields = fieldsOf(formData);
  if (isState(fields)) return fields;
  try {
    await api.updateAgreement(agreementId, fields, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData(BASE, `${BASE}/${agreementId}`);
  return sent("Saved.");
}

export async function agreementStatusAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const agreementId = idOf(formData, "agreement_id");
  if (!agreementId) return NO_AGREEMENT;
  const status = fieldValue(formData, "status", 20);
  if (!STATUSES.has(status)) return CHOOSE;
  const on = typedDay(formData, "on");
  if (on === null) return NOT_A_DAY;
  try {
    await api.setAgreementStatus(
      agreementId,
      { status: status as api.AgreementStatus, on },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshData(BASE, `${BASE}/${agreementId}`);
  return sent("Saved.");
}

export async function attachAgreementCopyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const agreementId = idOf(formData, "agreement_id");
  if (!agreementId) return NO_AGREEMENT;
  const kind = fieldValue(formData, "kind", 20) === "audit_trail" ? "audit_trail" : "signed";
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  if (!("file_id" in copy) && !("content" in copy))
    return { status: "error", message: "Choose the copy first." };
  try {
    await api.attachAgreementCopy(agreementId, { ...copy, kind }, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData(BASE, `${BASE}/${agreementId}`, "/data/files");
  return sent("Attached.");
}

export async function noticeGivenAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const agreementId = idOf(formData, "agreement_id");
  if (!agreementId) return NO_AGREEMENT;
  const on = typedDay(formData, "on");
  if (on === null) return NOT_A_DAY;
  let said = "Recorded.";
  try {
    await api.recordNoticeGiven(
      agreementId,
      { on, note: fieldValue(formData, "note", 300) },
      staffOf(context),
    );
    const page = await api.readAgreement(agreementId);
    if (page.worked.renews_on)
      said = `Recorded. It will not renew on ${dayWords(page.worked.renews_on)}.`;
  } catch (error) {
    return refusal(error);
  }
  refreshData(BASE, `${BASE}/${agreementId}`);
  return sent(said);
}
