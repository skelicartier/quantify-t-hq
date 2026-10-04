import Link from "next/link";

import { deleteReportAction, pinReportAction } from "@/app/(portal)/reports/actions";
import { ReportFigure } from "@/components/reports/report-figure";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { directoryOrNull, nameFor } from "@/lib/api/staff";
import { readPreferences, readViews, type SavedView } from "@/lib/api/views";
import { formatDate } from "@/lib/format";
import { describeFilter, parseFilters } from "@/lib/lists/filters";
import {
  REPORT_KIND_CAPABILITY,
  REPORT_KIND_LABELS,
  REPORT_STATUSES,
  definitionQuery,
  filterFieldsOf,
  loadReport,
  parseDefinitionQuery,
  reportKindOfListKey,
  runReport,
  sharingWords,
  type Loaded,
} from "@/lib/reports/builder";
import { DASHBOARD_PREFERENCE, parsePins } from "@/lib/reports/pins";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Report" };
export const dynamic = "force-dynamic";

type SavedReportPageProps = { params: Promise<{ viewId: string }> };

export default async function SavedReportPage({ params }: SavedReportPageProps) {
  const { viewId } = await params;
  const context = await requireStaff(`/reports/saved/${viewId}`);
  let report: SavedView | null = null;
  let pinned = false;
  let failure = "";
  try {
    const [views, preferences] = await Promise.all([
      readViews(context.token, ""),
      readPreferences(context.token),
    ]);
    report =
      views.views.find(
        (view) => view.view_id === viewId && reportKindOfListKey(view.list_key) !== null,
      ) ?? null;
    pinned = parsePins(preferences.preferences[DASHBOARD_PREFERENCE]).includes(
      viewId.toLowerCase(),
    );
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
    failure = "The report could not be read just now.";
  }
  if (!report) {
    return (
      <>
        <PageHeader eyebrow="Reports" title="Report" />
        <div className="page-content">
          <Callout
            tone={failure ? "danger" : "neutral"}
            {...(failure ? { role: "alert" as const } : {})}
          >
            {failure ||
              "That report is not one you can open: it was deleted, or it is not shared with you."}{" "}
            <Link href="/reports/saved">Saved reports</Link>
          </Callout>
        </div>
      </>
    );
  }
  const kind = reportKindOfListKey(report.list_key)!;
  const definition = parseDefinitionQuery(report.query, kind);
  const canRead = hasCapability(context, REPORT_KIND_CAPABILITY[kind]);
  let loaded: Loaded | null = null;
  if (canRead) {
    try {
      loaded = await loadReport(
        context.token,
        definition,
        new Date(requestNow()).toISOString().slice(0, 10),
      );
    } catch (error) {
      if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
        throw error;
      failure =
        "The records could not be read just now. This is a read failure, not an empty report.";
    }
  }
  const result = loaded
    ? runReport(loaded, definition, hasCapability(context, "revenue:read"))
    : null;
  const fields = loaded ? filterFieldsOf(loaded) : [];
  const conditions = parseFilters(definition.filters, fields);
  const canManage = report.mine || hasCapability(context, "hq:admin");
  const canEdit = canManage || (report.shared && report.team_edits);
  const names = report.mine ? null : await directoryOrNull(context.token);
  const status = REPORT_STATUSES[kind]?.find((option) => option.value === definition.status);

  return (
    <>
      <PageHeader
        eyebrow="Report"
        title={report.name}
        actions={
          <>
            {canRead && (
              <ActForm
                action={pinReportAction}
                hidden={{ report_id: report.view_id }}
                act="pin"
                label={pinned ? "Take off my dashboard" : "Pin to my dashboard"}
              />
            )}
            {canEdit && canRead && (
              <Link
                className="btn btn--small"
                href={`/reports/builder?${definitionQuery(definition, { report: report.view_id })}`}
              >
                Change
              </Link>
            )}
            <Link className="btn btn--small" href={`/me/digests?view=${report.view_id}`}>
              Mail it to me
            </Link>
          </>
        }
      />
      <div className="page-content">
        <dl className="report-facts">
          <div>
            <dt>Counts</dt>
            <dd>
              {REPORT_KIND_LABELS[kind]}
              {status ? `, ${status.label.toLowerCase()}` : ""}
            </dd>
          </div>
          <div>
            <dt>Filters</dt>
            <dd>
              {conditions.length
                ? conditions.map((condition) => describeFilter(condition, fields)).join("; ")
                : "None: every record"}
            </dd>
          </div>
          <div>
            <dt>Owner</dt>
            <dd>{report.mine ? "You" : nameFor(names, report.owner_staff_id)}</dd>
          </div>
          <div>
            <dt>Who sees it</dt>
            <dd>{sharingWords(report)}</dd>
          </div>
          <div>
            <dt>Changed</dt>
            <dd>{formatDate(report.updated_at, "—")}</dd>
          </div>
        </dl>
        {!canRead ? (
          <Callout tone="neutral">
            Your role does not read {REPORT_KIND_LABELS[kind].toLowerCase()}, so this report has
            nothing to show you.
          </Callout>
        ) : failure ? (
          <Callout tone="danger" role="alert">
            {failure}
          </Callout>
        ) : (
          result && (
            <ReportFigure result={result} definition={definition} reportId={report.view_id} />
          )
        )}
        {canManage && (
          <section className="rsection" aria-labelledby="report-delete">
            <div className="rsection__head">
              <h2 className="rsection__title" id="report-delete">
                Delete
              </h2>
            </div>
            <p className="page-note">
              {report.shared
                ? "The team loses it too: it leaves their dashboards, and digests of it stop."
                : "It leaves your dashboard, and a digest of it stops."}
            </p>
            <ActForm
              action={deleteReportAction}
              hidden={{ report_id: report.view_id }}
              act="delete"
              label="Delete the report"
              danger
            />
          </section>
        )}
      </div>
    </>
  );
}
