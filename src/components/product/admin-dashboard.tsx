import { AdminGate } from "@/components/product/admin-gate";
import { PageHeader } from "@/components/shell/page-header";
import { EnvBadge, RoleBadge } from "@/components/ui/badge";
import { BarChart } from "@/components/ui/bar-chart";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import { ShortId } from "@/components/ui/short-id";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import type { AdminDashboardAccess } from "@/lib/product/access";
import {
  capabilityLabel,
  mismatchLabel,
  mismatchTone,
  roleLabel,
  roleReportStatus,
} from "@/lib/product/role-labels";
import { formatNumber } from "@/lib/format";

type AdminDashboardProps = {
  access: AdminDashboardAccess;
  now?: number | undefined;
};

const REVIEW_COLUMNS = [
  { key: "user", label: "Account" },
  { key: "effective", label: "Effective" },
  { key: "database", label: "Database" },
  { key: "legacy", label: "Legacy" },
  { key: "reason", label: "Reason" },
] as const;

const DEGRADED_LABELS = {
  metrics: "Account metrics",
  "role-report": "Role report",
} as const;

export function AdminDashboard({ access, now }: AdminDashboardProps) {
  const { me } = access;
  const authorized = access.status === "authorized" ? access : null;
  const metrics = authorized?.metrics ?? null;
  const roleReport = authorized?.roleReport ?? null;
  const flaggedEvents = metrics
    ? (metrics.auth_events_24h.by_outcome.failure ?? 0) +
      (metrics.auth_events_24h.by_outcome.blocked ?? 0)
    : 0;
  const truncated = metrics
    ? metrics.limits.accounts_truncated ||
      metrics.limits.sessions_truncated ||
      metrics.limits.events_truncated
    : false;

  return (
    <>
      <PageHeader
        eyebrow="Product"
        title="Overview"
        titleId="admin-heading"
        description="Accounts, sessions and security events across Quantify Terminal, at a glance."
        meta={
          metrics ? (
            <Timestamp value={metrics.generated_at} now={now} prefix="Updated" />
          ) : undefined
        }
      />

      <div className="page-content">
        <AdminGate access={access} section="Dashboard">
          {authorized && authorized.degraded.length > 0 && (
            <Callout tone="attention" role="status" title="Some panels couldn't load">
              {authorized.degraded.map((item) => DEGRADED_LABELS[item]).join(" and ")}{" "}
              {authorized.degraded.length === 1 ? "is" : "are"} temporarily unavailable. Everything
              else on this page is current; refresh in a moment to try again.
            </Callout>
          )}

          {metrics && (
            <>
              <StatGrid columns={4} label="Accounts">
                <Stat label="Total accounts" value={formatNumber(metrics.accounts.total)} />
                <Stat label="Active accounts" value={formatNumber(metrics.accounts.active)} />
                <Stat label="New in 24h" value={formatNumber(metrics.accounts.created_24h)} />
                <Stat label="Signed in 24h" value={formatNumber(metrics.accounts.logged_in_24h)} />
              </StatGrid>
              <StatGrid columns={4} label="Sessions and events">
                <Stat label="Active sessions" value={formatNumber(metrics.sessions.active)} />
                <Stat
                  label="Desktop sessions"
                  value={formatNumber(metrics.sessions.by_source.desktop ?? 0)}
                />
                <Stat
                  label="Portal sessions"
                  value={formatNumber(metrics.sessions.by_source.portal ?? 0)}
                />
                <Stat label="Auth events 24h" value={formatNumber(metrics.auth_events_24h.total)} />
                <Stat
                  label="Flagged events"
                  value={formatNumber(flaggedEvents)}
                  tone={flaggedEvents > 0 ? "danger" : "default"}
                  hint="Failed or blocked, 24h"
                />
                <Stat label="Expired sessions" value={formatNumber(metrics.sessions.expired)} />
                <Stat label="Revoked sessions" value={formatNumber(metrics.sessions.revoked)} />
                <Stat
                  label="Coverage"
                  value={truncated ? "Partial" : "Complete"}
                  text
                  hint={
                    truncated
                      ? `Counts stop at ${formatNumber(metrics.limits.row_limit)} rows`
                      : "All rows counted"
                  }
                />
              </StatGrid>
              {metrics.series && metrics.series.signups.length > 0 && (
                <div className="chart-grid">
                  <BarChart
                    title="New accounts"
                    description={`per day, last ${metrics.series.days} days`}
                    segments={[{ key: "count", label: "Accounts" }]}
                    points={metrics.series.signups.map((point) => ({
                      label: point.date,
                      values: { count: point.count },
                    }))}
                  />
                  <BarChart
                    title="Authentication events"
                    description={`per day, last ${metrics.series.days} days`}
                    segments={[
                      { key: "success", label: "Success", tone: "success" },
                      { key: "failure", label: "Failed", tone: "danger" },
                      { key: "blocked", label: "Blocked", tone: "attention" },
                    ]}
                    points={metrics.series.auth_events.map((point) => ({
                      label: point.date,
                      values: {
                        success: point.success,
                        failure: point.failure,
                        blocked: point.blocked,
                      },
                    }))}
                  />
                </div>
              )}
            </>
          )}

          <div className="card-grid card-grid--2">
            <Card title="Your access" titleId="admin-access-heading" description={me.user.email}>
              <div className="access-badges">
                <RoleBadge role={me.role.effective} />
                <EnvBadge environment={me.environment} />
                <StatusPill
                  value={me.role.mismatch}
                  tone={mismatchTone(me.role.mismatch)}
                  label={mismatchLabel(me.role.mismatch)}
                />
              </div>
              {/* The permissions behind a count, not twenty-two chips: the role says what they
                  are; the list is there to check one. */}
              <details className="disclosure">
                <summary>
                  {me.capabilities.length}{" "}
                  {me.capabilities.length === 1 ? "permission" : "permissions"}
                </summary>
                <ul className="capability-list" aria-label="Granted permissions">
                  {me.capabilities.map((capability) => (
                    <li key={capability}>{capabilityLabel(capability)}</li>
                  ))}
                </ul>
              </details>
            </Card>

            <Card
              title="Role integrity"
              description={roleReportStatus(roleReport)}
              titleId="admin-role-integrity-heading"
              important={Boolean(roleReport) && !roleReport?.legacy_retirement_ready}
              actions={
                roleReport ? (
                  <ButtonLink href="/product/roles">Open role report</ButtonLink>
                ) : undefined
              }
            >
              <KeyValue columns={2}>
                <KeyValueRow label="Accounts">{formatNumber(roleReport?.total_users)}</KeyValueRow>
                <KeyValueRow label="Needs review">
                  {formatNumber(roleReport?.entries.length)}
                </KeyValueRow>
              </KeyValue>
            </Card>
          </div>

          {roleReport && (
            <Section
              id="admin-role-report"
              title="Needs review"
              eyebrow="Reconciliation"
              description="Accounts whose stored role and legacy registry entry disagree."
            >
              <DataTable
                columns={REVIEW_COLUMNS}
                caption="Role records needing review"
                isEmpty={roleReport.entries.length === 0}
                empty={<EmptyState title="No role differences need review." compact />}
              >
                {roleReport.entries.map((entry) => (
                  <tr key={entry.user_id}>
                    <td>
                      <ShortId value={entry.user_id} href={`/product/users/${entry.user_id}`} />
                    </td>
                    <td>{roleLabel(entry.effective_role)}</td>
                    <td>{entry.database_role ? roleLabel(entry.database_role) : "None"}</td>
                    <td>{entry.legacy_role ? roleLabel(entry.legacy_role) : "None"}</td>
                    <td>
                      <StatusPill
                        value={entry.mismatch}
                        tone={mismatchTone(entry.mismatch)}
                        label={mismatchLabel(entry.mismatch)}
                      />
                    </td>
                  </tr>
                ))}
              </DataTable>
            </Section>
          )}
        </AdminGate>
      </div>
    </>
  );
}
