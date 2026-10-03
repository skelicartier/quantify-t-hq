import { SegmentedLinks } from "@/components/ui/toolbar";

const TABS = [
  { href: "/leads", label: "Inbound" },
  { href: "/leads/prospects", label: "Prospects" },
  { href: "/leads/segments", label: "Segments" },
  { href: "/leads/import", label: "Import" },
  { href: "/leads/fit", label: "Fit rules" },
  { href: "/leads/rules", label: "Sending rules" },
] as const;

/**
 * The lead section's own pages: the people who wrote to us, the people we found, the
 * groups worth mailing, the files that came in, what makes a prospect a good fit, and
 * what must be true before the team writes to one first.
 */
export function LeadTabs({ current }: { current: (typeof TABS)[number]["href"] }) {
  return (
    <SegmentedLinks
      label="Lead sections"
      items={TABS.map((tab) => ({ ...tab, current: tab.href === current }))}
    />
  );
}
