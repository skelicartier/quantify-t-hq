"use server";

import { revalidatePath } from "next/cache";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { COMPANY_FIELDS, updateCompany, type CompanyField } from "@/lib/api/company";
import { COMPANY_FIELD_LABELS as FIELD_LABELS } from "@/lib/company-labels";
import { HqApiRequestError } from "@/lib/api/core";
import { fieldValue, refusalMessage } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

const LIMITS: Partial<Record<CompanyField, number>> = {
  registered_address: 400,
  operating_address: 400,
  document_note: 300,
  email: 254,
};

/** The company's particulars: an admin's change, after a fresh code; every field before and after is audited. */
export async function updateCompanyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/company");
  if (!hasCapability(context, "hq:admin")) {
    return { status: "error", message: "The company's particulars are kept by Owners and Admins." };
  }
  const body: Partial<Record<CompanyField, string>> = {};
  for (const field of COMPANY_FIELDS) {
    if (formData.has(field)) body[field] = fieldValue(formData, field, LIMITS[field] ?? 200);
  }
  try {
    await updateCompany(context.token, body);
  } catch (error) {
    if (error instanceof HqApiRequestError) {
      if (error.details["sudo_required"] === true) {
        return {
          status: "error",
          message: "Confirm it's you with a fresh code first, then save again.",
        };
      }
      if (error.details["body"] === "nothing to change") {
        return { status: "error", message: "Nothing changed." };
      }
      const problems = Object.entries(error.details)
        .filter(
          (entry): entry is [CompanyField, string] =>
            typeof entry[1] === "string" && entry[0] in FIELD_LABELS,
        )
        .map(([field, reason]) => `${FIELD_LABELS[field]}: ${reason}.`);
      if (problems.length > 0) return { status: "error", message: problems.join(" ") };
    }
    return { status: "error", message: refusalMessage(error) };
  }
  // Every page prints the letterhead.
  revalidatePath("/", "layout");
  return {
    status: "sent",
    message: "Saved. Every document from now on carries it.",
    sentAt: Date.now(),
  };
}
