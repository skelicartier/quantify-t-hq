import Link from "next/link";

import { setTargetAction, submitForecastAction } from "@/app/(portal)/deals/inspection-actions";
import { SubmitForecastForm, TargetForm } from "@/components/deals/inspection-forms";
import { PipelineTabs } from "@/components/deals/pipeline-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card, Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Popover } from "@/components/ui/popover";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readForecast, type Forecast } from "@/lib/api/inspection";
import { formatAbsolute, formatDate, formatMoney } from "@/lib/format";

export const metadata = { title: "Forecast" };
export const dynamic = "force-dynamic";

const DEAL_COLUMNS = [
  { key: "deal", label: "Deal" },
  { key: "category", label: "Category" },
  { key: "stage", label: "Stage" },
  { key: "close", label: "Closes" },
  { key: "pushes", label: "Pushes", align: "end" as const },
  { key: "amount", label: "MRR", align: "end" as const },
];

const CATEGORY_TONE: Record<string, "live" | "attention" | "neutral"> = {
  commit: "live",
  best_case: "attention",
  pipeline: "neutral",
  omitted: "neutral",
};

type SearchParams = Promise<{ period?: string; currency?: string }>;

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

/**
 * The quarter's number: the target, what is won, the gap, the open deals closing in the
 * quarter by category, the call people submitted (frozen with its deals) and, for past
 * quarters, how far each call was from what was won — in money and deals, not a
 * percentage alone.
 */
