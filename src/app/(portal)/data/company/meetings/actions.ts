"use server";

import {
  NOT_A_DAY,
  OTHER_ROWS,
  attemptOf,
  copyFrom,
  idOf,
  isState,
  ticked,
  typedDay,
  withWarnings,
} from "@/components/data/meetings/form-values";
import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/meetings";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import { dayWords } from "@/lib/data/labels-registers";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * Meetings' writes: planning a meeting or recording one held, a resolution by circulation,
 * the notice, who was there, cancelling, resolutions and their MGT-14 choice, and the
 * minutes from the draft to signing, the signed copy and notes after signing. Each one: the
 * gate, one call to the service, the pages that show it refreshed, and a sentence.
 */

const BASE = "/data/company/meetings";
const KINDS = new Set(["board", "agm", "egm"]);
const MODES = new Set(api.meetingModeSchema.options);
const ROLES = new Set<string>(api.attendeeRoleSchema.options);
const OUTCOMES = new Set<string>(api.outcomeSchema.options);
const CHOICES = new Set<string>(api.mgt14Schema.options);
const RES_KINDS = new Set<string>(api.resolutionKindSchema.options);

const NO_MEETING: ActionState = { status: "error", message: "That meeting is not here." };

function refreshMeeting(meetingId = ""): void {
  refreshData(BASE, ...(meetingId ? [`${BASE}/${meetingId}`] : []), "/data/dates");
}

async function opened(formData: FormData) {
  const context = await gate(formData, BASE);
  if (refused(context)) return { context: null, failure: context, meetingId: "" };
  const meetingId = idOf(formData, "meeting_id");
  return { context, failure: meetingId ? null : NO_MEETING, meetingId };
}

export async function planMeetingAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const kind = fieldValue(formData, "kind", 20);
  if (!KINDS.has(kind)) return { status: "error", message: "Choose from the list." };
  const day = typedDay(formData, "scheduled_on");
  if (!day) return NOT_A_DAY;
  const mode = fieldValue(formData, "mode", 20) || "in_person";
  if (!MODES.has(mode as never)) return { status: "error", message: "Choose from the list." };
  const held = ticked(formData, "held");
  const size = fieldValue(formData, "board_size", 4).trim();
  let answer: Awaited<ReturnType<typeof api.planMeeting>>;
  try {
    answer = await api.planMeeting(
      {
        kind: kind as api.MeetingKind,
        title: fieldValue(formData, "title", 200),
        scheduled_on: day,
        time: fieldValue(formData, "time", 5),
        place: fieldValue(formData, "place", 200),
        mode: mode as api.PlanInput["mode"],
        agenda: fieldValue(formData, "agenda", 4_000),
        ...(size ? { board_size: Number(size) } : {}),
        held,
      },
      staffOf(context),
      attemptOf(formData),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshMeeting(answer.meeting.meeting_id);
  if (held) return sent("Recorded as held. Add who was there.");
  return sent(
    answer.notice_check
      ? `Planned. Send the notice by ${dayWords(answer.notice_check.send_by)}.`
      : "Planned.",
  );
}

export async function recordCircularAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const day = typedDay(formData, "passed_on");
  if (!day) return NOT_A_DAY;
  const title = fieldValue(formData, "title", 200).trim();
  if (!title) return { status: "error", message: "Give the resolution a title." };
  let warnings: string[] = [];
  try {
    const answer = await api.planMeeting(
      {
        kind: "circular",
        title: "",
        scheduled_on: day,
        time: "",
        place: "",
        mode: "in_person",
        agenda: "",
        held: true,
        resolution: {
          title,
          text: fieldValue(formData, "text", 8_000),
          s179_3: ticked(formData, "s179_3"),
        },
      },
      staffOf(context),
      attemptOf(formData),
    );
    warnings = answer.warnings;
    refreshMeeting(answer.meeting.meeting_id);
  } catch (error) {
    return refusal(error);
  }
  return sent(withWarnings("Recorded.", warnings));
}

export async function recordNoticeAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, failure, meetingId } = await opened(formData);
  if (!context || failure) return failure ?? NO_MEETING;
  const day = typedDay(formData, "sent_on");
  if (!day) return NOT_A_DAY;
  let warnings: string[] = [];
  try {
    warnings = (
      await api.recordNotice(
        meetingId,
        { sent_on: day, shorter_reason: fieldValue(formData, "shorter_reason", 300) },
        staffOf(context),
      )
    ).warnings;
  } catch (error) {
    return refusal(error);
  }
  refreshMeeting(meetingId);
  return sent(
    withWarnings(
      "Recorded.",
      warnings.filter((line) => line.startsWith("Notice")),
    ),
  );
}

