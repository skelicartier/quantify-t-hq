import type { ReactNode } from "react";

import Link from "next/link";

import { ColumnMenu } from "@/components/ui/column-menu";
import { SelectAll } from "@/components/ui/select-all";
import { TableKeys } from "@/components/ui/table-keys";
import type { SortState } from "@/lib/lists/sort";

export type DataTableColumn = {
  key: string;
  label: ReactNode;
  align?: "start" | "end";
  width?: string;
  /** The header links to the sorted list; the page does the sorting. */
  sortable?: boolean;
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
  /** The current sort, drawn on the matching header. */
  sort?: SortState | undefined;
  /** Where a click on a sortable header goes. */
  sortHref?: ((key: string) => string) | undefined;
  /** A leading column of checkboxes; rows add their own `SelectCell`. */
  selectable?: boolean | undefined;
  children: ReactNode;
};

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** The id a table gets from its caption — what a selection bar or column menu targets. */
export function tableIdFor(caption: string): string {
  return `table-${slug(caption)}`;
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
  sort,
  sortHref,
  selectable = false,
  children,
}: DataTableProps) {
  if (isEmpty) return <>{empty ?? null}</>;
  const tableId = tableIdFor(caption);
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
          <ColumnMenu tableId={tableId} columns={menu} offset={selectable ? 1 : 0} />
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
              {selectable && (
                <th scope="col" className="data-table__select">
                  <SelectAll tableId={tableId} />
                </th>
              )}
              {columns.map((column) => {
                const sortable = Boolean(column.sortable && sortHref);
                const active = sortable && sort && sort.key === column.key ? sort : null;
                const classes = [
                  column.align === "end" ? "data-table__num" : "",
                  sortable ? "data-table__sortable" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className={classes || undefined}
                    style={column.width ? { width: column.width } : undefined}
                    aria-sort={
                      sortable
                        ? active
                          ? active.dir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                        : undefined
                    }
                  >
                    {sortable && sortHref ? (
                      <Link className="data-table__sort" href={sortHref(column.key)}>
                        {column.label}
                        <span className="data-table__sort-mark" aria-hidden="true">
                          {active ? (active.dir === "asc" ? "↑" : "↓") : "↕"}
                        </span>
                      </Link>
                    ) : (
                      column.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </>
  );
}

/** A row's checkbox, first in the row of a selectable table. */
export function SelectCell({ id, label }: { id: string; label: string }) {
  return (
    <td className="data-table__select">
      <input type="checkbox" data-select="" value={id} aria-label={`Select ${label}`} />
    </td>
  );
}

export function CategoryRow({ label, span }: { label: ReactNode; span: number }) {
  return (
    <tr className="data-table__category">
      <td colSpan={span}>{label}</td>
    </tr>
  );
}
