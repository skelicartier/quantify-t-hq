import "server-only";

import { z } from "zod";

import { flagSchema } from "@/lib/data/api/company";
import type { CopyInput } from "@/lib/data/api/meetings";
import { fileChoiceSchema, fileLinkSchema } from "@/lib/data/api/registers";
import { staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * Pen tests and findings (ws-notes/security/spec.md §8.4): each pen test with its checks and
 * findings, each finding with its fix-by day and the lines under it, his windows, when the
 * next pen test is due, the customers' duties in force (null when no profiles answer here),
 * the last dependency-alert import, and the two-step import itself.
 */

export const severitySchema = z.enum(["critical", "high", "medium", "low"]);
export const findingSourceSchema = z.enum(["pen_test", "dependabot", "self", "customer", "other"]);
export const findingStatusSchema = z.enum(["open", "fixed", "accepted", "dismissed"]);
export const hostStateSchema = z.enum(["open", "fixed", "dismissed", "auto_dismissed"]);

const stamp = {
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
};

export const fixSchema = z.object({
  fix_by: z.string(),
  worked_out: z.string(),
  because: z
    .object({
      entry_id: z.string(),
      firm: z.string(),
      key: z.string(),
      regime: z.enum(["sebi", "dora", "uk", "other"]),
      words: z.string(),
    })
    .nullable(),
  own: z.object({ on: z.string(), why: z.string() }).nullable(),
  due_from: z.string(),
  state: z.enum(["due", "overdue", "fixed", "fixed_late", "accepted", "dismissed"]),
  words: z.string(),
  lines: z.array(z.string()),
});
export type FixView = z.infer<typeof fixSchema>;

export const dependabotSchema = z.object({
  repo: z.string(),
  number: z.number(),
  ghsa_id: z.string(),
  cve_id: z.string().nullable(),
  package: z.string(),
  ecosystem: z.string(),
  manifest_path: z.string(),
  vulnerable_range: z.string(),
  patched: z.string().nullable(),
  html_url: z.string(),
  state: hostStateSchema,
  dismissed_reason: z.string().nullable(),
  imported_at: z.string(),
});

export const findingRowSchema = z.object({
  finding_id: z.string(),
  title: z.string(),
  description: z.string(),
  source: findingSourceSchema,
  severity: severitySchema,
  found_on: z.string(),
  pen_test_id: z.string().nullable(),
  owner: z.string(),
  status: findingStatusSchema,
  fixed_on: z.string().nullable(),
  evidence: z.string(),
  evidence_file_id: z.string().nullable(),
  decision: z.object({ why: z.string(), decided_by: z.string(), on: z.string() }).nullable(),
  own_fix_by: z.object({ on: z.string(), why: z.string() }).nullable(),
  dependabot: dependabotSchema.nullable(),
  ...stamp,
  fix: fixSchema,
  source_words: z.string(),
  severity_words: z.string(),
  status_words: z.string(),
  pen_test_tester: z.string().nullable(),
  href: z.string(),
});
export type FindingRow = z.infer<typeof findingRowSchema>;

export const penTestRowSchema = z.object({
  pen_test_id: z.string(),
  tester: z.string(),
  empanelled: flagSchema,
  kind: z.enum(["third_party", "in_house"]),
  scope: z.string(),
  started_on: z.string().nullable(),
  report_on: z.string().nullable(),
  report_file_id: z.string().nullable(),
  retest: z.object({
    planned_on: z.string().nullable(),
    done_on: z.string().nullable(),
    file_id: z.string().nullable(),
  }),
  large_change: z.object({ on: z.string(), what: z.string() }).nullable(),
  notes: z.string(),
  ...stamp,
  kind_words: z.string(),
  empanelled_words: z.string(),
  findings: z.object({ open: z.number(), all: z.number() }),
  checks: z.array(z.string()),
  report_file: fileLinkSchema.nullable(),
  retest_file: fileLinkSchema.nullable(),
  href: z.string(),
});
export type PenTestRow = z.infer<typeof penTestRowSchema>;

export const inForceSchema = z.object({
  entry_id: z.string(),
  firm: z.string(),
  key: z.string(),
  effect: z.object({
    sources: z.array(z.string()),
    severities: z.array(z.string()),
    days: z.number().nullable(),
    months: z.number().nullable(),
  }),
});
export type InForce = z.infer<typeof inForceSchema>;

const windowSchema = z.object({ days: z.number(), yours: z.boolean() });
export const windowsSchema = z.object({
  critical: windowSchema,
  high: windowSchema,
  medium: windowSchema,
  low: windowSchema,
});
export type Windows = z.infer<typeof windowsSchema>;

export const importCountsSchema = z.object({
  alerts: z.number(),
  new: z.number(),
  changed: z.number(),
  unchanged: z.number(),
  refused: z.number(),
});

export const findingsPageSchema = ok.extend({
  view: z.enum(["open", "all"]),
  source: z.string(),
  pen_tests: z.array(penTestRowSchema),
  findings: z.array(findingRowSchema),
  counts: z.object({
    open: z.number(),
    overdue: z.number(),
    by_severity: z.object({
      critical: z.number(),
      high: z.number(),
      medium: z.number(),
      low: z.number(),
    }),
    all: z.number(),
  }),
  windows: windowsSchema,
  pen_test: z.object({
    next_on: z.string().nullable(),
    why: z.string(),
    months: z.number(),
    yours: z.boolean(),
  }),
  in_force: z.array(inForceSchema).nullable(),
  last_import: z
    .object({ at: z.string(), on: z.string(), file_name: z.string(), counts: importCountsSchema })
    .nullable(),
  files: z.array(fileChoiceSchema),
  files_here: z.boolean(),
  today: z.string(),
});
export type FindingsPage = z.infer<typeof findingsPageSchema>;

export const findingsEventSchema = z.object({
  event_id: z.string(),
  target: z.string(),
  id: z.string(),
  verb: z.string(),
  detail: z.string(),
  by: staffSchema,
  at: z.string(),
});
export type FindingsEvent = z.infer<typeof findingsEventSchema>;

export const findingPageSchema = ok.extend({
  finding: findingRowSchema,
  pen_test: penTestRowSchema.nullable(),
  pen_tests: z.array(
    z.object({ pen_test_id: z.string(), tester: z.string(), report_on: z.string().nullable() }),
  ),
  evidence_file: fileLinkSchema.nullable(),
  events: z.array(findingsEventSchema),
  in_force: z.array(inForceSchema).nullable(),
  files: z.array(fileChoiceSchema),
  files_here: z.boolean(),
  today: z.string(),
});
export type FindingPage = z.infer<typeof findingPageSchema>;

export const penTestPageSchema = ok.extend({
  pen_test: penTestRowSchema,
  findings: z.array(findingRowSchema),
  events: z.array(findingsEventSchema),
  next: z.object({ next_on: z.string().nullable(), why: z.string(), months: z.number() }),
  files: z.array(fileChoiceSchema),
  files_here: z.boolean(),
  today: z.string(),
});
export type PenTestPage = z.infer<typeof penTestPageSchema>;

export const previewSchema = ok.extend({
  import_id: z.string(),
  repos: z.array(z.string()),
  counts: importCountsSchema,
  words: z.string(),
  sample: z.array(
    z.object({
      index: z.number(),
      key: z.string(),
      repo: z.string(),
      number: z.number(),
      title: z.string(),
      package: z.string(),
      ghsa_id: z.string(),
      cve_id: z.string().nullable(),
      severity: severitySchema,
      state: hostStateSchema,
      found_on: z.string(),
      plan: z.enum(["new", "changed", "unchanged"]),
    }),
  ),
  refused: z.array(z.object({ index: z.number(), why: z.string() })),
  file_name: z.string(),
});
export type AlertsPreview = z.infer<typeof previewSchema>;

const findingAnswer = ok.extend({ finding: findingRowSchema });
const penTestAnswer = ok.extend({ pen_test: penTestRowSchema });

export const readFindings = (view: "open" | "all" = "open", source = "") => {
  const query = new URLSearchParams();
  if (view === "all") query.set("view", "all");
  if (source) query.set("source", source);
  const text = query.toString();
  return dataAsk(findingsPageSchema, "GET", `/data/findings${text ? `?${text}` : ""}`);
};

export const readFinding = (findingId: string) =>
  dataAsk(findingPageSchema, "GET", `/data/findings/${id(findingId)}`);

export const readPenTest = (penTestId: string) =>
  dataAsk(penTestPageSchema, "GET", `/data/findings/pen-tests/${id(penTestId)}`);

export type FindingInput = {
  title?: string;
  description?: string;
  source?: string;
  severity?: string;
  found_on?: string;
  pen_test_id?: string;
  owner?: string;
  evidence?: string;
};

export const addFinding = (input: FindingInput, by: Staff, attempt: string) =>
  dataAsk(findingAnswer, "POST", "/data/findings", { ...input, by, attempt });

export const updateFinding = (findingId: string, input: FindingInput, by: Staff) =>
  dataAsk(findingAnswer, "POST", `/data/findings/${id(findingId)}/update`, { ...input, by });

export const findingFixed = (
  findingId: string,
  input: { on: string; evidence?: string } & CopyInput,
  by: Staff,
) => dataAsk(findingAnswer, "POST", `/data/findings/${id(findingId)}/fixed`, { ...input, by });

export const acceptFinding = (
  findingId: string,
  input: { why: string; decided_by: string; on: string },
  by: Staff,
) => dataAsk(findingAnswer, "POST", `/data/findings/${id(findingId)}/accept`, { ...input, by });

export const dismissFinding = (findingId: string, input: { why: string }, by: Staff) =>
  dataAsk(findingAnswer, "POST", `/data/findings/${id(findingId)}/dismiss`, { ...input, by });

export const reopenFinding = (findingId: string, by: Staff) =>
  dataAsk(findingAnswer, "POST", `/data/findings/${id(findingId)}/reopen`, { by });

export const moveFinding = (
  findingId: string,
  input: { on: string; why: string } | { undo: true },
  by: Staff,
) => dataAsk(findingAnswer, "POST", `/data/findings/${id(findingId)}/move`, { ...input, by });

export type PenTestInput = {
  tester?: string;
  kind?: string;
  empanelled?: string;
  scope?: string;
  started_on?: string;
  report_on?: string;
  notes?: string;
};

export const addPenTest = (input: PenTestInput & CopyInput, by: Staff, attempt: string) =>
  dataAsk(penTestAnswer, "POST", "/data/findings/pen-tests", { ...input, by, attempt });

export const updatePenTest = (
  penTestId: string,
  input: PenTestInput & CopyInput & { clear_report?: true },
  by: Staff,
) =>
  dataAsk(penTestAnswer, "POST", `/data/findings/pen-tests/${id(penTestId)}/update`, {
    ...input,
    by,
  });

export const recordRetest = (
  penTestId: string,
  input: { planned_on?: string; done_on?: string } & CopyInput,
  by: Staff,
) =>
  dataAsk(penTestAnswer, "POST", `/data/findings/pen-tests/${id(penTestId)}/retest`, {
    ...input,
    by,
  });

export const recordLargeChange = (
  penTestId: string,
  input: { on: string; what: string } | { undo: true },
  by: Staff,
) =>
  dataAsk(penTestAnswer, "POST", `/data/findings/pen-tests/${id(penTestId)}/large-change`, {
    ...input,
    by,
  });

export const saveFindingsSetup = (
  input: {
    windows?: Partial<Record<"critical" | "high" | "medium" | "low", string>>;
    pen_test_months?: string;
  },
  by: Staff,
) =>
  dataAsk(
    ok.extend({ windows: windowsSchema, pen_test_months: z.number().nullable() }),
    "POST",
    "/data/findings/setup",
    { ...input, by },
  );

export const previewAlerts = (input: { content: string; name: string }, by: Staff) =>
  dataAsk(previewSchema, "POST", "/data/findings/dependabot/preview", { ...input, by });

export const importAlerts = (importId: string, by: Staff, attempt: string) =>
  dataAsk(ok.extend({ counts: importCountsSchema }), "POST", "/data/findings/dependabot/import", {
    import_id: importId,
    by,
    attempt,
  });
