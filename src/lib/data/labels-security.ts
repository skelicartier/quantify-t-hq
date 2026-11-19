/**
 * The registers' words (ws-notes/duties/spec.md §6.3–§6.5): incidents and CERT-In's list,
 * trademarks and the Registry's status words, domains and certificates. No `server-only`:
 * the service imports this file too, so every label lives here once.
 *
 * The incident kinds follow Annexure I of CERT-In's directions of 28 April 2022, checked
 * against the directions' PDF on 19 Nov 2026 (spec §14.7). The keys are stable; a label is
 * corrected here (one table) when the source says otherwise.
 */

import type { Labelled } from "./labels";

/** §2 rule 3: on every page that works out a statutory day or compares with an amount. */
export const REGISTER_ABOUT =
  "A record and a reminder, not legal, tax or accounting advice. Your CA keeps the books; nothing is filed from here.";

/** Shown wherever a rule-driven day would be, when no rule book answers in this copy. */
export const NO_RULE_BOOK = "The rule book is not loaded here.";

// ------------------------------------------------------------------ incidents

/** CERT-In's list (Annexure I, items i to xx in order), then "other", which is not on it. */
export const INCIDENT_KINDS = {
  scanning: "Targeted scanning or probing of critical networks or systems",
  compromise: "Compromise of critical systems or information",
  unauthorised_access: "Unauthorised access to IT systems or data",
  defacement: "Website defacement, or intrusion into a website with unauthorised changes",
  malware: "Malicious code: virus, worm, trojan, bots, spyware, ransomware, cryptominers",
  servers: "Attack on servers (database, mail, DNS) or network devices",
  phishing: "Identity theft, spoofing or phishing",
  dos: "Denial of service",
  infrastructure: "Attack on critical infrastructure, operational technology or wireless networks",
  applications: "Attack on applications such as e-governance or e-commerce",
  data_breach: "Data breach",
  data_leak: "Data leak",
  iot: "Attack on internet-of-things devices and their systems",
  payments: "Attack or incident affecting digital payment systems",
  malicious_apps: "Attack through malicious mobile apps",
  fake_apps: "Fake mobile apps",
  social_media: "Unauthorised access to social media accounts",
  cloud: "Attack or suspicious activity affecting cloud systems, servers, software or applications",
  emerging:
    "Attack or suspicious activity affecting big data, blockchain, virtual assets, robotics, 3D or 4D printing, or drones",
  ai: "Attack or suspicious activity affecting artificial intelligence or machine learning systems",
  other: "Something else (not on CERT-In's list)",
} as const;
export type IncidentKindKey = keyof typeof INCIDENT_KINDS;
export const INCIDENT_KIND_KEYS = Object.keys(INCIDENT_KINDS) as IncidentKindKey[];

/** On CERT-In's list: the 6-hour clock runs. Every kind but "other". */
export const isListedKind = (kind: string): boolean =>
  kind !== "other" && Object.prototype.hasOwnProperty.call(INCIDENT_KINDS, kind);

export const INCIDENT_SEVERITIES = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
} as const;
export type IncidentSeverityKey = keyof typeof INCIDENT_SEVERITIES;

export const INCIDENT_STATUSES: Record<"open" | "contained" | "resolved" | "closed", Labelled> = {
  open: { label: "Open", tone: "danger" },
  contained: { label: "Contained", tone: "attention" },
  resolved: { label: "Resolved", tone: "neutral" },
  closed: { label: "Closed", tone: "neutral" },
};

export const REPORT_CHANNELS = {
  email: "By email",
  phone: "By phone",
  fax: "By fax",
  form: "By the online form",
} as const;
export type ReportChannelKey = keyof typeof REPORT_CHANNELS;

/** How CERT-In takes a report (the directions, as the rule's note gives them). */
export const CERT_IN_REACH =
  "To CERT-In: incident@cert-in.org.in · 1800-11-4949 · fax 1800-11-6969.";

export const INCIDENTS_EMPTY =
  "No incidents logged. Log one the moment something looks wrong: a listed incident is reported to CERT-In within 6 hours of noticing it.";

export const RUNBOOKS_LINE =
  "A runbook names who calls CERT-In, the Board and customers for that kind of incident. Write them before they are needed.";

/** "What the report gives": a list to work from, never CERT-In's own form. */
export const REPORT_GIVES = [
  "Who is reporting and how to reach them",
  "When it was noticed and when it happened",
  "The kind of incident",
  "What is affected",
  "What was seen",
  "What has been done",
  "What help is needed",
] as const;

/** The incident's fields in words, for its activity lines (never their values). */
export const INCIDENT_FIELD_WORDS: Record<string, string> = {
  title: "What happened",
  summary: "Summary",
  kind: "Kind",
  severity: "Severity",
  personal_data: "Personal data",
  occurred_at: "When it happened",
  aware_at: "When it was noticed",
  systems: "What is affected",
  actions: "What has been done",
  lessons: "Lessons",
};

// ------------------------------------------------------------------ trademarks

