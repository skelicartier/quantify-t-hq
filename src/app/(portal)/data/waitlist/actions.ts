"use server";

import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/waitlist";
import { dayValue, gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import { DataRequestError } from "@/lib/data/socket";
import type { ActionState } from "@/lib/forms/action-state";
import { typedInstant } from "@/lib/time-zone";

/**
 * The waitlist's writes. Each one: the gate, one call to the service, the pages that show
 * it refreshed, and a sentence. Holding back a firm's addresses happens only here, when the
 * founder presses after the preview; a yes never holds anything by itself.
 */

const ENTRY_ID = /^[0-9a-f-]{36}$/;
const BASE = "/data/waitlist";
/** The old waitlist file comes through a server action, whose limit is 4 MB in all. */
const MAX_IMPORT_BYTES = 3_500_000;
/** A saved copy goes to the service as base64 in one request: a third bigger on the way. */
const MAX_PROOF_BYTES = 3 * 1024 * 1024;
const STAGES = new Set<string>([
  "joined",
  "call_booked",
  "call_held",
  "pilot",
  "customer",
  "dropped",
]);
const FIELDS = [
  "firm",
  "firm_type",
  "city",
  "country",
  "contact_email",
  "how_joined",
  "joined_on",
  "owner",
  "next_step",
  "next_step_on",
  "naming",
  "described_as",
  "pilot_starts_on",
  "pilot_ends_on",
  "pilot_success",
  "drop_reason",
  "look_again_on",
] as const;

const attemptOf = (formData: FormData): string =>
  fieldValue(formData, "attempt", 64) || crypto.randomUUID();

const NO_ENTRY: ActionState = { status: "error", message: "That firm is not on the waitlist." };

function entryIdFrom(formData: FormData): string {
  const entryId = fieldValue(formData, "entry_id", 64);
  return ENTRY_ID.test(entryId) ? entryId : "";
}

/** Where a waitlist change shows: the overview, the list, the firm, All leads, and Home. */
function refreshWaitlist(entryId: string): void {
  refreshData(
    BASE,
    `${BASE}/for-investors`,
    "/data/leads",
    "/home",
    ...(entryId ? [`${BASE}/${entryId}`] : []),
  );
}

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString("en-GB")} ${count === 1 ? one : many}`;

/** A spreadsheet's export as text: UTF-8, UTF-16 by its mark, or the old Windows page (as Mail merge reads one). */
function decode(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export async function addFirmAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const email = fieldValue(formData, "email", 254).trim();
  if (!email) return { status: "error", message: "Type their address first." };
  const joinedOn = fieldValue(formData, "joined_on", 10).trim();
  if (joinedOn && !dayValue(joinedOn)) return { status: "error", message: "That is not a day." };
  let answer: { entry: api.WaitlistEntry; href: string };
  try {
    answer = await api.addFirm(
      {
        email,
        firm: fieldValue(formData, "firm", 200),
        joined_on: joinedOn,
        how_joined: fieldValue(formData, "how_joined", 200),
        quote: fieldValue(formData, "quote", 4_000),
      },
      staffOf(context),
      attemptOf(formData),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshWaitlist(answer.entry.entry_id);
  return {
    ...sent(`Added ${answer.entry.firm} at Joined.`),
    detail: JSON.stringify({ href: answer.href, label: "Open it" }),
  };
}

export async function updateEntryAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const entryId = entryIdFrom(formData);
  const context = await gate(formData, `${BASE}/${entryId}`);
  if (refused(context)) return context;
  if (!entryId) return NO_ENTRY;
  const field = FIELDS.find((key) => formData.has(key));
  if (!field) return { status: "error", message: "Nothing to change." };
  const limit = field === "pilot_success" ? 4_000 : 200;
  try {
    await api.updateEntry(entryId, field, fieldValue(formData, field, limit), staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshWaitlist(entryId);
  return sent("Saved.");
}

export async function moveStageAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const entryId = entryIdFrom(formData);
  const context = await gate(formData, `${BASE}/${entryId}`);
  if (refused(context)) return context;
  if (!entryId) return NO_ENTRY;
  const stage = fieldValue(formData, "stage", 20);
  if (!STAGES.has(stage)) return { status: "error", message: "Choose a stage." };
  const from = fieldValue(formData, "from", 20);
  const callAt = fieldValue(formData, "call_at", 40).trim();
  const input: api.StageMoveInput = {
    stage: stage as api.Stage,
    ...(STAGES.has(from) ? { from: from as api.Stage } : {}),
    next_step: fieldValue(formData, "next_step", 200),
    next_step_on: fieldValue(formData, "next_step_on", 10).trim(),
    notes: fieldValue(formData, "notes", 4_000),
    ...(stage === "call_booked" && callAt
      ? { call_at: typedInstant(callAt, context.me.time_zone) }
      : {}),
    ...(stage === "pilot"
      ? {
          pilot: {
            starts_on: fieldValue(formData, "pilot_starts_on", 10).trim(),
            ends_on: fieldValue(formData, "pilot_ends_on", 10).trim(),
            success: fieldValue(formData, "pilot_success", 4_000),
          },
        }
      : {}),
    ...(stage === "dropped"
      ? {
          dropped: {
            reason: fieldValue(formData, "reason", 40),
            look_again_on: fieldValue(formData, "look_again_on", 10).trim(),
          },
        }
      : {}),
  };
  let entry: api.WaitlistEntry;
  try {
    entry = (await api.moveStage(entryId, input, staffOf(context))).entry;
  } catch (error) {
    return refusal(error);
  }
  refreshWaitlist(entryId);
  const words: Record<api.Stage, string> = {
    joined: "Joined",
    call_booked: "Call booked",
    call_held: "Call held",
    pilot: "Pilot",
    customer: "Customer",
    dropped: "Dropped",
  };
  return sent(`Moved ${entry.firm} to ${words[entry.stage]}.`);
}

export async function addEntryNoteAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const entryId = entryIdFrom(formData);
  const context = await gate(formData, `${BASE}/${entryId}`);
  if (refused(context)) return context;
  if (!entryId) return NO_ENTRY;
  const kind = fieldValue(formData, "kind", 10) === "call" ? "call" : "note";
  const text = fieldValue(formData, "text", 4_000);
  if (!text.trim())
    return {
      status: "error",
      message: kind === "call" ? "Write what was said first." : "Write the note first.",
    };
  const when = fieldValue(formData, "at", 40).trim();
  try {
    await api.addEntryNote(
      entryId,
      {
        text,
        kind,
        ...(kind === "call" && when ? { at: typedInstant(when, context.me.time_zone) } : {}),
      },
      staffOf(context),
      attemptOf(formData),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshWaitlist(entryId);
  return sent(kind === "call" ? "Added the call." : "Added the note.");
}

export async function addColleagueAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const entryId = entryIdFrom(formData);
  const context = await gate(formData, `${BASE}/${entryId}`);
  if (refused(context)) return context;
  if (!entryId) return NO_ENTRY;
  const email = fieldValue(formData, "email", 254).trim();
  if (!email) return { status: "error", message: "Type their address first." };
  let lead: { name: string; email: string; lead_id: string };
  try {
    lead = (
      await api.addColleague(
        entryId,
        {
          email,
          name: fieldValue(formData, "name", 120),
          title: fieldValue(formData, "title", 200),
          role: fieldValue(formData, "role", 40) || "not_set",
        },
        staffOf(context),
      )
    ).lead;
  } catch (error) {
    return refusal(error);
  }
  refreshWaitlist(entryId);
  return {
    ...sent(`Added ${lead.name || lead.email}.`),
    detail: JSON.stringify({ href: `/data/leads/${lead.lead_id}`, label: "Open the lead" }),
  };
}

export async function setRoleAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const entryId = entryIdFrom(formData);
  const context = await gate(formData, `${BASE}/${entryId}`);
  if (refused(context)) return context;
  if (!entryId) return NO_ENTRY;
  try {
    await api.setColleagueRole(
      entryId,
      fieldValue(formData, "email", 254).trim(),
      fieldValue(formData, "role", 40),
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshWaitlist(entryId);
  return sent("Saved.");
}

export async function attachProofAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const entryId = entryIdFrom(formData);
  const context = await gate(formData, `${BASE}/${entryId}`);
  if (refused(context)) return context;
  if (!entryId) return NO_ENTRY;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { status: "error", message: "Choose the saved copy first." };
  if (file.size > MAX_PROOF_BYTES)
    return {
      status: "error",
      message: "That copy is over 3 MB. Put it in Files, then attach it from there.",
    };
  let title: string;
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    title = (
      await api.attachProof(
        entryId,
        { name: file.name.slice(0, 200), content: bytes.toString("base64") },
        staffOf(context),
        attemptOf(formData),
      )
    ).file.title;
  } catch (error) {
    return refusal(error);
  }
  refreshWaitlist(entryId);
  refreshData("/data/files");
  return sent(`Kept “${title}” in Files, under Waitlist proof.`);
}

export async function holdAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const entryId = entryIdFrom(formData);
  const context = await gate(formData, `${BASE}/${entryId}`);
  if (refused(context)) return context;
  if (!entryId) return NO_ENTRY;
  const emails = formData
    .getAll("email")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().slice(0, 254))
    .filter(Boolean)
    .slice(0, 200);
  if (emails.length === 0) return { status: "error", message: "Tick the addresses to hold back." };
  let answer: { added: string[]; already: string[]; skipped: string[] };
  try {
    answer = await api.holdBack(entryId, emails, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshWaitlist(entryId);
  const parts = [
    answer.added.length > 0
      ? `Held back ${answer.added.length.toLocaleString("en-GB")}. They are on the stop list as “Firm already joined”.`
      : "Nothing new was held back.",
  ];
  if (answer.already.length > 0)
    parts.push(
      `${plural(answer.already.length, "address was", "addresses were")} on the stop list already, so left as they are.`,
    );
  if (answer.skipped.length > 0)
    parts.push(
      `${plural(answer.skipped.length, "address was", "addresses were")} written to meanwhile, so left as they are.`,
    );
  return sent(parts.join(" "));
}

export async function releaseAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const entryId = entryIdFrom(formData);
  const context = await gate(formData, `${BASE}/${entryId}`);
  if (refused(context)) return context;
  const holdId = fieldValue(formData, "hold_id", 64);
  if (!ENTRY_ID.test(holdId)) return { status: "error", message: "That hold is not here." };
  const email = fieldValue(formData, "email", 254).trim();
  let answer: { released: string[]; kept: { email: string; why: string }[] };
  try {
    answer = await api.releaseHold(holdId, email ? [email] : null, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshWaitlist(entryId);
  const kept = answer.kept.map((item) => `${item.email} stays on the stop list: ${item.why}.`);
  const freed = answer.released.length - answer.kept.length;
  return sent(
    [
      freed > 0
        ? `Released ${freed.toLocaleString("en-GB")}. Mailings may write to them again.`
        : "Released from the hold.",
      ...kept,
    ].join(" "),
  );
}

export async function importWaitlistAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { status: "error", message: "Choose the file first." };
  if (file.size > MAX_IMPORT_BYTES)
    return {
      status: "error",
      message: "That file is over 3.5 MB. Split it into two and bring each in.",
    };
  let answer: { added: number; already: number; refused: { line: number; reason: string }[] };
  try {
    answer = await api.importOldWaitlist(
      {
        text: decode(new Uint8Array(await file.arrayBuffer())),
        file_name: file.name.slice(0, 200),
      },
      staffOf(context),
      attemptOf(formData),
    );
  } catch (error) {
    if (error instanceof DataRequestError) return { status: "error", message: error.message };
    return refusal(error);
  }
  refreshWaitlist("");
  const left =
    answer.refused.length > 0
      ? ` ${plural(answer.refused.length, "row was", "rows were")} left out (line ${answer.refused
          .slice(0, 5)
          .map((item) => item.line)
          .join(", ")}${answer.refused.length > 5 ? ", …" : ""}).`
      : "";
  return sent(
    `${plural(answer.added, "firm", "firms")} added; ${answer.already.toLocaleString("en-GB")} already here.${left}`,
  );
}
