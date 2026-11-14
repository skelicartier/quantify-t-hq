import "server-only";

import { z } from "zod";

import { staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * The people ledger (ws-notes/company/spec.md §8): interns, employees and contractors, their
 * documents, evaluations, certificate, stipend payments and access, kept on this computer by
 * the local service. For the Owner only: every caller checks the role before it asks.
 */

export const engagementKindSchema = z.enum(["intern", "employee", "contractor"]);
export type EngagementKind = z.infer<typeof engagementKindSchema>;
export const personStateSchema = z.enum(["starting", "engaged", "offboarding", "ended"]);
export type PersonState = z.infer<typeof personStateSchema>;
export const documentKindSchema = z.enum([
  "appointment",
  "internship",
  "contractor",
  "nda",
  "ip_assignment",
  "other",
]);
export type DocumentKind = z.infer<typeof documentKindSchema>;
export const outcomeSchema = z.enum([
  "on_track",
  "needs_support",
  "completed",
  "not_completed",
  "",
]);
export const currencySchema = z.enum(["INR", "USD"]);
export type StipendCurrency = z.infer<typeof currencySchema>;

/** A signed copy kept with the ledger on this computer, never in Files; for the Owner only. */
export const personCopySchema = z.object({
  copy_id: z.string(),
  file: z.string(),
  name: z.string(),
  mime: z.string(),
  bytes: z.number(),
  sha256: z.string(),
  at: z.string(),
  by: staffSchema,
});
export type PersonCopy = z.infer<typeof personCopySchema>;

export const personDocumentSchema = z.object({
  document_id: z.string(),
  kind: documentKindSchema,
  title: z.string(),
  copy: personCopySchema.nullable(),
  signed_on: z.string().nullable(),
  includes_ip: z.boolean(),
  includes_confidentiality: z.boolean(),
  at: z.string(),
  by: staffSchema,
});
export type PersonDocument = z.infer<typeof personDocumentSchema>;

export const evaluationSchema = z.object({
  due_on: z.string().nullable(),
  held_on: z.string().nullable(),
  by_name: z.string(),
  outcome: outcomeSchema,
  summary: z.string(),
});
export type Evaluation = z.infer<typeof evaluationSchema>;

export const paymentSchema = z.object({
  payment_id: z.string(),
  period: z.string(),
  amount: z.number(),
  currency: currencySchema,
  paid_on: z.string(),
  reference: z.string(),
  tds_deducted: z.number().nullable(),
  note: z.string(),
  at: z.string(),
  by: staffSchema,
  withdrawn: z.object({ at: z.string(), by: staffSchema, why: z.string() }).nullable(),
});
export type StipendPayment = z.infer<typeof paymentSchema>;

export const accessGrantSchema = z.object({
  access_id: z.string(),
  system: z.string(),
  level: z.string(),
  critical: z.boolean(),
  granted_on: z.string().nullable(),
  revoked_on: z.string().nullable(),
  never_had: z.boolean(),
  notes: z.string(),
});
export type AccessGrant = z.infer<typeof accessGrantSchema>;

export const stipendSchema = z.object({
  amount: z.number(),
  currency: currencySchema,
  pays_on: z.union([z.number(), z.literal("month_end")]),
});
export type Stipend = z.infer<typeof stipendSchema>;

const personFields = {
  person_id: z.string(),
  name: z.string(),
  email: z.string(),
  kind: engagementKindSchema,
  role_title: z.string(),
  starts_on: z.string(),
  ends_on: z.string().nullable(),
  mentor: z.string(),
  brief: z.string(),
  stipend: stipendSchema.nullable(),
  documents: z.array(personDocumentSchema),
  evaluations: z.object({ midpoint: evaluationSchema, final: evaluationSchema }),
  certificate: z
    .object({ number: z.string(), issued_on: z.string(), copy: personCopySchema.nullable() })
    .nullable(),
  offboarding: z
    .object({ last_day: z.string(), started_at: z.string(), started_by: staffSchema })
    .nullable(),
  ended_on: z.string().nullable(),
  hq_staff_id: z.string().nullable(),
  notes: z.string(),
  payments: z.array(paymentSchema),
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
};

export const personSchema = z.object({ ...personFields, access: z.array(accessGrantSchema) });
export type Person = z.infer<typeof personSchema>;

const nextSchema = z.object({ what: z.string(), on: z.string() }).nullable();

/** A list row: the person with their state, letter, what is next, and the grants as counts. */
export const personRowSchema = z.object({
  ...personFields,
  state: personStateSchema,
  letter: z.enum(["signed", "missing"]),
  letter_on: z.string().nullable(),
  next: nextSchema,
  access: z.object({ held: z.number(), to_revoke: z.number() }),
});
export type PersonRow = z.infer<typeof personRowSchema>;

export const peopleTabSchema = z.enum(["engaged", "starting", "ended", "all"]);
export type PeopleTabKey = z.infer<typeof peopleTabSchema>;

export const peoplePageSchema = ok.extend({
  people: z.array(personRowSchema),
  counts: z.object({
    engaged: z.number(),
    starting: z.number(),
    ended: z.number(),
    all: z.number(),
  }),
  state: peopleTabSchema,
  today: z.string(),
});
export type PeoplePage = z.infer<typeof peoplePageSchema>;

export const periodSchema = z.object({
  period: z.string(),
  due_on: z.string().nullable(),
  paid: z.array(paymentSchema),
  open: z.boolean(),
});
export type StipendPeriod = z.infer<typeof periodSchema>;

export const peopleEventSchema = z.object({
  event_id: z.string(),
  person_id: z.string(),
  verb: z.string(),
  detail: z.string(),
  by: staffSchema,
  at: z.string(),
});
export type PeopleEvent = z.infer<typeof peopleEventSchema>;

const deadlineSchema = z.object({ access_id: z.string(), by: z.string() });

export const personPageSchema = ok.extend({
  person: personSchema,
  state: personStateSchema,
  periods: z.array(periodSchema),
  deadlines: z.array(deadlineSchema),
  warnings: z.array(z.string()),
  next: nextSchema,
  events: z.array(peopleEventSchema),
  today: z.string(),
});
export type PersonPage = z.infer<typeof personPageSchema>;

const personAnswer = ok.extend({ person: personSchema });
const offboardAnswer = ok.extend({ person: personSchema, deadlines: z.array(deadlineSchema) });

// ------------------------------------------------------------------ reads

export const readPeople = (state: PeopleTabKey | "" = "") =>
  dataAsk(peoplePageSchema, "GET", `/data/people${state ? `?state=${state}` : ""}`);

export const readPerson = (personId: string) =>
  dataAsk(personPageSchema, "GET", `/data/people/${id(personId)}`);

// ------------------------------------------------------------------ writes

export type StipendInput = { amount: string; currency: string; pays_on: string } | null;

export type PersonInput = {
  name: string;
  email: string;
  kind: string;
  role_title: string;
  starts_on: string;
  ends_on: string;
  mentor: string;
  brief: string;
  stipend: StipendInput;
  notes?: string;
};

export const addPerson = (input: PersonInput, by: Staff, attempt: string) =>
  dataAsk(personAnswer, "POST", "/data/people", { ...input, by, attempt });

export const updatePerson = (personId: string, input: Partial<PersonInput>, by: Staff) =>
  dataAsk(personAnswer, "POST", `/data/people/${id(personId)}/update`, { ...input, by });

/** A signed copy, sent as base64 with its name; the ledger keeps it, never Files. */
export type CopyInput = { content: string; name: string } | null;

const copyFields = (copy: CopyInput) => (copy ? copy : {});

export type DocumentInput = {
  kind: string;
  title: string;
  signed_on: string;
  includes_ip: boolean;
  includes_confidentiality: boolean;
};

export const addDocument = (
  personId: string,
  input: DocumentInput,
  copy: CopyInput,
  by: Staff,
  attempt: string,
) =>
  dataAsk(personAnswer, "POST", `/data/people/${id(personId)}/documents`, {
    ...input,
    ...copyFields(copy),
    by,
    attempt,
  });

export type EvaluationInput = {
  held_on: string;
  by_name: string;
  outcome: string;
  summary: string;
  due_on?: string;
};

export const recordEvaluation = (
  personId: string,
  which: "midpoint" | "final",
  input: EvaluationInput,
  by: Staff,
) =>
  dataAsk(personAnswer, "POST", `/data/people/${id(personId)}/evaluations/${which}`, {
    ...input,
    by,
  });

export const recordCertificate = (
  personId: string,
  input: { number: string; issued_on: string },
  copy: CopyInput,
  by: Staff,
) =>
  dataAsk(personAnswer, "POST", `/data/people/${id(personId)}/certificate`, {
    ...input,
    ...copyFields(copy),
    by,
  });

export type PaymentInput = {
  period: string;
  amount: string;
  currency: string;
  paid_on: string;
  reference: string;
  tds_deducted: string;
  note: string;
};

export const recordPayment = (personId: string, input: PaymentInput, by: Staff, attempt: string) =>
  dataAsk(personAnswer, "POST", `/data/people/${id(personId)}/payments`, {
    ...input,
    by,
    attempt,
  });

export const withdrawPayment = (personId: string, paymentId: string, why: string, by: Staff) =>
  dataAsk(personAnswer, "POST", `/data/people/${id(personId)}/payments/${id(paymentId)}/withdraw`, {
    why,
    by,
  });

export type AccessInput = {
  system: string;
  level: string;
  critical: boolean;
  granted_on: string;
  notes: string;
};

export const grantAccess = (personId: string, input: AccessInput, by: Staff, attempt: string) =>
  dataAsk(personAnswer, "POST", `/data/people/${id(personId)}/access`, {
    ...input,
    by,
    attempt,
  });

export const revokeAccess = (personId: string, accessId: string, on: string, by: Staff) =>
  dataAsk(personAnswer, "POST", `/data/people/${id(personId)}/access/${id(accessId)}/revoke`, {
    on,
    by,
  });

export const neverHadAccess = (personId: string, accessId: string, by: Staff) =>
  dataAsk(personAnswer, "POST", `/data/people/${id(personId)}/access/${id(accessId)}/never`, {
    by,
  });

export const startOffboarding = (personId: string, lastDay: string, by: Staff) =>
  dataAsk(offboardAnswer, "POST", `/data/people/${id(personId)}/offboard`, {
    last_day: lastDay,
    by,
  });

export const cancelOffboarding = (personId: string, by: Staff) =>
  dataAsk(offboardAnswer, "POST", `/data/people/${id(personId)}/offboard/cancel`, { by });

/** A copy's bytes (base64) and how to hand them over: only the Owner-only route asks. */
export const readCopy = (personId: string, copyId: string) =>
  dataAsk(
    ok.extend({ copy: personCopySchema, type: z.string(), content: z.string() }),
    "GET",
    `/data/people/${id(personId)}/copies/${id(copyId)}`,
  );
