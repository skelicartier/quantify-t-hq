import "server-only";

import { z } from "zod";

import { staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * The month's close and the MIS as the portal reads and writes them (ws-notes/duties/spec.md
 * §9.7, §9.8). The stipend row's figures and the MIS's people part come back only when the
 * Owner flag is sent, which the caller sets from the role and from nothing else. Money is
 * whole minor units.
 */

const ITEM_KEYS = [
  "statements",
  "sales_invoices",
  "bills",
  "stipend_sheet",
  "tds_challans",
  "gst_returns",
  "firas",
] as const;
export const closeItemKeySchema = z.enum(ITEM_KEYS);

export const ruleLineSchema = z.object({
  key: z.string(),
  title: z.string(),
  confirm_with: z.enum(["CA", "CS", "lawyer", "agent", "bank"]).nullable(),
  confirmed_by: z.string().nullable(),
  confirmed_on: z.string().nullable(),
  usable: z.boolean(),
  starts_on: z.string().nullable(),
  readings: z.array(z.string()),
});

const itemSchema = z.object({
  state: z.enum(["open", "ready", "none_this_month", "not_registered"]),
  note: z.string(),
  file_ids: z.array(z.string()),
  set_at: z.string().nullable(),
  set_by: staffSchema.nullable(),
});

export const closeSchema = z.object({
  period: z.string(),
  items: z.object({
    statements: itemSchema,
    sales_invoices: itemSchema,
    bills: itemSchema,
    stipend_sheet: itemSchema,
    tds_challans: itemSchema,
    gst_returns: itemSchema,
    firas: itemSchema,
  }),
  commentary: z.string(),
  sent: z
    .object({
      on: z.string(),
      to_name: z.string(),
      contact_id: z.string().nullable(),
      how: z.string(),
    })
    .nullable(),
  acknowledged: z.object({ on: z.string(), by_name: z.string(), note: z.string() }).nullable(),
  locked: z.object({ at: z.string(), by: staffSchema }).nullable(),
  history: z.array(
    z.object({
      verb: z.enum(["sent", "acknowledged", "locked", "reopened"]),
      at: z.string(),
      by: staffSchema,
      why: z.string(),
    }),
  ),
});
export type CloseRecord = z.infer<typeof closeSchema>;

const stateSchema = z.enum(["open", "sent", "locked"]);

export const closeMonthsSchema = ok.extend({
  today: z.string(),
  months: z.array(
    z.object({
      period: z.string(),
      label: z.string(),
      over: z.boolean(),
      due_on: z.string().nullable(),
      state: stateSchema,
      ready: z.number(),
      sent_on: z.string().nullable(),
      locked_at: z.string().nullable(),
    }),
  ),
  fallback_days: z.boolean(),
  fallback_words: z.string(),
  rule: ruleLineSchema.nullable(),
  rules_here: z.boolean(),
});
export type CloseMonths = z.infer<typeof closeMonthsSchema>;

export const closePageSchema = ok.extend({
  close: closeSchema,
  label: z.string(),
  over: z.boolean(),
  state: stateSchema,
  ready: z.number(),
  facts: z.record(closeItemKeySchema, z.array(z.string())),
  files: z.record(z.string(), z.string()),
  due_on: z.string().nullable(),
  due_words: z.string().nullable(),
  fallback_days: z.boolean(),
  rule: ruleLineSchema.nullable(),
  rules_here: z.boolean(),
  can_lock: z.boolean(),
  cannot_lock_because: z.array(z.string()),
  pack: z.object({ files: z.number(), owner_parts: z.boolean() }),
  here: z.object({
    money: z.boolean(),
    statements: z.boolean(),
    people: z.boolean(),
    holidays: z.boolean(),
  }),
});
export type ClosePage = z.infer<typeof closePageSchema>;

const countsSchema = z.array(z.object({ kind: z.string(), count: z.number() }));

