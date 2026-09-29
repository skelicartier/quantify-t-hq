/**
 * Column sorting as URL state: `?sort=mrr` ascending, `?sort=-mrr` descending, absent
 * for the list's own order. Pure, so a page sorts the rows it already holds and the
 * table header only has to know what the next click would produce.
 */

export type SortDirection = "asc" | "desc";
export type SortState = { key: string; dir: SortDirection } | null;

/** "-mrr" → descending by mrr; "name" → ascending; anything not allowed → none. */
export function parseSort(raw: string | undefined, allowed: readonly string[]): SortState {
  if (!raw) return null;
  const dir: SortDirection = raw.startsWith("-") ? "desc" : "asc";
  const key = raw.replace(/^-/, "");
  return allowed.includes(key) ? { key, dir } : null;
}

export function serializeSort(state: SortState): string {
  if (!state) return "";
  return state.dir === "desc" ? `-${state.key}` : state.key;
}

/** What one click on a header produces: ascending, then descending, then the list's own order. */
export function nextSort(current: SortState, key: string): SortState {
  if (!current || current.key !== key) return { key, dir: "asc" };
  if (current.dir === "asc") return { key, dir: "desc" };
  return null;
}

export type SortValue = string | number | null | undefined;
export type SortAccessor<Row> = (row: Row) => SortValue;

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

function compare(a: SortValue, b: SortValue): number {
  const aMissing = a === null || a === undefined || a === "";
  const bMissing = b === null || b === undefined || b === "";
  if (aMissing && bMissing) return 0;
  // A missing value sorts last whichever way the column runs.
  if (aMissing) return 1;
  if (bMissing) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

/**
 * The rows in the requested order; stable, so rows the sort cannot tell apart keep the
 * order the service gave them. Missing values go last in both directions.
 */
export function sortRows<Row>(
  rows: readonly Row[],
  state: SortState,
  accessors: Readonly<Record<string, SortAccessor<Row>>>,
): Row[] {
  if (!state) return [...rows];
  const accessor = accessors[state.key];
  if (!accessor) return [...rows];
  const sign = state.dir === "desc" ? -1 : 1;
  return rows
    .map((row, index) => ({ row, index, value: accessor(row) }))
    .sort((a, b) => {
      const missingA = a.value === null || a.value === undefined || a.value === "";
      const missingB = b.value === null || b.value === undefined || b.value === "";
      // Missing values stay last even when the direction is reversed.
      if (missingA !== missingB) return missingA ? 1 : -1;
      const order = compare(a.value, b.value) * sign;
      return order !== 0 ? order : a.index - b.index;
    })
    .map((entry) => entry.row);
}

/**
 * A link builder for sortable headers: the current query with `sort` replaced by what a
 * click on `key` produces, and dropped entirely when that is the list's own order.
 */
export function sortHrefBuilder(
  path: string,
  query: Readonly<Record<string, string>>,
  current: SortState,
): (key: string) => string {
  return (key) => {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(query))
      if (value && name !== "sort") params.set(name, value);
    const next = serializeSort(nextSort(current, key));
    if (next) params.set("sort", next);
    const rendered = params.toString();
    return rendered ? `${path}?${rendered}` : path;
  };
}
