/**
 * The tools register (ws-notes/security/spec.md §6.2): every tool the company signs in to and
 * the accounts in each. On disk under `data/tools/`: `tools.json`, `events.jsonl` (verbs and
 * field names, never values) and `setup.json` (his interval, the kept list's file). The link
 * of an account to a person in the people ledger is the Owner's and lives apart, in
 * `data/tools/owner/` (`owner.ts`), which a backup an Admin makes leaves out.
 *
 * Field names follow the service's vendor and access grant (`src/lib/api/finance.ts`,
 * `src/lib/api/team.ts`), so a later move maps field for field: `tool_id` ↔ `vendor_id`,
 * `business_owner` ↔ `owner_name`, `retired.on` ↔ `cancelled_on`, the `subprocessor` block ↔
 * the supplier; `account_id` ↔ `access_id`, the Owner-only link ↔ `staff_id`, `role` ↔
 * `level`, `opened_on` ↔ `granted_on`, `closed_on` ↔ `revoked_on`.
 */

import type { Flag } from "../company-contracts";
import type { Staff } from "../protocol";
import type { DataClass, KeyDateCover } from "../security-contracts";
import type {
  AccountKind,
  AccountRole,
  Billing,
  SignIn,
  ToolCategory,
  ToolStatus,
  TwoStep,
} from "../../../src/lib/data/labels-systems";

export type { ToolCategory };

export type Stamp = {
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
};

export type Subprocessor = {
  purpose: string;
  /** Where customers' data is processed. */
  locations: string;
  dpa_signed_on: string | null;
  /** The agreement's copy in Files, "Security › Sub-processors". */
  dpa_file_id: string | null;
  since: string | null;
};

export type Tool = Stamp & {
  tool_id: string;
  /** "Walk Mail". */
  name: string;
  /** One line: what it is for. */
  what: string;
  category: ToolCategory;
  status: ToolStatus;
  /** A name, as typed. */
  business_owner: string;
  /** Who administers it, as typed. Never a password. */
  admins: string;
  /** A vendor in Money. */
  vendor_id: string | null;
  /** As on its terms, for the sub-processor list. */
  legal_name: string;
  plan: string;
  seats: number | null;
  /** In minor units (`minorOf`); one currency. */
  amount_minor: number | null;
  currency: string;
  billing: Billing;
  renews_on: string | null;
  notice_days: number | null;
  auto_renews: Flag;
  /** The Key dates suggestion it stands for. */
  key_date: KeyDateCover | null;
  sign_in: SignIn;
  /** "the mail suite", as typed. */
  sso_with: string;
  mfa: TwoStep;
  /** A leaver's account in it is closed by the end of the day after the last day. */
  critical: boolean;
  holds: DataClass[];
  subprocessor: Subprocessor | null;
  data_location: string;
  /** How to export and leave. */
  exit: string;
  reviewed: { on: string; by_name: string; note: string } | null;
  retired: { on: string; why: string } | null;
  notes: string;
};

export type Account = Stamp & {
  account_id: string;
  tool_id: string;
  /** As the tool shows it: a name or an address. */
  holder: string;
  kind: AccountKind;
  role: AccountRole;
  mfa: Flag;
  /** Null: the tool's. */
  critical: boolean | null;
  opened_on: string | null;
  closed_on: string | null;
  closed_note: string;
  notes: string;
};

export type ToolsEvent = {
  event_id: string;
  target: "tool" | "account";
  id: string;
  tool_id: string;
  verb: string;
  /** Field names in words, never their values. */
  detail: string;
  by: Staff;
  at: string;
};

/** His own amounts and the kept list's file. */
export type ToolsSetup = {
  format: 1;
  /** Months between looks at a tool; null for HQ's default (12). */
  review_months: number | null;
  /** The sub-processor list kept in Files, when it has been. */
  kept_file_id: string | null;
};
