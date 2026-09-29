import Link from "next/link";
import { notFound } from "next/navigation";

import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import {
  campaignControlAction,
  decideCampaignAction,
  scheduleCampaignAction,
  submitCampaignAction,
  testCampaignAction,
  updateCampaignAction,
} from "@/app/(portal)/mail/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
import { CampaignForm } from "@/components/mail/campaign-form";
import { MailForm } from "@/components/mail/mail-form";
import {
  CampaignStatePill,
  MessageStatePill,
  deferralText,
  formatPct,
} from "@/components/mail/pills";
import { RenderedPreview } from "@/components/mail/rendered-preview";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
  RecordTabs,
  currentTab,
} from "@/components/ui/record-shell";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import {
  SKIP_REASON_LABELS,
  previewTemplate,
  readCampaign,
  readSegments,
  readSenders,
  readTemplates,
  readCampaigns,
  type CampaignDetail,
  type RenderedPreview as Rendered,
} from "@/lib/api/mail";
import { formatAbsolute } from "@/lib/format";
import { audienceOptions } from "@/lib/mail/options";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Campaign" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "recipients", label: "Recipients" },
  { key: "preview", label: "Preview" },
  { key: "edit", label: "Edit" },
];

const MESSAGE_COLUMNS = [
  { key: "to", label: "To" },
  { key: "state", label: "State" },
  { key: "sent", label: "Sent" },
  { key: "delivered", label: "Delivered" },
  { key: "clicked", label: "Clicked" },
];

