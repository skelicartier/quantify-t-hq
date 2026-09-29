"use server";

import { revalidatePath } from "next/cache";

import { hasCapability, requireStaff, type StaffContext } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCompany, readLead, updateCompany, updateLead } from "@/lib/api/crm";
import { readDeal, updateDeal } from "@/lib/api/deals";
import { RENEWAL_STATUSES, readContract, setRenewalForecast } from "@/lib/api/revenue";
import { fieldValue } from "@/lib/auth/forms";
import { LIFECYCLES } from "@/lib/crm/vocabulary";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

/**
 * One change applied to many selected rows: the owner of these companies, the
 * lifecycle of those. Each row goes through the same update route a single edit would,
 * so the service validates and audits every one; the bar reports how many took and how
 * many did not. Capped at two hundred rows a go.
 */

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type BulkSpec = {
  capability: string;
  path: string;
  fields: Record<
    string,
    {
      valid: (value: string) => boolean;
      apply: (context: StaffContext, id: string, value: string) => Promise<unknown>;
      /** The value before the change, so the bar can offer to put it back. */
      before: (context: StaffContext, id: string) => Promise<string>;
    }
  >;
};

type UndoStep = { id: string; from: string };
type UndoPlan = { kind: string; field: string; steps: UndoStep[] };

const owner = {
  valid: (value: string) => value === "" || GUID.test(value),
};

const BULK: Record<string, BulkSpec> = {
  companies: {
    capability: "crm:write",
    path: "/companies",
    fields: {
      owner_staff_id: {
        ...owner,
        apply: (context, id, value) => updateCompany(context.token, id, { owner_staff_id: value }),
        before: async (context, id) =>
          (await readCompany(context.token, id)).company.owner_staff_id,
      },
      lifecycle: {
        valid: (value) => (LIFECYCLES as readonly string[]).includes(value),
        apply: (context, id, value) => updateCompany(context.token, id, { lifecycle: value }),
        before: async (context, id) => (await readCompany(context.token, id)).company.lifecycle,
      },
    },
  },
  leads: {
    capability: "crm:write",
    path: "/leads",
    fields: {
      owner_staff_id: {
        ...owner,
        apply: (context, id, value) => updateLead(context.token, id, { owner_staff_id: value }),
        before: async (context, id) => (await readLead(context.token, id)).lead.owner_staff_id,
      },
    },
  },
  deals: {
    capability: "deals:write",
    path: "/deals",
    fields: {
      owner_staff_id: {
        ...owner,
        apply: (context, id, value) => updateDeal(context.token, id, { owner_staff_id: value }),
        before: async (context, id) => (await readDeal(context.token, id)).deal.owner_staff_id,
      },
    },
  },
  renewals: {
    capability: "revenue:write",
    path: "/revenue/renewals",
    fields: {
      status: {
        valid: (value) => value === "" || (RENEWAL_STATUSES as readonly string[]).includes(value),
        apply: (context, id, value) => setRenewalForecast(context.token, id, { status: value }),
        before: async (context, id) =>
          (await readContract(context.token, id)).contract.renewal.status ?? "",
      },
    },
  },
};

export async function bulkUpdateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const kind = fieldValue(formData, "kind", 20);
  const spec = BULK[kind];
  if (!spec) return { status: "error", message: "That list has no bulk changes." };
  const context = await requireStaff(spec.path);
  if (!hasCapability(context, spec.capability)) {
    return { status: "error", message: "Your role can read this list, not change it." };
  }
  const field = spec.fields[fieldValue(formData, "field", 40)];
  if (!field) return { status: "error", message: "That change is not offered here." };
  const value = fieldValue(formData, "value", 120).trim();
  if (!field.valid(value)) return { status: "error", message: "Choose a value from the list." };
  const ids = [
    ...new Set(
      fieldValue(formData, "ids", 12_000)
        .split(",")
        .map((id) => id.trim())
        .filter((id) => GUID.test(id) || /^[A-Za-z0-9_-]{4,64}$/.test(id)),
    ),
  ].slice(0, 200);
  if (ids.length === 0) return { status: "error", message: "Nothing is selected." };

  let done = 0;
  let refused = 0;
  const steps: UndoStep[] = [];
  for (const id of ids) {
    try {
      // The value before, read first, so the change can be put back by the same route.
      let from = "";
      try {
        from = await field.before(context, id);
      } catch (error) {
        if (!(error instanceof HqApiRequestError || error instanceof HqApiUnavailableError))
          throw error;
      }
      await field.apply(context, id, value);
      steps.push({ id, from });
      done += 1;
    } catch (error) {
      if (error instanceof HqApiRequestError || error instanceof HqApiUnavailableError) {
        refused += 1;
      } else {
        throw error;
      }
    }
  }
  revalidatePath(spec.path);
  if (done === 0) {
    return { status: "error", message: `None of the ${ids.length} changed; the service refused.` };
  }
  const plan: UndoPlan = { kind, field: fieldValue(formData, "field", 40), steps };
  return {
    status: "sent",
    message:
      refused > 0
        ? `${done} changed, ${refused} refused by the service.`
        : `${done} ${done === 1 ? "row" : "rows"} changed.`,
    sentAt: Date.now(),
    detail: JSON.stringify(plan),
  };
}

/** Put a bulk change back: every row gets its previous value through the same route. */
export async function bulkUndoAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  let plan: UndoPlan;
  try {
    const parsed: unknown = JSON.parse(fieldValue(formData, "undo_json", 60_000) || "null");
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as UndoPlan).kind !== "string" ||
      typeof (parsed as UndoPlan).field !== "string" ||
      !Array.isArray((parsed as UndoPlan).steps)
    )
      throw new Error("not a plan");
    plan = parsed as UndoPlan;
  } catch {
    return { status: "error", message: "Nothing to undo." };
  }
  const spec = BULK[plan.kind];
  const field = spec?.fields[plan.field];
  if (!spec || !field) return { status: "error", message: "That change cannot be undone here." };
  const context = await requireStaff(spec.path);
  if (!hasCapability(context, spec.capability)) {
    return { status: "error", message: "Your role can read this list, not change it." };
  }
  let done = 0;
  let refused = 0;
  for (const step of plan.steps.slice(0, 200)) {
    if (typeof step.id !== "string" || typeof step.from !== "string" || !field.valid(step.from)) {
      refused += 1;
      continue;
    }
    try {
      await field.apply(context, step.id, step.from);
      done += 1;
    } catch (error) {
      if (error instanceof HqApiRequestError || error instanceof HqApiUnavailableError)
        refused += 1;
      else throw error;
    }
  }
  revalidatePath(spec.path);
  if (done === 0) return { status: "error", message: "Nothing could be put back." };
  return {
    status: "sent",
    message: refused > 0 ? `${done} put back, ${refused} refused.` : `${done} put back.`,
    sentAt: Date.now(),
  };
}
