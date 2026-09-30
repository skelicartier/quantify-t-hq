import Link from "next/link";
import { AiFilterBox } from "@/components/ai/ai-assist";
import { filterAction } from "@/app/(portal)/_actions/ai";
import { Fragment } from "react";

import { moveDealStageAction } from "@/app/(portal)/deals/actions";
import { DealBoard } from "@/components/crm/deal-board";
import { DealFlags, DealStatusPill, DueChip } from "@/components/crm/pills";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { PipelineTabs } from "@/components/deals/pipeline-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { bulkUndoAction, bulkUpdateAction } from "@/app/(portal)/_actions/bulk";
import { CategoryRow, DataTable, SelectCell, tableIdFor } from "@/components/ui/data-table";
import { FilterBuilder } from "@/components/lists/filter-builder";
import { FilterChips } from "@/components/ui/filter-chips";
import { SelectionBar } from "@/components/ui/selection-bar";
import { ViewTabs } from "@/components/ui/view-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Stat, StatGrid } from "@/components/ui/stat";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readDealsBoard, type BoardColumn, type DealsBoard } from "@/lib/api/deals";
import { directoryOrNull, nameFor } from "@/lib/api/staff";
import { isoDay, isoDayPlus } from "@/lib/crm/dates";
import { LOSS_REASON_LABELS } from "@/lib/crm/vocabulary";
import { formatMoney, formatMrr, formatMrrBy } from "@/lib/format";
import { requestNow } from "@/lib/request-time";
import {
  applyFilters,
  describeFilter,
  parseFilters,
  serializeFilter,
  type FilterField,
} from "@/lib/lists/filters";
import { parseSort, serializeSort, sortHrefBuilder, sortRows } from "@/lib/lists/sort";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Deals" };
export const dynamic = "force-dynamic";

const STATUSES = [
  ["open", "Open"],
  ["won", "Won"],
  ["lost", "Lost"],
  ["all", "Everything"],
] as const;

const TABLE_COLUMNS = [
  { key: "deal", sortable: true, label: "Deal" },
  { key: "stage", sortable: true, label: "Stage" },
  { key: "value", sortable: true, label: "Monthly value", align: "end" as const },
  { key: "weighted", sortable: true, label: "Weighted", align: "end" as const },
  { key: "next", sortable: true, label: "Next step" },
  { key: "owner", sortable: true, label: "Owner" },
  { key: "age", sortable: true, label: "In stage", align: "end" as const },
];

const GROUPS: Record<string, string> = { stage: "Stage", owner: "Owner" };

type DealRow = BoardColumn["deals"][number];

type DealsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DealsPage({ searchParams }: DealsPageProps) {
  const context = await requireStaff("/deals");
  const parameters = await searchParams;
  const requested = firstSearchValue(parameters.status) ?? "open";
  const status = STATUSES.some(([value]) => value === requested) ? requested : "open";
  // Won and Lost are lists, not a pipeline: they open as the table unless the board is asked for.
  const defaultView = (forStatus: string) => (forStatus === "open" ? "board" : "table");
  const requestedView = firstSearchValue(parameters.view);
  const view =
    requestedView === "table" || requestedView === "board" ? requestedView : defaultView(status);
  const sort = parseSort(
    firstSearchValue(parameters.sort),
    TABLE_COLUMNS.map((column) => column.key),
  );
  const now = requestNow();
  const today = isoDay(now);

  let board: DealsBoard | null = null;
  try {
    board = await readDealsBoard(context.token, status);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const names = await directoryOrNull(context.token);

  const group = GROUPS[firstSearchValue(parameters.group) ?? ""]
    ? (firstSearchValue(parameters.group) ?? "")
    : "";
  const filterParams = parameters.f;
  const rawFilters =
    filterParams === undefined ? [] : Array.isArray(filterParams) ? filterParams : [filterParams];
  // Grouping and conditions belong to the table; the board keeps its own shape.
  const link = (
    next: { status?: string; view?: string; group?: string },
    conditions?: readonly string[],
  ) => {
    const query = new URLSearchParams();
    const chosenStatus = next.status ?? status;
    const chosenView = next.view ?? view;
    const chosenGroup = next.group ?? group;
    if (chosenStatus !== "open") query.set("status", chosenStatus);
    if (chosenView !== defaultView(chosenStatus)) query.set("view", chosenView);
    if (chosenView === "table" && sort) query.set("sort", serializeSort(sort));
    if (chosenView === "table" && chosenGroup) query.set("group", chosenGroup);
    if (chosenView === "table")
      for (const condition of conditions ?? rawFilters) query.append("f", condition);
    const rendered = query.toString();
    return rendered ? `/deals?${rendered}` : "/deals";
  };
  const currentQuery = link({}).split("?")[1] ?? "";
  const peek = firstSearchValue(parameters.peek) ?? "";
  const canMoveDeals = hasCapability(context, "deals:write");
  const filterFields: FilterField[] = [
    {
      key: "stage",
      label: "Stage",
      kind: "choice",
      choices: (board?.columns ?? []).map((column) => ({ value: column.key, label: column.label })),
    },
    { key: "owner", label: "Owner", kind: "text" },
    { key: "company", label: "Company", kind: "text" },
    { key: "value", label: "Monthly value", kind: "number" },
    { key: "weighted", label: "Weighted", kind: "number" },
    { key: "age", label: "Days in stage", kind: "number" },
    { key: "idle", label: "Days quiet", kind: "number" },
    { key: "next", label: "Next step", kind: "text" },
    { key: "due", label: "Next step due", kind: "text" },
    { key: "flags", label: "Flags", kind: "text" },
  ];
  const conditions = parseFilters(filterParams, filterFields);
  const readField = (deal: DealRow, field: string): string | number | null => {
    switch (field) {
      case "stage":
        return deal.stage_key;
      case "owner":
        return deal.owner_staff_id ? nameFor(names, deal.owner_staff_id) : "";
      case "company":
        return deal.company_name || deal.name;
      case "value":
        return deal.mrr_amount;
      case "weighted":
        return deal.weighted_mrr;
      case "age":
        return deal.days_in_stage;
      case "idle":
        return deal.idle_days;
      case "next":
        return deal.next_step;
      case "due":
        return deal.next_step_due;
      case "flags":
        return deal.flags.join(",");
      default:
        return null;
    }
  };
  const rows = sortRows(
    applyFilters(
      (board?.columns ?? []).flatMap((column) => column.deals),
      conditions,
      readField,
    ),
    sort,
    {
      deal: (deal) => deal.company_name || deal.name,
      stage: (deal) => deal.stage_label,
      value: (deal) => deal.mrr_amount,
      weighted: (deal) => (deal.status === "open" ? deal.weighted_mrr : null),
      next: (deal) => deal.next_step_due || null,
      owner: (deal) => (deal.owner_staff_id ? nameFor(names, deal.owner_staff_id) : null),
      age: (deal) => (deal.status === "open" ? deal.days_in_stage : null),
    },
  );
  const staffChoices = [...(names ?? new Map()).values()]
    .filter((entry) => entry.is_active)
    .map((entry) => ({ value: entry.staff_id, label: entry.display_name }));
  const groupLabel = (deal: DealRow): string => {
    switch (group) {
      case "stage":
        return deal.status === "won" ? "Won" : deal.status === "lost" ? "Lost" : deal.stage_label;
      case "owner":
        return deal.owner_staff_id ? nameFor(names, deal.owner_staff_id) : "Unowned";
      default:
        return "";
    }
  };
  const grouped = group
    ? [...rows].sort((a, b) => groupLabel(a).localeCompare(groupLabel(b)))
    : rows;
  const columnCount = TABLE_COLUMNS.length + (canMoveDeals ? 1 : 0);

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Deals"
        description="Every open deal names its next step and a date. Deals quiet for 14 days, or past their stage's limit with no step on the calendar, are flagged."
        actions={<PipelineTabs current="/deals" />}
      />
      <LiveRefresh intervalSeconds={120} label="Pipeline" />
      {board === null ? (
        <Callout tone="danger" role="alert">
          The pipeline could not be read just now. This is a read failure, not an empty pipeline.
        </Callout>
      ) : (
        <>
          <StatGrid columns={4} label="Pipeline">
            <Stat
              label="Open pipeline"
              value={formatMrrBy(board.totals.open_mrr)}
              text
              hint={`${board.totals.open_count} open ${board.totals.open_count === 1 ? "deal" : "deals"}`}
            />
            <Stat
              label="Weighted"
              value={formatMrrBy(board.totals.weighted_mrr)}
              text
              hint="Value × stage probability"
            />
            <Stat
              label="Stuck or neglected"
              value={board.attention.rotting + board.attention.neglected}
              tone={board.attention.rotting + board.attention.neglected > 0 ? "danger" : "default"}
              hint={`${board.attention.rotting} stuck · ${board.attention.neglected} neglected`}
            />
            <Stat
              label="No live next step"
              value={board.attention.no_next_step}
              tone={board.attention.no_next_step > 0 ? "danger" : "default"}
            />
          </StatGrid>

          <nav className="filter-strip" aria-label="Deal filters">
            <span className="eyebrow">Show</span>
            {STATUSES.map(([value, label]) => (
              <Link
                key={value}
                href={link({ status: value })}
                aria-current={status === value ? "page" : undefined}
              >
                {label}
              </Link>
            ))}
            <span className="eyebrow">View</span>
            <Link
              href={link({ view: "board" })}
              aria-current={view === "board" ? "page" : undefined}
            >
              Board
            </Link>
            <Link
              href={link({ view: "table" })}
              aria-current={view === "table" ? "page" : undefined}
            >
              Table
            </Link>
            <span className="filter-strip__note">
              New deals open from a company page, or when a lead is qualified.
            </span>
          </nav>

          {view === "board" ? (
            rows.length === 0 && status === "open" ? (
              <EmptyState
                title="No open deals"
                description="Qualify a lead, or open a deal from a company page."
              />
            ) : (
              <DealBoard
                columns={board.columns}
                today={today}
                defaultDue={isoDayPlus(now, 3)}
                names={
                  names === null
                    ? null
                    : Object.fromEntries(
                        [...names.values()].map((entry) => [entry.staff_id, entry.display_name]),
                      )
                }
                moveAction={hasCapability(context, "deals:write") ? moveDealStageAction : undefined}
              />
            )
          ) : (
            <>
              <FilterChips
                clearHref={link({ group: "" }, [])}
                chips={[
                  ...conditions.map((condition, index) => ({
                    key: `f-${index}`,
                    label: "Filter",
                    value: describeFilter(condition, filterFields),
                    removeHref: link(
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
                          removeHref: link({ group: "" }),
                        },
                      ]
                    : []),
                ]}
              />
              {context.me.ai?.features.includes("filters") && (
                <AiFilterBox list="deals" fields={filterFields} action={filterAction} />
              )}
              <div className="list-tools" aria-label="List tools">
                <FilterBuilder
                  fields={filterFields}
                  basePath="/deals"
                  currentQuery={currentQuery}
                />
                <nav className="list-tools__group" aria-label="Group rows">
                  <span className="list-tools__label">Group by</span>
                  <Link href={link({ group: "" })} aria-current={group === "" ? "page" : undefined}>
                    None
                  </Link>
                  {Object.entries(GROUPS).map(([key, label]) => (
                    <Link
                      key={key}
                      href={link({ group: key })}
                      aria-current={group === key ? "page" : undefined}
                    >
                      {label}
                    </Link>
                  ))}
                </nav>
              </div>
              <ViewTabs
                token={context.token}
                listKey="deals"
                basePath="/deals"
                currentQuery={currentQuery}
              />
              {canMoveDeals && (
                <SelectionBar
                  tableId={tableIdFor("Deals")}
                  kind="deals"
                  noun={["deal", "deals"]}
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
                caption="Deals"
                columns={TABLE_COLUMNS}
                sort={sort}
                sortHref={sortHrefBuilder(
                  "/deals",
                  {
                    status: status !== "open" ? status : "",
                    view: view !== defaultView(status) ? view : "",
                    sort: serializeSort(sort),
                    group,
                  },
                  sort,
                )}
                selectable={canMoveDeals}
                isEmpty={rows.length === 0}
                empty={<EmptyState title="Nothing here" description="No deals match this view." />}
              >
                {grouped.map((deal, index) => (
                  <Fragment key={deal.deal_id}>
                    {group &&
                      (index === 0 || groupLabel(grouped[index - 1]!) !== groupLabel(deal)) && (
                        <CategoryRow
                          span={columnCount}
                          label={`${groupLabel(deal)} · ${grouped.filter((other) => groupLabel(other) === groupLabel(deal)).length}`}
                        />
                      )}
                    <tr
                      data-peek-href={`${link({})}${link({}).includes("?") ? "&" : "?"}peek=${deal.deal_id}`}
                      data-active={peek === deal.deal_id ? "" : undefined}
                      className={deal.status === "open" ? undefined : "row--muted"}
                    >
                      {canMoveDeals && (
                        <SelectCell id={deal.deal_id} label={deal.company_name || deal.name} />
                      )}
                      <td>
                        <Link className="table-title" href={`/deals/${deal.deal_id}`}>
                          {deal.company_name || deal.name}
                        </Link>
                        <span className="table-sub">{deal.name}</span>
                        <DealFlags
                          flags={deal.flags}
                          idleDays={deal.idle_days}
                          daysInStage={deal.days_in_stage}
                        />
                      </td>
                      <td>
                        {deal.status === "open" ? (
                          deal.stage_label
                        ) : (
                          <DealStatusPill status={deal.status} />
                        )}
                        {deal.loss_reason && (
                          <span className="table-sub">
                            {LOSS_REASON_LABELS[deal.loss_reason] ?? deal.loss_reason}
                          </span>
                        )}
                      </td>
                      <td className="data-table__num">
                        {formatMrr(deal.mrr_amount, deal.currency)}
                      </td>
                      <td className="data-table__num">
                        {deal.status === "open"
                          ? formatMoney(deal.weighted_mrr, deal.currency)
                          : "—"}
                      </td>
                      <td>
                        {deal.status === "open" ? (
                          <>
                            {deal.next_step || <span className="table-sub">None</span>}
                            {deal.next_step && (
                              <span className="table-sub">
                                <DueChip due={deal.next_step_due} today={today} />
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="table-sub">—</span>
                        )}
                      </td>
                      <td>
                        {deal.owner_staff_id ? nameFor(names, deal.owner_staff_id) : "Unowned"}
                      </td>
                      <td className="data-table__num">
                        {deal.status === "open" ? `${deal.days_in_stage}d` : "—"}
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </DataTable>
            </>
          )}
        </>
      )}
    </>
  );
}
