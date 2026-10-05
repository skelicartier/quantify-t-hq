"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasCapability, requireStaff, type StaffContext } from "@/lib/access/core";
import { HqApiRequestError } from "@/lib/api/core";
import * as trust from "@/lib/api/trust";
import { fieldValue, refusalMessage } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { typedInstant } from "@/lib/time-zone";

type Fields = ReadonlyArray<readonly [string, number]>;

/**
 * Each register: who may write it, where it lives, and the fields a form may send. A
 * field the form carries is sent even when empty — that is how an owner or a
 * description is cleared — and nothing outside the list ever leaves the portal.
 */
const REGISTERS = {
  risk: {
    capability: "hq:admin",
    path: "/trust/risks",
    create: [
      ["title", 200],
      ["description", 2000],
      ["category", 20],
      ["likelihood", 1],
      ["impact", 1],
      ["owner_staff_id", 64],
      ["treatment", 12],
      ["treatment_plan", 2000],
      ["review_due", 10],
    ],
    act: [
      ["title", 200],
      ["description", 2000],
      ["category", 20],
      ["likelihood", 1],
      ["impact", 1],
      ["owner_staff_id", 64],
      ["treatment", 12],
      ["treatment_plan", 2000],
      ["review_due", 10],
      ["note", 2000],
      ["reason", 400],
    ],
  },
  finding: {
    capability: "hq:admin",
    path: "/trust/findings",
    create: [
      ["title", 200],
      ["description", 2000],
      ["source", 14],
      ["severity", 10],
      ["owner_staff_id", 64],
      ["found_on", 10],
    ],
    act: [
      ["title", 200],
      ["description", 2000],
      ["severity", 10],
      ["owner_staff_id", 64],
      ["evidence", 1000],
      ["fixed_on", 10],
      ["reason", 400],
      ["note", 2000],
    ],
  },
  change: {
    capability: "hq:admin",
    path: "/trust/changes",
    create: [
      ["title", 200],
      ["description", 2000],
      ["kind", 16],
      ["system", 120],
      ["risk", 8],
      ["rollback_plan", 1000],
      ["outcome", 14],
      ["incident_reference", 64],
    ],
    act: [
      ["outcome", 14],
      ["incident_reference", 64],
      ["note", 2000],
    ],
  },
  answer: {
    capability: "crm:write",
    path: "/trust/answers",
    create: [
      ["question", 400],
      ["answer", 4000],
      ["topic", 16],
      ["evidence", 400],
      ["owner_staff_id", 64],
    ],
    act: [
      ["question", 400],
      ["answer", 4000],
      ["topic", 16],
      ["evidence", 400],
      ["owner_staff_id", 64],
      ["note", 2000],
    ],
  },
  processing: {
    capability: "privacy:write",
    path: "/trust/processing",
    create: [
      ["name", 160],
      ["purpose", 1000],
      ["lawful_basis", 24],
      ["data_subjects", 400],
      ["data_categories", 400],
      ["recipients", 400],
      ["transfers", 400],
      ["retention", 400],
      ["security_measures", 1000],
      ["owner_staff_id", 64],
    ],
    act: [
      ["name", 160],
      ["purpose", 1000],
      ["lawful_basis", 24],
      ["data_subjects", 400],
      ["data_categories", 400],
      ["recipients", 400],
      ["transfers", 400],
      ["retention", 400],
      ["security_measures", 1000],
      ["owner_staff_id", 64],
      ["note", 2000],
      ["reason", 400],
    ],
  },
} as const satisfies Record<
  string,
  { capability: string; path: string; create: Fields; act: Fields }
>;

type Register = keyof typeof REGISTERS;

const CONTINUITY_FIELDS: Fields = [
  ["kind", 16],
  ["scenario", 400],
  ["performed_on", 10],
  ["participants", 400],
  ["outcome", 10],
  ["target_minutes", 6],
  ["actual_minutes", 6],
  ["notes", 2000],
  ["next_due", 10],
  ["finding_title", 200],
  ["finding_severity", 10],
  ["finding_owner_staff_id", 64],
];
const REVIEW_FIELDS: Fields = [
  ["reviewed_on", 10],
  ["outcome", 14],
  ["evidence", 1000],
  ["notes", 2000],
  ["finding_title", 200],
  ["finding_severity", 10],
  ["finding_owner_staff_id", 64],
];

const SAID: Record<string, string> = {
  update: "Saved.",
  review: "Review recorded.",
  treat: "Marked as being treated.",
  accept: "Accepted, with your reason on the record.",
  close: "Closed.",
  reopen: "Reopened.",
  start: "Marked in progress.",
  fix: "Marked fixed, with its evidence.",
  approve: "Approved.",
  outcome: "Outcome recorded.",
  archive: "Archived.",
  restore: "Restored.",
  note: "Note added.",
};

const NOT_ALLOWED: Record<string, string> = {
  "hq:admin": "The trust registers are kept by Admins and Owners.",
  "crm:write": "Answers are drafted by Sales, Admins and Owners.",
  "privacy:write":
    "The record of processing is kept by the privacy desk: Support, Admins and Owners.",
};

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

/** Every listed field the form carries, bounded; absent fields stay absent. */
function collect(formData: FormData, fields: Fields): Record<string, string> {
  const body: Record<string, string> = {};
  for (const [name, limit] of fields) {
    if (formData.has(name)) body[name] = fieldValue(formData, name, limit).trim();
  }
  return body;
}

