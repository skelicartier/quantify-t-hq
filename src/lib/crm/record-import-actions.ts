import "server-only";

import { revalidatePath } from "next/cache";

import { hasCapability, requireStaff } from "@/lib/access/core";
import * as crmApi from "@/lib/api/crm";
import type { RecordImportKind } from "@/lib/api/crm";
import { fieldValue } from "@/lib/auth/forms";
import { crmRefusal } from "@/lib/crm/refusal";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * The work behind the companies and people import actions, which differ only in the
 * route they call. Each action checks its own origin first and passes the form here.
 */

const READ_ONLY: ActionState = {
  status: "error",
  message: "Your role reads the CRM without writing to it.",
};

const PAGE: Record<RecordImportKind, string> = {
  companies: "/companies/import",
  people: "/people/import",
};

function jsonField<T>(formData: FormData, name: string, limit: number): T | null {
  try {
    return JSON.parse(fieldValue(formData, name, limit)) as T;
  } catch {
    return null;
  }
}

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString("en-GB")} ${count === 1 ? one : many}`;
}

/** One part of a file: the service accounts for every row; the page adds the parts up. */
export async function sendImportPart(
  kind: RecordImportKind,
  formData: FormData,
): Promise<ActionState> {
  const context = await requireStaff(PAGE[kind]);
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const rows = jsonField<Record<string, unknown>[]>(formData, "rows_json", 4_000_000) ?? [];
  if (!Array.isArray(rows) || !rows.length) return { status: "error", message: "No rows to send." };
  const reason = fieldValue(formData, "reason", 400).trim();
  if (reason.length < 4) return { status: "error", message: "Say where the file came from." };
  const input: Record<string, unknown> = {
    rows,
    reason,
    label: fieldValue(formData, "label", 120),
    run_id: fieldValue(formData, "run_id", 64),
    update_existing: formData.get("update_existing") === "on",
    // The columns the file may replace; the service refuses any other name.
    overwrite: jsonField<string[]>(formData, "overwrite_json", 400) ?? [],
    // A rehearsal: the same accounting, nothing written.
    dry_run: formData.get("dry_run") === "on",
    // Rows left out here as repeats of earlier rows, so the file's line adds up to the file.
    repeats: Math.max(0, Math.min(1_000_000, Number(fieldValue(formData, "repeats", 8)) || 0)),
  };
  if (kind === "companies") input.default_owner = fieldValue(formData, "default_owner", 64);
  try {
    const result =
      kind === "companies"
        ? await crmApi.importCompanies(context.token, input)
        : await crmApi.importPeople(context.token, input);
    if (!result.dry_run) revalidatePath(kind === "companies" ? "/companies" : "/people");
    return { status: "sent", message: null, sentAt: Date.now(), detail: JSON.stringify(result) };
  } catch (error) {
    return crmRefusal(error);
  }
}

/** Take a file back: what nobody touched goes, the rest stays, and the answer says so. */
export async function takeBackImport(
  kind: RecordImportKind,
  formData: FormData,
): Promise<ActionState> {
  const context = await requireStaff(PAGE[kind]);
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const reason = fieldValue(formData, "reason", 400).trim();
  if (reason.length < 4) return { status: "error", message: "Say why it is being taken back." };
  const importId = fieldValue(formData, "import_id", 64);
  try {
    const result =
      kind === "companies"
        ? await crmApi.rollbackCompanyImport(context.token, importId, reason)
        : await crmApi.rollbackPeopleImport(context.token, importId, reason);
    revalidatePath(PAGE[kind]);
    revalidatePath(kind === "companies" ? "/companies" : "/people");
    const noun =
      kind === "companies" ? (["company", "companies"] as const) : (["person", "people"] as const);
    const parts = [`Removed ${plural(result.removed, noun[0], noun[1])}`];
    if (result.reverted) parts.push(`put back ${plural(result.reverted, "field", "fields")}`);
    const kept = [];
    if (result.kept_records)
      kept.push(`${plural(result.kept_records, noun[0], noun[1])} somebody had worked on`);
    if (result.kept_changes)
      kept.push(`${plural(result.kept_changes, "field", "fields")} changed since`);
    return {
      status: "sent",
      message: `${parts.join(" and ")}.${kept.length ? ` Kept ${kept.join(" and ")}.` : ""}`,
      sentAt: Date.now(),
    };
  } catch (error) {
    return crmRefusal(error);
  }
}
