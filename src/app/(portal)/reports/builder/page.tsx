import Link from "next/link";

import { saveReportAction } from "@/app/(portal)/reports/actions";
import { FilterBuilder } from "@/components/lists/filter-builder";
import { ReportFigure } from "@/components/reports/report-figure";
import { ReportSaveForm } from "@/components/reports/report-save-form";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Select } from "@/components/ui/field";
import { FilterChips } from "@/components/ui/filter-chips";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readViews, type SavedView } from "@/lib/api/views";
import { describeFilter, parseFilters, serializeFilter } from "@/lib/lists/filters";
import {
  CHARTS,
  CHART_LABELS,
  REPORT_KINDS,
  REPORT_KIND_CAPABILITY,
  REPORT_KIND_LABELS,
  REPORT_STATUSES,
  definitionQuery,
  filterFieldsOf,
  groupingOptions,
  loadReport,
  measureOptions,
  parseDefinition,
  reportListKey,
  runReport,
  type Loaded,
  type ReportDefinition,
} from "@/lib/reports/builder";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Report builder" };
export const dynamic = "force-dynamic";

const BASE = "/reports/builder";

type ReportBuilderPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function sharingOf(view: SavedView): string {
  if (!view.shared) return "private";
  return view.team_edits ? "team_edits" : "team";
}

