import { DataTable } from "@/components/ui/data-table";
import { NUMBERS_ROWS, type NumbersRow } from "@/lib/data/labels";
import { formatNumber } from "@/lib/format";

/**
 * One view of the numbers: a row per count, a column per week or month. Every cell is the
 * service's count of records; the named-buyer row reads "1 of 3", out of the firms that
 * joined in that period ("0" when none joined). No bar, no target, no total.
 */

export type NumbersTablePeriod = { key: string; label: string };

export function namedWords(named: number, of: number): string {
  return of === 0 ? formatNumber(named) : `${formatNumber(named)} of ${formatNumber(of)}`;
}

export function NumbersTable({
  caption,
  periods,
  counts,
  namedOf,
  minWidth,
}: {
  caption: string;
  periods: readonly NumbersTablePeriod[];
  counts: Partial<Record<NumbersRow, number[]>>;
  /** The firms that joined in each period: what the named-buyer row is out of. */
  namedOf: readonly number[];
  minWidth?: number;
}) {
  const rows = (Object.keys(NUMBERS_ROWS) as NumbersRow[]).filter(
    (row) => counts[row] !== undefined,
  );
  return (
    <DataTable
      caption={caption}
      columns={[
        { key: "row", label: "Counted", width: "22%" },
        ...periods.map((period) => ({
          key: period.key,
          label: period.label,
          align: "end" as const,
        })),
      ]}
      columnMenu={false}
      {...(minWidth ? { minWidth } : {})}
    >
      {rows.map((row) => (
        <tr key={row}>
          <th scope="row" className="hqdata-numbers__row">
            {NUMBERS_ROWS[row]}
          </th>
          {(counts[row] ?? []).map((value, index) => (
            <td key={periods[index]?.key ?? index} className="data-table__num">
              {row === "named_buyers"
                ? namedWords(value, namedOf[index] ?? 0)
                : formatNumber(value)}
            </td>
          ))}
        </tr>
      ))}
    </DataTable>
  );
}
