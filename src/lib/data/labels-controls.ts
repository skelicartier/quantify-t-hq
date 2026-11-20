/**
 * The words the security batch shares between the service and the pages
 * (ws-notes/security/spec.md §3.2): the control references a page prints beside a clock or
 * a check, each with its source and the day it was checked; HQ's default intervals; the
 * expected policy set; severities; and a few sentences and counts. Pure: no file, no clock.
 * A tracker's reading of standards and secondary sources, not legal or certification advice.
 */

export type ControlSource = { name: string; url: string };

/** The day the sources below were read. */
export const CONTROLS_CHECKED = "2026-11-20";

export const CONTROL_SOURCES = {
  isoAnnexA: {
    name: "ISMS.online: ISO 27001:2022 Annex A",
    url: "https://www.isms.online/iso-27001/annex-a-2022/",
  },
  isoReview: {
    name: "ISMS.online: clause 9.3, management review",
    url: "https://www.isms.online/iso-27001/requirements-2022/9-3-management-review-2022/",
  },
  accessRights: {
    name: "ISMS.online: A.5.18 access rights",
    url: "https://www.isms.online/iso-27001/annex-a/5-18-access-rights-2022/",
  },
  advisera: {
    name: "Advisera: documents for ISO 27001:2022",
    url: "https://advisera.com/27001academy/knowledgebase/list-of-mandatory-documents-required-by-iso-27001-revision/",
  },
  backup: {
    name: "HighTable: A.8.13 information backup",
    url: "https://hightable.io/iso-27001-annex-a-8-13-information-backup",
  },
  certIn: {
    name: "CERT-In: Directions of 28 April 2022",
    url: "https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf",
  },
  certInFaq: {
    name: "CERT-In: FAQs on the directions, May 2022",
    url: "https://www.cert-in.org.in/PDF/FAQs_on_CyberSecurityDirections_May2022.pdf",
  },
  ia: {
    name: "The Investment Association: Engine blueprint 2026",
    url: "https://www.theia.org/sites/default/files/2026-04/Engine%20Blueprint%20Paper.pdf",
  },
  tcsaIso: {
    name: "TCSA: ISO 27001 cost in India 2026",
    url: "https://www.tcsa.in/resources/iso-27001-cost-india-2026",
  },
  devices: {
    name: "Vanta: what a device monitor checks",
    url: "https://help.vanta.com/en/articles/11345405-what-information-does-the-vanta-device-monitor-query",
  },
  cscrf: {
    name: "Legal500: SEBI's CSCRF clarifications",
    url: "https://www.legal500.com/intelligence/india/corporate-commercial-law/navigating-sebi%27s-cybersecurity-and-cyber-resilience-framework-key-clarifications-for-sebi-regulated-entities",
  },
  dora: {
    name: "DORA, Article 30",
    url: "https://www.springlex.eu/en/packages/dora/dora-regulation/article-30/",
  },
  star: { name: "CSA: STAR levels", url: "https://cloudsecurityalliance.org/star/levels" },
  ccm: {
    name: "CSA: Cloud Controls Matrix and CAIQ",
    url: "https://cloudsecurityalliance.org/research/cloud-controls-matrix/",
  },
  dependabot: {
    name: "GitHub Docs: Dependabot alerts",
    url: "https://docs.github.com/en/rest/dependabot/alerts?apiVersion=2022-11-28",
  },
  ghApi: { name: "GitHub CLI manual: gh api", url: "https://cli.github.com/manual/gh_api" },
} as const;

// ------------------------------------------------------------------ control references

export type ControlKey =
  | "a5_1"
  | "a5_9"
  | "a5_10"
  | "a5_15"
  | "a5_18"
  | "a5_19"
  | "a5_20"
  | "a5_21"
  | "a5_22"
  | "a5_23"
  | "a5_24"
  | "a5_26"
  | "a5_29"
  | "a5_30"
  | "a5_34"
  | "a5_35"
  | "a6_7"
  | "a8_1"
  | "a8_8"
  | "a8_13"
  | "a8_15"
  | "a8_17"
  | "a8_25"
  | "a8_29"
  | "c9_3"
  | "certin_i"
  | "certin_iv"
  | "certin_q35"
  | "certin_q42"
  | "cscrf"
  | "dora_30"
  | "star_l1";

/** What a page prints beside a clock or a check: "ISO/IEC 27001:2022 A.5.18 Access rights". */
export type ControlRef = {
  key: ControlKey;
  /** "ISO/IEC 27001:2022 A.5.18", "CERT-In direction (iv)". */
  ref: string;
  title: string;
  sources: readonly ControlSource[];
  checked: string;
};

