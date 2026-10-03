import Link from "next/link";

import {
  cancelReminderAction,
  inboxBulkAction,
  inboxItemAction,
  openInboxItemAction,
} from "@/app/(portal)/inbox/actions";
import { InboxItemControls } from "@/components/inbox/inbox-controls";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readInbox, type InboxItem, type InboxPage } from "@/lib/api/inbox";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

const VIEWS = ["inbox", "snoozed", "done"] as const;
type View = (typeof VIEWS)[number];

const REASON_TONES: Record<string, PillTone> = {
  security: "danger",
  late: "danger",
  review: "attention",
  mention: "live",
  assigned: "live",
  signal: "live",
  reply: "attention",
  reminder: "neutral",
  state: "neutral",
  activity: "neutral",
};

type SearchParams = Promise<{
  view?: string | string[];
  reason?: string | string[];
  box?: string | string[];
}>;

const BOXES = ["", "priority", "other"] as const;
type Box = (typeof BOXES)[number];

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function href(view: string, reason: string, box: Box = ""): string {
  const query = new URLSearchParams();
  if (view !== "inbox") query.set("view", view);
  if (reason) query.set("reason", reason);
  if (box && view === "inbox") query.set("box", box);
  const text = query.toString();
  return text ? `/inbox?${text}` : "/inbox";
}

function InboxList({
  items,
  now,
  label,
}: {
  items: readonly InboxItem[];
  now: number;
  label: string;
}) {
  return (
    <ul className="inbox-list" aria-label={label}>
      {items.map((item) => (
        <li key={item.notification_id} className={`inbox-item inbox-item--${item.state}`}>
          <div className="inbox-item__main">
            <div className="inbox-item__head">
              <StatusPill
                value={item.reason}
                label={item.reason_label}
                tone={REASON_TONES[item.reason] ?? "neutral"}
              />
              <form action={openInboxItemAction} className="inbox-item__open">
                <input type="hidden" name="notification_id" value={item.notification_id} />
                <input type="hidden" name="link_path" value={item.link_path} />
                <button type="submit" className="inbox-item__title">
                  {item.state === "unread" && (
                    <span className="inbox-item__dot" aria-hidden="true" />
                  )}
                  {item.subject_label || item.reason_label}
                  {item.state === "unread" && <span className="sr-only"> (unread)</span>}
                </button>
              </form>
            </div>
            <p className="inbox-item__summary">{item.summary}</p>
            <p className="inbox-item__meta">
              {item.actor ? `${item.actor.name} · ` : ""}
              <Timestamp value={item.last_at} now={now} mode="relative" />
              {item.event_count > 1 && ` · ${item.event_count} updates`}
              {item.state === "snoozed" && item.snoozed_until && (
                <>
                  {" · back "}
                  <Timestamp value={item.snoozed_until} now={now} mode="relative" />
                </>
              )}
            </p>
          </div>
          <InboxItemControls
            action={inboxItemAction}
            notificationId={item.notification_id}
            state={item.state}
            label={item.subject_label || item.reason_label}
          />
        </li>
      ))}
    </ul>
  );
}

function sideCount(open: number, unread: number): string {
  if (!open) return "";
  return unread ? ` · ${unread} unread of ${open}` : ` · ${open}`;
}

/**
 * What needs this person, one line per thing, with why it is here — their Priority (what
 * their own rule names) above Other. New activity on a line folds into it and makes it
 * unread again; Done clears it; Snooze hides it until a time. Opening a line marks it
 * read. Mail comes only for what stays unread, as each person chose under My
 * notifications.
 */