type CampaignPageProps = {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CampaignPage({ params, searchParams }: CampaignPageProps) {
  const { campaignId } = await params;
  const context = await requireStaff(`/mail/campaigns/${campaignId}`);
  const parameters = await searchParams;
  const now = requestNow();
  let detail: CampaignDetail | null = null;
  try {
    detail = await readCampaign(context.token, campaignId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (detail === null) {
    return (
      <Callout tone="danger" role="alert">
        This campaign could not be read just now. This is a read failure, not a missing campaign.
      </Callout>
    );
  }
  const { campaign } = detail;
  const draft = campaign.state === "draft";
  const tabs = draft ? TABS : TABS.filter((tab) => tab.key !== "edit");
  const tab = currentTab(firstSearchValue(parameters.tab), tabs);
  const base = `/mail/campaigns/${campaign.campaign_id}`;
  const canWrite = hasCapability(context, "crm:write");
  const fresh = context.me.sudo_fresh;
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  const checklist = detail.checklist ?? [];
  const blocking = checklist.filter((item) => item.blocking && !item.ok && item.key !== "approval");
  const idField = { campaign_id: campaign.campaign_id };
  const started = !["draft", "review", "approved"].includes(campaign.state);

  let rendered: Rendered | null = null;
  if (tab === "preview") {
    try {
      rendered = await previewTemplate(context.token, campaign.template.template_id, {
        version: campaign.template.version,
        topic: campaign.topic,
      });
    } catch (error) {
      if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
        throw error;
    }
  }
  const editData =
    tab === "edit" && draft
      ? await Promise.all([
          readSenders(context.token),
          readTemplates(context.token),
          readSegments(context.token),
          readCampaigns(context.token),
          audienceOptions(context.token),
        ])
      : null;
  const audience = campaign.audience as { kind?: string; ids?: string[]; segment_id?: string };

  const actions = (
    <>
      {draft && canWrite && (
        <MailForm
          action={testCampaignAction}
          fields={idField}
          submitLabel="Send me a test"
          className="inline-form"
        />
      )}
      {draft && canWrite && (
        <MailForm
          action={submitCampaignAction}
          fields={idField}
          submitLabel="Submit"
          variant="primary"
          className="inline-form"
          disabled={blocking.length > 0}
        />
      )}
      {(campaign.state === "running" || campaign.state === "scheduled") && detail.may_send && (
        <MailForm
          action={campaignControlAction}
          fields={{ ...idField, op: "pause" }}
          submitLabel="Pause"
          className="inline-form"
        />
      )}
      {(campaign.state === "paused" || campaign.state === "auto_paused") && detail.may_send && (
        <MailForm
          action={campaignControlAction}
          fields={{ ...idField, op: "resume" }}
          submitLabel="Resume"
          variant="primary"
          className="inline-form"
        />
      )}
      {!["completed", "cancelled"].includes(campaign.state) && detail.may_send && (
        <MailForm
          action={campaignControlAction}
          fields={{ ...idField, op: "cancel" }}
          submitLabel="Cancel"
          variant="ghost"
          className="inline-form"
        />
      )}
    </>
  );

  return (
    <>
      <RecordHeader
        crumbs={[
          { href: "/mail", label: "Mail" },
          { href: "/mail/campaigns", label: "Campaigns" },
        ]}
        title={campaign.name}
        status={<CampaignStatePill state={campaign.state} />}
        readouts={[
          { label: "Audience", value: campaign.audience_description },
          { label: "Recipients", value: String(campaign.counts.recipients) },
          { label: "Sent", value: String(campaign.counts.sent) },
          { label: "Delivered", value: String(campaign.counts.delivered) },
        ]}
        actions={actions}
      />
      {(campaign.state === "auto_paused" ||
        (campaign.state === "paused" && campaign.pause_reason) ||
        campaign.state === "review") && (
        <div className="record-banners">
          {campaign.state === "auto_paused" && (
            <Callout tone="danger" role="alert" title="It paused itself">
              {campaign.pause_reason}. Look at the recipients before resuming: bounces mean a stale
              list, a complaint means the wrong people.
            </Callout>
          )}
          {campaign.state === "paused" && campaign.pause_reason && (
            <Callout tone="attention" title="Paused">
              {campaign.pause_reason}
            </Callout>
          )}
          {campaign.state === "review" && (
            <Callout
              tone="attention"
              title={detail.may_approve ? "Waiting for you" : "Waiting for approval"}
            >
              {detail.may_approve
                ? `${campaign.created_by?.name ?? "A colleague"} asked to send this to ${detail.preview?.eligible ?? campaign.counts.recipients} people. Read it under Preview before approving.`
                : "A second owner or admin approves a send to fifty or more people, or to any customer. They have been mailed."}
            </Callout>
          )}
        </div>
      )}
      <RecordTabs base={base} tabs={tabs} current={tab} label="Campaign sections" />
      <RecordGrid
        side={
          <>
            <Properties title="Campaign">
              <Property label="Template">
                <Link href={`/mail/templates/${campaign.template.template_id}`}>
                  {campaign.template.name} · v{campaign.template.version}
                </Link>
              </Property>
              <Property label="From" mono>
                {campaign.sender.from_email}
              </Property>
              <Property label="Topic">{campaign.topic_label}</Property>
              <Property label="Timing">
                {campaign.send_anytime ? "Any hour" : "Recipients' working hours"}
              </Property>
              {campaign.dry_run && <Property label="Mode">Dry run: nothing is sent</Property>}
              <Property label="Author">{campaign.created_by?.name ?? "—"}</Property>
              {campaign.approved_by && (
                <Property label="Approved">
                  {campaign.approved_by.name} ·{" "}
                  <Timestamp value={campaign.approved_at} now={now} mode="relative" />
                </Property>
              )}
              {(campaign.started_at ?? campaign.scheduled_at) && (
                <Property label={campaign.started_at ? "Started" : "Starts"}>
                  <Timestamp
                    value={campaign.started_at ?? campaign.scheduled_at}
                    now={now}
                    mode="both"
                  />
                </Property>
              )}
              {campaign.completed_at && (
                <Property label="Finished">
                  <Timestamp value={campaign.completed_at} now={now} mode="both" />
                </Property>
              )}
            </Properties>
            {campaign.state === "review" && detail.may_approve && (
              <section className="side-panel" aria-labelledby="campaign-decide">
                <h2 id="campaign-decide" className="record-section__title">
                  Your decision
                </h2>
                <SudoGate
                  action={confirmSudoAction}
                  fresh={fresh}
                  untilLabel={untilLabel}
                  returnPath={base}
                  purpose="Approving a send needs a fresh code from your authenticator app."
                />
                <MailForm
                  action={decideCampaignAction}
                  fields={{ ...idField, decision: "approve" }}
                  submitLabel="Approve"
                  variant="primary"
                  disabled={!fresh}
                >
                  <Field id="approve-note" label="Note" hint="Optional; the author reads it.">
                    <Input id="approve-note" name="note" maxLength={400} />
                  </Field>
                </MailForm>
                <MailForm
                  action={decideCampaignAction}
                  fields={{ ...idField, decision: "decline" }}
                  submitLabel="Send back to draft"
                  variant="ghost"
                  disabled={!fresh}
                >
                  <Field id="decline-note" label="What to change">
                    <Input id="decline-note" name="note" maxLength={400} />
                  </Field>
                </MailForm>
              </section>
            )}
            {campaign.state === "approved" && detail.may_send && (
              <section className="side-panel" aria-labelledby="campaign-schedule">
                <h2 id="campaign-schedule" className="record-section__title">
                  Schedule
                </h2>
                <MailForm
                  action={scheduleCampaignAction}
                  fields={idField}
                  submitLabel="Start sending"
                  variant="primary"
                >
                  <Field
                    id="schedule-at"
                    label="Start at"
                    hint="Leave empty to start now. Each recipient still gets it in their own working hours."
                  >
                    <Input id="schedule-at" name="scheduled_at" type="datetime-local" />
                  </Field>
                </MailForm>
              </section>
            )}
            {draft && canWrite && (
              <section className="side-panel" aria-labelledby="campaign-test">
                <h2 id="campaign-test" className="record-section__title">
                  Test to someone else
                </h2>
                <MailForm action={testCampaignAction} fields={idField} submitLabel="Send test">
                  <Field
                    id="test-to"
                    label="Colleague's address"
                    hint="Staff or a seed inbox only."
                  >
                    <Input id="test-to" name="to_email" type="email" maxLength={254} />
                  </Field>
                </MailForm>
              </section>
            )}
          </>
        }
      >
        {tab === "overview" && (
          <>
            {detail.preview && (
              <RecordSection id="campaign-audience" title="Who it reaches">
                <p className="audience-summary">
                  <strong>{detail.preview.eligible}</strong> will get it;{" "}
                  <strong>{detail.preview.skipped}</strong> are skipped.
                </p>
                {Object.keys(detail.preview.skipped_by_reason).length > 0 && (
                  <ul className="reason-list">
                    {Object.entries(detail.preview.skipped_by_reason).map(([reason, count]) => (
                      <li key={reason}>
                        <span>{SKIP_REASON_LABELS[reason] ?? reason}</span>
                        <span className="reason-list__count">{count}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {detail.preview.sample.length > 0 && (
                  <p className="page-note">
                    Among them:{" "}
                    {detail.preview.sample
                      .map(
                        (row) =>
                          `${row.name || row.email}${row.company ? ` (${row.company})` : ""}`,
                      )
                      .join(", ")}
                    .
                  </p>
                )}
              </RecordSection>
            )}
            {checklist.length > 0 && (
              <RecordSection id="campaign-checks" title="Before it can go">
                <ul className="checklist">
                  {checklist.map((item) => (
                    <li
                      key={item.key}
                      className={
                        item.ok
                          ? "check check--ok"
                          : item.blocking
                            ? "check check--block"
                            : "check check--warn"
                      }
                    >
                      <span className="check__mark" aria-hidden="true">
                        {item.ok ? "✓" : item.blocking ? "✕" : "!"}
                      </span>
                      <span>{item.label}</span>
                      <span className="sr-only">
                        {item.ok ? "done" : item.blocking ? "blocks sending" : "advised"}
                      </span>
                    </li>
                  ))}
                </ul>
              </RecordSection>
            )}
            {started && (
              <RecordSection id="campaign-results" title="Results">
                <KeyValue columns={2}>
                  <KeyValueRow label="Sent">{campaign.counts.sent}</KeyValueRow>
                  <KeyValueRow label="Delivered">
                    {campaign.counts.delivered}
                    {campaign.rates.delivered_pct !== null &&
                      ` · ${formatPct(campaign.rates.delivered_pct)}`}
                  </KeyValueRow>
                  <KeyValueRow label="Hard bounces">
                    {campaign.counts.hard_bounced}
                    {campaign.rates.hard_bounce_pct !== null &&
                      ` · ${formatPct(campaign.rates.hard_bounce_pct)}`}
                  </KeyValueRow>
                  <KeyValueRow label="Soft bounces">{campaign.counts.soft_bounced}</KeyValueRow>
                  <KeyValueRow label="Spam complaints">
                    {campaign.counts.complained}
                    {campaign.rates.complaint_pct !== null &&
                      ` · ${formatPct(campaign.rates.complaint_pct)}`}
                  </KeyValueRow>
                  <KeyValueRow label="Unsubscribed">{campaign.counts.unsubscribed}</KeyValueRow>
                  <KeyValueRow label="Clicked">
                    {campaign.counts.clicked}
                    {campaign.rates.click_pct !== null &&
                      ` · ${formatPct(campaign.rates.click_pct)}`}
                  </KeyValueRow>
                  <KeyValueRow label="Skipped">{campaign.counts.skipped}</KeyValueRow>
                  <KeyValueRow label="Failed">{campaign.counts.failed}</KeyValueRow>
                  <KeyValueRow label="Still queued">
                    {(detail.messages_by_state.pending ?? 0) +
                      (detail.messages_by_state.retry ?? 0) +
                      (detail.messages_by_state.held ?? 0)}
                  </KeyValueRow>
                </KeyValue>
                {Object.keys(detail.skipped_by_reason).length > 0 && (
                  <ul className="reason-list">
                    {Object.entries(detail.skipped_by_reason).map(([reason, count]) => (
                      <li key={reason}>
                        <span>{SKIP_REASON_LABELS[reason] ?? reason}</span>
                        <span className="reason-list__count">{count}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="page-note">
                  Opens are not counted: mail privacy proxies open every message, so an open proves
                  nothing.
                </p>
              </RecordSection>
            )}
          </>
        )}
        {tab === "recipients" && (
          <DataTable
            caption="Recipients"
            columns={MESSAGE_COLUMNS}
            isEmpty={detail.messages.length === 0}
            empty={
              <EmptyState
                compact
                title="Nobody yet"
                description="Recipients are fixed when the campaign is scheduled."
              />
            }
          >
            {detail.messages.map((message) => (
              <tr key={message.message_id}>
                <td>
                  <span className="table-title">{message.email}</span>
                  {message.is_seed && <span className="table-sub">Seed inbox</span>}
                </td>
                <td>
                  <MessageStatePill state={message.state} />
                  {message.skip_reason ? (
                    <span className="table-sub">
                      {SKIP_REASON_LABELS[message.skip_reason] ?? message.skip_reason}
                    </span>
                  ) : message.state === "pending" || message.state === "retry" ? (
                    <span className="table-sub">
                      {message.last_error && `${deferralText(message.last_error)} · `}
                      <Timestamp
                        value={message.scheduled_at}
                        now={now}
                        mode="relative"
                        prefix="goes "
                      />
                    </span>
                  ) : (
                    message.last_error && (
                      <span className="table-sub">{deferralText(message.last_error)}</span>
                    )
                  )}
                </td>
                <td>
                  <Timestamp value={message.sent_at} now={now} mode="relative" fallback="—" />
                </td>
                <td>
                  <Timestamp value={message.delivered_at} now={now} mode="relative" fallback="—" />
                </td>
                <td>
                  <Timestamp
                    value={message.first_clicked_at}
                    now={now}
                    mode="relative"
                    fallback="—"
                  />
                </td>
              </tr>
            ))}
          </DataTable>
        )}
        {tab === "preview" && (
          <RecordSection id="campaign-preview" title="As a recipient sees it">
            {rendered === null ? (
              <Callout tone="danger" compact>
                The preview could not be rendered just now.
              </Callout>
            ) : rendered.ok_render ? (
              <RenderedPreview
                subject={rendered.subject ?? ""}
                html={rendered.html ?? ""}
                text={rendered.text ?? ""}
              />
            ) : (
              <Callout tone="attention" compact>
                The sample contact has no {rendered.missing}; recipients without it are skipped
                rather than sent a gap.
              </Callout>
            )}
            <p className="page-note">
              Rendered for a sample recipient. Each real recipient gets their own name, firm and
              stop link.
            </p>
          </RecordSection>
        )}
        {tab === "edit" && editData && (
          <CampaignForm
            action={updateCampaignAction}
            senders={editData[0].senders
              .filter((sender) => sender.kind === "marketing" && sender.active)
              .map((sender) => ({
                id: sender.sender_id,
                label: `${sender.from_name || "Quantify Terminal"} <${sender.from_email}>`,
                verified: sender.verified,
              }))}
            templates={editData[1].templates
              .filter((template) => template.kind === "campaign" && !template.archived_at)
              .map((template) => ({
                id: template.template_id,
                label: `${template.name} · v${template.current_version}`,
              }))}
            topics={editData[3].topics}
            segments={editData[2].segments
              .filter((row) => !row.archived_at)
              .map((row) => ({
                id: row.segment_id,
                label: `${row.name} · ${row.last_count ?? 0} ${row.kind}`,
              }))}
            companies={editData[4].companies}
            people={editData[4].people}
            leads={editData[4].leads}
            initial={{
              campaign_id: campaign.campaign_id,
              name: campaign.name,
              sender_id: campaign.sender.sender_id,
              template_id: campaign.template.template_id,
              topic: campaign.topic,
              ...(audience.kind === "segment" ||
              audience.kind === "people" ||
              audience.kind === "leads" ||
              audience.kind === "companies" ||
              audience.kind === "csv"
                ? { audience_kind: audience.kind }
                : {}),
              ...(audience.segment_id ? { segment_id: audience.segment_id } : {}),
              ...(audience.ids ? { ids: audience.ids } : {}),
              send_anytime: campaign.send_anytime,
              dry_run: campaign.dry_run,
            }}
            submitLabel="Save changes"
          />
        )}
      </RecordGrid>
    </>
  );
}
