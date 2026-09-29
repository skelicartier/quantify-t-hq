import type { DealSummary } from "@/lib/api/crm";
import { sumMoneyByCurrency } from "@/lib/format";

/**
 * What the closed deals of a recent window say: how often we win, how long it takes,
 * how big a win is. Counted from the deals themselves — a deal closed inside the window
 * by its own `closed_at` — so the figures agree with the board's Won and Lost views.
 */

export type ReasonCount = { reason: string; count: number };

export type ClosedMetrics = {
  windowDays: number;
  won: number;
  lost: number;
  /** Won ÷ (won + lost); null with nothing closed. */
  winRate: number | null;
  /** MRR won, per currency; null when a figure is withheld from this role. */
  wonMrr: Record<string, number> | null;
  /** Average won deal, per currency. */
  averageWon: Record<string, number> | null;
  /** MRR won per thirty days of the window, per currency. */
  monthlyWonMrr: Record<string, number> | null;
  /** Days from a won deal's creation to its close, the middle value. */
  medianCycleDays: number | null;
  cycleSample: number;
  reasons: ReasonCount[];
};

function closedWithin(deal: DealSummary, now: number, windowDays: number): boolean {
  if (!deal.closed_at) return false;
  const closed = Date.parse(deal.closed_at);
  if (!Number.isFinite(closed) || closed > now) return false;
  return now - closed <= windowDays * 86_400_000;
}

function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function closedMetrics(
  wonDeals: readonly DealSummary[],
  lostDeals: readonly DealSummary[],
  now: number,
  windowDays = 90,
): ClosedMetrics {
  const won = wonDeals.filter((deal) => closedWithin(deal, now, windowDays));
  const lost = lostDeals.filter((deal) => closedWithin(deal, now, windowDays));
  const closed = won.length + lost.length;
  const wonMrr = sumMoneyByCurrency(
    won.map((deal) => ({ amount: deal.mrr_amount, currency: deal.currency })),
  );
  const perCurrency = (scale: (total: number, currency: string) => number) =>
    wonMrr
      ? Object.fromEntries(
          Object.entries(wonMrr).map(([currency, total]) => [currency, scale(total, currency)]),
        )
      : null;
  const countIn = (currency: string) => won.filter((deal) => deal.currency === currency).length;
  const cycles = won
    .filter((deal) => deal.created_at && deal.closed_at)
    .map((deal) => (Date.parse(deal.closed_at!) - Date.parse(deal.created_at!)) / 86_400_000)
    .filter((days) => Number.isFinite(days) && days >= 0);
  const reasons = new Map<string, number>();
  for (const deal of lost) {
    const reason = deal.loss_reason || "unknown";
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  return {
    windowDays,
    won: won.length,
    lost: lost.length,
    winRate: closed > 0 ? won.length / closed : null,
    wonMrr,
    averageWon: perCurrency((total, currency) => total / Math.max(countIn(currency), 1)),
    monthlyWonMrr: perCurrency((total) => (total * 30) / windowDays),
    medianCycleDays: median(cycles),
    cycleSample: cycles.length,
    reasons: [...reasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
  };
}

/**
 * Open pipeline as a multiple of a month's won MRR: how many such months the pipeline
 * would cover if every deal closed. Null without both figures in that currency.
 */
export function pipelineCover(
  openMrr: Readonly<Record<string, number>> | null,
  monthlyWonMrr: Readonly<Record<string, number>> | null,
  currency = "USD",
): number | null {
  const open = openMrr?.[currency];
  const won = monthlyWonMrr?.[currency];
  if (typeof open !== "number" || typeof won !== "number" || won <= 0) return null;
  return open / won;
}
