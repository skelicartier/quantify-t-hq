"use server";

import { revalidatePath } from "next/cache";

import { hasCapability, requireStaff } from "@/lib/access/core";
import * as crmApi from "@/lib/api/crm";
import * as dealsApi from "@/lib/api/deals";
import { fieldValue } from "@/lib/auth/forms";
import { sanitizeNextPath } from "@/lib/auth/route-policy";
import { crmRefusal } from "@/lib/crm/refusal";
import {
  PUT_BACK_FIELDS,
  canPutBack,
  isPutBackKind,
  putBackValue,
  stillAsChanged,
} from "@/lib/crm/put-back";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

/** The record as it stands now, read fresh: the change is put back only over its own value. */
async function currentRecord(
  token: string,
  kind: "company" | "person" | "lead" | "deal",
  id: string,
): Promise<Record<string, unknown>> {
  if (kind === "company") return (await crmApi.readCompany(token, id)).company;
  if (kind === "person") return (await crmApi.readPerson(token, id)).person;
  if (kind === "lead") return (await crmApi.readLead(token, id)).lead;
  return (await dealsApi.readDeal(token, id)).deal;
}

async function write(
  token: string,
  kind: "company" | "person" | "lead" | "deal",
  id: string,
  input: Record<string, unknown>,
) {
  if (kind === "company") return crmApi.updateCompany(token, id, input);
  if (kind === "person") return crmApi.updatePerson(token, id, input);
  if (kind === "lead") return crmApi.updateLead(token, id, input);
  return dealsApi.updateDeal(token, id, input);
}

/**
 * Put a field back to what it was before a change in the record's History: through the
 * record's own update, so the service checks it as any edit and the History gains the
 * change back. Refused when the value has changed again since, so a newer edit is never
 * overwritten unseen.
 */
export async function putBackAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const returnPath = sanitizeNextPath(fieldValue(formData, "return_path", 200));
  const context = await requireStaff(returnPath);
  const kind = fieldValue(formData, "kind", 12);
  const id = fieldValue(formData, "record_id", 64);
  const field = fieldValue(formData, "field", 40);
  const from = fieldValue(formData, "from", 220);
  const to = fieldValue(formData, "to", 220);
  if (!isPutBackKind(kind) || !canPutBack(kind, field, from)) {
    return { status: "error", message: "That change cannot be put back from here." };
  }
  if (!hasCapability(context, kind === "deal" ? "deals:write" : "crm:write")) {
    return { status: "error", message: "Your role cannot change this record." };
  }
  const type = PUT_BACK_FIELDS[kind][field]!;
  try {
    const record = await currentRecord(context.token, kind, id);
    if (!stillAsChanged(type, record[field], to, field)) {
      return {
        status: "error",
        message:
          "It has changed since this change was made, so it is not put back. Edit it by hand.",
      };
    }
    await write(context.token, kind, id, { [field]: putBackValue(type, from) });
  } catch (error) {
    return crmRefusal(error);
  }
  // The record's page, whichever tab it was opened on.
  revalidatePath(returnPath.split("?")[0] ?? returnPath);
  return { status: "sent", message: "Put back.", sentAt: Date.now() };
}