function iso(key: ControlKey, number: string, title: string, extra: ControlSource[] = []) {
  return {
    key,
    ref: `ISO/IEC 27001:2022 A.${number}`,
    title,
    sources: [CONTROL_SOURCES.isoAnnexA, ...extra],
    checked: CONTROLS_CHECKED,
  } satisfies ControlRef;
}

function other(key: ControlKey, ref: string, title: string, sources: ControlSource[]) {
  return { key, ref, title, sources, checked: CONTROLS_CHECKED } satisfies ControlRef;
}

export const CONTROL_REFS: Readonly<Record<ControlKey, ControlRef>> = {
  a5_1: iso("a5_1", "5.1", "Policies for information security", [CONTROL_SOURCES.advisera]),
  a5_9: iso("a5_9", "5.9", "Inventory of information and other associated assets"),
  a5_10: iso("a5_10", "5.10", "Acceptable use of information and other associated assets"),
  a5_15: iso("a5_15", "5.15", "Access control"),
  a5_18: iso("a5_18", "5.18", "Access rights", [CONTROL_SOURCES.accessRights]),
  a5_19: iso("a5_19", "5.19", "Information security in supplier relationships"),
  a5_20: iso("a5_20", "5.20", "Addressing information security within supplier agreements"),
  a5_21: iso("a5_21", "5.21", "Managing information security in the ICT supply chain"),
  a5_22: iso("a5_22", "5.22", "Monitoring, review and change management of supplier services"),
  a5_23: iso("a5_23", "5.23", "Information security for use of cloud services"),
  a5_24: iso("a5_24", "5.24", "Information security incident management planning and preparation"),
  a5_26: iso("a5_26", "5.26", "Response to information security incidents"),
  a5_29: iso("a5_29", "5.29", "Information security during disruption"),
  a5_30: iso("a5_30", "5.30", "ICT readiness for business continuity"),
  a5_34: iso("a5_34", "5.34", "Privacy and protection of PII"),
  a5_35: iso("a5_35", "5.35", "Independent review of information security"),
  a6_7: iso("a6_7", "6.7", "Remote working"),
  a8_1: iso("a8_1", "8.1", "User endpoint devices"),
  a8_8: iso("a8_8", "8.8", "Management of technical vulnerabilities"),
  a8_13: iso("a8_13", "8.13", "Information backup", [CONTROL_SOURCES.backup]),
  a8_15: iso("a8_15", "8.15", "Logging"),
  a8_17: iso("a8_17", "8.17", "Clock synchronization"),
  a8_25: iso("a8_25", "8.25", "Secure development life cycle"),
  a8_29: iso("a8_29", "8.29", "Security testing in development and acceptance"),
  c9_3: other("c9_3", "ISO/IEC 27001:2022 clause 9.3", "Management review", [
    CONTROL_SOURCES.isoReview,
  ]),
  certin_i: other("certin_i", "CERT-In direction (i)", "Clocks set from NIC or NPL time servers", [
    CONTROL_SOURCES.certIn,
  ]),
  certin_iv: other("certin_iv", "CERT-In direction (iv)", "Logs kept for a rolling 180 days", [
    CONTROL_SOURCES.certIn,
  ]),
  certin_q35: other("certin_q35", "CERT-In FAQ 35", "Logs stored outside India", [
    CONTROL_SOURCES.certInFaq,
  ]),
  certin_q42: other("certin_q42", "CERT-In FAQ 42", "A cloud's own time service", [
    CONTROL_SOURCES.certInFaq,
  ]),
  cscrf: other("cscrf", "SEBI CSCRF", "What a regulated entity passes to its vendors", [
    CONTROL_SOURCES.cscrf,
  ]),
  dora_30: other("dora_30", "DORA Article 30", "Key contractual provisions", [
    CONTROL_SOURCES.dora,
  ]),
  star_l1: other("star_l1", "CSA STAR Level 1", "A self-assessment with the CAIQ", [
    CONTROL_SOURCES.star,
    CONTROL_SOURCES.ccm,
  ]),
};

// ------------------------------------------------------------------ CERT-In, as the FAQ reads it

/** The time servers CERT-In's FAQ (Q 43, May 2022) names. */
export const NIC_TIME_SERVERS = ["samay1.nic.in", "samay2.nic.in"] as const;
export const NPL_TIME_SERVERS = ["time.nplindia.org"] as const;

/** The two readings on where logs are kept: the sources disagree, so both are printed. */
export const LOG_PLACE_READINGS = [
  {
    label: "Within India",
    words:
      "Direction (iv): logs are kept for a rolling 180 days and maintained within the Indian jurisdiction.",
    sources: [CONTROL_SOURCES.certIn],
  },
  {
    label: "Outside India, if produced in time",
    words:
      "FAQ 35: logs may be stored outside India as long as they can be produced to CERT-In in a reasonable time.",
    sources: [CONTROL_SOURCES.certInFaq],
  },
] as const;

