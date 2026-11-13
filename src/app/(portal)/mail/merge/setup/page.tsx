import Link from "next/link";

import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import {
  addStopsAction,
  checkProviderAction,
  removeProviderKeyAction,
  removeStopAction,
  saveMergeSettingsAction,
  saveProviderKeyAction,
  syncStopsAction,
} from "@/app/(portal)/mail/merge/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
import { MailForm } from "@/components/mail/mail-form";
import { MailTabs } from "@/components/mail/mail-tabs";
import { SenderDown } from "@/components/mail/merge";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import { Pagination } from "@/components/ui/pagination";
import { Popover } from "@/components/ui/popover";
import { RecordSection } from "@/components/ui/record-shell";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { formatAbsolute, formatNumber } from "@/lib/format";
import { MERGE_ROLE_LINE, requireMerge } from "@/lib/merge/access";
import {
  MergeRequestError,
  MergeUnavailableError,
  readMergeStatus,
  readMergeStops,
  type MergeStatus,
  type MergeStop,
  type MergeStops,
} from "@/lib/merge/api";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Mail merge setup" };
export const dynamic = "force-dynamic";

const STOP_COLUMNS = [
  { key: "email", label: "Address" },
  { key: "why", label: "Why" },
  { key: "when", label: "Since" },
  { key: "act", label: "Actions" },
];

const STOP_REASONS: Record<MergeStop["reason"], string> = {
  manual: "Added by hand",
  asked: "Asked to stop",
  bounced: "Bounced",
  blocked: "Refused by the provider",
};

function SenderAnswer({ status }: { status: MergeStatus }) {
  const sender = status.provider.sender;
  const address = status.settings.from_email;
  if (!status.provider.key_set || !address) return null;
  if (!sender || sender.status !== "ok")
    return <StatusPill value="unknown" label="Not checked yet" tone="neutral" />;
  if (status.provider.sender_verified)
    return <StatusPill value="verified" label="Verified" tone="live" />;
  return (
    <StatusPill
      value="unverified"
      label={
        !sender.sender_known || !sender.sender_active
          ? "Address not confirmed there"
          : "Domain not authenticated"
      }
      tone="danger"
    />
  );
}

/**
 * The provider's key, who the mail is from, how fast it goes, and who is never written to.
 * The key is handed to the sender on this computer and is not shown again.
 */