export default async function ForecastPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await requireStaff("/deals/forecast");
  if (!hasCapability(context, "revenue:read")) {
    return (
      <>
        <PageHeader
          eyebrow="CRM"
          title="Forecast"
          actions={<PipelineTabs current="/deals/forecast" />}
        />
        <Callout tone="neutral">
          The forecast is money: it is visible to Sales, Admins and Owners.
        </Callout>
      </>
    );
  }
  const query = await searchParams;
  let page: Forecast | null = null;
  try {
    page = await readForecast(context.token, {
      ...(query.period ? { period: query.period } : {}),
      ...(query.currency ? { currency: query.currency } : {}),
    });
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const canSubmit = hasCapability(context, "deals:write");
  const canTarget = hasCapability(context, "revenue:write");
  const money = (value: string | null) =>
    value === null ? "—" : formatMoney(Number(value), page?.currency ?? "USD");
  const link = (period: string, currency?: string) =>
    `/deals/forecast?period=${period}${currency ? `&currency=${currency}` : ""}`;

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Forecast"
        description="The quarter's new MRR: target, won, the gap, and what is open by category. The stage sets a deal's category; a person may change it on the deal."
        actions={
          <>
            <PipelineTabs current="/deals/forecast" />
            {page && canTarget && (
              <Popover label="Set the target">
                <TargetForm
                  action={setTargetAction}
                  period={page.period}
                  currency={page.currency}
                  current={page.goal}
                />
              </Popover>
            )}
            {page && canSubmit && !page.ended && (
              <Popover label="Submit a call" variant="primary" width="wide">
                <SubmitForecastForm
                  action={submitForecastAction}
                  period={page.period}
                  currency={page.currency}
                  suggested={page.suggested}
                />
              </Popover>
            )}
          </>
        }
      />
      {page === null ? (
        <Callout tone="danger" role="alert">
          The forecast could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <div className="list-tools">
            <SegmentedLinks
              label="Quarter"
              items={page.periods.map((period) => ({
                href: link(period, page.currency),
                label: period,
                current: period === page.period,
              }))}
            />
            {page.currencies.length > 1 && (
              <SegmentedLinks
                label="Currency"
                items={page.currencies.map((currency) => ({
                  href: link(page.period, currency),
                  label: currency,
                  current: currency === page.currency,
                }))}
              />
            )}
          </div>
          <p className="page-note">
            {formatDate(page.starts_on)} to {formatDate(page.ends_on)}
            {page.ended ? " — over." : "."}
          </p>

          <StatGrid columns={4} label="The quarter">
            <Stat
              label="Target"
              value={money(page.goal)}
              text
              hint={page.goal === null ? "Not set" : "New MRR to win"}
            />
            <Stat
              label="Won"
              value={money(page.won)}
              text
              hint={`${page.won_deals.length} deals`}
            />
            <Stat
              label="Gap"
              value={money(page.gap)}
              text
              tone={page.gap !== null && Number(page.gap) > 0 ? "danger" : "default"}
              hint="Target less won"
            />
            <Stat
              label="Coverage"
              value={page.coverage === null ? "—" : `${page.coverage.toFixed(1)}×`}
              text
              hint="Open pipeline ÷ gap"
            />
          </StatGrid>
          <StatGrid columns={4} label="Open deals closing this quarter">
            <Stat label="Commit" value={money(page.open.commit)} text />
            <Stat label="Best case" value={money(page.open.best_case)} text />
            <Stat label="Pipeline" value={money(page.open.pipeline)} text />
            <Stat
              label="No close date"
              value={page.undated_open}
              hint="Open deals in no quarter"
              tone={page.undated_open > 0 ? "danger" : "default"}
            />
          </StatGrid>

          <Section id="deals" title="Open deals closing this quarter">
            <DataTable
              caption="Open deals by forecast category"
              columns={DEAL_COLUMNS}
              isEmpty={page.deals.length === 0}
              empty={<p className="muted">No open deal closes in this quarter.</p>}
            >
              {page.deals.map((line) => (
                <tr key={line.deal_id}>
                  <td>
                    <Link href={`/deals/${line.deal_id}`}>{line.name}</Link>
                    <span className="quiet"> · {line.company}</span>
                  </td>
                  <td>
                    <StatusPill
                      value={line.category}
                      label={`${line.category_label}${line.overridden ? " (set)" : ""}`}
                      tone={CATEGORY_TONE[line.category] ?? "neutral"}
                    />
                  </td>
                  <td>{line.stage}</td>
                  <td>{formatDate(line.close_date, "—")}</td>
                  <td className="data-table__num">{line.push_count || "—"}</td>
                  <td className="data-table__num">{money(line.amount)}</td>
                </tr>
              ))}
            </DataTable>
          </Section>

          <Section id="calls" title="Calls submitted">
            {page.submissions.length === 0 ? (
              <p className="muted">
                No call submitted for {page.period} in {page.currency}.
              </p>
            ) : (
              <div className="card-grid card-grid--2">
                {page.submissions.map((submission) => (
                  <Card
                    key={submission.id}
                    title={`${money(submission.commit)} commit · ${money(submission.best_case)} best case`}
                    titleAs="h3"
                    description={`${submission.by || "Someone"} · ${formatAbsolute(submission.at ?? "")}. Won then ${money(submission.closed_then)}.`}
                  >
                    {submission.note && <p className="prewrap">{submission.note}</p>}
                    {submission.result && (
                      <div className="call-result">
                        <p className="clock-line">
                          Won {money(submission.result.actual)}; the call was{" "}
                          {Number(submission.result.miss) === 0
                            ? "exact"
                            : `${Number(submission.result.miss) > 0 ? "over" : "under"} by ${money(
                                String(Math.abs(Number(submission.result.miss))),
                              )}`}
                          {submission.result.accuracy !== null &&
                            ` (accuracy ${percent(submission.result.accuracy)})`}
                          .
                        </p>
                        <p className="field__hint">
                          Hit:{" "}
                          {submission.result.hit
                            .map((deal) => deal.company || deal.name)
                            .join(", ") || "none"}
                          . Missed:{" "}
                          {submission.result.missed
                            .map((deal) => deal.company || deal.name)
                            .join(", ") || "none"}
                          .
                        </p>
                      </div>
                    )}
                    <p className="field__hint">
                      Behind it:{" "}
                      {submission.deals.filter((deal) => deal.category === "commit").length} commit,{" "}
                      {submission.deals.filter((deal) => deal.category === "best_case").length} best
                      case, {submission.deals.filter((deal) => deal.category === "closed").length}{" "}
                      won.
                    </p>
                  </Card>
                ))}
              </div>
            )}
          </Section>

          <Section id="history" title="How past calls landed">
            <p className="page-note">
              The last call of each quarter against what was won. With a few deals a quarter one
              deal moves the percentage a long way: read the money missed first.
            </p>
            <DataTable
              caption="Past quarters' calls against what was won"
              columns={[
                { key: "period", label: "Quarter" },
                { key: "call", label: "Commit call", align: "end" as const },
                { key: "actual", label: "Won", align: "end" as const },
                { key: "miss", label: "Missed by", align: "end" as const },
                { key: "accuracy", label: "Accuracy", align: "end" as const },
                { key: "bias", label: "Bias", align: "end" as const },
              ]}
              isEmpty={page.history.length === 0}
              empty={<p className="muted">No earlier quarter has a submitted call.</p>}
            >
              {page.history.map((row) => (
                <tr key={row.period}>
                  <td>
                    <Link href={link(row.period, page.currency)}>{row.period}</Link>
                  </td>
                  <td className="data-table__num">{money(row.call)}</td>
                  <td className="data-table__num">
                    {money(row.actual)} <span className="quiet">({row.deals_won})</span>
                  </td>
                  <td className="data-table__num">{money(row.miss)}</td>
                  <td className="data-table__num">{percent(row.accuracy)}</td>
                  <td className="data-table__num">
                    {row.bias === null
                      ? "—"
                      : `${row.bias > 0 ? "+" : ""}${Math.round(row.bias * 100)}%`}
                  </td>
                </tr>
              ))}
            </DataTable>
          </Section>
        </div>
      )}
    </>
  );
}
