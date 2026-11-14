// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import { nextCheckIn } from "../../scripts/data/pilots/index";
import { CRITERIA_HINT, PILOTS_LINE } from "@/lib/data/labels-close";
import { closeKit, codeOf, entry, messageOf, type CloseKit } from "./close-kit";

/**
 * Pilots (ws-notes/company/spec.md §9.3, §9.6, §5.6) on the real pilots module: every
 * refusal, starting, check-ins and the next one's day, decisions (an extension keeps it
 * running with new days), the running line at 0, 1, 5 and 6 (a sentence, never a refusal:
 * a sixth pilot is accepted), Due rows and `agenda:pilots`. Every firm is invented.
 */

let kits: CloseKit[] = [];
afterEach(() => {
  for (const kit of kits) kit.close();
  kits = [];
});

const today = () => localDay(new Date());
const day = (offset: number) => addDays(today(), offset);

async function fresh(count = 8): Promise<CloseKit> {
  const kit = await closeKit({
    entries: Array.from({ length: count }, (_, index) => entry(index + 1)),
  });
  kits.push(kit);
  return kit;
}

const plan = (kit: CloseKit, n: number, change: Record<string, unknown> = {}) =>
  kit.post("/data/pilots", {
    entry_id: entry(n).entry_id,
    starts_on: day(0),
    ends_on: day(30),
    criteria: [
      { what: "Analysts use it every day", target: "Two analysts, five days a week" },
      { what: "Answers checked against the desk's own", target: "Nine in ten match" },
    ],
    owners: { sponsor: "Walk Sponsor", technical: "", user: "Walk Analyst" },
    price: { amount: "50000", currency: "INR", note: "20 per cent upfront" },
    conversion: null,
    go_no_go_on: day(28),
    attempt: crypto.randomUUID(),
    ...change,
  });

const pilotId = (answer: { body: Record<string, unknown> }) =>
  String((answer.body.pilot as { pilot_id: string }).pilot_id);

describe("refusals", () => {
  it("a firm not on the waitlist, a second open pilot, the term and the criteria", async () => {
    const kit = await fresh();
    const missing = await kit.post("/data/pilots", {
      entry_id: "not-here",
      starts_on: day(0),
      ends_on: day(1),
    });
    expect([missing.status, codeOf(missing), messageOf(missing)]).toEqual([
      404,
      "not_found",
      "That firm is not on the waitlist.",
    ]);
    expect((await plan(kit, 1)).status).toBe(200);
    const again = await plan(kit, 1);
    expect([again.status, codeOf(again), messageOf(again)]).toEqual([
      409,
      "pilot_open",
      "Walk Buyer 1 has a pilot open already.",
    ]);
    expect(messageOf(await plan(kit, 2, { ends_on: day(-1) }))).toBe(
      "The pilot ends before it starts.",
    );
    expect(messageOf(await plan(kit, 2, { criteria: [] }))).toBe(
      "Write at least one success criterion.",
    );
    const five = Array.from({ length: 5 }, (_, index) => ({
      what: `Criterion ${index + 1}`,
      target: "",
    }));
    expect(messageOf(await plan(kit, 2, { criteria: five }))).toBe("Four criteria at most.");
    expect(messageOf(await plan(kit, 2, { price: { amount: "fifty", currency: "INR" } }))).toBe(
      "Type the price as a number, such as 50000.",
    );
  });

  it("start, check-in and decision refusals", async () => {
    const kit = await fresh();
    const id = pilotId(await plan(kit, 1));
    const early = await kit.post(`/data/pilots/${id}/check-ins`, {
      on: day(0),
      note: "Hello",
      attempt: crypto.randomUUID(),
    });
    expect(codeOf(early)).toBe("not_running");
    expect((await kit.post(`/data/pilots/${id}/start`)).status).toBe(200);
    const again = await kit.post(`/data/pilots/${id}/start`);
    expect([again.status, codeOf(again), messageOf(again)]).toEqual([
      409,
      "not_planned",
      "Only a planned pilot can start.",
    ]);
    expect(
      messageOf(await kit.post(`/data/pilots/${id}/check-ins`, { on: day(0), note: " " })),
    ).toBe("Write what was said at the check-in.");
    expect(
      messageOf(await kit.post(`/data/pilots/${id}/check-ins`, { on: day(1), note: "Soon" })),
    ).toBe("That day has not come yet.");
    expect(
      messageOf(
        await kit.post(`/data/pilots/${id}/decision`, { outcome: "extend", on: day(0), note: "" }),
      ),
    ).toBe("Give the new end and go/no-go days.");
    expect(
      messageOf(
        await kit.post(`/data/pilots/${id}/decision`, {
          outcome: "extend",
          on: day(0),
          ends_on: day(-2),
          go_no_go_on: day(10),
        }),
      ),
    ).toBe("Give the new end and go/no-go days.");
  });
});

