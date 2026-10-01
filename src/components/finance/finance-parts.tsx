import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { SegmentedLinks } from "@/components/ui/toolbar";
import type { Runway } from "@/lib/api/finance";
import { formatDate, formatMoney } from "@/lib/format";

const TABS = [
  { href: "/finance", label: "Cash and runway" },
  { href: "/finance/vendors", label: "Vendors" },
  { href: "/finance/deferred", label: "Revenue earned" },
  { href: "/finance/budget", label: "Budget" },
  { href: "/finance/updates", label: "Investor updates" },
  { href: "/expenses", label: "Expenses" },
  { href: "/expenses/purchases", label: "Purchases" },
] as const;

const SPEND_TABS = [
  { href: "/expenses", label: "Expenses" },
  { href: "/expenses/purchases", label: "Purchase requests" },
] as const;

/** For everyone who spends: their claims and their requests to buy. */
export function SpendTabs({ current }: { current: (typeof SPEND_TABS)[number]["href"] }) {
  return (
    <SegmentedLinks
      label="Spending"
      items={SPEND_TABS.map((tab) => ({ ...tab, current: tab.href === current }))}
    />
  );
}

export function FinanceTabs({ current }: { current: (typeof TABS)[number]["href"] }) {
  return (
    <SegmentedLinks
      label="Finance sections"
      items={TABS.map((tab) => ({ ...tab, current: tab.href === current }))}
    />
  );
}

const RUNWAY_TONE: Record<string, PillTone> = {
  ok: "live",
  positive: "live",
  refused: "attention",
  no_history: "neutral",
};
const RUNWAY_LABEL: Record<string, string> = {
  ok: "Measured",
  positive: "Cash-flow positive",
  refused: "Not shown",
  no_history: "Not enough history",
};

/** One currency's cash and runway — or the reason there is no runway figure. */
export function RunwayCard({ runway }: { runway: Runway }) {
  return (
    <article className="runway">
      <header className="runway__head">
        <span className="runway__currency">{runway.currency}</span>
        <StatusPill
          value={runway.state}
          label={RUNWAY_LABEL[runway.state] ?? runway.state}
          tone={RUNWAY_TONE[runway.state] ?? "neutral"}
        />
      </header>
      <dl className="runway__figures">
        <div>
          <dt>Cash</dt>
          <dd>{formatMoney(runway.cash, runway.currency)}</dd>
        </div>
        <div>
          <dt>Net burn a month</dt>
          <dd>
            {runway.burn_per_month === null
              ? "—"
              : runway.burn_per_month <= 0
                ? "None"
                : formatMoney(runway.burn_per_month, runway.currency)}
          </dd>
        </div>
        <div>
          <dt>Runway</dt>
          <dd>
            {runway.runway_months === null
              ? "—"
              : `${runway.runway_months} months, to ${formatDate(runway.runs_out_on)}`}
          </dd>
        </div>
      </dl>
      <p className="runway__note">
        {runway.reason ||
          `From ${runway.accounts} account${runway.accounts === 1 ? "" : "s"}, balances as of ${formatDate(runway.as_of, "—")}.`}
      </p>
    </article>
  );
}

const VENDOR_TONE: Record<string, PillTone> = {
  decide: "attention",
  locked: "danger",
  ending: "neutral",
  ok: "live",
};
const VENDOR_LABEL: Record<string, string> = {
  decide: "Decide",
  locked: "Locked in",
  ending: "Ending",
  ok: "In hand",
};

export function VendorStatePill({ state, status }: { state: string; status: string }) {
  if (status === "cancelled")
    return <StatusPill value="cancelled" label="Cancelled" tone="neutral" />;
  return (
    <StatusPill
      value={state}
      label={VENDOR_LABEL[state] ?? state}
      tone={VENDOR_TONE[state] ?? "neutral"}
    />
  );
}

const CLAIM_TONE: Record<string, PillTone> = {
  submitted: "attention",
  approved: "live",
  paid: "live",
  rejected: "danger",
  withdrawn: "neutral",
};

export function ClaimPill({ status }: { status: string }) {
  return (
    <StatusPill
      value={status}
      label={`${status.charAt(0).toUpperCase()}${status.slice(1)}`}
      tone={CLAIM_TONE[status] ?? "neutral"}
    />
  );
}
