import "server-only";

import { fieldValue } from "@/lib/auth/forms";
import type { CopyInput } from "@/lib/data/api/meetings";
import { dayValue } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * What the registers' forms read from a submitted form (meetings, members, agreements):
 * an id from a hidden field, a typed day, the attempt, a checkbox, and a copy chosen from
 * Files or attached. Not a `"use server"` module, so nothing here can be called from a
 * browser; each area's `actions.ts` imports it.
 */

const ROUTE_ID = /^[A-Za-z0-9-]{1,64}$/;
/** A copy goes to the service as base64 in one request: a third bigger on the way. */
export const MAX_COPY_BYTES = 3 * 1024 * 1024;

/** "Add someone else" on "Record how it went": the rows the form offers. */
export const OTHER_ROWS = 4;

export const NOT_A_DAY: ActionState = { status: "error", message: "That is not a day." };

export function idOf(formData: FormData, name: string): string {
  const value = fieldValue(formData, name, 64);
  return ROUTE_ID.test(value) ? value : "";
}

/** Typed into a date field: a day, "" when left blank, or null when it is not a day. */
export function typedDay(formData: FormData, name: string): string | null {
  const value = fieldValue(formData, name, 10).trim();
  if (!value) return "";
  return dayValue(value) || null;
}

export const attemptOf = (formData: FormData): string =>
  fieldValue(formData, "attempt", 64) || crypto.randomUUID();

export const ticked = (formData: FormData, name: string): boolean =>
  formData.get(name) === "on" || formData.get(name) === "true";

/** Whether a reader gave back a refusal rather than values. */
export const isState = (value: object): value is ActionState =>
  "status" in value && "message" in value;

/**
 * The copy a form carries: a file chosen from Files (`file_id`), else a file attached
 * (`file`, at most 3 MB), else none.
 */
export async function copyFrom(formData: FormData): Promise<CopyInput | ActionState> {
  const fileId = idOf(formData, "file_id");
  if (fileId) return { file_id: fileId };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return {};
  if (file.size > MAX_COPY_BYTES)
    return {
      status: "error",
      message: "That copy is over 3 MB. Put it in Files, then choose it from there.",
    };
  const bytes = Buffer.from(await file.arrayBuffer());
  return { name: file.name.slice(0, 200), content: bytes.toString("base64") };
}

/** "Recorded." with the service's warnings after it, each a sentence. */
export const withWarnings = (said: string, warnings: readonly string[]): string =>
  [said, ...warnings].join(" ");
