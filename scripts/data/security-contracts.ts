/**
 * The seams of the security batch (ws-notes/security/spec.md §3): the services one Data module
 * offers another, by name and type; the duties customers pass down and how they shorten a
 * finding's fix-by day; the Owner-only roster of the people ledger; the stand-ins for copies
 * without the module that provides a service; and the pure day helpers more than one unit
 * uses. Every copy holds this file byte for byte. Nothing here touches a file, a socket or the
 * clock. A tracker's reading of standards and secondary sources, not legal or certification
 * advice.
 */

import { addMonths, type UsedFor } from "./company-contracts";
import { addDays } from "./days";
import {
  CONTROL_SOURCES,
  CONTROLS_CHECKED,
  PRACTICES,
  type ControlSource,
  type PolicyKey,
  type Severity,
} from "../../src/lib/data/labels-controls";

// ------------------------------------------------------------------ names

/** The services this batch adds, by the name each is provided under. */
export const SECURITY_SERVICES = {
  /** U1: the tools register and its accounts. */
  tools: "tools",
  /** Step 0, in the people module: who is in the ledger. OWNER-ONLY. */
  peopleRoster: "people-roster",
  /** U1's lines in the money module: vendors and what was billed. */
  moneyVendors: "money-vendors",
  /** U1's lines in the domains module: which services send mail as each domain. */
  domainSenders: "domain-senders",
  /** U2: devices, their self-checks and acknowledgements. */
  devices: "devices",
  /** U2: where each system's logs go and its time source. */
  logs: "logs",
  /** U2: the backup inventory and its restore tests. */
  recovery: "recovery",
  /** Step 0, in the backup module: when Data's own backup was last made. */
  backupLast: "backup-last",
  /** U3: the policy register. */
  policies: "policies",
  /** U3: pen tests and findings, dependency alerts among them. */
  findings: "findings",
  /** U3: certification, insurance, management reviews and the Summary. */
  assurance: "assurance",
  /** U4: each customer's regulatory profile and the duties it passes down. */
  profiles: "profiles",
  /** U4: questionnaires and the answer library. */
  questionnaires: "questionnaires",
} as const;

/** The modules this batch adds, in `MODULES` order (Step 0 puts them after "cash"). */
export const SECURITY_MODULES = [
  "tools",
  "devices",
  "logs",
  "recovery",
  "policies",
  "findings",
  "assurance",
  "profiles",
  "questionnaires",
] as const;
export type SecurityModule = (typeof SECURITY_MODULES)[number];

/** Files asks each of these what a file is used for: each module's main service answers `usedFor`. */
export const SECURITY_USED_FOR: readonly SecurityModule[] = SECURITY_MODULES;

/** Folders under `data/` that only a backup the Owner makes holds. */
export const OWNER_FOLDERS = ["tools/owner", "devices/owner"] as const;

/** The Due kinds this batch adds; core's `DueKind`, the overview's schema and `DUE_KINDS` carry them. */
export const SECURITY_DUE_KINDS = [
  "tool",
  "account",
  "device",
  "log",
  "backup",
  "pen_test",
  "finding",
  "certification",
  "insurance",
  "management_review",
] as const;
export type SecurityDueKind = (typeof SECURITY_DUE_KINDS)[number];

// ------------------------------------------------------------------ days

/**
 * The people ledger's leaver deadlines (`CRITICAL_DAYS`, `OTHER_DAYS` in
 * `scripts/data/people/limits.ts`, words `REVOKE_*` in `labels-people.ts`): a critical account
 * is closed by the end of the day after the last day, every other within 5 days. U1's test
 * pins these equal to the ledger's.
 */
export const LEAVER_DAYS = { critical: 1, other: 5 } as const;

/** 27 Nov 2026, critical → 28 Nov 2026; not critical → 2 Dec 2026. Calendar days. */
export function closeByOf(lastDay: string, critical: boolean): string {
  return addDays(lastDay, critical ? LEAVER_DAYS.critical : LEAVER_DAYS.other);
}

/** A company device is back by the last day; work data is off a personal one within 5 days. */
export const DEVICE_LEAVER_DAYS = { company: 0, personal: 5 } as const;

export function deviceByOf(lastDay: string, ownership: "company" | "personal"): string {
  return addDays(lastDay, DEVICE_LEAVER_DAYS[ownership]);
}

