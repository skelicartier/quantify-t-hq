import "server-only";

import { z } from "zod";

import { flagSchema } from "@/lib/data/api/company";
import type { CopyInput } from "@/lib/data/api/meetings";
import { fileChoiceSchema, fileLinkSchema } from "@/lib/data/api/registers";
import { staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * Systems › Tools and Accounts (ws-notes/security/spec.md §6.4): the register, a tool with its
 * accounts, Money's vendor and what it billed, the domains that send as it; every account;
 * the Owner-only link to the people ledger and the person's section. The Owner flag is set
 * here only from what the caller passes, which the pages take from `context.me.role ===
 * "owner"` and nothing else; an answer asked without it has no `person`, `close_by` or
 * `roster` key at all, which the schemas below allow by making them optional.
 */

const stamp = {
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
};

export const toolCategorySchema = z.enum([
  "mail_docs",
  "code",
  "cloud",
  "product",
  "finance",
  "sales",
  "security",
  "design",
  "ai",
  "other",
]);
export const toolStatusSchema = z.enum(["in_use", "trial", "ending", "retired"]);
export const dataClassSchema = z.enum([
  "customer",
  "personal",
  "source_code",
  "secrets",
  "financial",
]);
export const keyDateCoverSchema = z.enum(["mailbox", "mail-plan", "developer-programme"]);
const controlKeySchema = z.string();

export const subprocessorSchema = z.object({
  purpose: z.string(),
  locations: z.string(),
  dpa_signed_on: z.string().nullable(),
  dpa_file_id: z.string().nullable(),
  since: z.string().nullable(),
});

export const toolRowSchema = z.object({
  tool_id: z.string(),
  name: z.string(),
  what: z.string(),
  category: toolCategorySchema,
  status: toolStatusSchema,
  business_owner: z.string(),
  admins: z.string(),
  vendor_id: z.string().nullable(),
  legal_name: z.string(),
  plan: z.string(),
  seats: z.number().nullable(),
  amount_minor: z.number().nullable(),
  currency: z.string(),
  billing: z.enum(["", "monthly", "yearly", "once", "free"]),
  renews_on: z.string().nullable(),
  notice_days: z.number().nullable(),
  auto_renews: flagSchema,
  key_date: keyDateCoverSchema.nullable(),
  sign_in: z.enum(["", "sso", "password", "passkey", "mixed"]),
  sso_with: z.string(),
  mfa: z.enum(["", "enforced", "optional", "none"]),
  critical: z.boolean(),
  holds: z.array(dataClassSchema),
  subprocessor: subprocessorSchema.nullable(),
  data_location: z.string(),
  exit: z.string(),
  reviewed: z.object({ on: z.string(), by_name: z.string(), note: z.string() }).nullable(),
  retired: z.object({ on: z.string(), why: z.string() }).nullable(),
  notes: z.string(),
  ...stamp,
  next: z.object({
    renewal: z.object({ next: z.string(), cancel_by: z.string() }).nullable(),
    review: z.string(),
  }),
  looked_on: z.string(),
  review_owed: z.boolean(),
  accounts_open: z.number(),
  accounts_line: z.string(),
  checks: z.array(z.string()),
  href: z.string(),
});
export type ToolRow = z.infer<typeof toolRowSchema>;

export const toolDetailSchema = toolRowSchema.extend({ refs: z.array(controlKeySchema) });
export type ToolDetail = z.infer<typeof toolDetailSchema>;

const personStateSchema = z.enum(["starting", "engaged", "offboarding", "ended"]);

export const closeBySchema = z.object({ on: z.string(), words: z.string(), overdue: z.boolean() });
export type CloseBy = z.infer<typeof closeBySchema>;

export const accountRowSchema = z.object({
  account_id: z.string(),
  tool_id: z.string(),
  holder: z.string(),
  kind: z.enum(["person", "shared", "service"]),
  role: z.enum(["", "owner", "admin", "member", "viewer", "other"]),
  mfa: flagSchema,
  critical: z.boolean().nullable(),
  opened_on: z.string().nullable(),
  closed_on: z.string().nullable(),
  closed_note: z.string(),
  notes: z.string(),
  ...stamp,
  tool_name: z.string(),
  tool_retired: z.boolean(),
  critical_now: z.boolean(),
  href: z.string(),
  /** Only in an answer asked as the Owner. */
  person: z
    .object({
      person_id: z.string(),
      name: z.string(),
      state: personStateSchema,
      href: z.string(),
    })
    .nullable()
    .optional(),
  /** Only in an answer asked as the Owner. */
  close_by: closeBySchema.nullable().optional(),
});
export type AccountRow = z.infer<typeof accountRowSchema>;

export const rosterChoiceSchema = z.object({
  person_id: z.string(),
  name: z.string(),
  state: personStateSchema,
});
export type RosterChoice = z.infer<typeof rosterChoiceSchema>;

export const toolsPageSchema = ok.extend({
  view: z.enum(["in_use", "trial", "ending", "retired", "all"]),
  tools: z.array(toolRowSchema),
  counts: z.object({
    in_use: z.number(),
    trial: z.number(),
    ending: z.number(),
    retired: z.number(),
    subprocessors: z.number(),
  }),
  review_months: z.number().nullable(),
  subprocessors: z.array(
    z.object({ tool_id: z.string(), name: z.string(), dpa_signed_on: z.string().nullable() }),
  ),
  kept: fileLinkSchema.nullable(),
  files_here: z.boolean(),
  today: z.string(),
});
export type ToolsPage = z.infer<typeof toolsPageSchema>;

export const vendorLineSchema = z.object({
  vendor_id: z.string(),
  name: z.string(),
  retired: z.boolean(),
  href: z.string(),
});
export const vendorBilledSchema = z.object({
  currency: z.string(),
  total_minor: z.number(),
  bills: z.number(),
});
export const domainSenderSchema = z.object({
  domain_id: z.string(),
  name: z.string(),
  sends_as: z.array(z.string()),
  href: z.string(),
});

export const toolsEventSchema = z.object({
  event_id: z.string(),
  target: z.enum(["tool", "account"]),
  id: z.string(),
  tool_id: z.string(),
  verb: z.string(),
  detail: z.string(),
  by: staffSchema,
  at: z.string(),
});
export type ToolsEvent = z.infer<typeof toolsEventSchema>;

export const toolPageSchema = ok.extend({
  tool: toolDetailSchema,
  accounts: z.array(accountRowSchema),
  vendor: vendorLineSchema.nullable(),
  vendors: z.array(vendorLineSchema).nullable(),
  billed: z.array(vendorBilledSchema).nullable(),
  billed_since: z.string(),
  senders: z.array(domainSenderSchema).nullable(),
  events: z.array(toolsEventSchema),
  files_here: z.boolean(),
  file_choices: z.array(fileChoiceSchema),
  dpa_file: fileLinkSchema.nullable(),
  review_months: z.number().nullable(),
  roster: z.array(rosterChoiceSchema).optional(),
  roster_here: z.boolean().optional(),
  today: z.string(),
});
export type ToolPage = z.infer<typeof toolPageSchema>;

export const accountsPageSchema = ok.extend({
  view: z.enum(["open", "closed", "all"]),
  accounts: z.array(accountRowSchema),
  holders: z.array(z.string()),
  counts: z.object({
    open: z.number(),
    closed: z.number(),
    shared: z.number(),
    admin_without_mfa: z.number(),
  }),
  roster: z.array(rosterChoiceSchema).optional(),
  roster_here: z.boolean().optional(),
  today: z.string(),
});
export type AccountsPage = z.infer<typeof accountsPageSchema>;

export const personDeviceLineSchema = z.object({
  device_id: z.string(),
  label: z.string(),
  ownership: z.enum(["company", "personal"]),
  by: z.string().nullable(),
  done: z.boolean(),
  href: z.string(),
});
export type PersonDeviceLineAnswer = z.infer<typeof personDeviceLineSchema>;

export const personSystemsSchema = ok.extend({
  /** The person's name as the ledger has it: this route is the Owner's only. */
  name: z.string(),
  accounts: z.array(accountRowSchema),
  devices: z.array(personDeviceLineSchema).nullable(),
  possible: z.array(accountRowSchema),
});
export type PersonSystems = z.infer<typeof personSystemsSchema>;

// ------------------------------------------------------------------ reads

const ownerQuery = (owner: boolean) => (owner ? "owner=1" : "");
const withQuery = (path: string, parts: string[]) => {
  const query = parts.filter(Boolean).join("&");
  return query ? `${path}?${query}` : path;
};

export const readTools = (view?: string) =>
  dataAsk(
    toolsPageSchema,
    "GET",
    withQuery("/data/tools", [view ? `view=${encodeURIComponent(view)}` : ""]),
  );

export const readTool = (toolId: string, owner: boolean) =>
  dataAsk(toolPageSchema, "GET", withQuery(`/data/tools/${id(toolId)}`, [ownerQuery(owner)]));

export const readAccounts = (input: { view?: string; holder?: string; owner: boolean }) =>
  dataAsk(
    accountsPageSchema,
    "GET",
    withQuery("/data/tools/accounts", [
      input.view ? `view=${encodeURIComponent(input.view)}` : "",
      input.holder ? `holder=${encodeURIComponent(input.holder)}` : "",
      ownerQuery(input.owner),
    ]),
  );

/** OWNER-ONLY: the service refuses without the flag, which only the person's page sets. */
export const readPersonSystems = (personId: string) =>
  dataAsk(personSystemsSchema, "GET", `/data/tools/for-person/${id(personId)}?owner=1`);

// ------------------------------------------------------------------ writes

type Fields = Record<string, unknown>;
const toolAnswer = ok.extend({ tool: toolDetailSchema });
const accountAnswer = ok.extend({ account: accountRowSchema });

export const addTool = (input: Fields, dpa: CopyInput, by: Staff, attempt: string) =>
  dataAsk(toolAnswer, "POST", "/data/tools", { ...input, dpa_copy: dpa, by, attempt });

export const updateTool = (toolId: string, input: Fields, dpa: CopyInput, by: Staff) =>
  dataAsk(toolAnswer, "POST", `/data/tools/${id(toolId)}/update`, {
    ...input,
    dpa_copy: dpa,
    by,
  });

export const reviewTool = (
  toolId: string,
  input: { on: string; by_name: string; note: string },
  by: Staff,
) => dataAsk(toolAnswer, "POST", `/data/tools/${id(toolId)}/review`, { ...input, by });

export const retireTool = (
  toolId: string,
  input: { on?: string; why?: string; undo?: true },
  by: Staff,
) => dataAsk(toolAnswer, "POST", `/data/tools/${id(toolId)}/retire`, { ...input, by });

export const saveToolsSetup = (reviewMonths: string, by: Staff) =>
  dataAsk(ok.extend({ review_months: z.number().nullable() }), "POST", "/data/tools/setup", {
    review_months: reviewMonths,
    by,
  });

export const addAccount = (toolId: string, input: Fields, by: Staff, attempt: string) =>
  dataAsk(accountAnswer, "POST", `/data/tools/${id(toolId)}/accounts`, { ...input, by, attempt });

export const updateAccount = (accountId: string, input: Fields, by: Staff) =>
  dataAsk(accountAnswer, "POST", `/data/tools/accounts/${id(accountId)}/update`, {
    ...input,
    by,
  });

export const closeAccount = (
  accountId: string,
  input: { closed_on?: string; note?: string; undo?: true },
  by: Staff,
) =>
  dataAsk(accountAnswer, "POST", `/data/tools/accounts/${id(accountId)}/close`, { ...input, by });

/** OWNER-ONLY: the answer is the account's id and whether it is linked, nothing from the ledger. */
export const linkAccount = (accountId: string, personId: string | null, by: Staff) =>
  dataAsk(
    ok.extend({ account_id: z.string(), linked: z.boolean() }),
    "POST",
    `/data/tools/accounts/${id(accountId)}/link`,
    { person_id: personId, owner: true, by },
  );

export const keepSubprocessors = (by: Staff) =>
  dataAsk(
    ok.extend({ file: z.object({ file_id: z.string(), title: z.string(), versions: z.number() }) }),
    "POST",
    "/data/tools/subprocessors/keep",
    { by },
  );
