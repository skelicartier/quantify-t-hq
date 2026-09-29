import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import {
  rotateWebhookAction,
  runWorkerAction,
  saveMailSettingsAction,
  saveSenderAction,
} from "@/app/(portal)/mail/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
import { MailForm } from "@/components/mail/mail-form";
import { MailTabs } from "@/components/mail/mail-tabs";
import { BreakableUrl } from "@/components/mail/pills";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import { Popover } from "@/components/ui/popover";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readMailSettings, readSenders, type MailSender, type MailSettings } from "@/lib/api/mail";
import { directoryOrNull } from "@/lib/api/staff";
import { formatAbsolute } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Mail settings" };
export const dynamic = "force-dynamic";

const SENDER_COLUMNS = [
  { key: "from", label: "Sends as" },
  { key: "kind", label: "For" },
  { key: "cap", label: "A day", align: "end" as const },
  { key: "state", label: "State" },
  { key: "edit", label: "" },
];

function SenderFields({
  sender,
  staff,
}: {
  sender?: MailSender;
  staff: { id: string; name: string }[];
}) {
  const prefix = sender?.sender_id ?? "new";
  return (
    <>
      <Field id={`sender-email-${prefix}`} label="Address">
        <Input
          id={`sender-email-${prefix}`}
          name="from_email"
          type="email"
          defaultValue={sender?.from_email ?? ""}
          maxLength={254}
          required
        />
      </Field>
      <Field id={`sender-name-${prefix}`} label="Name shown">
        <Input
          id={`sender-name-${prefix}`}
          name="from_name"
          defaultValue={sender?.from_name ?? "Quantify Terminal"}
          maxLength={120}
        />
      </Field>
      <Field
        id={`sender-reply-${prefix}`}
        label="Replies go to"
        hint="Leave empty to use the address itself."
      >
        <Input
          id={`sender-reply-${prefix}`}
          name="reply_to"
          type="email"
          defaultValue={sender?.reply_to ?? ""}
          maxLength={254}
        />
      </Field>
      <div className="form-row">
        <Field id={`sender-kind-${prefix}`} label="For">
          <Select
            id={`sender-kind-${prefix}`}
            name="kind"
            defaultValue={sender?.kind ?? "marketing"}
          >
            <option value="marketing">Campaigns</option>
            <option value="sales">One person&rsquo;s sequences</option>
          </Select>
        </Field>
        <Field id={`sender-cap-${prefix}`} label="Daily cap">
          <Input
            id={`sender-cap-${prefix}`}
            name="daily_cap"
            type="number"
            min={1}
            max={10000}
            defaultValue={sender?.daily_cap ?? 50}
          />
        </Field>
      </div>
      <Field id={`sender-staff-${prefix}`} label="Person (sequences only)">
        <Select id={`sender-staff-${prefix}`} name="staff_id" defaultValue={sender?.staff_id ?? ""}>
          <option value="">—</option>
          {staff.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </Select>
      </Field>
      <Checkbox
        id={`sender-verified-${prefix}`}
        name="verified"
        label="Verified with the provider"
        description="Tick only once the provider shows the address or its domain as authenticated (SPF, DKIM)."
        defaultChecked={sender?.verified ?? false}
      />
      <Checkbox
        id={`sender-active-${prefix}`}
        name="active"
        label="In use"
        defaultChecked={sender?.active ?? true}
      />
    </>
  );
}

export default async function MailSettingsPage() {
  const context = await requireStaff("/mail/settings");
  const now = requestNow();
  const isAdmin = hasCapability(context, "hq:admin");
  if (!isAdmin) {
    return (
      <>
        <PageHeader
          eyebrow="Mail"
          title="Settings"
          actions={<MailTabs current="/mail/settings" />}
        />
        <div className="page-content">
          <Callout tone="neutral">Mail settings are changed by HQ owners and admins.</Callout>
        </div>
      </>
    );
  }
  let settings: MailSettings | null = null;
  let senders: MailSender[] = [];
  try {
    settings = await readMailSettings(context.token);
    senders = (await readSenders(context.token)).senders;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const names = await directoryOrNull(context.token);
  const staff = [...(names ?? new Map()).values()]
    .filter((entry) => entry.is_active)
    .map((entry) => ({ id: entry.staff_id, name: entry.display_name }));
  const fresh = context.me.sudo_fresh;
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  const locked = !fresh;

  return (
    <>
      <PageHeader
        eyebrow="Mail"
        title="Settings"
        description="Who mail comes from, how much may leave in a day, when it may arrive, and the footer every message carries."
        actions={<MailTabs current="/mail/settings" />}
      />
      {settings === null ? (
        <div className="page-content">
          <Callout tone="danger" role="alert">
            Mail settings could not be read just now.
          </Callout>
        </div>
      ) : (
        <div className="page-content">
          <SudoGate
            action={confirmSudoAction}
            fresh={fresh}
            untilLabel={untilLabel}
            returnPath="/mail/settings"
            purpose="Changing mail settings needs a fresh code from your authenticator app."
          />
          {!settings.provider_configured && (
            <Callout tone="attention" title="No provider key on the service">
              The service has no mail provider key, so nothing can leave. The key is set on the
              service by whoever runs it, not here.
            </Callout>
          )}
          <div className="record-layout">
            <div className="record-layout__main">
              <Card
                title="Sending"
                titleAs="h3"
                description={
                  settings.sending_enabled
                    ? "On. Campaigns and sequences go out as the queue reaches them."
                    : `Off${settings.paused_reason ? `: ${settings.paused_reason}` : ""}. Nothing leaves.`
                }
              >
                <KeyValue>
                  <KeyValueRow label="State">
                    <StatusPill
                      value={settings.sending_enabled ? "on" : "off"}
                      label={settings.sending_enabled ? "On" : "Off"}
                    />
                  </KeyValueRow>
                  <KeyValueRow label="Queue last ran">
                    <Timestamp
                      value={settings.last_worker_at}
                      now={now}
                      mode="relative"
                      fallback="never"
                    />
                  </KeyValueRow>
                  {settings.provider_backoff_until && (
                    <KeyValueRow label="Backing off until">
                      <Timestamp value={settings.provider_backoff_until} now={now} mode="both" />
                    </KeyValueRow>
                  )}
                </KeyValue>
                <div className="form-actions">
                  <MailForm
                    action={saveMailSettingsAction}
                    fields={{ sending_enabled: settings.sending_enabled ? "0" : "1" }}
                    submitLabel={
                      settings.sending_enabled ? "Stop all sending" : "Switch sending on"
                    }
                    variant={settings.sending_enabled ? "danger" : "primary"}
                    disabled={locked}
                    className="inline-form"
                  />
                  <MailForm
                    action={runWorkerAction}
                    submitLabel="Run the queue now"
                    className="inline-form"
                  />
                </div>
              </Card>

              <Card
                title="Limits and hours"
                titleAs="h3"
                description="A new sending domain starts small: leave the daily cap at 100 for two weeks, then raise it by half each week while bounces stay under 2%."
              >
                <MailForm
                  action={saveMailSettingsAction}
                  submitLabel="Save limits"
                  disabled={locked}
                  className="form-grid"
                >
                  <Field id="mail-daily" label="A day, all mail">
                    <Input
                      id="mail-daily"
                      name="global_daily_cap"
                      type="number"
                      min={0}
                      max={100000}
                      defaultValue={settings.global_daily_cap}
                    />
                  </Field>
                  <Field id="mail-hourly" label="An hour">
                    <Input
                      id="mail-hourly"
                      name="hourly_cap"
                      type="number"
                      min={1}
                      max={10000}
                      defaultValue={settings.hourly_cap}
                    />
                  </Field>
                  <Field
                    id="mail-frequency"
                    label="Marketing per person a week"
                    hint="0 turns the cap off."
                  >
                    <Input
                      id="mail-frequency"
                      name="frequency_cap_per_week"
                      type="number"
                      min={0}
                      max={50}
                      defaultValue={settings.frequency_cap_per_week}
                    />
                  </Field>
                  <Field
                    id="mail-approval"
                    label="A second approval from"
                    hint="Recipients; any customer needs one regardless."
                  >
                    <Input
                      id="mail-approval"
                      name="approval_threshold"
                      type="number"
                      min={0}
                      max={1000000}
                      defaultValue={settings.approval_threshold}
                    />
                  </Field>
                  <Field id="mail-bounce" label="Pause a campaign at hard bounces (%)">
                    <Input
                      id="mail-bounce"
                      name="bounce_pause_pct"
                      defaultValue={String(settings.bounce_pause_pct)}
                      inputMode="decimal"
                    />
                  </Field>
                  <Field id="mail-complaint" label="Pause at spam complaints (%)">
                    <Input
                      id="mail-complaint"
                      name="complaint_pause_pct"
                      defaultValue={String(settings.complaint_pause_pct)}
                      inputMode="decimal"
                    />
                  </Field>
                  <Field id="mail-start" label="Working hours start">
                    <Input
                      id="mail-start"
                      name="window_start"
                      type="time"
                      defaultValue={settings.window_start}
                    />
                  </Field>
                  <Field id="mail-end" label="Working hours end">
                    <Input
                      id="mail-end"
                      name="window_end"
                      type="time"
                      defaultValue={settings.window_end}
                    />
                  </Field>
                  <Field
                    id="mail-zone"
                    label="Time zone when nothing else is known"
                    className="form-grid__span"
                  >
                    <Input
                      id="mail-zone"
                      name="fallback_timezone"
                      defaultValue={settings.fallback_timezone}
                      maxLength={64}
                    />
                  </Field>
                </MailForm>
              </Card>

              <Card
                title="Footer and seed inboxes"
                titleAs="h3"
                description="The postal address goes under every message; US and UK rules require it. Seed inboxes get every campaign first and are never counted."
              >
                <MailForm action={saveMailSettingsAction} submitLabel="Save" disabled={locked}>
                  <Field id="mail-address" label="Postal address">
                    <Textarea
                      id="mail-address"
                      name="postal_address"
                      defaultValue={settings.postal_address}
                      rows={2}
                      maxLength={400}
                    />
                  </Field>
                  <Field
                    id="mail-seeds"
                    label="Seed inboxes"
                    hint="Up to five, separated by commas."
                  >
                    <Input
                      id="mail-seeds"
                      name="seed_addresses"
                      defaultValue={settings.seed_addresses.join(", ")}
                      maxLength={1200}
                    />
                  </Field>
                </MailForm>
              </Card>

              <DataTable
                caption="Senders"
                columns={SENDER_COLUMNS}
                isEmpty={senders.length === 0}
                empty={
                  <EmptyState
                    compact
                    title="No senders yet"
                    description="Add the campaign address and one sales identity per person who runs sequences."
                  />
                }
              >
                {senders.map((sender) => (
                  <tr key={sender.sender_id}>
                    <td>
                      <span className="table-title">{sender.from_name || sender.from_email}</span>
                      <span className="table-sub mono">{sender.from_email}</span>
                    </td>
                    <td>
                      {sender.kind === "sales"
                        ? `Sequences · ${sender.staff_name || "—"}`
                        : "Campaigns"}
                    </td>
                    <td className="data-table__num">{sender.daily_cap}</td>
                    <td>
                      <StatusPill
                        value={sender.verified ? "verified" : "unverified"}
                        label={sender.verified ? "Verified" : "Not verified"}
                      />
                      {!sender.active && <span className="table-sub">Not in use</span>}
                    </td>
                    <td>
                      <Popover label="Edit" align="end" width="wide">
                        <MailForm
                          action={saveSenderAction}
                          fields={{ sender_id: sender.sender_id }}
                          submitLabel="Save sender"
                          disabled={locked}
                        >
                          <SenderFields sender={sender} staff={staff} />
                        </MailForm>
                      </Popover>
                    </td>
                  </tr>
                ))}
              </DataTable>
            </div>
            <aside className="record-layout__side">
              <Card title="Add a sender" titleAs="h3">
                <MailForm action={saveSenderAction} submitLabel="Add sender" disabled={locked}>
                  <SenderFields staff={staff} />
                </MailForm>
              </Card>
              <Card
                title="Delivery events"
                titleAs="h3"
                description={
                  settings.webhook_configured
                    ? "Wired. Bounces, complaints and unsubscribes arrive as they happen."
                    : "Not wired. Without it, bounces and complaints are caught only by the nightly check against the provider's own list."
                }
              >
                <p className="setting-state">
                  <StatusPill
                    value={settings.webhook_configured ? "configured" : "not-configured"}
                    label={settings.webhook_configured ? "Wired" : "Not wired"}
                  />
                </p>
                <MailForm
                  action={rotateWebhookAction}
                  submitLabel={
                    settings.webhook_configured ? "Issue a new address" : "Create the address"
                  }
                  disabled={locked}
                  secretHint="In the provider: Transactional → Settings → Webhook, for sent, delivered, soft and hard bounce, invalid, blocked, spam, unsubscribed, click and error. The old address keeps working for a day."
                />
                <p className="url-shape">
                  <BreakableUrl value={settings.webhook_url_shape} />
                </p>
              </Card>
              <Card
                title="Unsubscribe links"
                titleAs="h3"
                description="Every message carries a one-click unsubscribe header and a footer link to this page shape; the stop takes effect the moment it is pressed."
              >
                <p className="url-shape">
                  <BreakableUrl value={settings.unsubscribe_url_shape} />
                </p>
              </Card>
            </aside>
          </div>
        </div>
      )}
    </>
  );
}
