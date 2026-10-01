import { StatusPill, type PillTone } from "@/components/ui/status-pill";

const TONE: Record<string, PillTone> = {
  applied: "attention",
  screen: "neutral",
  interview: "neutral",
  task: "neutral",
  offer: "live",
  hired: "live",
  rejected: "neutral",
  withdrawn: "neutral",
};

export function StagePill({ stage, label }: { stage: string; label: string }) {
  return <StatusPill value={stage} label={label} tone={TONE[stage] ?? "neutral"} />;
}
