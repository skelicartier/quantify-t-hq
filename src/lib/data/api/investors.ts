import "server-only";

import { z } from "zod";

import { leadStatusSchema, sentMailSchema } from "@/lib/data/api/leads";
import { replyRowSchema, staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * Investors: the firms on the investor list he chose in Mail merge, one row each, with a
 * stage, a dated next step and the amounts he records in their own currency. When a firm
 * was written to comes from Mail merge's written log; nothing here sends anything.
 */

export const investorStageSchema = z.enum([
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
export type InvestorStageKey = z.infer<typeof investorStageSchema>;

export const amountStateSchema = z.enum(["asked", "soft", "signed", "money_in"]);
export const currencySchema = z.enum(["USD", "INR"]);

export const amountSchema = z.object({
  amount_id: z.string(),
  state: amountStateSchema,
  amount: z.number(),
  currency: currencySchema,
  instrument: z.string(),
  on: z.string(),
  by: staffSchema,
  at: z.string(),
});
export type InvestorAmount = z.infer<typeof amountSchema>;

export const personSchema = z.object({
  email: z.string(),
  name: z.string(),
  title: z.string(),
  from: z.enum(["list", "added"]),
});

export const investorSchema = z.object({
  investor_id: z.string(),
  firm_key: z.string(),
  firm: z.string(),
  domain: z.string(),
  list_ids: z.array(z.string()),
  list_values: z.record(z.string(), z.string()),
  people: z.array(personSchema),
  stage: investorStageSchema,
  stage_since: z.string(),
  next_step: z.string(),
  next_step_on: z.string().nullable(),
  set_aside_until: z.string().nullable(),
  passed_reason: z.string(),
  owner: z.string(),
  amounts: z.array(amountSchema),
  touched: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Investor = z.infer<typeof investorSchema>;

export const investorRowSchema = z.object({
  investor_id: z.string(),
  firm: z.string(),
  domain: z.string(),
  free_mail: z.boolean(),
  contact: z.object({ email: z.string(), name: z.string(), title: z.string() }).nullable(),
  people: z.number(),
  stage: investorStageSchema,
  stage_since: z.string(),
  last_written_at: z.string().nullable(),
  last_mailing: z.string(),
  next_step: z.string(),
  next_step_on: z.string().nullable(),
  set_aside_until: z.string().nullable(),
  amount: z
    .object({
      state: amountStateSchema,
      amount: z.number(),
      currency: currencySchema,
      instrument: z.string(),
    })
    .nullable(),
  on_list: z.boolean(),
  replied: z.boolean(),
});
export type InvestorRow = z.infer<typeof investorRowSchema>;

export const investorEventSchema = z.object({
  event_id: z.string(),
  investor_id: z.string(),
  kind: z.string(),
  from: z.string(),
  to: z.string(),
  title: z.string(),
  detail: z.string(),
  by: staffSchema,
  at: z.string(),
});
export type InvestorEvent = z.infer<typeof investorEventSchema>;

export const chosenSchema = z.object({
  list_ids: z.array(z.string()),
  lists: z.array(z.object({ id: z.string(), name: z.string(), here: z.boolean() })),
  set_at: z.string().nullable(),
  set_by: staffSchema.nullable(),
});

export const investorSetupSchema = ok.extend({
  lists: z.array(
    z.object({ id: z.string(), name: z.string(), rows: z.number(), created_at: z.string() }),
  ),
  chosen: chosenSchema,
  firms: z.number(),
});
export type InvestorSetup = z.infer<typeof investorSetupSchema>;

/** Per currency: soft, and signed with money in. Never one figure across currencies. */
export const moneySchema = z.record(
  z.string(),
  z.object({ soft: z.number(), signed_and_in: z.number() }),
);
export type InvestorMoney = z.infer<typeof moneySchema>;

export const investorsPageSchema = ok.extend({
  investors: z.array(investorRowSchema),
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  counts: z.record(z.string(), z.number()),
  money: moneySchema,
  readouts: z.object({
    firms: z.number(),
    written: z.number(),
    replied: z.number(),
    meetings: z.number(),
    soft_firms: z.number(),
    signed_firms: z.number(),
  }),
  chosen: chosenSchema,
  today: z.string(),
});
export type InvestorsPage = z.infer<typeof investorsPageSchema>;

export const investorSentSchema = z.intersection(
  sentMailSchema,
  z.object({ email: z.string(), name: z.string() }),
);
export type InvestorSent = z.infer<typeof investorSentSchema>;

export const investorPersonSchema = personSchema.extend({
  lead_id: z.string().nullable(),
  status: leadStatusSchema.nullable(),
  times_written: z.number(),
  last_written_at: z.string().nullable(),
});
export type InvestorPerson = z.infer<typeof investorPersonSchema>;

export const investorDetailSchema = ok.extend({
  investor: investorSchema.extend({
    free_mail: z.boolean(),
    last_written_at: z.string().nullable(),
    last_mailing: z.string(),
    lists: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
  events: z.array(investorEventSchema),
  sent: z.array(investorSentSchema),
  replies: z.array(replyRowSchema),
  people: z.array(investorPersonSchema),
  waitlist: z.object({ entry_id: z.string(), firm: z.string(), stage: z.string() }).nullable(),
  waitlist_here: z.boolean(),
  today: z.string(),
});
export type InvestorDetail = z.infer<typeof investorDetailSchema>;

const investorAnswer = ok.extend({ investor: investorSchema });

export const readInvestorSetup = () => dataAsk(investorSetupSchema, "GET", "/data/investors/setup");

export const chooseInvestorLists = (listIds: string[], by: Staff) =>
  dataAsk(
    ok.extend({ firms: z.number(), added: z.number(), kept: z.number(), chosen: chosenSchema }),
    "POST",
    "/data/investors/setup",
    { list_ids: listIds, by },
  );

export function readInvestors(query: { stage?: string; q?: string; offset?: number } = {}) {
  const params = new URLSearchParams();
  if (query.stage) params.set("stage", query.stage);
  if (query.q) params.set("q", query.q);
  if (query.offset) params.set("offset", String(query.offset));
  const rendered = params.toString();
  return dataAsk(investorsPageSchema, "GET", `/data/investors${rendered ? `?${rendered}` : ""}`);
}

export const readInvestor = (investorId: string) =>
  dataAsk(investorDetailSchema, "GET", `/data/investors/${id(investorId)}`);

export type MoveInvestorInput = {
  stage: InvestorStageKey;
  next_step: string;
  next_step_on: string;
  set_aside_until?: string;
  passed_reason?: string;
};

export const moveInvestor = (investorId: string, input: MoveInvestorInput, by: Staff) =>
  dataAsk(investorAnswer, "POST", `/data/investors/${id(investorId)}/stage`, { ...input, by });

export const INVESTOR_FIELDS = ["firm", "owner", "next_step", "next_step_on"] as const;
export type InvestorField = (typeof INVESTOR_FIELDS)[number];

export const updateInvestor = (
  investorId: string,
  field: InvestorField,
  value: string,
  by: Staff,
) =>
  dataAsk(investorAnswer, "POST", `/data/investors/${id(investorId)}/update`, {
    field,
    value,
    by,
  });

export const addInvestorNote = (investorId: string, text: string, by: Staff, attempt: string) =>
  dataAsk(
    investorAnswer.extend({ event: investorEventSchema }),
    "POST",
    `/data/investors/${id(investorId)}/notes`,
    { text, by, attempt },
  );

export type RecordAmountInput = {
  state: z.infer<typeof amountStateSchema>;
  amount: string;
  currency: z.infer<typeof currencySchema>;
  instrument: string;
  on: string;
};

export const recordInvestorAmount = (
  investorId: string,
  input: RecordAmountInput,
  by: Staff,
  attempt: string,
) =>
  dataAsk(
    investorAnswer.extend({ amount: amountSchema }),
    "POST",
    `/data/investors/${id(investorId)}/amounts`,
    { ...input, by, attempt },
  );
