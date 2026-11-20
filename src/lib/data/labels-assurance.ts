/**
 * Assurance's words (ws-notes/security/spec.md §8): policies, pen tests and findings with the
 * dependency-alert import, certification, insurance, management reviews and the Summary. No
 * `server-only`: the service imports this file too, so every label lives here once. Pure: no
 * file, no clock. A record and a reminder, not legal or certification advice.
 */

import type { Labelled } from "./labels";
import { dayWords } from "./labels-company";
import { countWords } from "./labels-controls";

// ------------------------------------------------------------------ findings

export const FINDING_SOURCE_KEYS = ["pen_test", "dependabot", "self", "customer", "other"] as const;
export type FindingSourceKey = (typeof FINDING_SOURCE_KEYS)[number];

/** Where a finding came from. The code host's alerts are "dependency alerts", never its name. */
export const FINDING_SOURCES: Readonly<Record<FindingSourceKey, string>> = {
  pen_test: "Pen test",
  dependabot: "Dependency alert",
  self: "Found by us",
  customer: "A customer",
  other: "Something else",
};

export const FINDING_STATUS_KEYS = ["open", "fixed", "accepted", "dismissed"] as const;
export type FindingStatusKey = (typeof FINDING_STATUS_KEYS)[number];

export const FINDING_STATUSES: Readonly<Record<FindingStatusKey, Labelled>> = {
  open: { label: "Open", tone: "attention" },
  fixed: { label: "Fixed", tone: "live" },
  accepted: { label: "Risk accepted", tone: "neutral" },
  dismissed: { label: "Dismissed", tone: "neutral" },
};

export const PEN_TEST_KINDS = { third_party: "Third party", in_house: "In house" } as const;
export type PenTestKind = keyof typeof PEN_TEST_KINDS;
/** "Last penetration test: report 2 Oct 2026 by Walk Testers, a third party." */
export const PEN_TEST_KIND_WORDS: Readonly<Record<PenTestKind, string>> = {
  third_party: "a third party",
  in_house: "in house",
};

/** The code host's dismissal reasons, in words. */
export const DISMISS_REASONS: Readonly<Record<string, string>> = {
  fix_started: "A fix is under way",
  inaccurate: "Not accurate",
  no_bandwidth: "No time to fix it",
  not_used: "The code is not used",
  tolerable_risk: "The risk is acceptable",
};

export const HOST_STATE_KEYS = ["open", "fixed", "dismissed", "auto_dismissed"] as const;
export type HostState = (typeof HOST_STATE_KEYS)[number];
export const HOST_STATES: Readonly<Record<HostState, string>> = {
  open: "Open",
  fixed: "Fixed",
  dismissed: "Dismissed",
  auto_dismissed: "Dismissed by the code host",
};

/** Who decided, for a dismissal that came with an alert. */
export const CODE_HOST = "The code host";

/** The command he runs in the product's folder. The one place the code host's tool is named. */
export const GH_COMMAND =
  'gh api --paginate --slurp "repos/{owner}/{repo}/dependabot/alerts?per_page=100" > dependabot-alerts.json';

export const IMPORT_LINE =
  "Save the alerts with this command in the product's folder, then choose the file. The command uses your own sign-in on the code host; HQ never connects to it.";

export const NO_PROFILES =
  "Customer duties are not loaded here, so no contract shortens these days.";

export const PEN_TESTS_EMPTY =
  "No penetration test recorded. Buyers expect one at least once a year: a third party's, or one from someone in the team with security experience while you are starting out.";

export const FINDINGS_EMPTY =
  "No findings. Add what a test, a customer or you found, or import the dependency alerts.";

export const STILL_OPEN_ON_HOST = "Still open on the code host.";
export const NO_REPORT = "No report attached.";
export const NOT_EMPANELLED = "Tested by someone CERT-In has not empanelled, or it is not known.";
export const RETEST_NOT_DONE = "The retest is not done.";
export const NO_PEN_TEST = "No penetration test recorded.";

/** How a customer's duty in force reads beside the windows: "high-severity missing patches within 1 week". */
export const SHORTENS: Readonly<Record<string, string>> = {
  "cscrf-patch": "high-severity missing patches within 1 week",
  "cscrf-vapt": "findings from a penetration test within 3 months",
};

