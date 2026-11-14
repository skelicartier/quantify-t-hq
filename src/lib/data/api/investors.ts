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
 *
 * The raise batch (raise spec §5.8) adds each firm's qualification, introduction, wave,
 * offer deadline and deck link, the funnel (plain counts of firms, money per currency) and
 * the one round's terms, which have no target field.
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

export const stageFocusSchema = z.enum(["pre_seed", "seed", "series_a", "later"]);
export const geographySchema = z.enum(["india", "us", "uk_europe", "asia", "global"]);
export const introStatusSchema = z.enum(["none", "to_ask", "asked", "made", "declined"]);
export type IntroStatusKey = z.infer<typeof introStatusSchema>;

export const profileSchema = z.object({
  cheque: z
    .object({ min: z.number().nullable(), max: z.number().nullable(), currency: currencySchema })
    .nullable(),
  stages: z.array(stageFocusSchema),
  sectors: z.array(z.string()),
  geography: z.array(geographySchema),
  lead: z.enum(["lead", "follow", "either", ""]),
  conflict: z.string(),
  residency: z.enum(["resident", "non_resident", ""]),
  india_ok: z.enum(["yes", "no", ""]),
});
export type InvestorProfile = z.infer<typeof profileSchema>;

export const introSchema = z.object({
  status: introStatusSchema,
  introducer: z.string(),
  contact_id: z.string().nullable(),
  on: z.string().nullable(),
});
export type InvestorIntro = z.infer<typeof introSchema>;

export const lastTouchSchema = z
  .object({ kind: z.enum(["written", "replied", "met"]), at: z.string() })
  .nullable();
export type LastTouch = z.infer<typeof lastTouchSchema>;

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
  profile: profileSchema,
  intro: introSchema,
  wave: z.string(),
  offer_deadline: z.string().nullable(),
  deck_link: z.string(),
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
  wave: z.string(),
  warm: z.boolean(),
  last_touch: lastTouchSchema,
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
  /** Every wave label in use, then "" for the firms with none. */
  waves: z.array(z.object({ label: z.string(), firms: z.number() })),
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
    last_replied_at: z.string().nullable(),
    last_met_at: z.string().nullable(),
    lists: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
  events: z.array(investorEventSchema),
  sent: z.array(investorSentSchema),
  replies: z.array(replyRowSchema),
  people: z.array(investorPersonSchema),
  waitlist: z.object({ entry_id: z.string(), firm: z.string(), stage: z.string() }).nullable(),
  waitlist_here: z.boolean(),
  /** The introducers from Contacts; null where Contacts is not here. */
  introducers: z
    .array(z.object({ contact_id: z.string(), name: z.string(), firm: z.string() }))
    .nullable(),
  /** What was shared with the firm from a data-room pack; null where packs are not here. */
  data_room: z
    .array(
      z.object({
        pack_id: z.string(),
        name: z.string(),
        version: z.number(),
        shared_on: z.string(),
        how: z.string(),
        files: z.number(),
      }),
    )
    .nullable(),
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

export type InvestorFilters = {
  stage?: string;
  q?: string;
  /** A wave's label, or "-" for the firms with none. */
  wave?: string;
  intro?: "warm" | "cold" | "";
};

