/**
 * Every word the Data section prints for a stored key, in one place, so a status reads the
 * same on a list, a record, a tile and an export. Plain words, sentence case, British
 * spelling. No vendor is named anywhere here. This module has no `server-only`: the
 * service's modules import it too (relatively), so a folder is named once.
 */

export type Tone = "live" | "danger" | "attention" | "neutral";
export type Labelled = { label: string; tone: Tone };

/** The one command that starts the local service; the state components print it. */
export const SERVICE_COMMAND = "cd ~/Library/Caches/hq-work/hq && npm run mail-merge";

// ------------------------------------------------------------------ Data itself

export const DATA_STATES = {
  starting: "Opening",
  ready: "Running",
  restarting: "Restarting",
  stopped: "Stopped",
} as const;

export const BUILD_STATES = {
  building: "Preparing",
  ready: "Ready",
  failed: "Failed",
} as const;

// ------------------------------------------------------------------ the overview

export const DUE_KINDS = {
  follow_up: "Follow-up",
  waitlist: "Waitlist",
  investor: "Investor",
  key_date: "Key date",
  file_review: "File review",
} as const;
export type DueKind = keyof typeof DUE_KINDS;

// ------------------------------------------------------------------ leads

export type LeadStatus =
  | "not_sent"
  | "held_back"
  | "sent"
  | "yes"
  | "later"
  | "question"
  | "wrong_person"
  | "no"
  | "stopped";

export const LEAD_STATUSES: Record<LeadStatus, Labelled> = {
  not_sent: { label: "Not sent yet", tone: "neutral" },
  held_back: { label: "Held back", tone: "attention" },
  sent: { label: "Sent", tone: "live" },
  yes: { label: "Said yes", tone: "live" },
  later: { label: "Later", tone: "attention" },
  question: { label: "Asked a question", tone: "attention" },
  wrong_person: { label: "Wrong person", tone: "neutral" },
  no: { label: "Said no", tone: "neutral" },
  stopped: { label: "Stopped", tone: "danger" },
};

export const LEAD_STATUS_ORDER: readonly LeadStatus[] = [
  "not_sent",
  "held_back",
  "sent",
  "yes",
  "later",
  "question",
  "wrong_person",
  "no",
  "stopped",
];

/** Why an address is on Mail merge's stop list, in words. */
export const STOP_REASONS = {
  manual: "Added by hand",
  asked: "Asked to stop",
  bounced: "Bounced",
  blocked: "Refused by the provider",
} as const;
export type StopReason = keyof typeof STOP_REASONS;

/** The reasons a lead was held back; a typed reason is shown as it was typed. */
export const HELD_BACK_REASONS = {
  not_a_buyer: "Not a buyer",
  firm_joined: "Firm already joined",
} as const;

/** The fields a lead has, as the person reads them. */
export const LEAD_FIELDS = {
  first_name: "First name",
  last_name: "Last name",
  full_name: "Full name",
  title: "Title",
  company: "Company",
  firm_type: "Firm type",
  website: "Website",
  country: "Country",
  city: "City",
  phone: "Phone",
  registration_no: "Registration number",
  source: "Source",
  source_url: "Source link",
  email_kind: "Kind of address",
  notes: "Notes",
} as const;
export type LeadField = keyof typeof LEAD_FIELDS;

export const SOURCE_ROLES = {
  leads: "Leads",
  held_back: "People held back",
} as const;

export const SOURCE_STATES = {
  waiting: "Waiting to be read",
  reading: "Reading…",
  read: "Read",
  failed: "Could not be read",
} as const;

// ------------------------------------------------------------------ replies and follow-ups

export type Outcome =
  "replied_positive" | "not_interested" | "not_now" | "out_of_office" | "wrong_person" | "question";

/** HQ's own words for a reply (map-crm-overlap §1), plus the new "Question". */
export const OUTCOMES: Record<Outcome, Labelled> = {
  replied_positive: { label: "Interested", tone: "live" },
  not_interested: { label: "Not interested", tone: "neutral" },
  not_now: { label: "Not now", tone: "attention" },
  out_of_office: { label: "Out of office", tone: "neutral" },
  wrong_person: { label: "Wrong person", tone: "neutral" },
  question: { label: "Question", tone: "attention" },
};

export const OUTCOME_ORDER: readonly Outcome[] = [
  "replied_positive",
  "not_interested",
  "not_now",
  "out_of_office",
  "wrong_person",
  "question",
];

export const TAKEN_BACK: Labelled = { label: "Taken back", tone: "neutral" };

export const FOLLOW_UP_KINDS = {
  answer: "Answer a question",
  write_again: "Write again",
  write_to_named: "Write to someone named",
  find_address: "Find an address",
  other: "Other",
} as const;
export type FollowUpKind = keyof typeof FOLLOW_UP_KINDS;

export const FOLLOW_UP_STATES = {
  open: "Open",
  done: "Done",
  closed_by_send: "Done: written to again",
  taken_back: "Taken back",
} as const;

