"use server";

import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/contacts";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";

import { idOf, isState } from "../decisions/fields";

/**
 * Contacts' writes: add, edit, archive and restore. Nothing here deletes a contact, and
 * nothing makes one a lead or a row on a Mail merge list.
 */

const ROLES = new Set<string>(api.contactRoleSchema.options);
const NO_CONTACT: ActionState = { status: "error", message: "That contact is not here." };

function fieldsOf(formData: FormData): api.ContactInput | ActionState {
  const name = fieldValue(formData, "name", 120).trim();
  if (!name) return { status: "error", message: "Give the contact a name." };
  const role = fieldValue(formData, "role", 20);
  if (!ROLES.has(role)) return { status: "error", message: "Choose the contact's role." };
  return {
    name,
    role: role as api.ContactRole,
    firm: fieldValue(formData, "firm", 200),
    email: fieldValue(formData, "email", 254).trim(),
    phone: fieldValue(formData, "phone", 60).trim(),
    notes: fieldValue(formData, "notes", 4_000),
  };
}

export async function addContactAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/contacts");
  if (refused(context)) return context;
  const fields = fieldsOf(formData);
  if (isState(fields)) return fields;
  let name = fields.name;
  try {
    name = (
      await api.addContact(
        fields,
        staffOf(context),
        fieldValue(formData, "attempt", 64) || crypto.randomUUID(),
      )
    ).contact.name;
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/contacts");
  return sent(`Added ${name}.`);
}

export async function updateContactAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/contacts");
  if (refused(context)) return context;
  const contactId = idOf(formData, "contact_id");
  if (!contactId) return NO_CONTACT;
  const fields = fieldsOf(formData);
  if (isState(fields)) return fields;
  try {
    await api.updateContact(contactId, fields, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/contacts");
  return sent("Saved.");
}

/** "Archive" or "Restore" on one contact. */
export async function archiveContactAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/contacts");
  if (refused(context)) return context;
  const contactId = idOf(formData, "contact_id");
  if (!contactId) return NO_CONTACT;
  const restore = fieldValue(formData, "to", 10) === "restore";
  try {
    if (restore) await api.restoreContact(contactId, staffOf(context));
    else await api.archiveContact(contactId, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/contacts");
  return sent(null);
}
