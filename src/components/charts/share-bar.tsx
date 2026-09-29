import { formatPercent } from "@/lib/format";

/**
 * One bar cut into its parts — a mix, where the question is "how much of the whole is
 * each kind". Six colours from the palette, in order; more parts than that share the
 * last colour, so a mix with many small parts is folded before it gets here.
 */

export type ShareSegment = {
  key: string;
  label: string;
  value: number;
};

export function ShareBar({
  segments,
  format,
  label,
}: {
  segments: readonly ShareSegment[];
  format: (value: number) => string;
  label: string;
}) {
  const total = segments.reduce((sum, segment) => sum + Math.max(segment.value, 0), 0);
  if (total <= 0) return <p className="side-quiet">Nothing to show.</p>;
  return (
    <div className="sharebar">
      <div className="sharebar__track" role="img" aria-label={label}>
        {segments.map((segment, index) => (
          <span
            key={segment.key}
            className={`sharebar__seg sharebar__seg--${Math.min(index + 1, 6)}`}
            style={{ width: `${(Math.max(segment.value, 0) / total) * 100}%` }}
            title={`${segment.label}: ${format(segment.value)} · ${formatPercent(segment.value / total)}`}
          />
        ))}
      </div>
      <ul className="sharebar__legend">
        {segments.map((segment, index) => (
          <li
            key={segment.key}
            className={`sharebar__key sharebar__key--${Math.min(index + 1, 6)}`}
          >
            <span className="sharebar__name">{segment.label}</span>
            <span className="sharebar__figure">
              {format(segment.value)}
              <span className="sharebar__share"> · {formatPercent(segment.value / total)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
