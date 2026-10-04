import Link from "next/link";

import { formatPercent } from "@/lib/format";

/**
 * Ranked horizontal bars with the figure printed beside each: the honest way to compare
 * a handful of categories. Bars are drawn relative to the largest so the shape reads;
 * the share column carries each one's part of the whole.
 */

export type BarRow = {
  key: string;
  label: string;
  value: number;
  /** Share of the whole, 0–1; printed beside the value. */
  share?: number | undefined;
  /** A second line under the label, e.g. "12 customers". */
  sub?: string | undefined;
  tone?: "accent" | "loss" | "muted" | undefined;
  /** Where the records behind the bar are listed; the label becomes the link. */
  href?: string | undefined;
  /** Printed instead of the formatted value: "—" where there is nothing to measure. */
  display?: string | undefined;
};

export function BarList({
  rows,
  format,
  label,
  empty = "Nothing to show.",
}: {
  rows: readonly BarRow[];
  format: (value: number) => string;
  label: string;
  empty?: string | undefined;
}) {
  if (rows.length === 0) return <p className="side-quiet">{empty}</p>;
  const largest = Math.max(...rows.map((row) => Math.abs(row.value)), 1);
  return (
    <ul className="barlist" aria-label={label}>
      {rows.map((row) => (
        <li key={row.key} className="barlist__row">
          <span className="barlist__label">
            {row.href ? <Link href={row.href}>{row.label}</Link> : row.label}
            {row.sub && <span className="barlist__sub">{row.sub}</span>}
          </span>
          <span className="barlist__track" aria-hidden="true">
            <span
              className={`barlist__fill barlist__fill--${row.tone ?? "accent"}`}
              style={{ width: `${(Math.abs(row.value) / largest) * 100}%` }}
            />
          </span>
          <span className="barlist__value">{row.display ?? format(row.value)}</span>
          <span className="barlist__share">
            {row.share === undefined ? "" : formatPercent(row.share)}
          </span>
        </li>
      ))}
    </ul>
  );
}
