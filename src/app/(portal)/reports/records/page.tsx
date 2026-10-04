import Link from "next/link";

import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { formatNumber, pluralize } from "@/lib/format";
import { describeFilter, parseFilters } from "@/lib/lists/filters";
import {
  REPORT_KIND_CAPABILITY,
  REPORT_KIND_LABELS,
  definitionQuery,
  filterFieldsOf,
  groupKeyFromParam,
  loadReport,
  parseDefinition,
  reportRecords,
  type Loaded,
} from "@/lib/reports/builder";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Records behind a figure" };
export const dynamic = "force-dynamic";

/** At most this many rows on the page; the count above says how many there are. */
const SHOWN = 500;

type ReportRecordsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The records behind one figure of a report: every match, or one group's — the same
 * reads and filters the report ran, so the count here is the figure's count.
 */
export default async function ReportRecordsPage({ searchParams }: ReportRecordsPageProps) {
  const context = await requireStaff("/reports/records");
  const params = await searchParams;
  const definition = parseDefinition(params);
  const groupKey = groupKeyFromParam(firstSearchValue(params.g));
  const reportId = (firstSearchValue(params.report) ?? "").slice(0, 64);
  // From the builder, back to the builder with the edits on screen; from a saved report,
  // back to it.
  const fromBuilder = firstSearchValue(params.from) === "builder";
  const back =
    reportId && !fromBuilder
      ? `/reports/saved/${reportId}`
      : `/reports/builder?${definitionQuery(definition, { report: reportId })}`;

  if (!hasCapability(context, REPORT_KIND_CAPABILITY[definition.kind])) {
    return (
      <>
        <PageHeader eyebrow="Report" title="Records behind a figure" />
        <Callout tone="neutral">
          Your role does not read {REPORT_KIND_LABELS[definition.kind].toLowerCase()}.
        </Callout>
      </>
    );
  }
  let loaded: Loaded | null = null;
  try {
    loaded = await loadReport(
      context.token,
      definition,
      new Date(requestNow()).toISOString().slice(0, 10),
    );
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const records = loaded ? reportRecords(loaded, definition, groupKey) : null;
  const fields = loaded ? filterFieldsOf(loaded) : [];
  const conditions = parseFilters(definition.filters, fields);
  const title = records?.groupLabel
    ? `${REPORT_KIND_LABELS[definition.kind]}: ${records.groupLabel}`
    : REPORT_KIND_LABELS[definition.kind];

  return (
    <>
      <PageHeader
        eyebrow="Records behind a figure"
        title={title}
        actions={
          <Link className="btn btn--small" href={back}>
            Back to the report
          </Link>
        }
      />
      <div className="page-content">
        {records === null ? (
          <Callout tone="danger" role="alert">
            The records could not be read just now. This is a read failure, not an empty figure.
          </Callout>
        ) : (
          <>
            <p className="page-note">
              {pluralize(records.lines.length, "record")}
              {conditions.length
                ? `, where ${conditions.map((condition) => describeFilter(condition, fields)).join("; ")}`
                : ""}
              .
              {records.lines.length > SHOWN
                ? ` The first ${formatNumber(SHOWN)} are listed; narrow the report to see the rest.`
                : ""}
            </p>
            <DataTable
              caption={title}
              columns={records.columns.map((label, index) => ({ key: `c${index}`, label }))}
              isEmpty={records.lines.length === 0}
              empty={<p className="page-note">No records match.</p>}
            >
              {records.lines.slice(0, SHOWN).map((line) => (
                <tr key={line.id}>
                  <td>
                    <Link href={line.path}>{line.title}</Link>
                  </td>
                  {line.cells.map((cell, index) => (
                    <td key={index}>{cell}</td>
                  ))}
                </tr>
              ))}
            </DataTable>
          </>
        )}
      </div>
    </>
  );
}
