// @vitest-environment node
import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays } from "../../scripts/data/days";
import { mondayOf } from "../../scripts/data/raise-contracts";
import { touchSummary } from "../../scripts/data/touches/index";
import type { Touch, TouchKind } from "../../scripts/data/touches/types";
import { TOUCH_ACCEPT_WARNING, TOUCH_CEILING_WARNING } from "../../src/lib/data/labels-people";
import { leadIdOf } from "../../scripts/data/leads/types";
import { peopleCsv } from "./leads-kit";
import { WALKER, codeOf, startStack, until, type RawAnswer, type Stack } from "./helpers";

/**
 * Touches by hand (company spec §8), through the real stack and by hand: §5.6's week (Monday
 * to Sunday) and acceptance examples, the line above 100 requests a week, eight weeks newest
 * first, the subject checks with and without the leads and investors services, and taking a
 * touch back and restoring it. Every lead and firm is invented.
 */

const idOf = (key: string): string => createHash("sha256").update(key).digest("hex").slice(0, 32);
const LEAD = idOf("lead:someone@walk-touch.example");
const FIRM = idOf("investor:walk-touch.example");

type Json = Record<string, unknown>;
const message = (answer: RawAnswer): string =>
  String(((answer.json?.error ?? {}) as { message?: unknown }).message ?? "");

function touch(on: string, kind: TouchKind, withdrawn = false): Touch {
  return {
    touch_id: randomUUID(),
    subject: { kind: "lead", id: LEAD, name: "Walk Lead" },
    on,
    kind,
    note: "",
    at: `${on}T06:00:00.000Z`,
    by: WALKER,
    withdrawn: withdrawn ? { at: `${on}T07:00:00.000Z`, by: WALKER } : null,
  };
}

describe("the weeks and the warnings, by hand (spec §5.6)", () => {
  it("counts this week from Monday: on Fri 13 Nov 2026, requests on 8, 9, 10 and 13 Nov count 3", () => {
    const today = "2026-11-13";
    expect(mondayOf(today)).toBe("2026-11-09");
    const summary = touchSummary(
      ["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-13"].map((on) => touch(on, "request")),
      today,
    );
    expect(summary.this_week).toEqual({ from: "2026-11-09", requests: 3, messages: 0 });
    expect(summary.weeks).toHaveLength(8);
    expect(summary.weeks.map((week) => week.week_from)).toEqual([
      "2026-11-09",
      "2026-11-02",
      "2026-10-26",
      "2026-10-19",
      "2026-10-12",
      "2026-10-05",
      "2026-09-28",
      "2026-09-21",
    ]);
    expect(summary.weeks[1]).toEqual({
      week_from: "2026-11-02",
      requests: 1,
      accepted: 0,
      messages: 0,
      other: 0,
    });
  });

  it("warns below 1 in 5 accepted over 28 days, only from 10 requests, and above 100 a week", () => {
    const today = "2026-11-13";
    const days = Array.from({ length: 30 }, (_, index) => addDays(today, -(index % 28)));
    const requests = days.map((on) => touch(on, "request"));
    const five = requests.concat(days.slice(0, 5).map((on) => touch(on, "accepted")));
    expect(touchSummary(five, today).four_weeks).toEqual({ requests: 30, accepted: 5 });
    expect(touchSummary(five, today).warnings).toEqual([TOUCH_ACCEPT_WARNING]);
    const six = requests.concat(days.slice(0, 6).map((on) => touch(on, "accepted")));
    expect(touchSummary(six, today).warnings).toEqual([]);
    const nine = days.slice(0, 9).map((on) => touch(on, "request"));
    expect(touchSummary(nine, today).warnings).toEqual([]);
    // A request 28 days back is outside the four weeks.
    const old = touchSummary([touch(addDays(today, -28), "request")], today);
    expect(old.four_weeks.requests).toBe(0);
    // Withdrawn touches count nowhere.
    expect(touchSummary([touch(today, "request", true)], today).this_week.requests).toBe(0);
    const many = Array.from({ length: 101 }, () => touch(today, "request"));
    many.push(...Array.from({ length: 30 }, () => touch(today, "accepted")));
    expect(touchSummary(many, today).warnings).toEqual([TOUCH_CEILING_WARNING]);
    const hundred = Array.from({ length: 100 }, () => touch(today, "request"));
    hundred.push(...Array.from({ length: 30 }, () => touch(today, "accepted")));
    expect(touchSummary(hundred, today).warnings).toEqual([]);
  });
});

