import type { PillTone } from "@/components/ui/status-pill";
import { formatSentence } from "@/lib/format";

/**
 * The CRM's words, in one place. The service owns the keys; this module owns how they
 * read on screen, so "status_quo" says "Stayed with what they had" everywhere it
 * appears rather than wherever someone remembered to translate it.
 */

export const LEAD_STAGES = ["new", "attempting", "connected", "qualified", "disqualified"] as const;

export const LEAD_STAGE_LABELS: Record<string, string> = {
  new: "New",
  attempting: "Attempting",
  connected: "Connected",
  qualified: "Qualified",
  disqualified: "Disqualified",
};

export function leadStageTone(stage: string): PillTone {
  if (stage === "new") return "attention";
  if (stage === "qualified") return "live";
  if (stage === "disqualified") return "neutral";
  return "neutral";
}

export const DISQUALIFY_LABELS: Record<string, string> = {
  not_a_fit: "Not a fit",
  student_or_personal: "Student or personal use",
  competitor: "A competitor",
  spam: "Spam",
  no_response: "Never responded",
  other: "Other",
};

export const LOSS_REASON_LABELS: Record<string, string> = {
  no_decision: "No decision made",
  timing: "Timing",
  price: "Price",
  competitor: "Went with a competitor",
  status_quo: "Stayed with what they had",
  missing_feature: "Missing a feature",
  procurement: "Procurement blocked it",
  champion_left: "Our champion left",
};

export const LIFECYCLES = [
  "prospect",
  "early_access",
  "customer",
  "former_customer",
  "disqualified",
] as const;

export const LIFECYCLE_LABELS: Record<string, string> = {
  prospect: "Prospect",
  early_access: "Early access",
  customer: "Customer",
  former_customer: "Former customer",
  disqualified: "Disqualified",
};

export function lifecycleTone(lifecycle: string): PillTone {
  if (lifecycle === "customer") return "live";
  if (lifecycle === "early_access") return "attention";
  if (lifecycle === "former_customer") return "danger";
  return "neutral";
}

export const DEAL_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  won: "Won",
  lost: "Lost",
  unqualified: "Closed unqualified",
};

export function dealStatusTone(status: string): PillTone {
  if (status === "won") return "live";
  if (status === "lost") return "danger";
  if (status === "open") return "attention";
  return "neutral";
}

export const DEAL_FLAG_LABELS: Record<string, string> = {
  no_next_step: "No next step",
  next_step_overdue: "Next step overdue",
  neglected: "Neglected",
  rotting: "Stuck in stage",
};

export function dealFlagTone(flag: string): PillTone {
  return flag === "rotting" || flag === "no_next_step" ? "danger" : "attention";
}

export const ACTIVITY_KIND_LABELS: Record<string, string> = {
  note: "Note",
  call: "Call",
  email_out: "Email sent",
  email_in: "Email received",
  meeting: "Meeting",
  stage_change: "Stage moved",
  task_done: "Task done",
  system: "Record",
};

/** The kinds a person can log by hand; the rest are written by the system. */
export const LOGGABLE_KINDS = ["note", "call", "email_out", "email_in"] as const;

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export const TASK_PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export function taskPriorityTone(priority: string): PillTone {
  if (priority === "urgent") return "danger";
  if (priority === "high") return "attention";
  return "neutral";
}

export const FIRM_TYPES = [
  "Hedge fund",
  "Asset manager",
  "Wealth manager",
  "Family office",
  "Prop desk",
  "Bank",
  "Research firm",
  "Independent",
  "Other",
] as const;

export const TEAM_SIZE_BANDS = ["1", "2-10", "11-50", "51-200", "201+"] as const;

/** A source key read as words when the settings list is unavailable. */
export function sourceLabel(key: string, labels?: ReadonlyMap<string, string>): string {
  if (!key) return "—";
  return labels?.get(key) ?? formatSentence(key);
}

/** A stage key read as words when the pipeline list is unavailable. */
export function stageLabel(key: string, labels?: ReadonlyMap<string, string>): string {
  if (!key) return "—";
  return labels?.get(key) ?? formatSentence(key);
}