/**
 * The first of `base`, `base` + `every` months, `base` + 2 × `every` months … that is on or
 * after `today`; each is `addMonths(base, n × every)`, so a 31st stays the month's last day
 * and never drifts. (31 Jan 2027, 1, 14 Feb 2027) → 28 Feb 2027; (…, 20 Mar 2027) → 31 Mar 2027.
 */
export function nextOnOrAfter(base: string, everyMonths: number, today: string): string {
  const step = Math.max(1, Math.floor(everyMonths));
  let day = base;
  for (let n = 1; day < today && n <= 1_200; n += 1) day = addMonths(base, n * step);
  return day;
}

/** The last day to cancel before a renewal: the renewal less the notice. (15 Mar 2027, 30) → 13 Feb 2027. */
export function cancelByOf(renewsOn: string, noticeDays: number | null): string {
  return addDays(renewsOn, -Math.max(0, Math.floor(noticeDays ?? 0)));
}

/** In Due from `ahead` days before the day it is due, and every day after. */
export function inDue(dueOn: string, today: string, ahead: number): boolean {
  return addDays(dueOn, -Math.max(0, Math.floor(ahead))) <= today;
}

/** The calendar day in India (UTC+05:30) of an instant; null when it is not one. */
export function istDayOf(instant: string): string | null {
  const at = Date.parse(instant);
  if (Number.isNaN(at)) return null;
  return new Date(at + 330 * 60_000).toISOString().slice(0, 10);
}

// ------------------------------------------------------------------ findings and what customers pass down

export type FindingSource = "pen_test" | "dependabot" | "self" | "customer" | "other";

/** Days to fix a finding, by severity. His amounts, kept in `findings/setup.json`, replace these. */
export type FixWindows = Readonly<Record<Severity, number>>;
export const FIX_WINDOWS_DEFAULT: FixWindows = {
  critical: PRACTICES.fix_critical.amount,
  high: PRACTICES.fix_high.amount,
  medium: PRACTICES.fix_medium.amount,
  low: PRACTICES.fix_low.amount,
};

export type Regime = "sebi" | "dora" | "uk" | "other";

/** How a duty in a customer's contract shortens fix-by days: within `days`, or within `months`. */
export type FlowdownEffect = {
  sources: readonly FindingSource[];
  severities: readonly Severity[];
  days: number | null;
  months: number | null;
};

export type FlowdownKey =
  | "cscrf-sbom"
  | "cscrf-vapt"
  | "cscrf-patch"
  | "cscrf-empanelled"
  | "cscrf-back-to-back"
  | "cscrf-iso"
  | "dora-incident-help"
  | "dora-authorities"
  | "dora-termination"
  | "dora-training"
  | "dora-reporting"
  | "dora-contingency"
  | "dora-tlpt"
  | "dora-audit"
  | "dora-exit"
  | "uk-ict-risk"
  | "uk-incidents"
  | "uk-exit";

/** A duty a regulated customer commonly passes to its vendors by contract. A starting list he edits. */
export type Flowdown = {
  key: FlowdownKey;
  regime: Regime;
  /** The duty, as the profile lists it. */
  words: string;
  /** "SEBI CSCRF", "DORA Article 30(2)(f)". */
  ref: string;
  sources: readonly ControlSource[];
  verified_on: string;
  /** What it changes in HQ once it is in the contract; null for a duty HQ only lists. */
  effect: FlowdownEffect | null;
  note: string;
};

const ALL_SEVERITIES: readonly Severity[] = ["critical", "high", "medium", "low"];
const CRITICAL_FUNCTION = "For a critical or important function only.";

function flowdown(
  key: FlowdownKey,
  regime: Regime,
  ref: string,
  words: string,
  effect: FlowdownEffect | null = null,
  note = "",
): Flowdown {
  const sources: ControlSource[] =
    regime === "sebi"
      ? [CONTROL_SOURCES.cscrf]
      : regime === "dora"
        ? [CONTROL_SOURCES.dora]
        : [CONTROL_SOURCES.ia];
  return { key, regime, words, ref, sources, verified_on: CONTROLS_CHECKED, effect, note };
}