/** "Walk Capital (high-severity missing patches within 1 week)", joined; "" for none. */
export function shortensWords(inForce: readonly { firm: string; key: string }[]): string {
  const byFirm = new Map<string, string[]>();
  for (const duty of inForce) {
    const list = byFirm.get(duty.firm) ?? [];
    const words = SHORTENS[duty.key] ?? duty.key;
    if (!list.includes(words)) list.push(words);
    byFirm.set(duty.firm, list);
  }
  const parts = [...byFirm.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([firm, words]) => `${firm} (${words.join("; ")})`);
  return parts.length ? `Customers' contracts shorten some of these: ${parts.join(", ")}.` : "";
}

/** "7, 30, 90 and 180" */
export function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** A sentence's first letter lowered: "High-severity …" → "high-severity …". */
export const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

/** "1 day", "3 days" after a fix-by day. */
export const lateWords = (days: number): string => countWords(days, "day");

/** The preview's sentence: "3 alerts in walk-org/walk-app: 2 new, 1 changed, 0 unchanged." */
export function previewWords(input: {
  alerts: number;
  repos: readonly string[];
  new: number;
  changed: number;
  unchanged: number;
}): string {
  const where = input.repos.length ? ` in ${listWords([...input.repos])}` : "";
  return `${countWords(input.alerts, "alert")}${where}: ${input.new} new, ${input.changed} changed, ${input.unchanged} unchanged.`;
}

// ------------------------------------------------------------------ policies

export const POLICY_STATE_KEYS = [
  "current",
  "review_soon",
  "lapsed",
  "no_review",
  "no_document",
  "trashed",
  "not_needed",
  "unknown",
] as const;
export type PolicyStateKey = (typeof POLICY_STATE_KEYS)[number];

export const POLICY_STATES: Readonly<Record<PolicyStateKey, Labelled>> = {
  current: { label: "Current", tone: "live" },
  review_soon: { label: "Review soon", tone: "attention" },
  lapsed: { label: "Lapsed", tone: "danger" },
  no_review: { label: "No review date", tone: "attention" },
  no_document: { label: "No document", tone: "neutral" },
  trashed: { label: "In the trash", tone: "danger" },
  not_needed: { label: "Not needed", tone: "neutral" },
  unknown: { label: "Not known here", tone: "neutral" },
};

export const POLICIES_ABOUT =
  "HQ lists the policies a buyer asks for and which document in Files is each. It writes none: buy a consultant's starter pack, keep each document in Files with a review date, and link it here.";

/** Days before a review date that a policy reads "Review due", inclusive. */
export const REVIEW_SOON_DAYS = 30;

// ------------------------------------------------------------------ certification

export const CERT_STANDARDS = {
  iso27001: "ISO 27001",
  soc2: "SOC 2",
  other: "Something else",
} as const;
export type CertStandard = keyof typeof CERT_STANDARDS;

