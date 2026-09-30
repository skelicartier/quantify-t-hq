import { SegmentedLinks } from "@/components/ui/toolbar";

const TABS = [
  { href: "/deals", label: "Pipeline" },
  { href: "/deals/changes", label: "What changed" },
  { href: "/deals/forecast", label: "Forecast" },
  { href: "/deals/competitors", label: "Competitors" },
  { href: "/deals/win-loss", label: "Win/loss" },
] as const;

export function PipelineTabs({ current }: { current: (typeof TABS)[number]["href"] }) {
  return (
    <SegmentedLinks
      label="Pipeline sections"
      items={TABS.map((tab) => ({ ...tab, current: tab.href === current }))}
    />
  );
}
