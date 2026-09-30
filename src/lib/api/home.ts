import "server-only";

import { z } from "zod";

import { approvalSchema } from "@/lib/api/approval-schema";
import { renewalRowSchema } from "@/lib/api/revenue";

import { fetchHqJson } from "@/lib/api/core";
import { inboxItemSchema } from "@/lib/api/inbox";
import { moneyByCurrencySchema } from "@/lib/api/crm";
import { dealSummarySchema, leadSchema, mentionSchema, taskSchema } from "@/lib/api/crm";
import { meetingSchema } from "@/lib/api/meetings";
import { ticketSummarySchema } from "@/lib/api/tickets";

/**
 * The Home aggregate. Sections the caller's role cannot see are ABSENT from the
 * payload, not empty — hence every section is `.optional()`, and the page renders
 * cards from the keys that arrive.
 */
const homeSchema = z.object({
  ok: z.literal(true),
  as_of: z.string(),
  staff: z.object({ display_name: z.string(), role: z.string() }),
  /** Notes that named this person and that they have not marked seen. */
  mentions: z.object({ unseen: z.number(), mentions: z.array(mentionSchema) }).optional(),
  /** What waits in this person's inbox, newest first; everyone's. */
  inbox: z
    .object({ unread: z.number(), items: z.array(inboxItemSchema), available: z.boolean() })
    .optional(),
  desk: z
    .object({
      open: z.number(),
      pending: z.number(),
      unassigned: z.number(),
      breached: z.number(),
      at_risk: z.number(),
      tickets: z.array(ticketSummarySchema),
    })
    .optional(),
  leads: z
    .object({
      awaiting_first_reply: z.number(),
      first_reply_overdue: z.number(),
      first_reply_target_minutes: z.number().optional(),
      leads: z.array(leadSchema),
    })
    .optional(),
  tasks: z
    .object({
      open: z.number(),
      overdue: z.number(),
      due_today: z.number(),
      tasks: z.array(taskSchema),
    })
    .optional(),
  meetings: z
    .object({
      today: z.array(meetingSchema),
      today_count: z.number(),
      needs_outcome: z.array(meetingSchema),
      needs_outcome_count: z.number(),
    })
    .optional(),
  deals: z
    .object({
      open_count: z.number(),
      open_mrr: moneyByCurrencySchema.nullable(),
      weighted_mrr: moneyByCurrencySchema.nullable(),
      neglected: z.number(),
      rotting: z.number(),
      no_next_step: z.number(),
      deals: z.array(dealSummarySchema.extend({ company_name: z.string() })),
    })
    .optional(),
  renewals: z
    .object({
      due_60_count: z.number(),
      due_60_mrr: z.number(),
      undecided_count: z.number(),
      at_risk_count: z.number(),
      overdue_count: z.number(),
      renewals: z.array(renewalRowSchema),
    })
    .optional(),
  /** Requests under dual control; owners and admins only. */
  approvals: z
    .object({
      pending: z.number(),
      awaiting_me: z.number(),
      to_collect: z.number(),
      approvals: z.array(approvalSchema),
    })
    .optional(),
  /** Outbound mail for anyone who drafts: what is sending, what waits, the replies owed. */
  mail: z
    .object({
      running: z.number(),
      awaiting_approval: z.number(),
      paused: z.number(),
      awaiting_reply: z.number(),
      sending_enabled: z.boolean(),
      sent_today: z.number(),
      daily_cap: z.number(),
    })
    .optional(),
  /** What the sign-in rules and the new-device mail found lately; owners and admins only. */
  security: z
    .object({
      /** Security feed events nobody has acknowledged yet, and the critical ones among them. */
      open_events: z.number(),
      critical_open: z.number(),
      anomalies_7d: z.number(),
      new_devices_7d: z.number(),
      failed_logins_24h: z.number(),
      latest: z.array(
        z.object({
          occurred_at: z.string().nullable(),
          staff_id: z.string(),
          name: z.string(),
          rules: z.array(z.string()),
          address: z.string(),
        }),
      ),
    })
    .optional(),
});
export type HomeAggregate = z.infer<typeof homeSchema>;

export function readHome(token: string) {
  return fetchHqJson("hq/home", homeSchema, { token });
}
