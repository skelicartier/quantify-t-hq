import { SegmentedLinks } from "@/components/ui/toolbar";

/** The company record's views (ws-notes/company/spec.md §4.2): the same strip on each of its pages. */
export const COMPANY_TABS = [
  { key: "facts", label: "Facts", href: "/data/company" },
  { key: "directors", label: "Directors", href: "/data/company/directors" },
  { key: "meetings", label: "Meetings", href: "/data/company/meetings" },
  { key: "members", label: "Members", href: "/data/company/members" },
  { key: "agreements", label: "Agreements", href: "/data/company/agreements" },
] as const;

export type CompanyTab = (typeof COMPANY_TABS)[number]["key"];

export function CompanyTabs({ current }: { current: CompanyTab }) {
  return (
    <SegmentedLinks
      label="Company record"
      items={COMPANY_TABS.map((tab) => ({
        href: tab.href,
        label: tab.label,
        current: tab.key === current,
      }))}
    />
  );
}