// ------------------------------------------------------------------ the waitlist

export type WaitlistStage =
  "joined" | "call_booked" | "call_held" | "pilot" | "customer" | "dropped";

export const WAITLIST_STAGES: Record<WaitlistStage, Labelled> = {
  joined: { label: "Joined", tone: "neutral" },
  call_booked: { label: "Call booked", tone: "attention" },
  call_held: { label: "Call held", tone: "attention" },
  pilot: { label: "Pilot", tone: "live" },
  customer: { label: "Customer", tone: "live" },
  dropped: { label: "Dropped", tone: "neutral" },
};

export const WAITLIST_STAGE_ORDER: readonly WaitlistStage[] = [
  "joined",
  "call_booked",
  "call_held",
  "pilot",
  "customer",
  "dropped",
];

export const DROP_REASONS = {
  not_a_fit: "Not a fit",
  no_budget: "No budget",
  no_reply: "No reply after follow-ups",
  timing: "Timing: come back later",
  compliance: "Blocked by compliance or security",
  chose_another: "Chose another tool",
  pilot_missed: "Pilot missed its criteria",
  we_declined: "We declined",
  other: "Other",
} as const;
export type DropReason = keyof typeof DROP_REASONS;

export const COLLEAGUE_ROLES = {
  not_set: "Not set",
  decision_maker: "Decision maker",
  champion: "Champion",
  daily_user: "Daily user",
  technical: "Technical or IT",
  compliance: "Compliance",
} as const;
export type ColleagueRole = keyof typeof COLLEAGUE_ROLES;

export const NAMING = {
  named: "Name the firm",
  described: "Describe, don't name",
} as const;

export const WAITLIST_PROOF = {
  reply: "Written reply",
  call: "On a call",
} as const;

// ------------------------------------------------------------------ investors

export type InvestorStage =
  | "not_written"
  | "written"
  | "replied"
  | "meeting"
  | "met"
  | "diligence"
  | "soft"
  | "signed"
  | "money_in"
  | "set_aside"
  | "passed"
  | "do_not_pitch";

export const INVESTOR_STAGES: Record<InvestorStage, Labelled> = {
  not_written: { label: "Not written to yet", tone: "neutral" },
  written: { label: "Written to", tone: "neutral" },
  replied: { label: "Replied", tone: "attention" },
  meeting: { label: "Meeting booked", tone: "attention" },
  met: { label: "Met", tone: "attention" },
  diligence: { label: "Diligence", tone: "attention" },
  soft: { label: "Soft commit", tone: "live" },
  signed: { label: "Signed", tone: "live" },
  money_in: { label: "Money in", tone: "live" },
  set_aside: { label: "Set aside", tone: "neutral" },
  passed: { label: "Passed", tone: "neutral" },
  do_not_pitch: { label: "Do not pitch", tone: "danger" },
};

export const INVESTOR_STAGE_ORDER: readonly InvestorStage[] = [
  "not_written",
  "written",
  "replied",
  "meeting",
  "met",
  "diligence",
  "soft",
  "signed",
  "money_in",
  "set_aside",
  "passed",
  "do_not_pitch",
];

export const PASS_REASONS = {
  too_early: "Too early",
  not_sector: "Not our sector",
  not_geography: "Not our geography",
  revenue_first: "Want revenue or pilots first",
  check_size: "Check size does not fit",
  conflict: "Conflict",
  follow_not_lead: "Would follow, not lead",
  none_given: "No reason given",
  other: "Other",
} as const;
export type PassReason = keyof typeof PASS_REASONS;

export const AMOUNT_STATES = {
  asked: "Asked",
  soft: "Soft",
  signed: "Signed",
  money_in: "Money in",
} as const;
export type AmountState = keyof typeof AMOUNT_STATES;

export const INSTRUMENTS = ["SAFE", "iSAFE", "CCPS", "Equity", "Note", "Not decided"] as const;
export const CURRENCIES = ["USD", "INR"] as const;

// ------------------------------------------------------------------ files

export type FileKind =
  "pdf" | "image" | "csv" | "text" | "word" | "excel" | "slides" | "zip" | "web" | "other";

export const FILE_KINDS: Record<FileKind, string> = {
  pdf: "PDF",
  image: "Image",
  csv: "Spreadsheet (CSV)",
  text: "Text",
  word: "Word document",
  excel: "Excel workbook",
  slides: "Slides",
  zip: "Zip archive",
  web: "Web page",
  other: "File",
};

export type TextState =
  "pending" | "reading" | "read" | "none" | "failed" | "too_large" | "not_applicable";

export const TEXT_STATES: Record<TextState, string> = {
  pending: "Waiting to be read",
  reading: "Reading…",
  read: "Read",
  none: "No text found: it may be a scan",
  failed: "Could not be read",
  too_large: "Too large to read",
  not_applicable: "Not read for this kind of file",
};

