"use server";

import {
  NOT_A_DAY,
  attemptOf,
  copyFrom,
  idOf,
  isState,
  typedDay,
  withWarnings,
} from "@/components/data/meetings/form-values";
import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/members";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * The register of members' writes: a class of shares, a member, an entry and its reversal,
 * a certificate and its cancellation. Each one: the gate, one call to the service, the
 * register refreshed, and a sentence with the service's warnings after it.
 */

const BASE = "/data/company/members";
const HOLDERS = new Set<string>(api.holderKindSchema.options);
const RESIDENCIES = new Set<string>(api.residencySchema.options);
const ENTRY_KINDS = new Set<string>(api.entryKindSchema.options);
const CHOOSE: ActionState = { status: "error", message: "Choose from the list." };

export async function addClassAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const kind = fieldValue(formData, "kind", 20) === "preference" ? "preference" : "equity";
  try {
    await api.addClass(
      {
        name: fieldValue(formData, "name", 120),
        kind,
        nominal: fieldValue(formData, "nominal", 12),
      },
      staffOf(context),
      attemptOf(formData),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshData(BASE);
  return sent("Added.");
}

export async function addMemberAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const kind = fieldValue(formData, "kind", 20) || "person";
  const residency = fieldValue(formData, "residency", 20);
  if (!HOLDERS.has(kind) || !RESIDENCIES.has(residency)) return CHOOSE;
  const became = typedDay(formData, "became_member_on");
  if (!became) return NOT_A_DAY;
  try {
    await api.addMember(
      {
        name: fieldValue(formData, "name", 200),
        kind: kind as api.MemberInput["kind"],
        email: fieldValue(formData, "email", 254),
        address: fieldValue(formData, "address", 400),
        id_number: fieldValue(formData, "id_number", 40),
        residency: residency as api.MemberInput["residency"],
        nationality: fieldValue(formData, "nationality", 60),
        backers_note: fieldValue(formData, "backers_note", 1_000),
        became_member_on: became,
      },
      staffOf(context),
      attemptOf(formData),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshData(BASE);
  return sent("Added.");
}

export async function recordEntryAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const kind = fieldValue(formData, "kind", 20) || "allotment";
  if (!ENTRY_KINDS.has(kind)) return CHOOSE;
  const on = typedDay(formData, "on");
  const entered = typedDay(formData, "entered_on");
  if (!on || entered === null) return NOT_A_DAY;
  const resolution = fieldValue(formData, "resolution_id", 64);
  let warnings: string[] = [];
  try {
    warnings = (
      await api.recordEntry(
        {
          member_id: idOf(formData, "member_id"),
          class_id: idOf(formData, "class_id"),
          kind: kind as api.EntryKind,
          shares: fieldValue(formData, "shares", 20),
          distinctive_from: fieldValue(formData, "distinctive_from", 20),
          distinctive_to: fieldValue(formData, "distinctive_to", 20),
          price_per_share: fieldValue(formData, "price_per_share", 20),
          paid_up_per_share: fieldValue(formData, "paid_up_per_share", 20),
          on,
          entered_on: entered,
          resolution_id: resolution === "typed" ? "" : resolution,
          resolution_words: fieldValue(formData, "resolution_words", 300),
          note: fieldValue(formData, "note", 1_000),
        },
        staffOf(context),
        attemptOf(formData),
      )
    ).warnings;
  } catch (error) {
    return refusal(error);
  }
  refreshData(BASE);
  return sent(withWarnings("Recorded.", warnings));
}

export async function reverseEntryAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const entryId = idOf(formData, "entry_id");
  if (!entryId) return { status: "error", message: "That entry is not in the register." };
  const on = typedDay(formData, "on");
  if (on === null) return NOT_A_DAY;
  try {
    await api.reverseEntry(
      entryId,
      { on, why: fieldValue(formData, "why", 300) },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshData(BASE);
  return sent("Reversed. It stays in the register, struck through.");
}

export async function issueCertificateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const issued = typedDay(formData, "issued_on");
  if (!issued) return NOT_A_DAY;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  let said = "Issued.";
  try {
    const answer = await api.issueCertificate(
      {
        member_id: idOf(formData, "member_id"),
        class_id: idOf(formData, "class_id"),
        shares: fieldValue(formData, "shares", 20),
        distinctive_from: fieldValue(formData, "distinctive_from", 20),
        distinctive_to: fieldValue(formData, "distinctive_to", 20),
        number: fieldValue(formData, "number", 40),
        issued_on: issued,
        stamp_amount: fieldValue(formData, "stamp_amount", 20),
        stamp_reference: fieldValue(formData, "stamp_reference", 120),
        ...copy,
      },
      staffOf(context),
      attemptOf(formData),
    );
    said = withWarnings(`Issued ${answer.certificate.number}.`, answer.warnings);
  } catch (error) {
    return refusal(error);
  }
  refreshData(BASE, "/data/files");
  return sent(said);
}

export async function cancelCertificateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const certificateId = idOf(formData, "certificate_id");
  if (!certificateId)
    return { status: "error", message: "That certificate is not in the register." };
  const on = typedDay(formData, "on");
  if (on === null) return NOT_A_DAY;
  try {
    await api.cancelCertificate(
      certificateId,
      { on, why: fieldValue(formData, "why", 300) },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshData(BASE);
  return sent("Cancelled. It stays in the register.");
}
