/**
 * The shapes of Contacts (raise spec §6.2): the people the company relies on, the CA, the
 * CS, the lawyer, the bank, the auditor and the people who introduce him to investors.
 * Archived, never deleted; never a lead, never on a Mail merge list.
 */

import type { Staff } from "../protocol";
import type { ContactRole } from "../../../src/lib/data/labels";

export type { ContactRole };

export type Contact = {
  contact_id: string;
  name: string;
  role: ContactRole;
  firm: string;
  email: string;
  phone: string;
  notes: string;
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
  /** Archived, never deleted. */
  archived: { at: string; by: Staff } | null;
};

export type ContactEvent = {
  event_id: string;
  contact_id: string;
  /** "added", "changed", "archived", "restored". */
  verb: string;
  detail: string;
  by: Staff;
  at: string;
};