export const misSchema = z.object({
  period: z.string(),
  label: z.string(),
  n: z.number(),
  frozen_at: z.string().nullable(),
  frozen_by: staffSchema.nullable(),
  revenue: z.object({
    collected: z.record(z.string(), z.number()),
    export_invoices: z.object({ count: z.number(), by_currency: z.record(z.string(), z.number()) }),
  }),
  expenses: z.array(
    z.object({
      currency: z.string(),
      heads: z.array(
        z.object({
          name: z.string(),
          ledger: z.string(),
          minor: z.number().nullable(),
          people: z.boolean(),
        }),
      ),
      unsorted_minor: z.number(),
      total_minor: z.number(),
    }),
  ),
  burn: z.array(
    z.object({
      currency: z.string(),
      as_of: z.string(),
      cash_minor: z.number(),
      gross_minor: z.number(),
      collected_minor: z.number(),
      net_minor: z.number(),
      avg_net_minor: z.number().nullable(),
      months: z.number(),
      runway_months: z.number().nullable(),
      zero_on: z.string().nullable(),
    }),
  ),
  cash_flow: z.array(
    z.object({
      currency: z.string(),
      opening_minor: z.number(),
      in: z.object({ customers: z.number(), funding: z.number(), other: z.number() }),
      out_minor: z.number(),
      between_minor: z.number().default(0),
      closing_minor: z.number(),
    }),
  ),
  numbers: z
    .object({
      yeses: z.number(),
      firms_joined: z.number(),
      named_buyers: z.number(),
      calls_booked: z.number(),
      calls_held: z.number(),
      pilots_signed: z.number(),
    })
    .nullable(),
  against_last: z.array(
    z.object({
      currency: z.string(),
      heads: z.array(
        z.object({ name: z.string(), change_minor: z.number().nullable(), words: z.string() }),
      ),
    }),
  ),
  people: z.object({
    headcount: z
      .object({ employees: z.number(), interns: z.number(), contractors: z.number() })
      .nullable(),
  }),
  compliance: z.object({
    overdue: countsSchema,
    due_in_30: countsSchema,
    rules_unconfirmed: z.number().nullable(),
  }),
  commentary: z.string(),
});
export type MisSnapshot = z.infer<typeof misSchema>;

const ownerPartSchema = z.object({
  stipends: z.record(z.string(), z.number()),
  payments: z.number(),
  people_heads: z.array(z.object({ currency: z.string(), name: z.string(), minor: z.number() })),
});
export type MisOwnerPart = z.infer<typeof ownerPartSchema>;

export const misPageSchema = ok.extend({
  mis: misSchema,
  frozen: z.boolean(),
  locked: z.boolean(),
  snapshots: z.number(),
  owner_part: ownerPartSchema.nullable().optional(),
});
export type MisPage = z.infer<typeof misPageSchema>;

export const misMonthsSchema = ok.extend({
  months: z.array(
    z.object({
      period: z.string(),
      label: z.string(),
      state: z.enum(["frozen", "live"]),
      current: z.boolean(),
      frozen_at: z.string().nullable(),
      frozen_by: staffSchema.nullable(),
      burn: z.array(
        z.object({
          currency: z.string(),
          net_minor: z.number(),
          runway_months: z.number().nullable(),
        }),
      ),
    }),
  ),
});
export type MisMonths = z.infer<typeof misMonthsSchema>;

const written = ok.extend({ close: closeSchema, state: stateSchema, ready: z.number() });
const flag = (owner: boolean) => (owner ? "?owner=1" : "");

export const readCloseMonths = () => dataAsk(closeMonthsSchema, "GET", "/data/close");

export const readClose = (period: string, owner: boolean) =>
  dataAsk(closePageSchema, "GET", `/data/close/${id(period)}${flag(owner)}`);

export const readMis = (period: string, owner: boolean) =>
  dataAsk(misPageSchema, "GET", `/data/close/${id(period)}/mis${flag(owner)}`);

export const readMisMonths = () => dataAsk(misMonthsSchema, "GET", "/data/mis");

export const setCloseItem = (
  period: string,
  key: string,
  input: {
    state?: string;
    note?: string;
    attach?: string;
    detach?: string;
    content?: string;
    name?: string;
  },
  by: Staff,
) =>
  dataAsk(written, "POST", `/data/close/${id(period)}/items/${encodeURIComponent(key)}`, {
    ...input,
    by,
  });

export const saveCommentary = (period: string, commentary: string, by: Staff) =>
  dataAsk(written, "POST", `/data/close/${id(period)}/commentary`, { commentary, by });

export const recordSent = (
  period: string,
  input: { on: string; to_name: string; how: string },
  by: Staff,
) => dataAsk(written, "POST", `/data/close/${id(period)}/sent`, { ...input, by });

export const recordAcknowledged = (
  period: string,
  input: { on: string; by_name: string; note: string },
  by: Staff,
) => dataAsk(written, "POST", `/data/close/${id(period)}/acknowledged`, { ...input, by });

export const lockMonth = (period: string, by: Staff) =>
  dataAsk(written, "POST", `/data/close/${id(period)}/lock`, { by });

export const reopenMonth = (period: string, why: string, by: Staff) =>
  dataAsk(written, "POST", `/data/close/${id(period)}/reopen`, { why, by });
