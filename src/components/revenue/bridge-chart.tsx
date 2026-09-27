import type { BridgeMonth } from "@/lib/api/revenue";
import { formatMoney } from "@/lib/format";

/**
 * The MRR bridge as two aligned panels: where MRR ended each month, and what moved it.
 *
 * Gains stack above the zero line and losses below it, each kind in its own colour, so
 * a month where new business hid churn reads as exactly that. Plain SVG, drawn on the
 * server; every bar carries its exact figure as a tooltip, and the page puts the full
 * table beside it — the chart is for the shape, the table for the numbers.
 */

const WIDTH = 720;
const TOP = 120;
const GAP_BETWEEN = 16;
const BOTTOM = 120;
const HEIGHT = TOP + GAP_BETWEEN + BOTTOM;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const GAINS = [
  ["new", "New"],
  ["expansion", "Expansion"],
  ["reactivation", "Reactivation"],
] as const;
const LOSSES = [
  ["contraction", "Contraction"],
  ["churn", "Churn"],
] as const;

function monthLabel(month: string): string {
  const [year, number] = month.split("-");
  const name = MONTHS[Number(number) - 1] ?? month;
  return number === "01" ? `${name} ${year?.slice(2)}` : name;
}

export function BridgeChart({
  months,
  currency,
}: {
  months: readonly BridgeMonth[];
  currency: string;
}) {
  const slot = WIDTH / Math.max(months.length, 1);
  const barWidth = Math.max(4, slot * 0.56);
  const maxEnd = Math.max(1, ...months.map((month) => Math.max(month.end, 0)));
  const swing = Math.max(
    1,
    ...months.map((month) =>
      Math.max(
        month.new + month.expansion + month.reactivation + Math.max(month.adjustment, 0),
        -(month.contraction + month.churn + Math.min(month.adjustment, 0)),
      ),
    ),
  );
  const zero = TOP + GAP_BETWEEN + BOTTOM / 2;
  const half = BOTTOM / 2 - 4;
  const money = (value: number) => formatMoney(value, currency);
  const latest = months[months.length - 1];

  return (
    <figure className="bridge">
      <figcaption className="bridge__legend" aria-hidden="true">
        <span className="bridge__key bridge__key--end">MRR at month end</span>
        {GAINS.map(([key, label]) => (
          <span key={key} className={`bridge__key bridge__key--${key}`}>
            {label}
          </span>
        ))}
        {LOSSES.map(([key, label]) => (
          <span key={key} className={`bridge__key bridge__key--${key}`}>
            {label}
          </span>
        ))}
      </figcaption>
      <svg
        className="bridge__svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={
          latest
            ? `Monthly recurring revenue over ${months.length} months, ending at ${money(latest.end)}. The table below lists every figure.`
            : "No revenue recorded yet."
        }
        preserveAspectRatio="none"
      >
        <line className="bridge__axis" x1={0} x2={WIDTH} y1={TOP} y2={TOP} />
        <line className="bridge__zero" x1={0} x2={WIDTH} y1={zero} y2={zero} />
        {months.map((month, index) => {
          const x = index * slot + (slot - barWidth) / 2;
          const endHeight = (Math.max(month.end, 0) / maxEnd) * (TOP - 10);
          let above = zero;
          let below = zero;
          const gains = [
            ...GAINS.map(([key, label]) => ({ key, label, value: month[key] })),
            ...(month.adjustment > 0
              ? [{ key: "adjustment", label: "Adjustment", value: month.adjustment }]
              : []),
          ];
          const losses = [
            ...LOSSES.map(([key, label]) => ({ key, label, value: month[key] })),
            ...(month.adjustment < 0
              ? [{ key: "adjustment", label: "Adjustment", value: month.adjustment }]
              : []),
          ];
          return (
            <g
              key={month.month}
              className={month.partial ? "bridge__month bridge__month--partial" : "bridge__month"}
            >
              <rect
                className="bridge__bar bridge__bar--end"
                x={x}
                y={TOP - endHeight}
                width={barWidth}
                height={Math.max(endHeight, month.end > 0 ? 1 : 0)}
              >
                <title>{`${monthLabel(month.month)}: ${money(month.end)} at month end${month.partial ? " (so far)" : ""}`}</title>
              </rect>
              {gains.map((part) => {
                if (part.value <= 0) return null;
                const height = (part.value / swing) * half;
                above -= height;
                return (
                  <rect
                    key={part.key}
                    className={`bridge__seg bridge__seg--${part.key}`}
                    x={x}
                    y={above}
                    width={barWidth}
                    height={height}
                  >
                    <title>{`${monthLabel(month.month)} · ${part.label}: +${money(part.value)}`}</title>
                  </rect>
                );
              })}
              {losses.map((part) => {
                if (part.value >= 0) return null;
                const height = (-part.value / swing) * half;
                const y = below;
                below += height;
                return (
                  <rect
                    key={part.key}
                    className={`bridge__seg bridge__seg--${part.key}`}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={height}
                  >
                    <title>{`${monthLabel(month.month)} · ${part.label}: ${money(part.value)}`}</title>
                  </rect>
                );
              })}
            </g>
          );
        })}
      </svg>
      {/* Month names in HTML, not SVG text: they keep their size when the chart stretches. */}
      <ol
        className="bridge__months"
        style={{ gridTemplateColumns: `repeat(${Math.max(months.length, 1)}, minmax(0, 1fr))` }}
        aria-hidden="true"
      >
        {months.map((month) => (
          <li key={month.month}>{monthLabel(month.month)}</li>
        ))}
      </ol>
    </figure>
  );
}
