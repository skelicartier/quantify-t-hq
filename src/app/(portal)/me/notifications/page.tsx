import { notificationPrefsAction } from "@/app/(portal)/inbox/actions";
import { NotificationPrefsForm } from "@/components/inbox/notification-prefs-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readNotificationPrefs, type NotificationPrefs } from "@/lib/api/inbox";

export const metadata = { title: "My notifications" };
export const dynamic = "force-dynamic";

/** How the inbox reaches this person by mail: for what stays unread, once a day, or never. */
export default async function NotificationsPage() {
  const context = await requireStaff("/me/notifications");
  let prefs: NotificationPrefs | null = null;
  try {
    prefs = (await readNotificationPrefs(context.token)).prefs;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  return (
    <>
      <PageHeader eyebrow="My account" title="My notifications" />
      <div className="page-content">
        {prefs === null ? (
          <Callout tone="danger" role="alert">
            Your settings could not be read just now. Nothing was changed.
          </Callout>
        ) : (
          <Card
            title="Mail from your inbox"
            titleAs="h3"
            description="Everything lands in your inbox first. Mail is a reminder of what you have not seen, never a second copy of everything."
          >
            <NotificationPrefsForm action={notificationPrefsAction} prefs={prefs} />
          </Card>
        )}
      </div>
    </>
  );
}
