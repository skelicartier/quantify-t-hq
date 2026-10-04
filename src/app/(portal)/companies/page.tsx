import { companyFilterFields } from "@/lib/lists/definitions";
import { COMPANY_GROUPS, companiesView, companyGroupLabel } from "@/lib/lists/views";
import { CustomFieldInputs } from "@/components/platform/custom-field-inputs";
import type { CustomField } from "@/lib/api/fields";
import Link from "next/link";
import { AiFilterBox } from "@/components/ai/ai-assist";
import { filterAction } from "@/app/(portal)/_actions/ai";
import { Fragment } from "react";

import { createCompanyAction } from "@/app/(portal)/companies/actions";
import { CompanyCreateForm } from "@/components/crm/company-forms";
import { LifecyclePill } from "@/components/crm/pills";
import { bulkUndoAction, bulkUpdateAction } from "@/app/(portal)/_actions/bulk";
import { DocumentTools } from "@/components/documents/document-tools";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { CategoryRow, DataTable, SelectCell, tableIdFor } from "@/components/ui/data-table";
import { FilterBuilder } from "@/components/lists/filter-builder";
import { PeekPane } from "@/components/lists/peek-pane";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { Popover } from "@/components/ui/popover";
import { SelectionBar } from "@/components/ui/selection-bar";
import { ViewTabs } from "@/components/ui/view-tabs";
import { Stat, StatGrid } from "@/components/ui/stat";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCompanies, type CompanyRow } from "@/lib/api/crm";
import { directoryOrNull, nameFor } from "@/lib/api/staff";
import { LIFECYCLES, LIFECYCLE_LABELS } from "@/lib/crm/vocabulary";
import { formatMrrBy, sumMoneyByCurrency } from "@/lib/format";
import { describeFilter, parseFilters, serializeFilter } from "@/lib/lists/filters";
import { parseSort, serializeSort, sortHrefBuilder } from "@/lib/lists/sort";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Companies" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "company", sortable: true, label: "Company" },
  { key: "lifecycle", sortable: true, label: "Lifecycle" },
  { key: "type", sortable: true, label: "Type" },
  { key: "people", sortable: true, label: "People", align: "end" as const },
  { key: "deals", sortable: true, label: "Open deals", align: "end" as const },
  { key: "mrr", sortable: true, label: "MRR", align: "end" as const },
  { key: "owner", sortable: true, label: "Owner" },
  { key: "updated", sortable: true, label: "Updated" },
];

const GROUPS = COMPANY_GROUPS;

type CompaniesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CompaniesPage({ searchParams }: CompaniesPageProps) {
  const context = await requireStaff("/companies");
  const parameters = await searchParams;
  const q = firstSearchValue(parameters.q) ?? "";
  const lifecycle = firstSearchValue(parameters.lifecycle) ?? "";
  const sort = parseSort(
    firstSearchValue(parameters.sort),
    COLUMNS.map((column) => column.key),
  );
  const group = GROUPS[firstSearchValue(parameters.group) ?? ""]
    ? (firstSearchValue(parameters.group) ?? "")
    : "";
  const peek = firstSearchValue(parameters.peek) ?? "";
  const now = requestNow();
  const query = { q, lifecycle, sort: serializeSort(sort), group };
  const filterParams = parameters.f;
  const listHref = (over: Partial<typeof query>, filters?: readonly string[]) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, ...over }))
      if (value) next.set(key, value);
    for (const condition of filters ?? rawFilters) next.append("f", condition);
    const rendered = next.toString();
    return rendered ? `/companies?${rendered}` : "/companies";
  };
  const rawFilters =
    filterParams === undefined ? [] : Array.isArray(filterParams) ? filterParams : [filterParams];
  const currentQuery = listHref({}).split("?")[1] ?? "";
  const peekHref = (id: string) => {
    const base = listHref({});
    return `${base}${base.includes("?") ? "&" : "?"}peek=${id}`;
  };

  let companies: CompanyRow[] | null = null;
  let customFields: CustomField[] = [];
  try {
    const listed = await readCompanies(context.token, q);
    companies = listed.companies;
    customFields = listed.custom_fields;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const names = await directoryOrNull(context.token);
  const canWrite = hasCapability(context, "crm:write");
  const filterFields = companyFilterFields({ custom_fields: customFields });
  const conditions = parseFilters(filterParams, filterFields);
  // The same rows, in the same order, as an export of this view writes.
  const { rows: visible, ordered: grouped } = companiesView(
    { companies: companies ?? [], custom_fields: customFields },
    parameters,
    names,
  );
  const staffChoices = [...(names ?? new Map()).values()]
    .filter((entry) => entry.is_active)
    .map((entry) => ({ value: entry.staff_id, label: entry.display_name }));
  const customers = (companies ?? []).filter((row) => row.lifecycle === "customer");
  // The service totals each company from the ledger; across companies we may only add
  // within a currency, and not at all when any figure is withheld from this role.
  const ledger = (companies ?? []).every((row) => row.mrr !== null)
    ? (companies ?? []).flatMap((row) =>
        Object.entries(row.mrr ?? {}).map(([currency, amount]) => ({ amount, currency })),
      )
    : null;
  const mrr = ledger === null ? null : sumMoneyByCurrency(ledger);
  const openDeals = (companies ?? []).reduce((sum, row) => sum + row.open_deals, 0);

  const lifecycleLink = (value: string) => listHref({ lifecycle: value });
  const groupLabel = (row: CompanyRow): string => companyGroupLabel(row, group, names);
  const columnCount = COLUMNS.length + (canWrite ? 1 : 0);

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Companies"
        description="Every firm we know, anchored on its web domain. Colleagues' leads join the same company."
        actions={
          <>
            <Link className="btn btn--small btn--ghost" href="/companies/duplicates">
              Duplicates
            </Link>
            <Link className="btn btn--small btn--ghost" href="/archive">
              Archived
            </Link>
            {canWrite && (
              <Link className="btn btn--small" href="/companies/import">
                Import
              </Link>
            )}
            {canWrite && (
              <Popover label="New company" variant="primary" defaultOpen={parameters.new === "1"}>
                <CompanyCreateForm
                  action={createCompanyAction}
                  extra={
                    <CustomFieldInputs
                      idPrefix="new-company"
                      fields={customFields.filter((field) => field.required)}
                    />
                  }
                />
              </Popover>
            )}
            <DocumentTools
              context={context}
              kind="companies"
              returnPath="/companies"
              view={
                q || lifecycle || conditions.length > 0
                  ? { query: currentQuery, count: visible.length }
                  : undefined
              }
            />
          </>
        }
      />
      {companies === null ? (
        <Callout tone="danger" role="alert">
          Companies could not be read just now. This is a read failure, not an empty book.
        </Callout>
      ) : (
        <>
          <StatGrid columns={4} label="The book">
            <Stat label="Companies" value={companies.length} />
            <Stat label="Customers" value={customers.length} />
            <Stat label="MRR" value={formatMrrBy(mrr)} text hint="From contracts, today" />
            <Stat label="Open deals" value={openDeals} />
          </StatGrid>
          <nav className="filter-strip" aria-label="Company filters">
            <span className="eyebrow">Lifecycle</span>
            <Link href={lifecycleLink("")} aria-current={lifecycle === "" ? "page" : undefined}>
              All
            </Link>
            {LIFECYCLES.map((value) => (
              <Link
                key={value}
                href={lifecycleLink(value)}
                aria-current={lifecycle === value ? "page" : undefined}
              >
                {LIFECYCLE_LABELS[value]}
              </Link>
            ))}
            <form className="filter-strip__search" action="/companies" role="search">
              {lifecycle && <input type="hidden" name="lifecycle" value={lifecycle} />}
              <label className="sr-only" htmlFor="companies-q">
                Search companies
              </label>
              <input
                id="companies-q"
                className="input input--small"
                name="q"
                defaultValue={q}
                placeholder="Name or domain"
              />
            </form>
          </nav>
          <FilterChips
            clearHref="/companies"
            chips={[
              ...(q
                ? [{ key: "q", label: "Search", value: q, removeHref: listHref({ q: "" }) }]
                : []),
              ...(lifecycle
                ? [
                    {
                      key: "lifecycle",
                      label: "Lifecycle",
                      value: LIFECYCLE_LABELS[lifecycle] ?? lifecycle,
                      removeHref: listHref({ lifecycle: "" }),
                    },
                  ]
                : []),
              ...conditions.map((condition, index) => ({
                key: `f-${index}`,
                label: "Filter",
                value: describeFilter(condition, filterFields),
                removeHref: listHref(
                  {},
                  conditions.filter((_, other) => other !== index).map(serializeFilter),
                ),
              })),
              ...(group
                ? [
                    {
                      key: "group",
                      label: "Grouped by",
                      value: GROUPS[group] ?? group,
                      removeHref: listHref({ group: "" }),
                    },
                  ]
                : []),
            ]}
          />
          {context.me.ai?.features.includes("filters") && (
            <AiFilterBox list="companies" fields={filterFields} action={filterAction} />
          )}
          <div className="list-tools" aria-label="List tools">
            <FilterBuilder
              fields={filterFields}
              basePath="/companies"
              currentQuery={currentQuery}
            />
            <nav className="list-tools__group" aria-label="Group rows">
              <span className="list-tools__label">Group by</span>
              <Link href={listHref({ group: "" })} aria-current={group === "" ? "page" : undefined}>
                None
              </Link>
              {Object.entries(GROUPS).map(([key, label]) => (
                <Link
                  key={key}
                  href={listHref({ group: key })}
                  aria-current={group === key ? "page" : undefined}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>
          <ViewTabs
            token={context.token}
            listKey="companies"
            basePath="/companies"
            currentQuery={currentQuery}
          />
          {canWrite && (
            <SelectionBar
              tableId={tableIdFor("Companies")}
              kind="companies"
              noun={["company", "companies"]}
              action={bulkUpdateAction}
              undoAction={bulkUndoAction}
              fields={[
                {
                  field: "owner_staff_id",
                  label: "Owner",
                  choices: [{ value: "", label: "Unowned" }, ...staffChoices],
                },
                {
                  field: "lifecycle",
                  label: "Lifecycle",
                  choices: LIFECYCLES.map((value) => ({
                    value,
                    label: LIFECYCLE_LABELS[value] ?? value,
                  })),
                },
              ]}
            />
          )}
          <DataTable
            caption="Companies"
            columns={COLUMNS}
            sort={sort}
            sortHref={sortHrefBuilder("/companies", query, sort)}
            selectable={canWrite}
            isEmpty={visible.length === 0}
            empty={
              <EmptyState
                title={q || lifecycle || conditions.length ? "Nothing matches" : "No companies yet"}
                description={
                  q || lifecycle || conditions.length
                    ? "No company matches these filters."
                    : "Companies are created when a lead is qualified, or by hand with New company."
                }
              />
            }
          >
            {grouped.map((row, index) => (
              <Fragment key={row.company_id}>
                {group && (index === 0 || groupLabel(grouped[index - 1]!) !== groupLabel(row)) && (
                  <CategoryRow
                    span={columnCount}
                    label={`${groupLabel(row)} · ${grouped.filter((other) => groupLabel(other) === groupLabel(row)).length}`}
                  />
                )}
                <tr
                  data-peek-href={peekHref(row.company_id)}
                  data-active={peek === row.company_id ? "" : undefined}
                >
                  {canWrite && <SelectCell id={row.company_id} label={row.name} />}
                  <td>
                    <Link className="table-title" href={`/companies/${row.company_id}`}>
                      {row.name}
                    </Link>
                    <span className="table-sub">{row.domain || "No domain"}</span>
                  </td>
                  <td>
                    <LifecyclePill lifecycle={row.lifecycle} />
                  </td>
                  <td>{row.firm_type || <span className="table-sub">—</span>}</td>
                  <td className="data-table__num">{row.people_count}</td>
                  <td className="data-table__num">{row.open_deals}</td>
                  <td className="data-table__num">{formatMrrBy(row.mrr)}</td>
                  <td>
                    {row.owner_staff_id ? (
                      nameFor(names, row.owner_staff_id)
                    ) : (
                      <span className="table-sub">Unowned</span>
                    )}
                  </td>
                  <td>
                    <Timestamp value={row.updated_at} now={now} mode="relative" />
                  </td>
                </tr>
              </Fragment>
            ))}
          </DataTable>
          {peek && (
            <PeekPane
              kind="company"
              id={peek}
              token={context.token}
              names={names}
              closeHref={listHref({})}
              now={now}
            />
          )}
        </>
      )}
    </>
  );
}
