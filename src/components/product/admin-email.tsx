import { enqueueAdminEmail } from "@/app/(portal)/product/email/actions";
import { AdminEmailManager } from "@/components/product/admin-email-manager";
import { AdminGate } from "@/components/product/admin-gate";
import { PageHeader } from "@/components/shell/page-header";
import { Stat, StatGrid } from "@/components/ui/stat";
import { Timestamp } from "@/components/ui/timestamp";
import type { AdminEmailAccess } from "@/lib/product/access";
import { formatNumber } from "@/lib/format";

type AdminEmailProps = {
  access: AdminEmailAccess;
  now?: number | undefined;
};

export function AdminEmail({ access, now }: AdminEmailProps) {
  const queue = access.status === "authorized" ? access.queue : null;

  return (
    <>
      <PageHeader
        eyebrow="Product"
        title="Email"
        titleId="admin-email-heading"
        description="Queue account emails and watch their delivery."
        meta={
          queue ? <Timestamp value={queue.generated_at} now={now} prefix="Updated" /> : undefined
        }
      />
      <div className="page-content">
        <AdminGate access={access} section="Email">
          {queue && (
            <>
              <StatGrid columns={3} label="Email queue summary">
                <Stat
                  label="In queue"
                  value={formatNumber(queue.jobs.length)}
                  hint={`Up to ${formatNumber(queue.quota.queue_limit)} jobs`}
                />
                <Stat
                  label="Sent today"
                  value={`${formatNumber(queue.quota.queued_24h)} / ${formatNumber(queue.quota.daily_limit)}`}
                  hint="Daily quota"
                />
                <Stat
                  label="Needs attention"
                  value={formatNumber(
                    queue.jobs.filter((job) => job.status === "dead" || job.status === "retry")
                      .length,
                  )}
                />
              </StatGrid>
              <AdminEmailManager queue={queue} action={enqueueAdminEmail} now={now} />
            </>
          )}
        </AdminGate>
      </div>
    </>
  );
}
