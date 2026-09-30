import { StatusPill, type PillTone } from "@/components/ui/status-pill";

const COLLECTION: Record<string, { label: string; tone: PillTone }> = {
  none: { label: "Not chased", tone: "neutral" },
  reminded: { label: "Reminded", tone: "attention" },
  promised: { label: "Promised", tone: "live" },
  disputed: { label: "Disputed", tone: "danger" },
  escalated: { label: "Escalated", tone: "danger" },
  written_off: { label: "Written off", tone: "neutral" },
};

const STATUS: Record<string, { label: string; tone: PillTone }> = {
  open: { label: "Open", tone: "attention" },
  partially_paid: { label: "Part paid", tone: "attention" },
  paid: { label: "Paid", tone: "live" },
  void: { label: "Void", tone: "neutral" },
  uncollectible: { label: "Uncollectible", tone: "danger" },
};

export function CollectionPill({ state }: { state: string }) {
  const entry = COLLECTION[state] ?? { label: state, tone: "neutral" as PillTone };
  return <StatusPill value={state} label={entry.label} tone={entry.tone} />;
}

export function InvoiceStatusPill({ status }: { status: string }) {
  const entry = STATUS[status] ?? { label: status, tone: "neutral" as PillTone };
  return <StatusPill value={status} label={entry.label} tone={entry.tone} />;
}
