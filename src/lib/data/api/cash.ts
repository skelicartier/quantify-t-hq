import "server-only";

import { z } from "zod";

import { ruleLineSchema } from "@/lib/data/api/holidays";
import { staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * The cash view (duties spec §7.6): the next 13 weeks per currency, three scenarios and the
 * thresholds to watch. Stipends come from the people ledger and are for the Owner only: the
 * portal asks with `owner` set only from `context.me.role === "owner"`, and an answer asked
 * without it has no stipends row, no stipend item and no name of the ledger in it.
 */

export const cashEventSchema = z.object({
  event_id: z.string(),
  kind: z.enum(["money_in", "monthly_cost"]),
  name: z.string(),
  period: z.string(),
  amount_minor: z.number(),
  flagged: z.boolean(),
});
export type CashEvent = z.infer<typeof cashEventSchema>;

export const cashLineSchema = z.object({
  line_id: z.string(),
  kind: z.enum(["expected_in", "other_out"]),
  on: z.string(),
  currency: z.string(),
  amount_minor: z.number(),
  name: z.string(),
  sure: z.boolean(),
  counted_at: z.number(),
  withdrawn: z.boolean(),
});
export type CashLine = z.infer<typeof cashLineSchema>;

export const cashRowKeySchema = z.enum(["bills", "stipends", "expected_in", "other_out"]);
export type CashRowKey = z.infer<typeof cashRowKeySchema>;

export const cashTableSchema = z.object({
  currency: z.string(),
  opening: z
    .object({ minor: z.number(), as_of: z.string(), source: z.enum(["statements", "typed"]) })
    .nullable(),
  rows: z.array(z.object({ key: cashRowKeySchema, by_week: z.array(z.number()) })),
  closing: z.array(z.number()),
  items: z.array(
    z.object({
      key: z.string(),
      week: z.number(),
      on: z.string(),
      name: z.string(),
      minor: z.number(),
      counted_minor: z.number(),
      href: z.string().nullable(),
    }),
  ),
});
export type CashTable = z.infer<typeof cashTableSchema>;

export const scenarioSchema = z.object({
  key: z.enum(["base", "hiring_delayed", "raise_delayed"]),
  label: z.string(),
  months: z.array(z.object({ period: z.string(), closing_minor: z.number() })),
  cash_out: z.string().nullable(),
  break_even: z.string().nullable(),
  words: z.string(),
  break_even_words: z.string(),
});
export type Scenario = z.infer<typeof scenarioSchema>;

export const tileSchema = z.object({
  key: z.enum(["gst", "pf", "esi", "caro", "books"]),
  words: z.string(),
  beside: z.string(),
  rule: ruleLineSchema.nullable(),
});
export type CashTile = z.infer<typeof tileSchema>;

export const cashPageSchema = ok.extend({
  today: z.string(),
  weeks: z.array(z.object({ n: z.number(), from: z.string(), to: z.string(), label: z.string() })),
  tables: z.array(cashTableSchema),
  stipends_left_out: z.boolean(),
  scenarios: z.array(scenarioSchema).nullable(),
  assumptions: z.object({
    burn_minor: z.number().nullable(),
    burn_source: z.enum(["statements", "typed"]).nullable(),
    collections_minor: z.number(),
    growth: z.number(),
    hire_delay_months: z.number(),
    events: z.array(cashEventSchema),
  }),
  tiles: z.array(tileSchema),
  lines: z.array(cashLineSchema),
  typed: z.object({
    opening: z.record(z.string(), z.object({ amount_minor: z.number(), as_of: z.string() })),
    burn_minor: z.number().nullable(),
    other_sales_minor: z.number(),
    caro: z.object({ amount_minor: z.number(), as_of: z.string() }).nullable(),
  }),
  here: z.object({ money: z.boolean(), statements: z.boolean(), people: z.boolean() }),
});
export type CashPage = z.infer<typeof cashPageSchema>;

/** `owner` only from `context.me.role === "owner"`: it lets the people ledger's figures in. */
export const readCash = (owner: boolean) =>
  dataAsk(cashPageSchema, "GET", owner ? "/data/cash?owner=1" : "/data/cash");

export type CashLineInput = {
  kind: string;
  on: string;
  currency: string;
  amount: string;
  name: string;
  sure: boolean;
  counted_at?: string;
};

const lineAnswer = ok.extend({ line: cashLineSchema });

export const addCashLine = (input: CashLineInput, by: Staff, attempt: string) =>
  dataAsk(lineAnswer, "POST", "/data/cash/lines", { ...input, by, attempt });

export const updateCashLine = (lineId: string, input: Partial<CashLineInput>, by: Staff) =>
  dataAsk(lineAnswer, "POST", `/data/cash/lines/${id(lineId)}/update`, { ...input, by });

export const withdrawCashLine = (lineId: string, by: Staff) =>
  dataAsk(lineAnswer, "POST", `/data/cash/lines/${id(lineId)}/withdraw`, { by });

export type CashSetupInput = {
  opening_currency?: string;
  opening_amount?: string;
  opening_as_of?: string;
  burn?: string;
  collections?: string;
  growth?: string;
  hire_delay_months?: string;
  other_sales?: string;
  caro_amount?: string;
  caro_as_of?: string;
};

export const saveCashSetup = (input: CashSetupInput, by: Staff) =>
  dataAsk(
    ok.extend({
      setup: z.object({
        burn_minor: z.number().nullable(),
        collections_minor: z.number(),
        growth: z.number(),
        hire_delay_months: z.number(),
        other_sales_minor: z.number(),
        updated_by: staffSchema.nullable(),
      }),
    }),
    "POST",
    "/data/cash/setup",
    { ...input, by },
  );

export type CashEventInput = {
  kind: string;
  name: string;
  period: string;
  amount: string;
  flagged: boolean;
};

export const addCashEvent = (input: CashEventInput, by: Staff, attempt: string) =>
  dataAsk(ok.extend({ event: cashEventSchema }), "POST", "/data/cash/events", {
    ...input,
    by,
    attempt,
  });

export const removeCashEvent = (eventId: string, by: Staff) =>
  dataAsk(
    ok.extend({ removed: z.literal(true) }),
    "POST",
    `/data/cash/events/${id(eventId)}/remove`,
    {
      by,
    },
  );
