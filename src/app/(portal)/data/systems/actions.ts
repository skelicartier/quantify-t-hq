"use server";

import { attemptOf, copyFrom, idOf, isState } from "@/components/data/meetings/form-values";
import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/tools";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import { gateOwner } from "@/lib/data/owner";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * The writes of Systems › Tools and Accounts (ws-notes/security/spec.md §6.8): add or edit a
 * tool, its sub-processor block and its vendor, record a look, retire or bring back; add,
 * edit, close or reopen an account; keep the sub-processor list in Files; and, for the Owner
 * only (`gateOwner`), link an account to a person in the people ledger. Each: the gate, one
 * call to the service, the pages refreshed, and a sentence.
 */

const BASE = "/data/systems";
const NOT_HERE: ActionState = { status: "error", message: "That is not here." };

const TOOL_FIELDS = [
  "name",
  "what",
  "category",
  "status",
  "business_owner",
  "admins",
  "plan",
  "seats",
  "currency",
  "billing",
  "renews_on",
  "notice_days",
  "auto_renews",
  "key_date",
  "sign_in",
  "sso_with",
  "mfa",
  "data_location",
  "exit",
  "notes",
] as const;

function toolFieldsOf(formData: FormData): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const name of TOOL_FIELDS)
    if (formData.has(name)) input[name] = fieldValue(formData, name, 2000);
  if (formData.has("amount")) input.amount_minor = fieldValue(formData, "amount", 20);
  if (formData.has("critical_given")) input.critical = formData.has("critical");
  if (formData.has("holds_given"))
    input.holds = formData
      .getAll("holds")
      .map((value) => String(value))
      .slice(0, 10);
  return input;
}

const ACCOUNT_FIELDS = ["holder", "kind", "role", "mfa", "critical", "opened_on", "notes"] as const;

function accountFieldsOf(formData: FormData): Record<string, string> {
  const input: Record<string, string> = {};
  for (const name of ACCOUNT_FIELDS)
    if (formData.has(name)) input[name] = fieldValue(formData, name, 2000);
  return input;
}

function refresh(toolId?: string): void {
  refreshData(BASE, `${BASE}/accounts`, ...(toolId ? [`${BASE}/tools/${toolId}`] : []));
}

