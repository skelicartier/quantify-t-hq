import "server-only";

import { z } from "zod";

import { staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * Bank statements as the portal reads and writes them (ws-notes/duties/spec.md §9.5). Every
 * call but the summary carries the Owner flag, which the caller sets from the role and from
 * nothing else; the service refuses without it. Money is whole minor units.
 */

const addsUpSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), at_line: z.number(), words: z.string() }),
  z.object({ ok: z.null() }),
]);
const storedSchema = z.object({
  stored: z.string(),
  original_name: z.string(),
  bytes: z.number(),
  sha256: z.string(),
});
const mappingSchema = z.object({
  delimiter: z.enum([",", ";", "\t", "|"]),
  header_row: z.number(),
  date: z.number(),
  date_format: z.string(),
  narration: z.number(),
  reference: z.number().nullable(),
  amount: z.union([
    z.object({ style: z.literal("two_columns"), debit: z.number(), credit: z.number() }),
    z.object({ style: z.literal("signed"), column: z.number() }),
    z.object({ style: z.literal("marker"), column: z.number(), marker: z.number() }),
  ]),
  balance: z.number().nullable(),
});
export type StatementMapping = z.infer<typeof mappingSchema>;

export const accountSchema = z.object({
  account_id: z.string(),
  name: z.string(),
  kind: z.enum(["bank", "card"]),
  bank: z.string(),
  last4: z.string(),
  currency: z.string(),
  opening: z.object({ on: z.string(), balance_minor: z.number() }).nullable(),
  closed_on: z.string().nullable(),
  mapping: mappingSchema.nullable(),
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
});
export type StatementAccount = z.infer<typeof accountSchema>;

export const statementSchema = z.object({
  statement_id: z.string(),
  account_id: z.string(),
  from: z.string(),
  to: z.string(),
  source: z.enum(["delimited", "ofx"]),
  file: storedSchema,
  copy: storedSchema.nullable(),
  opening_minor: z.number().nullable(),
  closing_minor: z.number().nullable(),
  lines: z.number(),
  skipped: z.number(),
  ignored_rows: z.number(),
  adds_up: addsUpSchema,
  imported_at: z.string(),
  imported_by: staffSchema,
  withdrawn: z.object({ at: z.string(), by: staffSchema, why: z.string() }).nullable(),
  file_name: z.string(),
  copy_name: z.string().nullable(),
});
export type StatementRow = z.infer<typeof statementSchema>;

const cashSchema = z.object({
  currency: z.string(),
  as_of: z.string(),
  cash_minor: z.number(),
  gross_burn_minor: z.number().nullable(),
  avg_net_burn_minor: z.number().nullable(),
  months: z.number(),
  collected_minor: z.number().nullable(),
  uncategorised: z.number(),
});
export type CashNowRow = z.infer<typeof cashSchema>;

const summaryAccountSchema = z.object({
  account_id: z.string(),
  name: z.string(),
  kind: z.enum(["bank", "card"]),
  currency: z.string(),
  covered_to: z.string().nullable(),
  closing_minor: z.number().nullable(),
  to_sort: z.number(),
});

export const statementsSummarySchema = ok.extend({
  accounts: z.array(summaryAccountSchema),
  cash: z.array(cashSchema),
  here: z.object({ money: z.boolean(), people: z.boolean() }),
});
export type StatementsSummary = z.infer<typeof statementsSummarySchema>;

export const statementsPageSchema = ok.extend({
  accounts: z.array(
    summaryAccountSchema.extend({
      account: accountSchema,
      label: z.string(),
      first_day: z.string().nullable(),
      statements: z.array(statementSchema),
      gaps: z.array(z.object({ from: z.string(), to: z.string(), words: z.string() })),
    }),
  ),
  cash: z.array(
    cashSchema.extend({
      runway_months: z.number().nullable(),
      zero_on: z.string().nullable(),
      words: z.string(),
    }),
  ),
  here: z.object({ money: z.boolean(), people: z.boolean(), lock: z.boolean() }),
});
export type StatementsPage = z.infer<typeof statementsPageSchema>;

