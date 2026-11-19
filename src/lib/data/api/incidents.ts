import "server-only";

import { z } from "zod";

import { staffSchema } from "@/lib/data/api/replies";
import { fileChoiceSchema, fileLinkSchema, ruleLineSchema } from "@/lib/data/api/registers";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * Incidents (ws-notes/duties/spec.md §6.3, §6.6): the clocks the service works out (CERT-In's
 * report, the Data Protection Board's, each customer's), each with its rule line; the report
 * as recorded, never sent from here; the runbooks. Instants travel as ISO strings and are
 * shown in IST by the service's words.
 */

export const incidentKindSchema = z.enum([
  "scanning",
  "compromise",
  "unauthorised_access",
  "defacement",
  "malware",
  "servers",
  "phishing",
  "dos",
  "infrastructure",
  "applications",
  "data_breach",
  "data_leak",
  "iot",
  "payments",
  "malicious_apps",
  "fake_apps",
  "social_media",
  "cloud",
  "emerging",
  "ai",
  "other",
]);
export type IncidentKind = z.infer<typeof incidentKindSchema>;
export const severitySchema = z.enum(["low", "medium", "high", "critical"]);
export const incidentStatusSchema = z.enum(["open", "contained", "resolved", "closed"]);
export type IncidentStatus = z.infer<typeof incidentStatusSchema>;
export const channelSchema = z.enum(["email", "phone", "fax", "form"]);

export const certInClockSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("not_listed") }),
  z.object({
    state: z.literal("not_reportable"),
    why: z.string(),
    decided_by: z.string(),
    on: z.string(),
  }),
  z.object({ state: z.literal("no_rule") }),
  z.object({
    state: z.literal("due"),
    report_by: z.string(),
    report_by_words: z.string(),
    minutes_left: z.number(),
    words: z.string(),
  }),
  z.object({
    state: z.literal("overdue"),
    report_by: z.string(),
    report_by_words: z.string(),
    minutes_late: z.number(),
    words: z.string(),
  }),
  z.object({
    state: z.literal("reported"),
    report_by: z.string(),
    sent_at: z.string(),
    sent_words: z.string(),
    margin_words: z.string(),
  }),
]);
export type CertInClock = z.infer<typeof certInClockSchema>;

export const boardClockSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("no_personal_data") }),
  z.object({ state: z.literal("no_rule") }),
  z.object({ state: z.literal("not_in_force"), starts_on: z.string() }),
  z.object({
    state: z.enum(["due", "overdue", "reported"]),
    report_by: z.string(),
    report_by_words: z.string(),
    words: z.string(),
  }),
]);
export type BoardClock = z.infer<typeof boardClockSchema>;

export const customerClockSchema = z.object({
  row_id: z.string(),
  tell_by: z.string(),
  tell_by_words: z.string(),
  state: z.enum(["due", "overdue", "told"]),
  words: z.string(),
});
export type CustomerClock = z.infer<typeof customerClockSchema>;

export const clockSchema = z.object({
  cert_in: certInClockSchema,
  board: boardClockSchema,
  customers: z.array(customerClockSchema),
  rules: z.object({ cert_in: ruleLineSchema.nullable(), board: ruleLineSchema.nullable() }),
});

export const certInReportSchema = z.object({
  sent_at: z.string(),
  channel: channelSchema,
  reference: z.string(),
  sent_by: z.string(),
  file_id: z.string().nullable(),
  late_reason: z.string(),
});

export const customerRowSchema = z.object({
  row_id: z.string(),
  name: z.string(),
  waitlist_entry_id: z.string().nullable(),
  hours: z.number(),
  told_at: z.string().nullable(),
  how: z.string(),
  withdrawn: z.boolean(),
});
export type CustomerRow = z.infer<typeof customerRowSchema>;

export const incidentSchema = z.object({
  incident_id: z.string(),
  reference: z.string(),
  title: z.string(),
  summary: z.string(),
  kind: incidentKindSchema,
  kind_label: z.string(),
  listed: z.boolean(),
  severity: severitySchema,
  status: incidentStatusSchema,
  personal_data: z.boolean(),
  occurred_at: z.string().nullable(),
  aware_at: z.string(),
  contained_at: z.string().nullable(),
  resolved_at: z.string().nullable(),
  closed_at: z.string().nullable(),
  systems: z.string(),
  actions: z.string(),
  cert_in: z.object({
    not_reportable: z
      .object({ why: z.string(), decided_by: z.string(), on: z.string() })
      .nullable(),
    report: certInReportSchema.nullable(),
  }),
  board: z.object({
    report: z
      .object({ sent_at: z.string(), reference: z.string(), file_id: z.string().nullable() })
      .nullable(),
  }),
  customers: z.array(customerRowSchema),
  lessons: z.string(),
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
  clock: clockSchema,
});
export type IncidentDetail = z.infer<typeof incidentSchema>;

export const incidentRowSchema = z.object({
  incident_id: z.string(),
  reference: z.string(),
  title: z.string(),
  kind: incidentKindSchema,
  kind_label: z.string(),
  severity: severitySchema,
  status: incidentStatusSchema,
  personal_data: z.boolean(),
  aware_at: z.string(),
  aware_words: z.string(),
  reported_at: z.string().nullable(),
  cert_in: certInClockSchema,
});
export type IncidentRow = z.infer<typeof incidentRowSchema>;

export const contactSchema = z
  .object({ name: z.string(), designation: z.string(), sent_on: z.string().nullable() })
  .nullable();

