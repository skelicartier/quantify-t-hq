/**
 * The shapes of the register of members (MGT-1; ws-notes/company/spec.md §7.2): classes of
 * shares, members with folios, entries (reversed, never deleted) and share certificates
 * (cancelled, never deleted). The holdings are added up from the entries on every read.
 */

import type { HolderKind } from "../company-contracts";
import type { Staff } from "../protocol";

export type { HolderKind };

export type ShareClass = {
  class_id: string;
  /** "Equity shares of ₹10 each". */
  name: string;
  kind: "equity" | "preference";
  /** Rupees a share. */
  nominal: number;
  created_at: string;
  created_by: Staff;
};

export type Member = {
  member_id: string;
  /** "F001", "F002" … in the order members are added; never reused. */
  folio: string;
  name: string;
  kind: HolderKind;
  email: string;
  address: string;
  /** The PAN for a resident, a passport or registration number otherwise, as MGT-1 asks. */
  id_number: string;
  residency: "resident" | "non_resident" | "";
  nationality: string;
  investor_id: string | null;
  /** A syndicate or fund that holds as one: who is behind it, as typed. */
  backers_note: string;
  became_member_on: string;
  ceased_on: string | null;
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
};

export type EntryKind =
  | "subscription"
  | "allotment"
  | "transfer_in"
  | "transfer_out"
  | "conversion_in"
  | "conversion_out";

export type RegisterEntry = {
  entry_id: string;
  member_id: string;
  class_id: string;
  kind: EntryKind;
  shares: number;
  distinctive: { from: number; to: number } | null;
  price_per_share: number | null;
  paid_up_per_share: number | null;
  /** The allotment, subscription, transfer or conversion day. */
  on: string;
  /** The day it was written in the register. */
  entered_on: string;
  resolution: { resolution_id: string | null; words: string };
  closing_key: string | null;
  /** The other side of a transfer or conversion. */
  counterpart_member_id: string | null;
  note: string;
  reversed: { on: string; why: string; at: string; by: Staff } | null;
  created_at: string;
  created_by: Staff;
};

export type Certificate = {
  certificate_id: string;
  /** "SC-001" … by default; he may type the number printed on it. */
  number: string;
  member_id: string;
  class_id: string;
  shares: number;
  distinctive: { from: number; to: number } | null;
  issued_on: string;
  stamp: { amount: number | null; reference: string };
  file_id: string | null;
  entry_ids: string[];
  cancelled: { on: string; why: string; at: string; by: Staff } | null;
  created_at: string;
  created_by: Staff;
};

export type Register = {
  format: 1;
  classes: ShareClass[];
  members: Member[];
  entries: RegisterEntry[];
  certificates: Certificate[];
  next_folio: number;
  next_certificate: number;
};

export type MembersEvent = {
  event_id: string;
  target: "class" | "member" | "entry" | "certificate";
  id: string;
  verb: string;
  detail: string;
  by: Staff;
  at: string;
};
