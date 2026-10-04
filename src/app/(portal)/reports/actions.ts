"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { deleteView, readPreferences, readViews, saveView, setPreference } from "@/lib/api/views";
import { fieldValue } from "@/lib/auth/forms";
import { crmRefusal } from "@/lib/crm/refusal";
import type { ActionState } from "@/lib/forms/action-state";
import {
  REPORT_KIND_CAPABILITY,
  definitionQuery,
  isReportKind,
  parseDefinitionQuery,
  reportKindOfListKey,
  reportListKey,
} from "@/lib/reports/builder";
import {
  DASHBOARD_PREFERENCE,
  MAX_PINS,
  movePin,
  parsePins,
  serializePins,
  togglePin,
} from "@/lib/reports/pins";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

const SHARING = ["private", "team", "team_edits"] as const;

function refusedSave(error: unknown): ActionState {
  if (error instanceof HqApiRequestError && error.code === "malformed_request") {
    for (const key of ["name", "reason", "query"]) {
      if (key in error.details) return { status: "error", message: String(error.details[key]) };
    }
  }
  if (
    error instanceof HqApiRequestError &&
    error.status === 403 &&
    !error.details["sudo_required"]
  ) {
    return {
      status: "error",
      message: "Only the report's owner or an admin renames it or changes who it is shared with.",
    };
  }
  return crmRefusal(error);
}

/**
 * Save the report on screen: a new one under a name, or the one being changed. The
 * definition is read back through the report's own parser before it is stored, so
 * nothing but a report's parameters rides along.
 */
export async function saveReportAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/reports/builder");
  const kind = fieldValue(formData, "kind", 20);
  if (!isReportKind(kind)) return { status: "error", message: "Choose what the report counts." };
  if (!hasCapability(context, REPORT_KIND_CAPABILITY[kind])) {
    return { status: "error", message: "Your role does not read these records." };
  }
  const query = definitionQuery(parseDefinitionQuery(fieldValue(formData, "query", 800), kind));
  const reportId = fieldValue(formData, "report_id", 64);
  const name = fieldValue(formData, "name", 80).trim();
  const sharing = fieldValue(formData, "sharing", 16);
  if (formData.has("sharing") && !(SHARING as readonly string[]).includes(sharing)) {
    return { status: "error", message: "Choose who sees the report." };
  }
  let savedId = reportId;
  try {
    if (reportId) {
      const changes: Record<string, unknown> = { view_id: reportId, query };
      if (formData.has("name")) {
        if (!name) return { status: "error", message: "Name the report." };
        changes.name = name;
      }
      if (formData.has("sharing")) {
        changes.shared = sharing !== "private";
        changes.team_edits = sharing === "team_edits";
      }
      await saveView(context.token, changes);
    } else {
      if (!name) return { status: "error", message: "Name the report." };
      const saved = await saveView(context.token, {
        list_key: reportListKey(kind),
        name,
        query,
        shared: sharing === "team" || sharing === "team_edits",
        team_edits: sharing === "team_edits",
      });
      savedId = saved.view.view_id;
    }
  } catch (error) {
    return refusedSave(error);
  }
  revalidatePath("/reports/saved");
  revalidatePath("/reports/dashboard");
  redirect(`/reports/saved/${savedId}`);
}

async function currentPins(token: string): Promise<string[]> {
  const preferences = await readPreferences(token);
  return parsePins(preferences.preferences[DASHBOARD_PREFERENCE]);
}

/**
 * The pins whose reports this person can still open. A deleted or unshared report's pin
 * is dropped before anything moves, so Up and Down move past what is on screen and the
 * cap counts only reports that show.
 */
async function livePins(token: string): Promise<string[]> {
  const [pins, views] = await Promise.all([currentPins(token), readViews(token, "")]);
  const live = new Set(
    views.views
      .filter((view) => reportKindOfListKey(view.list_key) !== null)
      .map((view) => view.view_id.toLowerCase()),
  );
  return pins.filter((pin) => live.has(pin));
}

/** Delete a report: its owner's or an admin's. It leaves the deleter's dashboard too. */
export async function deleteReportAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/reports/saved");
  const reportId = fieldValue(formData, "report_id", 64);
  try {
    await deleteView(context.token, reportId);
  } catch (error) {
    return refusedSave(error);
  }
  try {
    const pins = await currentPins(context.token);
    if (pins.includes(reportId.toLowerCase())) {
      await setPreference(
        context.token,
        DASHBOARD_PREFERENCE,
        serializePins(pins.filter((pin) => pin !== reportId.toLowerCase())),
      );
    }
  } catch (error) {
    // The report is gone; a pin left behind stops showing on its own.
    if (!(error instanceof HqApiRequestError || error instanceof HqApiUnavailableError))
      throw error;
  }
  revalidatePath("/reports/saved");
  revalidatePath("/reports/dashboard");
  redirect("/reports/saved");
}

/** Pin a report to one's own dashboard, or take it off. */
export async function pinReportAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/reports/dashboard");
  const reportId = fieldValue(formData, "report_id", 64);
  try {
    const next = togglePin(await livePins(context.token), reportId);
    if (next === null) {
      return {
        status: "error",
        message: `A dashboard holds ${MAX_PINS} reports. Take one off first.`,
      };
    }
    await setPreference(context.token, DASHBOARD_PREFERENCE, serializePins(next));
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/reports/dashboard");
  revalidatePath("/reports/saved");
  revalidatePath(`/reports/saved/${reportId}`);
  return { status: "sent", message: null, sentAt: Date.now() };
}

/** Move a pinned report one place up or down the dashboard. */
export async function movePinAction(formData: FormData): Promise<void> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/reports/dashboard");
  const reportId = fieldValue(formData, "report_id", 64);
  const direction = fieldValue(formData, "direction", 8) === "up" ? "up" : "down";
  const pins = await livePins(context.token);
  await setPreference(
    context.token,
    DASHBOARD_PREFERENCE,
    serializePins(movePin(pins, reportId, direction)),
  );
  revalidatePath("/reports/dashboard");
}
