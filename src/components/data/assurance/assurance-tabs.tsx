import { SegmentedLinks } from "@/components/ui/toolbar";

/** Assurance's views (ws-notes/security/spec.md §4.2): the same strip on each of their pages. */
export const ASSURANCE_TABS = [
  { key: "summary", label: "Summary", href: "/data/assurance" },
  { key: "policies", label: "Policies", href: "/data/assurance/policies" },
  { key: "findings", label: "Pen tests and findings", href: "/data/assurance/findings" },
  { key: "certification", label: "Certification", href: "/data/assurance/certification" },
  { key: "insurance", label: "Insurance", href: "/data/assurance/insurance" },
  { key: "reviews", label: "Management review", href: "/data/assurance/reviews" },
  { key: "customers", label: "Customer duties", href: "/data/assurance/customers" },
] as const;

export type AssuranceTab = (typeof ASSURANCE_TABS)[number]["key"];

export function AssuranceTabs({ current }: { current: AssuranceTab }) {
  return (
    <SegmentedLinks
      label="Assurance"
      items={ASSURANCE_TABS.map((tab) => ({
        href: tab.href,
        label: tab.label,
        current: tab.key === current,
      }))}
    />
  );
}