export const FLOWDOWNS: readonly Flowdown[] = [
  flowdown(
    "cscrf-sbom",
    "sebi",
    "SEBI CSCRF",
    "A software bill of materials for the software they use",
  ),
  flowdown(
    "cscrf-vapt",
    "sebi",
    "SEBI CSCRF",
    "Findings from a vulnerability assessment and penetration test closed within 3 months",
    { sources: ["pen_test"], severities: ALL_SEVERITIES, days: null, months: 3 },
  ),
  flowdown(
    "cscrf-patch",
    "sebi",
    "SEBI CSCRF",
    "High-severity missing patches fixed within 1 week",
    { sources: ["dependabot"], severities: ["critical", "high"], days: 7, months: null },
  ),
  flowdown(
    "cscrf-empanelled",
    "sebi",
    "SEBI CSCRF",
    "Application security testing by a CERT-In-empanelled auditor",
  ),
  flowdown(
    "cscrf-back-to-back",
    "sebi",
    "SEBI CSCRF",
    "The same duties passed on to your own subcontractors",
  ),
  flowdown(
    "cscrf-iso",
    "sebi",
    "SEBI CSCRF",
    "ISO 27001 certification where you run a critical service for them",
  ),
  flowdown(
    "dora-incident-help",
    "dora",
    "DORA Article 30(2)(f)",
    "Help during an ICT incident at no extra cost, or at a cost agreed in advance",
  ),
  flowdown(
    "dora-authorities",
    "dora",
    "DORA Article 30(2)(g)",
    "Full cooperation with their regulators",
  ),
  flowdown(
    "dora-termination",
    "dora",
    "DORA Article 30(2)(h)",
    "Their rights to end the contract, and the notice periods",
  ),
  flowdown(
    "dora-training",
    "dora",
    "DORA Article 30(2)(i)",
    "Taking part in their security awareness programmes and training",
  ),
  flowdown(
    "dora-reporting",
    "dora",
    "DORA Article 30(3)(b)",
    "Notice periods and reporting duties to them",
    null,
    CRITICAL_FUNCTION,
  ),
  flowdown(
    "dora-contingency",
    "dora",
    "DORA Article 30(3)(c)",
    "Business contingency plans, put in place and tested",
    null,
    CRITICAL_FUNCTION,
  ),
  flowdown(
    "dora-tlpt",
    "dora",
    "DORA Article 30(3)(d)",
    "Taking part in their threat-led penetration testing",
    null,
    CRITICAL_FUNCTION,
  ),
  flowdown(
    "dora-audit",
    "dora",
    "DORA Article 30(3)(e)",
    "Unrestricted rights of access, inspection and audit",
    null,
    CRITICAL_FUNCTION,
  ),
  flowdown(
    "dora-exit",
    "dora",
    "DORA Article 30(3)(f)",
    "An exit plan with a transition period",
    null,
    CRITICAL_FUNCTION,
  ),
  flowdown("uk-ict-risk", "uk", "UK financial regulation", "ICT risk management they can review"),
  flowdown("uk-incidents", "uk", "UK financial regulation", "Telling them about incidents"),
  flowdown("uk-exit", "uk", "UK financial regulation", "An exit plan"),
];

export function flowdownOf(key: FlowdownKey): Flowdown {
  const found = FLOWDOWNS.find((item) => item.key === key);
  if (!found) throw new Error(`No flowdown ${key}`);
  return found;
}

export function isFlowdownKey(value: unknown): value is FlowdownKey {
  return typeof value === "string" && FLOWDOWNS.some((item) => item.key === value);
}

/** A duty with an effect that is in a customer's contract and in force today. */
export type FlowdownInForce = {
  entry_id: string;
  firm: string;
  key: FlowdownKey;
  effect: FlowdownEffect;
};

/** A duty marked as in a customer's contract and in force today, with or without an effect. */
export type FlowdownInContract = {
  entry_id: string;
  firm: string;
  key: FlowdownKey;
};

export type FixBy = {
  fix_by: string;
  /** The customer duty that made it earlier than the window, or null. */
  because: { entry_id: string; firm: string; key: FlowdownKey } | null;
};

/**
 * A finding's fix-by day: found + the window for its severity, or earlier where a duty in
 * force covers its source and severity (`days` added, or `months` by `addMonths`). The
 * earliest wins; on a tie the first duty given is named. Pure.
 */
