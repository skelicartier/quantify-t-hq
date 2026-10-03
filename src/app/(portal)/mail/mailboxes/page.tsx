import Link from "next/link";

import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import {
  addMailboxAction,
  checkMailboxAction,
  connectMailboxAction,
  disconnectMailboxAction,
  mailboxSettingsAction,
  mailboxStateAction,
  readyMailboxAction,
  updateMailboxAction,
} from "@/app/(portal)/mail/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
import { MailForm } from "@/components/mail/mail-form";
import { MailTabs } from "@/components/mail/mail-tabs";
import { AddMailboxForm, MailboxPaceForm } from "@/components/mail/mailbox-forms";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import { RecordSection } from "@/components/ui/record-shell";
import { RowAction } from "@/components/ui/row-action";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readMailboxes, type Mailbox, type MailboxBoard } from "@/lib/api/mail";
import { formatAbsolute, formatDate, formatNumber } from "@/lib/format";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Mailboxes" };
export const dynamic = "force-dynamic";

const BASE = "/mail/mailboxes";

const PHASE_TONES: Record<string, PillTone> = {
  active: "live",
  warming: "attention",
  paused: "neutral",
  resting: "danger",
  disconnected: "danger",
};

/** What the consent screen's return means, keyed by `?connected=`. */
const OUTCOMES: Record<string, { tone: "success" | "danger"; text: string }> = {
  connected: {
    tone: "success",
    text: "Connected. It waits out its warm-up, then climbs to its cap a little each day.",
  },
  denied: { tone: "danger", text: "The consent screen was closed or declined. Nothing changed." },
  scope: {
    tone: "danger",
    text: "Sending mail was unticked on the consent screen, so nothing was kept. Connect again and leave it ticked.",
  },
  expired: { tone: "danger", text: "That sign-in took too long or began elsewhere. Start again." },
  address: {
    tone: "danger",
    text: "That address is already a sender under Settings, or a colleague connected it.",
  },
  configured: {
    tone: "danger",
    text: "This way of connecting is not set up on the service yet. Add the mailbox by its server and an app password instead.",
  },
  failed: {
    tone: "danger",
    text: "The mailbox could not be connected just now. Nothing was kept.",
  },
  forbidden: { tone: "danger", text: "Your role reads mail without connecting a mailbox." },
};

