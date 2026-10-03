/**
 * A filter builder's conditions, carried in the URL as repeatable `f=field:op:value`
 * parameters and applied to the rows a list already has. The lists are read whole (no
 * paging), so a filter applied here is complete, not a page's worth.
 *
 * Operators: `is`, `not`, `has` (contains, case-insensitive) and `nhas` (does not), `in`
 * (is any of a comma-separated list) and `nin` (is none of), `gt`, `lt`, `empty`, `set`.
 * A field the list does not know, or an operator it does not, is dropped rather than
 * refused: a stale link degrades to "no filter", never to an error.
 */

export const FILTER_OPS = [
  "is",
  "not",
  "has",
  "nhas",
  "in",
  "nin",
  "gt",
  "lt",
  "empty",
  "set",
] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

export type FilterCondition = { field: string; op: FilterOp; value: string };

export type FilterField = {
  key: string;
  label: string;
  /** "text" compares as strings, "number" as numbers, "choice" offers the values. */
  kind: "text" | "number" | "choice";
  choices?: readonly { value: string; label: string }[];
};

export const OP_LABELS: Record<FilterOp, string> = {
  is: "is",
  not: "is not",
  has: "contains",
  nhas: "does not contain",
  in: "is any of",
  nin: "is none of",
  gt: "is more than",
  lt: "is less than",
  empty: "is empty",
  set: "is set",
};

const NEEDS_VALUE: ReadonlySet<FilterOp> = new Set([
  "is",
  "not",
  "has",
  "nhas",
  "in",
  "nin",
  "gt",
  "lt",
]);

function listed(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

export function parseFilters(
  raw: string | string[] | undefined,
  fields: readonly FilterField[],
): FilterCondition[] {
  const known = new Set(fields.map((field) => field.key));
  const values = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const parsed: FilterCondition[] = [];
  for (const entry of values) {
    const [field = "", op = "", ...rest] = entry.split(":");
    const value = rest.join(":").slice(0, 120);
    if (!known.has(field) || !(FILTER_OPS as readonly string[]).includes(op)) continue;
    if (NEEDS_VALUE.has(op as FilterOp) && value === "") continue;
    parsed.push({ field, op: op as FilterOp, value });
    if (parsed.length >= 8) break;
  }
  return parsed;
}

export function serializeFilter(condition: FilterCondition): string {
  return `${condition.field}:${condition.op}:${condition.value}`;
}

/** The rows that satisfy every condition. `read` gives a field's value for a row. */
export function applyFilters<Row>(
  rows: readonly Row[],
  conditions: readonly FilterCondition[],
  read: (row: Row, field: string) => string | number | null | undefined,
): Row[] {
  if (conditions.length === 0) return [...rows];
  return rows.filter((row) =>
    conditions.every((condition) => {
      const value = read(row, condition.field);
      const text = value === null || value === undefined ? "" : String(value);
      switch (condition.op) {
        case "empty":
          return text === "";
        case "set":
          return text !== "";
        case "is":
          return text.toLowerCase() === condition.value.toLowerCase();
        case "not":
          return text.toLowerCase() !== condition.value.toLowerCase();
        case "has":
          return text.toLowerCase().includes(condition.value.toLowerCase());
        case "nhas":
          return !text.toLowerCase().includes(condition.value.toLowerCase());
        case "in":
          return listed(condition.value).includes(text.toLowerCase());
        case "nin":
          return !listed(condition.value).includes(text.toLowerCase());
        case "gt":
        case "lt": {
          const left = typeof value === "number" ? value : Number(text);
          const right = Number(condition.value);
          if (Number.isNaN(left) || Number.isNaN(right)) return false;
          return condition.op === "gt" ? left > right : left < right;
        }
        default:
          return true;
      }
    }),
  );
}

/** A human line for a chip: "Country is United Kingdom". */
export function describeFilter(condition: FilterCondition, fields: readonly FilterField[]): string {
  const field = fields.find((candidate) => candidate.key === condition.field);
  const label = field?.label ?? condition.field;
  const shown =
    field?.kind === "choice"
      ? (field.choices?.find((choice) => choice.value === condition.value)?.label ??
        condition.value)
      : condition.value;
  return NEEDS_VALUE.has(condition.op)
    ? `${label} ${OP_LABELS[condition.op]} ${shown}`
    : `${label} ${OP_LABELS[condition.op]}`;
}
