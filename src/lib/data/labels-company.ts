/**
 * The company record's words (ws-notes/company/spec.md §6.7.1): the flags and their hints,
 * designations, who files a date, the professionals who confirm a rule, the rule book's
 * areas, the states by the two letters a CIN uses, and the small pure helpers the service
 * and the pages share (a calendar day in words, rupees with Indian grouping, the first
 * financial year's possible ends). No `server-only`: the service imports this file too.
 */

export const FLAGS = { yes: "Yes", no: "No", "": "Not known" } as const;
export type FlagKey = keyof typeof FLAGS;

export const FLAG_FACTS = {
  small: {
    label: "Small company",
    hint: "Paid-up capital up to ₹10 crore and turnover up to ₹100 crore since 1 Dec 2025, and not a holding or subsidiary company.",
  },
  startup: {
    label: "DPIIT-recognised startup",
    hint: "Recognition is free and keeps the two-meetings-a-year rule.",
  },
  subsidiary: {
    label: "Subsidiary of another company",
    hint: "A subsidiary can never be a small company.",
  },
  foreign_investment: {
    label: "Foreign investment received",
    hint: "Shares allotted to a non-resident bring FC-GPR and the yearly FLA return.",
  },
  gst_registered: {
    label: "Registered for GST",
    hint: "Whether to register is your CA's call.",
  },
  exports: {
    label: "Exports services",
    hint: "Zero-rated export invoices need an LUT each year.",
  },
} as const;
export type FlagFact = keyof typeof FLAG_FACTS;
export const FLAG_ORDER = Object.keys(FLAG_FACTS) as FlagFact[];

export const DESIGNATIONS = {
  director: "Director",
  managing: "Managing director",
  whole_time: "Whole-time director",
  additional: "Additional director",
  nominee: "Nominee director",
} as const;
export type DesignationKey = keyof typeof DESIGNATIONS;

export const CONTACT_FIELDS = { email: "Email", mobile: "Mobile", address: "Address" } as const;
export type ContactFieldKey = keyof typeof CONTACT_FIELDS;

export const OWNER_ROLES = {
  founder: "Founder",
  ca: "CA",
  cs: "CS",
  lawyer: "Lawyer",
  other: "Someone else",
  "": "Not set",
} as const;
export type OwnerRoleKey = keyof typeof OWNER_ROLES;

export const CONFIRM_ROLES = { CA: "CA", CS: "CS", lawyer: "Lawyer" } as const;
export type ConfirmRoleKey = keyof typeof CONFIRM_ROLES;

export const RULE_AREAS = {
  company: "The company",
  meetings: "Meetings",
  close: "The round",
  calendar: "Calendar dates",
} as const;
export type RuleAreaKey = keyof typeof RULE_AREAS;

export const NOT_ADVICE = "This is a record to keep, not legal advice.";

/** "Confirm with your CA", "Confirm with your CS", "Confirm with your lawyer". */
export function confirmWords(role: string): string {
  return `Confirm with your ${role === "lawyer" ? "lawyer" : role}`;
}

/** Indian states and union territories, by the two letters a CIN uses. */
export const STATES = {
  AN: "Andaman and Nicobar Islands",
  AP: "Andhra Pradesh",
  AR: "Arunachal Pradesh",
  AS: "Assam",
  BR: "Bihar",
  CH: "Chandigarh",
  CT: "Chhattisgarh",
  DN: "Dadra and Nagar Haveli and Daman and Diu",
  DL: "Delhi",
  GA: "Goa",
  GJ: "Gujarat",
  HR: "Haryana",
  HP: "Himachal Pradesh",
  JK: "Jammu and Kashmir",
  JH: "Jharkhand",
  KA: "Karnataka",
  KL: "Kerala",
  LA: "Ladakh",
  LD: "Lakshadweep",
  MP: "Madhya Pradesh",
  MH: "Maharashtra",
  MN: "Manipur",
  ML: "Meghalaya",
  MZ: "Mizoram",
  NL: "Nagaland",
  OR: "Odisha",
  PY: "Puducherry",
  PB: "Punjab",
  RJ: "Rajasthan",
  SK: "Sikkim",
  TN: "Tamil Nadu",
  TG: "Telangana",
  TR: "Tripura",
  UP: "Uttar Pradesh",
  UR: "Uttarakhand",
  WB: "West Bengal",
} as const;
export type StateKey = keyof typeof STATES;

