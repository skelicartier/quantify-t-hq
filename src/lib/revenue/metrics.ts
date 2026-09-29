import type { BridgeMonth, Contract } from "@/lib/api/revenue";

/**
 * Revenue figures the service does not compute, derived from what it does return: the
 * bridge months and the contract list. Every rate here is a plain ratio of numbers on
 * the page beside it, so a reader can check any of them by hand; nothing is modelled or
 * annualised. Churn and contraction arrive negative, as the bridge draws them.
 */

/** Completed months only: a month still running would understate every rate. */
export function completedMonths(months: readonly BridgeMonth[]): BridgeMonth[] {
  return months.filter((month) => !month.partial);
}

export type GrowthMetrics = {
  /** The most recent completed month. */
  latest: BridgeMonth | null;
  /** MRR growth over that month: (end − start) ÷ start. */
  momGrowth: number | null;
  /** MRR added over that month, net of every loss. */
  netNew: number | null;
  /** Compound monthly growth from the first completed month's end to the latest's. */
  cmgr: number | null;
  cmgrMonths: number;
  /** Average monthly gross MRR churn (churn plus contraction ÷ opening MRR), last three months. */
  grossChurnRate: number | null;
  churnMonths: number;
  /** Gains ÷ losses over the last three months; null when there were no losses. */
  quickRatio: number | null;
  quickMonths: number;
  hadLosses: boolean;
  /** Net MRR retention over the last twelve completed months, on the bridge's own basis. */
  netRetention: number | null;
  retentionMonths: number;
};

export function growthMetrics(months: readonly BridgeMonth[]): GrowthMetrics {
  const done = completedMonths(months);
  const latest = done[done.length - 1] ?? null;
  const first = done[0] ?? null;
  const momGrowth = latest && latest.start > 0 ? (latest.end - latest.start) / latest.start : null;
  const netNew = latest ? latest.end - latest.start : null;
  const cmgrMonths = Math.max(done.length - 1, 0);
  const cmgr =
    first && latest && cmgrMonths >= 1 && first.end > 0 && latest.end > 0
      ? Math.pow(latest.end / first.end, 1 / cmgrMonths) - 1
      : null;

  const recent = done.slice(-3);
  const churnRates = recent
    .filter((month) => month.start > 0)
    .map((month) => (-month.churn - month.contraction) / month.start);
  const grossChurnRate = churnRates.length
    ? churnRates.reduce((sum, rate) => sum + rate, 0) / churnRates.length
    : null;
  const gains = recent.reduce(
    (sum, month) => sum + month.new + month.expansion + month.reactivation,
    0,
  );
  const losses = recent.reduce((sum, month) => sum - month.churn - month.contraction, 0);
  const hadLosses = losses > 0;
  const quickRatio = recent.length && hadLosses ? gains / losses : null;

  const window = done.slice(-12);
  const opening = window[0]?.start ?? 0;
  const retained = window.reduce(
    (sum, month) => sum + month.expansion + month.reactivation + month.churn + month.contraction,
    opening,
  );
  const netRetention = window.length && opening > 0 ? retained / opening : null;

  return {
    latest,
    momGrowth,
    netNew,
    cmgr,
    cmgrMonths,
    grossChurnRate,
    churnMonths: churnRates.length,
    quickRatio,
    quickMonths: recent.length,
    hadLosses,
    netRetention,
    retentionMonths: window.length,
  };
}

/** Contracts paying today in one currency: active, or ending but not yet ended. */
export function paying(contracts: readonly Contract[], currency: string): Contract[] {
  return contracts.filter(
    (contract) =>
      contract.currency === currency && contract.state !== "ended" && contract.mrr_amount > 0,
  );
}

export type Slice = {
  key: string;
  label: string;
  count: number;
  mrr: number;
  /** Share of the MRR in the slices, 0–1. */
  share: number;
};

/** MRR grouped by whatever `keyOf` reads off a contract, largest first. */
export function sliceBy(
  contracts: readonly Contract[],
  keyOf: (contract: Contract) => string,
  labelOf: (key: string) => string = (key) => key,
): Slice[] {
  const total = contracts.reduce((sum, contract) => sum + contract.mrr_amount, 0);
  const slices = new Map<string, Slice>();
  for (const contract of contracts) {
    const key = keyOf(contract) || "unknown";
    const slice = slices.get(key) ?? { key, label: labelOf(key), count: 0, mrr: 0, share: 0 };
    slice.count += 1;
    slice.mrr += contract.mrr_amount;
    slices.set(key, slice);
  }
  return [...slices.values()]
    .map((slice) => ({ ...slice, share: total > 0 ? slice.mrr / total : 0 }))
    .sort((a, b) => b.mrr - a.mrr || a.label.localeCompare(b.label));
}

