"use server";

import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/people";
import { dayValue, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import { gateOwner } from "@/lib/data/owner";
import type { ActionState } from "@/lib/forms/action-state";
import { formatDate } from "@/lib/format";

/**
 * The people ledger's writes (ws-notes/company/spec.md §8), every one through `gateOwner`: an
 * Admin's is refused with "The people ledger is for the Owner only." before anything is read
 * or sent. Each refreshes the People page, the person's page and the overview's Due.
 */

const BASE = "/data/people";
const ROUTE_ID = /^[A-Za-z0-9-]{1,64}$/;
const MAX_COPY_BYTES = 3 * 1024 * 1024;

const NO_PERSON: ActionState = { status: "error", message: "That person is not in the ledger." };
const NOT_A_DAY: ActionState = { status: "error", message: "That is not a day." };

const attemptOf = (formData: FormData): string =>
  fieldValue(formData, "attempt", 64) || crypto.randomUUID();

function idOf(formData: FormData, name: string): string {
  const value = fieldValue(formData, name, 64);
  return ROUTE_ID.test(value) ? value : "";
}

/** A typed day: the day, "" when left blank, or null when it is not one. */
function typedDay(formData: FormData, name: string): string | null {
  const value = fieldValue(formData, name, 10).trim();
  if (!value) return "";
  return dayValue(value) || null;
}

const ticked = (formData: FormData, name: string): boolean =>
  fieldValue(formData, name, 10) === "1" || fieldValue(formData, name, 10) === "on";

function refreshPerson(personId = ""): void {
  refreshData(BASE, ...(personId ? [`${BASE}/${personId}`] : []));
}

/** The person's own fields, from "Add a person" and "Edit". */
function personFields(formData: FormData): api.PersonInput | ActionState {
  const startsOn = typedDay(formData, "starts_on");
  const endsOn = typedDay(formData, "ends_on");
  if (startsOn === null || endsOn === null) return NOT_A_DAY;
  const amount = fieldValue(formData, "stipend_amount", 20).trim();
  return {
    name: fieldValue(formData, "name", 120),
    email: fieldValue(formData, "email", 254),
    kind: fieldValue(formData, "kind", 20),
    role_title: fieldValue(formData, "role_title", 120),
    starts_on: startsOn,
    ends_on: endsOn,
    mentor: fieldValue(formData, "mentor", 120),
    brief: fieldValue(formData, "brief", 4_000),
    stipend: amount
      ? {
          amount,
          currency: fieldValue(formData, "stipend_currency", 3) || "INR",
          pays_on: fieldValue(formData, "stipend_pays_on", 10) || "month_end",
        }
      : null,
    ...(formData.has("notes") ? { notes: fieldValue(formData, "notes", 4_000) } : {}),
  };
}

const isState = (value: object): value is ActionState => "status" in value;

/** A copy chosen in the form: sent on as base64 with its name, or none. */
async function copyOf(formData: FormData): Promise<api.CopyInput | ActionState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_COPY_BYTES)
    return {
      status: "error",
      message: "That copy is over 3 MB. Add a smaller scan of it.",
    };
  const bytes = Buffer.from(await file.arrayBuffer());
  return { name: file.name.slice(0, 200), content: bytes.toString("base64") };
}

export async function addPersonAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gateOwner(formData, BASE);
  if (refused(context)) return context;
  const fields = personFields(formData);
  if (isState(fields)) return fields;
  let said: string;
  try {
    const { person } = await api.addPerson(fields, staffOf(context), attemptOf(formData));
    const midpoint = person.evaluations.midpoint.due_on;
    said = midpoint
      ? `Added ${person.name}. The midpoint evaluation is due ${formatDate(midpoint)}.`
      : `Added ${person.name}.`;
  } catch (error) {
    return refusal(error);
  }
  refreshPerson();
  return sent(said);
}

