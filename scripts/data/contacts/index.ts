/**
 * Contacts (raise spec §6): the chartered accountant, the company secretary, the lawyer,
 * the bank, the auditor and the people who introduce him to investors. Archived, never
 * deleted. A contact is never a lead and never on a Mail merge list: this module asks
 * neither the leads module nor the engine for anything.
 *
 * It gives the investors module the introducers for its picker (`contacts`) and the
 * search its hits (`search:contacts`).
 */

import type { DataCore } from "../core";
import { clean } from "../guard";
import {
  RAISE_SERVICES,
  searchService,
  type ContactsLookup,
  type DataSearchHit,
  type SearchSource,
} from "../raise-contracts";
import { findTerms, matchesTerms } from "../../../src/lib/merge/find";
import { CONTACT_ROLES, CONTACT_ROLE_ORDER } from "../../../src/lib/data/labels";
import { snippetOf } from "../notes/snippet";
import { ContactsBook, byRoleThenName } from "./book";
import { CONTACT_LIMITS } from "./limits";
import type { Contact } from "./types";

export async function register(core: DataCore): Promise<void> {
  const book = new ContactsBook(core);

  // ---------------------------------------------------------------- the other modules

  const lookup: ContactsLookup = {
    introducers: () =>
      book
        .live()
        .filter((contact) => contact.role === "introducer")
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((contact) => ({
          contact_id: contact.contact_id,
          name: contact.name,
          firm: contact.firm,
        })),
    get: (contactId) => {
      const contact = book.contacts.find((item) => item.contact_id === contactId);
      return contact
        ? {
            contact_id: contact.contact_id,
            name: contact.name,
            firm: contact.firm,
            role: contact.role,
          }
        : null;
    },
  };
  core.provide(RAISE_SERVICES.contacts, lookup);

  const hitOf = (contact: Contact, terms: readonly string[]): DataSearchHit => ({
    kind: "contact",
    id: contact.contact_id,
    title: contact.name,
    subtitle: [CONTACT_ROLES[contact.role], contact.firm].filter(Boolean).join(" · "),
    snippet: snippetOf(contact.notes, terms),
    href: `/data/contacts#contact-${contact.contact_id}`,
  });

  const search: SearchSource = {
    search: ({ terms, kind, limit }) => {
      if ((kind !== null && kind !== "contact") || terms.length === 0) return [];
      const found = book.live().filter((contact) => matchesTerms(book.searchText(contact), terms));
      if (found.length === 0) return [];
      // Best first: the name holds every word, then the rest, each by name.
      const named = (contact: Contact) => matchesTerms([contact.name], terms);
      const ranked = [
        ...found.filter(named).sort(byRoleThenName),
        ...found.filter((contact) => !named(contact)).sort(byRoleThenName),
      ];
      return [
        {
          kind: "contact",
          count: found.length,
          hits: ranked.slice(0, Math.max(0, limit)).map((contact) => hitOf(contact, terms)),
        },
      ];
    },
  };
  core.provide(searchService("contacts"), search);

  // ---------------------------------------------------------------- routes

  core.route("GET", "/data/contacts", (ctx) => {
    const terms = findTerms(clean(ctx.query.get("q"), CONTACT_LIMITS.search));
    const role = clean(ctx.query.get("role"), CONTACT_LIMITS.role);
    const archived = ctx.query.get("archived") === "1";
    const searched = book.contacts
      .filter((contact) => matchesTerms(book.searchText(contact), terms))
      .sort(byRoleThenName);
    const live = searched.filter((contact) => contact.archived === null);
    const counts: Record<string, number> = {
      all: live.length,
      archived: searched.length - live.length,
    };
    for (const key of CONTACT_ROLE_ORDER)
      counts[key] = live.filter((contact) => contact.role === key).length;
    const shown = archived
      ? searched.filter((contact) => contact.archived !== null)
      : role in CONTACT_ROLES
        ? live.filter((contact) => contact.role === role)
        : live;
    return { contacts: shown, total: shown.length, counts };
  });

  core.route("POST", "/data/contacts", (ctx) => {
    const by = ctx.staff();
    return { contact: book.add(ctx.body, by) };
  });

  core.route("POST", "/data/contacts/:id/update", (ctx) => {
    const by = ctx.staff();
    return { contact: book.update(book.get(ctx.params[0]), ctx.body, by) };
  });

  core.route("POST", "/data/contacts/:id/archive", (ctx) => {
    const by = ctx.staff();
    return { contact: book.archive(book.get(ctx.params[0]), by) };
  });

  core.route("POST", "/data/contacts/:id/restore", (ctx) => {
    const by = ctx.staff();
    return { contact: book.restore(book.get(ctx.params[0]), by) };
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    // What the investors module would be given, asked the way it asks: through `need`.
    core.route("GET", "/data/_test/contacts/introducers", (ctx) => {
      const service = core.need<ContactsLookup>(RAISE_SERVICES.contacts);
      const id = clean(ctx.query.get("id"), 64);
      return {
        found: service !== null,
        introducers: service?.introducers() ?? [],
        contact: id ? (service?.get(id) ?? null) : null,
      };
    });
  }
}
