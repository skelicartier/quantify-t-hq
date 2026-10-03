import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });

/** A target account: its tier, its short plan, and when it was last touched. */
export const targetSchema = z.object({
  company_id: z.string(),
  name: z.string(),
  domain: z.string(),
  lifecycle: z.string(),
  owner_staff_id: z.string(),
  owner_name: z.string(),
  /** 1 the most wanted, 3 the least. */
  tier: z.number(),
  why: z.string(),
  next_step: z.string(),
  next_step_due: z.string().nullable(),
  next_step_overdue: z.boolean(),
  /** Who at the firm the plan means to reach, each with their own last touch. */
  reach: z.array(
    z.object({
      person_id: z.string(),
      full_name: z.string(),
      title: z.string(),
      role_category: z.string(),
      last_touched_at: z.string().nullable(),
    }),
  ),
  roles: z.array(z.string()),
  /** A note, a call, a meeting held, a mail sent, a deal moved — never a view of the page. */
  last_touched_at: z.string().nullable(),
  /** Days since that touch; null when nobody has touched it yet. */
  days_untouched: z.number().nullable(),
  untouched: z.boolean(),
  open_deals: z.number(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  updated_by_name: z.string(),
});
export type TargetAccount = z.infer<typeof targetSchema>;

const targetsSchema = okEnvelope.extend({
  targets: z.array(targetSchema),
  counts: z.object({
    total: z.number(),
    untouched: z.number(),
    by_tier: z.record(z.string(), z.number()),
  }),
  untouched_days: z.number(),
});
export type TargetList = z.infer<typeof targetsSchema>;

export function readTargets(
  token: string,
  query: { tier?: string; owner?: string; untouched?: string } = {},
) {
  const filtered: Record<string, string> = {};
  for (const [name, value] of Object.entries(query)) if (value) filtered[name] = value;
  return fetchHqJson("hq/targets", targetsSchema, { token, query: filtered });
}

export type TargetInput = {
  tier: number;
  why: string;
  next_step: string;
  next_step_due: string;
  reach: string[];
};

export function setTarget(token: string, companyId: string, input: TargetInput) {
  return postHqJson(
    `hq/companies/${companyId}/target`,
    okEnvelope.extend({ target: targetSchema }),
    {
      token,
      body: input,
    },
  );
}

export function removeTarget(token: string, companyId: string) {
  return postHqJson(
    `hq/companies/${companyId}/target/remove`,
    okEnvelope.extend({ removed: z.boolean() }),
    { token, body: {} },
  );
}
