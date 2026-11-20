/**
 * The words of Systems › Tools and Systems › Accounts (ws-notes/security/spec.md §6.8, §6.9):
 * categories, statuses, sign-in, two-step sign-in, the data a tool holds, account kinds and
 * roles, the Key dates suggestions a tool can stand for, the check lines and the empty
 * states. Shared by the service and the pages. Pure: no file, no clock. A record and a
 * reminder, not legal or certification advice.
 */

import type {
  DataClass,
  KeyDateCover,
  VendorBilled,
} from "../../../scripts/data/security-contracts";
import { dayWords } from "./labels-company";
import { countWords } from "./labels-controls";
import { minorWords } from "./labels-duties";

export const TOOL_CATEGORIES = {
  mail_docs: "Mail and documents",
  code: "Code",
  cloud: "Cloud",
  product: "Product",
  finance: "Finance",
  sales: "Sales",
  security: "Security",
  design: "Design",
  ai: "AI",
  other: "Other",
} as const;
export type ToolCategory = keyof typeof TOOL_CATEGORIES;

export const TOOL_STATUSES = {
  in_use: "In use",
  trial: "Trial",
  ending: "Ending",
  retired: "Retired",
} as const;
export type ToolStatus = keyof typeof TOOL_STATUSES;

/** The register's views, in order. */
export const TOOL_VIEWS = {
  in_use: "In use",
  trial: "Trial",
  ending: "Ending",
  retired: "Retired",
  all: "All",
} as const;
export type ToolView = keyof typeof TOOL_VIEWS;

export const BILLING = {
  "": "Not given",
  monthly: "Monthly",
  yearly: "Yearly",
  once: "Once",
  free: "Free",
} as const;
export type Billing = keyof typeof BILLING;

/** How a cost reads after its amount: "₹1,180 yearly". */
export const BILLING_AFTER: Readonly<Record<Billing, string>> = {
  "": "",
  monthly: "monthly",
  yearly: "yearly",
  once: "once",
  free: "free",
};

export const SIGN_IN = {
  "": "Not known",
  sso: "Through the mail suite",
  password: "Its own password",
  passkey: "Passkey",
  mixed: "Mixed",
} as const;
export type SignIn = keyof typeof SIGN_IN;

export const TWO_STEP = {
  "": "Not known",
  enforced: "Enforced",
  optional: "Optional",
  none: "None",
} as const;
export type TwoStep = keyof typeof TWO_STEP;

export const DATA_CLASSES: Readonly<Record<DataClass, string>> = {
  customer: "Customer data",
  personal: "Personal data",
  source_code: "Source code",
  secrets: "Secrets",
  financial: "Financial records",
};
export const DATA_CLASS_KEYS = [
  "customer",
  "personal",
  "source_code",
  "secrets",
  "financial",
] as const satisfies readonly DataClass[];

export const ACCOUNT_KINDS = {
  person: "A person",
  shared: "Shared login",
  service: "Service account",
} as const;
export type AccountKind = keyof typeof ACCOUNT_KINDS;

export const ACCOUNT_ROLES = {
  "": "Not known",
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
  other: "Other",
} as const;
export type AccountRole = keyof typeof ACCOUNT_ROLES;

export const ACCOUNT_VIEWS = { open: "Open", closed: "Closed", all: "All" } as const;
export type AccountView = keyof typeof ACCOUNT_VIEWS;

/** An account's own two-step flag. */
export const ACCOUNT_TWO_STEP = { yes: "On", no: "Off", "": "Not known" } as const;

/** The Key dates suggestions a tool can stand for, as Key dates names them. */
export const KEY_DATE_COVERS: Readonly<Record<KeyDateCover, string>> = {
  mailbox: "The founders@ mailbox",
  "mail-plan": "The mail provider's plan",
  "developer-programme": "Mac developer programme membership",
};
export const KEY_DATE_COVER_KEYS = [
  "mailbox",
  "mail-plan",
  "developer-programme",
] as const satisfies readonly KeyDateCover[];
export const isKeyDateCover = (value: unknown): value is KeyDateCover =>
  typeof value === "string" && (KEY_DATE_COVER_KEYS as readonly string[]).includes(value);

// ------------------------------------------------------------------ sentences

export const TOOLS_EMPTY =
  "No tools recorded. Add every tool the company signs in to, paid or free, starting with the mail suite: buyers ask which tools hold their data, and a leaver's accounts are closed from this list.";
export const TOOL_ACCOUNTS_EMPTY =
  "No accounts recorded. Add one per person, shared login and service account: an account nobody owns is the first thing an auditor asks about.";
export const ACCOUNTS_EMPTY = "No accounts yet. Add them on each tool's page.";
export const ACCOUNTS_ABOUT =
  "A leaver's accounts are closed from here: critical tools by the end of the day after the last day, the rest within 5 days.";
export const NOT_A_SUBPROCESSOR =
  "Not a sub-processor. Mark it as one when it processes customers' personal data for you.";
export const CRITICAL_HINT =
  "A leaver's account is closed by the end of the day after the last day.";
export const COVER_HINT =
  "If you added it in Key dates, take it back there, so it is not reminded twice.";
export const COVER_HIDDEN = "This renewal is on its tool's row in Systems.";
export const PERSON_SECTION_APART =
  "Accounts typed in the access list above and accounts in Systems are listed apart. Record each system once.";
export const POSSIBLY_THEIRS =
  "Possibly theirs: open accounts not linked to anyone whose holder is this person's name or address";
export const SUBPROCESSORS_FOLDER = ["Security", "Sub-processors"] as const;
export const SUBPROCESSORS_TITLE = "Sub-processors";

export const personSectionEmpty = (name: string): string =>
  `No accounts or devices in Systems are linked to ${name}. Link them from Systems › Accounts.`;

/** The check lines under a tool (spec §6.5), in the order they are given. */
export const CHECKS = {
  twoStep: "Two-step sign-in is not enforced.",
  ownPassword: (through: string) =>
    `Signs in with its own password, not through ${through || "the mail suite"}.`,
  notMarked: "Holds customer or personal data but is not marked as a sub-processor.",
  noDpa: "No data processing agreement is recorded.",
  notLooked: (day: string) => `Not looked at since ${day}.`,
  noRenewal: "No renewal day.",
  overSeats: "More accounts than seats.",
  adminsWithout: (count: number) =>
    count === 1
      ? "1 admin account without two-step sign-in."
      : `${count.toLocaleString("en-GB")} admin accounts without two-step sign-in.`,
  shared: "A shared account.",
} as const;

/** "Sends mail as walk.example (as Domains records it)." */
export const sendsAsWords = (domains: readonly string[]): string =>
  `Sends mail as ${domains.join(", ")} (as Domains records it).`;

/**
 * What Money billed in the last year, one figure per currency, never added:
 * "Billed since 20 Nov 2025: ₹23,600 in 2 bills · $20 in 1 bill".
 */
export function billedWords(since: string, billed: readonly VendorBilled[]): string {
  if (billed.length === 0) return `Nothing billed since ${dayWords(since)}.`;
  return `Billed since ${dayWords(since)}: ${[...billed]
    .sort((a, b) => a.currency.localeCompare(b.currency))
    .map(
      (item) =>
        `${minorWords(item.total_minor, item.currency)} in ${countWords(item.bills, "bill")}`,
    )
    .join(" · ")}`;
}
