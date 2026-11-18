import "server-only";

import { z } from "zod";

import { dataAsk, ok } from "@/lib/data/socket";

/**
 * Waitlist › Batches, as the portal reads it: each mailing sent for real, with what Mail
 * merge read back about its delivery, the people who replied and the firms that joined.
 * Counts only; the page writes ratios as "x of y". Nothing here writes anything.
 */

export const deliveryCountsSchema = z.object({
  accepted: z.number(),
  delivered: z.number(),
  not_yet: z.number(),
  soft_bounce: z.number(),
  hard_bounce: z.number(),
  blocked: z.number(),
  invalid: z.number(),
  error: z.number(),
  didnt_arrive: z.number(),
  complaint: z.number(),
  unsubscribed: z.number(),
  retry: z.number(),
});
export type DeliveryCountsValue = z.infer<typeof deliveryCountsSchema>;

export const deliveryWarningSchema = z.object({
  key: z.enum(["complaints", "hard_bounces"]),
  level: z.enum(["attention", "danger"]),
  title: z.string(),
  body: z.string(),
});
export type DeliveryWarningValue = z.infer<typeof deliveryWarningSchema>;

export const deliveryFeedStateSchema = z.object({
  last_read_at: z.string().nullable(),
  outcome: z.enum(["ok", "partial", "no_key", "refused", "unreachable", "slowed"]).nullable(),
  detail: z.string(),
  auto_stop_from: z.string().nullable(),
  waiting: z.number(),
});
export type DeliveryFeedStateValue = z.infer<typeof deliveryFeedStateSchema>;

const outcomeCountsSchema = z.record(z.string(), z.number());

const funnelCountsSchema = z.object({
  accepted: z.number(),
  delivery: deliveryCountsSchema.nullable(),
  replied: z.number(),
  out_of_office: z.number(),
  by_outcome: outcomeCountsSchema,
  yes: z.number(),
  yes_not_on_waitlist: z.number(),
  joined: z.number(),
  calls_booked: z.number(),
  calls_held: z.number(),
  pilots: z.number(),
});

export const batchRowSchema = funnelCountsSchema.extend({
  mailing_id: z.string(),
  name: z.string(),
  lists: z.array(z.string()),
  list_ids: z.array(z.string()),
  first_sent_at: z.string(),
  last_sent_at: z.string(),
  read_at: z.string().nullable(),
  warning: z.enum(["attention", "danger"]).nullable(),
});
export type BatchRow = z.infer<typeof batchRowSchema>;

export const funnelSchema = z.object({
  rows: z.array(batchRowSchema),
  total: funnelCountsSchema,
  not_from_a_batch: z.object({
    replied: z.number(),
    out_of_office: z.number(),
    yes: z.number(),
    by_outcome: outcomeCountsSchema,
  }),
});
export type BatchFunnel = z.infer<typeof funnelSchema>;

export const batchesSchema = ok.extend({
  today: z.string(),
  read: deliveryFeedStateSchema.nullable(),
  loaded: z.object({ delivery: z.boolean(), replies: z.boolean(), waitlist: z.boolean() }),
  /** The mailings Mail merge no longer holds: their rows stay, without a link. */
  gone: z.array(z.string()),
  funnel: funnelSchema,
});
export type DataBatches = z.infer<typeof batchesSchema>;

export const readBatches = () => dataAsk(batchesSchema, "GET", "/data/batches");