/** The largest `limit` slices, the rest folded into one so the shares still sum to one. */
export function topSlices(slices: readonly Slice[], limit: number, restLabel = "Everyone else") {
  if (slices.length <= limit) return [...slices];
  const head = slices.slice(0, limit);
  const rest = slices.slice(limit);
  return [
    ...head,
    {
      key: "rest",
      label: `${restLabel} (${rest.length})`,
      count: rest.reduce((sum, slice) => sum + slice.count, 0),
      mrr: rest.reduce((sum, slice) => sum + slice.mrr, 0),
      share: rest.reduce((sum, slice) => sum + slice.share, 0),
    },
  ];
}

export type Concentration = {
  total: number;
  customers: number;
  largest: { name: string; mrr: number; share: number } | null;
  top5Share: number;
  top10Share: number;
};

/** How much of the book the biggest customers are. */
export function concentration(contracts: readonly Contract[]): Concentration {
  const sorted = [...contracts].sort((a, b) => b.mrr_amount - a.mrr_amount);
  const total = sorted.reduce((sum, contract) => sum + contract.mrr_amount, 0);
  const shareOf = (count: number) =>
    total > 0
      ? sorted.slice(0, count).reduce((sum, contract) => sum + contract.mrr_amount, 0) / total
      : 0;
  const first = sorted[0];
  return {
    total,
    customers: sorted.length,
    largest: first
      ? {
          name: first.company_name || "Customer",
          mrr: first.mrr_amount,
          share: total > 0 ? first.mrr_amount / total : 0,
        }
      : null,
    top5Share: shareOf(5),
    top10Share: shareOf(10),
  };
}

export type SeatFigures = {
  seats: number;
  perSeat: number | null;
  /** Share of MRR on annual billing, 0–1. */
  annualShare: number | null;
};

export function seatFigures(contracts: readonly Contract[]): SeatFigures {
  const seats = contracts.reduce((sum, contract) => sum + contract.seats, 0);
  const total = contracts.reduce((sum, contract) => sum + contract.mrr_amount, 0);
  const annual = contracts
    .filter((contract) => contract.billing_cadence === "annual")
    .reduce((sum, contract) => sum + contract.mrr_amount, 0);
  return {
    seats,
    perSeat: seats > 0 ? total / seats : null,
    annualShare: total > 0 ? annual / total : null,
  };
}

function utcDate(day: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The same day `months` months on, clamped to the end of a shorter month. */
export function addMonths(day: string, months: number): string {
  const date = utcDate(day);
  if (!date) return day;
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return isoDay(target);
}

/** "2026-03" → "2026-03-31". */
export function monthEnd(month: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(month);
  if (!match) return month;
  return isoDay(new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)));
}

export type RenewalMonth = { month: string; count: number; mrr: number };

/** Active contracts by the month they next renew, for the coming `monthsAhead` months. */
export function renewalsByMonth(
  contracts: readonly Contract[],
  today: string,
  monthsAhead = 6,
): RenewalMonth[] {
  const firstMonth = today.slice(0, 7);
  const buckets: RenewalMonth[] = Array.from({ length: monthsAhead }, (_, index) => ({
    month: addMonths(`${firstMonth}-01`, index).slice(0, 7),
    count: 0,
    mrr: 0,
  }));
  for (const contract of contracts) {
    if (contract.state !== "active" || !contract.renews_on || contract.renews_on < today) continue;
    const bucket = buckets.find((row) => row.month === contract.renews_on!.slice(0, 7));
    if (!bucket) continue;
    bucket.count += 1;
    bucket.mrr += contract.mrr_amount;
  }
  return buckets;
}

export type CustomerCount = { month: string; count: number };

