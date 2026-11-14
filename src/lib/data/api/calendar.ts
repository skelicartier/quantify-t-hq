import "server-only";

import { z } from "zod";

import type { Staff } from "@/lib/data/gate";
import { dataAsk, ok } from "@/lib/data/socket";

/**
 * The calendar feed (raise spec §7.3): the private link Calendar on this Mac subscribes to,
 * what goes in it, and the items themselves for the feed route and the download. The
 * token travels only in the answer to "make the link" and in the feed's own read; neither
 * carries a replay key, so it is never stored by the service.
 */

export const agendaKindSchema = z.enum([
  "key_date",
  "investor",
  "offer_deadline",
  "waitlist",
  "follow_up",
  "file_review",
  "action",
]);

export const agendaItemSchema = z.object({
  key: z.string(),
  kind: agendaKindSchema,
  title: z.string(),
  plain: z.string(),
  sub: z.string(),
  on: z.string(),
  remind_days: z.array(z.number()),
  href: z.string(),
});
export type AgendaItemView = z.infer<typeof agendaItemSchema>;

export const calendarDetailSchema = z.enum(["full", "plain"]);
export type CalendarDetailKey = z.infer<typeof calendarDetailSchema>;

const staffSchema = z.object({ staff_id: z.string(), name: z.string() });

export const feedSchema = z.object({
  on: z.boolean(),
  made_at: z.string().nullable(),
  made_by: staffSchema.nullable(),
  detail: calendarDetailSchema,
  last_read_at: z.string().nullable(),
  reads: z.number(),
});
export type CalendarFeed = z.infer<typeof feedSchema>;

export const calendarSourceNames = [
  "dates",
  "investors",
  "waitlist",
  "replies",
  "files",
  "notes",
] as const;

export const calendarPageSchema = ok.extend({
  feed: feedSchema,
  sources: z.array(
    z.object({ name: z.enum(calendarSourceNames), here: z.boolean(), items: z.number() }),
  ),
  items: z.number(),
  today: z.string(),
});
export type CalendarPage = z.infer<typeof calendarPageSchema>;

export const calendarItemsSchema = ok.extend({
  items: z.array(agendaItemSchema),
  today: z.string(),
  detail: calendarDetailSchema,
});
export type CalendarItems = z.infer<typeof calendarItemsSchema>;

const feedAnswer = ok.extend({ feed: feedSchema });

export const readCalendar = () => dataAsk(calendarPageSchema, "GET", "/data/calendar");

/** A new link: the token is in this answer only. Any old link stops working. */
export const makeCalendarLink = (detail: CalendarDetailKey | null, by: Staff) =>
  dataAsk(feedAnswer.extend({ token: z.string() }), "POST", "/data/calendar/link", {
    ...(detail ? { detail } : {}),
    by,
  });

export const setCalendarDetail = (detail: CalendarDetailKey, by: Staff) =>
  dataAsk(feedAnswer, "POST", "/data/calendar/detail", { detail, by });

export const turnCalendarOff = (by: Staff) =>
  dataAsk(feedAnswer, "POST", "/data/calendar/off", { by });

/** For the signed-in download. */
export const readCalendarItems = () => dataAsk(calendarItemsSchema, "GET", "/data/calendar/items");

/** The calendar's own read, with the token from its link; refused 404 for any other. */
export const readCalendarFeed = (token: string) =>
  dataAsk(calendarItemsSchema, "POST", "/data/calendar/feed", { token });