describe("touches through the service, without All leads or the investors module", () => {
  let stack: Stack;
  let today = "";
  beforeAll(async () => {
    stack = await startStack({ modules: ["files", "touches"] });
    today = String((await stack.ask("GET", "/data/_test/day")).json?.day ?? "");
  }, 60_000);
  afterAll(() => stack.stop());

  const post = (path: string, body: Json) => stack.ask("POST", path, { by: WALKER, ...body });
  const log = (change: Json = {}) =>
    post("/data/touches", {
      subject_kind: "lead",
      subject_id: LEAD,
      subject_name: "Walk Lead",
      on: today,
      kind: "request",
      note: "",
      attempt: randomUUID(),
      ...change,
    });

  it("keeps the name the page sent, refuses what it cannot take, and counts the week", async () => {
    const first = await log({ note: "Invented: asked to connect after the panel." });
    expect(first.status, message(first)).toBe(200);
    expect((first.json!.touch as Json).subject).toEqual({
      kind: "lead",
      id: LEAD,
      name: "Walk Lead",
    });
    expect((first.json!.touch as Json).href).toBe(`/data/leads/${LEAD}`);
    const firm = await log({
      subject_kind: "investor",
      subject_id: FIRM,
      subject_name: "Walk Touch Capital",
      kind: "message",
    });
    expect((firm.json!.touch as Json).href).toBe(`/data/investors/${FIRM}`);
    for (const [change, words] of [
      [{ subject_kind: "waitlist" }, "Say who the touch was with."],
      [{ subject_id: "not-an-id" }, "Say who the touch was with."],
      [{ subject_name: "" }, "Say who the touch was with."],
      [{ on: addDays(today, 1) }, "That day is in the future."],
      [{ on: "13 Nov" }, "That is not a day."],
      [{ kind: "poke" }, "Choose the kind of touch."],
    ] as const) {
      const answer = await log(change);
      expect([answer.status, message(answer)], JSON.stringify(change)).toEqual([400, words]);
    }
    const page = (await stack.ask("GET", "/data/touches")).json!;
    expect(page.total).toBe(2);
    expect(page.limit).toBe(100);
    expect(page.this_week).toEqual({ from: mondayOf(today), requests: 1, messages: 1 });
    expect((page.weeks as unknown[]).length).toBe(8);
    const onLead = (await stack.ask("GET", `/data/touches?subject_kind=lead&subject_id=${LEAD}`))
      .json!;
    expect(onLead.total).toBe(1);
    // The counts are over every touch, whichever subject the list shows.
    expect(onLead.this_week).toEqual(page.this_week);
    const messages = (await stack.ask("GET", "/data/touches?kind=message")).json!;
    expect((messages.touches as Json[]).map((item) => item.kind)).toEqual(["message"]);
    expect(messages.counts).toMatchObject({ all: 2, request: 1, message: 1 });
  });

  it("takes a touch back and restores it, newest first, and no Due row ever comes of one", async () => {
    const older = await log({ on: addDays(today, -1), kind: "call" });
    const id = String((older.json!.touch as Json).touch_id);
    const withdrawn = await post(`/data/touches/${id}/withdraw`, {});
    expect((withdrawn.json!.touch as Json).withdrawn).not.toBeNull();
    const again = await post(`/data/touches/${id}/withdraw`, {});
    expect([again.status, codeOf(again)]).toEqual([409, "withdrawn"]);
    let page = (await stack.ask("GET", "/data/touches")).json!;
    const listed = page.touches as { touch_id: string; on: string; withdrawn: unknown }[];
    expect(listed.find((item) => item.touch_id === id)?.withdrawn).not.toBeNull();
    expect(listed.map((item) => item.on)).toEqual(
      [...listed.map((item) => item.on)].sort().reverse(),
    );
    const restored = await post(`/data/touches/${id}/restore`, {});
    expect((restored.json!.touch as Json).withdrawn).toBeNull();
    page = (await stack.ask("GET", "/data/touches")).json!;
    expect((page.touches as Json[]).find((item) => item.touch_id === id)?.withdrawn).toBeNull();
    const missing = await post("/data/touches/not-a-touch/withdraw", {});
    expect([missing.status, codeOf(missing)]).toEqual([404, "not_found"]);
    const due = (await stack.ask("GET", "/data/overview?owner=1")).json!.due as Json[];
    expect(due).toEqual([]);
  });

  it("reads the withdrawals back after the worker starts again", async () => {
    const answer = await log({ kind: "met" });
    const id = String((answer.json!.touch as Json).touch_id);
    await post(`/data/touches/${id}/withdraw`, {});
    await post("/data/_test/crash", {}).catch(() => undefined);
    await until(
      async () => (await stack.ask("GET", "/data/touches")).status === 200,
      "the worker to start again",
      20_000,
    );
    expect(stack.data.status().crashes).toBeGreaterThan(0);
    const page = (await stack.ask("GET", "/data/touches")).json!;
    expect((page.touches as Json[]).find((item) => item.touch_id === id)?.withdrawn).not.toBeNull();
    expect(page.total).toBe(4);
  });
});

