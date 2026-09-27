import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";
import { activitySchema } from "@/lib/api/crm";

const okEnvelope = z.object({ ok: z.literal(true) });

export const meetingSchema = z.object({
  meeting_id: z.string(),
  /** "calendar" when the synced calendar owns its times and guests. */
  source: z.enum(["calendar", "manual"]),
  kind: z.string(),
  status: z.string(),
  starts_at: z.string().nullable(),
  ends_at: z.string().nullable(),
  title: z.string(),
  description: z.string(),
  company_id: z.string(),
  company_name: z.string(),
  deal_id: z.string(),
  deal_name: z.string(),
  prep_notes: z.string(),
  outcome: z.string(),
  outcome_notes: z.string(),
  outcome_recorded_at: z.string().nullable(),
  recording_url: z.string(),
  needs_outcome: z.boolean(),
  outcome_lapsed: z.boolean(),
  attendees: z.array(
    z.object({
      email: z.string(),
      person_id: z.string(),
      person_name: z.string(),
      is_staff: z.boolean(),
      response: z.string(),
    }),
  ),
});
export type Meeting = z.infer<typeof meetingSchema>;

const meetingsSchema = okEnvelope.extend({
  meetings: z.array(meetingSchema),
  counts: z.object({ needs_outcome: z.number(), today: z.number() }),
  kinds: z.array(z.string()),
  outcomes: z.array(z.string()),
});
export type MeetingsPage = z.infer<typeof meetingsSchema>;

export function readMeetings(
  token: string,
  when: "upcoming" | "past" | "needs_outcome",
  filters: { company_id?: string; deal_id?: string } = {},
) {
  const query: Record<string, string> = { when };
  for (const [name, value] of Object.entries(filters)) if (value) query[name] = value;
  return fetchHqJson("hq/meetings", meetingsSchema, { token, query });
}

const meetingDetailSchema = okEnvelope.extend({
  meeting: meetingSchema,
  activities: z.array(activitySchema),
  follow_ups: z.array(
    z.object({
      task_id: z.string(),
      title: z.string(),
      status: z.string(),
      due_on: z.string().nullable(),
      origin: z.string(),
    }),
  ),
});
export type MeetingDetail = z.infer<typeof meetingDetailSchema>;

export function readMeeting(token: string, meetingId: string) {
  return fetchHqJson(`hq/meetings/${meetingId}`, meetingDetailSchema, { token });
}

const meetingEnvelope = okEnvelope.extend({ meeting: meetingSchema });

export function createMeeting(token: string, input: Record<string, unknown>) {
  return postHqJson("hq/meetings/create", meetingEnvelope, { token, body: input });
}

export function updateMeeting(token: string, meetingId: string, input: Record<string, unknown>) {
  return postHqJson(`hq/meetings/${meetingId}/update`, meetingEnvelope, { token, body: input });
}

export function recordMeetingOutcome(
  token: string,
  meetingId: string,
  input: { status: string; outcome?: string; outcome_notes?: string },
) {
  return postHqJson(
    `hq/meetings/${meetingId}/outcome`,
    meetingEnvelope.extend({ follow_ups_created: z.number() }),
    { token, body: input },
  );
}
