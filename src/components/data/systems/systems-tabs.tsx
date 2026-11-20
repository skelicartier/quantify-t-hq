import { SegmentedLinks } from "@/components/ui/toolbar";

/** Systems' views (ws-notes/security/spec.md §4.2): the same strip on each of their pages. */
export const SYSTEMS_TABS = [
  { key: "tools", label: "Tools", href: "/data/systems" },
  { key: "accounts", label: "Accounts", href: "/data/systems/accounts" },
  { key: "devices", label: "Devices", href: "/data/systems/devices" },
  { key: "logs", label: "Logs and time", href: "/data/systems/logs" },
  { key: "backups", label: "Backups", href: "/data/systems/backups" },
] as const;

export type SystemsTab = (typeof SYSTEMS_TABS)[number]["key"];

export function SystemsTabs({ current }: { current: SystemsTab }) {
  return (
    <SegmentedLinks
      label="Systems"
      items={SYSTEMS_TABS.map((tab) => ({
        href: tab.href,
        label: tab.label,
        current: tab.key === current,
      }))}
    />
  );
}
