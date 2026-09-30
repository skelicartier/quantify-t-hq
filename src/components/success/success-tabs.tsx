import { SegmentedLinks } from "@/components/ui/toolbar";

const TABS = [
  { href: "/success", label: "Signals" },
  { href: "/success/requests", label: "Feature requests" },
  { href: "/success/onboarding", label: "Onboarding" },
] as const;

export function SuccessTabs({ current }: { current: (typeof TABS)[number]["href"] }) {
  return (
    <SegmentedLinks
      label="Customer success sections"
      items={TABS.map((tab) => ({ ...tab, current: tab.href === current }))}
    />
  );
}
