/**
 * The words questionnaires, the answer library and regulatory profiles share between the
 * service and the pages (ws-notes/security/spec.md §9): short answers, topics, CAIQ's
 * shared-responsibility labels as CSA's guide writes them, kinds and states, the regimes a
 * customer works under, and the sentences the pages print. Pure: no file, no clock. A
 * tracker's reading of standards and secondary sources, not legal or certification advice.
 */

import { dayWords } from "./labels-company";
import { ofWords } from "./labels-controls";

export const SHORT_WORDS = {
  "": "",
  yes: "Yes",
  no: "No",
  partly: "Partly",
  not_applicable: "Not applicable",
} as const;
export type ShortKey = keyof typeof SHORT_WORDS;

export const TOPIC_WORDS = {
  company: "Company",
  access: "Access",
  devices: "Devices",
  backups: "Backups",
  logging: "Logging",
  incidents: "Incidents",
  policies: "Policies",
  suppliers: "Suppliers",
  development: "Development",
  data_protection: "Data protection",
  certification: "Certification",
  insurance: "Insurance",
  other: "Other",
} as const;
export type TopicKey = keyof typeof TOPIC_WORDS;

/** CAIQ v4's SSRM column, as CSA's guide writes its five values. */
export const SSRM_WORDS = {
  "": "",
  csp_owned: "CSP-owned",
  csc_owned: "CSC-owned",
  third_party: "3rd party-outsourced",
  shared_csc: "Shared CSP and CSC",
  shared_third_party: "Shared CSP and 3rd party",
} as const;
export type SsrmKey = keyof typeof SSRM_WORDS;

export const ANSWER_STATE_WORDS = {
  draft: "Draft",
  approved: "Approved",
  archived: "Archived",
} as const;

export const QUESTIONNAIRE_KIND_WORDS = {
  buyer: "A buyer's questionnaire",
  caiq: "CSA's CAIQ for STAR Level 1",
  other: "Something else",
} as const;

export const QUESTIONNAIRE_STATE_WORDS = {
  open: "Open",
  sent: "Sent",
  closed: "Closed",
} as const;

export const SUGGESTION_WORDS = { id: "By ID", likely: "Likely", possible: "Possible" } as const;

export const REGIME_WORDS = {
  sebi: "SEBI CSCRF",
  dora: "EU DORA",
  uk: "UK financial regulation",
  other: "Other",
} as const;

export const SEBI_CATEGORY_WORDS = {
  "": "Category not given",
  mii: "a market infrastructure institution",
  qualified: "qualified",
  mid: "mid-size",
  small: "small-size",
  self_certification: "self-certification",
  not_known: "category not known",
} as const;
export type SebiCategory = keyof typeof SEBI_CATEGORY_WORDS;

export const DUTY_STATE_WORDS = {
  "": "Not checked",
  in_contract: "In the contract",
  not_in_contract: "Not in it",
} as const;

/** "38 of 200": the Answered column's count. */
export const ofCount = (count: number, total: number): string =>
  ofWords(count, total, "").trimEnd();

/** "38 of 200 answered": a count, never a bar. */
export const answeredWords = (answered: number, total: number): string =>
  ofWords(answered, total, "answered");

/** "Review due since 31 Jan 2028." */
export const reviewDueWords = (reviewBy: string): string =>
  `Review due since ${dayWords(reviewBy)}.`;

/** "Its evidence is out of date: Penetration test by Walk Testers, 2 Oct 2025. Older than 12 months." */
export const outOfDateWords = (label: string, why: string): string =>
  `Its evidence is out of date: ${label}.${why ? ` ${why}` : ""}`;

/** The CAIQ line on the import page (§9.7). */
export const CAIQ_LINE =
  "Use the CAIQ file you downloaded from the Cloud Security Alliance under its terms. HQ fills it; you submit it to them yourself.";

export const QUESTIONNAIRES_EMPTY =
  "No questionnaires yet. When a buyer sends their spreadsheet, import it here: approved answers are matched to their questions, and the file goes back to them with their own columns.";

export const ANSWERS_EMPTY =
  "No answers yet. Write each one once, approve it, and point it at its evidence: the next questionnaire is then mostly matching.";

export const CUSTOMERS_EMPTY =
  "No customer has a regulatory profile yet. Start one from the firm's page when a regulated buyer sends its contract.";

export const profileEmpty = (firm: string): string =>
  `No profile yet. Record which rules ${firm} works under and the duties its contract passes to you. A regulated buyer's rules reach you through that contract.`;

export const NOTHING_CHANGES = "Nothing yet: no duty with an effect is marked as in the contract.";

export const NOT_APPLIED = "Not applied yet: give the day the contract starts.";
export const appliesFromWords = (day: string): string => `Applies from ${dayWords(day)}`;

export const CRITICAL_ONLY = "For a critical or important function only.";

/** What an in-contract duty with an effect changes in HQ (§9.7). */
export const EFFECT_WORDS: Readonly<Record<string, string>> = {
  "cscrf-vapt": "Findings from a penetration test are fixed within 3 months.",
  "cscrf-patch": "High-severity missing patches are fixed within 1 week.",
};

/** A linked questionnaire never gets a day of its own: the diligence's is the one day. */
export const LINKED_DUE =
  "Linked to the firm's open diligence: its questionnaire's due day is the one day.";

/** The section on the firm's and the pilot's page before a profile exists (Step 0's sentence). */
export const PROFILE_SECTION_NOTE =
  "Which rules the firm works under, and the duties its contract passes to you.";

export const SENT_LINE =
  "Marking it sent records what you did: HQ never sends it. Send their file back yourself.";

/** The line under the export buttons (§9.3). */
export const EXPORT_KEEPS =
  "The export keeps their columns and rows. Their formatting, other tabs, drop-downs and formulas are not kept: paste the answers into their file if they ask for it back as it was.";
