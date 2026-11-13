import Link from "next/link";

import { MailTabs } from "@/components/mail/mail-tabs";
import { CampaignStatePill, Rate } from "@/components/mail/pills";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import {
  readCampaigns,
  readMailOverview,
  type MailCampaign,
  type MailOverview,
} from "@/lib/api/mail";
import { mergeConfigured } from "@/lib/merge/api";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Mail" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "campaign", label: "Campaign" },
  { key: "state", label: "State" },
  { key: "sent", label: "Sent", align: "end" as const },
  { key: "delivered", label: "Delivered", align: "end" as const },
  { key: "clicked", label: "Clicked", align: "end" as const },
  { key: "stopped", label: "Unsubscribed", align: "end" as const },
  { key: "updated", label: "Updated" },
];

function pct(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(value > 0 && value < 1 ? 2 : 1)}%`;
}

/**
 * Mail at a glance: whether anything can leave, what is leaving, what waits for a
 * person, and whether the last month's sending kept the mailbox providers happy.
 */
export default async function MailOverviewPage() {
  const context = await requireStaff("/mail");
  const now = requestNow();
  let overview: MailOverview | null = null;
  let campaigns: MailCampaign[] = [];
  try {
    overview = await readMailOverview(context.token);
    campaigns = (await readCampaigns(context.token)).campaigns;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const canWrite = hasCapability(context, "crm:write");
  const setupGaps = overview
    ? [
        !overview.postal_address_set && "a postal address for the footer",
        !overview.senders.some(
          (sender) => sender.kind === "marketing" && sender.verified && sender.active,
        ) && "a verified marketing sender",
        !overview.webhook_configured && "the provider's delivery events (bounces, complaints)",
      ].filter(Boolean)
    : [];

  return (
    <>
      <PageHeader
        eyebrow="Outreach"
        title="Mail"
        meta={<LiveRefresh intervalSeconds={60} label="Mail" />}
        description="Campaigns to customers and prospects, sequences from one person to another, and the rules that decide who may be mailed. Nothing is sent to anyone who asked us to stop."
        actions={
          <>
            {canWrite && (
              <Link className="btn btn--small btn--primary" href="/mail/campaigns/new">
                New campaign
              </Link>
            )}
            <MailTabs current="/mail" />
          </>
        }
      />
      {overview === null ? (
        <div className="page-content">
          <Callout tone="danger" role="alert">
            Mail could not be read just now. This is a read failure, not an empty outbox.
          </Callout>
        </div>
      ) : (
        <div className="page-content">
          {!overview.sending_enabled && (
            <Callout tone="danger" role="alert" title="Sending is off">
              {overview.paused_reason || "An owner or admin switched it off."} Nothing leaves until
              it is switched back on under <Link href="/mail/settings">Settings</Link>.
            </Callout>
          )}
          {mergeConfigured() ? (
            <Callout tone="neutral" title="Sending from this computer">
              Campaigns and sequences run on the service, so nothing here sends from this computer.{" "}
              <Link href="/mail/merge">Mail merge</Link> is where mail goes out.
            </Callout>
          ) : (
            setupGaps.length > 0 && (
              <Callout tone="attention" title="Before the first campaign">
                Still missing: {setupGaps.join(", ")}.{" "}
                <Link href="/mail/settings">Open settings</Link>
              </Callout>
            )
          )}
          <StatGrid columns={6} label="Mail today">
            <Stat
              label="Sent today"
              value={overview.today.sent}
              hint={`of ${overview.today.global_cap} · ${overview.today.hour_sent}/${overview.today.hourly_cap} this hour`}
            />
            <Stat
              label="Sending"
              value={overview.campaigns.running + overview.campaigns.scheduled}
              hint={`${overview.campaigns.scheduled} scheduled to start`}
            />
            <Stat
              label="Awaiting approval"
              value={overview.campaigns.review}
              hint="By a second person"
            />
            <Stat
              label="Paused"
              value={overview.campaigns.auto_paused}
              hint="Look before resuming"
              tone={overview.campaigns.auto_paused > 0 ? "danger" : "default"}
            />
            <Stat
              label="Replies to record"
              value={overview.sequences.awaiting_reply}
              hint={`${overview.sequences.active_enrolments} in sequences`}
            />
            <Stat
              label="Stopped this week"
              value={overview.suppressions_7d}
              hint="Added to the stop list"
            />
          </StatGrid>

          <section className="record-section" aria-labelledby="mail-health">
            <h2 className="record-section__title" id="mail-health">
              Last 30 days
            </h2>
            <StatGrid columns={4} label="Deliverability, last 30 days">
              <Stat
                label="Hard bounces"
                value={pct(overview.health_30d.hard_bounce_pct)}
                hint={`${overview.health_30d.hard_bounced} of ${overview.health_30d.sent} sent`}
                tone={
                  (overview.health_30d.hard_bounce_pct ?? 0) >=
                  overview.health_30d.thresholds.hard_bounce_pct
                    ? "danger"
                    : "default"
                }
              />
              <Stat
                label="Spam complaints"
                value={pct(overview.health_30d.complaint_pct)}
                hint={`${overview.health_30d.complained} reported`}
                tone={
                  (overview.health_30d.complaint_pct ?? 0) >=
                  overview.health_30d.thresholds.complaint_pct_watch
                    ? "danger"
                    : "default"
                }
              />
              <Stat
                label="Unsubscribes"
                value={pct(overview.health_30d.unsubscribe_pct)}
                hint={`${overview.health_30d.unsubscribed} of ${overview.health_30d.delivered} delivered`}
              />
              <Stat
                label="Clicked"
                value={pct(overview.health_30d.click_pct)}
                hint={`${overview.health_30d.clicked} people`}
              />
            </StatGrid>
            <p className="chart-note">
              Mailbox providers start filtering at 0.1% spam complaints and refuse at 0.3%; the
              provider suspends above 2% hard bounces. Opens are not shown: privacy proxies open
              everything.
            </p>
          </section>

          <section className="record-section" aria-labelledby="mail-recent">
            <h2 className="record-section__title" id="mail-recent">
              Recent campaigns
            </h2>
            <DataTable
              caption="Recent campaigns"
              columns={COLUMNS}
              isEmpty={campaigns.length === 0}
              empty={
                <EmptyState
                  title="No campaigns yet"
                  description="A campaign goes to a segment, chosen companies or people, leads, or a CSV — checked against the stop list first."
                  action={
                    canWrite ? (
                      <Link className="btn btn--small btn--primary" href="/mail/campaigns/new">
                        New campaign
                      </Link>
                    ) : undefined
                  }
                />
              }
            >
              {campaigns.slice(0, 8).map((campaign) => (
                <tr key={campaign.campaign_id}>
                  <td>
                    <Link className="table-title" href={`/mail/campaigns/${campaign.campaign_id}`}>
                      {campaign.name}
                    </Link>
                    <span className="table-sub">{campaign.audience_description}</span>
                  </td>
                  <td>
                    <CampaignStatePill state={campaign.state} />
                  </td>
                  <td className="data-table__num">{campaign.counts.sent}</td>
                  <td className="data-table__num">
                    <Rate
                      part={campaign.counts.delivered}
                      whole={campaign.counts.sent}
                      pct={campaign.rates.delivered_pct}
                    />
                  </td>
                  <td className="data-table__num">
                    <Rate
                      part={campaign.counts.clicked}
                      whole={campaign.counts.delivered}
                      pct={campaign.rates.click_pct}
                    />
                  </td>
                  <td className="data-table__num">
                    <Rate
                      part={campaign.counts.unsubscribed}
                      whole={campaign.counts.delivered}
                      pct={campaign.rates.unsubscribe_pct}
                    />
                  </td>
                  <td>
                    <Timestamp value={campaign.updated_at} now={now} mode="relative" />
                  </td>
                </tr>
              ))}
            </DataTable>
          </section>

          <section className="record-section" aria-labelledby="mail-senders">
            <h2 className="record-section__title" id="mail-senders">
              Who mail comes from
            </h2>
            {overview.senders.length === 0 ? (
              <p className="page-note">
                No senders yet. <Link href="/mail/settings">Add one under Settings</Link>.
              </p>
            ) : (
              <ul className="sender-list">
                {overview.senders.map((sender) => (
                  <li key={sender.sender_id} className="sender">
                    <span className="sender__name">
                      {sender.from_name || sender.from_email}
                      <span className="table-sub">{sender.from_email}</span>
                    </span>
                    <span className="sender__kind">
                      {sender.kind === "sales"
                        ? `Sales · ${sender.staff_name || "a person"}`
                        : sender.kind === "mailbox"
                          ? `Mailbox · ${sender.staff_name || "a person"}`
                          : "Marketing"}
                    </span>
                    <span className="sender__cap">{sender.daily_cap} a day</span>
                    <StatusPill
                      value={sender.verified ? "verified" : "unverified"}
                      label={sender.verified ? "Verified" : "Not verified"}
                    />
                    {sender.paused_at && (
                      <>
                        <StatusPill value="paused" label="Paused" tone="danger" />
                        {/* A pill never wraps: a block's whole reply beside it would run off a phone. */}
                        <span className="sender__reason">{sender.paused_reason}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="page-note">
              The queue last ran{" "}
              <Timestamp
                value={overview.last_worker_at}
                now={now}
                mode="relative"
                fallback="never"
              />
              . Marketing sends from the company; each sequence sends from one person, and a first
              email to a prospect only from a connected mailbox.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