/** The kinds of log CERT-In's FAQ (Q 37) gives as examples, in the house's words. */
export const LOG_KINDS = {
  application: "Application",
  web: "Web server",
  database: "Database",
  mail: "Mail server",
  sign_in: "Sign-in and audit",
  cloud: "The cloud provider's activity log",
  firewall: "Firewall",
  vpn: "VPN",
  ssh: "SSH",
  other: "Other",
} as const;
export type LogKind = keyof typeof LOG_KINDS;

// ------------------------------------------------------------------ HQ's default intervals

export type PracticeKey =
  | "tool_review"
  | "device_check"
  | "log_check"
  | "restore_test"
  | "pen_test"
  | "fix_critical"
  | "fix_high"
  | "fix_medium"
  | "fix_low"
  | "management_review"
  | "surveillance"
  | "certificate_life"
  | "answer_review";

/** An interval HQ works days out with. His own amount, kept in the module's setup, replaces it. */
export type Practice = {
  key: PracticeKey;
  title: string;
  amount: number;
  unit: "days" | "months";
  /**
   * How it reads: "every" repeats (a check, a review: "Every 3 months"), "within" runs once from
   * a day (a fix-by window: "Within 7 days"), "lasts" is how long something lasts, which its
   * source sets (a certificate: "36 months").
   */
  kind: "every" | "within" | "lasts";
  /** Empty for HQ's own default, which no source sets. */
  sources: readonly ControlSource[];
  checked: string;
  note: string;
};

function practice(
  key: PracticeKey,
  title: string,
  amount: number,
  unit: Practice["unit"],
  sources: ControlSource[],
  note: string,
  kind: Practice["kind"] = "every",
): Practice {
  return { key, title, amount, unit, kind, sources, checked: CONTROLS_CHECKED, note };
}

const FIX_NOTE = "A fix-by window. A customer's contract can make it shorter.";

export const PRACTICES: Readonly<Record<PracticeKey, Practice>> = {
  tool_review: practice(
    "tool_review",
    "Look at each tool again",
    12,
    "months",
    [],
    "Once a year: its sign-in, the data it holds and its terms.",
  ),
  device_check: practice(
    "device_check",
    "A device's self-check",
    1,
    "months",
    [CONTROL_SOURCES.devices],
    "Once a month, until a device agent reads the same checks.",
  ),
  log_check: practice(
    "log_check",
    "Look at a system's logs and clock",
    3,
    "months",
    [],
    "Once a quarter.",
  ),
  restore_test: practice(
    "restore_test",
    "Restore a backup to prove it works",
    3,
    "months",
    [CONTROL_SOURCES.backup],
    "Auditors commonly expect a restore test at least once a year, and each quarter for critical systems.",
  ),
  pen_test: practice(
    "pen_test",
    "A penetration test",
    12,
    "months",
    [CONTROL_SOURCES.ia],
    "Buyers expect one at least once a year and after every large change.",
  ),
  fix_critical: practice(
    "fix_critical",
    "Fix a critical finding",
    7,
    "days",
    [],
    FIX_NOTE,
    "within",
  ),
  fix_high: practice("fix_high", "Fix a high finding", 30, "days", [], FIX_NOTE, "within"),
  fix_medium: practice("fix_medium", "Fix a medium finding", 90, "days", [], FIX_NOTE, "within"),
  fix_low: practice("fix_low", "Fix a low finding", 180, "days", [], FIX_NOTE, "within"),
  management_review: practice(
    "management_review",
    "A management review",
    12,
    "months",
    [CONTROL_SOURCES.isoReview],
    "The standard says at planned intervals; once a year is common.",
  ),
  surveillance: practice(
    "surveillance",
    "A surveillance audit",
    12,
    "months",
    [CONTROL_SOURCES.tcsaIso],
    "In the second and third years of a certificate. Your certification body sets the days.",
  ),
  certificate_life: practice(
    "certificate_life",
    "An ISO 27001 certificate lasts",
    36,
    "months",
    [CONTROL_SOURCES.tcsaIso],
    "Three years; the expiry date on the certificate decides.",
    "lasts",
  ),
  answer_review: practice(
    "answer_review",
    "Look at an approved answer again",
    12,
    "months",
    [],
    "An approved answer is read again a year after it was approved.",
  ),
};

// ------------------------------------------------------------------ the expected policies

