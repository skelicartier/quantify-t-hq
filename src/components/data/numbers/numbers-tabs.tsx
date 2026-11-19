import { SegmentedLinks } from "@/components/ui/toolbar";

/** The numbers' views (ws-notes/duties/spec.md §4.2): the same strip on each of their pages. */
export const NUMBERS_TABS = [
  { key: "numbers", label: "Numbers", href: "/data/numbers" },
  { key: "mis", label: "MIS", href: "/data/numbers/mis" },
  { key: "cash", label: "Cash view", href: "/data/numbers/cash" },
] as const;

export type NumbersTab = (typeof NUMBERS_TABS)[number]["key"];

export function NumbersTabs({ current }: { current: NumbersTab }) {
  return (
    <SegmentedLinks
      label="Numbers"
      items={NUMBERS_TABS.map((tab) => ({
        href: tab.href,
        label: tab.label,
        current: tab.key === current,
      }))}
    />
  );
}
