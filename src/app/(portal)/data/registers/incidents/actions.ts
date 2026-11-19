"use server";

import { attemptOf, copyFrom, idOf, isState, ticked } from "@/components/data/meetings/form-values";
import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/incidents";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * The incident register's writes (ws-notes/duties/spec.md §6.3): logging an incident,
 * editing it, moving its status, recording the report to CERT-In (never sending it), why it
 * was not reportable, the Board's report, each customer and when they were told, and the
 * runbook for a kind. Each: the gate, one call to the service, the pages refreshed, and a
 * sentence. Days and minutes are India time as typed; the service reads them so.
 */

const BASE = "/data/registers/incidents";
const NO_INCIDENT: ActionState = { status: "error", message: "That incident is not here." };
const STATUSES = new Set<string>(api.incidentStatusSchema.options);

function refresh(incidentId = ""): void {
  refreshData("/data/registers", BASE, ...(incidentId ? [`${BASE}/${incidentId}`] : []));
}

function fieldsOf(formData: FormData, editing: boolean): api.IncidentInput {
  const input: api.IncidentInput = {
    title: fieldValue(formData, "title", 200),
    kind: fieldValue(formData, "kind", 40),
    severity: fieldValue(formData, "severity", 10),
    aware_day: fieldValue(formData, "aware_day", 10),
    aware_time: fieldValue(formData, "aware_time", 5),
    personal_data: ticked(formData, "personal_data"),
    systems: fieldValue(formData, "systems", 4000),
    actions: fieldValue(formData, "actions", 4000),
  };
  if (editing) {
    input.summary = fieldValue(formData, "summary", 4000);
    input.lessons = fieldValue(formData, "lessons", 4000);
    input.occurred_day = fieldValue(formData, "occurred_day", 10);
    input.occurred_time = fieldValue(formData, "occurred_time", 5);
  }
  return input;
}

export async function logIncidentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  let said = "Logged.";
  try {
    const { incident } = await api.logIncident(
      fieldsOf(formData, false),
      staffOf(context),
      attemptOf(formData),
    );
    const clock = incident.clock.cert_in;
    said =
      clock.state === "due" || clock.state === "overdue"
        ? `Logged as ${incident.reference}. Report to CERT-In by ${clock.report_by_words}.`
        : `Logged as ${incident.reference}.`;
  } catch (error) {
    return refusal(error);
  }
  refresh();
  return sent(said);
}

export async function updateIncidentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const incidentId = idOf(formData, "incident_id");
  const context = await gate(formData, `${BASE}/${incidentId}`);
  if (refused(context)) return context;
  if (!incidentId) return NO_INCIDENT;
  try {
    await api.updateIncident(incidentId, fieldsOf(formData, true), staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refresh(incidentId);
  return sent("Saved.");
}

export async function incidentStatusAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const incidentId = idOf(formData, "incident_id");
  const context = await gate(formData, `${BASE}/${incidentId}`);
  if (refused(context)) return context;
  if (!incidentId) return NO_INCIDENT;
  const to = fieldValue(formData, "to", 12);
  if (!STATUSES.has(to)) return { status: "error", message: "Choose from the list." };
  try {
    await api.setIncidentStatus(
      incidentId,
      {
        to: to as api.IncidentStatus,
        day: fieldValue(formData, "day", 10),
        time: fieldValue(formData, "time", 5),
      },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh(incidentId);
  return sent(to === "open" ? "Reopened." : "Saved.");
}

export async function certInReportAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const incidentId = idOf(formData, "incident_id");
  const context = await gate(formData, `${BASE}/${incidentId}`);
  if (refused(context)) return context;
  if (!incidentId) return NO_INCIDENT;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  try {
    await api.recordCertInReport(
      incidentId,
      {
        sent_day: fieldValue(formData, "sent_day", 10),
        sent_time: fieldValue(formData, "sent_time", 5),
        channel: fieldValue(formData, "channel", 10),
        reference: fieldValue(formData, "reference", 80),
        sent_by: fieldValue(formData, "sent_by", 120),
        late_reason: fieldValue(formData, "late_reason", 500),
        ...copy,
      },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh(incidentId);
  refreshData("/data/files");
  return sent("Recorded. Nothing was sent from here.");
}

export async function notReportableAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const incidentId = idOf(formData, "incident_id");
  const context = await gate(formData, `${BASE}/${incidentId}`);
  if (refused(context)) return context;
  if (!incidentId) return NO_INCIDENT;
  const undo = fieldValue(formData, "undo", 4) === "1";
  try {
    await api.recordNotReportable(
      incidentId,
      undo
        ? { undo: true }
        : {
            why: fieldValue(formData, "why", 500),
            decided_by: fieldValue(formData, "decided_by", 120),
            on: fieldValue(formData, "on", 10),
          },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh(incidentId);
  return sent(undo ? "Taken back." : "Recorded.");
}

export async function boardReportAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const incidentId = idOf(formData, "incident_id");
  const context = await gate(formData, `${BASE}/${incidentId}`);
  if (refused(context)) return context;
  if (!incidentId) return NO_INCIDENT;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  try {
    await api.recordBoardReport(
      incidentId,
      {
        sent_day: fieldValue(formData, "sent_day", 10),
        sent_time: fieldValue(formData, "sent_time", 5),
        reference: fieldValue(formData, "reference", 80),
        ...copy,
      },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh(incidentId);
  refreshData("/data/files");
  return sent("Recorded. Nothing was sent from here.");
}

export async function addCustomerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const incidentId = idOf(formData, "incident_id");
  const context = await gate(formData, `${BASE}/${incidentId}`);
  if (refused(context)) return context;
  if (!incidentId) return NO_INCIDENT;
  try {
    await api.addIncidentCustomer(
      incidentId,
      {
        name: fieldValue(formData, "name", 200),
        hours: fieldValue(formData, "hours", 6),
        waitlist_entry_id: idOf(formData, "waitlist_entry_id"),
      },
      staffOf(context),
      attemptOf(formData),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh(incidentId);
  return sent("Added.");
}

export async function customerToldAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const incidentId = idOf(formData, "incident_id");
  const context = await gate(formData, `${BASE}/${incidentId}`);
  if (refused(context)) return context;
  const rowId = idOf(formData, "row_id");
  if (!incidentId || !rowId) return NO_INCIDENT;
  try {
    await api.customerTold(
      incidentId,
      rowId,
      {
        day: fieldValue(formData, "day", 10),
        time: fieldValue(formData, "time", 5),
        how: fieldValue(formData, "how", 200),
      },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh(incidentId);
  return sent("Recorded.");
}

export async function withdrawCustomerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const incidentId = idOf(formData, "incident_id");
  const context = await gate(formData, `${BASE}/${incidentId}`);
  if (refused(context)) return context;
  const rowId = idOf(formData, "row_id");
  if (!incidentId || !rowId) return NO_INCIDENT;
  try {
    await api.withdrawCustomer(incidentId, rowId, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refresh(incidentId);
  return sent("Withdrawn. The row stays, marked.");
}

export async function setRunbookAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const kind = fieldValue(formData, "kind", 40);
  try {
    await api.setRunbook(kind, idOf(formData, "file_id") || null, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData(BASE, "/data/files");
  return sent("Saved.");
}
