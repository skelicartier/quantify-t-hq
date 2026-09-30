import Link from "next/link";

import { PipelineTabs } from "@/components/deals/pipeline-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readPipelineChanges, type DealChange, type PipelineChanges } from "@/lib/api/inspection";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata = { title: "What changed" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "deal", label: "Deal" },
  { key: "why", label: "What changed" },
  { key: "was", label: "Was" },
  { key: "now", label: "Now" },
  { key: "amount", label: "Amount", align: "end" as const },
  { key: "delta", label: "Change", align: "end" as const },
  { key: "owner", label: "Owner" },
];

const TONE: Record<string, "live" | "danger" | "attention" | "neutral"> = {
  won: "live",
  lost: "danger",
  new: "live",
  pushed: "danger",
  pulled_in: "live",
  category_up: "live",
  category_down: "attention",
  increased: "live",
  decreased: "attention",
  stage_moved: "neutral",
};

type SearchParams = Promise<{ days?: string }>;

function money(value: string | null, currency: string): string {
  return value === null ? "—" : formatMoney(Number(value), currency);
}

/** What moved and what it moved from, in the words of the change. */
function was(change: DealChange): string {
  switch (change.reason) {
    case "pushed":
    case "pulled_in":
      return change.close_before ? `Closing ${formatDate(change.close_before)}` : "No close date";
    case "category_up":
    case "category_down":
      return change.category_before || "—";
    case "stage_moved":
      return change.stage_before || "—";
    case "new":
      return "Not in the pipeline";
    default:
      return change.stage_before || "—";
  }
}

function now(change: DealChange): string {
  switch (change.reason) {
    case "pushed":
    case "pulled_in":
      return change.close_after ? `Closing ${formatDate(change.close_after)}` : "No close date";
    case "category_up":
    case "category_down":
      return change.category_after || "—";
    case "won":
      return "Won";
    case "lost":
      return "Lost";
    default:
      return change.stage_after || "—";
  }
}

/**
 * The pipeline's week: every deal compared with itself at the start of the window, each
 * given one reason — won, lost, new, pushed, pulled in, a category moved, bigger or
 * smaller, a stage moved — and the deals whose next step has not changed in a week.
 */
export default async function PipelineChangesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const context = await requireStaff("/deals/changes");
  const raw = Number((await searchParams).days ?? "7");
  const days = [7, 14, 30].includes(raw) ? raw : 7;
  let page: PipelineChanges | null = null;
  try {
    page = await readPipelineChanges(context.token, days);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const seesMoney = hasCapability(context, "revenue:read");

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="What changed"
        description="Each deal compared with itself at the start of the window, with one reason each. A push is a close date moved into a later month."
        actions={<PipelineTabs current="/deals/changes" />}
      />
      {page === null ? (
        <Callout tone="danger" role="alert">
          The changes could not be read just now. This is a read failure, not a quiet week.
        </Callout>
      ) : (
        <div className="page-content">
          <div className="list-tools">
            <SegmentedLinks
              label="Window"
              items={page.windows.map((window) => ({
                href: window === 7 ? "/deals/changes" : `/deals/changes?days=${window}`,
                label: `${window} days`,
                current: window === days,
              }))}
            />
          </div>
          {page.window.note && (
            <Callout tone="neutral" compact>
              {page.window.note}
            </Callout>
          )}
          <div className="reason-strip" role="list" aria-label="Changes by reason">
            {page.by_reason.length === 0 ? (
              <p className="muted">Nothing moved in the window.</p>
            ) : (
              page.by_reason.map((row) => (
                <div key={row.reason} className="reason-strip__item" role="listitem">
                  <span className="reason-strip__label">{row.label}</span>
                  <span className="reason-strip__count">{row.count}</span>
                  {seesMoney && Object.keys(row.amounts).length > 0 && (
                    <span className="reason-strip__amount">
                      {Object.entries(row.amounts)
                        .map(([currency, amount]) => formatMoney(Number(amount), currency))
                        .join(" · ")}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>

          <Section id="changes" title="Deal by deal">
            <p className="page-note">
              Compared from {formatDate(page.window.compared_from, "today")} to{" "}
              {formatDate(page.window.to)}. Only the two ends are compared: a date pushed and pulled
              back inside the window shows as no change, though the push still counts on the deal.
            </p>
            <DataTable
              caption="Deals that changed, by reason"
              columns={
                seesMoney
                  ? COLUMNS
                  : COLUMNS.filter((column) => !["amount", "delta"].includes(column.key))
              }
              isEmpty={page.changes.length === 0}
              empty={<p className="muted">Nothing moved in the window.</p>}
            >
              {page.changes.map((change) => (
                <tr key={change.deal_id}>
                  <td>
                    <Link href={`/deals/${change.deal_id}`}>{change.name}</Link>
                    <span className="quiet"> · {change.company.name}</span>
                  </td>
                  <td>
                    <StatusPill
                      value={change.reason}
                      label={
                        change.reason === "pushed"
                          ? `Pushed a ${change.push}${change.push_count > 1 ? ` · ${change.push_count} pushes` : ""}`
                          : change.reason_label
                      }
                      tone={TONE[change.reason] ?? "neutral"}
                    />
                  </td>
                  <td>{was(change)}</td>
                  <td>{now(change)}</td>
                  {seesMoney && (
                    <>
                      <td className="data-table__num">
                        {money(change.amount_after, change.currency)}
                      </td>
                      <td className="data-table__num">
                        {change.delta === null ||
                        Number(change.delta) === 0 ||
                        change.reason === "new"
                          ? "—"
                          : `${Number(change.delta) > 0 ? "+" : ""}${money(change.delta, change.currency)}`}
                      </td>
                    </>
                  )}
                  <td>{change.owner || "—"}</td>
                </tr>
              ))}
            </DataTable>
          </Section>

          <Section id="stale" title="Next step unchanged for a week">
            <p className="page-note">
              An open deal whose next step has not been touched in seven days. The step may still be
              right; say so by editing it, or change it.
            </p>
            <DataTable
              caption="Open deals with a week-old next step"
              columns={[
                { key: "deal", label: "Deal" },
                { key: "step", label: "Next step" },
                { key: "due", label: "Due" },
                { key: "owner", label: "Owner" },
              ]}
              isEmpty={page.stale_steps.length === 0}
              empty={<p className="muted">None: every next step moved this week.</p>}
            >
              {page.stale_steps.map((row) => (
                <tr key={row.deal_id}>
                  <td>
                    <Link href={`/deals/${row.deal_id}`}>{row.name}</Link>
                    <span className="quiet"> · {row.company}</span>
                  </td>
                  <td>{row.next_step || "—"}</td>
                  <td>{formatDate(row.next_step_due, "—")}</td>
                  <td>{row.owner || "—"}</td>
                </tr>
              ))}
            </DataTable>
          </Section>
        </div>
      )}
    </>
  );
}