export const CERT_STATUS_KEYS = [
  "planning",
  "stage1",
  "stage2",
  "certified",
  "lapsed",
  "withdrawn",
] as const;
export type CertStatus = (typeof CERT_STATUS_KEYS)[number];
export const CERT_STATUSES: Readonly<Record<CertStatus, Labelled>> = {
  planning: { label: "Planning", tone: "neutral" },
  stage1: { label: "Stage 1", tone: "attention" },
  stage2: { label: "Stage 2", tone: "attention" },
  certified: { label: "Certified", tone: "live" },
  lapsed: { label: "Lapsed", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

export const SOC2_REPORTS = { type1: "Type 1", type2: "Type 2" } as const;

export const CERTIFICATION_ABOUT =
  "Buyers accept a first-year company ‘working towards’ ISO 27001 with an auditor named; the certificate itself is bought when a buyer asks for it.";
export const CERTIFICATION_EMPTY =
  "No certification recorded. Record the first step when you choose a consultant or a certification body.";
export const NO_CERTIFICATION =
  "No certification recorded. Buyers accept ‘working towards’ with an auditor named.";

// ------------------------------------------------------------------ insurance

export const INSURANCE_KIND_KEYS = [
  "cyber",
  "professional_indemnity",
  "public_liability",
  "employers_liability",
  "crime",
  "directors_officers",
  "other",
] as const;
export type InsuranceKind = (typeof INSURANCE_KIND_KEYS)[number];
export const INSURANCE_KINDS: Readonly<Record<InsuranceKind, string>> = {
  cyber: "Cyber",
  professional_indemnity: "Professional indemnity",
  public_liability: "Public liability",
  employers_liability: "Employers' liability",
  crime: "Crime",
  directors_officers: "Directors and officers",
  other: "Something else",
};
export const INSURANCE_EMPTY =
  "No insurance recorded. Buyers ask for cyber and professional indemnity cover first.";

// ------------------------------------------------------------------ management review

export const REVIEW_INPUT_KEYS = [
  "previous_actions",
  "issues",
  "parties",
  "performance",
  "feedback",
  "risks",
  "improvement",
] as const;
export type ReviewInputKey = (typeof REVIEW_INPUT_KEYS)[number];

/** Clause 9.3.2's seven inputs, in the house's words (the topics, not the letters). */
export const REVIEW_INPUTS: Readonly<Record<ReviewInputKey, string>> = {
  previous_actions: "What happened to the last review's actions",
  issues: "What changed inside and outside the company that matters to security",
  parties: "What changed in what customers, regulators and others need",
  performance: "How security has gone: problems found and fixed, checks and their results, audits",
  feedback: "What customers and others said",
  risks: "Risks: what was assessed, and how each is being treated",
  improvement: "What could be done better",
};
export const REVIEWS_EMPTY =
  "No management review recorded. Once a year, look at how security has gone, decide what to change, and write the actions down.";

// ------------------------------------------------------------------ the Summary

/** The attention pill's words: never colour alone. */
export const ATTENTION_WORDS = "Look at this";
export const NOT_LOADED_ROW = "Not loaded here";
export const COULD_NOT_READ = "Could not be read just now.";
/** A module that is loaded but gives the Summary no line yet. */
export const NOTHING_YET = "Nothing recorded yet.";

export const SUMMARY_AREAS = {
  systems: "Systems",
  assurance: "Assurance",
  buyers: "Buyers",
} as const;

/** The modules the Summary asks, in order, with the area, the title and the page of each. */
export const SUMMARY_MODULES = [
  { name: "tools", area: "systems", title: "Tools", href: "/data/systems" },
  { name: "devices", area: "systems", title: "Devices", href: "/data/systems/devices" },
  { name: "logs", area: "systems", title: "Logs and time", href: "/data/systems/logs" },
  { name: "recovery", area: "systems", title: "Backups", href: "/data/systems/backups" },
  { name: "policies", area: "assurance", title: "Policies", href: "/data/assurance/policies" },
  {
    name: "findings",
    area: "assurance",
    title: "Pen tests and findings",
    href: "/data/assurance/findings",
  },
  {
    name: "assurance",
    area: "assurance",
    title: "Certification, insurance and reviews",
    href: "/data/assurance/certification",
  },
  {
    name: "questionnaires",
    area: "buyers",
    title: "Questionnaires",
    href: "/data/waitlist/diligence/questionnaires",
  },
  { name: "profiles", area: "buyers", title: "Customer duties", href: "/data/assurance/customers" },
] as const;

/** "What buyers usually ask for" (the IA blueprint, p.40), each with where HQ keeps it. */
export const BUYERS_ASK: readonly { words: string; where: string; href: string }[] = [
  {
    words: "Two years' accounts, or an accountant's letter",
    where: "Money › Month close",
    href: "/data/money/close",
  },
  { words: "References, with their consent", where: "Diligence", href: "/data/waitlist/diligence" },
  { words: "Insurance, cyber among it", where: "Insurance", href: "/data/assurance/insurance" },
  { words: "ISO 27001 or SOC 2", where: "Certification", href: "/data/assurance/certification" },
  {
    words: "Continuity, disaster recovery and security policies",
    where: "Policies",
    href: "/data/assurance/policies",
  },
  {
    words: "A penetration test by a third party, at least yearly",
    where: "Pen tests and findings",
    href: "/data/assurance/findings",
  },
  { words: "A supplier code of conduct", where: "Policies", href: "/data/assurance/policies" },
  {
    words: "Service levels and privacy policies",
    where: "Policies",
    href: "/data/assurance/policies",
  },
];

/** "Cover to 31 Mar 2027" or, with no renewal recorded, "Cover ended 31 Mar 2027." */
export const coverWords = (endsOn: string | null, today: string): string =>
  !endsOn
    ? "No end day recorded"
    : endsOn < today
      ? `Cover ended ${dayWords(endsOn)}.`
      : `Cover to ${dayWords(endsOn)}`;