/** A local date-and-time from a form, sent with the viewer's offset so it means one moment. */
/** A time typed into a form, read in the person's zone and sent as the instant it means. */
function moment(formData: FormData, name: string, zone: string): string {
  return typedInstant(fieldValue(formData, name, 40), zone);
}

function registerOf(formData: FormData): Register | null {
  const value = fieldValue(formData, "register", 16);
  return value in REGISTERS ? (value as Register) : null;
}

function refresh(extra: string[] = []) {
  revalidatePath("/trust", "layout");
  for (const path of extra) revalidatePath(path);
  revalidatePath("/", "layout");
}

async function writer(formData: FormData, path: string, capability: string) {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff(path);
  return { context, allowed: hasCapability(context, capability) };
}

async function create(register: Register, context: StaffContext, body: Record<string, string>) {
  switch (register) {
    case "risk":
      return (await trust.createRisk(context.token, body)).risk.risk_id;
    case "finding":
      return (await trust.createFinding(context.token, body)).finding.finding_id;
    case "change":
      return (await trust.createChange(context.token, body)).change.change_id;
    case "answer":
      return (await trust.createAnswer(context.token, body)).answer.answer_id;
    case "processing":
      return (await trust.createActivity(context.token, body)).activity.activity_id;
  }
}

async function act(
  register: Register,
  context: StaffContext,
  id: string,
  body: Record<string, string>,
) {
  switch (register) {
    case "risk":
      return trust.actOnRisk(context.token, id, body);
    case "finding":
      return trust.actOnFinding(context.token, id, body);
    case "change":
      return trust.actOnChange(context.token, id, body);
    case "answer":
      return trust.actOnAnswer(context.token, id, body);
    case "processing":
      return trust.actOnActivity(context.token, id, body);
  }
}

/** A new risk, finding, change, answer or processing activity; opens it once written. */
export async function createTrustRecordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const register = registerOf(formData);
  if (register === null) return { status: "error", message: "That register does not exist." };
  const spec = REGISTERS[register];
  const { context, allowed } = await writer(formData, spec.path, spec.capability);
  if (!allowed) return { status: "error", message: NOT_ALLOWED[spec.capability] ?? "Not allowed." };
  const body = collect(formData, spec.create);
  if (register === "change")
    body.happened_at = moment(formData, "happened_at", context.me.time_zone);
  let recordId = "";
  try {
    recordId = await create(register, context, body);
  } catch (error) {
    return refusal(error);
  }
  refresh();
  redirect(`${spec.path}/${recordId}`);
}

/** One act on a record: review, accept, fix, approve, archive, a note. */
export async function actOnTrustRecordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const register = registerOf(formData);
  if (register === null) return { status: "error", message: "That register does not exist." };
  const spec = REGISTERS[register];
  const recordId = fieldValue(formData, "record_id", 64);
  const { context, allowed } = await writer(formData, `${spec.path}/${recordId}`, spec.capability);
  if (!allowed) return { status: "error", message: NOT_ALLOWED[spec.capability] ?? "Not allowed." };
  const action = fieldValue(formData, "action", 16);
  const body = { action, ...collect(formData, spec.act) };
  try {
    await act(register, context, recordId, body);
  } catch (error) {
    return refusal(error);
  }
  refresh([`${spec.path}/${recordId}`]);
  return sent(SAID[action] ?? "Saved.");
}

/** A continuity test; one that did not pass leaves the finding it names. */
export async function recordContinuityTestAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, allowed } = await writer(formData, "/trust/continuity", "hq:admin");
  if (!allowed) return { status: "error", message: NOT_ALLOWED["hq:admin"]! };
  let findingId: string | null = null;
  try {
    findingId = (
      await trust.recordContinuityTest(context.token, collect(formData, CONTINUITY_FIELDS))
    ).finding_id;
  } catch (error) {
    return refusal(error);
  }
  refresh();
  return sent(findingId ? "Recorded, and the finding raised to fix what failed." : "Recorded.");
}

/** A supplier review with its evidence; concerns leave a finding. */
export async function reviewSupplierAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const subprocessorId = fieldValue(formData, "subprocessor_id", 64);
  const path = `/trust/suppliers/${subprocessorId}`;
  const { context, allowed } = await writer(formData, path, "hq:admin");
  if (!allowed) return { status: "error", message: NOT_ALLOWED["hq:admin"]! };
  let findingId: string | null = null;
  try {
    findingId = (
      await trust.reviewSupplier(context.token, subprocessorId, collect(formData, REVIEW_FIELDS))
    ).finding_id;
  } catch (error) {
    return refusal(error);
  }
  refresh([path]);
  return sent(
    findingId ? "Review recorded, and a finding raised for the concerns." : "Review recorded.",
  );
}

/** A supplier's tier, which sets how often it is reviewed. */
export async function tierSupplierAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const subprocessorId = fieldValue(formData, "subprocessor_id", 64);
  const path = `/trust/suppliers/${subprocessorId}`;
  const { context, allowed } = await writer(formData, path, "hq:admin");
  if (!allowed) return { status: "error", message: NOT_ALLOWED["hq:admin"]! };
  try {
    await trust.tierSupplier(
      context.token,
      subprocessorId,
      collect(formData, [
        ["tier", 12],
        ["reason", 400],
      ]),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh([path, "/privacy/subprocessors", `/privacy/subprocessors/${subprocessorId}`]);
  return sent("Tier changed; the next review date follows it.");
}
