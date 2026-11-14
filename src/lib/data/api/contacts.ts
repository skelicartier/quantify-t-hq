import "server-only";

import { z } from "zod";

import { staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * Contacts: the chartered accountant, the company secretary, the lawyer, the bank, the
 * auditor and the people who introduce him to investors. Archived, never deleted; never a
 * lead and never on a Mail merge list.
 */

export const contactRoleSchema = z.enum([
  "ca",
  "cs",
  "lawyer",
  "bank",
  "auditor",
  "introducer",
  "other",
]);
export type ContactRole = z.infer<typeof contactRoleSchema>;

export const contactSchema = z.object({
  contact_id: z.string(),
  name: z.string(),
  role: contactRoleSchema,
  firm: z.string(),
  email: z.string(),
  phone: z.string(),
  notes: z.string(),
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
  archived: z.object({ at: z.string(), by: staffSchema }).nullable(),
});
export type Contact = z.infer<typeof contactSchema>;

export const contactsPageSchema = ok.extend({
  contacts: z.array(contactSchema),
  total: z.number(),
  counts: z.record(z.string(), z.number()),
});
export type ContactsPage = z.infer<typeof contactsPageSchema>;

const contactAnswer = ok.extend({ contact: contactSchema });

export const readContacts = (input: { role?: string; q?: string; archived?: boolean } = {}) => {
  const params = new URLSearchParams();
  if (input.role) params.set("role", input.role);
  if (input.q) params.set("q", input.q);
  if (input.archived) params.set("archived", "1");
  const rendered = params.toString();
  return dataAsk(contactsPageSchema, "GET", `/data/contacts${rendered ? `?${rendered}` : ""}`);
};

export type ContactInput = {
  name: string;
  role: ContactRole;
  firm: string;
  email: string;
  phone: string;
  notes: string;
};

export const addContact = (input: ContactInput, by: Staff, attempt: string) =>
  dataAsk(contactAnswer, "POST", "/data/contacts", { ...input, by, attempt });

export const updateContact = (contactId: string, input: ContactInput, by: Staff) =>
  dataAsk(contactAnswer, "POST", `/data/contacts/${id(contactId)}/update`, { ...input, by });

export const archiveContact = (contactId: string, by: Staff) =>
  dataAsk(contactAnswer, "POST", `/data/contacts/${id(contactId)}/archive`, { by });

export const restoreContact = (contactId: string, by: Staff) =>
  dataAsk(contactAnswer, "POST", `/data/contacts/${id(contactId)}/restore`, { by });
