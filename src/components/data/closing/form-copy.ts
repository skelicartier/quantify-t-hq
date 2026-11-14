import "server-only";

import { fieldValue } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * What pilots', diligence's and the closing's forms read besides plain text: a copy to keep
 * in Files (a chosen file, at most 3 MB, sent as base64 in one request, as the waitlist's
 * proof copy is), a checkbox, and an id. Not a `"use server"` module.
 */

const MAX_COPY_BYTES = 3 * 1024 * 1024;
const ROUTE_ID = /^[A-Za-z0-9-]{1,64}$/;
const INVESTOR_ID = /^[0-9a-f]{32}$/;

export const TOO_LARGE: ActionState = {
  status: "error",
  message: "That copy is over 3 MB. Put it in Files, then attach it from there.",
};

/** The file chosen in a form field, as the service takes it; null when none was chosen. */
export async function copyOf(
  formData: FormData,
  name: string,
): Promise<{ content: string; name: string } | null | ActionState> {
  const file = formData.get(name);
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_COPY_BYTES) return TOO_LARGE;
  const bytes = Buffer.from(await file.arrayBuffer());
  return { content: bytes.toString("base64"), name: file.name.slice(0, 200) };
}

export const isRefusal = (value: unknown): value is ActionState =>
  Boolean(value) && typeof value === "object" && "status" in (value as object);

export const checked = (formData: FormData, name: string): boolean =>
  fieldValue(formData, name, 8) === "on" || fieldValue(formData, name, 8) === "true";

export function routeIdOf(formData: FormData, name: string): string {
  const value = fieldValue(formData, name, 64);
  return ROUTE_ID.test(value) ? value : "";
}

export function investorIdOf(formData: FormData): string {
  const value = fieldValue(formData, "investor_id", 64);
  return INVESTOR_ID.test(value) ? value : "";
}

export const attemptOf = (formData: FormData): string =>
  fieldValue(formData, "attempt", 64) || crypto.randomUUID();
