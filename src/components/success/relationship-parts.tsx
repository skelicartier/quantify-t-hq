import { StatusPill, type PillTone } from "@/components/ui/status-pill";

const REFERENCE: Record<string, { label: string; tone: PillTone }> = {
  active: { label: "Agreed", tone: "live" },
  expiring: { label: "Runs out soon", tone: "attention" },
  expired: { label: "Ran out", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

/** Whether a firm's consent can be used today, in words. */
export function ReferenceStatePill({ state }: { state: string }) {
  const shown = REFERENCE[state] ?? { label: state, tone: "neutral" as PillTone };
  return <StatusPill value={state} label={shown.label} tone={shown.tone} />;
}

export function ReviewStatePill({ status }: { status: string }) {
  return (
    <StatusPill
      value={status}
      label={status === "final" ? "Final" : "Draft"}
      tone={status === "final" ? "live" : "attention"}
    />
  );
}
