"use server";

import type { StaffContext } from "@/lib/access/core";
import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/statements";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import { STATEMENTS_OWNER_LINE, countOf } from "@/lib/data/labels-statements";
import { isDataOwner } from "@/lib/data/owner";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * Statements' writes (ws-notes/duties/spec.md §9.4, §9.11). Every one is `gate()` and then
 * the role, refused for anyone but the Owner with this page's own line (not the people
 * ledger's), and passes the Owner flag on from the role and nothing else. Nothing here
 * sends, files or pays: a match records a payment in Money from the bank's own line.
 */

const BASE = "/data/money/statements";
const MAX_FILE_BYTES = 3 * 1024 * 1024;

const attemptOf = (formData: FormData): string =>
  fieldValue(formData, "attempt", 64) || crypto.randomUUID();

/** `gate()`, then the role: an Admin's action is refused with the Statements line. */
async function ownerGate(formData: FormData): Promise<StaffContext | ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  if (!isDataOwner(context)) return { status: "error", message: STATEMENTS_OWNER_LINE };
  return context;
}

function refreshStatements(accountId?: string): void {
  refreshData(
    BASE,
    ...(accountId ? [`${BASE}/${accountId}`] : []),
    "/data/numbers",
    "/data/numbers/mis",
    "/data/money/close",
  );
}

/** A file chosen in the form, as base64 with its name; an error state when it cannot go. */
async function fileOf(
  formData: FormData,
  missing: string,
): Promise<{ name: string; content: string } | ActionState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: missing };
  if (file.size > MAX_FILE_BYTES)
    return {
      status: "error",
      message: "That file is over 3 MB. Import a month or a quarter at a time.",
    };
  const bytes = Buffer.from(await file.arrayBuffer());
  return { name: file.name.slice(0, 200), content: bytes.toString("base64") };
}

const isState = (value: object): value is ActionState => "status" in value;

/** The columns he chose in the preview, or none when the form carries no mapping. */
function mappingOf(formData: FormData): api.StatementMapping | undefined {
  const delimiter = fieldValue(formData, "delimiter", 2);
  if (!delimiter) return undefined;
  const number = (name: string) => {
    const value = fieldValue(formData, name, 4);
    return value === "" ? null : Number(value);
  };
  const style = fieldValue(formData, "amount_style", 20);
  const amount: api.StatementMapping["amount"] =
    style === "two_columns"
      ? { style, debit: number("debit_col") ?? -1, credit: number("credit_col") ?? -1 }
      : style === "marker"
        ? { style, column: number("amount_col") ?? -1, marker: number("marker_col") ?? -1 }
        : { style: "signed", column: number("amount_col") ?? -1 };
  return {
    delimiter: (delimiter === "tab" ? "\t" : delimiter) as api.StatementMapping["delimiter"],
    header_row: number("header_row") ?? 0,
    date: number("date_col") ?? -1,
    date_format: fieldValue(formData, "date_format", 20),
    narration: number("narration_col") ?? -1,
    reference: number("reference_col"),
    amount,
    balance: number("balance_col"),
  };
}

