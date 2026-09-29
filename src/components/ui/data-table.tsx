import type { ReactNode } from "react";

import { ColumnMenu } from "@/components/ui/column-menu";
import { TableKeys } from "@/components/ui/table-keys";

export type DataTableColumn = {
  key: string;
  label: ReactNode;
  align?: "start" | "end";
  width?: string;
};

type DataTableProps = {
  caption: string;
  columns: readonly DataTableColumn[];
  /** When true the frame renders `empty` instead of an empty `<table>`. */
  isEmpty?: boolean;
  empty?: ReactNode;
  minWidth?: number;
  /**
   * Let the frame grow to its rows instead of capping and scrolling. For a table whose
   * length is fixed by the product (the nine entitlement features, say) the cap only ever
   * clips the last row.
   */
  scroll?: boolean;
  /**
   * Offer a column menu above the table (on by default for four columns or more). The
   * choice is kept per device under the table's caption, so the caption must be stable.
   */
  columnMenu?: boolean;
  children: ReactNode;
};

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Bounded, scrollable table with a sticky header. Rows are plain `<tr>` children so
 * pages keep full control of cell content; the frame only owns the chrome. The frame is
 * a named, focusable region so keyboard users can scroll it.
 */
export function DataTable({
  caption,
  columns,
  isEmpty = false,
  empty,
  minWidth,
  scroll = true,
  columnMenu,
  children,
}: DataTableProps) {
  if (isEmpty) return <>{empty ?? null}</>;
  const tableId = `table-${slug(caption)}`;
  const menu =
    (columnMenu ?? columns.length >= 4)
      ? columns.map((column) => ({
          key: column.key,
          label: typeof column.label === "string" ? column.label : column.key,
        }))
      : null;
  return (
    <>
      {menu && (
        <div className="table-tools">
          <ColumnMenu tableId={tableId} columns={menu} />
        </div>
      )}
      <div
        className={scroll ? "table-frame" : "table-frame table-frame--full"}
        role="region"
        aria-label={caption}
        tabIndex={0}
      >
        <TableKeys />
        <table id={tableId} className="data-table" style={minWidth ? { minWidth } : undefined}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={column.align === "end" ? "data-table__num" : undefined}
                  style={column.width ? { width: column.width } : undefined}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </>
  );
}

export function CategoryRow({ label, span }: { label: ReactNode; span: number }) {
  return (
    <tr className="data-table__category">
      <td colSpan={span}>{label}</td>
    </tr>
  );
}