export async function updatePersonAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const personId = idOf(formData, "person_id");
  const context = await gateOwner(formData, `${BASE}/${personId}`);
  if (refused(context)) return context;
  if (!personId) return NO_PERSON;
  const fields = personFields(formData);
  if (isState(fields)) return fields;
  try {
    await api.updatePerson(personId, fields, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshPerson(personId);
  return sent("Saved.");
}

export async function addDocumentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const personId = idOf(formData, "person_id");
  const context = await gateOwner(formData, `${BASE}/${personId}`);
  if (refused(context)) return context;
  if (!personId) return NO_PERSON;
  const signedOn = typedDay(formData, "signed_on");
  if (signedOn === null) return NOT_A_DAY;
  const copy = await copyOf(formData);
  if (copy && isState(copy)) return copy;
  try {
    await api.addDocument(
      personId,
      {
        kind: fieldValue(formData, "kind", 20),
        title: fieldValue(formData, "title", 200),
        signed_on: signedOn,
        includes_ip: ticked(formData, "includes_ip"),
        includes_confidentiality: ticked(formData, "includes_confidentiality"),
      },
      copy,
      staffOf(context),
      attemptOf(formData),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshPerson(personId);
  return sent(copy ? "Added the document and its copy." : "Added the document.");
}

export async function recordEvaluationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const personId = idOf(formData, "person_id");
  const context = await gateOwner(formData, `${BASE}/${personId}`);
  if (refused(context)) return context;
  if (!personId) return NO_PERSON;
  const which = fieldValue(formData, "which", 10);
  if (which !== "midpoint" && which !== "final")
    return { status: "error", message: "Choose the midpoint or the final evaluation." };
  const heldOn = typedDay(formData, "held_on");
  const dueOn = typedDay(formData, "due_on");
  if (heldOn === null || dueOn === null) return NOT_A_DAY;
  try {
    await api.recordEvaluation(
      personId,
      which,
      {
        held_on: heldOn,
        by_name: fieldValue(formData, "by_name", 120),
        outcome: fieldValue(formData, "outcome", 20),
        summary: fieldValue(formData, "summary", 4_000),
        ...(dueOn ? { due_on: dueOn } : {}),
      },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshPerson(personId);
  return sent("Recorded.");
}

export async function recordCertificateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const personId = idOf(formData, "person_id");
  const context = await gateOwner(formData, `${BASE}/${personId}`);
  if (refused(context)) return context;
  if (!personId) return NO_PERSON;
  const issuedOn = typedDay(formData, "issued_on");
  if (issuedOn === null) return NOT_A_DAY;
  const copy = await copyOf(formData);
  if (copy && isState(copy)) return copy;
  try {
    await api.recordCertificate(
      personId,
      { number: fieldValue(formData, "number", 40), issued_on: issuedOn },
      copy,
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshPerson(personId);
  return sent("Recorded the certificate.");
}

export async function recordPaymentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const personId = idOf(formData, "person_id");
  const context = await gateOwner(formData, `${BASE}/${personId}`);
  if (refused(context)) return context;
  if (!personId) return NO_PERSON;
  const paidOn = typedDay(formData, "paid_on");
  if (paidOn === null) return NOT_A_DAY;
  try {
    await api.recordPayment(
      personId,
      {
        period: fieldValue(formData, "period", 7),
        amount: fieldValue(formData, "amount", 20),
        currency: fieldValue(formData, "currency", 3),
        paid_on: paidOn,
        reference: fieldValue(formData, "reference", 80),
        tds_deducted: fieldValue(formData, "tds_deducted", 20),
        note: fieldValue(formData, "note", 500),
      },
      staffOf(context),
      attemptOf(formData),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshPerson(personId);
  return sent("Recorded the payment.");
}

export async function withdrawPaymentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const personId = idOf(formData, "person_id");
  const context = await gateOwner(formData, `${BASE}/${personId}`);
  if (refused(context)) return context;
  const paymentId = idOf(formData, "payment_id");
  if (!personId || !paymentId) return NO_PERSON;
  try {
    await api.withdrawPayment(
      personId,
      paymentId,
      fieldValue(formData, "why", 300),
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshPerson(personId);
  return sent("Withdrawn. The month is owed again.");
}

export async function grantAccessAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const personId = idOf(formData, "person_id");
  const context = await gateOwner(formData, `${BASE}/${personId}`);
  if (refused(context)) return context;
  if (!personId) return NO_PERSON;
  const grantedOn = typedDay(formData, "granted_on");
  if (grantedOn === null) return NOT_A_DAY;
  try {
    await api.grantAccess(
      personId,
      {
        system: fieldValue(formData, "system", 80),
        level: fieldValue(formData, "level", 80),
        critical: ticked(formData, "critical"),
        granted_on: grantedOn,
        notes: fieldValue(formData, "notes", 500),
      },
      staffOf(context),
      attemptOf(formData),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshPerson(personId);
  return sent("Recorded the access.");
}

/** "Revoke" (with its day) or "Never had it" on one grant. */
export async function accessStateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const personId = idOf(formData, "person_id");
  const context = await gateOwner(formData, `${BASE}/${personId}`);
  if (refused(context)) return context;
  const accessId = idOf(formData, "access_id");
  if (!personId || !accessId) return NO_PERSON;
  const never = fieldValue(formData, "to", 10) === "never";
  const on = typedDay(formData, "on");
  if (on === null) return NOT_A_DAY;
  try {
    if (never) await api.neverHadAccess(personId, accessId, staffOf(context));
    else await api.revokeAccess(personId, accessId, on, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshPerson(personId);
  return sent(never ? "Marked as never held." : "Revoked.");
}

export async function startOffboardingAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const personId = idOf(formData, "person_id");
  const context = await gateOwner(formData, `${BASE}/${personId}`);
  if (refused(context)) return context;
  if (!personId) return NO_PERSON;
  const lastDay = typedDay(formData, "last_day");
  if (!lastDay) return { status: "error", message: "Give the last working day." };
  let left = 0;
  try {
    left = (await api.startOffboarding(personId, lastDay, staffOf(context))).deadlines.length;
  } catch (error) {
    return refusal(error);
  }
  refreshPerson(personId);
  return sent(
    left === 0
      ? "Offboarding started. Nothing is left to revoke."
      : `Offboarding started. ${left} ${left === 1 ? "system" : "systems"} to revoke.`,
  );
}

export async function cancelOffboardingAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const personId = idOf(formData, "person_id");
  const context = await gateOwner(formData, `${BASE}/${personId}`);
  if (refused(context)) return context;
  if (!personId) return NO_PERSON;
  try {
    await api.cancelOffboarding(personId, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshPerson(personId);
  return sent("Offboarding cancelled.");
}