/** Paying customers at each month's end: started by then, and not ended by then. */
export function customersByMonth(
  contracts: readonly Contract[],
  months: readonly string[],
): CustomerCount[] {
  return months.map((month) => {
    const end = monthEnd(month);
    const count = contracts.filter(
      (contract) =>
        contract.starts_on !== null &&
        contract.starts_on <= end &&
        contract.mrr_amount > 0 &&
        (contract.state !== "ended" || contract.ends_on === null || contract.ends_on > end),
    ).length;
    return { month, count };
  });
}

export type LogoChurn = {
  since: string;
  atStart: number;
  churned: number;
  rate: number | null;
};

/** Of the customers paying `months` months ago, how many have since ended. */
export function logoChurn(contracts: readonly Contract[], today: string, months = 12): LogoChurn {
  const since = addMonths(today, -months);
  const cohort = contracts.filter(
    (contract) =>
      contract.starts_on !== null &&
      contract.starts_on <= since &&
      (contract.state !== "ended" || contract.ends_on === null || contract.ends_on > since),
  );
  const churned = cohort.filter(
    (contract) =>
      contract.state === "ended" && contract.ends_on !== null && contract.ends_on <= today,
  ).length;
  return {
    since,
    atStart: cohort.length,
    churned,
    rate: cohort.length > 0 ? churned / cohort.length : null,
  };
}

/** Mean months since each paying contract began. */
export function averageTenureMonths(contracts: readonly Contract[], today: string): number | null {
  const now = utcDate(today);
  const tenures = contracts
    .map((contract) => (contract.starts_on ? utcDate(contract.starts_on) : null))
    .filter((date): date is Date => date !== null && now !== null && date <= now)
    .map((date) => (now!.getTime() - date.getTime()) / (86_400_000 * 30.4375));
  if (!tenures.length) return null;
  return tenures.reduce((sum, months) => sum + months, 0) / tenures.length;
}

/** A round axis ceiling at or above `value`: 87,312 → 90,000; 58 → 60; 5,231 → 5,500. */
export function niceCeiling(value: number): number {
  if (!(value > 0)) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const step = magnitude / 2;
  return Math.ceil(value / step) * step;
}

// ---------------------------------------------------------------------------------------
// Movement rates and cohorts: the split the bridge hides, and retention by when a firm
// began rather than one aggregate for everyone.
// ---------------------------------------------------------------------------------------

export type MovementRates = {
  months: number;
  /** Σ opening MRR over the window; every rate below is over this. */
  opening: number;
  expansionRate: number | null;
  contractionRate: number | null;
  churnRate: number | null;
  reactivationRate: number | null;
  /** (churn + contraction − expansion − reactivation) ÷ opening; negative is good. */
  netChurnRate: number | null;
  /** Twelve-month gross revenue retention on the bridge's basis: opening less churn and contraction. */
  grossRetention: number | null;
  retentionMonths: number;
};

/**
 * Each kind of movement as a share of opening MRR over the last `window` completed
 * months, weighted by month (Σ movement ÷ Σ opening), so a quiet month does not count
 * as much as a busy one. Churn and contraction arrive negative and are shown positive.
 */
export function movementRates(months: readonly BridgeMonth[], window = 3): MovementRates {
  const done = completedMonths(months);
  const recent = done.slice(-window);
  const opening = recent.reduce((sum, month) => sum + month.start, 0);
  const over = (total: number) => (opening > 0 ? total / opening : null);
  const sum = (pick: (month: BridgeMonth) => number) =>
    recent.reduce((total, month) => total + pick(month), 0);
  const expansion = sum((month) => month.expansion);
  const contraction = -sum((month) => month.contraction);
  const churn = -sum((month) => month.churn);
  const reactivation = sum((month) => month.reactivation);
  const year = done.slice(-12);
  const yearOpening = year[0]?.start ?? 0;
  const yearLosses = year.reduce((total, month) => total + month.churn + month.contraction, 0);
  return {
    months: recent.length,
    opening,
    expansionRate: over(expansion),
    contractionRate: over(contraction),
    churnRate: over(churn),
    reactivationRate: over(reactivation),
    netChurnRate: over(churn + contraction - expansion - reactivation),
    grossRetention:
      year.length && yearOpening > 0 ? (yearOpening + yearLosses) / yearOpening : null,
    retentionMonths: year.length,
  };
}

export type ReasonSlice = { reason: string; count: number; mrr: number; share: number };