export const incidentsPageSchema = ok.extend({
  view: z.enum(["open", "all"]),
  incidents: z.array(incidentRowSchema),
  counts: z.object({ open: z.number(), all: z.number(), report_due: z.number() }),
  contact: contactSchema,
  rule: ruleLineSchema.nullable(),
  kinds: z.array(z.object({ kind: incidentKindSchema, label: z.string(), listed: z.boolean() })),
  today: z.string(),
  now: z.string(),
});
export type IncidentsPage = z.infer<typeof incidentsPageSchema>;

export const incidentEventSchema = z.object({
  event_id: z.string(),
  incident_id: z.string(),
  verb: z.string(),
  detail: z.string(),
  by: staffSchema,
  at: z.string(),
});

export const incidentPageSchema = ok.extend({
  incident: incidentSchema,
  events: z.array(incidentEventSchema),
  runbook: fileLinkSchema.nullable(),
  contact: contactSchema,
  report_file: fileLinkSchema.nullable(),
  board_file: fileLinkSchema.nullable(),
  files: z.array(fileChoiceSchema),
  files_here: z.boolean(),
  waitlist: z.array(z.object({ entry_id: z.string(), firm: z.string() })),
  today: z.string(),
  now: z.string(),
});
export type IncidentPage = z.infer<typeof incidentPageSchema>;

export const runbooksSchema = ok.extend({
  runbooks: z.array(
    z.object({ kind: incidentKindSchema, label: z.string(), file: fileLinkSchema.nullable() }),
  ),
  files: z.array(fileChoiceSchema),
  files_here: z.boolean(),
});
export type RunbooksPage = z.infer<typeof runbooksSchema>;

const incidentAnswer = ok.extend({ incident: incidentSchema });

/** A copy kept in Files: one already there, or the bytes as base64 with their name. */
export type CopyInput = { file_id?: string; content?: string; name?: string };

export const readIncidents = (view: "open" | "all" = "open") =>
  dataAsk(incidentsPageSchema, "GET", `/data/incidents${view === "all" ? "?view=all" : ""}`);

export const readIncident = (incidentId: string) =>
  dataAsk(incidentPageSchema, "GET", `/data/incidents/${id(incidentId)}`);

export type IncidentInput = {
  title?: string;
  kind?: string;
  severity?: string;
  aware_day?: string;
  aware_time?: string;
  occurred_day?: string;
  occurred_time?: string;
  personal_data?: boolean;
  summary?: string;
  systems?: string;
  actions?: string;
  lessons?: string;
};

export const logIncident = (input: IncidentInput, by: Staff, attempt: string) =>
  dataAsk(incidentAnswer, "POST", "/data/incidents", { ...input, by, attempt });

export const updateIncident = (incidentId: string, input: IncidentInput, by: Staff) =>
  dataAsk(incidentAnswer, "POST", `/data/incidents/${id(incidentId)}/update`, { ...input, by });

export const setIncidentStatus = (
  incidentId: string,
  input: { to: IncidentStatus; day?: string; time?: string },
  by: Staff,
) => dataAsk(incidentAnswer, "POST", `/data/incidents/${id(incidentId)}/status`, { ...input, by });

export const recordCertInReport = (
  incidentId: string,
  input: {
    sent_day: string;
    sent_time: string;
    channel: string;
    reference: string;
    sent_by: string;
    late_reason: string;
  } & CopyInput,
  by: Staff,
) =>
  dataAsk(incidentAnswer, "POST", `/data/incidents/${id(incidentId)}/cert-in/report`, {
    ...input,
    by,
  });

export const recordNotReportable = (
  incidentId: string,
  input: { why: string; decided_by: string; on: string } | { undo: true },
  by: Staff,
) =>
  dataAsk(incidentAnswer, "POST", `/data/incidents/${id(incidentId)}/cert-in/not-reportable`, {
    ...input,
    by,
  });

export const recordBoardReport = (
  incidentId: string,
  input: { sent_day: string; sent_time: string; reference: string } & CopyInput,
  by: Staff,
) =>
  dataAsk(incidentAnswer, "POST", `/data/incidents/${id(incidentId)}/board/report`, {
    ...input,
    by,
  });

export const addIncidentCustomer = (
  incidentId: string,
  input: { name: string; hours: string; waitlist_entry_id: string },
  by: Staff,
  attempt: string,
) =>
  dataAsk(incidentAnswer, "POST", `/data/incidents/${id(incidentId)}/customers`, {
    ...input,
    by,
    attempt,
  });

export const customerTold = (
  incidentId: string,
  rowId: string,
  input: { day: string; time: string; how: string },
  by: Staff,
) =>
  dataAsk(incidentAnswer, "POST", `/data/incidents/${id(incidentId)}/customers/${id(rowId)}/told`, {
    ...input,
    by,
  });

export const withdrawCustomer = (incidentId: string, rowId: string, by: Staff) =>
  dataAsk(
    incidentAnswer,
    "POST",
    `/data/incidents/${id(incidentId)}/customers/${id(rowId)}/withdraw`,
    { by },
  );

export const readRunbooks = () => dataAsk(runbooksSchema, "GET", "/data/incidents/runbooks");

export const setRunbook = (kind: string, fileId: string | null, by: Staff) =>
  dataAsk(runbooksSchema, "POST", "/data/incidents/runbooks", { kind, file_id: fileId, by });
