import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { SegmentedLinks } from "@/components/ui/toolbar";

const ARTICLE: Record<string, { label: string; tone: PillTone }> = {
  draft: { label: "Draft", tone: "attention" },
  published: { label: "Published", tone: "live" },
  archived: { label: "Archived", tone: "neutral" },
};

export function ArticleStatePill({ status, reviewDue }: { status: string; reviewDue?: boolean }) {
  if (status === "published" && reviewDue)
    return <StatusPill value="review_due" label="Review due" tone="attention" />;
  const shown = ARTICLE[status] ?? { label: status, tone: "neutral" as PillTone };
  return <StatusPill value={status} label={shown.label} tone={shown.tone} />;
}

const ENTRY_TONE: Record<string, PillTone> = {
  new: "live",
  improved: "attention",
  fixed: "neutral",
};

export function EntryKindPill({ kind, label }: { kind: string; label: string }) {
  return <StatusPill value={kind} label={label} tone={ENTRY_TONE[kind] ?? "neutral"} />;
}

const HELP_TABS = [
  { href: "/help", label: "Articles" },
  { href: "/help/gaps", label: "Gaps" },
] as const;

export function HelpTabs({ current }: { current: (typeof HELP_TABS)[number]["href"] }) {
  return (
    <SegmentedLinks
      label="Help centre sections"
      items={HELP_TABS.map((tab) => ({ ...tab, current: tab.href === current }))}
    />
  );
}
