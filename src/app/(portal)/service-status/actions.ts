"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError } from "@/lib/api/core";
import * as statusApi from "@/lib/api/status";
import { fieldValue, refusalMessage } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { typedInstant } from "@/lib/time-zone";

const NOT_DESK: ActionState = {
  status: "error",
  message: "The status page is run by the desk: Support, Admins and Owners.",
};

function refusal(error: unknown): ActionState {
  if (error instanceof HqApiRequestError) {
    const detail = Object.values(error.details).find((value) => typeof value === "string");
    if (error.code === "malformed_request" && typeof detail === "string")
      return { status: "error", message: `${detail.charAt(0).toUpperCase()}${detail.slice(1)}.` };
  }
  return { status: "error", message: refusalMessage(error) };
}

function sent(message: string): ActionState {
  return { status: "sent", message, sentAt: Date.now() };
}

/** The components named in the form with their impact: `impact:<id>` fields. */
function impacts(formData: FormData): Array<{ component_id: string; impact: string }> {
  const found: Array<{ component_id: string; impact: string }> = [];
  for (const [name, value] of formData.entries()) {
    if (!name.startsWith("impact:") || typeof value !== "string" || !value) continue;
    found.push({ component_id: name.slice("impact:".length, 80), impact: value.slice(0, 10) });
  }
  return found;
}

/** A time typed into a form, read in the person's zone and sent as the instant it means. */
function moment(formData: FormData, name: string, zone: string): string {
  return typedInstant(fieldValue(formData, name, 40), zone);
}

function refresh() {
  revalidatePath("/service-status");
  revalidatePath("/status");
}

export async function openIncidentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/service-status");
  if (!hasCapability(context, "tickets:manage")) return NOT_DESK;
  let incidentId = "";
  try {
    incidentId = (
      await statusApi.openStatusIncident(context.token, {
        title: fieldValue(formData, "title", 200).trim(),
        status: fieldValue(formData, "status", 14),
        body: fieldValue(formData, "body", 2000).trim(),
        components: impacts(formData),
        notify: formData.get("notify") === "on",
      })
    ).incident_id;
  } catch (error) {
    return refusal(error);
  }
  refresh();
  redirect(`/service-status/incidents/${incidentId}`);
}

export async function postUpdateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const incidentId = fieldValue(formData, "incident_id", 64);
  const context = await requireStaff(`/service-status/incidents/${incidentId}`);
  if (!hasCapability(context, "tickets:manage")) return NOT_DESK;
  const status = fieldValue(formData, "status", 14);
  const body: Record<string, unknown> = {
    status,
    body: fieldValue(formData, "body", 2000).trim(),
    notify: formData.get("notify") === "on",
  };
  if (status !== "resolved") body.components = impacts(formData);
  let done: Awaited<ReturnType<typeof statusApi.postStatusUpdate>>;
  try {
    done = await statusApi.postStatusUpdate(context.token, incidentId, body);
  } catch (error) {
    return refusal(error);
  }
  refresh();
  revalidatePath(`/service-status/incidents/${incidentId}`);
  return sent(
    `Posted${done.status === "resolved" ? " and resolved" : ""}.` +
      (done.mailed ? ` Mailed to ${done.mailed} subscriber${done.mailed === 1 ? "" : "s"}.` : ""),
  );
}

export async function scheduleMaintenanceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/service-status");
  if (!hasCapability(context, "tickets:manage")) return NOT_DESK;
  try {
    await statusApi.scheduleMaintenance(context.token, {
      title: fieldValue(formData, "title", 200).trim(),
      body: fieldValue(formData, "body", 2000).trim(),
      starts_at: moment(formData, "starts_at", context.me.time_zone),
      ends_at: moment(formData, "ends_at", context.me.time_zone),
      component_ids: formData.getAll("component_ids").map(String).slice(0, 50),
      notify: formData.get("notify") === "on",
    });
  } catch (error) {
    return refusal(error);
  }
  refresh();
  return sent("Scheduled. It starts and ends itself.");
}

export async function cancelMaintenanceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/service-status");
  if (!hasCapability(context, "tickets:manage")) return NOT_DESK;
  try {
    await statusApi.cancelMaintenance(context.token, fieldValue(formData, "maintenance_id", 64));
  } catch (error) {
    return refusal(error);
  }
  refresh();
  return sent("Cancelled.");
}

export async function addComponentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/service-status");
  if (!hasCapability(context, "tickets:manage")) return NOT_DESK;
  try {
    await statusApi.addComponent(context.token, {
      name: fieldValue(formData, "name", 80).trim(),
      description: fieldValue(formData, "description", 400).trim(),
    });
  } catch (error) {
    return refusal(error);
  }
  refresh();
  return sent("Added to the page.");
}
