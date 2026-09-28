import Link from "next/link";

import { DealBoard } from "@/components/crm/deal-board";
import { DealFlags, DealStatusPill, DueChip } from "@/components/crm/pills";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Stat, StatGrid } from "@/components/ui/stat";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readDealsBoard, type DealsBoard } from "@/lib/api/deals";
import { directoryOrEmpty } from "@/lib/api/staff";
import { isoDay } from "@/lib/crm/dates";
import { LOSS_REASON_LABELS } from "@/lib/crm/vocabulary";
import { formatMoney, formatMrr, formatMrrBy } from "@/lib/format";
import { requestNow } from "@/lib/request-time";
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
  { key: "deal", label: "Deal" },
  { key: "stage", label: "Stage" },
  { key: "value", label: "Monthly value", align: "end" as const },
  { key: "weighted", label: "Weighted", align: "end" as const },
  { key: "next", label: "Next step" },
  { key: "owner", label: "Owner" },
  { key: "age", label: "In stage", align: "end" as const },
];

type DealsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DealsPage({ searchParams }: DealsPageProps) {
  const context = await requireStaff("/deals");
  const parameters = await searchParams;
  const requested = firstSearchValue(parameters.status) ?? "open";
  const status = STATUSES.some(([value]) => value === requested) ? requested : "open";
  const view = firstSearchValue(parameters.view) === "table" ? "table" : "board";
  const now = requestNow();
  const today = isoDay(now);

  let board: DealsBoard | null = null;
  try {
    board = await readDealsBoard(context.token, status);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const names = await directoryOrEmpty(context.token);

  const link = (next: { status?: string; view?: string }) => {
    const parameters = new URLSearchParams();
    const chosenStatus = next.status ?? status;
    const chosenView = next.view ?? view;
    if (chosenStatus !== "open") parameters.set("status", chosenStatus);
    if (chosenView !== "board") parameters.set("view", chosenView);
    const rendered = parameters.toString();
    return rendered ? `/deals?${rendered}` : "/deals";
  };
  const rows = (board?.columns ?? []).flatMap((column) => column.deals);

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
              <DealBoard columns={board.columns} today={today} names={names} />
            )
          ) : (
            <DataTable
              caption="Deals"
              columns={TABLE_COLUMNS}
              isEmpty={rows.length === 0}
              empty={<EmptyState title="Nothing here" description="No deals match this view." />}
            >
              {rows.map((deal) => (
                <tr
                  key={deal.deal_id}
                  className={deal.status === "open" ? undefined : "row--muted"}
                >
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
                  <td>
                    {deal.owner_staff_id
                      ? (names.get(deal.owner_staff_id)?.display_name ?? "—")
                      : "Unowned"}
                  </td>
                  <td className="data-table__num">
                    {deal.status === "open" ? `${deal.days_in_stage}d` : "—"}
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </>
      )}
    </>
  );
}
