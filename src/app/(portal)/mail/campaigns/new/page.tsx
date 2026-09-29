import { createCampaignAction } from "@/app/(portal)/mail/actions";
import { CampaignForm, type CampaignInitial } from "@/components/mail/campaign-form";
import { MailTabs } from "@/components/mail/mail-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { readCampaigns, readSegments, readSenders, readTemplates } from "@/lib/api/mail";
import { audienceOptions } from "@/lib/mail/options";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "New campaign" };
export const dynamic = "force-dynamic";

type NewCampaignProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function ids(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5000);
}

export default async function NewCampaignPage({ searchParams }: NewCampaignProps) {
  const context = await requireStaff("/mail/campaigns/new");
  if (!hasCapability(context, "crm:write")) {
    return (
      <>
        <PageHeader eyebrow="Mail" title="New campaign" />
        <div className="page-content">
          <Callout tone="neutral">Your role reads mail without drafting it.</Callout>
        </div>
      </>
    );
  }
  const parameters = await searchParams;
  const [senders, templates, segments, topics, options] = await Promise.all([
    readSenders(context.token),
    readTemplates(context.token),
    readSegments(context.token),
    readCampaigns(context.token),
    audienceOptions(context.token),
  ]);
  const initial: CampaignInitial = {};
  for (const kind of ["people", "leads", "companies"] as const) {
    const chosen = ids(firstSearchValue(parameters[kind]));
    if (chosen.length) {
      initial.audience_kind = kind;
      initial.ids = chosen;
    }
  }
  const segment = firstSearchValue(parameters.segment);
  if (segment) {
    initial.audience_kind = "segment";
    initial.segment_id = segment;
  }
  return (
    <>
      <PageHeader
        eyebrow="Mail"
        title="New campaign"
        description="Saved as a draft. The next page shows who it reaches, who is skipped and why, and the checks that come before anything is sent."
        actions={<MailTabs current="/mail/campaigns" />}
      />
      <div className="page-content">
        <CampaignForm
          action={createCampaignAction}
          senders={senders.senders
            .filter((sender) => sender.kind === "marketing" && sender.active)
            .map((sender) => ({
              id: sender.sender_id,
              label: `${sender.from_name || "Quantify Terminal"} <${sender.from_email}>`,
              verified: sender.verified,
            }))}
          templates={templates.templates
            .filter((template) => template.kind === "campaign" && !template.archived_at)
            .map((template) => ({
              id: template.template_id,
              label: `${template.name} · v${template.current_version}`,
            }))}
          topics={topics.topics}
          segments={segments.segments
            .filter((row) => !row.archived_at)
            .map((row) => ({
              id: row.segment_id,
              label: `${row.name} · ${row.last_count ?? 0} ${row.kind}`,
            }))}
          companies={options.companies}
          people={options.people}
          leads={options.leads}
          initial={initial}
          submitLabel="Save draft"
        />
      </div>
    </>
  );
}
