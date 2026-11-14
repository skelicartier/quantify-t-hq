import "server-only";

import { z } from "zod";

import { staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * Meetings, resolutions and minutes (ws-notes/company/spec.md §7.8), kept on this computer
 * by the local service: the list, one meeting with its checks and timetable, and every
 * write. The service refuses in sentences the pages show as they are.
 */

export const meetingKindSchema = z.enum(["board", "agm", "egm", "circular"]);
export type MeetingKind = z.infer<typeof meetingKindSchema>;
export const meetingStateSchema = z.enum(["planned", "held", "cancelled"]);
export const meetingModeSchema = z.enum(["in_person", "video", "hybrid"]);
export const attendeeRoleSchema = z.enum([
  "director",
  "member",
  "proxy",
  "invitee",
  "auditor",
  "secretary",
]);
export const resolutionKindSchema = z.enum(["ordinary", "special", "board"]);
export const outcomeSchema = z.enum(["passed", "not_passed", "deferred"]);
export const mgt14Schema = z.enum(["needed", "not_needed", "ask"]);

export const attendeeSchema = z.object({
  attendee_id: z.string(),
  name: z.string(),
  role: attendeeRoleSchema,
  director_id: z.string().nullable(),
  how: z.enum(["in_person", "video"]),
});
export type Attendee = z.infer<typeof attendeeSchema>;

export const resolutionSchema = z.object({
  resolution_id: z.string(),
  number: z.number(),
  title: z.string(),
  text: z.string(),
  kind: resolutionKindSchema,
  outcome: outcomeSchema,
  s179_3: z.boolean(),
  mgt14: mgt14Schema,
  noted_at: z.string().nullable(),
});
export type Resolution = z.infer<typeof resolutionSchema>;

export const minutesSchema = z.object({
  text: z.string(),
  draft_sent_on: z.string().nullable(),
  comments_closed_on: z.string().nullable(),
  comments: z.string(),
  signed: z
    .object({
      on: z.string(),
      by_name: z.string(),
      file_id: z.string().nullable(),
      at: z.string(),
      by: staffSchema,
    })
    .nullable(),
  later_notes: z.array(
    z.object({ note_id: z.string(), text: z.string(), at: z.string(), by: staffSchema }),
  ),
});
export type Minutes = z.infer<typeof minutesSchema>;

export const meetingSchema = z.object({
  meeting_id: z.string(),
  kind: meetingKindSchema,
  title: z.string(),
  scheduled_on: z.string(),
  time: z.string(),
  place: z.string(),
  mode: meetingModeSchema,
  agenda: z.string(),
  notice: z.object({ sent_on: z.string().nullable(), shorter_reason: z.string() }),
  state: meetingStateSchema,
  held_on: z.string().nullable(),
  chair: z.string(),
  board_size: z.number().nullable(),
  attendees: z.array(attendeeSchema),
  quorum_present: z.boolean().nullable(),
  resolutions: z.array(resolutionSchema),
  minutes: minutesSchema,
  cancelled: z.object({ on: z.string(), why: z.string() }).nullable(),
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
});
export type Meeting = z.infer<typeof meetingSchema>;

export const noticeCheckSchema = z.object({
  sent_on: z.string().nullable(),
  send_by: z.string(),
  days: z.number().nullable(),
  clear: z.boolean(),
  needed: z.number(),
  short: z.boolean(),
  words: z.string(),
  sentence: z.string(),
});
export type NoticeCheck = z.infer<typeof noticeCheckSchema>;

export const quorumSchema = z.object({
  needed: z.number(),
  present: z.number(),
  met: z.boolean(),
  directors: z.number().nullable(),
});
export type Quorum = z.infer<typeof quorumSchema>;

export const stepSchema = z.enum(["draft", "comments", "signed"]);
export const minutesStepSchema = z
  .object({ step: z.enum(["draft", "comments", "signed", "done"]), by: z.string() })
  .nullable();
export type MinutesStep = z.infer<typeof minutesStepSchema>;

export const timetableRowSchema = z.object({
  step: stepSchema,
  by: z.string(),
  done_on: z.string().nullable(),
});
export type TimetableRow = z.infer<typeof timetableRowSchema>;

export const keyDateLinkSchema = z.object({
  date_id: z.string(),
  rule_key: z.string(),
  origin_key: z.string(),
  title: z.string(),
  due_on: z.string(),
  state: z.enum(["coming_up", "in_progress", "done", "not_for_us", "taken_back"]),
  overdue: z.boolean(),
  href: z.string(),
});
export type KeyDateLink = z.infer<typeof keyDateLinkSchema>;

export const resolutionViewSchema = z.object({
  resolution_id: z.string(),
  meeting_id: z.string(),
  meeting_kind: meetingKindSchema,
  passed_on: z.string(),
  meeting_title: z.string(),
  title: z.string(),
  kind: resolutionKindSchema,
  href: z.string(),
});
export type ResolutionView = z.infer<typeof resolutionViewSchema>;

export const meetingRowSchema = z.object({
  meeting_id: z.string(),
  kind: meetingKindSchema,
  title: z.string(),
  scheduled_on: z.string(),
  time: z.string(),
  place: z.string(),
  mode: meetingModeSchema,
  state: meetingStateSchema,
  held_on: z.string().nullable(),
  signed_on: z.string().nullable(),
  cancelled: z.object({ on: z.string(), why: z.string() }).nullable(),
  quorum_present: z.boolean().nullable(),
  serial_title: z.string(),
  notice_check: noticeCheckSchema.nullable(),
  quorum: quorumSchema.nullable(),
  minutes_step: minutesStepSchema,
  resolutions: z.number(),
});
export type MeetingRow = z.infer<typeof meetingRowSchema>;

const directorOptionSchema = z.object({ director_id: z.string(), name: z.string() });
export const fileChoiceSchema = z.object({
  file_id: z.string(),
  title: z.string(),
  folder: z.string(),
});
export type FileChoice = z.infer<typeof fileChoiceSchema>;

export const meetingsPageSchema = ok.extend({
  meetings: z.array(meetingRowSchema),
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  counts: z.record(z.string(), z.number()),
  held: z.number(),
  directors: z.array(directorOptionSchema).nullable(),
  today: z.string(),
});
export type MeetingsPage = z.infer<typeof meetingsPageSchema>;

export const meetingsEventSchema = z.object({
  event_id: z.string(),
  meeting_id: z.string(),
  verb: z.string(),
  detail: z.string(),
  by: staffSchema,
  at: z.string(),
});
export type MeetingsEvent = z.infer<typeof meetingsEventSchema>;

export const meetingPageSchema = ok.extend({
  meeting: meetingSchema,
  serial_title: z.string(),
  warnings: z.array(z.string()),
  notice_check: noticeCheckSchema.nullable(),
  quorum: quorumSchema.nullable(),
  quorum_sentence: z.string(),
  board_size: z.number().nullable(),
  timetable: z.array(timetableRowSchema),
  minutes_step: minutesStepSchema,
  key_dates: z.record(z.string(), z.array(keyDateLinkSchema)).nullable(),
  key_dates_note: z.string(),
  mgt14_by: z.record(z.string(), z.string()),
  directors: z.array(directorOptionSchema).nullable(),
  circulars_to_note: z.array(resolutionViewSchema),
  noted_at: z.record(z.string(), z.string()),
  signed_file: z.object({ file_id: z.string(), title: z.string() }).nullable(),
  files: z.array(fileChoiceSchema),
  files_here: z.boolean(),
  events: z.array(meetingsEventSchema),
  today: z.string(),
});
export type MeetingPage = z.infer<typeof meetingPageSchema>;

const meetingAnswer = ok.extend({ meeting: meetingSchema });
const warnedAnswer = ok.extend({ meeting: meetingSchema, warnings: z.array(z.string()) });
const planAnswer = ok.extend({
  meeting: meetingSchema,
  serial_title: z.string(),
  notice_check: noticeCheckSchema.nullable(),
  warnings: z.array(z.string()),
  key_dates: z.array(keyDateLinkSchema).nullable(),
});
const resolutionAnswer = ok.extend({
  meeting: meetingSchema,
  key_dates: z.array(keyDateLinkSchema).nullable(),
});

function query(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined && value !== "" && value !== 0) params.set(key, String(value));
  const rendered = params.toString();
  return rendered ? `?${rendered}` : "";
}

