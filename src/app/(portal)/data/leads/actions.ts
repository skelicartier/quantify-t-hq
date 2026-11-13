"use server";

import { createHash } from "node:crypto";

import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/leads";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import { DataRequestError } from "@/lib/data/socket";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * All leads' writes. Each one: the gate, one call to the service, the pages that show it
 * refreshed, and a sentence. Edits stay in Data; nothing here changes a Mail merge list,
 * and a stop goes onto Mail merge's own stop list through the service.
 */

const LEAD_ID = /^[0-9a-f]{32}$/;
const ROUTE_ID = /^[A-Za-z0-9-]{1,64}$/;

const attemptOf = (formData: FormData): string =>
  fieldValue(formData, "attempt", 64) || crypto.randomUUID();

/** The id the service gives an address: the same rule, so a refusal can link to the lead. */
function leadIdOf(email: string): string {
  return createHash("sha256")
    .update(`lead:${email.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 32);
}

function leadIdFrom(formData: FormData): string {
  const leadId = fieldValue(formData, "lead_id", 64);
  return LEAD_ID.test(leadId) ? leadId : "";
}

const NO_LEAD: ActionState = { status: "error", message: "That lead is not here." };

export async function addLeadAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/leads");
  if (refused(context)) return context;
  const email = fieldValue(formData, "email", 254).trim();
  if (!email) return { status: "error", message: "Type the address first." };
  let lead: api.LeadRow;
  try {
    lead = (
      await api.addLead(
        {
          email,
          values: {
            full_name: fieldValue(formData, "name", 120),
            title: fieldValue(formData, "title", 200),
            company: fieldValue(formData, "firm", 200),
            firm_type: fieldValue(formData, "firm_type", 200),
            country: fieldValue(formData, "country", 200),
            city: fieldValue(formData, "city", 200),
          },
        },
        staffOf(context),
        attemptOf(formData),
      )
    ).lead;
  } catch (error) {
    if (error instanceof DataRequestError && error.code === "already_a_lead")
      return {
        status: "error",
        message: error.message,
        detail: JSON.stringify({ href: `/data/leads/${leadIdOf(email)}`, label: "Open it" }),
      };
    return refusal(error);
  }
  refreshData("/data/leads");
  return {
    ...sent(`Added ${lead.name || lead.email}.`),
    detail: JSON.stringify({ href: `/data/leads/${lead.lead_id}`, label: "Open it" }),
  };
}

export async function updateLeadAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const leadId = leadIdFrom(formData);
  const context = await gate(formData, `/data/leads/${leadId}`);
  if (refused(context)) return context;
  if (!leadId) return NO_LEAD;
  const field = api.LEAD_FIELD_KEYS.find((key) => formData.has(key));
  if (!field) return { status: "error", message: "Nothing to change." };
  try {
    await api.updateLead(
      leadId,
      field,
      fieldValue(formData, field, field === "notes" ? 4_000 : 200),
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/leads", `/data/leads/${leadId}`);
  return sent("Saved.");
}

export async function tagLeadAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const leadId = leadIdFrom(formData);
  const context = await gate(formData, `/data/leads/${leadId}`);
  if (refused(context)) return context;
  if (!leadId) return NO_LEAD;
  const tag = fieldValue(formData, "tag", 40).trim();
  if (!tag) return { status: "error", message: "Type the tag first." };
  const removing = fieldValue(formData, "change", 10) === "remove";
  try {
    await api.tagLead(leadId, removing ? { remove: [tag] } : { add: [tag] }, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/leads", `/data/leads/${leadId}`);
  return sent(removing ? `Took the tag “${tag}” off.` : `Tagged “${tag}”.`);
}

/** The selection bar's one change: a tag added to, or taken off, the ticked leads. */
export async function bulkTagLeadsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/leads");
  if (refused(context)) return context;
  const ids = fieldValue(formData, "ids", 40_000)
    .split(",")
    .map((value) => value.trim())
    .filter((value) => LEAD_ID.test(value));
  if (ids.length === 0) return { status: "error", message: "Choose the leads first." };
  if (ids.length > 500) return { status: "error", message: "Choose 500 at most." };
  const field = fieldValue(formData, "field", 20);
  const tag = fieldValue(formData, "value", 40).trim();
  if (!tag) return { status: "error", message: "Choose the tag first." };
  let changed = 0;
  try {
    changed = (
      await api.bulkTagLeads(
        ids,
        field === "remove_tag" ? { remove: [tag] } : { add: [tag] },
        staffOf(context),
      )
    ).changed;
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/leads");
  const leads = `${changed.toLocaleString("en-GB")} ${changed === 1 ? "lead" : "leads"}`;
  return sent(field === "remove_tag" ? `Took “${tag}” off ${leads}.` : `Tagged ${leads} “${tag}”.`);
}

export async function addLeadNoteAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const leadId = leadIdFrom(formData);
  const context = await gate(formData, `/data/leads/${leadId}`);
  if (refused(context)) return context;
  if (!leadId) return NO_LEAD;
  const text = fieldValue(formData, "text", 4_000).trim();
  if (!text) return { status: "error", message: "Write the note first." };
  try {
    await api.addLeadNote(leadId, text, staffOf(context), attemptOf(formData));
  } catch (error) {
    return refusal(error);
  }
  refreshData(`/data/leads/${leadId}`);
  return sent("Note added.");
}

export async function deleteLeadNoteAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const leadId = leadIdFrom(formData);
  const context = await gate(formData, `/data/leads/${leadId}`);
  if (refused(context)) return context;
  const noteId = fieldValue(formData, "note_id", 64);
  if (!leadId || !ROUTE_ID.test(noteId)) return NO_LEAD;
  try {
    await api.deleteLeadNote(leadId, noteId, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData(`/data/leads/${leadId}`);
  return sent("Note deleted.");
}

export async function stopLeadAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const leadId = leadIdFrom(formData);
  const context = await gate(formData, `/data/leads/${leadId}`);
  if (refused(context)) return context;
  if (!leadId) return NO_LEAD;
  const reason = fieldValue(formData, "reason", 10) === "asked" ? "asked" : "manual";
  try {
    await api.stopLead(leadId, reason, fieldValue(formData, "note", 200), staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/leads", `/data/leads/${leadId}`);
  return sent("On the stop list. Mail merge will not write to them again.");
}

export async function unstopLeadAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const leadId = leadIdFrom(formData);
  const context = await gate(formData, `/data/leads/${leadId}`);
  if (refused(context)) return context;
  if (!leadId) return NO_LEAD;
  try {
    await api.unstopLead(leadId, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/leads", `/data/leads/${leadId}`);
  return sent("Taken off the stop list.");
}

/** A Mail merge list of the view's people who are not on the stop list; the link comes back. */
export async function toMailMergeAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/leads");
  if (refused(context)) return context;
  const name = fieldValue(formData, "name", 120).trim();
  if (!name) return { status: "error", message: "Give the list a name." };
  let list: { id: string; name: string; people: number };
  try {
    list = (
      await api.leadsToMailMerge(
        fieldValue(formData, "query", 2_000),
        name,
        staffOf(context),
        attemptOf(formData),
      )
    ).list;
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/leads", "/mail/merge");
  return {
    ...sent(
      `Made “${list.name}” in Mail merge with ${list.people.toLocaleString("en-GB")} ${list.people === 1 ? "person" : "people"}.`,
    ),
    detail: JSON.stringify({ href: `/mail/merge/lists/${list.id}`, label: "Open it" }),
  };
}

export async function addSourceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/leads/sources");
  if (refused(context)) return context;
  const fileId = fieldValue(formData, "file_id", 64);
  if (!ROUTE_ID.test(fileId)) return { status: "error", message: "Choose the file first." };
  const role = fieldValue(formData, "role", 20) === "held_back" ? "held_back" : "leads";
  try {
    await api.addLeadSource(
      { file_id: fileId, role, reason: fieldValue(formData, "reason", 200) },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/leads", "/data/leads/sources");
  return sent("Added. It is being read now.");
}

export async function removeSourceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/leads/sources");
  if (refused(context)) return context;
  const sourceId = fieldValue(formData, "source_id", 64);
  if (!ROUTE_ID.test(sourceId)) return { status: "error", message: "That source is not here." };
  let removed = 0;
  try {
    removed = (await api.removeLeadSource(sourceId, staffOf(context))).removed;
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/leads", "/data/leads/sources");
  return sent(
    removed === 0
      ? "No longer a source. Every lead it brought is also somewhere else, so all of them stay."
      : `No longer a source. ${removed.toLocaleString("en-GB")} ${removed === 1 ? "lead" : "leads"} only it brought left All leads.`,
  );
}

export async function readAgainAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/leads/sources");
  if (refused(context)) return context;
  try {
    await api.readLeadsAgain(staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/leads", "/data/leads/sources");
  return sent("Reading everything again. All leads updates as it goes.");
}
