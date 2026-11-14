import "server-only";

import { z } from "zod";

import { staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * Numbers and the monthly update, as the portal reads and writes them: the counts per
 * week and per month, the cash and burn he types, the buyer firm types, one update per
 * month, its recipients and the hand-over to Mail merge. Every figure is the service's
 * count of records; nothing here works one out.
 */

const currencySchema = z.enum(["USD", "INR"]);
const rowKeys = [
  "yeses",
  "firms_joined",
  "named_buyers",
  "calls_booked",
  "calls_held",
  "pilots_started",
  "first_investor_meetings",
] as const;
export const numbersRowSchema = z.enum(rowKeys);

const periodSchema = z.object({
  key: z.string(),
  label: z.string(),
  from: z.string(),
  to: z.string(),
  partial: z.boolean(),
});
export type NumbersPeriod = z.infer<typeof periodSchema>;

const rowCountsSchema = z.partialRecord(numbersRowSchema, z.array(z.number()));
export type NumbersRowCounts = z.infer<typeof rowCountsSchema>;

export const moneyEntrySchema = z.object({
  entry_id: z.string(),
  currency: currencySchema,
  as_of: z.string(),
  cash: z.number(),
  burn_per_month: z.number(),
  note: z.string(),
  recorded_at: z.string(),
  recorded_by: staffSchema,
});
export type MoneyEntry = z.infer<typeof moneyEntrySchema>;

const amountSchema = z.object({ amount: z.number(), firms: z.number() });
const moneyByStateSchema = z.record(
  z.string(),
  z.object({
    asked: amountSchema.optional(),
    soft: amountSchema.optional(),
    signed: amountSchema.optional(),
    money_in: amountSchema.optional(),
  }),
);

export const updateStatusSchema = z.enum(["draft", "frozen", "handed_over"]);

export const numbersPageSchema = ok.extend({
  today: z.string(),
  weeks: z.array(periodSchema),
  months: z.array(periodSchema),
  weekly: rowCountsSchema,
  monthly: rowCountsSchema,
  named_of: z.object({ weekly: z.array(z.number()), monthly: z.array(z.number()) }),
  pilots: z.object({ signed: z.number(), calls_held_no_pilot: z.number() }),
  raise: z
    .object({
      firms: z.number(),
      written: z.number(),
      replied: z.number(),
      meeting: z.number(),
      met: z.number(),
      soft: z.number(),
      signed: z.number(),
      money_in: z.number(),
      days_since_first_send: z.number().nullable(),
      money: moneyByStateSchema,
    })
    .nullable(),
  money: z.object({
    rows: z.array(
      z.object({
        currency: currencySchema,
        entry: moneyEntrySchema,
        age_days: z.number(),
        used: z.boolean(),
        runway_months: z.number().nullable(),
      }),
    ),
    entries: z.array(moneyEntrySchema),
    stale_days: z.number(),
  }),
  buyer_types: z.array(z.string()),
  firm_types: z.array(z.string()),
  update_date_id: z.string().nullable(),
  updates: z.array(
    z.object({
      period: z.string(),
      label: z.string(),
      status: updateStatusSchema,
      people: z.number().nullable(),
      updated_at: z.string(),
    }),
  ),
});
export type NumbersPage = z.infer<typeof numbersPageSchema>;

export const updateNumbersSchema = z.object({
  period: z.string(),
  label: z.string(),
  yeses: z.number(),
  firms_joined: z.number(),
  named_buyers: z.number(),
  calls_booked: z.number(),
  calls_held: z.number(),
  pilots_signed: z.number(),
  calls_held_no_pilot: z.number(),
  raise: z
    .object({
      soft: z.number(),
      signed: z.number(),
      money_in: z.number(),
      money_in_amounts: z.record(z.string(), z.number()),
    })
    .nullable(),
  cash: z.array(
    z.object({
      currency: currencySchema,
      cash: z.number(),
      burn_per_month: z.number(),
      as_of: z.string(),
      runway_months: z.number(),
    }),
  ),
  counted_on: z.string(),
});
export type UpdateNumbers = z.infer<typeof updateNumbersSchema>;

export const updateSchema = z.object({
  update_id: z.string(),
  period: z.string(),
  title: z.string(),
  opening: z.string(),
  asks: z.string(),
  highlights: z.string(),
  lowlights: z.string(),
  thanks: z.string(),
  sign_off: z.string(),
  snapshot: updateNumbersSchema.nullable(),
  snapshot_at: z.string().nullable(),
  status: updateStatusSchema,
  handed_over: z
    .object({
      at: z.string(),
      by: staffSchema,
      list_id: z.string(),
      list_name: z.string(),
      people: z.number(),
      left_out: z.array(z.object({ email: z.string(), why: z.string() })),
    })
    .nullable(),
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
});
export type InvestorUpdate = z.infer<typeof updateSchema>;

const updateAnswer = ok.extend({
  update: updateSchema,
  numbers: updateNumbersSchema,
  text: z.string(),
});
export const updatePageSchema = updateAnswer.extend({ today: z.string() });
export type UpdatePage = z.infer<typeof updatePageSchema>;

const investorStageSchema = z.enum([
  "not_written",
  "written",
  "replied",
  "meeting",
  "met",
  "diligence",
  "soft",
  "signed",
  "money_in",
  "set_aside",
  "passed",
  "do_not_pitch",
]);
export type RecipientStage = z.infer<typeof investorStageSchema>;

export const recipientsSchema = ok.extend({
  stages: z.array(investorStageSchema),
  firms: z.array(
    z.object({
      investor_id: z.string(),
      firm: z.string(),
      stage: investorStageSchema,
      people: z.array(
        z.object({
          email: z.string(),
          name: z.string(),
          replied: z.boolean(),
          stopped: z.boolean(),
        }),
      ),
    }),
  ),
  people: z.number(),
  left_out: z.array(z.object({ email: z.string(), why: z.string() })),
  here: z.boolean(),
});
export type UpdateRecipients = z.infer<typeof recipientsSchema>;

const leftOutSchema = z.array(z.object({ email: z.string(), why: z.string() }));

export const readNumbers = () => dataAsk(numbersPageSchema, "GET", "/data/numbers");

export const saveMoney = (
  input: { currency: string; cash: string; burn_per_month: string; as_of: string; note: string },
  by: Staff,
  attempt: string,
) =>
  dataAsk(
    ok.extend({ entry: moneyEntrySchema, runway_months: z.number().nullable() }),
    "POST",
    "/data/numbers/money",
    { ...input, by, attempt },
  );

export const saveNumbersSetup = (
  input: { buyer_types?: string[]; update_date_id?: string },
  by: Staff,
) =>
  dataAsk(
    ok.extend({
      setup: z.object({
        buyer_types: z.array(z.string()),
        update_date_id: z.string().nullable(),
        updated_at: z.string().nullable(),
        updated_by: staffSchema.nullable(),
      }),
    }),
    "POST",
    "/data/numbers/setup",
    { ...input, by },
  );

export const readUpdate = (period: string) =>
  dataAsk(updatePageSchema, "GET", `/data/numbers/updates/${id(period)}`);

export type UpdateParts = {
  opening: string;
  asks: string;
  highlights: string;
  lowlights: string;
  thanks: string;
  sign_off: string;
};

export const saveUpdate = (period: string, input: UpdateParts, by: Staff) =>
  dataAsk(updateAnswer, "POST", `/data/numbers/updates/${id(period)}`, { ...input, by });

export const freezeUpdate = (period: string, by: Staff) =>
  dataAsk(updateAnswer, "POST", `/data/numbers/updates/${id(period)}/freeze`, { by });

export const unfreezeUpdate = (period: string, by: Staff) =>
  dataAsk(updateAnswer, "POST", `/data/numbers/updates/${id(period)}/unfreeze`, { by });

export const readRecipients = (period: string, stages: readonly string[]) =>
  dataAsk(
    recipientsSchema,
    "GET",
    `/data/numbers/updates/${id(period)}/recipients?stages=${encodeURIComponent(stages.join(","))}`,
  );

export const handOver = (
  period: string,
  input: { stages: string[]; exclude: string[] },
  by: Staff,
  attempt: string,
) =>
  dataAsk(
    ok.extend({
      list: z.object({ id: z.string(), name: z.string(), people: z.number() }),
      left_out: leftOutSchema,
      update: updateSchema,
    }),
    "POST",
    `/data/numbers/updates/${id(period)}/hand-over`,
    { ...input, by, attempt },
  );
