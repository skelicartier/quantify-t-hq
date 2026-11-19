import { SegmentedLinks } from "@/components/ui/toolbar";

/** The registers' views (ws-notes/duties/spec.md §4.2): the same strip on each of their pages. */
export const REGISTERS_TABS = [
  { key: "summary", label: "Summary", href: "/data/registers" },
  { key: "incidents", label: "Incidents", href: "/data/registers/incidents" },
  { key: "marks", label: "Trademarks", href: "/data/registers/marks" },
  { key: "domains", label: "Domains and certificates", href: "/data/registers/domains" },
  { key: "holidays", label: "Holidays", href: "/data/registers/holidays" },
] as const;

export type RegistersTab = (typeof REGISTERS_TABS)[number]["key"];

export function RegistersTabs({ current }: { current: RegistersTab }) {
  return (
    <SegmentedLinks
      label="Registers"
      items={REGISTERS_TABS.map((tab) => ({
        href: tab.href,
        label: tab.label,
        current: tab.key === current,
      }))}
    />
  );
}
