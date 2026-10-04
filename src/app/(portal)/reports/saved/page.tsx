import Link from "next/link";

import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { directoryOrNull, nameFor } from "@/lib/api/staff";
import { readPreferences, readViews, type SavedView } from "@/lib/api/views";
import { formatDate } from "@/lib/format";
import { REPORT_KIND_LABELS, reportKindOfListKey, sharingWords } from "@/lib/reports/builder";
import { DASHBOARD_PREFERENCE, parsePins } from "@/lib/reports/pins";

export const metadata = { title: "Saved reports" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "name", label: "Report" },
  { key: "kind", label: "Counts" },
  { key: "owner", label: "Owner" },
  { key: "shared", label: "Who sees it" },
  { key: "updated", label: "Changed" },
  { key: "pinned", label: "My dashboard" },
];

/** Every report this person can open: their own first, then the team's shared ones. */
export default async function SavedReportsPage() {
  const context = await requireStaff("/reports/saved");
  let reports: SavedView[] | null = null;
  let pins: string[] = [];
  try {
    const [views, preferences] = await Promise.all([
      readViews(context.token, ""),
      readPreferences(context.token),
    ]);
    reports = views.views.filter((view) => reportKindOfListKey(view.list_key) !== null);
    pins = parsePins(preferences.preferences[DASHBOARD_PREFERENCE]);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const names = await directoryOrNull(context.token);

  return (
    <>
      <PageHeader
        eyebrow="Reports"
        title="Saved reports"
        description="Reports you saved, and the ones the team shared. Each runs as whoever opens it."
        actions={
          <>
            <Link className="btn btn--small" href="/reports/dashboard">
              My dashboard
            </Link>
            <Link className="btn btn--small btn--primary" href="/reports/builder">
              New report
            </Link>
          </>
        }
      />
      <div className="page-content">
        {reports === null ? (
          <Callout tone="danger" role="alert">
            The saved reports could not be read just now.
          </Callout>
        ) : reports.length === 0 ? (
          <EmptyState
            title="No reports yet"
            description="Build one from any list: what to count, how to group it, and how to draw it."
            action={
              <Link className="btn btn--primary" href="/reports/builder">
                New report
              </Link>
            }
          />
        ) : (
          <DataTable caption="Saved reports" columns={COLUMNS}>
            {reports.map((report) => {
              const kind = reportKindOfListKey(report.list_key)!;
              return (
                <tr key={report.view_id}>
                  <td>
                    <Link href={`/reports/saved/${report.view_id}`}>{report.name}</Link>
                  </td>
                  <td>{REPORT_KIND_LABELS[kind]}</td>
                  <td>{report.mine ? "You" : nameFor(names, report.owner_staff_id)}</td>
                  <td>{sharingWords(report)}</td>
                  <td>{formatDate(report.updated_at, "—")}</td>
                  <td>{pins.includes(report.view_id.toLowerCase()) ? "Pinned" : "—"}</td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </div>
    </>
  );
}
