import { SegmentedLinks } from "@/components/ui/toolbar";

/**
 * Money's views (ws-notes/duties/spec.md §4.2): the same strip on each of its pages. Statements
 * name who was paid what, so their tab is shown to the Owner only; the pages check for themselves.
 */
export const MONEY_TABS = [
  { key: "bills", label: "Bills", href: "/data/money" },
  { key: "vendors", label: "Vendors", href: "/data/money/vendors" },
  { key: "ledger", label: "Ledger map", href: "/data/money/ledger" },
  { key: "exports", label: "Export invoices", href: "/data/money/exports" },
  { key: "statements", label: "Statements", href: "/data/money/statements" },
  { key: "close", label: "Month close", href: "/data/money/close" },
] as const;

export type MoneyTab = (typeof MONEY_TABS)[number]["key"];

export function MoneyTabs({ current, owner }: { current: MoneyTab; owner: boolean }) {
  return (
    <SegmentedLinks
      label="Money"
      items={MONEY_TABS.filter((tab) => owner || tab.key !== "statements").map((tab) => ({
        href: tab.href,
        label: tab.label,
        current: tab.key === current,
      }))}
    />
  );
}
