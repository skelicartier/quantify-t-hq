import { niceCeiling } from "@/lib/revenue/metrics";

/**
 * One series over time as a line with a filled area under it, drawn on the server as
 * plain SVG. The shapes stretch to the card; the words do not: the axis figures and the
 * period labels are HTML laid over and under the drawing, so they keep their size at
 * every width. Every period carries its exact figure as a tooltip, and the page keeps
 * the full table beside the chart — the chart is for the shape.
 */

export type TrendPoint = {
  label: string;
  value: number;
  /** A fuller label for the tooltip; defaults to `label`. */
  title?: string | undefined;
};

const WIDTH = 720;
const HEIGHT = 200;
const PAD = 6;
/** The most period labels drawn under the axis; past it the labels thin out. */
const MAX_LABELS = 12;

export function TrendChart({
  points,
  format,
  ariaLabel,
  tone = "accent",
}: {
  points: readonly TrendPoint[];
  format: (value: number) => string;
  ariaLabel: string;
  tone?: "accent" | "success" | "info" | undefined;
}) {
  const count = Math.max(points.length, 1);
  const labelStep = Math.max(1, Math.ceil(count / MAX_LABELS));
  const slot = WIDTH / count;
  const ceiling = niceCeiling(Math.max(0, ...points.map((point) => point.value)));
  const y = (value: number) => HEIGHT - PAD - (Math.max(value, 0) / ceiling) * (HEIGHT - PAD * 2);
  const x = (index: number) => index * slot + slot / 2;
  const coordinates = points.map((point, index) => [x(index), y(point.value)] as const);
  const line = coordinates.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  const area =
    first && last ? `${first[0].toFixed(1)},${HEIGHT} ${line} ${last[0].toFixed(1)},${HEIGHT}` : "";
  const latest = points[points.length - 1];

  return (
    <figure className={`trend trend--${tone}`}>
      <div className="trend__plot">
        <div className="trend__y" aria-hidden="true">
          <span>{format(ceiling)}</span>
          <span>{format(ceiling / 2)}</span>
          <span>{format(0)}</span>
        </div>
        <div className="trend__canvas">
          <svg
            className="trend__svg"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-label={ariaLabel}
            preserveAspectRatio="none"
          >
            <line className="trend__grid" x1={0} x2={WIDTH} y1={y(ceiling)} y2={y(ceiling)} />
            <line
              className="trend__grid"
              x1={0}
              x2={WIDTH}
              y1={y(ceiling / 2)}
              y2={y(ceiling / 2)}
            />
            <line className="trend__grid trend__grid--base" x1={0} x2={WIDTH} y1={y(0)} y2={y(0)} />
            {area && <polygon className="trend__area" points={area} />}
            {line && (
              <polyline
                className="trend__line"
                points={line}
                vectorEffect="non-scaling-stroke"
                fill="none"
              />
            )}
            {points.map((point, index) => (
              <rect
                key={`${point.label}-${index}`}
                className="trend__hover"
                x={index * slot}
                y={0}
                width={slot}
                height={HEIGHT}
              >
                <title>{`${point.title ?? point.label}: ${format(point.value)}`}</title>
              </rect>
            ))}
          </svg>
          {last && latest && (
            <span
              className="trend__dot"
              style={{ left: `${(last[0] / WIDTH) * 100}%`, top: `${(last[1] / HEIGHT) * 100}%` }}
              aria-hidden="true"
            />
          )}
        </div>
      </div>
      <ol
        className="trend__x"
        style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
        aria-hidden="true"
      >
        {points.map((point, index) => (
          // Every period keeps its slot; past a dozen only every so many is named,
          // counted back from the latest so the newest is always one of them.
          <li key={`${point.label}-${index}`}>
            {(count - 1 - index) % labelStep === 0 ? point.label : ""}
          </li>
        ))}
      </ol>
    </figure>
  );
}
