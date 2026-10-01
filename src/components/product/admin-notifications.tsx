import { saveAdminNotification } from "@/app/(portal)/product/notifications/actions";
import { AdminGate } from "@/components/product/admin-gate";
import { AdminNotificationManager } from "@/components/product/admin-notification-manager";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { PageHeader } from "@/components/shell/page-header";
import { Stat, StatGrid } from "@/components/ui/stat";
import type { AdminNotificationsAccess } from "@/lib/product/access";
import { formatNumber } from "@/lib/format";

type AdminNotificationsProps = {
  access: AdminNotificationsAccess;
};

export function AdminNotifications({ access }: AdminNotificationsProps) {
  const authorized = access.status === "authorized" ? access : null;
  const notices = authorized?.notifications.notifications ?? [];
  // The loader stamps the evaluation instant; without one, windows cannot be judged and
  // only the active flag is counted.
  const evaluatedAt = authorized?.evaluatedAt;
  const activeNow = notices.filter(
    (note) =>
      note.active &&
      (evaluatedAt === undefined ||
        ((!note.starts_at || Date.parse(note.starts_at) <= evaluatedAt) &&
          (!note.expires_at || Date.parse(note.expires_at) >= evaluatedAt))),
  ).length;
  const scheduled =
    evaluatedAt === undefined
      ? 0
      : notices.filter(
          (note) => note.active && note.starts_at && Date.parse(note.starts_at) > evaluatedAt,
        ).length;

  return (
    <>
      <PageHeader
        eyebrow="Product"
        title="Notices"
        titleId="admin-notifications-heading"
        description="In-app notices shown to account holders in their account console and the desktop terminal."
        meta={authorized ? <LiveRefresh label="Notices" intervalSeconds={60} /> : undefined}
      />
      <div className="page-content">
        <AdminGate access={access} section="Notifications">
          {authorized && (
            <>
              <StatGrid columns={3} label="Notification summary">
                <Stat label="Total notices" value={formatNumber(notices.length)} />
                <Stat label="Showing now" value={formatNumber(activeNow)} />
                <Stat label="Scheduled" value={formatNumber(scheduled)} />
              </StatGrid>
              <AdminNotificationManager
                document={authorized.notifications}
                evaluatedAt={authorized.evaluatedAt}
                action={saveAdminNotification}
              />
            </>
          )}
        </AdminGate>
      </div>
    </>
  );
}
