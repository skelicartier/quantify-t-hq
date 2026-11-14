import "server-only";

import { z } from "zod";

import { staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * Pilots with waitlist firms (ws-notes/company/spec.md §9.8): the criteria written before
 * it starts, the three owners at the firm, the term and price, what it converts to, the
 * go/no-go and a check-in every week. Kept on this computer by the local service.
 */

const currencySchema = z.enum(["INR", "USD"]);

export const criterionSchema = z.object({
  criterion_id: z.string(),
  what: z.string(),
  target: z.string(),
  result: z.string(),
  met: z.enum(["yes", "no", ""]),
});
export type Criterion = z.infer<typeof criterionSchema>;

export const pilotSchema = z.object({
  pilot_id: z.string(),
  entry_id: z.string(),
  firm: z.string(),
  state: z.enum(["planned", "running", "decided"]),
  starts_on: z.string(),
  ends_on: z.string(),
  criteria: z.array(criterionSchema),
  owners: z.object({ sponsor: z.string(), technical: z.string(), user: z.string() }),
  price: z.object({ amount: z.number(), currency: currencySchema, note: z.string() }).nullable(),
  conversion: z
    .object({
      on: z.string().nullable(),
      amount: z.number().nullable(),
      currency: currencySchema,
      per: z.enum(["month", "year"]),
    })
    .nullable(),
  go_no_go_on: z.string().nullable(),
  decision: z
    .object({
      outcome: z.enum(["go", "no_go", "extend"]),
      on: z.string(),
      note: z.string(),
      by: staffSchema,
    })
    .nullable(),
  check_ins: z.array(
    z.object({
      check_in_id: z.string(),
      on: z.string(),
      note: z.string(),
      at: z.string(),
      by: staffSchema,
    }),
  ),
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
});
export type Pilot = z.infer<typeof pilotSchema>;

export const pilotRowSchema = pilotSchema.extend({
  criteria_met: z.string(),
  owners_missing: z.array(z.enum(["sponsor", "technical", "user"])),
  next_check_in: z.string().nullable(),
  last_check_in: z.string().nullable(),
  entry_stage: z.string().nullable(),
});
export type PilotRow = z.infer<typeof pilotRowSchema>;

export const pilotsPageSchema = ok.extend({
  pilots: z.array(pilotRowSchema),
  counts: z.object({
    running: z.number(),
    planned: z.number(),
    decided: z.number(),
    all: z.number(),
  }),
  running_line: z.string(),
  today: z.string(),
});
export type PilotsPage = z.infer<typeof pilotsPageSchema>;

export const agreementViewSchema = z.object({
  agreement_id: z.string(),
  title: z.string(),
  type: z.string(),
  status: z.enum(["draft", "out_for_signature", "signed", "expired", "terminated"]),
  signed_on: z.string().nullable(),
  ends_on: z.string().nullable(),
  href: z.string(),
});
export type AgreementView = z.infer<typeof agreementViewSchema>;

export const pilotEventSchema = z.object({
  event_id: z.string(),
  pilot_id: z.string(),
  verb: z.string(),
  detail: z.string(),
  by: staffSchema,
  at: z.string(),
});
export type PilotEvent = z.infer<typeof pilotEventSchema>;

export const pilotPageSchema = ok.extend({
  pilot: pilotRowSchema,
  entry: z.object({ entry_id: z.string(), firm: z.string(), stage: z.string() }).nullable(),
  agreements: z.array(agreementViewSchema).nullable(),
  warnings: z.array(z.string()),
  next_check_in: z.string().nullable(),
  running_line: z.string(),
  events: z.array(pilotEventSchema),
  today: z.string(),
});
export type PilotPage = z.infer<typeof pilotPageSchema>;

export const entryPilotsSchema = ok.extend({
  pilots: z.array(pilotRowSchema),
  running_line: z.string(),
  today: z.string(),
});
export type EntryPilots = z.infer<typeof entryPilotsSchema>;

const pilotAnswer = ok.extend({ pilot: pilotSchema });
const plannedAnswer = pilotAnswer.extend({
  warnings: z.array(z.string()),
  running: z.number(),
  running_line: z.string(),
});
const updatedAnswer = pilotAnswer.extend({ warnings: z.array(z.string()) });
const checkInAnswer = pilotAnswer.extend({ next_check_in: z.string().nullable() });

export type PilotInput = {
  starts_on: string;
  ends_on: string;
  criteria: { what: string; target: string }[];
  owners: { sponsor: string; technical: string; user: string };
  free: boolean;
  price: { amount: string; currency: string; note: string } | null;
  conversion: { on: string; amount: string; currency: string; per: string } | null;
  go_no_go_on: string;
};

export const readPilots = (state = "") =>
  dataAsk(
    pilotsPageSchema,
    "GET",
    `/data/pilots${state ? `?state=${encodeURIComponent(state)}` : ""}`,
  );

export const readPilot = (pilotId: string) =>
  dataAsk(pilotPageSchema, "GET", `/data/pilots/${id(pilotId)}`);

export const readEntryPilots = (entryId: string) =>
  dataAsk(entryPilotsSchema, "GET", `/data/pilots/for-entry/${id(entryId)}`);

export const planPilot = (input: PilotInput & { entry_id: string }, by: Staff, attempt: string) =>
  dataAsk(plannedAnswer, "POST", "/data/pilots", { ...input, by, attempt });

export const updatePilot = (pilotId: string, input: PilotInput, by: Staff) =>
  dataAsk(updatedAnswer, "POST", `/data/pilots/${id(pilotId)}/update`, { ...input, by });

export const startPilot = (pilotId: string, by: Staff) =>
  dataAsk(pilotAnswer, "POST", `/data/pilots/${id(pilotId)}/start`, { by });

export const logCheckIn = (
  pilotId: string,
  input: { on: string; note: string },
  by: Staff,
  attempt: string,
) =>
  dataAsk(checkInAnswer, "POST", `/data/pilots/${id(pilotId)}/check-ins`, {
    ...input,
    by,
    attempt,
  });

export const recordCriterionResult = (
  pilotId: string,
  criterionId: string,
  input: { result: string; met: string },
  by: Staff,
) =>
  dataAsk(pilotAnswer, "POST", `/data/pilots/${id(pilotId)}/criteria/${id(criterionId)}/result`, {
    ...input,
    by,
  });

export const recordPilotDecision = (
  pilotId: string,
  input: {
    outcome: string;
    on: string;
    note: string;
    ends_on?: string;
    go_no_go_on?: string;
    converts_on?: string;
  },
  by: Staff,
) => dataAsk(pilotAnswer, "POST", `/data/pilots/${id(pilotId)}/decision`, { ...input, by });
