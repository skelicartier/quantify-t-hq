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
  action: "Action",
  meeting: "Meeting",
  agreement: "Agreement",
  person: "People",
  pilot: "Pilot",
  diligence: "Diligence",
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
  | "review"
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
  review: { label: "Needs review", tone: "attention" },
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
  "review",
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
  | "replied_positive"
  | "meeting_request"
  | "not_interested"
  | "not_now"
  | "out_of_office"
  | "wrong_person"
  | "question"
  | "needs_review";

/** HQ's own words for a reply (map-crm-overlap §1), plus the new "Question". */
export const OUTCOMES: Record<Outcome, Labelled> = {
  replied_positive: { label: "Interested", tone: "live" },
  meeting_request: { label: "Meeting request", tone: "live" },
  not_interested: { label: "Not interested", tone: "neutral" },
  not_now: { label: "Not now", tone: "attention" },
  out_of_office: { label: "Out of office", tone: "neutral" },
  wrong_person: { label: "Wrong person", tone: "neutral" },
  question: { label: "Question", tone: "attention" },
  needs_review: { label: "Needs review", tone: "attention" },
};

export const OUTCOME_ORDER: readonly Outcome[] = [
  "replied_positive",
  "meeting_request",
  "not_interested",
  "not_now",
  "out_of_office",
  "wrong_person",
  "question",
  "needs_review",
];

export const TAKEN_BACK: Labelled = { label: "Taken back", tone: "neutral" };

export const FOLLOW_UP_KINDS = {
  answer: "Answer a question",
  write_again: "Write again",
  write_to_named: "Write to someone named",
  find_address: "Find an address",
  review: "Decide what a reply means",
  other: "Other",
} as const;
export type FollowUpKind = keyof typeof FOLLOW_UP_KINDS;

export const FOLLOW_UP_STATES = {
  open: "Open",
  done: "Done",
  closed_by_send: "Done: written to again",
  taken_back: "Taken back",
} as const;

/** The outcomes that count as a yes: on the overview, in Numbers, and for the answer to copy. */
export const POSITIVE_OUTCOMES: readonly Outcome[] = ["replied_positive", "meeting_request"];

export const FIRM_HOLD_REASON = "Someone at the firm replied";

export const CALENDAR_DETAIL = {
  full: "Full titles, with the names of people and firms",
  plain: "Kinds only, such as “Investor next step” and “Follow-up”",
} as const;
export type CalendarDetail = keyof typeof CALENDAR_DETAIL;

export const AGENDA_SOURCE_LABELS = {
  dates: "Key dates",
  investors: "Investors",
  waitlist: "Waitlist",
  replies: "Follow-ups",
  files: "Files",
  notes: "Notes",
  meetings: "Meetings",
  agreements: "Agreements",
  pilots: "Pilots",
  diligence: "Diligence",
} as const;

