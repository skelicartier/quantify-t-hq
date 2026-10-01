"use client";

import { FileText } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { ShortId } from "@/components/ui/short-id";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import type { AccountApiAdminReports } from "@/lib/product/account-api";
import { AUDIT_FILTER_FIELDS } from "@/lib/product/audit-filters";
import { formatLabel, formatNumber, pluralize } from "@/lib/format";

type AdminReportActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

type Props = {
  reports: AccountApiAdminReports;
  action: (state: AdminReportActionState, data: FormData) => Promise<AdminReportActionState>;
  now?: number | undefined;
};

const INITIAL_ADMIN_REPORT_STATE: AdminReportActionState = {
  status: "idle",
  message: "",
};

const COLUMNS = [
  { key: "report", label: "Report" },
  { key: "status", label: "Status" },
  { key: "filters", label: "Filters" },
  { key: "rows", label: "Rows", align: "end" },
  { key: "expires", label: "Expires" },
  { key: "delivery", label: "Delivery" },
] as const;

function filterSummary(job: AccountApiAdminReports["jobs"][number]): string {
  const count = Object.values(job.filters).filter(Boolean).length;
  return count === 0 ? "All permitted events" : pluralize(count, "filter");
}

function Delivery({
  job,
  now,
}: {
  job: AccountApiAdminReports["jobs"][number];
  now?: number | undefined;
}) {
  if (job.status === "expired") return <span className="quiet">Expired</span>;
  if (job.download.available) return <span>Private file ready</span>;
  if (job.status === "failed")
    return <span className="field__error">{job.last_error || "Generation failed"}</span>;
  if (job.next_attempt_at) {
    return (
      <span className="quiet">
        Next attempt <Timestamp value={job.next_attempt_at} now={now} />
      </span>
    );
  }
  return <span className="quiet">Pending</span>;
}

export function AdminReportManager({ reports, action, now }: Props) {
  const [state, formAction, pending] = useActionState(action, INITIAL_ADMIN_REPORT_STATE);
  const queueFull = reports.jobs.length >= reports.queue.job_limit;

  return (
    <>
      <Section
        id="admin-report-enqueue"
        title="Queue an audit export"
        eyebrow="New report"
        description="Leave every filter empty to export all events you're permitted to see."
      >
        <form action={formAction} className="form">
          <input type="hidden" name="revision" value={reports.revision} />
          <fieldset className="fieldset" disabled={pending || queueFull}>
            <div className="form-grid">
              {AUDIT_FILTER_FIELDS.map((field) => (
                <Field key={field.name} id={`report-filter-${field.name}`} label={field.label}>
                  <Input
                    id={`report-filter-${field.name}`}
                    name={field.name}
                    placeholder={field.placeholder}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
              ))}
            </div>
          </fieldset>
          {queueFull && (
            <Callout role="status" tone="attention" compact>
              Report queue limit reached. Wait for a report to expire before queueing another.
            </Callout>
          )}
          {state.message && (
            <Callout
              tone={state.status === "error" ? "danger" : "success"}
              role={state.status === "error" ? "alert" : "status"}
              compact
            >
              {state.message}
            </Callout>
          )}
          <div className="form-actions">
            <Button variant="primary" type="submit" disabled={pending || queueFull}>
              <FileText size={16} aria-hidden="true" />
              {pending ? "Queueing…" : "Queue CSV"}
            </Button>
          </div>
        </form>
      </Section>

      <Section id="admin-report-jobs" title="Recent reports" eyebrow="Queue">
        <DataTable
          columns={COLUMNS}
          caption="Recent reports"
          isEmpty={reports.jobs.length === 0}
          empty={
            <EmptyState
              title="No reports queued."
              description="Queued exports appear here with their download status."
              compact
            />
          }
        >
          {reports.jobs.map((job) => (
            <tr key={job.id}>
              <td>
                <span className="data-table__primary">
                  {formatLabel(job.report_type)} {job.format.toUpperCase()}
                </span>
                <span className="data-table__secondary">
                  <ShortId value={job.id} />
                </span>
              </td>
              <td>
                <StatusPill value={job.status} />
              </td>
              <td>{filterSummary(job)}</td>
              <td className="data-table__num">{formatNumber(job.row_count)}</td>
              <td>
                <Timestamp
                  value={job.download.expires_at || job.expires_at}
                  now={now}
                  fallback="Pending"
                />
              </td>
              <td>
                <Delivery job={job} now={now} />
              </td>
            </tr>
          ))}
        </DataTable>
      </Section>
    </>
  );
}
