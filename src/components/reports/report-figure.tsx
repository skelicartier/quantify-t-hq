import Link from "next/link";

import { BarList } from "@/components/charts/bar-list";
import { TrendChart } from "@/components/charts/trend-chart";
import { DataTable } from "@/components/ui/data-table";
import { formatNumber, pluralize } from "@/lib/format";
import {
  formatReportValue,
  recordsHref,
  type ReportDefinition,
  type ReportResult,
} from "@/lib/reports/builder";

/**
 * A report drawn: the whole figure first, then each group as bars, a line over the months
 * or a table. Every figure links to the records behind it. What the measure could not use
 * is said under it, never folded in as zero.
 */
export function ReportFigure({
  result,
  definition,
  reportId = "",
  compact = false,
  moreHref,
  fromBuilder = false,
}: {
  result: ReportResult;
  definition: ReportDefinition;
  /** The saved report, so the records page can lead back to it. */
  reportId?: string;
  /** On a dashboard card: the latest year of months, or the first eight groups. */
  compact?: boolean;
  moreHref?: string;
  /** Drawn in the builder: the records page leads back to the builder, edits and all. */
  fromBuilder?: boolean;
}) {
  const format = (value: number | null) => formatReportValue(result, value);
  const hrefFor = (key?: string) => recordsHref(definition, key, reportId, fromBuilder);
  const counting = result.unit === "count";
  const grouped = Boolean(result.groupLabel);
  const lineWanted = definition.chart === "line";
  const line = lineWanted && result.time;
  const table = definition.chart === "table";
  // A line runs through the months only; records with no date are named under it, and a
  // month with nothing to average is left off rather than drawn as 0.
  const undated = line ? result.groups.find((group) => group.key === "") : undefined;
  const groups = line ? result.groups.filter((group) => group.key !== "") : result.groups;
  const shown = !compact ? groups : result.time ? groups.slice(-12) : groups.slice(0, 8);
  const hidden = groups.length - shown.length;
  const plotted = shown.filter(
    (group): group is typeof group & { value: number } => group.value !== null,
  );
  const groupWords = result.groupLabel.toLowerCase();

  return (
    <div className="report-figure">
      <p className="report-figure__whole">
        <span className="report-figure__label">{result.measureLabel}</span>
        <Link className="report-figure__value num" href={hrefFor()}>
          {format(result.total)}
        </Link>
        <span className="report-figure__of">
          {counting
            ? pluralize(result.matched, "record")
            : `over ${pluralize(result.matched, "record")}`}
          {result.unit === "money" && result.currency ? `, in ${result.currency}` : ""}
        </span>
      </p>
      {result.refused && <p className="report-figure__note">{result.refused}</p>}
      {result.leftOut.map((note) => (
        <p key={note.why} className="report-figure__note">
          {pluralize(note.count, "record")} {note.why} {note.count === 1 ? "is" : "are"} left out.
        </p>
      ))}
      {result.notes.map((note) => (
        <p key={note} className="report-figure__note">
          {note}
        </p>
      ))}
      {result.overlapping && (
        <p className="report-figure__note">
          A record in more than one {groupWords} is counted in each, so the groups add up to more
          than the whole.
        </p>
      )}
      {definition.by && !grouped && (
        <p className="report-figure__note">
          These records cannot be grouped that way; shown as one figure.
        </p>
      )}
      {lineWanted && grouped && !result.time && (
        <p className="report-figure__note">A line needs a grouping by month; shown as bars.</p>
      )}
      {undated && undated.count > 0 && (
        <p className="report-figure__note">
          <Link href={hrefFor("")}>{pluralize(undated.count, "record")}</Link> with no {groupWords}{" "}
          {undated.count === 1 ? "is" : "are"} not on the line.
        </p>
      )}
      {line && plotted.length < shown.length && (
        <p className="report-figure__note">
          Months with nothing to measure are left off the line; the table shows them.
        </p>
      )}
      {result.matched === 0 && <p className="side-quiet">No records match.</p>}
      {grouped &&
        shown.length > 0 &&
        !table &&
        (line ? (
          <TrendChart
            points={plotted.map((group) => ({
              label: group.label,
              value: group.value,
              title: `${group.label}: ${format(group.value)}`,
            }))}
            format={format}
            ariaLabel={`${result.measureLabel} by ${groupWords}`}
          />
        ) : (
          <BarList
            label={`${result.measureLabel} by ${groupWords}`}
            format={format}
            rows={shown.map((group) => ({
              key: group.key || "~",
              label: group.label,
              value: group.value ?? 0,
              display: group.value === null ? "—" : undefined,
              href: hrefFor(group.key),
              sub: counting ? undefined : pluralize(group.count, "record"),
            }))}
          />
        ))}
      {grouped && shown.length > 0 && (table || (line && !compact)) && (
        <DataTable
          caption={`${result.measureLabel} by ${groupWords}`}
          // Two or three columns: narrow enough for a dashboard card and a phone.
          minWidth={320}
          columns={[
            { key: "group", label: result.groupLabel },
            { key: "value", label: result.measureLabel, align: "end" as const },
            ...(counting ? [] : [{ key: "count", label: "Records", align: "end" as const }]),
          ]}
        >
          {shown.map((group) => (
            <tr key={group.key || "~"}>
              <td>
                <Link href={hrefFor(group.key)}>{group.label}</Link>
              </td>
              <td className="data-table__num">{format(group.value)}</td>
              {!counting && <td className="data-table__num">{formatNumber(group.count)}</td>}
            </tr>
          ))}
        </DataTable>
      )}
      {hidden > 0 && moreHref && (
        <p className="report-figure__more">
          <Link href={moreHref}>
            {result.time
              ? `And ${pluralize(hidden, "earlier month")}`
              : `And ${pluralize(hidden, "more group")}`}
          </Link>
        </p>
      )}
    </div>
  );
}
