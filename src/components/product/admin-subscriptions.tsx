import { AdminGate } from "@/components/product/admin-gate";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card, Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Meter } from "@/components/ui/meter";
import { ShortId } from "@/components/ui/short-id";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { Toolbar } from "@/components/ui/toolbar";
import type { AdminSubscriptionAccount, AdminSubscriptionsAccess } from "@/lib/product/access";
import {
  allowanceStanding,
  canonicalPlan,
  CANONICAL_PLANS,
  featureLabel,
  formatAllowance,
  planLabel,
  QUOTA_FEATURES,
  type AllowanceStanding,
  type FeatureKey,
  type PlanKey,
} from "@/lib/product/plan-catalogue";
import { subscriptionEventLabel } from "@/lib/product/subscription";
import { formatNumber, formatPercent, pluralize } from "@/lib/format";

type AdminSubscriptionsProps = {
  access: AdminSubscriptionsAccess;
  now?: number | undefined;
};

type AuthorizedAccess = Extract<AdminSubscriptionsAccess, { status: "authorized" }>;

const TIER_COLUMNS = [
  { key: "tier", label: "Stored tier" },
  { key: "plan", label: "Plan" },
  { key: "accounts", label: "Accounts", align: "end" as const },
  { key: "share", label: "Share of accounts", align: "end" as const },
];

const WATCH_COLUMNS = [
  { key: "account", label: "Account" },
  { key: "plan", label: "Plan" },
  { key: "feature", label: "Feature" },
  { key: "spend", label: "Used of allowance" },
  { key: "standing", label: "Standing" },
];

const CHANGE_COLUMNS = [
  { key: "when", label: "When" },
  { key: "change", label: "Change" },
  { key: "account", label: "Account" },
  { key: "actor", label: "Changed by" },
  { key: "outcome", label: "Outcome" },
];

const STANDING_TONE: Record<AllowanceStanding, "danger" | "attention" | "live" | "neutral"> = {
  over: "danger",
  near: "attention",
  healthy: "live",
  unlimited: "neutral",
};

const STANDING_LABEL: Record<AllowanceStanding, string> = {
  over: "Over allowance",
  near: "Near allowance",
  healthy: "Within allowance",
  unlimited: "Unlimited",
};

type WatchRow = {
  account: AdminSubscriptionAccount;
  plan: PlanKey;
  feature: FeatureKey;
  spent: number;
  limit: number | null;
  periodKey: string;
  standing: AllowanceStanding;
  /** The limit came from a grant on this account rather than from its plan. */
  granted: boolean;
  pressure: number;
};

/**
 * One row per metered feature that is close to, or past, the account's own allowance.
 *
 * The limit is the one the server resolved for that account — plan default, overlaid with
 * whatever it has been granted — not the published plan template. Comparing against the
 * template made a comped account read "Over allowance" while it sat comfortably inside the
 * limit it actually has, which is the single most misleading thing an operations page can
 * say about a customer.
 */
function watchRows(accounts: readonly AdminSubscriptionAccount[]): WatchRow[] {
  const rows: WatchRow[] = [];
  for (const account of accounts) {
    const resolved = account.entitlements;
    if (!resolved) continue;
    const plan = canonicalPlan(resolved.plan);
    for (const feature of QUOTA_FEATURES) {
      const entry = resolved.features[feature];
      if (!entry || entry.limit === undefined) continue;
      const spent = (entry.used ?? 0) + (entry.reserved ?? 0);
      const limit = entry.limit ?? null;
      const standing = allowanceStanding(spent, limit);
      if (standing !== "near" && standing !== "over") continue;
      rows.push({
        account,
        plan,
        feature,
        spent,
        limit,
        periodKey: entry.period_key ?? "",
        standing,
        granted: entry.source !== "plan",
        pressure: limit === null || limit <= 0 ? 0 : spent / limit,
      });
    }
  }
  return rows.sort((left, right) => right.pressure - left.pressure);
}

