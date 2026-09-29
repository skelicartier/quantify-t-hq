import { niceCeiling } from "@/lib/revenue/metrics";

/**
 * Signed columns over categories — a month's renewals, a month's net new MRR. Gains rise
 * from the zero line and losses fall from it; when nothing is negative the zero line is
 * the floor. Shapes in SVG that stretches, words in HTML that does not.
 */

export type ColumnPoint = {
  label: string;
  value: number;
  title?: string | undefined;
  /** A second line for the tooltip, e.g. "3 contracts". */
  hint?: string | undefined;
};

const WIDTH = 720;
const HEIGHT = 160;
const PAD = 6;

export function ColumnChart({
  columns,
  format,
  ariaLabel,
}: {
  columns: readonly ColumnPoint[];
  format: (value: number) => string;
  ariaLabel: string;
}) {
  const count = Math.max(columns.length, 1);
  const slot = WIDTH / count;
  const barWidth = Math.max(4, slot * 0.56);
  const ceiling = niceCeiling(Math.max(0, ...columns.map((column) => Math.abs(column.value))));
  const signed = columns.some((column) => column.value < 0);
  const zero = signed ? HEIGHT / 2 : HEIGHT - PAD;
  const reach = signed ? HEIGHT / 2 - PAD : HEIGHT - PAD * 2;
  const scale = (value: number) => (Math.abs(value) / ceiling) * reach;

  return (
    <figure className="columns">
      <div className="columns__plot">
        <div className="columns__y" aria-hidden="true">
          <span>{format(ceiling)}</span>
          {signed ? <span>{format(0)}</span> : <span />}
          <span>{signed ? format(-ceiling) : format(0)}</span>
        </div>
        <div className="columns__canvas">
          <svg
            className="columns__svg"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-label={ariaLabel}
            preserveAspectRatio="none"
          >
            <line className="columns__grid" x1={0} x2={WIDTH} y1={PAD} y2={PAD} />
            {signed && (
              <line
                className="columns__grid"
                x1={0}
                x2={WIDTH}
                y1={HEIGHT - PAD}
                y2={HEIGHT - PAD}
              />
            )}
            <line className="columns__zero" x1={0} x2={WIDTH} y1={zero} y2={zero} />
            {columns.map((column, index) => {
              const height = scale(column.value);
              const x = index * slot + (slot - barWidth) / 2;
              const y = column.value >= 0 ? zero - height : zero;
              return (
                <rect
                  key={`${column.label}-${index}`}
                  className={`columns__bar${column.value < 0 ? " columns__bar--loss" : ""}${column.value === 0 ? " columns__bar--none" : ""}`}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(height, column.value === 0 ? 1 : 0)}
                >
                  <title>
                    {`${column.title ?? column.label}: ${format(column.value)}${column.hint ? ` · ${column.hint}` : ""}`}
                  </title>
                </rect>
              );
            })}
          </svg>
        </div>
      </div>
      <ol
        className="columns__x"
        style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
        aria-hidden="true"
      >
        {columns.map((column, index) => (
          <li key={`${column.label}-${index}`}>{column.label}</li>
        ))}
      </ol>
    </figure>
  );
}
