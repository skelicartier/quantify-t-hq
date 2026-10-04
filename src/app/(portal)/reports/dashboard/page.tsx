import Link from "next/link";

import { movePinAction, pinReportAction } from "@/app/(portal)/reports/actions";
import { ReportFigure } from "@/components/reports/report-figure";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readPreferences, readViews, type SavedView } from "@/lib/api/views";
import {
  REPORT_KIND_CAPABILITY,
  REPORT_KIND_LABELS,
  loadReport,
  parseDefinitionQuery,
  reportKindOfListKey,
  runReport,
  type Loaded,
  type ReportDefinition,
  type ReportResult,
} from "@/lib/reports/builder";
import { DASHBOARD_PREFERENCE, parsePins } from "@/lib/reports/pins";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "My dashboard" };
export const dynamic = "force-dynamic";

type Card = {
  report: SavedView;
  definition: ReportDefinition;
  result: ReportResult | null;
  problem: string;
};

/**
 * The reports a person pinned, in their order, each drawn small with a link to the whole.
 * Reports over the same records share one read.
 */
export default async function DashboardPage() {
  const context = await requireStaff("/reports/dashboard");
  let pins: string[] = [];
  let reports = new Map<string, SavedView>();
  let failure = false;
  try {
    const [views, preferences] = await Promise.all([
      readViews(context.token, ""),
      readPreferences(context.token),
    ]);
    pins = parsePins(preferences.preferences[DASHBOARD_PREFERENCE]);
    reports = new Map(
      views.views
        .filter((view) => reportKindOfListKey(view.list_key) !== null)
        .map((view) => [view.view_id.toLowerCase(), view]),
    );
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
    failure = true;
  }
  const today = new Date(requestNow()).toISOString().slice(0, 10);
  const canReadMoney = hasCapability(context, "revenue:read");
  const reads = new Map<string, Promise<Loaded>>();
  const pinned = pins
    .map((pin) => reports.get(pin))
    .filter((view): view is SavedView => Boolean(view));
  const cards: Card[] = await Promise.all(
    pinned.map(async (report) => {
      const kind = reportKindOfListKey(report.list_key)!;
      const definition = parseDefinitionQuery(report.query, kind);
      if (!hasCapability(context, REPORT_KIND_CAPABILITY[kind])) {
        return {
          report,
          definition,
          result: null,
          problem: `Your role does not read ${REPORT_KIND_LABELS[kind].toLowerCase()}.`,
        };
      }
      const key = `${kind}|${definition.status}`;
      if (!reads.has(key)) reads.set(key, loadReport(context.token, definition, today));
      try {
        const loaded = await reads.get(key)!;
        return {
          report,
          definition,
          result: runReport(loaded, definition, canReadMoney),
          problem: "",
        };
      } catch (error) {
        if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
          throw error;
        return {
          report,
          definition,
          result: null,
          problem:
            "Its records could not be read just now. This is a read failure, not an empty report.",
        };
      }
    }),
  );
  const gone = pins.length - pinned.length;

  return (
    <>
      <PageHeader
        eyebrow="Reports"
        title="My dashboard"
        description="The reports you pinned, read as you each time you open it."
        actions={
          <>
            <Link className="btn btn--small" href="/reports/saved">
              Saved reports
            </Link>
            <Link className="btn btn--small btn--primary" href="/reports/builder">
              New report
            </Link>
          </>
        }
      />
      <div className="page-content">
        {failure ? (
          <Callout tone="danger" role="alert">
            Your dashboard could not be read just now.
          </Callout>
        ) : cards.length === 0 ? (
          <EmptyState
            title="Nothing pinned yet"
            description="Open a saved report and pin it here, or build a new one."
            action={
              <Link className="btn btn--primary" href="/reports/saved">
                Saved reports
              </Link>
            }
          />
        ) : (
          <ol className="dashboard-grid" aria-label="Pinned reports">
            {cards.map((card, index) => (
              <li key={card.report.view_id} className="dashboard-card">
                <div className="dashboard-card__head">
                  <h2 className="dashboard-card__title">
                    <Link href={`/reports/saved/${card.report.view_id}`}>{card.report.name}</Link>
                  </h2>
                  <div className="dashboard-card__tools">
                    {index > 0 && (
                      <form action={movePinAction}>
                        <input type="hidden" name="report_id" value={card.report.view_id} />
                        <input type="hidden" name="direction" value="up" />
                        <button
                          type="submit"
                          className="btn btn--small btn--ghost"
                          aria-label={`Move ${card.report.name} up`}
                        >
                          Up
                        </button>
                      </form>
                    )}
                    {index < cards.length - 1 && (
                      <form action={movePinAction}>
                        <input type="hidden" name="report_id" value={card.report.view_id} />
                        <input type="hidden" name="direction" value="down" />
                        <button
                          type="submit"
                          className="btn btn--small btn--ghost"
                          aria-label={`Move ${card.report.name} down`}
                        >
                          Down
                        </button>
                      </form>
                    )}
                    <ActForm
                      action={pinReportAction}
                      hidden={{ report_id: card.report.view_id }}
                      act="unpin"
                      label="Take off"
                    />
                  </div>
                </div>
                {card.result ? (
                  <ReportFigure
                    result={card.result}
                    definition={card.definition}
                    reportId={card.report.view_id}
                    compact
                    moreHref={`/reports/saved/${card.report.view_id}`}
                  />
                ) : (
                  <p className="side-quiet">{card.problem}</p>
                )}
              </li>
            ))}
          </ol>
        )}
        {gone > 0 && (
          <p className="page-note">
            {gone === 1 ? "One pinned report is" : `${gone} pinned reports are`} no longer yours to
            open: deleted, or no longer shared with you.
          </p>
        )}
      </div>
    </>
  );
}