function planTotals(access: AuthorizedAccess): Record<PlanKey, number> {
  const totals: Record<PlanKey, number> = { free: 0, pro: 0, desk: 0, teams: 0 };
  for (const [tier, count] of Object.entries(access.subscriptions?.plans ?? {})) {
    totals[canonicalPlan(tier)] += count;
  }
  return totals;
}

function DegradationNotice({ access }: { access: AuthorizedAccess }) {
  if (access.degraded.length === 0) return null;
  const parts: Record<(typeof access.degraded)[number], string> = {
    distribution: "the plan distribution",
    accounts: "the account directory",
    usage: "usage counters for some accounts",
    changes: "the change log",
  };
  return (
    <Callout tone="attention" role="status" title="Some of this page could not be loaded">
      {`Could not read ${access.degraded.map((item) => parts[item]).join(", ")}. Everything else on this page is current; nothing about any account has changed.`}
    </Callout>
  );
}

export function AdminSubscriptions({ access, now }: AdminSubscriptionsProps) {
  const authorized = access.status === "authorized" ? access : null;
  const totals = authorized ? planTotals(authorized) : null;
  const distribution = authorized?.subscriptions ?? null;
  const watch = authorized ? watchRows(authorized.accounts) : [];
  const scanned = authorized?.accounts.length ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Subscriptions"
        titleId="admin-subscriptions-heading"
        description="Which plans accounts sit on, who is running out of allowance, and every plan change made."
      />

      <div className="page-content">
        <AdminGate access={access} section="Subscriptions">
          {authorized && totals && (
            <>
              <DegradationNotice access={authorized} />

              <StatGrid columns={6} label="Plan distribution">
                <Stat
                  label="Active accounts"
                  value={distribution ? formatNumber(distribution.total_accounts) : "Not available"}
                  hint="Counted from active profiles"
                />
                {CANONICAL_PLANS.map((plan) => (
                  <Stat
                    key={plan}
                    label={planLabel(plan)}
                    value={formatNumber(totals[plan])}
                    hint={
                      distribution && distribution.total_accounts > 0
                        ? formatPercent(totals[plan] / distribution.total_accounts)
                        : undefined
                    }
                  />
                ))}
                <Stat
                  label="Near or over"
                  value={formatNumber(watch.length)}
                  hint={`Across ${pluralize(scanned, "account")} scanned`}
                  tone={watch.some((row) => row.standing === "over") ? "danger" : "default"}
                />
              </StatGrid>

              <Section
                id="admin-subscription-distribution"
                eyebrow="Distribution"
                title="Accounts by plan"
                description="Stored tiers as the database holds them, beside the plan each one resolves to."
              >
                {distribution ? (
                  <DataTable
                    columns={TIER_COLUMNS}
                    caption="Accounts by stored tier"
                    isEmpty={Object.keys(distribution.plans).length === 0}
                    empty={<EmptyState title="No active accounts were counted." compact />}
                  >
                    {Object.entries(distribution.plans)
                      .sort((left, right) => right[1] - left[1])
                      .map(([tier, count]) => (
                        <tr key={tier}>
                          <td>
                            <code className="mono">{tier || "(empty)"}</code>
                          </td>
                          <td>{planLabel(tier)}</td>
                          <td className="data-table__num">{formatNumber(count)}</td>
                          <td className="data-table__num">
                            {distribution.total_accounts > 0
                              ? formatPercent(count / distribution.total_accounts)
                              : "Not available"}
                          </td>
                        </tr>
                      ))}
                  </DataTable>
                ) : (
                  <EmptyState
                    title="The plan distribution could not be read."
                    description="Reload in a moment. Nothing about any account has changed."
                  />
                )}
              </Section>

              <Section
                id="admin-subscription-allowances"
                eyebrow="Allowances"
                title="Near or over allowance"
                description="Metered features only. Pulse is deterministic and is never metered."
              >
                <Toolbar
                  summary={`Scanned the ${pluralize(scanned, "most recently updated account")}, up to ${formatNumber(authorized.scanLimit)} a load. Each account is compared against its own resolved allowance, grants included — not against its plan's published default.`}
                />
                <DataTable
                  columns={WATCH_COLUMNS}
                  caption="Accounts near or over their allowance"
                  minWidth={860}
                  isEmpty={watch.length === 0}
                  empty={
                    <EmptyState
                      title="No scanned account is near its allowance."
                      description="Every metered feature on the accounts scanned is inside its own allowance."
                      compact
                    />
                  }
                >
                  {watch.map((row) => (
                    <tr key={`${row.account.user.user_id}-${row.feature}`}>
                      <td>
                        <span className="data-table__primary">
                          {row.account.user.display_name ||
                            row.account.user.email ||
                            "Unnamed account"}
                        </span>
                        <span className="data-table__secondary">
                          <ShortId
                            value={row.account.user.user_id}
                            href={`/product/users/${row.account.user.user_id}`}
                          />
                        </span>
                      </td>
                      <td>{planLabel(row.plan)}</td>
                      <td>
                        <span className="data-table__primary">{featureLabel(row.feature)}</span>
                        <span className="data-table__secondary">
                          {row.granted
                            ? `${row.periodKey || "current period"} · granted allowance`
                            : row.periodKey || "current period"}
                        </span>
                      </td>
                      <td>
                        <span className="data-table__primary num">
                          {`${formatNumber(row.spent)} of ${formatAllowance(row.limit)}`}
                        </span>
                        <Meter
                          label={`${featureLabel(row.feature)}: ${formatNumber(row.spent)} of ${formatAllowance(row.limit)} used`}
                          value={row.spent}
                          limit={row.limit}
                          tone={row.standing === "over" ? "danger" : "attention"}
                        />
                      </td>
                      <td>
                        <StatusPill
                          value={row.standing}
                          tone={STANDING_TONE[row.standing]}
                          label={STANDING_LABEL[row.standing]}
                        />
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </Section>

              <Section
                id="admin-subscription-changes"
                eyebrow="Audit"
                title="Recent plan and override changes"
                description="Every plan move and every allowance grant, as recorded in the audit trail."
              >
                {authorized.canReadChanges ? (
                  <DataTable
                    columns={CHANGE_COLUMNS}
                    caption="Recent plan and override changes"
                    minWidth={860}
                    isEmpty={authorized.changes.length === 0}
                    empty={
                      <EmptyState title="No plan or override changes have been recorded." compact />
                    }
                  >
                    {authorized.changes.map((event) => (
                      <tr key={event.id}>
                        <td>
                          <Timestamp
                            value={event.occurred_at}
                            now={now}
                            mode="both"
                            fallback="Unknown"
                          />
                        </td>
                        <td>
                          <span className="data-table__primary">
                            {subscriptionEventLabel(event.event_type)}
                          </span>
                        </td>
                        <td>
                          {event.subject_user_id ? (
                            <>
                              <span className="data-table__primary">
                                {event.subject_email || "Account"}
                              </span>
                              <span className="data-table__secondary">
                                <ShortId
                                  value={event.subject_user_id}
                                  href={`/product/users/${event.subject_user_id}`}
                                />
                              </span>
                            </>
                          ) : (
                            <span className="quiet">Not recorded</span>
                          )}
                        </td>
                        <td>
                          {event.actor_user_id ? (
                            <>
                              <span className="data-table__primary">
                                {event.actor_email || "Operator"}
                              </span>
                              <span className="data-table__secondary">
                                <ShortId value={event.actor_user_id} />
                              </span>
                            </>
                          ) : (
                            <span className="quiet">Not recorded</span>
                          )}
                        </td>
                        <td>
                          <StatusPill value={event.outcome} />
                        </td>
                      </tr>
                    ))}
                  </DataTable>
                ) : (
                  <Card
                    eyebrow="Permissions"
                    title="Change history needs audit access"
                    titleId="admin-subscription-changes-locked"
                    description="Your role can see plans and allowances but not the audit trail behind them. Ask an owner for audit access."
                  />
                )}
              </Section>
            </>
          )}
        </AdminGate>
      </div>
    </>
  );
}