export default async function MailMergeSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ offset?: string }>;
}) {
  const { context, allowed } = await requireMerge("/mail/merge/setup");
  const now = requestNow();
  const offset = Math.max(0, Number.parseInt((await searchParams).offset ?? "0", 10) || 0);
  let status: MergeStatus | null = null;
  let stops: MergeStops | null = null;
  if (allowed) {
    try {
      [status, stops] = await Promise.all([readMergeStatus(), readMergeStops(offset)]);
    } catch (error) {
      if (!(error instanceof MergeUnavailableError || error instanceof MergeRequestError))
        throw error;
      status = null;
    }
  }
  const fresh = context.me.sudo_fresh;
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  const provider = status?.provider;
  const account = provider?.account ?? null;
  return (
    <>
      <PageHeader
        eyebrow="Mail merge"
        title="Setup"
        actions={
          <>
            <Link className="btn btn--small" href="/mail/merge">
              Back to Mail merge
            </Link>
            <MailTabs current="/mail/merge" />
          </>
        }
      />
      <div className="page-content">
        {!allowed ? (
          <Callout tone="neutral">{MERGE_ROLE_LINE}</Callout>
        ) : !status || !provider || !stops ? (
          <SenderDown />
        ) : (
          <>
            <SudoGate
              action={confirmSudoAction}
              fresh={fresh}
              untilLabel={untilLabel}
              returnPath="/mail/merge/setup"
              purpose="Adding or removing the provider key needs a fresh code from your authenticator app."
            />
            <Card
              title="The provider's key"
              titleAs="h2"
              description="Make one in the provider's account, under SMTP & API, on the API keys tab. It is checked with the provider, kept on this computer in a file only your account can read, and never shown again."
            >
              {provider.key_set ? (
                <KeyValue>
                  <KeyValueRow label="Key">
                    <span className="mono">Ends in {provider.key_hint}</span>
                  </KeyValueRow>
                  {account?.status === "ok" ? (
                    <>
                      <KeyValueRow label="Account">
                        {account.company || account.email || "Connected"}
                      </KeyValueRow>
                      {account.plan && (
                        <KeyValueRow label="Plan">
                          {account.plan}
                          {account.credits !== null
                            ? `, ${formatNumber(account.credits)} sends left`
                            : ""}
                        </KeyValueRow>
                      )}
                    </>
                  ) : (
                    <KeyValueRow label="Answer">
                      <StatusPill
                        value="refused"
                        label={
                          account?.status === "auth_failed"
                            ? "The provider refuses this key"
                            : "Could not be checked"
                        }
                        tone="danger"
                      />
                    </KeyValueRow>
                  )}
                  <KeyValueRow label="Checked">
                    <Timestamp value={provider.checked_at} now={now} mode="relative" />
                  </KeyValueRow>
                </KeyValue>
              ) : (
                <Callout tone="neutral" compact>
                  No key yet. Everything else works without one: every send is practice.
                </Callout>
              )}
              <MailForm
                action={saveProviderKeyAction}
                submitLabel={provider.key_set ? "Replace the key" : "Check and save the key"}
                pendingLabel="Checking with the provider…"
                variant="primary"
                disabled={!fresh}
              >
                <Field id="merge-key" label={provider.key_set ? "A new key" : "The key"}>
                  <Input
                    id="merge-key"
                    name="provider_key"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={300}
                    required
                    disabled={!fresh}
                  />
                </Field>
              </MailForm>
              {provider.key_set && (
                <div className="inline-actions">
                  <MailForm
                    action={checkProviderAction}
                    submitLabel="Check again"
                    pendingLabel="Checking…"
                    className="inline-form"
                  />
                  <MailForm
                    action={removeProviderKeyAction}
                    submitLabel="Remove the key"
                    variant="danger"
                    className="inline-form"
                    disabled={!fresh}
                  />
                </div>
              )}
            </Card>

            <Card
              title="Who it is from, and how fast"
              titleAs="h2"
              description="The address has to be one the provider has confirmed, on a domain authenticated there, or mail is refused or lands in spam."
            >
              <MailForm action={saveMergeSettingsAction} submitLabel="Save">
                <div className="form-grid">
                  <Field id="merge-from-name" label="From name" hint="What the inbox shows.">
                    <Input
                      id="merge-from-name"
                      name="from_name"
                      maxLength={80}
                      defaultValue={status.settings.from_name}
                    />
                  </Field>
                  <Field
                    id="merge-from-email"
                    label="From address"
                    note={<SenderAnswer status={status} />}
                  >
                    <Input
                      id="merge-from-email"
                      name="from_email"
                      type="email"
                      maxLength={254}
                      defaultValue={status.settings.from_email}
                    />
                  </Field>
                  <Field
                    id="merge-reply-to"
                    label="Replies go to"
                    hint="Optional: the From address otherwise. Replies come to that mailbox, not here."
                  >
                    <Input
                      id="merge-reply-to"
                      name="reply_to"
                      type="email"
                      maxLength={254}
                      defaultValue={status.settings.reply_to}
                    />
                  </Field>
                  <Field
                    id="merge-pace"
                    label="A minute"
                    hint="Messages each minute, at most 60. Slower looks more like a person."
                  >
                    <Input
                      id="merge-pace"
                      name="per_minute"
                      inputMode="numeric"
                      defaultValue={status.settings.per_minute}
                    />
                  </Field>
                  <Field
                    id="merge-cap"
                    label="A day"
                    hint="A send stops at this and waits for you to resume the next day. A new sending domain should start low."
                  >
                    <Input
                      id="merge-cap"
                      name="daily_cap"
                      inputMode="numeric"
                      defaultValue={status.settings.daily_cap}
                    />
                  </Field>
                </div>
                <Field
                  id="merge-footer"
                  label="Under every message"
                  hint="Who you are and how to stop hearing from you. Columns work here too."
                >
                  <Textarea
                    id="merge-footer"
                    name="footer"
                    rows={3}
                    maxLength={1000}
                    defaultValue={status.settings.footer}
                  />
                </Field>
              </MailForm>
            </Card>

            <RecordSection
              id="merge-stops"
              title={`Stop list (${formatNumber(stops.total)})`}
              actions={
                <>
                  {provider.key_set && (
                    <MailForm
                      action={syncStopsAction}
                      submitLabel="Bring in the provider's"
                      pendingLabel="Asking…"
                      className="inline-form"
                    />
                  )}
                  <Popover label="Add addresses" width="wide" align="end">
                    <MailForm action={addStopsAction} submitLabel="Add to the stop list">
                      <Field
                        id="merge-stop-emails"
                        label="Addresses"
                        hint="Any number, separated by spaces, commas or new lines."
                      >
                        <Textarea id="merge-stop-emails" name="emails" rows={4} required />
                      </Field>
                      <Field id="merge-stop-reason" label="Why">
                        <Select id="merge-stop-reason" name="reason" defaultValue="asked">
                          <option value="asked">They asked to stop</option>
                          <option value="manual">Do not write to them</option>
                        </Select>
                      </Field>
                    </MailForm>
                  </Popover>
                </>
              }
            >
              <DataTable
                caption="Stop list"
                columns={STOP_COLUMNS}
                isEmpty={stops.stops.length === 0}
                empty={
                  <EmptyState
                    compact
                    title="Nobody on the stop list"
                    description="When someone replies asking to stop, add them here: they are never written to again, from any list."
                  />
                }
              >
                {stops.stops.map((stop) => (
                  <tr key={stop.email}>
                    <td className="mono">{stop.email}</td>
                    <td>{STOP_REASONS[stop.reason]}</td>
                    <td>
                      <Timestamp value={stop.at} now={now} mode="relative" />
                    </td>
                    <td>
                      <RowAction
                        action={removeStopAction}
                        fields={{ email: stop.email }}
                        buttons={[
                          {
                            label: "Take off",
                            className: "btn btn--small btn--ghost",
                            ariaLabel: `Take ${stop.email} off the stop list`,
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </DataTable>
              {stops.total > stops.limit && (
                <Pagination
                  offset={stops.offset}
                  limit={stops.limit}
                  returned={stops.stops.length}
                  hasMore={stops.offset + stops.limit < stops.total}
                  nextOffset={stops.offset + stops.limit}
                  buildHref={(next) => `/mail/merge/setup?offset=${next}`}
                  noun="addresses"
                />
              )}
            </RecordSection>
          </>
        )}
      </div>
    </>
  );
}
