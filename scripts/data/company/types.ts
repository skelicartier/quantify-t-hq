/**
 * The company record's shapes (ws-notes/company/spec.md §6.2): the facts, kept whole and
 * edited by group; the directors, who cease and stay; each director's contact changes
 * on the MCA record; and one event line per change, naming the fields that changed and
 * never their values. On disk under `data/company/`.
 */

import type { CompanyLookup, Flag } from "../company-contracts";
import type { DutyConfirmWith } from "../duties-contracts";
import type { Staff } from "../protocol";

export type DpiitStatus = "" | "not_applied" | "applied" | "recognised";
export type BooksAccess = "" | "owner" | "accountant" | "view" | "none";

export type Facts = {
  legal_name: string;
  cin: string;
  pan: string;
  tan: string;
  gstin: string;
  /** A key of STATES (labels-company), or "". */
  registered_state: string;
  registered_office: string;
  incorporated_on: string | null;
  /** A 31 March: one of `firstFyEndOptions(incorporated_on)`. */
  first_fy_end: string | null;
  auditor: {
    name: string;
    firm_number: string;
    appointed_on: string | null;
    appointed_by: "board" | "agm" | "";
    /** A contact in raise's Contacts, when he chose one. */
    contact_id: string | null;
  };
  bank: { name: string; branch: string; contact_id: string | null };
  /** The RBI FIRMS entity registration: the day, and a note of the user id (never a password). */
  firms: { registered_on: string | null; user_note: string };
  dpiit: {
    number: string;
    recognised_on: string | null;
    status: DpiitStatus;
    applied_on: string | null;
    valid_until: string | null;
    /** The recognition certificate, in Files (folder "Company › DPIIT"). */
    certificate_file_id: string | null;
  };
  /** The point of contact given to CERT-In (ws-notes/duties/spec.md §6.2). */
  cert_in: {
    name: string;
    designation: string;
    email: string;
    mobile: string;
    office_phone: string;
    /** The office address given to CERT-In; "" means the registered office. */
    address: string;
    /** The day the details were last sent to info@cert-in.org.in. */
    sent_on: string | null;
    /** The message as sent, in Files (folder "Security › CERT-In"). */
    sent_file_id: string | null;
  };
  /** Which software keeps the books, and who keeps them: HQ is not the books. */
  books: {
    /** The books software, as he types it. */
    software: string;
    /** The firm that keeps the books. */
    kept_by: string;
    contact_id: string | null;
    /** The CA's access to the books software. */
    access: BooksAccess;
    started_on: string | null;
    /** The provider is disclosed to the ROC (Rule 3(6)). */
    provider_disclosed: Flag;
    disclosed_note: string;
    /** His plan's limits, whole rupees and a count, typed from the provider's own page; null for none. */
    free_revenue_limit: number | null;
    free_invoice_limit: number | null;
  };
  flags: {
    small: Flag;
    startup: Flag;
    subsidiary: Flag;
    foreign_investment: Flag;
    gst_registered: Flag;
    exports: Flag;
  };
  updated_at: string | null;
  updated_by: Staff | null;
};

export const EMPTY_FACTS: Facts = {
  legal_name: "",
  cin: "",
  pan: "",
  tan: "",
  gstin: "",
  registered_state: "",
  registered_office: "",
  incorporated_on: null,
  first_fy_end: null,
  auditor: { name: "", firm_number: "", appointed_on: null, appointed_by: "", contact_id: null },
  bank: { name: "", branch: "", contact_id: null },
  firms: { registered_on: null, user_note: "" },
  dpiit: {
    number: "",
    recognised_on: null,
    status: "",
    applied_on: null,
    valid_until: null,
    certificate_file_id: null,
  },
  cert_in: {
    name: "",
    designation: "",
    email: "",
    mobile: "",
    office_phone: "",
    address: "",
    sent_on: null,
    sent_file_id: null,
  },
  books: {
    software: "",
    kept_by: "",
    contact_id: null,
    access: "",
    started_on: null,
    provider_disclosed: "",
    disclosed_note: "",
    free_revenue_limit: null,
    free_invoice_limit: null,
  },
  flags: {
    small: "",
    startup: "",
    subsidiary: "",
    foreign_investment: "",
    gst_registered: "",
    exports: "",
  },
  updated_at: null,
  updated_by: null,
};

export type Designation = "director" | "managing" | "whole_time" | "additional" | "nominee";

export type Director = {
  director_id: string;
  name: string;
  /** Eight digits, or "" while none is allotted. */
  din: string;
  din_allotted_on: string | null;
  designation: Designation;
  appointed_on: string | null;
  ceased_on: string | null;
  is_founder: boolean;
  /** `kept`: where the DSC token is kept, never its PIN. */
  dsc: { expires_on: string | null; kept: string };
  kyc: { last_filed_on: string | null; srn: string };
  /** As registered with the MCA. */
  mca: { email: string; mobile: string; address: string };
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
};

export type ContactChange = {
  change_id: string;
  director_id: string;
  field: "email" | "mobile" | "address";
  from: string;
  to: string;
  changed_on: string;
  filed: { on: string; srn: string } | null;
  at: string;
  by: Staff;
};

export type CompanyEvent = {
  event_id: string;
  target: "facts" | "director";
  /** "facts", or the director's id. */
  id: string;
  /** "changed", "added", "ceased", "contact change", "contact change filed", "KYC filed" … */
  verb: string;
  /** The fields that changed, in words: "CIN, PAN". Never the values. */
  detail: string;
  by: Staff;
  at: string;
};

export type FactsGroup = "identity" | "dates" | "class" | "registrations" | "cert_in" | "books";

/** A check line of the duties batch (ws-notes/duties/spec.md §6.2): a sentence, never a refusal. */
export type DutyCheck = {
  key:
    | "cert-in-none"
    | "cert-in-old"
    | "cert-in-incomplete"
    | "books-none"
    | "books-undisclosed"
    | "dpiit-mismatch";
  words: string;
  /** Who to confirm it with, when anyone; the page prints "Confirm with your …". */
  confirm: DutyConfirmWith | null;
};

/**
 * What the dates module asks of the company module besides `CompanyLookup`: every fact,
 * every director (ceased ones too) and every contact change. Provided under `company`.
 */
export type CompanyInternal = CompanyLookup & {
  record(): Facts;
  directors(): Director[];
  changes(): ContactChange[];
};
