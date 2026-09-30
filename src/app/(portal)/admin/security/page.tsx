import { updateSecurityEventAction } from "@/app/(portal)/admin/actions";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { SecurityEventForm } from "@/components/admin/security-event-form";
import { SecurityStatePill, SeverityPill } from "@/components/admin/security-pills";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Stat, StatGrid } from "@/components/ui/stat";
import { Timestamp } from "@/components/ui/timestamp";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import {
  SECURITY_SEVERITIES,
  SECURITY_STATES,
  readSecurityEvents,
  type SecurityFeed,
} from "@/lib/api/security";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Security" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ state?: string | string[]; severity?: string | string[] }>;

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function href(state: string, severity: string): string {
  const query = new URLSearchParams();
  if (state) query.set("state", state);
  if (severity) query.set("severity", severity);
  const text = query.toString();
  return text ? `/admin/security?${text}` : "/admin/security";
}

const STATE_LABELS: Record<string, string> = {
  "": "All",
  open: "Open",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
};
const SEVERITY_LABELS: Record<string, string> = {
  "": "Any level",
  info: "Info",
  warning: "Warning",
  critical: "Critical",
};

/**
 * The owners' worklist for what happened to people's sign-ins: new devices, factor
 * changes, recovery codes spent, unusual sign-ins, and "this wasn't me" presses. The
 * audit log keeps everything forever; this keeps each item open until someone has looked.
 */
export default async function SecurityFeedPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await requireStaff("/admin/security");
  const now = requestNow();
  if (!hasCapability(context, "hq:admin")) {
    return (
      <>
        <PageHeader eyebrow="Admin" title="Security" />
        <Callout tone="neutral">The security feed is for HQ owners and admins.</Callout>
      </>
    );
  }
  const parameters = await searchParams;
  const rawState = one(parameters.state);
  const rawSeverity = one(parameters.severity);
  const state = (SECURITY_STATES as readonly string[]).includes(rawState) ? rawState : "";
  const severity = (SECURITY_SEVERITIES as readonly string[]).includes(rawSeverity)
    ? rawSeverity
    : "";
  let feed: SecurityFeed | null = null;
  try {
    feed = await readSecurityEvents(context.token, { state, severity });
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const criticalOpen = (feed?.events ?? []).filter(
    (event) => event.severity === "critical" && event.state !== "resolved",
  ).length;

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Security"
        description="What happened to people's sign-ins, open until someone has looked. The person each event is about was mailed, with a link that locks their account if it was not them."
        actions={<AdminTabs current="/admin/security" />}
      />
      {feed === null ? (
        <Callout tone="danger" role="alert">
          The security feed could not be read just now. This is a read failure, not a quiet week.
        </Callout>
      ) : (
        <>
          <StatGrid columns={4} label="Security events, last 90 days">
            <Stat
              label="Open"
              value={feed.counts_90d.open ?? 0}
              tone={(feed.counts_90d.open ?? 0) > 0 ? "danger" : "default"}
            />
            <Stat label="Acknowledged" value={feed.counts_90d.acknowledged ?? 0} />
            <Stat label="Resolved" value={feed.counts_90d.resolved ?? 0} />
            <Stat
              label="Critical, not resolved"
              value={criticalOpen}
              tone={criticalOpen > 0 ? "danger" : "default"}
              hint="In the list below"
            />
          </StatGrid>
          <div className="list-bar">
            <SegmentedLinks
              label="Filter by state"
              items={["", ...SECURITY_STATES].map((value) => ({
                href: href(value, severity),
                label: STATE_LABELS[value] ?? value,
                current: value === state,
              }))}
            />
            <SegmentedLinks
              label="Filter by level"
              items={["", ...SECURITY_SEVERITIES].map((value) => ({
                href: href(state, value),
                label: SEVERITY_LABELS[value] ?? value,
                current: value === severity,
              }))}
            />
          </div>
          <Card>
            {feed.events.length === 0 ? (
              <EmptyState
                compact
                title={state || severity ? "Nothing matches" : "Nothing has happened yet"}
                description="New devices, factor changes, recovery codes used and unusual sign-ins land here as they happen."
              />
            ) : (
              <ul className="policy-list">
                {feed.events.map((event) => (
                  <li key={event.event_id} className="policy security-event">
                    <div className="policy__main">
                      <span className="policy__title">
                        {event.label}
                        {event.subject ? ` — ${event.subject.name}` : ""}
                      </span>
                      <span className="security-event__summary">{event.summary}</span>
                      <span className="policy__meta">
                        <Timestamp value={event.occurred_at} now={now} mode="absolute" />
                        {event.ip && ` · from ${event.ip}`}
                        {event.actor && ` · by ${event.actor.name}`}
                        {event.reported_at && " · they said this wasn't them"}
                        {event.handled_by &&
                          ` · ${event.state === "resolved" ? "resolved" : "acknowledged"} by ${event.handled_by.name}`}
                        {event.note && ` · “${event.note}”`}
                      </span>
                    </div>
                    <div className="security-event__side">
                      <div className="security-event__pills">
                        <SeverityPill severity={event.severity} />
                        <SecurityStatePill state={event.state} />
                      </div>
                      <SecurityEventForm
                        action={updateSecurityEventAction}
                        eventId={event.event_id}
                        state={event.state}
                        critical={event.severity === "critical"}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  );
}