export function fixByOf(input: {
  found_on: string;
  severity: Severity;
  source: FindingSource;
  windows: FixWindows;
  in_force: readonly FlowdownInForce[];
}): FixBy {
  let fixBy = addDays(input.found_on, input.windows[input.severity]);
  let because: FixBy["because"] = null;
  for (const duty of input.in_force) {
    const effect = duty.effect;
    if (!effect.sources.includes(input.source) || !effect.severities.includes(input.severity))
      continue;
    const day =
      effect.days !== null
        ? addDays(input.found_on, effect.days)
        : effect.months !== null
          ? addMonths(input.found_on, effect.months)
          : null;
    if (day !== null && day < fixBy) {
      fixBy = day;
      because = { entry_id: duty.entry_id, firm: duty.firm, key: duty.key };
    }
  }
  return { fix_by: fixBy, because };
}

// ------------------------------------------------------------------ what every module gives the Summary and the answers

export type SummaryArea = "systems" | "assurance" | "buyers";

/** One line of Assurance › Summary: a sentence and a link, never a meter. */
export type SummaryLine = {
  key: string;
  area: SummaryArea;
  /** "Tools", "Devices", "Policies". */
  title: string;
  /** "12 tools recorded; 3 hold customer data." */
  words: string;
  /** Something wants him: printed with the attention words, never by colour alone. */
  attention: boolean;
  href: string;
};

/** `owner`: asked as the Owner; only then may a line count anything worked out from the people ledger. */
export type SummarySource = { summary(today: string, owner: boolean): SummaryLine[] };

/** A record an approved answer can point to as its evidence. */
export type EvidenceOption = {
  /** "<module>:<kind>:<id>": "policies:policy:access_control", "findings:pen_test:<id>". */
  ref: string;
  /** "Access control policy, version 3". */
  label: string;
  href: string;
  /** False when it has lapsed, expired or is older than its interval. */
  current: boolean;
  /** Why it is not current, in a sentence; "" when it is. */
  why: string;
};
export type EvidenceSource = { evidence(today: string): EvidenceOption[] };

/** What every one of this batch's modules provides under its own name. */
export type SecurityLookup = UsedFor & SummarySource & EvidenceSource;

// ------------------------------------------------------------------ what U1 gives

export type DataClass = "customer" | "personal" | "source_code" | "secrets" | "financial";

export type ToolView = {
  tool_id: string;
  name: string;
  /** Critical: a leaver's account in it is closed by the end of the day after the last day. */
  critical: boolean;
  holds: readonly DataClass[];
  subprocessor: boolean;
  retired: boolean;
  /** "/data/systems/tools/{id}". */
  href: string;
};

/** The Key dates suggestions a tool can stand for (`scripts/data/dates/catalogue.ts` keys). */
export type KeyDateCover = "mailbox" | "mail-plan" | "developer-programme";

export type ToolsLookup = SecurityLookup & {
  /** Every tool, retired ones last, for the other registers' pickers. */
  tools(): ToolView[];
  /** The catalogue rows a tool with a renewal day stands for, so Key dates hides them. */
  keyDateCovers(): KeyDateCover[];
};

// ------------------------------------------------------------------ Step 0 gives (people-roster)

/**
 * One person in the people ledger. OWNER-ONLY: a caller passes it on only in an answer asked
 * as the Owner, never to search, the agenda, a file's "Used for", an Admin's export or
 * backup, the overview or a log line.
 */
export type RosterPerson = {
  person_id: string;
  name: string;
  email: string;
  kind: "intern" | "employee" | "contractor";
  state: "starting" | "engaged" | "offboarding" | "ended";
  starts_on: string;
  /** The offboarding's last day once it has started; null before. */
  last_day: string | null;
  href: string;
};

export type PeopleRoster = {
  people(today: string): RosterPerson[];
  person(personId: string, today: string): RosterPerson | null;
};

// ------------------------------------------------------------------ U1's lines in money and domains

export type VendorLine = { vendor_id: string; name: string; retired: boolean; href: string };
/** One figure per currency, never added across currencies. */
export type VendorBilled = { currency: string; total_minor: number; bills: number };
export type MoneyVendors = {
  vendors(): VendorLine[];
  /** Bills not cancelled whose invoice day is on or after `from`. */
  billedSince(vendorId: string, from: string): VendorBilled[];
};

export type DomainSender = {
  domain_id: string;
  name: string;
  sends_as: readonly string[];
  href: string;
};
export type DomainSenders = { senders(): DomainSender[] };

// ------------------------------------------------------------------ what U2 gives

