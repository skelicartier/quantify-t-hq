/**
 * A figure's run of weeks or months as one small line, for a scorecard row: the shape at
 * a glance, the last point marked, every point's exact figure a hover away, and the
 * figures themselves written out beside it for anyone who cannot see the line. A point
 * with no figure (nothing counted yet) breaks the line rather than dropping to nought.
 */

export type SparkPoint = { label: string; value: number | null; complete: boolean };

const WIDTH = 120;
const HEIGHT = 28;
const PAD = 3;

export function Sparkline({
  points,
  format,
  label,
}: {
  points: readonly SparkPoint[];
  format: (value: number) => string;
  label: string;
}) {
  const known = points
    .map((point) => point.value)
    .filter((value): value is number => value !== null);
  const high = Math.max(0, ...known);
  const low = Math.min(0, ...known);
  const span = high - low || 1;
  const step = points.length > 1 ? (WIDTH - PAD * 2) / (points.length - 1) : 0;
  const x = (index: number) => PAD + index * step;
  const y = (value: number) => HEIGHT - PAD - ((value - low) / span) * (HEIGHT - PAD * 2);
  const runs: string[] = [];
  let run: string[] = [];
  points.forEach((point, index) => {
    if (point.value === null) {
      if (run.length) runs.push(run.join(" "));
      run = [];
      return;
    }
    run.push(`${x(index).toFixed(1)},${y(point.value).toFixed(1)}`);
  });
  if (run.length) runs.push(run.join(" "));
  const lastIndex = points.length - 1;
  const last = points[lastIndex];
  const said = points
    .map(
      (point) =>
        `${point.label} ${point.value === null ? "not counted" : format(point.value)}${point.complete ? "" : " so far"}`,
    )
    .join(", ");
  return (
    <span className="sparkline">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="sparkline__svg"
        role="img"
        aria-label={`${label}: ${said}`}
      >
        {low < 0 && <line className="sparkline__zero" x1={0} x2={WIDTH} y1={y(0)} y2={y(0)} />}
        {runs.map((line) => (
          <polyline
            key={line}
            className="sparkline__line"
            points={line}
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {last && last.value !== null && (
          <circle
            className={last.complete ? "sparkline__dot" : "sparkline__dot sparkline__dot--open"}
            cx={x(lastIndex)}
            cy={y(last.value)}
            r={2.5}
          />
        )}
        {points.map((point, index) => (
          <rect
            key={`${point.label}-${index}`}
            className="sparkline__hover"
            x={x(index) - step / 2}
            y={0}
            width={Math.max(step, 4)}
            height={HEIGHT}
          >
            <title>{`${point.label}: ${point.value === null ? "not counted" : format(point.value)}${point.complete ? "" : " so far"}`}</title>
          </rect>
        ))}
      </svg>
    </span>
  );
}
