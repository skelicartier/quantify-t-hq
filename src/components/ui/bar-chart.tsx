import { formatNumber } from "@/lib/format";

export type BarChartSegment = {
  key: string;
  label: string;
  tone?: "default" | "success" | "danger" | "attention" | undefined;
};

export type BarChartPoint = {
  /** ISO date (YYYY-MM-DD) or any short label for the x axis. */
  label: string;
  values: Readonly<Record<string, number>>;
};

type BarChartProps = {
  title: string;
  description?: string | undefined;
  segments: readonly BarChartSegment[];
  points: readonly BarChartPoint[];
  /** Height of the plotting area in pixels; the SVG scales to its container's width. */
  height?: number | undefined;
};

const WIDTH = 600;
const GAP = 2;
const AXIS = 18;

function shortLabel(label: string): string {
  // "2026-09-11" → "11 Sep"; anything else is shown as given.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(label);
  if (!match) return label;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${Number(match[3])} ${months[Number(match[2]) - 1] ?? ""}`.trim();
}

function total(point: BarChartPoint, segments: readonly BarChartSegment[]): number {
  return segments.reduce((sum, segment) => sum + (point.values[segment.key] ?? 0), 0);
}

/**
 * A stacked bar chart drawn as plain SVG: no client script, no library, no gradients.
 * Every bar carries a `<title>` so the exact value is one hover away, and the same
 * numbers are repeated in a visually hidden table for assistive technology.
 */
export function BarChart({ title, description, segments, points, height = 120 }: BarChartProps) {
  const max = Math.max(1, ...points.map((point) => total(point, segments)));
  const plotHeight = height - AXIS;
  const slot = points.length > 0 ? WIDTH / points.length : WIDTH;
  const barWidth = Math.max(1, slot - GAP);
  const sum = points.reduce((acc, point) => acc + total(point, segments), 0);
  const labelEvery = points.length > 16 ? Math.ceil(points.length / 8) : 1;

  return (
    <figure className="chart">
      <figcaption className="chart__caption">
        <span className="chart__title">{title}</span>
        {description && <span className="chart__desc">{description}</span>}
        <span className="chart__total num">{formatNumber(sum)}</span>
      </figcaption>
      {segments.length > 1 && (
        <ul className="chart__legend" aria-hidden="true">
          {segments.map((segment) => (
            <li
              key={segment.key}
              className={`chart__legend-item chart__legend-item--${segment.tone ?? "default"}`}
            >
              {segment.label}
            </li>
          ))}
        </ul>
      )}
      <svg
        className="chart__svg"
        viewBox={`0 0 ${WIDTH} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${title}: ${formatNumber(sum)} across ${points.length} periods`}
      >
        <line className="chart__baseline" x1={0} x2={WIDTH} y1={plotHeight} y2={plotHeight} />
        {points.map((point, index) => {
          const x = index * slot;
          let cursor = plotHeight;
          const pointTotal = total(point, segments);
          return (
            <g key={point.label}>
              {segments.map((segment) => {
                const value = point.values[segment.key] ?? 0;
                const barHeight = value > 0 ? Math.max(1, (value / max) * (plotHeight - 4)) : 0;
                cursor -= barHeight;
                return (
                  <rect
                    key={segment.key}
                    className={`chart__bar chart__bar--${segment.tone ?? "default"}`}
                    x={x}
                    y={cursor}
                    width={barWidth}
                    height={barHeight}
                  >
                    <title>
                      {`${shortLabel(point.label)} · ${segment.label}: ${formatNumber(value)}`}
                    </title>
                  </rect>
                );
              })}
              {pointTotal === 0 && (
                <rect
                  className="chart__bar chart__bar--empty"
                  x={x}
                  y={plotHeight - 1}
                  width={barWidth}
                  height={1}
                />
              )}
              {index % labelEvery === 0 && (
                <text className="chart__axis" x={x} y={height - 4}>
                  {shortLabel(point.label)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            {segments.map((segment) => (
              <th key={segment.key} scope="col">
                {segment.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.label}>
              <th scope="row">{point.label}</th>
              {segments.map((segment) => (
                <td key={segment.key}>{formatNumber(point.values[segment.key] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
