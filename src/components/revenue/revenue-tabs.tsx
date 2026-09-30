import { SegmentedLinks } from "@/components/ui/toolbar";

const TABS = [
  { href: "/revenue/contracts", label: "Contracts" },
  { href: "/revenue/renewals", label: "Renewals" },
  { href: "/revenue/receivables", label: "Receivables" },
  { href: "/revenue/mrr", label: "MRR" },
] as const;

export function RevenueTabs({ current }: { current: (typeof TABS)[number]["href"] }) {
  return (
    <SegmentedLinks
      label="Revenue sections"
      items={TABS.map((tab) => ({ ...tab, current: tab.href === current }))}
    />
  );
}