/** Contracts ended in the last `months` months, grouped by the reason recorded. */
export function churnByReason(
  contracts: readonly Contract[],
  today: string,
  months = 12,
): ReasonSlice[] {
  const since = addMonths(today, -months);
  const ended = contracts.filter(
    (contract) =>
      contract.state === "ended" &&
      contract.ends_on !== null &&
      contract.ends_on > since &&
      contract.ends_on <= today,
  );
  const total = ended.reduce((sum, contract) => sum + contract.mrr_amount, 0);
  const slices = new Map<string, ReasonSlice>();
  for (const contract of ended) {
    const reason = contract.cancel_reason || "unknown";
    const slice = slices.get(reason) ?? { reason, count: 0, mrr: 0, share: 0 };
    slice.count += 1;
    slice.mrr += contract.mrr_amount;
    slices.set(reason, slice);
  }
  return [...slices.values()]
    .map((slice) => ({ ...slice, share: total > 0 ? slice.mrr / total : 0 }))
    .sort((a, b) => b.mrr - a.mrr || a.reason.localeCompare(b.reason));
}

/** MRR per paying customer at each month's end, where both figures exist. */
export function arpaByMonth(
  months: readonly BridgeMonth[],
  customers: readonly CustomerCount[],
): { month: string; arpa: number | null }[] {
  const counts = new Map(customers.map((row) => [row.month, row.count]));
  return months.map((month) => {
    const count = counts.get(month.month) ?? 0;
    return { month: month.month, arpa: count > 0 ? month.end / count : null };
  });
}

/** "2025-08-14" → "2025-Q3". */
export function quarterOf(day: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(day);
  if (!match) return day;
  return `${match[1]}-Q${Math.floor((Number(match[2]) - 1) / 3) + 1}`;
}

/** The first day of the quarter `steps` quarters after `quarter` ("2025-Q3", 1 → "2025-10-01"). */
export function quarterStart(quarter: string, steps = 0): string {
  const match = /^(\d{4})-Q([1-4])$/.exec(quarter);
  if (!match) return quarter;
  const index = Number(match[1]) * 4 + (Number(match[2]) - 1) + steps;
  const year = Math.floor(index / 4);
  const month = (index % 4) * 3 + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** The last day of the quarter `steps` quarters after `quarter`. */
export function quarterEnd(quarter: string, steps = 0): string {
  const nextStart = quarterStart(quarter, steps + 1);
  return isoDay(new Date(Date.parse(nextStart) - 86_400_000));
}

export type CohortCell = { period: number; retained: number | null; active: number | null };
export type LogoCohort = { quarter: string; size: number; cells: CohortCell[] };

/**
 * Logo retention by the quarter a firm's first contract began: for each cohort, the share
 * of its firms still paying at the end of the k-th quarter after that one. A firm counts
 * as paying while any of its contracts is active on the day, so a reactivation counts.
 * Quarters that have not ended yet are left blank rather than guessed.
 */
export function logoCohorts(
  contracts: readonly Contract[],
  today: string,
  periods = 8,
): { cohorts: LogoCohort[]; periods: number[] } {
  const byCompany = new Map<string, Contract[]>();
  for (const contract of contracts) {
    if (!contract.starts_on || contract.mrr_amount <= 0) continue;
    const rows = byCompany.get(contract.company_id) ?? [];
    rows.push(contract);
    byCompany.set(contract.company_id, rows);
  }
  const activeOn = (rows: readonly Contract[], day: string) =>
    rows.some(
      (contract) =>
        contract.starts_on !== null &&
        contract.starts_on <= day &&
        (contract.state !== "ended" || contract.ends_on === null || contract.ends_on > day),
    );
  const cohorts = new Map<string, Contract[][]>();
  for (const rows of byCompany.values()) {
    const first = rows.map((contract) => contract.starts_on!).sort()[0]!;
    const quarter = quarterOf(first);
    const members = cohorts.get(quarter) ?? [];
    members.push(rows);
    cohorts.set(quarter, members);
  }
  const periodList = Array.from({ length: periods }, (_, index) => index + 1);
  return {
    periods: periodList,
    cohorts: [...cohorts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([quarter, members]) => ({
        quarter,
        size: members.length,
        cells: periodList.map((period) => {
          const end = quarterEnd(quarter, period);
          if (end > today) return { period, retained: null, active: null };
          const active = members.filter((rows) => activeOn(rows, end)).length;
          return { period, active, retained: members.length > 0 ? active / members.length : null };
        }),
      })),
  };
}