describe("touches with All leads and a firm lookup", () => {
  let stack: Stack;
  beforeAll(async () => {
    // Notes' test route installs a stand-in `investors-raise` while the investors module is absent.
    stack = await startStack({
      modules: ["files", "leads", "replies", "waitlist", "notes", "touches"],
    });
    stack.engine.importList({
      name: "Walk touches",
      file_name: "walk-touches.csv",
      text: peopleCsv([{ email: "known@walk-touch.example", first: "Asha", last: "Known" }]),
    });
    await until(
      async () =>
        (await stack.ask("GET", `/data/leads/${leadIdOf("known@walk-touch.example")}`)).status ===
        200,
      "the lead",
      20_000,
    );
  }, 60_000);
  afterAll(() => stack.stop());

  const post = (body: Json) =>
    stack.ask("POST", "/data/touches", { kind: "request", by: WALKER, ...body });

  it("names a lead and a firm as their own modules do, and refuses one that is not here", async () => {
    const known = await post({
      subject_kind: "lead",
      subject_id: leadIdOf("known@walk-touch.example"),
      subject_name: "Typed by hand",
    });
    expect(known.status, message(known)).toBe(200);
    expect(((known.json!.touch as Json).subject as Json).name).toBe("Asha Known");
    const lead = await post({ subject_kind: "lead", subject_id: LEAD, subject_name: "Walk Lead" });
    expect([lead.status, codeOf(lead), message(lead)]).toEqual([
      404,
      "not_found",
      "That lead is not here.",
    ]);
    const installed = await stack.ask("POST", "/data/_test/notes/raise", {
      names: { [FIRM]: "Walk Touch Capital LLP" },
      by: WALKER,
    });
    expect(installed.json?.installed).toBe(true);
    try {
      const firm = await post({
        subject_kind: "investor",
        subject_id: FIRM,
        subject_name: "Typed",
      });
      expect(((firm.json!.touch as Json).subject as Json).name).toBe("Walk Touch Capital LLP");
      const other = await post({
        subject_kind: "investor",
        subject_id: idOf("investor:elsewhere.example"),
        subject_name: "Elsewhere",
      });
      expect([other.status, codeOf(other), message(other)]).toEqual([
        404,
        "not_found",
        "That firm is not here.",
      ]);
    } finally {
      await stack.ask("POST", "/data/_test/notes/raise", { on: false, by: WALKER });
    }
  });
});
