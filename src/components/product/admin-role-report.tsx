import { AdminGate } from "@/components/product/admin-gate";
import { PageHeader } from "@/components/shell/page-header";
import { RoleBadge } from "@/components/ui/badge";
import { Card, Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import { ShortId } from "@/components/ui/short-id";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { SegmentedLinks } from "@/components/ui/toolbar";
import type { AdminRoleReportAccess } from "@/lib/product/access";
import {
  mismatchLabel,
  mismatchTone,
  roleLabel,
  roleReportStatus,
} from "@/lib/product/role-labels";
import { formatNumber } from "@/lib/format";

type AdminRoleReportProps = {
  access: AdminRoleReportAccess;
};

const COLUMNS = [
  { key: "user", label: "Account" },
  { key: "effective", label: "Effective" },
  { key: "database", label: "Database" },
  { key: "legacy", label: "Legacy" },
  { key: "reason", label: "Reason" },
  { key: "configured", label: "Configured" },
] as const;

function orderedEntries(record: Record<string, number>): Array<[string, number]> {
  return Object.entries(record).sort(([left], [right]) => left.localeCompare(right));
}

export function AdminRoleReport({ access }: AdminRoleReportProps) {
  const authorized = access.status === "authorized" ? access : null;
  const report = authorized?.roleReport ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Product"
        title="Role reconciliation"
        titleId="admin-roles-heading"
        description="Compare each account's effective role with the stored role and the legacy registry."
        actions={
          authorized ? (
            <SegmentedLinks
              label="Report scope"
              items={[
                {
                  href: "/product/roles",
                  label: "Differences",
                  current: !authorized.includeMatches,
                },
                {
                  href: "/product/roles?include=matches",
                  label: "All entries",
                  current: authorized.includeMatches,
                },
              ]}
            />
          ) : undefined
        }
      />

      <div className="page-content">
        <AdminGate access={access} section="Role reconciliation">
          {report && (
            <>
              <div className="card-grid card-grid--2">
                <Card
                  eyebrow="Report status"
                  title={roleReportStatus(report)}
                  titleId="admin-role-status-heading"
                  important={!report.legacy_retirement_ready}
                  description={
                    report.legacy_retirement_ready
                      ? "Every account reads the same role from both stores."
                      : "At least one account reads differently from the stored role and the legacy registry."
                  }
                >
                  <KeyValue columns={2}>
                    <KeyValueRow label="Accounts">{formatNumber(report.total_users)}</KeyValueRow>
                    <KeyValueRow label="Records shown">
                      {formatNumber(report.entries.length)}
                    </KeyValueRow>
                  </KeyValue>
                </Card>
                <Card
                  eyebrow="Legacy registry"
                  title="Registry health"
                  titleId="admin-role-registry-heading"
                >
                  <KeyValue columns={2}>
                    <KeyValueRow label="Readable">
                      <StatusPill
                        value={report.legacy_source_available ? "yes" : "no"}
                        label={report.legacy_source_available ? "Yes" : "No"}
                      />
                    </KeyValueRow>
                    <KeyValueRow label="Entries">
                      {formatNumber(report.legacy_entry_count)}
                    </KeyValueRow>
                    <KeyValueRow label="Unreadable entries">
                      {formatNumber(report.legacy_unparsable_entry_count)}
                    </KeyValueRow>
                    <KeyValueRow label="Bootstrap admins">
                      {formatNumber(report.legacy_bootstrap_count)}
                    </KeyValueRow>
                    <KeyValueRow label="Configured owners">
                      {report.break_glass_disclosed ? "Included" : "Withheld"}
                    </KeyValueRow>
                    <KeyValueRow label="Registry documents">
                      {formatNumber(report.legacy_blob_entry_count)}
                    </KeyValueRow>
                  </KeyValue>
                </Card>
              </div>

              <StatGrid columns={4} label="Effective roles">
                {orderedEntries(report.counts_by_role).map(([role, count]) => (
                  <Stat key={role} label={roleLabel(role)} value={formatNumber(count)} />
                ))}
              </StatGrid>

              <StatGrid columns={4} label="Record health">
                {orderedEntries(report.counts_by_mismatch).map(([mismatch, count]) => (
                  <Stat
                    key={mismatch}
                    label={mismatchLabel(mismatch)}
                    value={formatNumber(count)}
                  />
                ))}
              </StatGrid>

              <Section
                id="admin-roles-entries"
                title="Role records"
                eyebrow={authorized?.includeMatches ? "All entries" : "Differences"}
              >
                <DataTable
                  columns={COLUMNS}
                  caption="Role records"
                  isEmpty={report.entries.length === 0}
                  empty={
                    <EmptyState title="No role records were returned for this view." compact />
                  }
                >
                  {report.entries.map((entry) => (
                    <tr key={entry.user_id}>
                      <td>
                        <ShortId value={entry.user_id} href={`/product/users/${entry.user_id}`} />
                      </td>
                      <td>
                        <RoleBadge role={entry.effective_role} />
                      </td>
                      <td>{entry.database_role ? roleLabel(entry.database_role) : "None"}</td>
                      <td>{entry.legacy_role ? roleLabel(entry.legacy_role) : "None"}</td>
                      <td>
                        <StatusPill
                          value={entry.mismatch}
                          tone={mismatchTone(entry.mismatch)}
                          label={mismatchLabel(entry.mismatch)}
                        />
                      </td>
                      <td>{entry.break_glass ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </DataTable>
              </Section>
            </>
          )}
        </AdminGate>
      </div>
    </>
  );
}