const suggestionSchema = z.object({
  kind: z.enum(["bill_payment", "bill", "stipend", "export_receipt", "export"]),
  ref: z.string(),
  title: z.string(),
  strength: z.enum(["sure", "likely"]),
  why: z.string(),
  currency: z.string().nullable(),
  href: z.string().nullable(),
});
export type LineSuggestion = z.infer<typeof suggestionSchema>;

const matchSchema = z.union([
  z.object({
    kind: z.literal("bill_payment"),
    bill_id: z.string(),
    payment_id: z.string(),
    made_here: z.boolean(),
  }),
  z.object({
    kind: z.literal("export_receipt"),
    invoice_id: z.string(),
    receipt_id: z.string(),
    made_here: z.boolean(),
  }),
  z.object({ kind: z.literal("stipend"), person_id: z.string(), payment_id: z.string() }),
]);

const lineSchema = z.object({
  line_id: z.string(),
  account_id: z.string(),
  statement_id: z.string(),
  n: z.number(),
  posted_on: z.string(),
  direction: z.enum(["debit", "credit"]),
  amount_minor: z.number(),
  balance_minor: z.number().nullable(),
  narration: z.string(),
  reference: z.string(),
  category_id: z.string().nullable(),
  match: matchSchema.nullable(),
  note: z.string(),
  withdrawn: z.boolean(),
});

const lineViewSchema = lineSchema.extend({
  category: z
    .object({ category_id: z.string(), name: z.string(), kind: z.string(), ledger: z.string() })
    .nullable(),
  match_title: z.string().nullable(),
  match_href: z.string().nullable(),
  suggestions: z.array(suggestionSchema),
});
export type LineView = z.infer<typeof lineViewSchema>;

const categorySchema = z.object({
  category_id: z.string(),
  name: z.string(),
  kind: z.string(),
  ledger: z.string(),
  people: z.boolean(),
  retired: z.boolean(),
});

export const linesPageSchema = ok.extend({
  account: accountSchema,
  label: z.string(),
  months: z.array(z.string()),
  month: z.string(),
  view: z.enum(["to_sort", "matched", "all"]),
  lines: z.array(lineViewSchema),
  counts: z.object({ to_sort: z.number(), matched: z.number(), all: z.number() }),
  opening_minor: z.number().nullable(),
  in_minor: z.number(),
  out_minor: z.number(),
  closing_minor: z.number().nullable(),
  sure: z.number(),
  locked: z.boolean(),
  lock_words: z.string().nullable(),
  categories: z.array(categorySchema).nullable(),
  here: z.object({ money: z.boolean(), people: z.boolean() }),
});
export type LinesPage = z.infer<typeof linesPageSchema>;

const readLineSchema = z.object({
  row: z.number(),
  posted_on: z.string(),
  direction: z.enum(["debit", "credit"]),
  amount_minor: z.number(),
  balance_minor: z.number().nullable(),
  narration: z.string(),
  reference: z.string(),
});

export const previewSchema = z.union([
  z.object({
    import_id: z.string(),
    source: z.enum(["delimited", "ofx"]),
    mapping: mappingSchema.nullable(),
    header: z.array(z.string()),
    day_first_chosen: z.boolean(),
    rows: z.array(readLineSchema),
    from: z.string(),
    to: z.string(),
    lines: z.number(),
    already_here: z.number(),
    ignored_rows: z.number(),
    opening_minor: z.number().nullable(),
    closing_minor: z.number().nullable(),
    adds_up: addsUpSchema,
    locked_months: z.array(z.string()),
    already_imported_on: z.string().nullable(),
  }),
  z.object({
    import_id: z.string(),
    refused: z.string(),
    header: z.array(z.string()),
    mapping: z.record(z.string(), z.unknown()).nullable(),
  }),
]);
export type ImportPreview = z.infer<typeof previewSchema>;

const flag = (owner: boolean) => (owner ? "owner=1" : "owner=0");

export const readStatementsSummary = () =>
  dataAsk(statementsSummarySchema, "GET", "/data/statements/summary");

export const readStatements = (owner: boolean) =>
  dataAsk(statementsPageSchema, "GET", `/data/statements?${flag(owner)}`);

export const readLines = (owner: boolean, accountId: string, month: string, view: string) =>
  dataAsk(
    linesPageSchema,
    "GET",
    `/data/statements/accounts/${id(accountId)}/lines?${flag(owner)}&month=${encodeURIComponent(month)}&view=${encodeURIComponent(view)}`,
  );

