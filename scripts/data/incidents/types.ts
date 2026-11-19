/**
 * Incidents (ws-notes/duties/spec.md §6.3): one record per incident, its CERT-In report or
 * why it was not reportable, the Data Protection Board's report, and each customer told
 * under their contract. Field names follow the HQ service's incident
 * (`src/lib/api/privacy.ts`), so a later move maps field for field. On disk under
 * `data/incidents/`.
 */

import type { RuleLine } from "../duties-contracts";
import type { Staff } from "../protocol";
import type { IncidentKindKey } from "../../../src/lib/data/labels-security";

export type IncidentKind = IncidentKindKey;
export type Severity = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "open" | "contained" | "resolved" | "closed";
export type ReportChannel = "email" | "phone" | "fax" | "form";

export type CertInReport = {
  sent_at: string;
  channel: ReportChannel;
  reference: string;
  sent_by: string;
  /** The report as sent, in Files (folder "Security › Incidents"). */
  file_id: string | null;
  late_reason: string;
};

export type CustomerRow = {
  row_id: string;
  name: string;
  /** A waitlist firm's entry id, when he picked one. */
  waitlist_entry_id: string | null;
  hours: number;
  told_at: string | null;
  how: string;
  withdrawn: boolean;
};

export type Incident = {
  incident_id: string;
  /** "INC-2026-001": numbered within the calendar year of `aware_at` in IST. */
  reference: string;
  title: string;
  summary: string;
  kind: IncidentKind;
  severity: Severity;
  status: IncidentStatus;
  personal_data: boolean;
  /** Instants. `aware_at` is when it was noticed or the company was told: the clocks count from it. */
  occurred_at: string | null;
  aware_at: string;
  contained_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  /** What is affected; what has been done so far. */
  systems: string;
  actions: string;
  cert_in: {
    /** He recorded that it is not reportable, with why and who decided. */
    not_reportable: { why: string; decided_by: string; on: string } | null;
    report: CertInReport | null;
  };
  board: { report: { sent_at: string; reference: string; file_id: string | null } | null };
  customers: CustomerRow[];
  lessons: string;
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
};

export type IncidentEvent = {
  event_id: string;
  incident_id: string;
  /** "logged", "changed", "contained", "resolved", "closed", "reopened", "reported to CERT-In" … */
  verb: string;
  /** Field names in words, never their values; "" for none. */
  detail: string;
  by: Staff;
  at: string;
};

export type CertInClock =
  | { state: "not_listed" }
  | { state: "not_reportable"; why: string; decided_by: string; on: string }
  | { state: "no_rule" }
  | {
      state: "due";
      report_by: string;
      report_by_words: string;
      minutes_left: number;
      words: string;
    }
  | {
      state: "overdue";
      report_by: string;
      report_by_words: string;
      minutes_late: number;
      words: string;
    }
  | {
      state: "reported";
      report_by: string;
      sent_at: string;
      sent_words: string;
      margin_words: string;
    };

export type BoardClock =
  | { state: "no_personal_data" }
  /** The rule book is not loaded here: nothing is worked out. */
  | { state: "no_rule" }
  | { state: "not_in_force"; starts_on: string }
  | {
      state: "due" | "overdue" | "reported";
      report_by: string;
      report_by_words: string;
      words: string;
    };

export type CustomerClock = {
  row_id: string;
  tell_by: string;
  tell_by_words: string;
  state: "due" | "overdue" | "told";
  words: string;
};

export type Clock = {
  cert_in: CertInClock;
  board: BoardClock;
  customers: CustomerClock[];
  rules: { cert_in: RuleLine | null; board: RuleLine | null };
};