export const MARK_STATUSES = {
  drafting: "Drafting",
  filed: "Filed",
  vienna: "Sent for Vienna codification",
  formalities_pass: "Formalities check passed",
  formalities_fail: "Formalities check failed",
  marked_for_exam: "Marked for examination",
  objected: "Objected",
  show_cause_hearing: "Ready for show-cause hearing",
  accepted: "Accepted",
  advertised_before_accepted: "Advertised before acceptance",
  accepted_and_advertised: "Accepted and advertised",
  opposed: "Opposed",
  registered: "Registered",
  refused: "Refused",
  abandoned: "Abandoned",
  withdrawn: "Withdrawn",
  removed: "Removed",
} as const;
export type MarkStatusKey = keyof typeof MARK_STATUSES;
export const MARK_STATUS_KEYS = Object.keys(MARK_STATUSES) as MarkStatusKey[];

/** Dead states end every clock except restoration after removal. */
export const DEAD_MARK_STATUSES: readonly MarkStatusKey[] = [
  "refused",
  "abandoned",
  "withdrawn",
  "removed",
];

export const MARK_KINDS = {
  word: "Word mark",
  device: "Device (logo)",
  combined: "Combined",
} as const;
export type MarkKindKey = keyof typeof MARK_KINDS;

/** The steps "Record a step" offers, in the order they happen. */
export const MARK_STEPS = {
  deficiency_notice: "Deficiency notice",
  deficiency_fixed: "Deficiency fixed",
  exam_report: "Examination report received",
  exam_reply: "Reply filed",
  hearing: "Hearing",
  journal: "Advertised in the Journal",
  opposition_notice: "Notice of opposition received",
  counter_statement: "Counter-statement filed",
  registered: "Registered",
} as const;
export type MarkStepKey = keyof typeof MARK_STEPS;

/** Each clock: its name in the Dates table and the verb "Next date" reads it with. */
export const MARK_CLOCKS = {
  deficiency: { label: "Remedy the deficiency", next: "Remedy by" },
  exam_reply: { label: "Reply to the examination report", next: "Reply by" },
  hearing: { label: "Show-cause hearing", next: "Hearing on" },
  opposition: { label: "Opposition window closes", next: "Opposition closes" },
  counter_statement: { label: "Counter-statement", next: "Counter-statement by" },
  expiry: { label: "Registration expires", next: "Expires" },
  renewal_opens: { label: "Renewal opens", next: "Renewal opens" },
  late_renewal_ends: { label: "Late renewal ends", next: "Late renewal by" },
  restoration_ends: { label: "Restoration ends", next: "Restore by" },
} as const;
export type MarkClockKey = keyof typeof MARK_CLOCKS;

export const MARKS_EMPTY =
  "No marks recorded. Add each mark once per class: the word mark and the logo are separate marks. Your trademark agent files them; HQ keeps the dates.";

export const WATCH_LINE =
  "A similar mark in the Journal can be opposed for four months from its Journal date. Your agent runs the watch; note each hit here.";

// ------------------------------------------------------------------ domains and certificates

export const DOMAIN_PURPOSES = {
  main: "The main domain",
  product: "A product",
  mail: "Mail",
  defensive: "Defensive",
  other: "Something else",
} as const;
export type DomainPurposeKey = keyof typeof DOMAIN_PURPOSES;

export const DMARC_STAGES = {
  "": "Not known",
  none: "None",
  quarantine: "Quarantine",
  reject: "Reject",
} as const;
export type DmarcKey = keyof typeof DMARC_STAGES;

export const PLATFORMS = { mac: "Mac", windows: "Windows", other: "Other" } as const;
export type PlatformKey = keyof typeof PLATFORMS;

export const DOMAINS_ABOUT =
  "A certificate's dates are read by connecting to the hostname on port 443 from this computer. Nothing else is sent.";

export const DOMAINS_EMPTY =
  "No domains recorded. Add every domain the company owns, the defensive ones too: a lapsed or hijacked domain takes mail, the site and sign-in with it, and is a CERT-In incident.";
export const HOSTS_EMPTY =
  "No hostnames recorded. Add each public name: the website, the downloads, the status page.";
export const SIGNING_EMPTY =
  "No signing certificates recorded. Add the Mac and Windows certificates the app is signed with: a new one can take weeks to arrive.";
export const SECURITY_TXT_EMPTY =
  "Not recorded. A security.txt file tells a researcher where to report a problem; its Expires line has to be renewed.";

export const EXPIRY_STATES: Record<"ok" | "soon" | "overdue" | "unknown", Labelled> = {
  ok: { label: "In date", tone: "neutral" },
  soon: { label: "Renew soon", tone: "attention" },
  overdue: { label: "Expired", tone: "danger" },
  unknown: { label: "Not known", tone: "neutral" },
};

/** The four registers of the Summary, in the strip's order. */
export const REGISTER_ROWS = {
  incidents: "Incidents",
  marks: "Trademarks",
  domains: "Domains and certificates",
  holidays: "Holidays",
} as const;
