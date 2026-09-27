import { SegmentedLinks } from "@/components/ui/toolbar";

const TABS = [
  { href: "/admin/staff", label: "Staff" },
  { href: "/admin/integrations", label: "Integrations" },
  { href: "/admin/settings/pipeline", label: "Pipeline" },
  { href: "/admin/audit", label: "Audit" },
] as const;

/** The admin area's own tabs; the sidebar has one Admin entry for all of it. */
export function AdminTabs({ current }: { current: (typeof TABS)[number]["href"] }) {
  return (
    <SegmentedLinks
      label="Admin sections"
      items={TABS.map((tab) => ({ ...tab, current: tab.href === current }))}
    />
  );
}
