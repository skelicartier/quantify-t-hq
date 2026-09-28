import {
  confirmSudoAction,
  connectCalendarAction,
  disconnectCalendarAction,
  mintKeyAction,
  revokeKeyAction,
  syncCalendarAction,
} from "@/app/(portal)/admin/actions";
import {
  CalendarConnectForm,
  CalendarDisconnectForm,
  CalendarSyncForm,
} from "@/components/admin/calendar-forms";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { MintKeyForm, RevokeKeyForm } from "@/components/admin/intake-key-forms";
import { SudoGate } from "@/components/admin/sudo-gate";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCalendarStatus, type CalendarStatus } from "@/lib/api/integrations";
import { readApiKeys, type ApiKey } from "@/lib/api/keys";
import { readWebhooks, type WebhookEvent } from "@/lib/api/settings";
import { directoryOrNull, nameFor } from "@/lib/api/staff";
import { formatAbsolute, formatDate } from "@/lib/format";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

const KEY_COLUMNS = [
  { key: "name", label: "Key" },
  { key: "scope", label: "Allows" },
  { key: "used", label: "Last used" },
  { key: "created", label: "Minted" },
  { key: "state", label: "State" },
  { key: "revoke", label: "Revoke" },
];

const WEBHOOK_COLUMNS = [
  { key: "received", label: "Received" },
  { key: "from", label: "From" },
  { key: "outcome", label: "What happened" },
  { key: "repeats", label: "Repeats" },
];

const PROVIDER_LABELS: Record<string, string> = { calendar: "Calendar" };

