import { enqueueAdminReport } from "@/app/(portal)/product/reports/actions";
import { AdminGate } from "@/components/product/admin-gate";
import { AdminReportManager } from "@/components/product/admin-report-manager";
import { PageHeader } from "@/components/shell/page-header";
import { Stat, StatGrid } from "@/components/ui/stat";
import { Timestamp } from "@/components/ui/timestamp";
import type { AdminReportsAccess } from "@/lib/product/access";
import { formatNumber } from "@/lib/format";

type AdminReportsProps = {
  access: AdminReportsAccess;
  now?: number | undefined;
};

export function AdminReports({ access, now }: AdminReportsProps) {
  const reports = access.status === "authorized" ? access.reports : null;

  return (
    <>
      <PageHeader
        eyebrow="Product"
        title="Reports"
        titleId="admin-reports-heading"
        description="Private CSV exports of the audit log, generated in the background."
        meta={
          reports ? (
            <Timestamp value={reports.generated_at} now={now} prefix="Updated" />
          ) : undefined
        }
      />
      <div className="page-content">
        <AdminGate access={access} section="Reports">
          {reports && (
            <>
              <StatGrid columns={3} label="Report queue summary">
                <Stat label="Queued jobs" value={formatNumber(reports.jobs.length)} />
                <Stat
                  label="Queue capacity"
                  value={`${formatNumber(reports.jobs.length)} / ${formatNumber(reports.queue.job_limit)}`}
                />
                <Stat
                  label="Ready to download"
                  value={formatNumber(reports.jobs.filter((job) => job.download.available).length)}
                />
              </StatGrid>
              <AdminReportManager reports={reports} action={enqueueAdminReport} now={now} />
            </>
          )}
        </AdminGate>
      </div>
    </>
  );
}
