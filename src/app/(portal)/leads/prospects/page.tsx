import Link from "next/link";

import { bulkUndoAction, bulkUpdateAction } from "@/app/(portal)/_actions/bulk";
import { bulkProspectsAction, saveViewSegmentAction } from "@/app/(portal)/leads/actions";
import { FacetPanel } from "@/components/crm/facet-panel";
import { LeadTabs } from "@/components/crm/lead-tabs";
import { LeadStagePill } from "@/components/crm/pills";
import { AddressKind, FitPill } from "@/components/crm/prospect-pills";
import { BulkViewForm, SaveSegmentForm } from "@/components/crm/prospect-tools";
import { FilterBuilder } from "@/components/lists/filter-builder";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable, SelectCell, tableIdFor } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { Popover } from "@/components/ui/popover";
import { SelectionBar } from "@/components/ui/selection-bar";
import { Stat, StatGrid } from "@/components/ui/stat";
import { ViewTabs } from "@/components/ui/view-tabs";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCrmSettings, readLeads, type CrmSettings, type LeadsPage } from "@/lib/api/crm";
import { directoryOrNull, nameFor } from "@/lib/api/staff";
import { PROSPECT_SORTS, prospectFilterFields } from "@/lib/crm/prospects";
import { LEAD_STAGES, LEAD_STAGE_LABELS } from "@/lib/crm/vocabulary";
import { formatNumber } from "@/lib/format";
import { describeFilter, parseFilters, serializeFilter } from "@/lib/lists/filters";
import { nextSort, parseSort, serializeSort } from "@/lib/lists/sort";
import { boundedInteger, firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Prospects" };
export const dynamic = "force-dynamic";

const BASE = "/leads/prospects";
const PAGE_SIZE = 100;

const COLUMNS = [
  // The three columns that hold sentences get the room; the rest are a word or two wide.
  { key: "lead", sortable: true, label: "Lead", width: "23%" },
  { key: "firm", sortable: true, label: "Firm", width: "18%" },
  { key: "type", sortable: true, label: "Type" },
  { key: "country", sortable: true, label: "Country" },
  { key: "title", label: "Title", width: "17%" },
  { key: "address", label: "Address" },
  { key: "fit", sortable: true, label: "Fit" },
  { key: "stage", sortable: true, label: "Stage" },
  { key: "owner", sortable: true, label: "Owner" },
];

type ProspectsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function facetCount(page: LeadsPage, field: string, value: string): number {
  return page.facets[field]?.find((entry) => entry.value === value)?.count ?? 0;
}

export default async function ProspectsPage({ searchParams }: ProspectsPageProps) {
  const context = await requireStaff(BASE);
  const parameters = await searchParams;
  const stage = firstSearchValue(parameters.stage) ?? "";
  const q = firstSearchValue(parameters.q) ?? "";
  const sort = parseSort(firstSearchValue(parameters.sort), Object.keys(PROSPECT_SORTS));
  const offset = boundedInteger(firstSearchValue(parameters.offset), 0, 10_000_000);

  let settings: CrmSettings | null = null;
  try {
    settings = await readCrmSettings(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const filterFields = prospectFilterFields(LEAD_STAGE_LABELS, [
    ...(settings?.sources ?? []),
    ...(settings?.archived_sources ?? []),
  ]);
  // A condition the list does not know is dropped here, so a stale link shows the list
  // without it instead of an error.
  const conditions = parseFilters(parameters.f, filterFields);
  const conditionStrings = conditions.map(serializeFilter);

  let page: LeadsPage | null = null;
  try {
    page = await readLeads(context.token, {
      origin: "prospect",
      stage,
      q,
      sort: sort ? `${PROSPECT_SORTS[sort.key]}${sort.dir === "desc" ? ":desc" : ""}` : "",
      limit: PAGE_SIZE,
      offset,
      conditions: conditionStrings,
    });
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const names = await directoryOrNull(context.token);
  const canWrite = hasCapability(context, "crm:write");

  const query = { stage, q, sort: serializeSort(sort) };
  const listHref = (
    over: Partial<typeof query> = {},
    next: readonly string[] = conditionStrings,
    at = 0,
  ) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, ...over }))
      if (value) params.set(key, value);
    for (const condition of next) params.append("f", condition);
    if (at > 0) params.set("offset", String(at));
    const rendered = params.toString();
    return rendered ? `${BASE}?${rendered}` : BASE;
  };
  const currentQuery = listHref().split("?")[1] ?? "";

  // A facet row narrows the view to its value, or releases it when it is the one applied.
  const facetCondition = (field: string, value: string) =>
    value === "" ? `${field}:empty:` : `${field}:${field === "tags" ? "has" : "is"}:${value}`;
  const isActive = (field: string, value: string) =>
    field === "stage" && !conditionStrings.some((item) => item.startsWith("stage:"))
      ? stage === value
      : conditionStrings.includes(facetCondition(field, value));
  const facetHref = (field: string, value: string) => {
    const wanted = facetCondition(field, value);
    if (conditionStrings.includes(wanted))
      return listHref(
        {},
        conditionStrings.filter((item) => item !== wanted),
      );
    if (field === "stage" && stage === value) return listHref({ stage: "" });
    // One value of a field at a time: a second "is" on the same field would match nobody.
    const others = conditionStrings.filter(
      (item) => !(item.startsWith(`${field}:is:`) || item.startsWith(`${field}:empty:`)),
    );
    return listHref(field === "stage" ? { stage: "" } : {}, [...others, wanted].slice(0, 8));
  };

  const staffChoices = [...(names ?? new Map()).values()]
    .filter((entry) => entry.is_active)
    .map((entry) => ({ value: entry.staff_id, label: entry.display_name }));
  const counts = page?.counts ?? {};
  const inTable = LEAD_STAGES.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
  const filtered = Boolean(stage || q || conditions.length);

  // The view as a segment asks it: the conditions, plus the stage when one is chosen.
  const segmentConditions = [
    "origin:is:prospect",
    ...conditionStrings,
    ...(stage && !conditionStrings.some((item) => item.startsWith("stage:"))
      ? [`stage:is:${stage}`]
      : []),
  ];
  const suggestedName =
    conditions
      .filter((condition) => ["is", "has", "in"].includes(condition.op))
      .map((condition) => condition.value)
      .join(" · ")
      .slice(0, 100) || "Prospects";

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Prospects"
        description="People the team found on public registers and firms' own pages. Nobody here is waiting on a reply; filter, organise, and mail a group when it is ready. Best fit sorts first."
        meta={
          page ? <span className="quiet">{formatNumber(inTable)} in the table</span> : undefined
        }
        actions={
          <>
            <LeadTabs current={BASE} />
            {canWrite && (
              <ButtonLink href="/leads/import" size="small" variant="primary">
                Import a file
              </ButtonLink>
            )}
          </>
        }
      />
      {page === null ? (
        <Callout tone="danger" role="alert">
          Prospects could not be read just now. This is a read failure, not an empty list.
        </Callout>
      ) : (
        <>
          <StatGrid columns={6} label="This view">
            <Stat
              label="In this view"
              value={formatNumber(page.total)}
              hint={filtered ? `of ${formatNumber(inTable)}` : "everyone"}
            />
            <Stat label="Best fit" value={formatNumber(facetCount(page, "fit_band", "A"))} />
            <Stat
              label="Named people"
              value={formatNumber(facetCount(page, "email_kind", "named"))}
            />
            <Stat
              label="Shared mailboxes"
              value={formatNumber(facetCount(page, "email_kind", "role"))}
            />
            <Stat
              label="Not yet worked"
              value={formatNumber(facetCount(page, "stage", "new"))}
              hint="still new"
            />
            <Stat
              label="Verified valid"
              value={formatNumber(facetCount(page, "verified", "valid"))}
              hint={`${formatNumber(facetCount(page, "verified", "unchecked"))} unchecked`}
            />
          </StatGrid>

          <nav className="filter-strip" aria-label="Prospect filters">
            <span className="eyebrow">Stage</span>
            <Link href={listHref({ stage: "" })} aria-current={stage === "" ? "page" : undefined}>
              All
            </Link>
            {LEAD_STAGES.map((key) => (
              <Link
                key={key}
                href={listHref({ stage: key })}
                aria-current={stage === key ? "page" : undefined}
              >
                {LEAD_STAGE_LABELS[key]}
              </Link>
            ))}
            <form className="filter-strip__search" action={BASE} role="search">
              {stage && <input type="hidden" name="stage" value={stage} />}
              {query.sort && <input type="hidden" name="sort" value={query.sort} />}
              {conditionStrings.map((condition) => (
                <input key={condition} type="hidden" name="f" value={condition} />
              ))}
              <label className="sr-only" htmlFor="prospects-q">
                Search prospects
              </label>
              <input
                id="prospects-q"
                className="input input--small"
                name="q"
                defaultValue={q}
                placeholder="Name, email, firm, title or place"
              />
              <button className="btn btn--small" type="submit">
                Search
              </button>
            </form>
          </nav>

          <FilterChips
            clearHref={BASE}
            chips={[
              ...(q
                ? [{ key: "q", label: "Search", value: q, removeHref: listHref({ q: "" }) }]
                : []),
              ...(stage
                ? [
                    {
                      key: "stage",
                      label: "Stage",
                      value: LEAD_STAGE_LABELS[stage] ?? stage,
                      removeHref: listHref({ stage: "" }),
                    },
                  ]
                : []),
              ...conditions.map((condition, index) => ({
                key: `f-${index}`,
                label: "Filter",
                value: describeFilter(condition, filterFields),
                removeHref: listHref(
                  {},
                  conditionStrings.filter((_, other) => other !== index),
                ),
              })),
            ]}
          />

          <FacetPanel
            facets={page.facets}
            total={page.total}
            stageLabels={LEAD_STAGE_LABELS}
            hrefFor={facetHref}
            isActive={isActive}
          />

          <div className="list-tools" aria-label="List tools">
            <FilterBuilder fields={filterFields} basePath={BASE} currentQuery={currentQuery} />
            {canWrite && page.total > 0 && (
              <div className="list-tools__group">
                <Popover label="Save as a segment · mail it" align="end" width="wide">
                  <SaveSegmentForm
                    action={saveViewSegmentAction}
                    conditions={segmentConditions}
                    suggestedName={suggestedName}
                    total={page.total}
                    blocked={
                      q
                        ? "A segment is built from filters, and search text is not one. Clear the search, or add a filter that says the same thing, then save."
                        : segmentConditions.length > 8
                          ? "A segment holds at most eight conditions; remove one first."
                          : null
                    }
                  />
                </Popover>
                <Popover label="Change the whole view" align="end" width="wide">
                  {filtered ? (
                    <BulkViewForm
                      action={bulkProspectsAction}
                      conditions={conditionStrings}
                      q={q}
                      stage={stage}
                      total={page.total}
                      staff={staffChoices}
                    />
                  ) : (
                    <p className="page-note">
                      Filter the list first. A change to every prospect at once is not offered; a
                      change to a filtered view is.
                    </p>
                  )}
                </Popover>
              </div>
            )}
          </div>
          <ViewTabs
            token={context.token}
            listKey="prospects"
            basePath={BASE}
            currentQuery={currentQuery}
          />
          {canWrite && (
            <SelectionBar
              tableId={tableIdFor("Prospects")}
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
            caption="Prospects"
            columns={COLUMNS}
            sort={sort}
            sortHref={(key) => listHref({ sort: serializeSort(nextSort(sort, key)) })}
            selectable={canWrite}
            isEmpty={page.leads.length === 0}
            empty={
              <EmptyState
                title={filtered ? "Nothing matches" : "No prospects yet"}
                description={
                  filtered
                    ? "No prospect matches these filters."
                    : "Bring in a researched list: a CSV with an email column and whatever else it has."
                }
                action={
                  !filtered && canWrite ? (
                    <ButtonLink href="/leads/import" size="small" variant="primary">
                      Import a file
                    </ButtonLink>
                  ) : undefined
                }
              />
            }
          >
            {page.leads.map((lead) => (
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
                  {lead.full_name && <span className="table-sub prospect-email">{lead.email}</span>}
                </td>
                <td>{lead.company_name || <span className="table-sub">Not given</span>}</td>
                <td className="nowrap">
                  {lead.firm_type || <span className="table-sub">Not given</span>}
                </td>
                <td className="nowrap">
                  {lead.country || <span className="table-sub">Not given</span>}
                  {lead.city && <span className="table-sub">{lead.city}</span>}
                </td>
                <td>{lead.title || <span className="table-sub">Not given</span>}</td>
                <td className="nowrap">
                  <AddressKind kind={lead.email_kind} verified={lead.verified_state} />
                </td>
                <td className="nowrap">
                  <FitPill band={lead.fit_band} score={lead.fit_score} />
                </td>
                <td className="nowrap">
                  <LeadStagePill stage={lead.stage} />
                </td>
                <td className="nowrap">
                  {lead.owner_staff_id ? (
                    nameFor(names, lead.owner_staff_id)
                  ) : (
                    <span className="table-sub">Unowned</span>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
          {page.total > 0 && (
            <nav className="pagination" aria-label="Pagination">
              <span className="toolbar__summary">
                {formatNumber(page.offset + 1)}–{formatNumber(page.offset + page.leads.length)} of{" "}
                {formatNumber(page.total)}
              </span>
              {page.offset > 0 && (
                <ButtonLink
                  size="small"
                  href={listHref({}, conditionStrings, Math.max(0, page.offset - PAGE_SIZE))}
                >
                  Previous
                </ButtonLink>
              )}
              {page.has_more && (
                <ButtonLink
                  size="small"
                  href={listHref({}, conditionStrings, page.offset + PAGE_SIZE)}
                >
                  Next
                </ButtonLink>
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}
