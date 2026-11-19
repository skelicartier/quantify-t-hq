import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DataCore, type DueItem } from "../../scripts/data/core";
import { addDays } from "../../scripts/data/days";
import { overviewOf } from "../../scripts/data/overview";

const TODAY = "2026-11-19";
let dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

function coreOn(day: string): DataCore {
  const dir = mkdtempSync(join(tmpdir(), "hq-due-"));
  dirs.push(dir);
  return new DataCore({
    dir,
    post: () => undefined,
    log: () => undefined,
    now: () => new Date(`${day}T12:00:00+05:30`),
  });
}

function rows(prefix: string, from: number, count: number, extra: Partial<DueItem> = {}) {
  return Array.from({ length: count }, (_, index): DueItem => {
    const offset = from + index;
    return {
      key: `${prefix}-${index}`,
      kind: "key_date",
      title: `${prefix} ${String(index).padStart(2, "0")}`,
      sub: "",
      due_on: addDays(TODAY, offset),
      href: `/data/dates#${prefix}-${index}`,
      ...extra,
    };
  });
}

describe("Due never leaves out a row owed now", () => {
  it("keeps every row due today or earlier, fills to 30 with later rows, and counts the rest", async () => {
    const core = coreOn(TODAY);
    // 34 rows owed now (overdue and today), 20 later.
    core.provideDue(() => [...rows("late", -33, 33), ...rows("today", 0, 1)]);
    core.provideDue(() => rows("later", 1, 20));
    const { items, more } = await core.dueList();
    expect(items).toHaveLength(34);
    expect(items.every((item) => item.due_on <= TODAY)).toBe(true);
    expect(more).toBe(20);
    expect(items[0]?.due_on).toBe(addDays(TODAY, -33));
  });

  it("fills the list up to 30 with the soonest later rows", async () => {
    const core = coreOn(TODAY);
    core.provideDue(() => [...rows("late", -5, 5), ...rows("later", 1, 40)]);
    const { items, more } = await core.dueList();
    expect(items).toHaveLength(30);
    expect(items.filter((item) => item.due_on <= TODAY)).toHaveLength(5);
    expect(items.at(-1)?.due_on).toBe(addDays(TODAY, 25));
    expect(more).toBe(15);
    expect(await core.dueItems()).toEqual(items);
  });

  it("gives every row when asked for all, and nothing left out", async () => {
    const core = coreOn(TODAY);
    core.provideDue(() => rows("later", 1, 45));
    expect(await core.dueList({ all: true })).toMatchObject({ more: 0 });
    expect((await core.dueList({ all: true })).items).toHaveLength(45);
  });

  it("counts left-out rows without the Owner's own rows for an Admin", async () => {
    const core = coreOn(TODAY);
    core.provideDue(() => [...rows("later", 1, 30), ...rows("pay", 40, 5, { owner_only: true })]);
    expect(await core.dueList()).toMatchObject({ more: 0 });
    expect((await core.dueList({ owner: true })).more).toBe(5);
  });

  it("puts the count on the overview, 0 when nothing was left out", () => {
    const base = { today: TODAY, written: [], sending: null, due: [], parts: {} };
    expect(overviewOf(base).due_more).toBe(0);
    expect(overviewOf({ ...base, due_more: 7 }).due_more).toBe(7);
    expect(overviewOf({ ...base, parts: { due_more: 99 } }).due_more).toBe(0);
  });
});