export default async function ReportBuilderPage({ searchParams }: ReportBuilderPageProps) {
  const context = await requireStaff(BASE);
  const params = await searchParams;
  const kinds = REPORT_KINDS.filter((kind) => hasCapability(context, REPORT_KIND_CAPABILITY[kind]));
  if (kinds.length === 0) {
    return (
      <>
        <PageHeader title="Report builder" />
        <Callout tone="neutral">Your role reads none of the records a report counts.</Callout>
      </>
    );
  }
  let definition = parseDefinition(params);
  if (!kinds.includes(definition.kind)) definition = parseDefinition({ kind: kinds[0] });
  const reportId = (firstSearchValue(params.report) ?? "").slice(0, 64);
  const today = new Date(requestNow()).toISOString().slice(0, 10);

  let saved: SavedView | null = null;
  let loaded: Loaded | null = null;
  let failure = "";
  try {
    const [views, records] = await Promise.all([
      reportId ? readViews(context.token, reportListKey(definition.kind)) : null,
      loadReport(context.token, definition, today),
    ]);
    saved = views?.views.find((view) => view.view_id === reportId) ?? null;
    loaded = records;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
    failure =
      "The records could not be read just now. This is a read failure, not an empty report.";
  }
  const result = loaded
    ? runReport(loaded, definition, hasCapability(context, "revenue:read"))
    : null;
  const fields = loaded ? filterFieldsOf(loaded) : [];
  const conditions = parseFilters(definition.filters, fields);
  const editing = saved !== null;
  const canManage = Boolean(saved && (saved.mine || hasCapability(context, "hq:admin")));
  const canEdit = canManage || Boolean(saved?.shared && saved.team_edits);
  const keep = { report: editing ? reportId : "" };
  const hrefWith = (changes: Partial<ReportDefinition>) =>
    `${BASE}?${definitionQuery({ ...definition, ...changes }, keep)}`;
  const statuses = REPORT_STATUSES[definition.kind];
  const query = definitionQuery(definition);

  return (
    <>
      <PageHeader
        eyebrow="Reports"
        title={saved ? `Change “${saved.name}”` : "Report builder"}
        description="Count, add up or average any list's records, grouped as you choose. Every figure opens the records behind it, read as you: what your role cannot see is not counted."
        actions={
          <>
            <Link className="btn btn--small" href="/reports/dashboard">
              My dashboard
            </Link>
            <Link className="btn btn--small" href="/reports/saved">
              Saved reports
            </Link>
          </>
        }
      />
      <div className="page-content report-builder">
        {reportId && !saved && !failure && (
          <Callout tone="neutral">
            That report is not one you can open: it was deleted, or it is not shared with you. What
            is below is a new report.
          </Callout>
        )}
        <section className="rsection" aria-labelledby="report-what">
          <div className="rsection__head">
            <h2 className="rsection__title" id="report-what">
              What it counts
            </h2>
          </div>
          {!editing && (
            <nav className="report-kinds" aria-label="Records">
              {kinds.map((kind) =>
                kind === definition.kind ? (
                  <span key={kind} className="report-kinds__current" aria-current="page">
                    {REPORT_KIND_LABELS[kind]}
                  </span>
                ) : (
                  <Link key={kind} className="btn btn--small" href={`${BASE}?kind=${kind}`}>
                    {REPORT_KIND_LABELS[kind]}
                  </Link>
                ),
              )}
            </nav>
          )}
          <form className="report-builder__form" method="get" action={BASE}>
            <input type="hidden" name="kind" value={definition.kind} />
            {editing && <input type="hidden" name="report" value={reportId} />}
            {conditions.map((condition, index) => (
              <input key={index} type="hidden" name="f" value={serializeFilter(condition)} />
            ))}
            {statuses && (
              <Field id="report-status" label="Which ones">
                <Select id="report-status" name="status" defaultValue={definition.status}>
                  {statuses.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field id="report-by" label="Grouped by">
              <Select id="report-by" name="by" defaultValue={definition.by}>
                <option value="">Nothing: one figure</option>
                {(loaded ? groupingOptions(loaded) : []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="report-measure" label="Measure">
              <Select id="report-measure" name="measure" defaultValue={definition.measure}>
                {(loaded
                  ? measureOptions(loaded, hasCapability(context, "revenue:read"))
                  : [{ value: "count", label: "How many" }]
                ).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="report-chart" label="Shown as">
              <Select id="report-chart" name="chart" defaultValue={definition.chart}>
                {CHARTS.map((chart) => (
                  <option key={chart} value={chart}>
                    {CHART_LABELS[chart]}
                  </option>
                ))}
              </Select>
            </Field>
            {result?.unit === "money" && result.currencies.length > 1 && (
              <Field id="report-currency" label="Currency">
                <Select id="report-currency" name="currency" defaultValue={result.currency}>
                  {result.currencies.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Button type="submit">Show</Button>
          </form>
          <FilterChips
            clearHref={hrefWith({ filters: [] })}
            chips={conditions.map((condition, index) => ({
              key: `f-${index}`,
              label: "Filter",
              value: describeFilter(condition, fields),
              removeHref: hrefWith({
                filters: conditions.filter((_, other) => other !== index).map(serializeFilter),
              }),
            }))}
          />
          {fields.length > 0 && (
            <div className="list-tools" aria-label="Report filters">
              <FilterBuilder
                fields={fields}
                basePath={BASE}
                currentQuery={definitionQuery(definition, keep)}
              />
            </div>
          )}
        </section>
        <section className="rsection" aria-labelledby="report-figure">
          <div className="rsection__head">
            <h2 className="rsection__title" id="report-figure">
              {REPORT_KIND_LABELS[definition.kind]}
              {statuses
                ? `, ${statuses.find((option) => option.value === definition.status)?.label.toLowerCase() ?? ""}`
                : ""}
            </h2>
          </div>
          {failure ? (
            <Callout tone="danger" role="alert">
              {failure}
            </Callout>
          ) : (
            result && (
              <ReportFigure
                result={result}
                definition={definition}
                reportId={editing ? reportId : ""}
                fromBuilder
              />
            )
          )}
        </section>
        {!failure && (
          <section className="rsection" aria-labelledby="report-save">
            <div className="rsection__head">
              <h2 className="rsection__title" id="report-save">
                {editing && canEdit ? "Save the changes" : "Save it"}
              </h2>
            </div>
            {editing && !canEdit && (
              <p className="page-note">
                Only its owner or an admin changes this report. Save these filters as a report of
                your own.
              </p>
            )}
            {editing && canEdit && saved ? (
              <ReportSaveForm
                action={saveReportAction}
                kind={definition.kind}
                query={query}
                reportId={saved.view_id}
                name={saved.name}
                sharing={sharingOf(saved)}
                canManage={canManage}
              />
            ) : (
              <ReportSaveForm
                action={saveReportAction}
                kind={definition.kind}
                query={query}
                name={saved ? `${saved.name} (my copy)` : ""}
              />
            )}
          </section>
        )}
      </div>
    </>
  );
}