export default async function InboxPageView({ searchParams }: { searchParams: SearchParams }) {
  const context = await requireStaff("/inbox");
  const now = requestNow();
  const parameters = await searchParams;
  const rawView = one(parameters.view);
  const view: View = (VIEWS as readonly string[]).includes(rawView) ? (rawView as View) : "inbox";
  const reason = one(parameters.reason);
  const rawBox = one(parameters.box);
  const box: Box =
    view === "inbox" && (BOXES as readonly string[]).includes(rawBox) ? (rawBox as Box) : "";
  let page: InboxPage | null = null;
  try {
    page = await readInbox(context.token, { view, reason, box });
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  return (
    <>
      <PageHeader
        eyebrow="Command"
        title="Inbox"
        description="Mentions, things given to you, replies, approvals waiting on you, activity on what you follow, and your reminders — one line per thing, what needs you now above what can wait."
        actions={
          <>
            <Link className="btn btn--small btn--ghost" href="/me/notifications#priority">
              Your Priority
            </Link>
            <Link className="btn btn--small btn--ghost" href="/me/notifications">
              Mail settings
            </Link>
          </>
        }
      />
      {page === null ? (
        <Callout tone="danger" role="alert">
          Your inbox could not be read just now. This is a read failure, not an empty inbox.
        </Callout>
      ) : (
        <div className="record-layout">
          <div className="record-layout__main">
            <div className="list-bar">
              <SegmentedLinks
                label="Inbox views"
                items={[
                  {
                    href: href("inbox", reason),
                    label: `Inbox${page.counts.inbox ? ` ${page.counts.inbox}` : ""}`,
                    current: view === "inbox",
                  },
                  {
                    href: href("snoozed", reason),
                    label: `Snoozed${page.counts.snoozed ? ` ${page.counts.snoozed}` : ""}`,
                    current: view === "snoozed",
                  },
                  { href: href("done", reason), label: "Done", current: view === "done" },
                ]}
              />
              {view === "inbox" && (
                <SegmentedLinks
                  label="Priority or other"
                  items={[
                    { href: href("inbox", reason, ""), label: "Both", current: box === "" },
                    {
                      href: href("inbox", reason, "priority"),
                      label: `Priority${page.counts.priority ? ` ${page.counts.priority}` : ""}`,
                      current: box === "priority",
                    },
                    {
                      href: href("inbox", reason, "other"),
                      label: `Other${page.counts.other ? ` ${page.counts.other}` : ""}`,
                      current: box === "other",
                    },
                  ]}
                />
              )}
              {view === "inbox" && page.counts.inbox > 0 && (
                <RowAction
                  action={inboxBulkAction}
                  fields={{}}
                  className="inbox-bulk"
                  buttons={[
                    {
                      label: "Mark all read",
                      name: "action",
                      value: "read_all",
                      className: "btn btn--small btn--ghost",
                    },
                    {
                      label: "Clear read",
                      name: "action",
                      value: "clear_read",
                      className: "btn btn--small btn--ghost",
                    },
                  ]}
                />
              )}
            </div>
            <SegmentedLinks
              label="Filter by reason"
              items={[
                { href: href(view, "", box), label: "Everything", current: !reason },
                ...page.reasons.map((item) => ({
                  href: href(view, item.reason, box),
                  label: item.label,
                  current: reason === item.reason,
                })),
              ]}
            />
            {view === "inbox" && box === "" && page.items.length > 0 ? (
              <>
                <section className="inbox-side" aria-labelledby="inbox-priority">
                  <h2 className="inbox-side__title" id="inbox-priority">
                    Priority
                    <span className="inbox-side__count">
                      {sideCount(page.counts.priority, page.counts.priority_unread)}
                    </span>
                  </h2>
                  <Card>
                    {page.items.some((item) => item.priority) ? (
                      <InboxList
                        items={page.items.filter((item) => item.priority)}
                        now={now}
                        label="Priority"
                      />
                    ) : (
                      <p className="side-quiet">Nothing needs you now.</p>
                    )}
                  </Card>
                </section>
                <section className="inbox-side" aria-labelledby="inbox-other">
                  <h2 className="inbox-side__title" id="inbox-other">
                    Other
                    <span className="inbox-side__count">
                      {sideCount(page.counts.other, page.counts.other_unread)}
                    </span>
                  </h2>
                  <Card>
                    {page.items.some((item) => !item.priority) ? (
                      <InboxList
                        items={page.items.filter((item) => !item.priority)}
                        now={now}
                        label="Other"
                      />
                    ) : (
                      <p className="side-quiet">Nothing else waits.</p>
                    )}
                  </Card>
                </section>
              </>
            ) : (
              <Card>
                {page.items.length === 0 ? (
                  <EmptyState
                    compact
                    title={
                      view === "done"
                        ? "Nothing done yet"
                        : view === "snoozed"
                          ? "Nothing snoozed"
                          : reason
                            ? "Nothing of this kind"
                            : box === "priority"
                              ? "Nothing needs you now"
                              : "Nothing waits for you"
                    }
                    description={
                      view === "inbox" && !reason && box === ""
                        ? "When someone mentions you, gives you something, replies on a ticket you look after, or needs your approval, it lands here."
                        : undefined
                    }
                  />
                ) : (
                  <InboxList items={page.items} now={now} label="Inbox" />
                )}
              </Card>
            )}
          </div>
          <aside className="record-layout__side">
            <Card
              title="Reminders"
              titleAs="h3"
              description="Set one with Remind me on any company, person, deal, lead or ticket. It lands here at its time."
            >
              {page.reminders.length === 0 ? (
                <p className="muted">None waiting.</p>
              ) : (
                <ul className="policy-list">
                  {page.reminders.map((reminder) => (
                    <li key={reminder.reminder_id} className="policy">
                      <div className="policy__main">
                        <Link className="policy__title" href={reminder.link_path}>
                          {reminder.subject_label || "A record"}
                        </Link>
                        <span className="policy__meta">
                          <Timestamp value={reminder.remind_at} now={now} mode="absolute" />
                          {reminder.note && ` · ${reminder.note}`}
                        </span>
                      </div>
                      <RowAction
                        action={cancelReminderAction}
                        fields={{ reminder_id: reminder.reminder_id }}
                        buttons={[
                          {
                            label: "Cancel",
                            pendingLabel: "Cancelling…",
                            className: "btn btn--small btn--ghost",
                            ariaLabel: `Cancel the reminder about ${reminder.subject_label || "a record"}`,
                          },
                        ]}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </aside>
        </div>
      )}
    </>
  );
}