/** The service writes outcomes as lowercase phrases; a table cell starts with a capital. */
function outcomeText(event: WebhookEvent): string {
  const text = event.outcome.replace(/^sync failed: /, "") || "Received";
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** What the calendar's round trip came back with, in words. */
const CALENDAR_OUTCOMES: Record<string, { tone: "success" | "danger" | "neutral"; text: string }> =
  {
    connected: {
      tone: "success",
      text: "Calendar connected. Booked meetings are syncing into Meetings.",
    },
    denied: {
      tone: "neutral",
      text: "The connection was cancelled on the consent screen. Nothing changed.",
    },
    scope: {
      tone: "danger",
      text: "Connected without calendar access: the calendar box was unticked on the consent screen. Connect again and leave it ticked.",
    },
    expired: {
      tone: "danger",
      text: "That connection attempt had expired or was not yours. Start it again.",
    },
    forbidden: { tone: "danger", text: "Only HQ admins can connect the calendar." },
    failed: {
      tone: "danger",
      text: "The calendar could not be connected. Nothing was changed; try again.",
    },
  };

type IntegrationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function IntegrationsPage({ searchParams }: IntegrationsPageProps) {
  const context = await requireStaff("/admin/integrations");
  const calendarOutcome = CALENDAR_OUTCOMES[firstSearchValue((await searchParams).calendar) ?? ""];
  const now = requestNow();
  if (!hasCapability(context, "hq:admin")) {
    return (
      <>
        <PageHeader eyebrow="Admin" title="Integrations" />
        <Callout tone="neutral">Integrations are managed by HQ admins.</Callout>
      </>
    );
  }

  let keys: ApiKey[] | null = null;
  try {
    keys = (await readApiKeys(context.token)).keys;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const names = await directoryOrNull(context.token);
  let calendar: CalendarStatus | null = null;
  try {
    calendar = (await readCalendarStatus(context.token)).calendar;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  let webhooks: { events: WebhookEvent[]; kept_days: number; limit: number } | null = null;
  try {
    webhooks = await readWebhooks(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const fresh = context.me.sudo_fresh;
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  const live = (keys ?? []).filter((key) => !key.revoked_at);

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Integrations"
        description="The doors into HQ from outside, and the keys that open them."
        actions={<AdminTabs current="/admin/integrations" />}
      />
      {calendarOutcome && (
        <Callout tone={calendarOutcome.tone} role="status">
          {calendarOutcome.text}
        </Callout>
      )}
      <SudoGate
        action={confirmSudoAction}
        fresh={fresh}
        untilLabel={untilLabel}
        returnPath="/admin/integrations"
        purpose="Keys and the calendar connection need a fresh code from your authenticator app."
      />
      <div className="record-layout">
        <div className="record-layout__main">
          <Card
            title="Website intake keys"
            titleAs="h2"
            description="The early-access and contact forms post leads with one of these. A key can only create leads; revoking one stops it at once."
          >
            {keys === null ? (
              <Callout tone="danger" compact>
                Keys could not be read just now. This is a read failure, not an empty list.
              </Callout>
            ) : (
              <DataTable
                caption="Intake keys"
                columns={KEY_COLUMNS}
                scroll={false}
                isEmpty={keys.length === 0}
                empty={
                  <EmptyState
                    title="No keys yet"
                    description="Mint one for the website so its forms land as leads here."
                    compact
                  />
                }
              >
                {keys.map((key) => (
                  <tr key={key.key_id} className={key.revoked_at ? "row--muted" : undefined}>
                    <td>
                      <span className="table-title">{key.name}</span>
                      <span className="table-sub mono">qthq_{key.prefix}_…</span>
                    </td>
                    <td className="mono">{key.scopes.join(", ") || "—"}</td>
                    <td>
                      <Timestamp
                        value={key.last_used_at}
                        now={now}
                        mode="relative"
                        fallback="Never"
                      />
                    </td>
                    <td>
                      <Timestamp value={key.created_at} mode="date" />
                      <span className="table-sub">{nameFor(names, key.created_by)}</span>
                    </td>
                    <td>
                      {key.revoked_at ? (
                        <StatusPill value="revoked" label="Revoked" />
                      ) : (
                        <StatusPill value="active" label="Live" />
                      )}
                    </td>
                    <td>
                      {key.revoked_at ? (
                        <span className="table-sub">
                          <Timestamp value={key.revoked_at} mode="date" />
                        </span>
                      ) : (
                        <RevokeKeyForm
                          action={revokeKeyAction}
                          keyId={key.key_id}
                          keyName={key.name}
                          disabled={!fresh}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Card>
          <Card
            title="Calendar"
            titleAs="h2"
            description="Booked demos and calls become meetings, with guests matched to people on file. Only meetings with someone outside the team are brought in."
          >
            {calendar === null ? (
              <Callout tone="danger" compact>
                The calendar&apos;s state could not be read just now.
              </Callout>
            ) : !calendar.configured ? (
              <p className="side-quiet">
                Not set up on the service yet. Once its calendar client is in place, it can be
                connected here.
              </p>
            ) : !calendar.connected ? (
              <div className="integration-row">
                <p className="side-quiet">Not connected.</p>
                <CalendarConnectForm action={connectCalendarAction} disabled={!fresh} />
              </div>
            ) : (
              <>
                <KeyValue columns={2}>
                  <KeyValueRow label="Account" mono>
                    {calendar.account_email || "—"}
                  </KeyValueRow>
                  <KeyValueRow label="Last synced">
                    <Timestamp
                      value={calendar.last_synced_at}
                      now={now}
                      mode="relative"
                      fallback="Not yet"
                    />
                  </KeyValueRow>
                  <KeyValueRow label="Changes">
                    {calendar.push_active
                      ? `Arrive within seconds · renews by ${formatDate(calendar.channel_expires_at)}`
                      : calendar.push_configured
                        ? "Checked every 15 minutes (live updates are reconnecting)"
                        : "Checked every 15 minutes"}
                  </KeyValueRow>
                  <KeyValueRow label="Connected">
                    <Timestamp value={calendar.connected_at} mode="date" />
                  </KeyValueRow>
                </KeyValue>
                {calendar.last_error && (
                  <Callout tone="danger" compact className="integration-error">
                    Last attempt failed: {calendar.last_error}
                  </Callout>
                )}
                <div className="integration-actions">
                  <CalendarSyncForm action={syncCalendarAction} />
                  <CalendarConnectForm action={connectCalendarAction} disabled={!fresh} reconnect />
                </div>
                <details className="integration-danger">
                  <summary>Disconnect</summary>
                  <CalendarDisconnectForm action={disconnectCalendarAction} disabled={!fresh} />
                </details>
              </>
            )}
          </Card>
          <Card
            title="Notifications received"
            titleAs="h2"
            description={`Each push from an outside service, recorded once: a repeat delivery is counted, not acted on again. The newest ${webhooks?.limit ?? 50}; the log itself keeps ${webhooks?.kept_days ?? 30} days.`}
          >
            {webhooks === null ? (
              <Callout tone="danger" compact>
                The notification log could not be read just now. This is a read failure, not an
                empty log.
              </Callout>
            ) : (
              <DataTable
                caption="Notifications received"
                columns={WEBHOOK_COLUMNS}
                scroll={false}
                isEmpty={webhooks.events.length === 0}
                empty={
                  <EmptyState
                    title="Nothing received yet"
                    description="Once the calendar is connected, each change it announces is listed here."
                    compact
                  />
                }
              >
                {webhooks.events.map((event) => (
                  <tr key={`${event.provider}:${event.event_id}`}>
                    <td>
                      <Timestamp value={event.received_at} now={now} mode="relative" />
                    </td>
                    <td>{PROVIDER_LABELS[event.provider] ?? event.provider}</td>
                    <td>
                      {event.outcome.startsWith("sync failed") ? (
                        <>
                          <StatusPill value="failed" label="Failed" tone="danger" />
                          <span className="table-sub">{outcomeText(event)}</span>
                        </>
                      ) : (
                        outcomeText(event)
                      )}
                    </td>
                    <td>{event.duplicates > 0 ? event.duplicates : "—"}</td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Card>
        </div>
        <aside className="record-layout__side">
          <Card
            title="Mint an intake key"
            titleAs="h3"
            description={
              live.length > 0
                ? `${live.length} live ${live.length === 1 ? "key" : "keys"}. Mint a new one before revoking the old, so the form never goes dark.`
                : "The website needs one before its forms can post here."
            }
          >
            <MintKeyForm action={mintKeyAction} disabled={!fresh} />
          </Card>
        </aside>
      </div>
    </>
  );
}
