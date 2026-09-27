import "server-only";

import { z } from "zod";

import { fetchHqJson } from "@/lib/api/core";
import { dealSummarySchema, leadSchema, taskSchema } from "@/lib/api/crm";
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
  deals: z
    .object({
      open_count: z.number(),
      open_mrr: z.number(),
      weighted_mrr: z.number(),
      neglected: z.number(),
      rotting: z.number(),
      no_next_step: z.number(),
      deals: z.array(dealSummarySchema.extend({ company_name: z.string() })),
    })
    .optional(),
});
export type HomeAggregate = z.infer<typeof homeSchema>;

export function readHome(token: string) {
  return fetchHqJson("hq/home", homeSchema, { token });
}
