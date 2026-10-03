import { notificationPrefsAction, priorityRuleAction } from "@/app/(portal)/inbox/actions";
import { NotificationPrefsForm } from "@/components/inbox/notification-prefs-form";
import { PriorityRuleForm } from "@/components/inbox/priority-rule-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readNotificationPrefs, type NotificationPrefs } from "@/lib/api/inbox";

export const metadata = { title: "My notifications" };
export const dynamic = "force-dynamic";

/** What counts as this person's Priority, and how the inbox reaches them by mail: for what
 * stays unread, for Priority alone, once a day, or never. */
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
          <>
            <Card
              title="Your Priority"
              titleAs="h3"
              description="Your inbox puts what needs you now apart from what can wait. Choose what counts as Priority; everything else waits under Other. The rule is yours alone."
            >
              <div id="priority">
                <PriorityRuleForm
                  action={priorityRuleAction}
                  reasons={prefs.priority_reasons}
                  isDefault={prefs.priority_default}
                />
              </div>
            </Card>
            <Card
              title="Mail from your inbox"
              titleAs="h3"
              description="Everything lands in your inbox first. Mail is a reminder of what you have not seen, never a second copy of everything."
            >
              <NotificationPrefsForm action={notificationPrefsAction} prefs={prefs} />
            </Card>
          </>
        )}
      </div>
    </>
  );
}