export const FILE_VIEWS = {
  folder: "Folders",
  starred: "Starred",
  recent: "Recent",
  review: "Review due",
  trash: "Trash",
  shared: "Shared by me",
} as const;
export type FileView = keyof typeof FILE_VIEWS;

/** How a file was shared, as "Shared by me" lists it. */
export const SHARE_HOW = {
  email: "By email",
  share_sheet: "Share sheet",
} as const;
export type ShareHow = keyof typeof SHARE_HOW;

export const SHARE_RESULTS = {
  sent: "Sent",
  unknown: "May have gone",
  failed: "Not sent",
} as const;
export type ShareResultState = keyof typeof SHARE_RESULTS;

/** The folders made on first run, in order; "Directors' KYC" sits last. */
export const DEFAULT_FOLDERS: readonly { key: string; name: string; hint: string }[] = [
  {
    key: "inbox",
    name: "00 Inbox",
    hint: "Anything not filed yet. Files land here unless you choose a folder.",
  },
  {
    key: "incorporation",
    name: "01 Incorporation and registrations",
    hint: "Certificate of incorporation, MOA and AOA (every amended version), PAN and TAN letters, GST certificate, DPIIT recognition, Udyam, registered-office proof.",
  },
  {
    key: "meetings",
    name: "02 Board and shareholder meetings",
    hint: "Notices, agendas, signed minutes and resolutions, board and general meetings, with their MGT-14s.",
  },
  {
    key: "registers",
    name: "03 Statutory registers",
    hint: "Register of members, directors and KMP, charges, contracts with interested directors.",
  },
  {
    key: "cap_table",
    name: "04 Cap table and share issues",
    hint: "Cap table snapshots, PAS-3 for each allotment, valuation reports, share certificates, SAFE or CCPS papers, FEMA filings.",
  },
  {
    key: "team",
    name: "05 Founders, team and ESOP",
    hint: "Founders' agreement, offer letters, intern and contractor agreements with IP assignment, ESOP papers.",
  },
  {
    key: "contracts",
    name: "06 Contracts and NDAs",
    hint: "Pilot and customer agreements, NDAs, vendor terms, data licences, leases, insurance.",
  },
  {
    key: "ip",
    name: "07 IP, product and data",
    hint: "IP assignments, trademark papers, domain records, privacy policy and terms, security notes.",
  },
  {
    key: "finance",
    name: "08 Finance, tax and audit",
    hint: "Bank statements, invoices and bills, GST and TDS returns, ITR, financial statements, the model.",
  },
  {
    key: "mca",
    name: "09 MCA filings and compliance",
    hint: "AOC-4, MGT-7A, ADT-1, DIR-3 KYC, DPT-3 and every form filed with its SRN and challan; notices and replies.",
  },
  {
    key: "fundraising",
    name: "10 Fundraising and investors",
    hint: "Deck versions, the company report, one-pager, data-room index, term sheets, investor updates.",
  },
  {
    key: "leads",
    name: "11 Leads, lists and outreach",
    hint: "Lead files and where they came from, held-back lists, the waitlist's proof. Lead files here can feed All leads.",
  },
  {
    key: "brand",
    name: "12 Brand and marketing",
    hint: "Logos, brand guide, website copy, screenshots, press.",
  },
  {
    key: "kyc",
    name: "13 Directors' KYC",
    hint: "PAN, masked Aadhaar, passports, address proofs of directors. Keep these out of anything you send.",
  },
];

// ------------------------------------------------------------------ key dates

export const DATE_KINDS = {
  filing: "Filing",
  tax: "Tax payment",
  board: "Board meeting",
  renewal: "Renewal",
  other: "Other",
} as const;
export type DateKind = keyof typeof DATE_KINDS;

export const DATE_STATES = {
  coming_up: "Coming up",
  due_this_week: "Due this week",
  done: "Done",
  not_for_us: "Not for us",
} as const;

export const REPEATS = {
  never: "Never",
  monthly: "Every month",
  quarterly: "Every quarter",
  yearly: "Every year",
} as const;
export type Repeats = keyof typeof REPEATS;

export const REMIND_DAYS: readonly { days: 14 | 7 | 2 | 0; label: string }[] = [
  { days: 14, label: "14 days before" },
  { days: 7, label: "7 days before" },
  { days: 2, label: "2 days before" },
  { days: 0, label: "On the day" },
];

// ------------------------------------------------------------------ helpers

/** The label for a key, or the key's own words when it is one this file does not know. */
export function labelOf(
  table: Readonly<Record<string, string | Labelled>>,
  key: string | null | undefined,
  fallback = "Not given",
): string {
  if (!key) return fallback;
  const found = table[key];
  if (found === undefined) return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  return typeof found === "string" ? found : found.label;
}

/** The tone for a key, neutral when unknown. */
export function toneOf(
  table: Readonly<Record<string, Labelled>>,
  key: string | null | undefined,
): Tone {
  return (key && table[key]?.tone) || "neutral";
}
