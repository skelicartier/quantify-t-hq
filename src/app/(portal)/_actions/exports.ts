"use server";

import { requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readExportColumns, type ExportColumns } from "@/lib/api/reports";
import { EXPORT_KINDS, canExport, type ExportKind } from "@/lib/exports";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

export type ExportColumnsResult =
  { ok: true; columns: ExportColumns["columns"] } | { ok: false; message: string };

/**
 * The columns a file of this kind can carry, read when someone opens "Choose columns" —
 * not on every list render, since most exports take every column.
 */
export async function exportColumnsAction(kind: string): Promise<ExportColumnsResult> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/home");
  if (!(EXPORT_KINDS as readonly string[]).includes(kind))
    return { ok: false, message: "There is no export of that kind." };
  if (!canExport(context.me.capabilities, kind as ExportKind))
    return { ok: false, message: "Your role cannot export these records." };
  try {
    const listed = await readExportColumns(context.token, kind as ExportKind);
    return { ok: true, columns: listed.columns };
  } catch (error) {
    if (error instanceof HqApiUnavailableError || error instanceof HqApiRequestError)
      return {
        ok: false,
        message: "The columns could not be read just now. Every column will be exported.",
      };
    throw error;
  }
}