export type MeetingsQuery = { kind?: string; state?: string; offset?: number };

export const readMeetings = (input: MeetingsQuery = {}) =>
  dataAsk(
    meetingsPageSchema,
    "GET",
    `/data/meetings${query({ kind: input.kind, state: input.state, offset: input.offset })}`,
  );

export const readMeeting = (meetingId: string) =>
  dataAsk(meetingPageSchema, "GET", `/data/meetings/${id(meetingId)}`);

export type PlanInput = {
  kind: MeetingKind;
  title: string;
  scheduled_on: string;
  time: string;
  place: string;
  mode: z.infer<typeof meetingModeSchema>;
  agenda: string;
  board_size?: number | "";
  held?: boolean;
  /** A resolution by circulation comes with its one resolution. */
  resolution?: { title: string; text: string; s179_3: boolean; add_date?: boolean };
};

export const planMeeting = (input: PlanInput, by: Staff, attempt: string) =>
  dataAsk(planAnswer, "POST", "/data/meetings", { ...input, by, attempt });

export const updateMeeting = (meetingId: string, input: Partial<PlanInput>, by: Staff) =>
  dataAsk(meetingAnswer, "POST", `/data/meetings/${id(meetingId)}/update`, { ...input, by });

export const recordNotice = (
  meetingId: string,
  input: { sent_on: string; shorter_reason: string },
  by: Staff,
) => dataAsk(warnedAnswer, "POST", `/data/meetings/${id(meetingId)}/notice`, { ...input, by });

