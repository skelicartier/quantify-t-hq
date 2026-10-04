import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });

export const slaSchema = z.object({
  timer: z.enum(["first-reply", "next-reply", "none"]),
  due_at: z.string().nullable(),
  status: z.enum(["healthy", "at-risk", "breached", "paused", "none"]),
  minutes_remaining: z.number().nullable(),
});
export type SlaState = z.infer<typeof slaSchema>;

export const ticketSummarySchema = z.object({
  id: z.string(),
  subject: z.string(),
  status: z.enum(["open", "pending", "resolved"]),
  snoozed: z.boolean(),
  snoozed_until: z.string().nullable(),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  source: z.string(),
  account_id: z.string(),
  contact_email: z.string(),
  assignee_staff_id: z.string(),
  assignee_name: z.string(),
  tags: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
  message_count: z.number(),
  notes_count: z.number(),
  last_author: z.string(),
  last_at: z.string(),
  unread: z.boolean(),
  linked_issue_url: z.string(),
  /** How many times this thread left Resolved — by a reopen on the desk or a customer writing again. */
  reopened_count: z.number(),
  /** Staff watching the thread without owning it; the customer never sees this. */
  followers: z.array(z.string()),
  following: z.boolean(),
  sla: slaSchema,
});
export type TicketSummary = z.infer<typeof ticketSummarySchema>;

const messageSchema = z.object({
  id: z.string(),
  author: z.enum(["customer", "staff", "system"]),
  author_name: z.string(),
  visibility: z.enum(["public", "internal"]),
  body: z.string(),
  at: z.string(),
});
export type TicketMessage = z.infer<typeof messageSchema>;

export const ticketSchema = ticketSummarySchema.extend({
  app_version: z.string(),
  platform: z.string(),
  messages: z.array(messageSchema),
});
export type Ticket = z.infer<typeof ticketSchema>;

export const queueSchema = okEnvelope.extend({
  tickets: z.array(ticketSummarySchema),
  counts: z.object({
    open: z.number(),
    pending: z.number(),
    resolved: z.number(),
    snoozed: z.number(),
    unassigned: z.number(),
    breached: z.number(),
    at_risk: z.number(),
    unread: z.number(),
  }),
  statuses: z.array(z.string()),
  priorities: z.array(z.string()),
  sla_states: z.array(z.string()),
});
export type Queue = z.infer<typeof queueSchema>;

const ticketEnvelope = okEnvelope.extend({ ticket: ticketSchema });

export const contextSchema = okEnvelope.extend({
  account: z
    .object({
      account_id: z.string(),
      email: z.string(),
      name: z.string(),
      plan: z.string(),
      is_active: z.boolean(),
      created_at: z.string().nullable(),
      last_login_at: z.string().nullable(),
    })
    .nullable(),
  app_version: z.string(),
  platform: z.string(),
  related_tickets: z.array(
    z.object({ id: z.string(), subject: z.string(), status: z.string(), updated_at: z.string() }),
  ),
});
export type TicketContext = z.infer<typeof contextSchema>;

export const savedRepliesSchema = okEnvelope.extend({
  replies: z.array(
    z.object({
      reply_id: z.string(),
      title: z.string(),
      body: z.string(),
      uses: z.number(),
      updated_at: z.string().nullable(),
      archived: z.boolean(),
    }),
  ),
});
export type SavedReply = z.infer<typeof savedRepliesSchema>["replies"][number];

export type QueueFilters = {
  following?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  tag?: string;
  sla?: string;
  q?: string;
};

export function readQueue(token: string, filters: QueueFilters = {}) {
  const query: Record<string, string> = {};
  for (const [name, value] of Object.entries(filters)) {
    if (value) query[name] = value;
  }
  return fetchHqJson("hq/tickets", queueSchema, { token, query });
}

export function readTicket(token: string, ticketId: string) {
  return fetchHqJson(`hq/tickets/${ticketId}`, ticketEnvelope, { token });
}

export function readTicketContext(token: string, ticketId: string) {
  return fetchHqJson(`hq/tickets/${ticketId}/context`, contextSchema, { token });
}

/**
 * A public reply. `seen_through` is the id of the newest message the replier had on
 * screen: a reply that would cross a colleague's (or the customer's newer message) is
 * refused once with what it crosses, unless `send_anyway`.
 */