export type AccountInput = {
  name: string;
  kind: string;
  bank: string;
  last4: string;
  currency: string;
  opening_on: string;
  opening_balance: string;
};

export const addAccount = (owner: boolean, input: AccountInput, by: Staff, attempt: string) =>
  dataAsk(ok.extend({ account: accountSchema }), "POST", "/data/statements/accounts", {
    ...input,
    owner,
    by,
    attempt,
  });

export const closeAccount = (owner: boolean, accountId: string, closedOn: string, by: Staff) =>
  dataAsk(
    ok.extend({ account: accountSchema }),
    "POST",
    `/data/statements/accounts/${id(accountId)}/close`,
    { closed_on: closedOn, owner, by },
  );

export const previewImport = (
  owner: boolean,
  accountId: string,
  input: { content?: string; name?: string; import_id?: string; mapping?: StatementMapping },
  by: Staff,
) =>
  dataAsk(
    ok.extend({ preview: previewSchema }),
    "POST",
    `/data/statements/accounts/${id(accountId)}/preview`,
    { ...input, owner, by },
  );

export const importStatement = (
  owner: boolean,
  accountId: string,
  input: {
    import_id: string;
    from: string;
    to: string;
    opening_minor?: string;
    mapping?: StatementMapping;
  },
  by: Staff,
  attempt: string,
) =>
  dataAsk(
    ok.extend({ statement: statementSchema, added: z.number(), skipped: z.number() }),
    "POST",
    `/data/statements/accounts/${id(accountId)}/import`,
    { ...input, owner, by, attempt },
  );

export const withdrawStatement = (owner: boolean, statementId: string, why: string, by: Staff) =>
  dataAsk(
    ok.extend({ statement: statementSchema }),
    "POST",
    `/data/statements/${id(statementId)}/withdraw`,
    { why, owner, by },
  );

export const addStatementCopy = (
  owner: boolean,
  statementId: string,
  input: { name: string; content: string },
  by: Staff,
) =>
  dataAsk(
    ok.extend({ statement: statementSchema }),
    "POST",
    `/data/statements/${id(statementId)}/copy`,
    { ...input, owner, by },
  );

export const readStatementFile = (owner: boolean, statementId: string, which: "file" | "copy") =>
  dataAsk(
    ok.extend({ name: z.string(), type: z.string(), sha256: z.string(), content: z.string() }),
    "GET",
    `/data/statements/${id(statementId)}/${which}?${flag(owner)}`,
  );

export const exportLines = (owner: boolean, month: string, accountId: string) =>
  dataAsk(
    ok.extend({ name: z.string(), csv: z.string() }),
    "GET",
    `/data/statements/export?${flag(owner)}&month=${encodeURIComponent(month)}&account=${encodeURIComponent(accountId)}`,
  );

const lineAnswer = ok.extend({ line: lineSchema });

export const setLineCategory = (owner: boolean, lineId: string, categoryId: string, by: Staff) =>
  dataAsk(lineAnswer, "POST", `/data/statements/lines/${id(lineId)}/category`, {
    category_id: categoryId,
    owner,
    by,
  });

export const matchLine = (
  owner: boolean,
  lineId: string,
  input: { ref: string; amount_minor?: string },
  by: Staff,
) =>
  dataAsk(lineAnswer, "POST", `/data/statements/lines/${id(lineId)}/match`, {
    ...input,
    owner,
    by,
  });

export const unmatchLine = (owner: boolean, lineId: string, why: string, by: Staff) =>
  dataAsk(lineAnswer, "POST", `/data/statements/lines/${id(lineId)}/unmatch`, {
    why,
    owner,
    by,
  });

export const noteLine = (owner: boolean, lineId: string, note: string, by: Staff) =>
  dataAsk(lineAnswer, "POST", `/data/statements/lines/${id(lineId)}/note`, { note, owner, by });

export const acceptSure = (owner: boolean, accountId: string, month: string, by: Staff) =>
  dataAsk(
    ok.extend({ accepted: z.number(), words: z.string() }),
    "POST",
    `/data/statements/accounts/${id(accountId)}/accept-sure`,
    { month, owner, by },
  );
