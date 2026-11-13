import { SegmentedLinks } from "@/components/ui/toolbar";

const TABS = [
  { href: "/mail", label: "Overview" },
  { href: "/mail/campaigns", label: "Campaigns" },
  { href: "/mail/sequences", label: "Sequences" },
  { href: "/mail/mailboxes", label: "Mailboxes" },
  { href: "/mail/replies", label: "Replies" },
  { href: "/mail/templates", label: "Templates" },
  { href: "/mail/lists", label: "Lists" },
  { href: "/mail/segments", label: "Segments" },
  { href: "/mail/suppressions", label: "Stop list" },
  { href: "/mail/reports", label: "Reports" },
  { href: "/mail/settings", label: "Settings" },
] as const;

/** There only where a sender is set up beside the portal (`lib/merge/api.ts`). */
const MERGE = { href: "/mail/merge", label: "Mail merge" } as const;

type MailSection = (typeof TABS)[number]["href"] | typeof MERGE.href;

/** Mail's own sections; the sidebar has one Mail entry for all of it. */
export function MailTabs({ current }: { current: MailSection }) {
  const merge = (process.env.HQ_MAIL_MERGE_SOCKET ?? "").trim().startsWith("/");
  return (
    <SegmentedLinks
      label="Mail sections"
      items={[...TABS, ...(merge ? [MERGE] : [])].map((tab) => ({
        ...tab,
        current: tab.href === current,
      }))}
    />
  );
}
