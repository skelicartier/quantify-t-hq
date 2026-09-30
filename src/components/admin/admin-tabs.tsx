import { SegmentedLinks } from "@/components/ui/toolbar";

const TABS = [
  { href: "/admin/staff", label: "Staff" },
  { href: "/admin/integrations", label: "Integrations" },
  { href: "/admin/approvals", label: "Approvals" },
  { href: "/admin/security", label: "Security" },
  { href: "/admin/privileged", label: "Privileged access" },
  { href: "/admin/ai", label: "AI assistance" },
  { href: "/admin/webhooks", label: "Webhooks" },
  { href: "/admin/rules", label: "Rules" },
  { href: "/admin/fields", label: "Fields" },
  { href: "/admin/automations", label: "Automations" },
  { href: "/admin/settings/pipeline", label: "Pipeline" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/danger", label: "Danger zone" },
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
