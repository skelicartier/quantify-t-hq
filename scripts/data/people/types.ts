/**
 * The people ledger's shapes (ws-notes/company/spec.md §8.3): interns, employees and
 * contractors with their terms, documents, evaluations, certificate, stipend payments,
 * access and offboarding. They follow the HQ service's own team records
 * (`src/lib/api/team.ts`: staff kind, the access register's system, level, granted and
 * revoked days, the certificate's serial and issued day), so a later move maps field for
 * field. For the Owner only: nothing here leaves the module but `people-letters`' counts and
 * `people-pay` (duties spec §7.5), whose `paid` and `owed` a caller passes on only in an
 * answer asked as the Owner.
 */

import type { Staff } from "../protocol";

export type EngagementKind = "intern" | "employee" | "contractor";

/**
 * A signed copy, kept with the ledger in `people/files/` (0600) and never in Files: Files is
 * for Owners and Admins, and a letter holds the person's terms. Served only to the Owner.
 */
export type PersonCopy = {
  copy_id: string;
  /** The file under `people/files/`: `<copy_id>.<extension>`. */
  file: string;
  /** The name it was added with. */
  name: string;
  /** What its first bytes say it is (Files' own sniffing). */
  mime: string;
  bytes: number;
  sha256: string;
  at: string;
  by: Staff;
};

export type PersonDocument = {
  document_id: string;
  kind: "appointment" | "internship" | "contractor" | "nda" | "ip_assignment" | "other";
  title: string;
  /** Departs from spec §8.3's `file_id`: the copy is the ledger's own (the lead's decision). */
  copy: PersonCopy | null;
  signed_on: string | null;
  /** A letter whose own text assigns IP, or keeps work confidential. */
  includes_ip: boolean;
  includes_confidentiality: boolean;
  at: string;
  by: Staff;
};

export type Evaluation = {
  /** Worked out (§5.5) until he moves it. */
  due_on: string | null;
  held_on: string | null;
  /** The mentor, as typed. */
  by_name: string;
  outcome: "on_track" | "needs_support" | "completed" | "not_completed" | "";
  summary: string;
};

/** The challan the tax deducted from a payment was deposited with (duties spec §7.5). */
export type Challan = {
  /** The challan's serial or CIN, as typed; never a password. */
  number: string;
  /** The bank's seven-digit BSR code, or "". */
  bsr: string;
  deposited_on: string | null;
};

export type StipendPayment = {
  payment_id: string;
  /** "2027-01": the month it pays for. */
  period: string;
  amount: number;
  currency: "INR" | "USD";
  paid_on: string;
  /** The bank's reference (UTR); never an account number or a password. */
  reference: string;
  tds_deducted: number | null;
  note: string;
  at: string;
  by: Staff;
  withdrawn: { at: string; by: Staff; why: string } | null;
  /** Null until recorded; only a payment with tax deducted takes one. */
  challan: Challan | null;
};

export type TaxClassification = "" | "salary" | "professional_fee" | "exempt";
export type TaxDecider = "" | "CA" | "lawyer" | "founder";

/** A tax certificate issued to the person: Form 130 (was Form 16) or 131 (was Form 16A). */
export type TaxCertificate = {
  certificate_id: string;
  form: "130" | "131";
  /** "2026-27", or "2026-27 Q3". */
  period: string;
  issued_on: string;
  number: string;
  copy: PersonCopy | null;
  at: string;
  by: Staff;
};

/** How the person's stipend is treated for tax, as the CA decided it: HQ records, never decides. */
export type PersonTax = {
  classification: TaxClassification;
  decided_by: string;
  decided_role: TaxDecider;
  decided_on: string | null;
  decided_note: string;
  /** Ten letters and digits; "" until given. */
  pan: string;
  /** The engagement letter among this person's documents. */
  letter_document_id: string | null;
  certificates: TaxCertificate[];
};

export type AccessGrant = {
  access_id: string;
  /** As he names it: "Email and sign-in", "Code host". */
  system: string;
  level: string;
  critical: boolean;
  granted_on: string | null;
  revoked_on: string | null;
  /** Ticked at offboarding: the person never had it. */
  never_had: boolean;
  notes: string;
};

export type Stipend = { amount: number; currency: "INR" | "USD"; pays_on: number | "month_end" };

export type Person = {
  person_id: string;
  name: string;
  email: string;
  kind: EngagementKind;
  role_title: string;
  starts_on: string;
  /** The planned end; null for an open-ended employee. */
  ends_on: string | null;
  mentor: string;
  /** One ownable project, with its deliverables. */
  brief: string;
  /** A month's stipend, and when it is paid: the dth of the next month (1–28), or the month's last day. */
  stipend: Stipend | null;
  documents: PersonDocument[];
  evaluations: { midpoint: Evaluation; final: Evaluation };
  certificate: { number: string; issued_on: string; copy: PersonCopy | null } | null;
  access: AccessGrant[];
  offboarding: { last_day: string; started_at: string; started_by: Staff } | null;
  /** Set when every grant is revoked or never held, to the last day. */
  ended_on: string | null;
  /** The HQ service's staff id, once the service is live; kept so the record can move there. */
  hq_staff_id: string | null;
  notes: string;
  payments: StipendPayment[];
  /** Read as the empty form for a record written before the duties batch. */
  tax: PersonTax;
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
};

/** One line of `people/events.jsonl`: what changed, never an amount. */
export type PeopleEvent = {
  event_id: string;
  person_id: string;
  verb: string;
  detail: string;
  by: Staff;
  at: string;
};

export type PersonState = "starting" | "engaged" | "offboarding" | "ended";

/** A month of the stipend: its due day, the payments for it, and whether it is still owed. */
export type StipendPeriod = {
  period: string;
  due_on: string | null;
  paid: StipendPayment[];
  open: boolean;
};
