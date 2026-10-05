import { describe, expect, it } from "vitest";

import { applyFilters, describeFilter, parseFilters, serializeFilter } from "@/lib/lists/filters";

const FIELDS = [
  { key: "country", label: "Country", kind: "text" as const },
  { key: "people", label: "People", kind: "number" as const },
  {
    key: "lifecycle",
    label: "Lifecycle",
    kind: "choice" as const,
    choices: [{ value: "customer", label: "Customer" }],
  },
];

const ROWS = [
  { name: "A", country: "United Kingdom", people: 3, lifecycle: "customer" },
  { name: "B", country: "", people: 0, lifecycle: "prospect" },
  { name: "C", country: "Australia", people: 12, lifecycle: "customer" },
];
const read = (row: (typeof ROWS)[number], field: string) =>
  (row as Record<string, string | number>)[field];

describe("filter conditions in the URL", () => {
  it("reads repeatable f= parameters and drops what it does not know", () => {
    expect(
      parseFilters(
        [
          "country:is:United Kingdom",
          "secret:is:x",
          "people:gt:",
          "people:gt:2",
          "country:between:a",
        ],
        FIELDS,
      ),
    ).toEqual([
      { field: "country", op: "is", value: "United Kingdom" },
      { field: "people", op: "gt", value: "2" },
    ]);
    expect(parseFilters(undefined, FIELDS)).toEqual([]);
    expect(serializeFilter({ field: "country", op: "has", value: "King" })).toBe(
      "country:has:King",
    );
  });

  it("applies every condition and treats numbers as numbers", () => {
    const names = (rows: typeof ROWS) => rows.map((row) => row.name);
    expect(names(applyFilters(ROWS, [{ field: "people", op: "gt", value: "2" }], read))).toEqual([
      "A",
      "C",
    ]);
    // No figure is neither more nor less than one.
    expect(
      applyFilters(
        [{ people: null }, { people: 3 }],
        [{ field: "people", op: "lt", value: "10" }],
        (row, field) => (field === "people" ? row.people : null),
      ),
    ).toEqual([{ people: 3 }]);
    expect(names(applyFilters(ROWS, [{ field: "people", op: "lt", value: "10" }], read))).toEqual([
      "A",
      "B",
    ]);
    expect(names(applyFilters(ROWS, [{ field: "country", op: "empty", value: "" }], read))).toEqual(
      ["B"],
    );
    expect(names(applyFilters(ROWS, [{ field: "country", op: "set", value: "" }], read))).toEqual([
      "A",
      "C",
    ]);
    expect(
      names(applyFilters(ROWS, [{ field: "country", op: "has", value: "king" }], read)),
    ).toEqual(["A"]);
    expect(
      names(
        applyFilters(
          ROWS,
          [
            { field: "lifecycle", op: "is", value: "customer" },
            { field: "country", op: "not", value: "Australia" },
          ],
          read,
        ),
      ),
    ).toEqual(["A"]);
  });

  it("describes a condition in words, naming a choice by its label", () => {
    expect(describeFilter({ field: "lifecycle", op: "is", value: "customer" }, FIELDS)).toBe(
      "Lifecycle is Customer",
    );
    expect(describeFilter({ field: "country", op: "empty", value: "" }, FIELDS)).toBe(
      "Country is empty",
    );
    expect(describeFilter({ field: "people", op: "gt", value: "5" }, FIELDS)).toBe(
      "People is more than 5",
    );
  });
});
