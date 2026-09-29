import Link from "next/link";

import { moveDealStageAction } from "@/app/(portal)/deals/actions";
import { DealBoard } from "@/components/crm/deal-board";
import { DealFlags, DealStatusPill, DueChip } from "@/components/crm/pills";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { bulkUpdateAction } from "@/app/(portal)/_actions/bulk";
import { DataTable, SelectCell, tableIdFor } from "@/components/ui/data-table";
import { SelectionBar } from "@/components/ui/selection-bar";
import { ViewTabs } from "@/components/ui/view-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Stat, StatGrid } from "@/components/ui/stat";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readDealsBoard, type DealsBoard } from "@/lib/api/deals";
import { directoryOrNull, nameFor } from "@/lib/api/staff";
import { isoDay, isoDayPlus } from "@/lib/crm/dates";
import { LOSS_REASON_LABELS } from "@/lib/crm/vocabulary";
import { formatMoney, formatMrr, formatMrrBy } from "@/lib/format";
import { requestNow } from "@/lib/request-time";
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

  const link = (next: { status?: string; view?: string }) => {
    const parameters = new URLSearchParams();
    const chosenStatus = next.status ?? status;
    const chosenView = next.view ?? view;
    if (chosenStatus !== "open") parameters.set("status", chosenStatus);
    if (chosenView !== defaultView(chosenStatus)) parameters.set("view", chosenView);
    if (chosenView === "table" && sort) parameters.set("sort", serializeSort(sort));
    const rendered = parameters.toString();
    return rendered ? `/deals?${rendered}` : "/deals";
  };
  const currentQuery = link({}).split("?")[1] ?? "";
  const canMoveDeals = hasCapability(context, "deals:write");
  const rows = sortRows(
    (board?.columns ?? []).flatMap((column) => column.deals),
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

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Deals"
        description="Every open deal names its next step and a date. Deals quiet for 14 days, or past their stage's limit with no step on the calendar, are flagged."
        actions={
          <SegmentedLinks
            label="View"
            items={[
              { href: link({ view: "board" }), label: "Board", current: view === "board" },
              { href: link({ view: "table" }), label: "Table", current: view === "table" },
            ]}
          />
        }
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
              <ViewTabs listKey="deals" basePath="/deals" currentQuery={currentQuery} />
              {canMoveDeals && (
                <SelectionBar
                  tableId={tableIdFor("Deals")}
                  kind="deals"
                  noun={["deal", "deals"]}
                  action={bulkUpdateAction}
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
                  },
                  sort,
                )}
                selectable={canMoveDeals}
                isEmpty={rows.length === 0}
                empty={<EmptyState title="Nothing here" description="No deals match this view." />}
              >
                {rows.map((deal) => (
                  <tr
                    key={deal.deal_id}
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
                    <td className="data-table__num">{formatMrr(deal.mrr_amount, deal.currency)}</td>
                    <td className="data-table__num">
                      {deal.status === "open" ? formatMoney(deal.weighted_mrr, deal.currency) : "—"}
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
                    <td>{deal.owner_staff_id ? nameFor(names, deal.owner_staff_id) : "Unowned"}</td>
                    <td className="data-table__num">
                      {deal.status === "open" ? `${deal.days_in_stage}d` : "—"}
                    </td>
                  </tr>
                ))}
              </DataTable>
            </>
          )}
        </>
      )}
    </>
  );
}
