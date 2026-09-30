import { StatusPill, type PillTone } from "@/components/ui/status-pill";

const SEVERITY: Record<string, { label: string; tone: PillTone }> = {
  info: { label: "Info", tone: "neutral" },
  warning: { label: "Warning", tone: "attention" },
  critical: { label: "Critical", tone: "danger" },
};

const STATE: Record<string, { label: string; tone: PillTone }> = {
  open: { label: "Open", tone: "attention" },
  acknowledged: { label: "Acknowledged", tone: "neutral" },
  resolved: { label: "Resolved", tone: "live" },
};

/** How serious a security event is, in words and a tone — never a colour alone. */
export function SeverityPill({ severity }: { severity: string }) {
  const entry = SEVERITY[severity] ?? { label: severity, tone: "neutral" as PillTone };
  return <StatusPill value={severity} label={entry.label} tone={entry.tone} />;
}

/** Whether someone has looked at a security event yet. */
export function SecurityStatePill({ state }: { state: string }) {
  const entry = STATE[state] ?? { label: state, tone: "neutral" as PillTone };
  return <StatusPill value={state} label={entry.label} tone={entry.tone} />;
}