export function readInvestors(query: InvestorFilters & { offset?: number } = {}) {
  const params = new URLSearchParams();
  if (query.stage) params.set("stage", query.stage);
  if (query.q) params.set("q", query.q);
  if (query.wave) params.set("wave", query.wave);
  if (query.intro) params.set("intro", query.intro);
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

export const INVESTOR_FIELDS = [
  "firm",
  "owner",
  "next_step",
  "next_step_on",
  "wave",
  "offer_deadline",
  "deck_link",
] as const;
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

// ------------------------------------------------------------------ the raise (spec §5)

export type QualifyInput = {
  cheque_min: string;
  cheque_max: string;
  cheque_currency: string;
  stages: string[];
  sectors: string;
  geography: string[];
  lead: string;
  conflict: string;
  residency: string;
  india_ok: string;
};

export const qualifyInvestor = (investorId: string, input: QualifyInput, by: Staff) =>
  dataAsk(investorAnswer, "POST", `/data/investors/${id(investorId)}/profile`, { ...input, by });

export type IntroInput = { status: string; introducer: string; contact_id: string; on: string };

export const introduceInvestor = (investorId: string, input: IntroInput, by: Staff) =>
  dataAsk(investorAnswer, "POST", `/data/investors/${id(investorId)}/intro`, { ...input, by });

/** The wave for every firm the Firms view shows for these filters (every page). */
export const setWave = (filters: InvestorFilters, wave: string, by: Staff) =>
  dataAsk(ok.extend({ changed: z.number() }), "POST", "/data/investors/wave", {
    stage: filters.stage ?? "",
    q: filters.q ?? "",
    wave_filter: filters.wave ?? "",
    intro: filters.intro ?? "",
    wave,
    by,
  });

const forwardStageSchema = z.enum([
  "written",
  "replied",
  "meeting",
  "met",
  "diligence",
  "soft",
  "signed",
  "money_in",
]);

const funnelSplitSchema = z.object({
  key: z.string(),
  label: z.string(),
  firms: z.number(),
  written: z.number(),
  replied: z.number(),
  meeting: z.number(),
  met: z.number(),
  soft_or_later: z.number(),
});
export type FunnelSplit = z.infer<typeof funnelSplitSchema>;

/** The funnel as the service counts it: firms, never a share of anything. */
export const funnelSchema = z.object({
  today: z.string(),
  week_from: z.string(),
  firms: z.number(),
  not_written: z.number(),
  first_send_on: z.string().nullable(),
  days_since_first_send: z.number().nullable(),
  first_meetings_this_week: z.number(),
  first_meeting_days: z.array(z.string()),
  stages: z.array(
    z.object({ stage: forwardStageSchema, now: z.number(), reached: z.number(), of: z.number() }),
  ),
  exits: z.array(
    z.object({ stage: z.enum(["set_aside", "passed", "do_not_pitch"]), now: z.number() }),
  ),
  /** Currency → state → the sum of each firm's newest amount there, and how many firms. */
  money: z.record(
    z.string(),
    z.record(z.string(), z.object({ amount: z.number(), firms: z.number() })),
  ),
  passed: z.number(),
  pass_reasons: z.array(z.object({ reason: z.string(), firms: z.number() })),
  stale_days: z.number(),
  time_in_stage: z.array(
    z.object({
      stage: forwardStageSchema,
      firms: z.number(),
      stale: z.number(),
      longest_days: z.number(),
    }),
  ),
  stale: z.array(
    z.object({
      investor_id: z.string(),
      firm: z.string(),
      stage: forwardStageSchema,
      days: z.number(),
      next_step: z.string(),
      next_step_on: z.string().nullable(),
    }),
  ),
  by_wave: z.array(funnelSplitSchema),
  by_intro: z.array(funnelSplitSchema),
});
export type Funnel = z.infer<typeof funnelSchema>;

export const readFunnel = () =>
  dataAsk(ok.extend({ funnel: funnelSchema }), "GET", "/data/raise/funnel");

export const roundSchema = z.object({
  round_id: z.string(),
  name: z.string(),
  instrument: z.string(),
  cap: z
    .object({
      amount: z.number(),
      currency: currencySchema,
      basis: z.enum(["post_money", "pre_money"]),
    })
    .nullable(),
  discount_percent: z.number().nullable(),
  mfn: z.boolean(),
  minimum_cheque: z.object({ amount: z.number(), currency: currencySchema }).nullable(),
  opened_on: z.string().nullable(),
  lead: z.enum(["yes", "no"]),
  lead_investor_id: z.string().nullable(),
  notes: z.string(),
  updated_at: z.string(),
  updated_by: staffSchema,
});
export type Round = z.infer<typeof roundSchema>;

export const roundPageSchema = ok.extend({
  round: roundSchema.nullable(),
  /** The lead picker: Soft commit and later first, then by name. */
  firms: z.array(
    z.object({ investor_id: z.string(), firm: z.string(), stage: investorStageSchema }),
  ),
  history: z.array(z.object({ at: z.string(), by: staffSchema, changed: z.array(z.string()) })),
});
export type RoundPage = z.infer<typeof roundPageSchema>;

export const readRound = () => dataAsk(roundPageSchema, "GET", "/data/raise/round");

export type RoundInput = {
  name: string;
  instrument: string;
  cap_amount: string;
  cap_currency: string;
  cap_basis: string;
  discount: string;
  mfn: boolean;
  minimum_amount: string;
  minimum_currency: string;
  opened_on: string;
  lead: string;
  lead_investor_id: string;
  notes: string;
};

export const saveRound = (input: RoundInput, by: Staff) =>
  dataAsk(ok.extend({ round: roundSchema }), "POST", "/data/raise/round", { ...input, by });