function sentence(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function signsIn(mailbox: Mailbox): string {
  return mailbox.provider === "smtp"
    ? `app password at ${mailbox.smtp_host}`
    : "its host's own sign-in";
}

function climb(mailbox: Mailbox): string {
  if (mailbox.phase !== "active") return "";
  return mailbox.cap_today >= mailbox.daily_cap
    ? "at its cap"
    : `day ${formatNumber(mailbox.ramp_day)} of the climb`;
}

type MailboxesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MailboxesPage({ searchParams }: MailboxesPageProps) {
  const context = await requireStaff(BASE);
  const parameters = await searchParams;
  const outcome = OUTCOMES[firstSearchValue(parameters.connected) ?? ""];
  const adding = (firstSearchValue(parameters.add) ?? "").slice(0, 254);
  const addSmtp = (firstSearchValue(parameters.smtp) ?? "").slice(0, 253);
  const addImap = (firstSearchValue(parameters.imap) ?? "").slice(0, 253);
  const addPort = firstSearchValue(parameters.port) === "587" ? 587 : 465;
  const changing = firstSearchValue(parameters.mailbox) ?? "";
  const now = requestNow();
  let board: MailboxBoard | null = null;
  try {
    board = await readMailboxes(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const canWrite = hasCapability(context, "crm:write");
  const fresh = context.me.sudo_fresh;
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  const mayChange = (mailbox: Mailbox) =>
    canWrite && board !== null && (mailbox.owner?.staff_id === board.me || board.may_manage);
  const chosen = board?.mailboxes.find(
    (mailbox) => mailbox.mailbox_id === changing && mayChange(mailbox),
  );
  const consentReady = (board?.providers ?? []).some(
    (provider) => provider.key !== "smtp" && provider.configured,
  );

  return (
    <>
      <PageHeader
        eyebrow="Mail"
        title="Mailboxes"
        description="A first email to someone the team found goes from a person's own mailbox, at a person's pace: a few dozen a day, minutes apart, after a warm-up. The shared mail provider carries campaigns to people who asked for them, never a first email to a prospect."
        actions={<MailTabs current={BASE} />}
      />
      <div className="page-content">
        {outcome && (
          <Callout tone={outcome.tone} role={outcome.tone === "danger" ? "alert" : "status"}>
            {outcome.text}
          </Callout>
        )}
        {board === null ? (
          <Callout tone="danger" role="alert">
            The mailboxes could not be read just now. This is a read failure, not an empty pool.
          </Callout>
        ) : (
          <>
            <StatGrid columns={6} label="The pool today">
              <Stat label="Mailboxes" value={formatNumber(board.totals.mailboxes)} />
              <Stat label="Sending" value={formatNumber(board.totals.sending)} />
              <Stat label="Warming up" value={formatNumber(board.totals.warming)} />
              <Stat
                label="Held"
                value={formatNumber(board.totals.held)}
                hint="paused, resting or off"
                tone={board.totals.held > 0 ? "danger" : "default"}
              />
              <Stat
                label="Room today"
                value={formatNumber(board.totals.capacity_today)}
                hint={`the pool's ceiling is ${formatNumber(board.settings.pool_daily_cap)}`}
              />
              <Stat label="Sent today" value={formatNumber(board.totals.sent_today)} />
            </StatGrid>
            <div className="record-layout">
              <div className="record-layout__main">
                <DataTable
                  caption="Connected mailboxes"
                  columns={[
                    { key: "mailbox", label: "Mailbox" },
                    { key: "state", label: "State" },
                    { key: "today", label: "Today", align: "end" as const },
                    { key: "pace", label: "Pace" },
                    { key: "activity", label: "Activity" },
                    { key: "actions", label: "Actions" },
                  ]}
                  scroll={false}
                  isEmpty={board.mailboxes.length === 0}
                  empty={
                    <EmptyState
                      title="No mailbox connected yet"
                      description="Until one is, no prospect is written to at all. Connect your own mailbox: it carries your name, sends your prospects' sequences and keeps their replies in your inbox."
                    />
                  }
                >
                  {board.mailboxes.map((mailbox) => (
                    <tr
                      key={mailbox.mailbox_id}
                      className={mailbox.phase === "disconnected" ? "row--muted" : undefined}
                    >
                      <td>
                        <span className="table-title mono">{mailbox.address}</span>
                        <span className="table-sub">
                          {mailbox.display_name}
                          {mailbox.owner?.name && mailbox.owner.name !== mailbox.display_name
                            ? ` · ${mailbox.owner.name}'s mailbox`
                            : ""}
                        </span>
                        <span className="table-sub">Signs in by {signsIn(mailbox)}</span>
                      </td>
                      <td>
                        <StatusPill
                          value={mailbox.phase}
                          label={mailbox.phase_label}
                          tone={PHASE_TONES[mailbox.phase] ?? "neutral"}
                        />
                        {mailbox.phase === "warming" && mailbox.ready_on && (
                          <span className="table-sub">
                            Sends from {formatDate(mailbox.ready_on)}
                          </span>
                        )}
                        {mailbox.phase === "resting" && (
                          <span className="table-sub">
                            <Timestamp
                              value={mailbox.rest_until}
                              now={now}
                              mode="relative"
                              prefix="Until"
                            />
                            {mailbox.rest_reason ? `: ${mailbox.rest_reason}` : ""}
                          </span>
                        )}
                        {mailbox.phase === "disconnected" && (
                          <span className="table-sub">
                            Its sign-in was wiped. Connect it again to send.
                          </span>
                        )}
                        {mailbox.phase === "paused" && mailbox.last_error && (
                          <span className="table-sub">{sentence(mailbox.last_error)}</span>
                        )}
                        {(mailbox.phase === "active" || mailbox.phase === "warming") &&
                          !mailbox.last_check_ok &&
                          mailbox.last_error && (
                            <span className="table-sub">Last check: {mailbox.last_error}</span>
                          )}
                      </td>
                      <td className="data-table__num">
                        {mailbox.phase === "active"
                          ? `${formatNumber(mailbox.sent_today)} of ${formatNumber(mailbox.cap_today)}`
                          : `${formatNumber(mailbox.sent_today)} sent`}
                        {climb(mailbox) && <span className="table-sub">{climb(mailbox)}</span>}
                      </td>
                      <td>
                        <span className="nowrap">
                          {mailbox.gap_jitter_minutes > 0
                            ? `${mailbox.gap_minutes}–${mailbox.gap_minutes + mailbox.gap_jitter_minutes} min apart`
                            : `${mailbox.gap_minutes} min apart`}
                        </span>
                        <span className="table-sub">
                          from {mailbox.ramp_from}, +{mailbox.ramp_step} a day, up to{" "}
                          {formatNumber(mailbox.daily_cap)}
                        </span>
                      </td>
                      <td>
                        <Timestamp
                          value={mailbox.last_sent_at}
                          now={now}
                          mode="relative"
                          prefix="Sent"
                          fallback="None sent"
                        />
                        <span className="table-sub">
                          {formatNumber(mailbox.live_enrolments)} in sequences
                        </span>
                      </td>
                      <td>
                        {mayChange(mailbox) && mailbox.phase !== "disconnected" && (
                          <div className="sender-actions">
                            <RowAction
                              action={mailboxStateAction}
                              fields={{
                                mailbox_id: mailbox.mailbox_id,
                                state: mailbox.state === "active" ? "paused" : "active",
                              }}
                              buttons={[
                                {
                                  label: mailbox.state === "active" ? "Pause" : "Resume",
                                  className: "btn btn--small",
                                  ariaLabel: `${mailbox.state === "active" ? "Pause" : "Resume"} ${mailbox.address}`,
                                },
                              ]}
                            />
                            <RowAction
                              action={checkMailboxAction}
                              fields={{ mailbox_id: mailbox.mailbox_id }}
                              buttons={[
                                {
                                  label: "Check",
                                  className: "btn btn--small btn--ghost",
                                  ariaLabel: `Check that ${mailbox.address} signs in`,
                                  pendingLabel: "Checking…",
                                },
                              ]}
                            />
                            <Link
                              className="btn btn--small btn--ghost"
                              href={`${BASE}?mailbox=${encodeURIComponent(mailbox.mailbox_id)}#mailbox-change`}
                              aria-label={`Change ${mailbox.address}`}
                            >
                              Change
                            </Link>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </DataTable>

                {chosen?.phase === "disconnected" && (
                  <RecordSection id="mailbox-change" title={`Change ${chosen.address}`}>
                    <p className="page-note">
                      Disconnected: its sign-in was wiped, and what was queued on it waits.
                      Connecting the same address again picks its threads up where they stopped.{" "}
                      <Link className="text-link" href={BASE}>
                        Close
                      </Link>
                    </p>
                  </RecordSection>
                )}
                {chosen && chosen.phase !== "disconnected" && (
                  <RecordSection id="mailbox-change" title={`Change ${chosen.address}`}>
                    <div className="record-layout">
                      <div className="record-layout__main">
                        <MailboxPaceForm
                          action={updateMailboxAction}
                          mailbox={chosen}
                          maxCap={board.settings.max_daily_cap}
                        />
                      </div>
                      <div className="record-layout__side">
                        {chosen.ready_on && (
                          <Card
                            title="Warm-up"
                            titleAs="h3"
                            description={
                              chosen.phase === "warming"
                                ? `It sends nothing before ${formatDate(chosen.ready_on)}.`
                                : `It has sent since ${formatDate(chosen.ready_on)}, climbing from ${chosen.ramp_from} a day.`
                            }
                          >
                            {board.may_manage && chosen.phase === "warming" && (
                              <MailForm
                                action={readyMailboxAction}
                                fields={{ mailbox_id: chosen.mailbox_id }}
                                submitLabel="Send from today"
                              >
                                <p className="page-note">
                                  For a mailbox in daily use for months: it may send from today,
                                  still climbing from {chosen.ramp_from} a day.
                                </p>
                                <Field id="warm-reason" label="Why it is already warm">
                                  <Input
                                    id="warm-reason"
                                    name="reason"
                                    minLength={4}
                                    maxLength={400}
                                    required
                                  />
                                </Field>
                              </MailForm>
                            )}
                          </Card>
                        )}
                        <Card
                          title="Disconnect"
                          titleAs="h3"
                          danger
                          description="Its sign-in is wiped and what is queued on it waits. Connecting the same address again picks the threads up where they stopped."
                        >
                          <MailForm
                            action={disconnectMailboxAction}
                            fields={{ mailbox_id: chosen.mailbox_id }}
                            submitLabel="Disconnect"
                            variant="danger"
                            disabled={!fresh}
                          >
                            <Field id="disconnect-reason" label="Why it is being disconnected">
                              <Input
                                id="disconnect-reason"
                                name="reason"
                                minLength={4}
                                maxLength={400}
                                required
                              />
                            </Field>
                          </MailForm>
                        </Card>
                      </div>
                    </div>
                    <p className="page-note">
                      <Link className="text-link" href={BASE}>
                        Close
                      </Link>
                    </p>
                  </RecordSection>
                )}

                {board.domains.length > 0 && (
                  <DataTable
                    caption="Sending domains"
                    columns={[
                      { key: "domain", label: "Domain" },
                      { key: "mailboxes", label: "Mailboxes", align: "end" as const },
                      { key: "room", label: "Room today", align: "end" as const },
                      { key: "sent", label: "Sent today", align: "end" as const },
                    ]}
                    columnMenu={false}
                    scroll={false}
                  >
                    {board.domains.map((domain) => (
                      <tr key={domain.domain}>
                        <td className="mono">{domain.domain}</td>
                        <td className="data-table__num">{formatNumber(domain.mailboxes)}</td>
                        <td className="data-table__num">{formatNumber(domain.cap_today)}</td>
                        <td className="data-table__num">
                          {formatNumber(domain.sent_today_counted)}
                        </td>
                      </tr>
                    ))}
                  </DataTable>
                )}
                <p className="page-note">
                  Each sending domain should be plainly the team&apos;s, lead to the main site and
                  publish SPF, DKIM and DMARC records. A refusal that reads as a block rests a
                  mailbox for two days; the host&apos;s own daily limit rests it until tomorrow; a
                  refused sign-in pauses it until it is connected again. Who may be written to, and
                  where, is under{" "}
                  <Link className="text-link" href="/leads/rules">
                    Sending rules
                  </Link>
                  .
                </p>
              </div>

              <aside className="record-layout__side">
                {canWrite && (
                  <SudoGate
                    action={confirmSudoAction}
                    fresh={fresh}
                    untilLabel={untilLabel}
                    returnPath={BASE}
                    purpose="Adding a mailbox by its server, disconnecting one and the pool's ceilings need a fresh code from your authenticator app."
                  />
                )}
                {canWrite && (
                  <Card
                    title="Connect your mailbox"
                    titleAs="h3"
                    description={`Type its address: where its mail lives decides how it signs in. A new mailbox waits ${formatNumber(board.settings.warm_up_days)} days before its first cold email; HQ sends no warm-up mail, so warm it with ordinary mail first.`}
                  >
                    <MailForm
                      action={connectMailboxAction}
                      submitLabel="Connect"
                      pendingLabel="Looking it up…"
                      variant="primary"
                    >
                      <Field id="connect-address" label="Your mailbox's address">
                        <Input
                          id="connect-address"
                          name="address"
                          type="email"
                          defaultValue={adding}
                          maxLength={254}
                          required
                          autoComplete="email"
                        />
                      </Field>
                    </MailForm>
                    {!consentReady && (
                      <p className="page-note">
                        Sign-in through a host&apos;s own consent screen is not set up on the
                        service yet, so for now a mailbox is added by its server below.
                      </p>
                    )}
                  </Card>
                )}
                {canWrite && (
                  <Card
                    title="Add by server and app password"
                    titleAs="h3"
                    titleId="add-mailbox"
                    description="For a host without its own consent screen. Nothing is kept unless the password signs in."
                  >
                    {adding && (
                      <Callout tone="neutral" role="status" compact>
                        Mail for {adding.split("@").pop()} signs in by its outgoing server and an
                        app password.{" "}
                        {addSmtp
                          ? "Its servers are filled in below; "
                          : "The host's help pages name its outgoing server; "}
                        make an app password in the mailbox&apos;s security settings and paste it
                        here.
                      </Callout>
                    )}
                    <AddMailboxForm
                      key={adding || "blank"}
                      action={addMailboxAction}
                      disabled={!fresh}
                      defaults={{
                        address: adding,
                        display_name: context.me.staff.display_name,
                        smtp_host: addSmtp,
                        smtp_port: addPort,
                        imap_host: addImap,
                      }}
                    />
                  </Card>
                )}
                <Card
                  title="The pool's ceilings"
                  titleAs="h3"
                  description="Above every mailbox's own cap: never more than this across the pool, or from one domain, in a day."
                >
                  {board.may_manage ? (
                    <MailForm
                      action={mailboxSettingsAction}
                      submitLabel="Save the ceilings"
                      disabled={!fresh}
                    >
                      <Field
                        id="pool-cap"
                        label="The whole pool, a day"
                        hint={`At most ${formatNumber(board.settings.pool_ceiling)}.`}
                      >
                        <Input
                          id="pool-cap"
                          name="pool_daily_cap"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={board.settings.pool_ceiling}
                          defaultValue={board.settings.pool_daily_cap}
                          required
                        />
                      </Field>
                      <Field id="domain-cap" label="One domain, a day">
                        <Input
                          id="domain-cap"
                          name="domain_daily_cap"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={board.settings.pool_ceiling}
                          defaultValue={board.settings.domain_daily_cap}
                          required
                        />
                      </Field>
                      <Field
                        id="warm-up"
                        label="Days a new mailbox waits"
                        hint="Three to four weeks is the usual advice."
                      >
                        <Input
                          id="warm-up"
                          name="warm_up_days"
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={60}
                          defaultValue={board.settings.warm_up_days}
                          required
                        />
                      </Field>
                      <Field id="ceilings-reason" label="Why they are changing">
                        <Input
                          id="ceilings-reason"
                          name="reason"
                          minLength={4}
                          maxLength={400}
                          required
                        />
                      </Field>
                    </MailForm>
                  ) : (
                    <KeyValue>
                      <KeyValueRow label="The whole pool, a day">
                        {formatNumber(board.settings.pool_daily_cap)}
                      </KeyValueRow>
                      <KeyValueRow label="One domain, a day">
                        {formatNumber(board.settings.domain_daily_cap)}
                      </KeyValueRow>
                      <KeyValueRow label="Days a new mailbox waits">
                        {formatNumber(board.settings.warm_up_days)}
                      </KeyValueRow>
                    </KeyValue>
                  )}
                </Card>
              </aside>
            </div>
          </>
        )}
      </div>
    </>
  );
}