/** A device linked to a person in the people ledger, and what is owed on it when they leave. */
export type PersonDeviceLine = {
  device_id: string;
  label: string;
  ownership: "company" | "personal";
  /** The day it is owed by, once the person's offboarding has started; else null. */
  by: string | null;
  /** Returned (company) or retired with work data removed (personal). */
  done: boolean;
  href: string;
};

export type DevicesLookup = SecurityLookup & {
  /** OWNER-ONLY: the devices linked to that person. */
  forPerson(personId: string, today: string): PersonDeviceLine[];
};

export type LogsLookup = SecurityLookup;
export type RecoveryLookup = SecurityLookup;

/** Step 0, in the backup module: the last backup downloaded, as `backup/last.json` holds it. */
export type BackupLast = { last(): { at: string; bytes: number } | null };

// ------------------------------------------------------------------ what U3 gives

export type PolicyFile = {
  key: PolicyKey;
  file_id: string;
  title: string;
  /** The current version's number in Files. */
  version: number;
  href: string;
};

export type PoliciesLookup = SecurityLookup & {
  /** The Files document linked as that policy, or null. */
  fileFor(key: PolicyKey): PolicyFile | null;
};

export type FindingsLookup = SecurityLookup;
export type AssuranceLookup = SecurityLookup;

// ------------------------------------------------------------------ what U4 gives

export type ProfileLine = {
  entry_id: string;
  firm: string;
  regimes: readonly Regime[];
  /** Duties marked as in the contract. */
  in_contract: number;
  /** Duties not yet marked either way. */
  unchecked: number;
  href: string;
};

export type ProfilesLookup = SecurityLookup & {
  /** Duties with an effect, in a contract, on profiles whose `applies_from` is on or before today. */
  inForce(today: string): FlowdownInForce[];
  /**
   * Every flowdown duty in a contract on profiles whose `applies_from` is on or before today,
   * with or without an effect: a pen test reads `cscrf-empanelled` here, as it has no effect.
   */
  inContract(today: string): FlowdownInContract[];
  forEntry(entryId: string): ProfileLine | null;
};

export type QuestionnaireLine = {
  questionnaire_id: string;
  title: string;
  answered: number;
  total: number;
  state: "open" | "sent" | "closed";
  href: string;
};

export type QuestionnairesLookup = SecurityLookup & {
  forEntry(entryId: string): QuestionnaireLine[];
};

// ------------------------------------------------------------------ stand-ins, for copies without a provider and for tests

/** A lookup over fixed lines and options; `usedFor` answers nothing. */
export function standInSource(
  lines: readonly SummaryLine[] = [],
  options: readonly EvidenceOption[] = [],
): SecurityLookup {
  return {
    usedFor: () => [],
    summary: () => lines.map((line) => ({ ...line })),
    evidence: () => options.map((option) => ({ ...option })),
  };
}

export function standInRoster(people: readonly RosterPerson[] = []): PeopleRoster {
  return {
    people: () => [...people].sort((a, b) => a.name.localeCompare(b.name)),
    person: (personId) => people.find((person) => person.person_id === personId) ?? null,
  };
}

export function standInTools(
  tools: readonly ToolView[] = [],
  covers: readonly KeyDateCover[] = [],
): ToolsLookup {
  return {
    ...standInSource(),
    tools: () => tools.map((tool) => ({ ...tool })),
    keyDateCovers: () => [...covers],
  };
}

export function standInDevices(
  byPerson: Readonly<Record<string, readonly PersonDeviceLine[]>> = {},
): DevicesLookup {
  return {
    ...standInSource(),
    forPerson: (personId) => (byPerson[personId] ?? []).map((line) => ({ ...line })),
  };
}

export function standInPolicies(files: readonly PolicyFile[] = []): PoliciesLookup {
  return {
    ...standInSource(),
    fileFor: (key) => files.find((file) => file.key === key) ?? null,
  };
}

export function standInProfiles(
  inForce: readonly FlowdownInForce[] = [],
  inContract: readonly FlowdownInContract[] = inForce,
): ProfilesLookup {
  return {
    ...standInSource(),
    inForce: () => inForce.map((duty) => ({ ...duty })),
    inContract: () => inContract.map(({ entry_id, firm, key }) => ({ entry_id, firm, key })),
    forEntry: () => null,
  };
}
