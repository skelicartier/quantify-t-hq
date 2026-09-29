import { describe, expect, it } from "vitest";

import { nextSort, parseSort, serializeSort, sortHrefBuilder, sortRows } from "@/lib/lists/sort";

const ALLOWED = ["name", "mrr", "updated"];

describe("sort state in the URL", () => {
  it("reads a leading minus as descending and refuses unknown keys", () => {
    expect(parseSort("mrr", ALLOWED)).toEqual({ key: "mrr", dir: "asc" });
    expect(parseSort("-mrr", ALLOWED)).toEqual({ key: "mrr", dir: "desc" });
    expect(parseSort("secret", ALLOWED)).toBeNull();
    expect(parseSort(undefined, ALLOWED)).toBeNull();
    expect(parseSort("", ALLOWED)).toBeNull();
  });

  it("round-trips through serialize", () => {
    expect(serializeSort({ key: "name", dir: "asc" })).toBe("name");
    expect(serializeSort({ key: "name", dir: "desc" })).toBe("-name");
    expect(serializeSort(null)).toBe("");
  });

  it("cycles ascending, descending, off on the same column and restarts on another", () => {
    expect(nextSort(null, "mrr")).toEqual({ key: "mrr", dir: "asc" });
    expect(nextSort({ key: "mrr", dir: "asc" }, "mrr")).toEqual({ key: "mrr", dir: "desc" });
    expect(nextSort({ key: "mrr", dir: "desc" }, "mrr")).toBeNull();
    expect(nextSort({ key: "mrr", dir: "desc" }, "name")).toEqual({ key: "name", dir: "asc" });
  });

  it("builds header links that keep the other filters and drop sort when off", () => {
    const href = sortHrefBuilder(
      "/companies",
      { q: "man", lifecycle: "customer", sort: "-mrr" },
      { key: "mrr", dir: "desc" },
    );
    expect(href("mrr")).toBe("/companies?q=man&lifecycle=customer");
    expect(href("name")).toBe("/companies?q=man&lifecycle=customer&sort=name");
    expect(sortHrefBuilder("/leads", {}, null)("stage")).toBe("/leads?sort=stage");
  });
});

type Row = { name: string; mrr: number | null; updated: string | null };
const ROWS: Row[] = [
  { name: "Beta", mrr: 200, updated: "2026-09-01" },
  { name: "alpha", mrr: null, updated: "2026-09-03" },
  { name: "Gamma", mrr: 50, updated: null },
  { name: "delta", mrr: 200, updated: "2026-09-02" },
];
const ACCESS = {
  name: (row: Row) => row.name,
  mrr: (row: Row) => row.mrr,
  updated: (row: Row) => row.updated,
};

describe("sorting rows", () => {
  it("keeps the service's order when there is no sort", () => {
    expect(sortRows(ROWS, null, ACCESS).map((row) => row.name)).toEqual([
      "Beta",
      "alpha",
      "Gamma",
      "delta",
    ]);
  });

  it("compares text without caring about case", () => {
    expect(sortRows(ROWS, { key: "name", dir: "asc" }, ACCESS).map((row) => row.name)).toEqual([
      "alpha",
      "Beta",
      "delta",
      "Gamma",
    ]);
  });

  it("puts missing values last in both directions and is stable among equals", () => {
    expect(sortRows(ROWS, { key: "mrr", dir: "asc" }, ACCESS).map((row) => row.name)).toEqual([
      "Gamma",
      "Beta",
      "delta",
      "alpha",
    ]);
    expect(sortRows(ROWS, { key: "mrr", dir: "desc" }, ACCESS).map((row) => row.name)).toEqual([
      "Beta",
      "delta",
      "Gamma",
      "alpha",
    ]);
  });

  it("sorts ISO dates as text, which is chronological", () => {
    expect(sortRows(ROWS, { key: "updated", dir: "desc" }, ACCESS).map((row) => row.name)).toEqual([
      "alpha",
      "delta",
      "Beta",
      "Gamma",
    ]);
  });

  it("ignores an accessor the page did not declare", () => {
    expect(sortRows(ROWS, { key: "owner", dir: "asc" }, ACCESS)).toEqual(ROWS);
  });
});
