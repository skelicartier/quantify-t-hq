import "server-only";

import { z } from "zod";

import { flagSchema } from "@/lib/data/api/company";
import type { CopyInput } from "@/lib/data/api/meetings";
import { ruleLineSchema } from "@/lib/data/api/registers";
import { staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * Systems › Logs and time (ws-notes/security/spec.md §7.4): every system with what it logs,
 * where, for how long, in India or not, its clock and its looks; what CERT-In asks (the rule
 * lines, the time servers, both readings of where logs may be kept); the writes; the CSV.
 */

const lookSchema = z.object({
  check_id: z.string(),
  on: z.string(),
  by_name: z.string(),
  note: z.string(),
  file_id: z.string().nullable(),
  at: z.string(),
  by: staffSchema,
});

export const logLineSchema = z.object({
  key: z.enum([
    "retention_unknown",
    "retention_short",
    "place_outside",
    "place_unknown",
    "time_unknown",
    "time_cloud",
    "time_other",
    "zone",
    "look_overdue",
  ]),
  words: z.string(),
  attention: z.boolean(),
});
export type LogLine = z.infer<typeof logLineSchema>;

const logKindSchema = z.enum([
  "application",
  "web",
  "database",
  "mail",
  "sign_in",
  "cloud",
  "firewall",
  "vpn",
  "ssh",
  "other",
]);

export const logRowSchema = z.object({
  log_id: z.string(),
  tool_id: z.string().nullable(),
  name: z.string(),
  kinds: z.array(logKindSchema),
  where: z.string(),
  retention_days: z.number().nullable(),
  place: z.enum(["", "india", "outside", "not_known"]),
  region: z.string(),
  time_source: z.enum(["", "nic", "npl", "cloud", "other", "not_known"]),
  time_detail: z.string(),
  zone_recorded: flagSchema,
  retired: z.object({ on: z.string(), why: z.string() }).nullable(),
  notes: z.string(),
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
  tool: z.object({ tool_id: z.string(), name: z.string(), href: z.string() }).nullable(),
  added_on: z.string(),
  last_look: lookSchema.nullable(),
  looks: z.number(),
  next_look: z.string().nullable(),
  overdue: z.boolean(),
  due: z.boolean(),
  lines: z.array(logLineSchema),
  href: z.string(),
});
export type LogRow = z.infer<typeof logRowSchema>;

const sourceSchema = z.object({ name: z.string(), url: z.string() });
const toolSchema = z.object({
  tool_id: z.string(),
  name: z.string(),
  critical: z.boolean(),
  holds: z.array(z.string()),
  subprocessor: z.boolean(),
  retired: z.boolean(),
  href: z.string(),
});
export type ToolOption = z.infer<typeof toolSchema>;

const fixed = {
  rules: z.object({ logs: ruleLineSchema.nullable(), time: ruleLineSchema.nullable() }),
  servers: z.object({ nic: z.array(z.string()), npl: z.array(z.string()) }),
  readings: z.array(
    z.object({ label: z.string(), words: z.string(), sources: z.array(sourceSchema) }),
  ),
  tools_loaded: z.boolean(),
  tools: z.array(toolSchema),
  setup: z.object({ check_months: z.number().nullable() }),
  files_here: z.boolean(),
  today: z.string(),
};

export const logsPageSchema = ok.extend({
  systems: z.array(logRowSchema),
  counts: z.object({
    systems: z.number(),
    short: z.number(),
    outside: z.number(),
    time_unknown: z.number(),
  }),
  ...fixed,
});
export type LogsPage = z.infer<typeof logsPageSchema>;

const eventSchema = z.object({
  event_id: z.string(),
  verb: z.string(),
  detail: z.string(),
  by: staffSchema,
  at: z.string(),
});

export const logPageSchema = ok.extend({
  system: logRowSchema.extend({
    checks: z.array(
      lookSchema.extend({
        file: z.object({ file_id: z.string(), title: z.string() }).nullable(),
      }),
    ),
  }),
  events: z.array(eventSchema),
  files: z.array(z.object({ file_id: z.string(), title: z.string(), folder: z.string() })),
  ...fixed,
});
export type LogPage = z.infer<typeof logPageSchema>;

const systemAnswer = ok.extend({ system: logRowSchema });
type Fields = Record<string, string | string[]>;

export const readLogs = () => dataAsk(logsPageSchema, "GET", "/data/logs");

export const readLog = (logId: string) => dataAsk(logPageSchema, "GET", `/data/logs/${id(logId)}`);

export const exportLogs = () =>
  dataAsk(ok.extend({ name: z.string(), csv: z.string() }), "GET", "/data/logs/export");

export const addLog = (input: Fields, by: Staff, attempt: string) =>
  dataAsk(systemAnswer, "POST", "/data/logs", { ...input, by, attempt });

export const updateLog = (logId: string, input: Fields, by: Staff) =>
  dataAsk(systemAnswer, "POST", `/data/logs/${id(logId)}/update`, { ...input, by });

export const recordLook = (
  logId: string,
  input: Record<string, string>,
  copy: CopyInput,
  by: Staff,
  attempt: string,
) =>
  dataAsk(systemAnswer, "POST", `/data/logs/${id(logId)}/checks`, {
    ...input,
    ...copy,
    by,
    attempt,
  });

export const retireLog = (logId: string, input: { on: string; why: string }, by: Staff) =>
  dataAsk(systemAnswer, "POST", `/data/logs/${id(logId)}/retire`, { ...input, by });

export const saveLogsSetup = (checkMonths: string, by: Staff) =>
  dataAsk(
    ok.extend({ setup: z.object({ check_months: z.number().nullable() }) }),
    "POST",
    "/data/logs/setup",
    { check_months: checkMonths, by },
  );