export async function addAccountAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await ownerGate(formData);
  if (refused(context)) return context;
  try {
    await api.addAccount(
      true,
      {
        name: fieldValue(formData, "name", 120),
        kind: fieldValue(formData, "kind", 10),
        bank: fieldValue(formData, "bank", 120),
        last4: fieldValue(formData, "last4", 40),
        currency: fieldValue(formData, "currency", 3),
        opening_on: fieldValue(formData, "opening_on", 10),
        opening_balance: fieldValue(formData, "opening_balance", 40),
      },
      staffOf(context),
      attemptOf(formData),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshStatements();
  return sent("Added the account. Import its statements next.");
}

export async function closeAccountAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await ownerGate(formData);
  if (refused(context)) return context;
  const accountId = fieldValue(formData, "account_id", 64);
  try {
    await api.closeAccount(
      true,
      accountId,
      fieldValue(formData, "closed_on", 10),
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshStatements(accountId);
  return sent("Marked closed. Its statements stay; it no longer counts in cash.");
}

/** Step 1, and any read again with other columns: the preview travels back as JSON. */
export async function previewImportAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await ownerGate(formData);
  if (refused(context)) return context;
  const accountId = fieldValue(formData, "account_id", 64);
  if (!accountId) return { status: "error", message: "Choose the account it is for." };
  const importId = fieldValue(formData, "import_id", 64);
  let input: Parameters<typeof api.previewImport>[2];
  if (importId) {
    const mapping = mappingOf(formData);
    input = { import_id: importId, ...(mapping ? { mapping } : {}) };
  } else {
    const file = await fileOf(formData, "Choose the statement's file.");
    if (isState(file)) return file;
    input = file;
  }
  try {
    const { preview } = await api.previewImport(true, accountId, input, staffOf(context));
    return {
      status: "idle",
      message: null,
      detail: JSON.stringify({ account_id: accountId, preview }),
    };
  } catch (error) {
    return refusal(error);
  }
}

/** Step 2: the lines go in. */
export async function importStatementAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await ownerGate(formData);
  if (refused(context)) return context;
  const accountId = fieldValue(formData, "account_id", 64);
  const mapping = mappingOf(formData);
  const opening = fieldValue(formData, "opening_balance", 40);
  let said: string;
  try {
    const made = await api.importStatement(
      true,
      accountId,
      {
        import_id: fieldValue(formData, "import_id", 64),
        from: fieldValue(formData, "from", 10),
        to: fieldValue(formData, "to", 10),
        ...(opening ? { opening_minor: opening } : {}),
        ...(mapping ? { mapping } : {}),
      },
      staffOf(context),
      attemptOf(formData),
    );
    said =
      made.skipped > 0
        ? `Imported ${countOf(made.added, "line")}; ${countOf(made.skipped, "line")} ${made.skipped === 1 ? "was" : "were"} already here.`
        : `Imported ${countOf(made.added, "line")}.`;
  } catch (error) {
    return refusal(error);
  }
  refreshStatements(accountId);
  return sent(said);
}

export async function withdrawStatementAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await ownerGate(formData);
  if (refused(context)) return context;
  const accountId = fieldValue(formData, "account_id", 64);
  try {
    await api.withdrawStatement(
      true,
      fieldValue(formData, "statement_id", 64),
      fieldValue(formData, "why", 300),
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshStatements(accountId);
  return sent("Withdrawn. Its lines stay, marked, and count nowhere.");
}

export async function addCopyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await ownerGate(formData);
  if (refused(context)) return context;
  const file = await fileOf(formData, "Choose the bank's PDF.");
  if (isState(file)) return file;
  try {
    await api.addStatementCopy(
      true,
      fieldValue(formData, "statement_id", 64),
      file,
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshStatements();
  return sent("Kept the bank's PDF beside the statement.");
}

export async function lineCategoryAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await ownerGate(formData);
  if (refused(context)) return context;
  try {
    await api.setLineCategory(
      true,
      fieldValue(formData, "line_id", 64),
      fieldValue(formData, "category_id", 64),
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshStatements(fieldValue(formData, "account_id", 64));
  return sent("Saved.");
}

export async function matchLineAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await ownerGate(formData);
  if (refused(context)) return context;
  const amount = fieldValue(formData, "amount", 40);
  try {
    await api.matchLine(
      true,
      fieldValue(formData, "line_id", 64),
      { ref: fieldValue(formData, "ref", 200), ...(amount ? { amount_minor: amount } : {}) },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshStatements(fieldValue(formData, "account_id", 64));
  return sent("Matched.");
}

export async function unmatchLineAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await ownerGate(formData);
  if (refused(context)) return context;
  try {
    await api.unmatchLine(
      true,
      fieldValue(formData, "line_id", 64),
      fieldValue(formData, "why", 300),
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshStatements(fieldValue(formData, "account_id", 64));
  return sent("Taken back.");
}

export async function acceptSureAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await ownerGate(formData);
  if (refused(context)) return context;
  const accountId = fieldValue(formData, "account_id", 64);
  let said: string;
  try {
    said = (
      await api.acceptSure(true, accountId, fieldValue(formData, "month", 7), staffOf(context))
    ).words;
  } catch (error) {
    return refusal(error);
  }
  refreshStatements(accountId);
  return sent(said);
}
