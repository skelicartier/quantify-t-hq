/**
 * Trademarks (ws-notes/duties/spec.md §6.4): one record per mark and class, the Registry's
 * status words, the dated steps of an application, renewals, the agent's watch hits, and the
 * papers in Files. On disk under `data/marks/`.
 */

import type { Flag } from "../company-contracts";
import type { RuleLine } from "../duties-contracts";
import type { Staff } from "../protocol";
import type { MarkClockKey, MarkStatusKey } from "../../../src/lib/data/labels-security";

export type MarkStatus = MarkStatusKey;

export type Mark = {
  mark_id: string;
  /** The mark as filed: the words, or a description of the device. */
  name: string;
  kind: "word" | "device" | "combined";
  /** 1 to 45: one record per mark and class. */
  class_number: number;
  goods: string;
  application_number: string;
  applied_on: string | null;
  applicant: string;
  agent: string;
  agent_contact_id: string | null;
  filed_as_startup: Flag;
  /** Whole rupees, the official fee paid for this class. */
  fee_paid: number | null;
  status: MarkStatus;
  status_on: string | null;
  steps: {
    deficiency_notice_on: string | null;
    deficiency_fixed_on: string | null;
    exam_report_on: string | null;
    exam_reply_on: string | null;
    hearing_on: string | null;
    journal_number: string;
    journal_on: string | null;
    opposition_notice_on: string | null;
    counter_statement_on: string | null;
    registered_on: string | null;
    certificate_number: string;
    /** As printed on the certificate; when null it is worked out from `applied_on`. */
    expires_on: string | null;
  };
  renewals: { renewed_on: string; expires_on: string; srn: string; by: Staff; at: string }[];
  /** Hits from the agent's watch, and anything else to remember. */
  watch: { note_id: string; on: string; text: string; by: Staff; at: string }[];
  /** Files: the application, the examination report, the certificate (folder "Company › Trademarks"). */
  file_ids: string[];
  notes: string;
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
};

export type MarkEvent = {
  event_id: string;
  mark_id: string;
  verb: string;
  /** Field or step names in words, never their values. */
  detail: string;
  by: Staff;
  at: string;
};

/** One of the mark's dates (§5.2): its day, whether it is done, and the rule it comes from. */
export type MarkClock = {
  key: MarkClockKey;
  title: string;
  /** The day it counts from; null for the hearing (the day itself). */
  base_on: string | null;
  /** Null when its rule is not usable here (no rule book). */
  due_on: string | null;
  done: boolean;
  /** Still running: not done, and the mark is not refused, abandoned, withdrawn or removed. */
  open: boolean;
  rule: RuleLine | null;
};