export type AttendeeInput = {
  name: string;
  role: z.infer<typeof attendeeRoleSchema>;
  director_id: string | null;
  how: "in_person" | "video";
};

export const recordHeld = (
  meetingId: string,
  input: {
    held_on: string;
    chair: string;
    attendees: AttendeeInput[];
    quorum_present?: boolean | null;
  },
  by: Staff,
) => dataAsk(warnedAnswer, "POST", `/data/meetings/${id(meetingId)}/held`, { ...input, by });

export const cancelMeeting = (meetingId: string, input: { on: string; why: string }, by: Staff) =>
  dataAsk(meetingAnswer, "POST", `/data/meetings/${id(meetingId)}/cancel`, { ...input, by });

export type ResolutionInput = {
  title: string;
  text: string;
  kind: z.infer<typeof resolutionKindSchema>;
  outcome: z.infer<typeof outcomeSchema>;
  s179_3: boolean;
  mgt14?: z.infer<typeof mgt14Schema>;
  /** "Add the MGT-14 filing to Key dates"; absent is not ticked. */
  add_date?: boolean;
};

export const addResolution = (
  meetingId: string,
  input: ResolutionInput,
  by: Staff,
  attempt: string,
) =>
  dataAsk(resolutionAnswer, "POST", `/data/meetings/${id(meetingId)}/resolutions`, {
    ...input,
    by,
    attempt,
  });

export const updateResolution = (
  meetingId: string,
  resolutionId: string,
  input: Partial<ResolutionInput>,
  by: Staff,
) =>
  dataAsk(
    resolutionAnswer,
    "POST",
    `/data/meetings/${id(meetingId)}/resolutions/${id(resolutionId)}/update`,
    { ...input, by },
  );

export const setMgt14 = (
  meetingId: string,
  resolutionId: string,
  input: { mgt14: z.infer<typeof mgt14Schema>; add_date: boolean },
  by: Staff,
) =>
  dataAsk(
    resolutionAnswer,
    "POST",
    `/data/meetings/${id(meetingId)}/resolutions/${id(resolutionId)}/mgt-14`,
    { ...input, by },
  );

export const saveMinutes = (meetingId: string, text: string, by: Staff) =>
  dataAsk(meetingAnswer, "POST", `/data/meetings/${id(meetingId)}/minutes`, { text, by });

export const markDraftSent = (meetingId: string, on: string, by: Staff) =>
  dataAsk(meetingAnswer, "POST", `/data/meetings/${id(meetingId)}/minutes/draft-sent`, { on, by });

export const closeComments = (
  meetingId: string,
  input: { on: string; comments: string },
  by: Staff,
) =>
  dataAsk(meetingAnswer, "POST", `/data/meetings/${id(meetingId)}/minutes/comments-closed`, {
    ...input,
    by,
  });

/** A copy: a file in Files, or the bytes as base64 with the file's name. */
export type CopyInput =
  { file_id: string } | { content: string; name: string } | Record<never, never>;

export const signMinutes = (
  meetingId: string,
  input: { signed_on: string; by_name: string } & CopyInput,
  by: Staff,
) =>
  dataAsk(meetingAnswer, "POST", `/data/meetings/${id(meetingId)}/minutes/signed`, {
    ...input,
    by,
  });

export const attachSignedMinutes = (meetingId: string, input: CopyInput, by: Staff) =>
  dataAsk(meetingAnswer, "POST", `/data/meetings/${id(meetingId)}/minutes/signed-copy`, {
    ...input,
    by,
  });

export const addLaterNote = (meetingId: string, text: string, by: Staff, attempt: string) =>
  dataAsk(meetingAnswer, "POST", `/data/meetings/${id(meetingId)}/later-notes`, {
    text,
    by,
    attempt,
  });

export const noteCirculars = (meetingId: string, resolutionIds: string[], by: Staff) =>
  dataAsk(meetingAnswer, "POST", `/data/meetings/${id(meetingId)}/note-circulars`, {
    resolution_ids: resolutionIds,
    by,
  });