/** The gate, one call, a refresh and a sentence: every write here has that shape. */
async function act(
  formData: FormData,
  path: string,
  call: (by: ReturnType<typeof staffOf>) => Promise<unknown>,
  said: string,
  toolId?: string,
): Promise<ActionState> {
  const context = await gate(formData, path);
  if (refused(context)) return context;
  try {
    await call(staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refresh(toolId);
  return sent(said);
}

const toolPath = (toolId: string) => `${BASE}/tools/${toolId}`;

export async function addToolAction(_previous: ActionState, formData: FormData) {
  return act(
    formData,
    BASE,
    (by) => api.addTool(toolFieldsOf(formData), {}, by, attemptOf(formData)),
    "Added.",
  );
}

export async function updateToolAction(_previous: ActionState, formData: FormData) {
  const toolId = idOf(formData, "tool_id");
  if (!toolId) return NOT_HERE;
  return act(
    formData,
    toolPath(toolId),
    (by) => api.updateTool(toolId, toolFieldsOf(formData), {}, by),
    "Saved.",
    toolId,
  );
}

/** Marks it a sub-processor (or edits the block), with the agreement's copy when one is given. */
export async function subprocessorAction(_previous: ActionState, formData: FormData) {
  const toolId = idOf(formData, "tool_id");
  if (!toolId) return NOT_HERE;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  return act(
    formData,
    toolPath(toolId),
    (by) =>
      api.updateTool(
        toolId,
        {
          legal_name: fieldValue(formData, "legal_name", 200),
          subprocessor: {
            purpose: fieldValue(formData, "purpose", 300),
            locations: fieldValue(formData, "locations", 200),
            dpa_signed_on: fieldValue(formData, "dpa_signed_on", 10),
            since: fieldValue(formData, "since", 10),
          },
        },
        copy,
        by,
      ),
    "Saved.",
    toolId,
  );
}

export async function notSubprocessorAction(_previous: ActionState, formData: FormData) {
  const toolId = idOf(formData, "tool_id");
  if (!toolId) return NOT_HERE;
  return act(
    formData,
    toolPath(toolId),
    (by) => api.updateTool(toolId, { subprocessor: null }, {}, by),
    "No longer a sub-processor.",
    toolId,
  );
}

export async function vendorAction(_previous: ActionState, formData: FormData) {
  const toolId = idOf(formData, "tool_id");
  if (!toolId) return NOT_HERE;
  return act(
    formData,
    toolPath(toolId),
    (by) => api.updateTool(toolId, { vendor_id: idOf(formData, "vendor_id") || null }, {}, by),
    "Saved.",
    toolId,
  );
}

export async function reviewToolAction(_previous: ActionState, formData: FormData) {
  const toolId = idOf(formData, "tool_id");
  if (!toolId) return NOT_HERE;
  return act(
    formData,
    toolPath(toolId),
    (by) =>
      api.reviewTool(
        toolId,
        {
          on: fieldValue(formData, "on", 10),
          by_name: fieldValue(formData, "by_name", 120),
          note: fieldValue(formData, "note", 500),
        },
        by,
      ),
    "Recorded.",
    toolId,
  );
}

export async function retireToolAction(_previous: ActionState, formData: FormData) {
  const toolId = idOf(formData, "tool_id");
  if (!toolId) return NOT_HERE;
  const undo = fieldValue(formData, "undo", 4) === "1";
  return act(
    formData,
    toolPath(toolId),
    (by) =>
      api.retireTool(
        toolId,
        undo
          ? { undo: true }
          : { on: fieldValue(formData, "on", 10), why: fieldValue(formData, "why", 300) },
        by,
      ),
    undo ? "Back in use." : "Retired.",
    toolId,
  );
}

export async function setupAction(_previous: ActionState, formData: FormData) {
  return act(
    formData,
    BASE,
    (by) => api.saveToolsSetup(fieldValue(formData, "review_months", 4), by),
    "Saved.",
  );
}

export async function keepSubprocessorsAction(_previous: ActionState, formData: FormData) {
  return act(formData, BASE, (by) => api.keepSubprocessors(by), "Kept in Files.");
}

export async function addAccountAction(_previous: ActionState, formData: FormData) {
  const toolId = idOf(formData, "tool_id");
  if (!toolId) return NOT_HERE;
  return act(
    formData,
    toolPath(toolId),
    (by) => api.addAccount(toolId, accountFieldsOf(formData), by, attemptOf(formData)),
    "Added.",
    toolId,
  );
}

export async function updateAccountAction(_previous: ActionState, formData: FormData) {
  const accountId = idOf(formData, "account_id");
  const toolId = idOf(formData, "tool_id");
  if (!accountId) return NOT_HERE;
  return act(
    formData,
    `${BASE}/accounts`,
    (by) => api.updateAccount(accountId, accountFieldsOf(formData), by),
    "Saved.",
    toolId || undefined,
  );
}

export async function closeAccountAction(_previous: ActionState, formData: FormData) {
  const accountId = idOf(formData, "account_id");
  const toolId = idOf(formData, "tool_id");
  if (!accountId) return NOT_HERE;
  const undo = fieldValue(formData, "undo", 4) === "1";
  return act(
    formData,
    `${BASE}/accounts`,
    (by) =>
      api.closeAccount(
        accountId,
        undo
          ? { undo: true }
          : {
              closed_on: fieldValue(formData, "closed_on", 10),
              note: fieldValue(formData, "note", 300),
            },
        by,
      ),
    undo ? "Reopened." : "Closed.",
    toolId || undefined,
  );
}

/** OWNER-ONLY: `gateOwner` refuses an Admin before anything is sent. */
export async function linkAccountAction(_previous: ActionState, formData: FormData) {
  const accountId = idOf(formData, "account_id");
  const toolId = idOf(formData, "tool_id");
  if (!accountId) return NOT_HERE;
  const context = await gateOwner(formData, `${BASE}/accounts`);
  if (refused(context)) return context;
  const personId = idOf(formData, "person_id");
  try {
    await api.linkAccount(accountId, personId || null, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refresh(toolId || undefined);
  const back = fieldValue(formData, "person_page", 64);
  if (/^[A-Za-z0-9-]{1,64}$/.test(back)) refreshData(`/data/people/${back}`);
  return sent(personId ? "Linked." : "Unlinked.");
}