export const DATA_SEARCH_KINDS = {
  lead: "All leads",
  investor: "Investors",
  file: "Files",
  note: "Notes",
  faq: "Investor FAQ",
  decision: "Decisions",
  contact: "Contacts",
  meeting: "Meetings",
  agreement: "Agreements",
  member: "Members",
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

// ------------------------------------------------------------------ the raise

export const STAGE_FOCUS = {
  pre_seed: "Pre-seed",
  seed: "Seed",
  series_a: "Series A",
  later: "Later",
} as const;
export type StageFocus = keyof typeof STAGE_FOCUS;

export const GEOGRAPHIES = {
  india: "India",
  us: "United States",
  uk_europe: "UK and Europe",
  asia: "Asia",
  global: "Anywhere",
} as const;
export type Geography = keyof typeof GEOGRAPHIES;

export const LEAD_OR_FOLLOW = {
  lead: "Leads rounds",
  follow: "Follows",
  either: "Either",
} as const;
export type LeadOrFollow = keyof typeof LEAD_OR_FOLLOW;

export const RESIDENCY = {
  resident: "Resident in India",
  non_resident: "Not resident in India",
} as const;
export type Residency = keyof typeof RESIDENCY;

export const INDIA_OK = { yes: "Yes", no: "No" } as const;

export type IntroStatus = "none" | "to_ask" | "asked" | "made" | "declined";
export const INTRO_STATUSES: Record<IntroStatus, Labelled> = {
  none: { label: "No introduction", tone: "neutral" },
  to_ask: { label: "To ask for", tone: "attention" },
  asked: { label: "Asked", tone: "attention" },
  made: { label: "Made", tone: "live" },
  declined: { label: "Declined", tone: "neutral" },
};

export const CAP_BASIS = { post_money: "Post-money", pre_money: "Pre-money" } as const;

export const INVESTOR_VIEWS = { firms: "Firms", funnel: "Funnel", round: "The round" } as const;

/** Days in one stage before a firm is called stale on the funnel. */
export const STALE_DAYS = 14;
export const NOT_KNOWN = "Not known";

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

// ------------------------------------------------------------------ numbers and packs

export const NUMBERS_ROWS = {
  yeses: "People who said yes",
  firms_joined: "Firms joined the waitlist",
  named_buyers: "Of them, named buyer firms",
  calls_booked: "Calls booked",
  calls_held: "Calls held",
  pilots_started: "Pilots started",
  first_investor_meetings: "First investor meetings",
} as const;
export type NumbersRow = keyof typeof NUMBERS_ROWS;

/** Cash and burn older than this many days are not used. */
export const MONEY_STALE_DAYS = 35;

export type UpdateStatus = "draft" | "frozen" | "handed_over";
export const UPDATE_STATUSES: Record<UpdateStatus, Labelled> = {
  draft: { label: "Draft", tone: "neutral" },
  frozen: { label: "Numbers frozen", tone: "attention" },
  handed_over: { label: "Handed to Mail merge", tone: "live" },
};
export const UPDATE_DEFAULT_STAGES = ["money_in", "signed", "soft", "set_aside"] as const;

export type PackNeed = "required" | "expected" | "if_any";
export const PACK_CHECKLIST = {
  deck: { label: "Pitch deck", need: "required", why: "The deck you pitch from." },
  team: {
    label: "Team",
    need: "required",
    why: "Who the founders and first people are, and what each has done.",
  },
  roadmap: {
    label: "Roadmap to the next round",
    need: "required",
    why: "What the money does in the next 12 to 18 months.",
  },
  cap_table: {
    label: "Cap table",
    need: "expected",
    why: "One file that nothing else in the room contradicts.",
  },
  pilot_data: {
    label: "Pilot or beta data",
    need: "if_any",
    why: "Anything real from a pilot or a beta, once there is some.",
  },
  burn: { label: "Monthly spend and burn", need: "if_any", why: "Once there is spending to show." },
} as const satisfies Record<string, { label: string; need: PackNeed; why: string }>;
export type PackCover = keyof typeof PACK_CHECKLIST | "other";
export const PACK_NEEDS: Record<PackNeed, string> = {
  required: "Needed",
  expected: "Expected",
  if_any: "When there is some",
};
export const PACK_SHARE_HOW = {
  mailbox: "Sent the zip from my mailbox",
  meeting: "Shown in a meeting",
  link: "As a link from another service",
} as const;
export type PackShareHow = keyof typeof PACK_SHARE_HOW;

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
  in_progress: "In progress",
  done: "Done",
  not_for_us: "Not for us",
  taken_back: "Taken back",
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

// ------------------------------------------------------------------ notes, decisions and contacts

export const NOTE_KINDS = {
  call: "Call",
  meeting: "Meeting",
  email: "Email",
  note: "Note",
} as const;
export type NoteKind = keyof typeof NOTE_KINDS;

export const NOTE_SUBJECTS = { investor: "Investor", waitlist: "Waitlist" } as const;

export const NOTES_VIEWS = { notes: "Notes", actions: "Actions", faq: "Investor FAQ" } as const;

export type DecisionStatus = "proposed" | "decided" | "superseded" | "dropped";
export const DECISION_STATUSES: Record<DecisionStatus, Labelled> = {
  proposed: { label: "Proposed", tone: "attention" },
  decided: { label: "Decided", tone: "live" },
  superseded: { label: "Superseded", tone: "neutral" },
  dropped: { label: "Dropped", tone: "neutral" },
};
export const DECISION_STATUS_ORDER: readonly DecisionStatus[] = [
  "decided",
  "proposed",
  "superseded",
  "dropped",
];

export type ContactRole = "ca" | "cs" | "lawyer" | "bank" | "auditor" | "introducer" | "other";
export const CONTACT_ROLES: Record<ContactRole, string> = {
  ca: "Chartered accountant",
  cs: "Company secretary",
  lawyer: "Lawyer",
  bank: "Bank",
  auditor: "Auditor",
  introducer: "Introducer",
  other: "Other",
};
export const CONTACT_ROLE_ORDER: readonly ContactRole[] = [
  "ca",
  "cs",
  "lawyer",
  "bank",
  "auditor",
  "introducer",
  "other",
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