/** The fields of the facts, in words, as the "Changes" table names them (never their values). */
export const FACT_WORDS: Record<string, string> = {
  legal_name: "Legal name",
  cin: "CIN",
  pan: "PAN",
  tan: "TAN",
  gstin: "GSTIN",
  registered_state: "Registered in",
  registered_office: "Registered office",
  incorporated_on: "Incorporated on",
  first_fy_end: "First financial year ends",
  small: FLAG_FACTS.small.label,
  startup: FLAG_FACTS.startup.label,
  subsidiary: FLAG_FACTS.subsidiary.label,
  foreign_investment: FLAG_FACTS.foreign_investment.label,
  gst_registered: FLAG_FACTS.gst_registered.label,
  exports: FLAG_FACTS.exports.label,
  auditor_name: "Auditor",
  auditor_firm_number: "Auditor's firm number",
  auditor_appointed_on: "Auditor appointed on",
  auditor_appointed_by: "Auditor appointed by",
  auditor_contact_id: "Auditor's contact",
  bank_name: "Authorised dealer bank",
  bank_branch: "Bank branch",
  bank_contact_id: "Bank's contact",
  firms_registered_on: "FIRMS registration",
  firms_user_note: "FIRMS user note",
  dpiit_number: "DPIIT number",
  dpiit_recognised_on: "DPIIT recognised on",
};

/** The director's fields, in words, for the activity lines (never their values). */
export const DIRECTOR_WORDS: Record<string, string> = {
  name: "Name",
  din: "DIN",
  din_allotted_on: "DIN allotted on",
  designation: "Designation",
  appointed_on: "Appointed on",
  is_founder: "Founder",
  dsc_expires_on: "DSC expiry",
  dsc_kept: "Where the DSC is kept",
  kyc_filed_on: "Last DIR-3 KYC",
  kyc_srn: "KYC SRN",
  mca_email: "Email on the MCA record",
  mca_mobile: "Mobile on the MCA record",
  mca_address: "Address on the MCA record",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "14 Aug 2025": a calendar day in words, never shifted into a zone. "" for anything else. */
export function dayWords(day: string | null | undefined): string {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  const [year = "", month = "", date = ""] = day.split("-");
  return `${Number(date)} ${MONTHS[Number(month) - 1] ?? ""} ${year}`;
}

const RUPEES = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

/** Whole rupees with Indian grouping: 2500000 → "₹25,00,000". */
export function rupees(amount: number): string {
  return RUPEES.format(amount);
}

/**
 * The days the first financial year may end on, for a company incorporated on `day`
 * (s.2(41) as the research reads it; not verified, so the form says to confirm it with
 * the CA): April to December of Y → 31 Mar Y+1 only; January to March of Y → 31 Mar Y, or
 * 31 Mar Y+1 when the company chose the longer first year. [] without a day.
 */
export function firstFyEndOptions(day: string | null | undefined): string[] {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  return month >= 4 ? [`${year + 1}-03-31`] : [`${year}-03-31`, `${year + 1}-03-31`];
}

/** "31 Mar 2026" or "31 Mar 2026 or 31 Mar 2027". */
export function optionsWords(options: readonly string[]): string {
  return options.map(dayWords).join(" or ");
}

/** "1 day", "14 days". */
export function daysWords(count: number): string {
  return `${count.toLocaleString("en")} ${count === 1 ? "day" : "days"}`;
}
