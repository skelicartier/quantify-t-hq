/**
 * Contacts, kept whole in `contacts/contacts.json` with a line per change in
 * `contacts/events.jsonl`. A contact is archived, never deleted, and never becomes a lead
 * or a row on a Mail merge list: nothing here asks the leads module or the engine.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import type { DataCore } from "../core";
import { clean, cleanText, normaliseEmail } from "../guard";
import type { Staff } from "../protocol";
import { CONTACT_ROLES, CONTACT_ROLE_ORDER } from "../../../src/lib/data/labels";
import { CONTACTS_TOTAL, CONTACT_LIMITS, PHONE } from "./limits";
import type { Contact, ContactEvent, ContactRole } from "./types";

const FILE = "contacts/contacts.json";
const EVENTS = "contacts/events.jsonl";

const isRole = (value: string): value is ContactRole => value in CONTACT_ROLES;

/** Archived contacts and live ones, in role order and then by name. */
export function byRoleThenName(a: Contact, b: Contact): number {
  return (
    CONTACT_ROLE_ORDER.indexOf(a.role) - CONTACT_ROLE_ORDER.indexOf(b.role) ||
    a.name.localeCompare(b.name) ||
    a.created_at.localeCompare(b.created_at)
  );
}

export class ContactsBook {
  readonly #core: DataCore;
  contacts: Contact[];

  constructor(core: DataCore) {
    this.#core = core;
    core.store.ensureDir("contacts");
    const stored = core.store.readJson<{ contacts?: Contact[] }>(FILE, {});
    this.contacts = Array.isArray(stored.contacts)
      ? stored.contacts.filter(
          (contact) => typeof contact?.contact_id === "string" && isRole(String(contact.role)),
        )
      : [];
  }

  save(): void {
    this.#core.store.writeJson(FILE, { format: 1, contacts: this.contacts });
  }

  #event(contactId: string, verb: string, detail: string, by: Staff): void {
    const event: ContactEvent = {
      event_id: randomUUID(),
      contact_id: contactId,
      verb,
      detail,
      by,
      at: this.#core.now(),
    };
    this.#core.store.appendLine(EVENTS, event);
  }

  get(id: string | undefined): Contact {
    const contact = id ? this.contacts.find((item) => item.contact_id === id) : undefined;
    if (!contact) throw new Refused(404, "not_found", "That contact is not here.");
    return contact;
  }

  live(): Contact[] {
    return this.contacts.filter((contact) => contact.archived === null);
  }

  /** Refused when another live contact has this address. */
  #emailFree(email: string, self: string | null): void {
    if (!email) return;
    const other = this.contacts.find(
      (contact) =>
        contact.archived === null && contact.email === email && contact.contact_id !== self,
    );
    if (other)
      throw new Refused(409, "already_a_contact", `${email} is already a contact: ${other.name}.`);
  }

  /** The form's fields, checked; a field not given keeps `base`'s value. */
  #fields(input: Record<string, unknown>, base: Partial<Contact>) {
    const has = (name: string) => Object.prototype.hasOwnProperty.call(input, name);
    const name = has("name") ? cleanText(input.name, CONTACT_LIMITS.name) : (base.name ?? "");
    if (!name) throw new Refused(400, "invalid", "Give the contact a name.");
    const role = has("role") ? clean(input.role, CONTACT_LIMITS.role) : (base.role ?? "");
    if (!isRole(role)) throw new Refused(400, "invalid", "Choose the contact's role.");
    const firm = has("firm") ? cleanText(input.firm, CONTACT_LIMITS.firm) : (base.firm ?? "");
    let email = base.email ?? "";
    if (has("email")) {
      const typed = clean(input.email, 400);
      email = typed ? normaliseEmail(typed) : "";
      if (typed && !email) throw new Refused(400, "invalid", "That is not an email address.");
    }
    let phone = base.phone ?? "";
    if (has("phone")) {
      phone = clean(input.phone, 60).replace(/\s+/g, " ");
      if (phone && !PHONE.test(phone))
        throw new Refused(400, "invalid", "Type the phone number with digits, spaces and + only.");
    }
    const notes = has("notes") ? cleanText(input.notes, CONTACT_LIMITS.notes) : (base.notes ?? "");
    return { name, role, firm, email, phone, notes };
  }

  add(input: Record<string, unknown>, by: Staff): Contact {
    if (this.contacts.length >= CONTACTS_TOTAL)
      throw new Refused(
        400,
        "invalid",
        `Data holds ${CONTACTS_TOTAL.toLocaleString("en-GB")} at most.`,
      );
    const fields = this.#fields(input, {});
    this.#emailFree(fields.email, null);
    const now = this.#core.now();
    const contact: Contact = {
      contact_id: randomUUID(),
      ...fields,
      created_at: now,
      created_by: by,
      updated_at: now,
      updated_by: by,
      archived: null,
    };
    this.contacts.push(contact);
    this.save();
    this.#event(contact.contact_id, "added", CONTACT_ROLES[contact.role], by);
    return contact;
  }

  update(contact: Contact, input: Record<string, unknown>, by: Staff): Contact {
    const fields = this.#fields(input, contact);
    if (contact.archived === null) this.#emailFree(fields.email, contact.contact_id);
    const changed = (Object.keys(fields) as (keyof typeof fields)[]).filter(
      (key) => contact[key] !== fields[key],
    );
    Object.assign(contact, fields);
    contact.updated_at = this.#core.now();
    contact.updated_by = by;
    this.save();
    if (changed.length) this.#event(contact.contact_id, "changed", changed.join(", "), by);
    return contact;
  }

  archive(contact: Contact, by: Staff): Contact {
    if (contact.archived) return contact;
    contact.archived = { at: this.#core.now(), by };
    contact.updated_at = contact.archived.at;
    contact.updated_by = by;
    this.save();
    this.#event(contact.contact_id, "archived", "", by);
    return contact;
  }

  restore(contact: Contact, by: Staff): Contact {
    if (!contact.archived) return contact;
    this.#emailFree(contact.email, contact.contact_id);
    contact.archived = null;
    contact.updated_at = this.#core.now();
    contact.updated_by = by;
    this.save();
    this.#event(contact.contact_id, "restored", "", by);
    return contact;
  }

  /** Every word of the search, against what a person would look a contact up by. */
  searchText(contact: Contact): string[] {
    return [
      contact.name,
      contact.firm,
      contact.email,
      contact.phone,
      contact.notes,
      CONTACT_ROLES[contact.role],
    ];
  }
}