describe("a pilot's life", () => {
  it("plans with the warnings, starts, logs check-ins, records a result and is extended", async () => {
    const kit = await fresh();
    const planned = await plan(kit, 1);
    expect(planned.body.warnings).toEqual([
      CRITERIA_HINT,
      "Name the technical owner at Walk Buyer 1.",
    ]);
    expect(planned.body.running_line).toBe(PILOTS_LINE(0));
    const id = pilotId(planned);
    await kit.post(`/data/pilots/${id}/start`);
    const logged = await kit.post(`/data/pilots/${id}/check-ins`, {
      on: day(0),
      note: "Both analysts logged in every day.",
      attempt: crypto.randomUUID(),
    });
    expect(logged.body.next_check_in).toBe(day(7));
    const row = (await kit.get(`/data/pilots/${id}`)).body.pilot as {
      criteria: { criterion_id: string }[];
      criteria_met: string;
      owners_missing: string[];
    };
    expect(row.criteria_met).toBe("Not measured yet");
    expect(row.owners_missing).toEqual(["technical"]);
    const cid = row.criteria[0]!.criterion_id;
    await kit.post(`/data/pilots/${id}/criteria/${cid}/result`, {
      result: "Two, every day",
      met: "yes",
    });
    const after = (await kit.get(`/data/pilots/${id}`)).body.pilot as { criteria_met: string };
    expect(after.criteria_met).toBe("1 of 2 met");
    const extended = await kit.post(`/data/pilots/${id}/decision`, {
      outcome: "extend",
      on: day(0),
      note: "Two more weeks to cover the month end.",
      ends_on: day(44),
      go_no_go_on: day(42),
    });
    expect(extended.body.pilot).toMatchObject({
      state: "running",
      ends_on: day(44),
      go_no_go_on: day(42),
      decision: { outcome: "extend" },
    });
  });

  it("the next check-in is the last one (or the start) plus a week (§5.6)", () => {
    const pilot = {
      state: "running" as const,
      starts_on: "2026-11-02",
      check_ins: [] as { on: string }[],
    };
    expect(nextCheckIn({ ...pilot, check_ins: [] })).toBe("2026-11-09");
    expect(
      nextCheckIn({
        ...pilot,
        check_ins: [
          {
            check_in_id: "a",
            on: "2026-11-09",
            note: "",
            at: "",
            by: { staff_id: "w", name: "W" },
          },
        ],
      }),
    ).toBe("2026-11-16");
    expect(nextCheckIn({ ...pilot, state: "planned", check_ins: [] })).toBeNull();
  });

  it("a Go with a conversion day turns the go/no-go row into the conversion row", async () => {
    const kit = await fresh();
    const id = pilotId(await plan(kit, 1, { go_no_go_on: day(1) }));
    await kit.post(`/data/pilots/${id}/start`);
    let due = await kit.get("/data/overview");
    let rows = (due.body.due as { key: string; title: string }[]).filter((row) =>
      row.key.startsWith(`pilot:${id}`),
    );
    expect(rows.map((row) => row.title)).toEqual(["Go or no-go: Walk Buyer 1"]);
    await kit.post(`/data/pilots/${id}/decision`, {
      outcome: "go",
      on: day(0),
      note: "",
      converts_on: day(5),
    });
    due = await kit.get("/data/overview");
    rows = (due.body.due as { key: string; title: string }[]).filter((row) =>
      row.key.startsWith(`pilot:${id}`),
    );
    expect(rows.map((row) => row.title)).toEqual(["Convert Walk Buyer 1 to paid"]);
    expect(
      codeOf(await kit.post(`/data/pilots/${id}/decision`, { outcome: "no_go", on: day(0) })),
    ).toBe("decided");
  });
});

