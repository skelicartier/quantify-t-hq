import {
  clearReadHoldAction,
  confirmSudoAction,
  plantDecoyAction,
  removeDecoyAction,
  updateSecurityEventAction,
} from "@/app/(portal)/admin/actions";
import { PlantDecoyForm } from "@/components/admin/decoy-forms";
import { StaffReasonForm } from "@/components/admin/staff-forms";
import { SudoGate } from "@/components/admin/sudo-gate";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
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
  readDecoys,
  readReadWatch,
  readSecurityEvents,
  type Decoys,
  type ReadWatch,
  type ReadWatchPerson,
  type SecurityFeed,
} from "@/lib/api/security";
import { formatAbsolute } from "@/lib/format";
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
const READ_STATE: Record<ReadWatchPerson["state"], { label: string; tone: PillTone }> = {
  normal: { label: "Normal", tone: "neutral" },
  notified: { label: "Owners told", tone: "attention" },
  step_up: { label: "Needs a code", tone: "attention" },
  held: { label: "Held", tone: "danger" },
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
  let watch: ReadWatch | null = null;
  try {
    watch = await readReadWatch(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const isOwner = context.me.role === "owner";
  let decoys: Decoys | null = null;
  if (isOwner) {
    try {
      decoys = await readDecoys(context.token);
    } catch (error) {
      if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
        throw error;
    }
  }
  const fresh = context.me.sudo_fresh;
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  const watched = (watch?.people ?? []).filter(
    (person) => person.opened_last_hour > 0 || person.state === "held",
  );
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
          <div className="record-layout">
            <div className="record-layout__main">
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
            </div>
            <aside className="record-layout__side">
              <SudoGate
                action={confirmSudoAction}
                fresh={fresh}
                untilLabel={untilLabel}
                returnPath="/admin/security"
                purpose="Clearing a hold, and planting or removing a decoy, needs a fresh code from your authenticator app."
              />
              <Card
                title="Reading this hour"
                titleAs="h3"
                description={
                  watch
                    ? `Different records each person opened in the last ${watch.thresholds.window_minutes} minutes. Owners are told past ${watch.thresholds.notify} (${watch.thresholds.intern_notify} for an intern), a fresh code is needed past ${watch.thresholds.step_up}, and past ${watch.thresholds.hold} reading is held until someone clears it. Owners are never held.`
                    : undefined
                }
              >
                {watch === null ? (
                  <Callout tone="danger" role="alert" compact>
                    The read counts could not be read just now.
                  </Callout>
                ) : watched.length === 0 ? (
                  <p className="muted">Nobody has opened a record in the last hour.</p>
                ) : (
                  <ul className="policy-list">
                    {watched.map((person) => (
                      <li key={person.staff_id} className="policy read-watch">
                        <div className="policy__main">
                          <span className="policy__title">{person.name}</span>
                          <span className="policy__meta">
                            {person.opened_last_hour} opened · owners told at {person.notify_at}
                            {person.peak > person.opened_last_hour && ` · peak ${person.peak}`}
                            {person.held_at && person.state === "held" && " · held "}
                            {person.held_at && person.state === "held" && (
                              <Timestamp value={person.held_at} now={now} mode="relative" />
                            )}
                          </span>
                        </div>
                        <StatusPill
                          value={person.state}
                          label={READ_STATE[person.state].label}
                          tone={READ_STATE[person.state].tone}
                        />
                        {person.state === "held" &&
                          person.staff_id !== context.me.staff.staff_id && (
                            <div className="read-watch__clear">
                              <StaffReasonForm
                                action={clearReadHoldAction}
                                staffId={person.staff_id}
                                label="Clear the hold"
                                pendingLabel="Clearing…"
                                hint="Why it was real work. Kept in the audit log."
                                disabled={!fresh}
                              />
                            </div>
                          )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              {isOwner && (
                <Card
                  title="Decoys"
                  titleAs="h3"
                  description="Records and keys nobody has a reason to touch. Opening, exporting or using one tells every owner at once. Only owners see this list; the audit log records that one was planted, never which."
                >
                  {decoys === null ? (
                    <Callout tone="danger" role="alert" compact>
                      The decoys could not be read just now.
                    </Callout>
                  ) : (
                    <>
                      {decoys.decoys.length === 0 ? (
                        <p className="muted">None planted.</p>
                      ) : (
                        <ul className="policy-list">
                          {decoys.decoys.map((decoy) => (
                            <li key={decoy.decoy_id} className="policy">
                              <div className="policy__main">
                                <span className="policy__title">{decoy.label}</span>
                                <span className="policy__meta">
                                  {decoy.entity_type === "company" ? "Company" : "Intake key"} ·{" "}
                                  {decoy.touches === 0
                                    ? "never touched"
                                    : `touched ${decoy.touches} ${decoy.touches === 1 ? "time" : "times"}, last `}
                                  {decoy.last_touched_at && (
                                    <Timestamp
                                      value={decoy.last_touched_at}
                                      now={now}
                                      mode="relative"
                                    />
                                  )}
                                </span>
                              </div>
                              <RowAction
                                action={removeDecoyAction}
                                fields={{ decoy_id: decoy.decoy_id }}
                                buttons={[
                                  {
                                    label: "Remove",
                                    pendingLabel: "Removing…",
                                    className: "btn btn--small btn--ghost",
                                    ariaLabel: `Remove the decoy ${decoy.label}`,
                                  },
                                ]}
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                      <PlantDecoyForm
                        action={plantDecoyAction}
                        suggestions={decoys.suggested_firms}
                        disabled={!fresh}
                      />
                    </>
                  )}
                </Card>
              )}
            </aside>
          </div>
        </>
      )}
    </>
  );
}
