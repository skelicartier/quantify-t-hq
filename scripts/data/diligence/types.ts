/**
 * What buyers ask before they buy (ws-notes/company/spec.md §9.2): their questionnaire, a
 * security review, references (never shared before their consent) and redlines; and Labs
 * dataset trials (nothing sent before their compliance team clears it, and never renewed on
 * their own). Nothing here touches a file.
 */

import type { Staff } from "../protocol";

export type Reference = {
  reference_id: string;
  name: string;
  firm: string;
  role: string;
  /** The day they agreed to be a reference; nothing is shared before it. */
  consent_on: string | null;
  shared_on: string | null;
  outcome: string;
};

export type Redline = {
  redline_id: string;
  /** What is being negotiated: "Pilot agreement". */
  document: string;
  agreement_id: string | null;
  round: number;
  sent_on: string | null;
  received_on: string | null;
  status: "with_us" | "with_them" | "agreed";
  file_id: string | null;
};

export type Diligence = {
  diligence_id: string;
  entry_id: string;
  firm: string;
  state: "open" | "closed";
  questionnaire: {
    received_on: string | null;
    due_on: string | null;
    answered_on: string | null;
    questions: number | null;
    file_id: string | null;
    answers_file_id: string | null;
  };
  security_review: {
    started_on: string | null;
    finished_on: string | null;
    outcome: "passed" | "conditions" | "failed" | "";
    note: string;
  };
  references: Reference[];
  redlines: Redline[];
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
};

export type Trial = {
  trial_id: string;
  entry_id: string;
  firm: string;
  dataset: string;
  dictionary_version: string;
  /** Their compliance team's clearance: nothing is sent before it. */
  compliance: { cleared_on: string | null; by_name: string };
  sample: { sent_on: string; file_id: string | null } | null;
  starts_on: string | null;
  ends_on: string | null;
  go_no_go_on: string | null;
  decision: { outcome: "go" | "no_go"; on: string; note: string; by: Staff } | null;
  /** Always false: a trial never renews on its own here. */
  auto_renews: false;
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
};

export type DiligenceEvent = {
  event_id: string;
  target: "diligence" | "trial";
  id: string;
  verb: string;
  detail: string;
  by: Staff;
  at: string;
};
