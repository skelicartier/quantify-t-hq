import { SegmentedLinks } from "@/components/ui/toolbar";

const TABS = [
  { href: "/privacy", label: "Requests" },
  { href: "/privacy/incidents", label: "Incidents" },
  { href: "/privacy/subprocessors", label: "Sub-processors" },
  { href: "/privacy/commitments", label: "Commitments" },
] as const;

export function PrivacyTabs({ current }: { current: (typeof TABS)[number]["href"] }) {
  return (
    <SegmentedLinks
      label="Privacy desk sections"
      items={TABS.map((tab) => ({ ...tab, current: tab.href === current }))}
    />
  );
}
