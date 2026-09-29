import Link from "next/link";

import { createLeadAction } from "@/app/(portal)/leads/actions";
import { LeadCreateForm } from "@/components/crm/lead-forms";
import { FirstReplyClock, LeadStagePill } from "@/components/crm/pills";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { bulkUndoAction, bulkUpdateAction } from "@/app/(portal)/_actions/bulk";
import { DataTable, SelectCell, tableIdFor } from "@/components/ui/data-table";
import { FilterChips } from "@/components/ui/filter-chips";
import { SelectionBar } from "@/components/ui/selection-bar";
import { ViewTabs } from "@/components/ui/view-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Popover } from "@/components/ui/popover";
import { Stat, StatGrid } from "@/components/ui/stat";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCrmSettings, readLeads, type CrmSettings, type LeadsPage } from "@/lib/api/crm";
import { directoryOrNull, nameFor } from "@/lib/api/staff";
import { LEAD_STAGES, LEAD_STAGE_LABELS, sourceLabel, sourceNamesFrom } from "@/lib/crm/vocabulary";
import { requestNow } from "@/lib/request-time";
import { parseSort, serializeSort, sortHrefBuilder, sortRows } from "@/lib/lists/sort";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "lead", sortable: true, label: "Lead" },
  { key: "source", sortable: true, label: "Source" },
  { key: "stage", sortable: true, label: "Stage" },
  { key: "clock", sortable: true, label: "First reply" },
  { key: "owner", sortable: true, label: "Owner" },
  { key: "received", sortable: true, label: "Received" },
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
  const sort = parseSort(
    firstSearchValue(parameters.sort),
    COLUMNS.map((column) => column.key),
  );
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
  const names = await directoryOrNull(context.token);
  const sourceNames = sourceNamesFrom(settings);
  const canWrite = hasCapability(context, "crm:write");

  const query = { ...filters, sort: serializeSort(sort) };
  const filterLink = (name: keyof typeof filters, value: string) => {
    const next = new URLSearchParams();
    for (const [key, current] of Object.entries(query)) {
      const chosen = key === name ? value : current;
      if (chosen) next.set(key, chosen);
    }
    const rendered = next.toString();
    return rendered ? `/leads?${rendered}` : "/leads";
  };
  const currentQuery = filterLink("q", filters.q).split("?")[1] ?? "";
  const leads = sortRows(page?.leads ?? [], sort, {
    lead: (lead) => lead.full_name || lead.email,
    source: (lead) => sourceLabel(lead.source_key, sourceNames),
    stage: (lead) => LEAD_STAGES.indexOf(lead.stage as (typeof LEAD_STAGES)[number]),
    clock: (lead) => lead.waiting_minutes,
    owner: (lead) => (lead.owner_staff_id ? nameFor(names, lead.owner_staff_id) : null),
    received: (lead) => lead.created_at,
  });
  const staffChoices = [...(names ?? new Map()).values()]
    .filter((entry) => entry.is_active)
    .map((entry) => ({ value: entry.staff_id, label: entry.display_name }));

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
                    {settings.archived_sources.map((source) => (
                      <option key={source.key} value={source.key}>
                        {source.label} (archived)
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

          <FilterChips
            clearHref="/leads"
            chips={[
              ...(filters.q
                ? [{ key: "q", label: "Search", value: filters.q, removeHref: filterLink("q", "") }]
                : []),
              ...(filters.stage
                ? [
                    {
                      key: "stage",
                      label: "Stage",
                      value: LEAD_STAGE_LABELS[filters.stage] ?? filters.stage,
                      removeHref: filterLink("stage", ""),
                    },
                  ]
                : []),
              ...(filters.source
                ? [
                    {
                      key: "source",
                      label: "Source",
                      value: sourceLabel(filters.source, sourceNames),
                      removeHref: filterLink("source", ""),
                    },
                  ]
                : []),
            ]}
          />
          <ViewTabs
            token={context.token}
            listKey="leads"
            basePath="/leads"
            currentQuery={currentQuery}
          />
          {canWrite && (
            <SelectionBar
              tableId={tableIdFor("Leads")}
              kind="leads"
              noun={["lead", "leads"]}
              action={bulkUpdateAction}
              undoAction={bulkUndoAction}
              fields={[
                {
                  field: "owner_staff_id",
                  label: "Owner",
                  choices: [{ value: "", label: "Unowned" }, ...staffChoices],
                },
              ]}
            />
          )}
          <DataTable
            caption="Leads"
            columns={COLUMNS}
            sort={sort}
            sortHref={sortHrefBuilder("/leads", query, sort)}
            selectable={canWrite}
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
            {leads.map((lead) => (
              <tr
                key={lead.lead_id}
                className={lead.stage === "disqualified" ? "row--muted" : undefined}
              >
                {canWrite && (
                  <SelectCell id={lead.lead_id} label={lead.full_name || lead.email || "lead"} />
                )}
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
                    nameFor(names, lead.owner_staff_id)
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
