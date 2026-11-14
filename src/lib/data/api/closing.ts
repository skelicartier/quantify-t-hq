import "server-only";

import { z } from "zod";

import { staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * The close (ws-notes/company/spec.md §9.8): one closing checklist per investor firm and
 * the round's own steps, with the Key dates each step adds, the deadlines line, the
 * guardrails and the offers this financial year. Kept on this computer; nothing is filed.
 */

const currencySchema = z.enum(["INR", "USD"]);
const doneSchema = z.object({ at: z.string(), by: staffSchema });
const valuationKind = z.enum(["registered_valuer", "fema", "both"]);

export const closingSchema = z.object({
  closing_id: z.string(),
  investor_id: z.string(),
  firm: z.string(),
  instrument: z.string(),
  class_id: z.string().nullable(),
  shares: z.number().nullable(),
  price_per_share: z.number().nullable(),
  holder: z.object({
    name: z.string(),
    kind: z.enum(["person", "company", "llp", "trust", "fund", "other"]),
    email: z.string(),
    address: z.string(),
  }),
  pooled: z
    .object({
      kind: z.enum(["syndicate", "fund", "other"]),
      backers: z.array(
        z.object({ name: z.string(), amount: z.number(), currency: currencySchema }),
      ),
      fee_note: z.string(),
    })
    .nullable(),
  documents_sent: doneSchema.extend({ on: z.string(), what: z.string() }).nullable(),
  documents_signed: doneSchema
    .extend({ on: z.string(), file_id: z.string().nullable() })
    .nullable(),
  offer_letter: doneSchema
    .extend({ on: z.string(), serial: z.string(), file_id: z.string().nullable() })
    .nullable(),
  money_received: doneSchema
    .extend({
      on: z.string(),
      amount: z.number(),
      currency: currencySchema,
      own_account: z.boolean(),
      reference: z.string(),
      firc_file_id: z.string().nullable(),
    })
    .nullable(),
  bank_kyc: doneSchema
    .extend({
      on: z.string(),
      from_receiving_bank: z.boolean(),
      file_id: z.string().nullable(),
    })
    .nullable(),
  valuation: doneSchema
    .extend({
      on: z.string(),
      by_name: z.string(),
      kind: valuationKind,
      file_id: z.string().nullable(),
      from_round: z.boolean(),
    })
    .nullable(),
  board_approval: doneSchema
    .extend({ on: z.string(), resolution_id: z.string().nullable(), words: z.string() })
    .nullable(),
  allotment: doneSchema
    .extend({
      on: z.string(),
      shares: z.number(),
      price_per_share: z.number(),
      class_id: z.string().nullable(),
    })
    .nullable(),
  register: doneSchema
    .extend({
      on: z.string(),
      entry_id: z.string().nullable(),
      folio: z.string(),
      by_hand: z.boolean(),
    })
    .nullable(),
  certificate: doneSchema
    .extend({ on: z.string(), number: z.string(), by_hand: z.boolean() })
    .nullable(),
  refund: doneSchema
    .extend({
      on: z.string(),
      amount: z.number(),
      currency: currencySchema,
      interest: z.number().nullable(),
      note: z.string(),
    })
    .nullable(),
  notes: z.string(),
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
});
export type Closing = z.infer<typeof closingSchema>;

export const roundCloseSchema = z.object({
  special_resolution: doneSchema
    .extend({ on: z.string(), resolution_id: z.string().nullable(), words: z.string() })
    .nullable(),
  separate_account: doneSchema.extend({ opened_on: z.string(), bank: z.string() }).nullable(),
  valuation: doneSchema
    .extend({
      on: z.string(),
      by_name: z.string(),
      kind: valuationKind,
      file_id: z.string().nullable(),
    })
    .nullable(),
  firms_registered: doneSchema.extend({ on: z.string() }).nullable(),
});
export type RoundClose = z.infer<typeof roundCloseSchema>;

export const keyDateLinkSchema = z.object({
  date_id: z.string(),
  rule_key: z.string(),
  origin_key: z.string(),
  title: z.string(),
  due_on: z.string(),
  state: z.enum(["coming_up", "in_progress", "done", "not_for_us", "taken_back"]),
  overdue: z.boolean(),
  evidence: z.object({
    srn: z.string(),
    challan: z.string(),
    filed_on: z.string().nullable(),
    fee_paid: z.number().nullable(),
    filed_file_id: z.string().nullable(),
    note: z.string(),
  }),
  href: z.string(),
});
export type KeyDateLink = z.infer<typeof keyDateLinkSchema>;

export const deadlineSchema = z.object({
  rule_key: z.string(),
  title: z.string(),
  on: z.string(),
  done_on: z.string().nullable(),
});
export type Deadline = z.infer<typeof deadlineSchema>;

export const guardrailSchema = z.object({
  key: z.string(),
  words: z.string(),
  extra: z.string(),
  short: z.string(),
  source_url: z.string(),
  confirm_with: z.enum(["CA", "CS", "lawyer"]),
});
export type Guardrail = z.infer<typeof guardrailSchema>;

export const registerLinkSchema = z.object({
  entry_id: z.string(),
  member_id: z.string(),
  folio: z.string(),
  shares: z.number(),
  class_name: z.string(),
  allotted_on: z.string(),
  entered_on: z.string(),
  certificate: z.object({ number: z.string(), issued_on: z.string() }).nullable(),
  reversed: z.boolean(),
  href: z.string(),
});
export type RegisterLink = z.infer<typeof registerLinkSchema>;

export const resolutionViewSchema = z.object({
  resolution_id: z.string(),
  meeting_id: z.string(),
  meeting_kind: z.enum(["board", "agm", "egm", "circular"]),
  passed_on: z.string(),
  meeting_title: z.string(),
  title: z.string(),
  kind: z.enum(["ordinary", "special", "board"]),
  href: z.string(),
});
export type ResolutionView = z.infer<typeof resolutionViewSchema>;

const residencySchema = z.enum(["resident", "non_resident", ""]);

export const closeFirmSchema = z.object({
  investor_id: z.string(),
  firm: z.string(),
  stage: z.string(),
  residency: residencySchema,
  latest: z
    .object({
      state: z.string(),
      amount: z.number(),
      currency: currencySchema,
      instrument: z.string(),
    })
    .nullable(),
  contact: z.object({ email: z.string(), name: z.string() }).nullable(),
});
export type CloseFirm = z.infer<typeof closeFirmSchema>;

const companySchema = z
  .object({
    dpiit_number: z.string(),
    firms_registered_on: z.string().nullable(),
    foreign_investment: z.enum(["yes", "no", ""]),
  })
  .nullable();

export const closingEventSchema = z.object({
  event_id: z.string(),
  closing_id: z.string(),
  verb: z.string(),
  detail: z.string(),
  by: staffSchema,
  at: z.string(),
});

export const closingPageSchema = ok.extend({
  closing: closingSchema.nullable(),
  firm: closeFirmSchema,
  guardrails: z.array(guardrailSchema),
  deadlines: z.array(deadlineSchema),
  key_dates: z.array(keyDateLinkSchema).nullable(),
  missing_dates: z.boolean(),
  refund_date_due: z.boolean(),
  register: registerLinkSchema.nullable(),
  resolutions: z.array(resolutionViewSchema).nullable(),
  classes: z.array(z.object({ class_id: z.string(), name: z.string() })).nullable(),
  can_start: z.boolean(),
  key_dates_here: z.boolean(),
  members_here: z.boolean(),
  company: companySchema,
  round: roundCloseSchema,
  events: z.array(closingEventSchema),
  today: z.string(),
});
export type ClosingPage = z.infer<typeof closingPageSchema>;

export const closingRowSchema = closingSchema.extend({
  residency: residencySchema,
  stage: z.string().nullable(),
  deadlines: z.array(deadlineSchema),
  warnings: z.number(),
  next: z.object({ title: z.string(), on: z.string() }).nullable(),
});
export type ClosingRow = z.infer<typeof closingRowSchema>;

export const offersSchema = z.object({
  fy: z.string(),
  count: z.number(),
  limit: z.number(),
  by_class: z.array(z.object({ class_name: z.string(), count: z.number() })),
  source_url: z.string(),
});
export type Offers = z.infer<typeof offersSchema>;

const roundAnswerShape = {
  round: roundCloseSchema,
  round_dates: z.object({
    mgt_14: z.string().nullable(),
    valuation_valid_until: z.string().nullable(),
  }),
  round_key_dates: z.array(keyDateLinkSchema).nullable(),
};

export const closingsPageSchema = ok.extend({
  closings: z.array(closingRowSchema),
  ...roundAnswerShape,
  offers: offersSchema,
  firms_registered_on: z.string().nullable(),
  company: companySchema,
  key_dates_here: z.boolean(),
  members_here: z.boolean(),
  meetings_here: z.boolean(),
  resolutions: z.array(resolutionViewSchema).nullable(),
  today: z.string(),
});
export type ClosingsPage = z.infer<typeof closingsPageSchema>;

const stepAnswer = ok.extend({
  closing: closingSchema,
  key_dates: z.array(keyDateLinkSchema).nullable(),
  warnings: z.array(z.string()),
});
const clearAnswer = ok.extend({
  closing: closingSchema,
  key_dates: z.array(keyDateLinkSchema).nullable(),
});
const datesAnswer = ok.extend({ key_dates: z.array(keyDateLinkSchema).nullable() });
const roundAnswer = ok.extend({
  ...roundAnswerShape,
  key_dates: z.array(keyDateLinkSchema).nullable(),
});

export const CLOSING_STEP_SLUGS = [
  "documents-sent",
  "documents-signed",
  "offer-letter",
  "money-received",
  "bank-kyc",
  "valuation",
  "board-approval",
  "allotment",
  "register",
  "certificate",
  "refund",
] as const;
export type ClosingStepSlug = (typeof CLOSING_STEP_SLUGS)[number];

export const ROUND_STEP_SLUGS = [
  "special-resolution",
  "separate-account",
  "valuation",
  "firms-registered",
] as const;
export type RoundStepSlug = (typeof ROUND_STEP_SLUGS)[number];

export type TermsInput = {
  instrument: string;
  class_id: string;
  shares: string;
  price_per_share: string;
  holder: { name: string; kind: string; email: string; address: string };
  pooled: {
    kind: string;
    backers: { name: string; amount: string; currency: string }[];
    fee_note: string;
  } | null;
  notes: string;
};

export const readClosings = () => dataAsk(closingsPageSchema, "GET", "/data/closing");

export const readClosing = (investorId: string) =>
  dataAsk(closingPageSchema, "GET", `/data/closing/${id(investorId)}`);

export const startClosing = (investorId: string, by: Staff, attempt: string) =>
  dataAsk(ok.extend({ closing: closingSchema }), "POST", `/data/closing/${id(investorId)}/start`, {
    by,
    attempt,
  });

export const saveClosingTerms = (investorId: string, input: TermsInput, by: Staff) =>
  dataAsk(ok.extend({ closing: closingSchema }), "POST", `/data/closing/${id(investorId)}/terms`, {
    ...input,
    by,
  });

/** One step's fields as the form gave them, the ticked box and any copy among them. */
export const recordClosingStep = (
  investorId: string,
  step: ClosingStepSlug,
  input: Record<string, string | boolean>,
  by: Staff,
) => dataAsk(stepAnswer, "POST", `/data/closing/${id(investorId)}/steps/${step}`, { ...input, by });

export const clearClosingStep = (investorId: string, step: ClosingStepSlug, by: Staff) =>
  dataAsk(clearAnswer, "POST", `/data/closing/${id(investorId)}/steps/${step}/clear`, { by });

export const addClosingDates = (investorId: string, by: Staff) =>
  dataAsk(datesAnswer, "POST", `/data/closing/${id(investorId)}/key-dates`, { by });

export const addRefundDate = (investorId: string, by: Staff) =>
  dataAsk(datesAnswer, "POST", `/data/closing/${id(investorId)}/refund-date`, { by });

export const recordRoundStep = (
  step: RoundStepSlug,
  input: Record<string, string | boolean>,
  by: Staff,
) => dataAsk(roundAnswer, "POST", `/data/closing/round/${step}`, { ...input, by });