describe("the running line is a count, never a limit", () => {
  it("reads 0, 1, 5 and 6, and a sixth pilot is accepted", async () => {
    const kit = await fresh(7);
    const line = async () => String((await kit.get("/data/pilots")).body.running_line);
    expect(await line()).toBe(
      "0 pilots running. Sources suggest about five at once at most; this is a count, not a limit.",
    );
    for (let n = 1; n <= 6; n += 1) {
      const planned = await plan(kit, n);
      expect(planned.status).toBe(200);
      await kit.post(`/data/pilots/${pilotId(planned)}/start`);
      if (n === 1) expect(await line()).toBe(PILOTS_LINE(1));
      if (n === 5) expect(await line()).toBe(PILOTS_LINE(5));
    }
    expect(await line()).toBe(
      "6 pilots running. Sources suggest about five at once at most; this is a count, not a limit.",
    );
    expect((await plan(kit, 7)).status).toBe(200);
    const page = (await kit.get("/data/pilots?state=running")).body as {
      pilots: unknown[];
      counts: Record<string, number>;
    };
    expect(page.pilots).toHaveLength(6);
    expect(page.counts).toEqual({ running: 6, planned: 1, decided: 0, all: 7 });
  });
});

describe("Due and the agenda", () => {
  it("a planned pilot whose day has come, an overdue check-in, and agenda:pilots", async () => {
    const kit = await fresh();
    const started = pilotId(
      await plan(kit, 1, {
        starts_on: day(-10),
        go_no_go_on: day(20),
        conversion: { on: day(40), amount: "40000", currency: "INR", per: "month" },
      }),
    );
    await kit.post(`/data/pilots/${started}/start`);
    const planned = pilotId(await plan(kit, 2, { starts_on: day(0) }));
    const due = (
      (await kit.get("/data/overview")).body.due as {
        key: string;
        kind: string;
        title: string;
        sub: string;
        due_on: string;
      }[]
    ).filter((row) => row.kind === "pilot");
    expect(due).toContainEqual(
      expect.objectContaining({
        key: `pilot:${started}:check-in`,
        title: "Weekly check-in: Walk Buyer 1",
        due_on: day(-3),
      }),
    );
    expect(due).toContainEqual(
      expect.objectContaining({
        key: `pilot:${planned}:start`,
        title: "Start the pilot with Walk Buyer 2",
        due_on: day(0),
      }),
    );
    expect(due.every((row) => row.sub.startsWith("Pilot · "))).toBe(true);
    const items = (await kit.get("/data/_test/pilots/agenda")).body.items as {
      key: string;
      kind: string;
      title: string;
      plain: string;
      remind_days: number[];
    }[];
    expect(items.find((item) => item.key === `pilot:${started}:go-no-go`)).toMatchObject({
      kind: "pilot",
      title: "Pilot go/no-go · Walk Buyer 1",
      plain: "Pilot go/no-go",
      remind_days: [3, 0],
    });
    expect(items.find((item) => item.key === `pilot:${started}:check-in`)).toMatchObject({
      plain: "Pilot check-in",
      remind_days: [0],
    });
  });

  it("the pin gives the next pilot a fixed id, and the test route makes running pilots", async () => {
    const kit = await fresh();
    await kit.post("/data/_test/pilots/pin", { id: "walk-pilot" });
    expect(pilotId(await plan(kit, 1))).toBe("walk-pilot");
    const made = await kit.post("/data/_test/pilots/running", { count: 5 });
    expect(made.body.running).toBe(5);
    expect(kit.core.need<{ usedFor(id: string): unknown[] }>("pilots")?.usedFor("any")).toEqual([]);
  });
});
