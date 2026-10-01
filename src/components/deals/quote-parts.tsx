import { StatusPill, type PillTone } from "@/components/ui/status-pill";

const TONE: Record<string, PillTone> = {
  draft: "neutral",
  pending_approval: "attention",
  changes_requested: "attention",
  approved: "live",
  published: "live",
  accepted: "live",
  declined: "danger",
  withdrawn: "neutral",
  expired: "danger",
};

/** A quote's state in the words the service gives it. */
export function QuoteStatePill({ state, label }: { state: string; label: string }) {
  return <StatusPill value={state} label={label} tone={TONE[state] ?? "neutral"} />;
}
