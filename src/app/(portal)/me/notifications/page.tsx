import {
  notificationPrefsAction,
  priorityRuleAction,
  subscribePushAction,
  testPushAction,
  unsubscribePushAction,
} from "@/app/(portal)/inbox/actions";
import { InstallCard } from "@/components/inbox/install-card";
import { PushDeviceCard } from "@/components/inbox/push-device-card";
import { ActForm } from "@/components/ui/act-form";
import { RowAction } from "@/components/ui/row-action";
import { Timestamp } from "@/components/ui/timestamp";
import { readPush, type PushSettings } from "@/lib/api/push";
import { requestNow } from "@/lib/request-time";
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
  const now = requestNow();
  let prefs: NotificationPrefs | null = null;
  let push: PushSettings | null = null;
  const [prefsRead, pushRead] = await Promise.allSettled([
    readNotificationPrefs(context.token),
    readPush(context.token),
  ]);
  for (const read of [prefsRead, pushRead]) {
    if (
      read.status === "rejected" &&
      !(read.reason instanceof HqApiUnavailableError || read.reason instanceof HqApiRequestError)
    )
      throw read.reason;
  }
  if (prefsRead.status === "fulfilled") prefs = prefsRead.value.prefs;
  if (pushRead.status === "fulfilled") push = pushRead.value;
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
              title="HQ as an app"
              titleAs="h3"
              description="Installed, HQ opens in its own window from the dock or the home screen, and its icon carries the count of what is unread in your inbox."
            >
              <div id="install">
                <InstallCard />
              </div>
            </Card>
            <Card
              title="Push to your devices"
              titleAs="h3"
              description="Rows that land in your Priority reach a phone or laptop you turn push on for — never in your quiet hours, never what waits under Other."
            >
              <div id="push">
                {push === null ? (
                  <p className="side-quiet">Push could not be read just now.</p>
                ) : !push.enabled ? (
                  <p className="side-quiet">
                    Push is not set up on the service yet. Once it is, turn it on here for each
                    device.
                  </p>
                ) : (
                  <PushDeviceCard
                    publicKey={push.public_key}
                    subscribeAction={subscribePushAction}
                    unsubscribeAction={unsubscribePushAction}
                  />
                )}
                {push !== null && push.devices.length > 0 && (
                  <>
                    <ul className="policy-list push-devices" aria-label="Devices with push on">
                      {push.devices.map((device) => (
                        <li key={device.subscription_id} className="policy">
                          <div className="policy__main">
                            <span className="policy__title">{device.label}</span>
                            <span className="policy__meta">
                              On since{" "}
                              <Timestamp value={device.created_at} now={now} mode="relative" />
                              {device.last_sent_at && (
                                <>
                                  {" · last notice "}
                                  <Timestamp
                                    value={device.last_sent_at}
                                    now={now}
                                    mode="relative"
                                  />
                                  {device.last_status !== null &&
                                    (device.last_status >= 200 && device.last_status < 300
                                      ? ", delivered"
                                      : ", not delivered")}
                                </>
                              )}
                            </span>
                          </div>
                          <RowAction
                            action={unsubscribePushAction}
                            fields={{ subscription_id: device.subscription_id }}
                            buttons={[
                              {
                                label: "Turn off",
                                className: "btn btn--small btn--ghost",
                                ariaLabel: `Turn push off for ${device.label}`,
                              },
                            ]}
                          />
                        </li>
                      ))}
                    </ul>
                    <ActForm action={testPushAction} hidden={{}} act="test" label="Send a test" />
                  </>
                )}
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