export async function recordHeldAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, failure, meetingId } = await opened(formData);
  if (!context || failure) return failure ?? NO_MEETING;
  const day = typedDay(formData, "held_on");
  if (!day) return NOT_A_DAY;
  const attendees: api.AttendeeInput[] = [];
  for (const value of formData.getAll("director")) {
    if (typeof value !== "string") continue;
    const [directorId = "", ...name] = value.split("|");
    if (!/^[A-Za-z0-9-]{1,64}$/.test(directorId)) continue;
    attendees.push({
      name: name.join("|").slice(0, 200),
      role: "director",
      director_id: directorId,
      how: fieldValue(formData, `how_${directorId}`, 10) === "video" ? "video" : "in_person",
    });
  }
  for (let index = 0; index < OTHER_ROWS; index += 1) {
    const name = fieldValue(formData, `other_name_${index}`, 200).trim();
    if (!name) continue;
    const role = fieldValue(formData, `other_role_${index}`, 20) || "director";
    attendees.push({
      name,
      role: (ROLES.has(role) ? role : "director") as api.AttendeeInput["role"],
      director_id: null,
      how: fieldValue(formData, `other_how_${index}`, 10) === "video" ? "video" : "in_person",
    });
  }
  const general = fieldValue(formData, "general", 5) === "1";
  let said = "Recorded.";
  try {
    const answer = await api.recordHeld(
      meetingId,
      {
        held_on: day,
        chair: fieldValue(formData, "chair", 120),
        attendees,
        ...(general ? { quorum_present: ticked(formData, "quorum_present") } : {}),
      },
      staffOf(context),
    );
    said = withWarnings("Recorded.", answer.warnings);
  } catch (error) {
    return refusal(error);
  }
  refreshMeeting(meetingId);
  return sent(said);
}

export async function cancelMeetingAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, failure, meetingId } = await opened(formData);
  if (!context || failure) return failure ?? NO_MEETING;
  const day = typedDay(formData, "on");
  if (day === null) return NOT_A_DAY;
  try {
    await api.cancelMeeting(
      meetingId,
      { on: day, why: fieldValue(formData, "why", 300) },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshMeeting(meetingId);
  return sent("Cancelled.");
}

function resolutionFields(formData: FormData): api.ResolutionInput | ActionState {
  const title = fieldValue(formData, "title", 200).trim();
  if (!title) return { status: "error", message: "Give the resolution a title." };
  const kind = fieldValue(formData, "kind", 20);
  const outcome = fieldValue(formData, "outcome", 20) || "passed";
  const mgt14 = fieldValue(formData, "mgt14", 20);
  if (!RES_KINDS.has(kind) || !OUTCOMES.has(outcome) || (mgt14 && !CHOICES.has(mgt14)))
    return { status: "error", message: "Choose from the list." };
  return {
    title,
    text: fieldValue(formData, "text", 8_000),
    kind: kind as api.ResolutionInput["kind"],
    outcome: outcome as api.ResolutionInput["outcome"],
    s179_3: ticked(formData, "s179_3"),
    ...(mgt14 ? { mgt14: mgt14 as NonNullable<api.ResolutionInput["mgt14"]> } : {}),
    add_date: ticked(formData, "add_date"),
  };
}

const mgt14Said = (links: api.KeyDateLink[] | null, before: string): string => {
  const open = links?.find((link) => link.state === "coming_up" || link.state === "in_progress");
  return open ? `${before} MGT-14 is in Key dates for ${dayWords(open.due_on)}.` : before;
};

export async function addResolutionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, failure, meetingId } = await opened(formData);
  if (!context || failure) return failure ?? NO_MEETING;
  const fields = resolutionFields(formData);
  if (isState(fields)) return fields;
  let said = "Added.";
  try {
    const answer = await api.addResolution(
      meetingId,
      fields,
      staffOf(context),
      attemptOf(formData),
    );
    said = mgt14Said(answer.key_dates, "Added.");
  } catch (error) {
    return refusal(error);
  }
  refreshMeeting(meetingId);
  return sent(said);
}