export const POLICY_KEYS = [
  "security",
  "continuity",
  "disaster_recovery",
  "incident_response",
  "access_control",
  "backup",
  "personal_devices",
  "acceptable_use",
  "secure_development",
  "supplier_code",
  "data_protection",
] as const;
export type PolicyKey = (typeof POLICY_KEYS)[number];
export const isPolicyKey = (value: unknown): value is PolicyKey =>
  typeof value === "string" && (POLICY_KEYS as readonly string[]).includes(value);

/** HQ lists the set and which Files document is each; it never writes one. */
export const POLICY_SET: Readonly<
  Record<
    PolicyKey,
    { title: string; controls: readonly ControlKey[]; trust: string | null; why: string }
  >
> = {
  security: {
    title: "Information security policy",
    controls: ["a5_1"],
    trust: "infosec_policy",
    why: "How the company protects its systems and data. Every buyer asks for it first.",
  },
  continuity: {
    title: "Business continuity plan",
    controls: ["a5_29", "a5_30"],
    trust: "continuity",
    why: "How the work carries on through an outage.",
  },
  disaster_recovery: {
    title: "Disaster recovery plan",
    controls: ["a5_30"],
    trust: "continuity",
    why: "How systems come back, in what order, and who does it.",
  },
  incident_response: {
    title: "Incident response plan",
    controls: ["a5_24", "a5_26"],
    trust: "incident_policy",
    why: "Who does what in the first hours, and who tells CERT-In, the Board and customers.",
  },
  access_control: {
    title: "Access control policy",
    controls: ["a5_15", "a5_18"],
    trust: "access_policy",
    why: "Who gets access to what, how it is granted and how it is taken away.",
  },
  backup: {
    title: "Backup policy",
    controls: ["a8_13"],
    trust: null,
    why: "What is backed up, how often, where, and how restores are tested.",
  },
  personal_devices: {
    title: "Personal devices policy",
    controls: ["a8_1", "a6_7"],
    trust: null,
    why: "What a personal laptop or phone must have before it is used for work.",
  },
  acceptable_use: {
    title: "Acceptable use policy",
    controls: ["a5_10"],
    trust: null,
    why: "What company systems and data may and may not be used for.",
  },
  secure_development: {
    title: "Secure development policy",
    controls: ["a8_25"],
    trust: null,
    why: "How code is written, reviewed, tested and released.",
  },
  supplier_code: {
    title: "Supplier code of conduct",
    controls: ["a5_19", "a5_20"],
    trust: null,
    why: "What the company asks of its own suppliers. Buyers list it among the documents they want.",
  },
  data_protection: {
    title: "Data protection and privacy policy",
    controls: ["a5_34"],
    trust: "data_policy",
    why: "What personal and client data is held, where, for how long, and who sees it.",
  },
};

// ------------------------------------------------------------------ severities

export const SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const isSeverity = (value: unknown): value is Severity =>
  typeof value === "string" && (SEVERITIES as readonly string[]).includes(value);
export const SEVERITY_WORDS: Readonly<Record<Severity, string>> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

// ------------------------------------------------------------------ sentences and counts

/** The About line of every Systems and Assurance page, and of the questionnaire pages. */
export const NOT_ADVICE =
  "A record and a reminder, not legal or certification advice. Nothing is sent, filed or published from here.";

/** What an Admin reads where an Owner-only part is left out. */
export const OWNER_LEFT_OUT =
  "Who each account and device belongs to in the people ledger, and the days worked out from a last day, are for the Owner only. They are left out here.";

/** "Devices is not loaded here." */
export const notLoaded = (what: string): string => `${what} is not loaded here.`;

const number = (value: number): string => Math.trunc(value).toLocaleString("en-GB");

/** (1, "tool") → "1 tool"; (3, "tool") → "3 tools"; (2, "policy", "policies") → "2 policies". */
export function countWords(count: number, one: string, many = `${one}s`): string {
  return `${number(count)} ${count === 1 ? one : many}`;
}

/** (38, 200, "answered") → "38 of 200 answered"; (0, 0, "answered") → "0 of 0 answered". A count, never a bar. */
export function ofWords(count: number, total: number, what: string): string {
  return `${number(count)} of ${number(total)} ${what}`;
}

/** (7, "days") → "7 days"; (1, "months") → "1 month"; (12, "months") → "12 months". */
export function spanOf(amount: number, unit: "days" | "months"): string {
  return countWords(amount, unit === "days" ? "day" : "month");
}

/** (1, "months") → "every month"; (12, "months") → "every year"; (3, "months") → "every 3 months". */
export function everyWords(amount: number, unit: "days" | "months"): string {
  if (unit === "months" && amount === 1) return "every month";
  if (unit === "months" && amount === 12) return "every year";
  if (unit === "days" && amount === 1) return "every day";
  return `every ${spanOf(amount, unit)}`;
}
