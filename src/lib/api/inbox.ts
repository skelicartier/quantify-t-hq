import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });

export const INBOX_STATES = ["unread", "read", "snoozed", "done"] as const;

/** One line in a person's inbox: a subject, why it is here, and how many events it holds. */
export const inboxItemSchema = z.object({
  notification_id: z.string(),
  reason: z.string(),
  reason_label: z.string(),
  subject_type: z.string(),
  subject_id: z.string(),
  subject_label: z.string(),
  link_path: z.string(),
  actor: z.object({ staff_id: z.string(), name: z.string() }).nullable(),
  summary: z.string(),
  event_count: z.number(),
  first_at: z.string().nullable(),
  last_at: z.string().nullable(),
  state: z.enum(INBOX_STATES),
  snoozed_until: z.string().nullable(),
  /** In the person's Priority (by their own rule), or in Other. */
  priority: z.boolean().default(false),
});
export type InboxItem = z.infer<typeof inboxItemSchema>;

export const reminderSchema = z.object({
  reminder_id: z.string(),
  subject_type: z.string(),
  subject_id: z.string(),
  subject_label: z.string(),
  link_path: z.string(),
  note: z.string(),
  remind_at: z.string().nullable(),
});
export type Reminder = z.infer<typeof reminderSchema>;

const inboxSchema = okEnvelope.extend({
  items: z.array(inboxItemSchema),
  counts: z.object({
    unread: z.number(),
    inbox: z.number(),
    snoozed: z.number(),
    /** Open rows on each side, and how many of them are unread. */
    priority: z.number().default(0),
    priority_unread: z.number().default(0),
    other: z.number().default(0),
    other_unread: z.number().default(0),
  }),
  reminders: z.array(reminderSchema),
  reasons: z.array(z.object({ reason: z.string(), label: z.string() })),
  /** The reasons this person's Priority holds, and whether that is still the default. */
  rule: z.object({ reasons: z.array(z.string()), default: z.boolean() }),
});
export type InboxPage = z.infer<typeof inboxSchema>;

export function readInbox(
  token: string,
  query: { view?: string; reason?: string; box?: string } = {},
) {
  const filtered: Record<string, string> = {};
  for (const [name, value] of Object.entries(query)) if (value) filtered[name] = value;
  return fetchHqJson("hq/inbox", inboxSchema, { token, query: filtered });
}

export function updateInboxItem(
  token: string,
  notificationId: string,
  action: "read" | "unread" | "done" | "undone" | "snooze",
  until?: string,
) {
  return postHqJson(
    `hq/inbox/${notificationId}/update`,
    okEnvelope.extend({ item: inboxItemSchema }),
    { token, body: { action, ...(until ? { until } : {}) } },
  );
}

export function inboxBulk(token: string, action: "read_all" | "clear_read") {
  return postHqJson("hq/inbox/bulk", okEnvelope.extend({ changed: z.number() }), {
    token,
    body: { action },
  });
}

const subscriptionSchema = okEnvelope.extend({
  following: z.boolean(),
  reason: z.string(),
  muted: z.boolean(),
  followers: z.number(),
});
export type Subscription = z.infer<typeof subscriptionSchema>;

export function readSubscription(token: string, subjectType: string, subject: string) {
  return fetchHqJson(`hq/subscriptions/${subjectType}/${subject}`, subscriptionSchema, { token });
}

export function setSubscription(
  token: string,
  subjectType: string,
  subject: string,
  follow: boolean,
) {
  return postHqJson(
    `hq/subscriptions/${subjectType}/${subject}/set`,
    okEnvelope.extend({ following: z.boolean(), followers: z.number() }),
    { token, body: { follow } },
  );
}

export function createReminder(
  token: string,
  input: {
    subject_type: string;
    subject_id: string;
    subject_label: string;
    link_path: string;
    remind_at: string;
    note: string;
  },
) {
  return postHqJson("hq/reminders/create", okEnvelope.extend({ reminder: reminderSchema }), {
    token,
    body: input,
  });
}

export function cancelReminder(token: string, reminderId: string) {
  return postHqJson(
    `hq/reminders/${reminderId}/cancel`,
    okEnvelope.extend({ cancelled: z.boolean() }),
    { token, body: {} },
  );
}

export const prefsSchema = z.object({
  email_mode: z.enum(["unread", "priority", "digest", "off"]),
  delay_minutes: z.number(),
  quiet_from: z.number().nullable(),
  quiet_to: z.number().nullable(),
  time_zone: z.string(),
  /** The reasons that count as Priority for this person; the default until they change it. */
  priority_reasons: z.array(z.string()),
  priority_default: z.boolean(),
});
export type NotificationPrefs = z.infer<typeof prefsSchema>;

export function readNotificationPrefs(token: string) {
  return fetchHqJson("hq/me/notifications", okEnvelope.extend({ prefs: prefsSchema }), { token });
}

/** The zone alone: the service keeps every other preference as it was. */
export function setNotificationTimeZone(token: string, timeZone: string) {
  return postHqJson("hq/me/notifications/update", okEnvelope.extend({ prefs: prefsSchema }), {
    token,
    body: { time_zone: timeZone },
  });
}

export function updateNotificationPrefs(
  token: string,
  input: {
    email_mode: string;
    delay_minutes: number;
    quiet_from: number | "";
    quiet_to: number | "";
    time_zone: string;
  },
) {
  return postHqJson("hq/me/notifications/update", okEnvelope.extend({ prefs: prefsSchema }), {
    token,
    body: input,
  });
}

/** The person's own Priority rule — the mail settings are left as they are — or the default back. */
export function updatePriorityRule(token: string, reasons: readonly string[] | "default") {
  return postHqJson("hq/me/notifications/update", okEnvelope.extend({ prefs: prefsSchema }), {
    token,
    body: reasons === "default" ? { priority_default: true } : { priority_reasons: [...reasons] },
  });
}
