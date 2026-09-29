import { SegmentedLinks } from "@/components/ui/toolbar";

const TABS = [
  { href: "/mail", label: "Overview" },
  { href: "/mail/campaigns", label: "Campaigns" },
  { href: "/mail/sequences", label: "Sequences" },
  { href: "/mail/replies", label: "Replies" },
  { href: "/mail/templates", label: "Templates" },
  { href: "/mail/segments", label: "Segments" },
  { href: "/mail/suppressions", label: "Stop list" },
  { href: "/mail/reports", label: "Reports" },
  { href: "/mail/settings", label: "Settings" },
] as const;

/** Mail's own sections; the sidebar has one Mail entry for all of it. */
export function MailTabs({ current }: { current: (typeof TABS)[number]["href"] }) {
  return (
    <SegmentedLinks
      label="Mail sections"
      items={TABS.map((tab) => ({ ...tab, current: tab.href === current }))}
    />
  );
}
