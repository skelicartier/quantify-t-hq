import Link from "next/link";

import { MailTabs } from "@/components/mail/mail-tabs";
import { CampaignStatePill, Rate } from "@/components/mail/pills";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCampaigns, type MailCampaign } from "@/lib/api/mail";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

const VIEWS: Record<string, { label: string; states: readonly MailCampaign["state"][] | null }> = {
  all: { label: "All", states: null },
  drafts: { label: "Drafts", states: ["draft"] },
  waiting: { label: "Waiting", states: ["review", "approved", "scheduled"] },
  sending: { label: "Sending", states: ["running", "paused", "auto_paused"] },
  sent: { label: "Sent", states: ["completed"] },
};

const COLUMNS = [
  { key: "campaign", label: "Campaign" },
  { key: "state", label: "State" },
  { key: "topic", label: "Topic" },
  { key: "recipients", label: "Recipients", align: "end" as const },
  { key: "sent", label: "Sent", align: "end" as const },
  { key: "delivered", label: "Delivered", align: "end" as const },
  { key: "bounced", label: "Bounced", align: "end" as const },
  { key: "clicked", label: "Clicked", align: "end" as const },
  { key: "unsubscribed", label: "Unsubscribed", align: "end" as const },
  { key: "owner", label: "Author" },
  { key: "updated", label: "Updated" },
];

type CampaignsPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CampaignsPage({ searchParams }: CampaignsPageProps) {
  const context = await requireStaff("/mail/campaigns");
  const parameters = await searchParams;
  const view = VIEWS[firstSearchValue(parameters.view) ?? ""]
    ? (firstSearchValue(parameters.view) ?? "all")
    : "all";
  const now = requestNow();
  let campaigns: MailCampaign[] | null = null;
  try {
    campaigns = (await readCampaigns(context.token)).campaigns;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const states = VIEWS[view]!.states;
  const shown = (campaigns ?? []).filter((row) => !states || states.includes(row.state));
  const canWrite = hasCapability(context, "crm:write");

  return (
    <>
      <PageHeader
        eyebrow="Mail"
        title="Campaigns"
        description="One message to many: an audience frozen when it is scheduled, every skip recorded with its reason, and a second person's approval for fifty or more or for any customer."
        actions={
          <>
            {canWrite && (
              <Link className="btn btn--small btn--primary" href="/mail/campaigns/new">
                New campaign
              </Link>
            )}
            <MailTabs current="/mail/campaigns" />
          </>
        }
      />
      <div className="page-content">
        <SegmentedLinks
          label="Campaign views"
          items={Object.entries(VIEWS).map(([key, entry]) => ({
            href: key === "all" ? "/mail/campaigns" : `/mail/campaigns?view=${key}`,
            label: `${entry.label} ${(campaigns ?? []).filter((row) => !entry.states || entry.states.includes(row.state)).length}`,
            current: key === view,
          }))}
        />
        {campaigns === null ? (
          <Callout tone="danger" role="alert">
            Campaigns could not be read just now. This is a read failure, not an empty list.
          </Callout>
        ) : (
          <DataTable
            caption="Campaigns"
            columns={COLUMNS}
            isEmpty={shown.length === 0}
            empty={
              <EmptyState
                title={view === "all" ? "No campaigns yet" : "Nothing here"}
                description="Start from a template: the campaign page then shows exactly who it reaches before anything is sent."
              />
            }
          >
            {shown.map((campaign) => (
              <tr key={campaign.campaign_id}>
                <td>
                  <Link className="table-title" href={`/mail/campaigns/${campaign.campaign_id}`}>
                    {campaign.name}
                  </Link>
                  <span className="table-sub">{campaign.audience_description}</span>
                </td>
                <td>
                  <CampaignStatePill state={campaign.state} />
                  {campaign.dry_run && <span className="table-sub">Dry run</span>}
                </td>
                <td>{campaign.topic_label}</td>
                <td className="data-table__num">{campaign.counts.recipients}</td>
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
                    part={campaign.counts.hard_bounced}
                    whole={campaign.counts.sent}
                    pct={campaign.rates.hard_bounce_pct}
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
                <td>{campaign.created_by?.name ?? "—"}</td>
                <td>
                  <Timestamp value={campaign.updated_at} now={now} mode="relative" />
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>
    </>
  );
}