export async function editResolutionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, failure, meetingId } = await opened(formData);
  if (!context || failure) return failure ?? NO_MEETING;
  const resolutionId = idOf(formData, "resolution_id");
  if (!resolutionId) return { status: "error", message: "That resolution is not here." };
  const fields = resolutionFields(formData);
  if (isState(fields)) return fields;
  let said = "Saved.";
  try {
    const answer = await api.updateResolution(meetingId, resolutionId, fields, staffOf(context));
    said = mgt14Said(answer.key_dates, "Saved.");
  } catch (error) {
    return refusal(error);
  }
  refreshMeeting(meetingId);
  return sent(said);
}

export async function mgt14Action(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, failure, meetingId } = await opened(formData);
  if (!context || failure) return failure ?? NO_MEETING;
  const resolutionId = idOf(formData, "resolution_id");
  const choice = fieldValue(formData, "mgt14", 20);
  if (!resolutionId || !CHOICES.has(choice))
    return { status: "error", message: "Choose from the list." };
  let said = "Saved.";
  try {
    const answer = await api.setMgt14(
      meetingId,
      resolutionId,
      {
        mgt14: choice as NonNullable<api.ResolutionInput["mgt14"]>,
        add_date: ticked(formData, "add_date"),
      },
      staffOf(context),
    );
    said = mgt14Said(answer.key_dates, "Saved.");
  } catch (error) {
    return refusal(error);
  }
  refreshMeeting(meetingId);
  return sent(said);
}

export async function saveMinutesAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, failure, meetingId } = await opened(formData);
  if (!context || failure) return failure ?? NO_MEETING;
  try {
    await api.saveMinutes(meetingId, fieldValue(formData, "text", 20_000), staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshMeeting(meetingId);
  return sent("Saved.");
}

export async function draftSentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, failure, meetingId } = await opened(formData);
  if (!context || failure) return failure ?? NO_MEETING;
  const day = typedDay(formData, "on");
  if (!day) return NOT_A_DAY;
  try {
    await api.markDraftSent(meetingId, day, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshMeeting(meetingId);
  return sent("Recorded.");
}

export async function closeCommentsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, failure, meetingId } = await opened(formData);
  if (!context || failure) return failure ?? NO_MEETING;
  const day = typedDay(formData, "on");
  if (!day) return NOT_A_DAY;
  try {
    await api.closeComments(
      meetingId,
      { on: day, comments: fieldValue(formData, "comments", 4_000) },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshMeeting(meetingId);
  return sent("Recorded.");
}

export async function signMinutesAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, failure, meetingId } = await opened(formData);
  if (!context || failure) return failure ?? NO_MEETING;
  const day = typedDay(formData, "signed_on");
  if (!day) return NOT_A_DAY;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  try {
    await api.signMinutes(
      meetingId,
      { signed_on: day, by_name: fieldValue(formData, "by_name", 120), ...copy },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshMeeting(meetingId);
  refreshData("/data/files");
  return sent("Signed and locked.");
}

export async function attachSignedAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, failure, meetingId } = await opened(formData);
  if (!context || failure) return failure ?? NO_MEETING;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  if (!("file_id" in copy) && !("content" in copy))
    return { status: "error", message: "Choose the copy first." };
  try {
    await api.attachSignedMinutes(meetingId, copy, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshMeeting(meetingId);
  refreshData("/data/files");
  return sent("Attached.");
}

export async function laterNoteAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, failure, meetingId } = await opened(formData);
  if (!context || failure) return failure ?? NO_MEETING;
  const text = fieldValue(formData, "text", 2_000).trim();
  if (!text) return { status: "error", message: "Write the note." };
  try {
    await api.addLaterNote(meetingId, text, staffOf(context), attemptOf(formData));
  } catch (error) {
    return refusal(error);
  }
  refreshMeeting(meetingId);
  return sent("Added. It cannot be changed.");
}

export async function noteCircularsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, failure, meetingId } = await opened(formData);
  if (!context || failure) return failure ?? NO_MEETING;
  const ids = formData
    .getAll("resolution_id")
    .filter((value): value is string => typeof value === "string")
    .filter((value) => /^[A-Za-z0-9-]{1,64}$/.test(value));
  if (ids.length === 0)
    return { status: "error", message: "Choose the resolutions to note at this meeting." };
  try {
    await api.noteCirculars(meetingId, ids, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData(BASE);
  return sent("Noted.");
}
