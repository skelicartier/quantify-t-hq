import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });

export const calendarStatusSchema = z.object({
  /** The service holds a calendar client; without it nothing can connect. */
  configured: z.boolean(),
  /** The service has a public address for change notifications. */
  push_configured: z.boolean(),
  connected: z.boolean(),
  account_email: z.string(),
  connected_at: z.string().nullable(),
  last_synced_at: z.string().nullable(),
  last_error: z.string(),
  push_active: z.boolean(),
  channel_expires_at: z.string().nullable(),
});
export type CalendarStatus = z.infer<typeof calendarStatusSchema>;

const statusEnvelope = okEnvelope.extend({ calendar: calendarStatusSchema });

const syncCountsSchema = z.object({
  created: z.number(),
  updated: z.number(),
  canceled: z.number(),
  skipped: z.number(),
});

export function readCalendarStatus(token: string) {
  return fetchHqJson("hq/integrations/calendar", statusEnvelope, { token });
}

export function startCalendarConnect(token: string) {
  return postHqJson(
    "hq/integrations/calendar/connect",
    okEnvelope.extend({ authorization_url: z.string().url() }),
    { token, body: {} },
  );
}

export function completeCalendarConnect(token: string, code: string, state: string) {
  return postHqJson(
    "hq/integrations/calendar/complete",
    statusEnvelope.extend({ sync: syncCountsSchema }),
    { token, body: { code, state } },
  );
}

export function syncCalendarNow(token: string) {
  return postHqJson(
    "hq/integrations/calendar/sync",
    statusEnvelope.extend({ sync: syncCountsSchema }),
    { token, body: {} },
  );
}

export function disconnectCalendar(token: string, reason: string) {
  return postHqJson("hq/integrations/calendar/disconnect", statusEnvelope, {
    token,
    body: { reason },
  });
}