export function replyToTicket(
  token: string,
  ticketId: string,
  body: string,
  options: { seen_through?: string; send_anyway?: boolean } = {},
) {
  return postHqJson(`hq/tickets/${ticketId}/reply`, ticketEnvelope, {
    token,
    body: { body, ...options },
  });
}

/** What a held-back reply would have crossed. */
export const crossedSchema = z.object({
  by: z.string(),
  customer: z.boolean(),
  at: z.string(),
  excerpt: z.string(),
  count: z.number(),
});
export type CrossedReply = z.infer<typeof crossedSchema>;

export const presenceSchema = okEnvelope.extend({
  others: z.array(
    z.object({
      staff_id: z.string(),
      name: z.string(),
      composing: z.boolean(),
      seen_at: z.string().nullable(),
    }),
  ),
  window_seconds: z.number(),
});
export type TicketPresence = z.infer<typeof presenceSchema>;

/** This person has the conversation open (and is, or is not, writing); who else has. */
export function touchPresence(token: string, ticketId: string, composing: boolean) {
  return postHqJson(`hq/tickets/${ticketId}/presence`, presenceSchema, {
    token,
    body: { composing },
  });
}

const deskReportSchema = okEnvelope.extend({
  available: z.boolean(),
  reason: z.string().optional(),
  days: z.number().optional(),
  series: z
    .array(
      z.object({ day: z.string(), open: z.number(), opened: z.number(), resolved: z.number() }),
    )
    .optional(),
  first_reply: z
    .object({
      count: z.number(),
      median_minutes: z.number().nullable(),
      slowest_tenth_minutes: z.number().nullable(),
    })
    .optional(),
  resolution: z
    .object({
      count: z.number(),
      median_hours: z.number().nullable(),
      slowest_tenth_hours: z.number().nullable(),
    })
    .optional(),
  open_ages: z
    .object({
      under_a_day: z.number(),
      one_to_three_days: z.number(),
      three_to_seven_days: z.number(),
      over_a_week: z.number(),
    })
    .optional(),
  by_priority: z
    .array(
      z.object({
        priority: z.string(),
        open: z.number(),
        resolved: z.number(),
        median_resolution_hours: z.number().nullable(),
      }),
    )
    .optional(),
});
export type DeskReport = z.infer<typeof deskReportSchema>;

/** The queue over a window of days, and how long first replies and resolutions took. */
export function readDeskReport(token: string, days: number) {
  return fetchHqJson("hq/reports/desk", deskReportSchema, { token, query: { days: String(days) } });
}

export function noteOnTicket(token: string, ticketId: string, body: string) {
  return postHqJson(`hq/tickets/${ticketId}/note`, ticketEnvelope, { token, body: { body } });
}

export type ManageChanges = {
  assignee_staff_id?: string;
  status?: string;
  priority?: string;
  tags?: string[];
  snoozed_until?: string;
  linked_issue_url?: string;
};

export function manageTicket(token: string, ticketId: string, changes: ManageChanges) {
  return postHqJson(`hq/tickets/${ticketId}/manage`, ticketEnvelope, { token, body: changes });
}

/** Watch a conversation (or stop): the same route with `following` true or false. */
export function followTicket(token: string, ticketId: string, following: boolean) {
  return postHqJson(`hq/tickets/${ticketId}/follow`, ticketEnvelope, {
    token,
    body: { following },
  });
}

/** Fold this conversation into `into`; the response is the conversation that carries on. */
export function mergeTicket(token: string, ticketId: string, into: string) {
  return postHqJson(`hq/tickets/${ticketId}/merge`, ticketEnvelope, {
    token,
    body: { into },
  });
}

export function openTicket(
  token: string,
  input: { account_id: string; subject: string; body: string },
) {
  return postHqJson("hq/tickets/open", ticketEnvelope, { token, body: input });
}

export function listSavedReplies(token: string) {
  return fetchHqJson("hq/saved-replies", savedRepliesSchema, { token });
}

export function createSavedReply(token: string, input: { title: string; body: string }) {
  return postHqJson(
    "hq/saved-replies/create",
    okEnvelope.extend({ reply: z.object({ reply_id: z.string() }).passthrough() }),
    { token, body: input },
  );
}

export function updateSavedReply(
  token: string,
  replyId: string,
  fields: { title?: string; body?: string; archived?: boolean; used?: boolean },
) {
  return postHqJson(
    `hq/saved-replies/${replyId}/update`,
    okEnvelope.extend({ updated: z.boolean() }),
    {
      token,
      body: fields,
    },
  );
}
