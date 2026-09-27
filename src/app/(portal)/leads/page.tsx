import Link from "next/link";

import { createLeadAction } from "@/app/(portal)/leads/actions";
import { LeadCreateForm } from "@/components/crm/lead-forms";
import { FirstReplyClock, LeadStagePill } from "@/components/crm/pills";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Popover } from "@/components/ui/popover";
import { Stat, StatGrid } from "@/components/ui/stat";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCrmSettings, readLeads, type CrmSettings, type LeadsPage } from "@/lib/api/crm";
import { directoryOrEmpty } from "@/lib/api/staff";
import { LEAD_STAGES, LEAD_STAGE_LABELS, sourceLabel } from "@/lib/crm/vocabulary";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "lead", label: "Lead" },
  { key: "source", label: "Source" },
  { key: "stage", label: "Stage" },
  { key: "clock", label: "First reply" },
  { key: "owner", label: "Owner" },
  { key: "received", label: "Received" },
];

/** The reply target as prose: 60 → "an hour", 120 → "2 hours", 45 → "45 minutes". */
function replyTarget(minutes: number): string {
  if (minutes === 60) return "an hour";
  if (minutes % 60 === 0) return `${minutes / 60} hours`;
  return `${minutes} minutes`;
}

type LeadsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LeadsIndexPage({ searchParams }: LeadsPageProps) {
  const context = await requireStaff("/leads");
  const parameters = await searchParams;
  const filters = {
    stage: firstSearchValue(parameters.stage) ?? "",
    source: firstSearchValue(parameters.source) ?? "",
    q: firstSearchValue(parameters.q) ?? "",
  };
  const now = requestNow();

  let page: LeadsPage | null = null;
  try {
    page = await readLeads(context.token, filters);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  let settings: CrmSettings | null = null;
  try {
    settings = await readCrmSettings(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const names = await directoryOrEmpty(context.token);
  const sourceNames = new Map(
    (settings?.sources ?? []).map((source) => [source.key, source.label]),
  );
  const canWrite = hasCapability(context, "crm:write");

  const filterLink = (name: keyof typeof filters, value: string) => {
    const next = new URLSearchParams();
    for (const [key, current] of Object.entries(filters)) {
      const chosen = key === name ? value : current;
      if (chosen) next.set(key, chosen);
    }
    const rendered = next.toString();
    return rendered ? `/leads?${rendered}` : "/leads";
  };

  const counts = page?.counts ?? {};
  const target = page?.first_reply_target_minutes ?? 60;

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Leads"
        description={`Everyone who asked. The first reply is owed within ${replyTarget(target)}; the longest wait sorts first.`}
        actions={
          canWrite && settings ? (
            <Popover label="Add lead" variant="primary">
              <LeadCreateForm action={createLeadAction} sources={settings.sources} />
            </Popover>
          ) : undefined
        }
      />
      <LiveRefresh intervalSeconds={60} label="Leads" />
      {page === null ? (
        <Callout tone="danger" role="alert">
          Leads could not be read just now. This is a read failure, not an empty inbox.
        </Callout>
      ) : (
        <>
          <StatGrid columns={4} label="Lead funnel">
            <Stat
              label="First reply overdue"
              value={counts.first_reply_overdue ?? 0}
              tone={(counts.first_reply_overdue ?? 0) > 0 ? "danger" : "default"}
            />
            <Stat label="New" value={counts.new ?? 0} />
            <Stat
              label="In conversation"
              value={(counts.attempting ?? 0) + (counts.connected ?? 0)}
              hint={`${counts.attempting ?? 0} attempting · ${counts.connected ?? 0} connected`}
            />
            <Stat
              label="Qualified"
              value={counts.qualified ?? 0}
              hint={`${counts.disqualified ?? 0} disqualified`}
            />
          </StatGrid>

          <nav className="filter-strip" aria-label="Lead filters">
            <span className="eyebrow">Stage</span>
            <Link
              href={filterLink("stage", "")}
              aria-current={filters.stage === "" ? "page" : undefined}
            >
              All
            </Link>
            {LEAD_STAGES.map((stage) => (
              <Link
                key={stage}
                href={filterLink("stage", stage)}
                aria-current={filters.stage === stage ? "page" : undefined}
              >
                {LEAD_STAGE_LABELS[stage]}
              </Link>
            ))}
            <form className="filter-strip__search" action="/leads" role="search">
              {filters.stage && <input type="hidden" name="stage" value={filters.stage} />}
              {settings && (
                <>
                  <label className="sr-only" htmlFor="leads-source">
                    Source
                  </label>
                  <select
                    id="leads-source"
                    className="select select--small"
                    name="source"
                    defaultValue={filters.source}
                  >
                    <option value="">Any source</option>
                    {settings.sources.map((source) => (
                      <option key={source.key} value={source.key}>
                        {source.label}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <label className="sr-only" htmlFor="leads-q">
                Search leads
              </label>
              <input
                id="leads-q"
                className="input input--small"
                name="q"
                defaultValue={filters.q}
                placeholder="Name, email or firm"
              />
              <button className="btn btn--small" type="submit">
                Filter
              </button>
            </form>
          </nav>

          <DataTable
            caption="Leads"
            columns={COLUMNS}
            isEmpty={page.leads.length === 0}
            empty={
              <EmptyState
                title={Object.values(filters).some(Boolean) ? "Nothing matches" : "No leads yet"}
                description={
                  Object.values(filters).some(Boolean)
                    ? "No lead matches these filters."
                    : "Early-access and contact forms on the website land here the moment they are sent."
                }
              />
            }
          >
            {page.leads.map((lead) => (
              <tr
                key={lead.lead_id}
                className={lead.stage === "disqualified" ? "row--muted" : undefined}
              >
                <td>
                  <Link className="table-title" href={`/leads/${lead.lead_id}`}>
                    {lead.full_name || lead.email || "Unnamed lead"}
                  </Link>
                  <span className="table-sub">
                    {[lead.email, lead.company_name].filter(Boolean).join(" · ") ||
                      "No contact details"}
                  </span>
                </td>
                <td>{sourceLabel(lead.source_key, sourceNames)}</td>
                <td>
                  <LeadStagePill stage={lead.stage} />
                </td>
                <td>
                  <FirstReplyClock
                    firstRepliedAt={lead.first_replied_at}
                    waitingMinutes={lead.waiting_minutes}
                    overdue={lead.first_reply_overdue}
                    targetMinutes={target}
                  />
                </td>
                <td>
                  {lead.owner_staff_id ? (
                    (names.get(lead.owner_staff_id)?.display_name ?? "—")
                  ) : (
                    <span className="table-sub">Unowned</span>
                  )}
                </td>
                <td>
                  <Timestamp value={lead.created_at} now={now} mode="relative" />
                </td>
              </tr>
            ))}
          </DataTable>
        </>
      )}
    </>
  );
}
