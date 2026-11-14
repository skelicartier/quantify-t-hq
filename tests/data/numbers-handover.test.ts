// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { WALKER, codeOf, startStack, type Stack } from "./helpers";

/**
 * The monthly update's hand-over to Mail merge, on the real engine (raise spec §8.5): with
 * the stand-in investor list, the list is named "Investor update {Month YYYY}", has the
 * five columns and one row per person, leaves a stopped address out "On the stop list",
 * and nothing is ever sent. Also the update's states (draft, frozen, handed over) and the
 * two feeds the numbers read. Every person and firm is invented.
 */

let stack: Stack;
let period = "";
let label = "";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const FIRMS = [
  {
    investor_id: "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
    firm: "Walk Fund 901",
    stage: "soft",
    people: [
      { email: "partner901@fund901.example", name: "Asha Rao", replied: true },
      { email: "analyst901@fund901.example", name: "Dev Kumar Menon", replied: false },
    ],
  },
  {
    investor_id: "b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2",
    firm: "Walk Fund 902",
    stage: "signed",
    people: [
      { email: "partner902@fund902.example", name: "Ben", replied: true },
      // The same address at a second firm appears once.
      { email: "partner901@fund901.example", name: "Asha Rao", replied: true },
    ],
  },
  {
    investor_id: "c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3",
    firm: "Walk Fund 903",
    stage: "set_aside",
    people: [{ email: "partner903@fund903.example", name: "Cara Shah", replied: false }],
  },
  {
    investor_id: "d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4",
    firm: "Walk Fund 904",
    stage: "met",
    people: [{ email: "partner904@fund904.example", name: "Eve Das", replied: true }],
  },
];

beforeAll(async () => {
  // U4's modules alone (raise spec §3.2): no investors module, so `investors-raise` is
  // absent and the stand-in can be installed. raise-merged.test.ts checks the real
  // recipients.
  stack = await startStack({
    modules: ["files", "leads", "replies", "waitlist", "dates", "numbers"],
  });
  const day = String((await stack.ask("GET", "/data/_test/day")).json!.day);
  period = day.slice(0, 7);
  label = `${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;
}, 60_000);
afterAll(async () => {
  await stack.stop();
});

const install = () =>
  stack.ask("POST", "/data/_test/numbers/raise", {
    funnel: {
      firms: 4,
      first_meeting_days: [],
      stages: [
        { stage: "written", now: 0, reached: 4, of: 4 },
        { stage: "replied", now: 0, reached: 4, of: 4 },
        { stage: "meeting", now: 0, reached: 3, of: 4 },
        { stage: "met", now: 1, reached: 3, of: 3 },
        { stage: "diligence", now: 0, reached: 2, of: 3 },
        { stage: "soft", now: 1, reached: 2, of: 2 },
        { stage: "signed", now: 1, reached: 1, of: 2 },
        { stage: "money_in", now: 0, reached: 0, of: 1 },
      ],
      money: { USD: { soft: { amount: 25_000, firms: 1 } } },
    },
    firms: FIRMS,
    by: WALKER,
  });

const handOver = (body: Record<string, unknown> = {}) =>
  stack.ask("POST", `/data/numbers/updates/${period}/hand-over`, {
    by: WALKER,
    ...body,
  });

describe("the hand-over", () => {
  it("is refused while the investor list is not set up here", async () => {
    await stack.ask("GET", `/data/numbers/updates/${period}`);
    const refused = await handOver();
    expect(refused.status).toBe(409);
    expect(codeOf(refused)).toBe("investors_missing");
    expect((refused.json!.error as { message: string }).message).toBe(
      "The investor list is not set up here yet.",
    );
    const recipients = await stack.ask("GET", `/data/numbers/updates/${period}/recipients`);
    expect(recipients.json).toMatchObject({ here: false, firms: [], people: 0 });
  });

  it("is refused until the numbers are frozen", async () => {
    expect((await install()).json).toMatchObject({ installed: true });
    const refused = await handOver();
    expect(codeOf(refused)).toBe("not_frozen");
    expect((refused.json!.error as { message: string }).message).toBe(
      "Freeze the numbers first, so the list and the words match.",
    );
  });

  it("lists the default stages' people, each once, the stopped one marked", async () => {
    stack.engine.addStops({ emails: "partner903@fund903.example", reason: "asked" });
    const answer = (await stack.ask("GET", `/data/numbers/updates/${period}/recipients`)).json!;
    expect(answer.here).toBe(true);
    expect(answer.stages).toEqual(["money_in", "signed", "soft", "set_aside"]);
    const firms = answer.firms as { firm: string; people: { email: string; stopped: boolean }[] }[];
    expect(firms.map((firm) => firm.firm)).toEqual([
      "Walk Fund 901",
      "Walk Fund 902",
      "Walk Fund 903",
    ]);
    expect(firms.flatMap((firm) => firm.people.map((person) => person.email))).toEqual([
      "partner901@fund901.example",
      "analyst901@fund901.example",
      "partner902@fund902.example",
      "partner903@fund903.example",
    ]);
    expect(firms[2]?.people[0]?.stopped).toBe(true);
    expect(answer.people).toBe(3);
    expect(answer.left_out).toEqual([
      { email: "partner903@fund903.example", why: "On the stop list" },
    ]);
    const refused = await stack.ask(
      "GET",
      `/data/numbers/updates/${period}/recipients?stages=soft,nonsense`,
    );
    expect((refused.json!.error as { message: string }).message).toBe("Choose from the stages.");
  });

  it("makes one Mail merge list with the five columns, the stopped left out, nothing sent", async () => {
    const frozen = await stack.ask("POST", `/data/numbers/updates/${period}/freeze`, {
      by: WALKER,
    });
    expect(frozen.json).toMatchObject({ update: { status: "frozen" } });
    const nobody = await handOver({ stages: ["set_aside"] });
    expect(codeOf(nobody)).toBe("nobody_left");
    expect((nobody.json!.error as { message: string }).message).toBe(
      "Nobody is left to write to: choose more stages, or tick someone.",
    );
    const before = stack.engine.status().sent_today;
    const made = await handOver({ exclude: ["analyst901@fund901.example"] });
    expect(made.status).toBe(200);
    expect(made.json!.list).toMatchObject({ name: `Investor update ${label}`, people: 2 });
    expect(made.json!.left_out).toEqual([
      { email: "analyst901@fund901.example", why: "Unticked before the list was made" },
      { email: "partner903@fund903.example", why: "On the stop list" },
    ]);
    const list = stack.engine
      .lists()
      .lists.find((item) => item.name === `Investor update ${label}`);
    expect(list).toBeDefined();
    const rows = stack.engine.listDetail(list!.id, {});
    expect(rows.list.columns.map((column) => column.label)).toEqual([
      "Email",
      "First Name",
      "Last Name",
      "Company",
      "Stage",
    ]);
    expect(rows.list.people).toBe(2);
    expect(
      rows.rows.map((row) => [
        row.email,
        row.values.first_name,
        row.values.last_name,
        row.values.company,
        row.values.stage,
      ]),
    ).toEqual([
      ["partner901@fund901.example", "Asha", "Rao", "Walk Fund 901", "Soft commit"],
      ["partner902@fund902.example", "Ben", "", "Walk Fund 902", "Signed"],
    ]);
    expect(stack.engine.status().sent_today).toBe(before);
    expect(made.json!.update).toMatchObject({
      status: "handed_over",
      handed_over: { list_name: `Investor update ${label}`, people: 2 },
    });
  });

  it("keeps a handed-over update as it was, and a second hand-over makes a second list", async () => {
    const read = (await stack.ask("GET", `/data/numbers/updates/${period}`)).json!;
    for (const path of ["", "/freeze", "/unfreeze"]) {
      const refused = await stack.ask("POST", `/data/numbers/updates/${period}${path}`, {
        asks: "Changed",
        by: WALKER,
      });
      expect(codeOf(refused)).toBe("handed_over");
      expect((refused.json!.error as { message: string }).message).toBe(
        "This month's update was handed to Mail merge; it is kept as it was.",
      );
    }
    expect((await stack.ask("GET", `/data/numbers/updates/${period}`)).json).toEqual(read);
    const again = await handOver({ stages: ["met"] });
    expect(again.json!.list).toMatchObject({ name: `Investor update ${label} (2)`, people: 1 });
  });
});

describe("the update's states", () => {
  it("is a draft on first read, live until frozen, and back to live with today's numbers", async () => {
    const earlier = `${Number(period.slice(0, 4)) - 1}${period.slice(4)}`;
    const first = (await stack.ask("GET", `/data/numbers/updates/${earlier}`)).json!;
    expect(first.update).toMatchObject({
      period: earlier,
      status: "draft",
      snapshot: null,
      asks: "",
    });
    expect(String(first.text)).toContain("[Up to three asks]");
    const saved = await stack.ask("POST", `/data/numbers/updates/${earlier}`, {
      opening: "A quiet month.",
      asks: "One\nTwo",
      highlights: "",
      lowlights: "",
      thanks: "",
      sign_off: "Walk Owner",
      by: WALKER,
    });
    expect(String(saved.json!.text)).toContain("Asks\n1. One\n2. Two\n");
    const tooMany = await stack.ask("POST", `/data/numbers/updates/${earlier}`, {
      lowlights: "a\nb\nc\nd",
      by: WALKER,
    });
    expect((tooMany.json!.error as { message: string }).message).toBe("Three lowlights at most.");
    const frozen = (
      await stack.ask("POST", `/data/numbers/updates/${earlier}/freeze`, { by: WALKER })
    ).json!;
    expect(frozen.update).toMatchObject({ status: "frozen" });
    expect((frozen.update as { snapshot: unknown }).snapshot).toEqual(frozen.numbers);
    const live = (
      await stack.ask("POST", `/data/numbers/updates/${earlier}/unfreeze`, { by: WALKER })
    ).json!;
    expect(live.update).toMatchObject({ status: "draft", snapshot: null, snapshot_at: null });
  });

  it("has no update for a month after this one, or for a month that is not one", async () => {
    const [year = 0, month = 1] = period.split("-").map(Number);
    const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
    for (const value of [next, "2026-13", "nonsense"]) {
      const answer = await stack.ask("GET", `/data/numbers/updates/${value}`);
      expect(answer.status).toBe(404);
      expect(codeOf(answer)).toBe("not_found");
    }
  });
});

describe("the feeds the numbers read", () => {
  it("give every reply, and the waitlist's firms and stage moves, as the contract types them", async () => {
    const yes = await stack.ask("POST", "/data/replies", {
      email: "asha905@buyer905.example",
      outcome: "replied_positive",
      add_if_missing: true,
      by: WALKER,
    });
    expect(yes.status).toBe(200);
    const no = await stack.ask("POST", "/data/replies", {
      email: "ben906@buyer906.example",
      outcome: "not_interested",
      add_if_missing: true,
      by: WALKER,
    });
    expect(no.status).toBe(200);
    const feeds = (await stack.ask("GET", "/data/_test/numbers/feeds")).json!;
    expect(feeds.standin).toBe(true);
    const replies = feeds.replies as Record<string, unknown>[];
    expect(replies.map((reply) => [reply.email, reply.outcome, reply.taken_back])).toEqual([
      ["asha905@buyer905.example", "replied_positive", false],
      ["ben906@buyer906.example", "not_interested", false],
    ]);
    for (const reply of replies)
      expect(Object.keys(reply).sort()).toEqual(
        ["email", "outcome", "received_at", "reply_id", "taken_back"].sort(),
      );
    const entries = feeds.entries as Record<string, unknown>[];
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      domain: "buyer905.example",
      free_mail: false,
      stage: "joined",
    });
    expect(Object.keys(entries[0]!).sort()).toEqual(
      ["domain", "entry_id", "firm", "firm_type", "free_mail", "joined_on", "stage"].sort(),
    );
    const id = String(entries[0]!.entry_id);
    const day = String((await stack.ask("GET", "/data/_test/day")).json!.day);
    const moved = await stack.ask("POST", `/data/waitlist/${id}/stage`, {
      stage: "call_booked",
      call_at: new Date(Date.now() + 86_400_000).toISOString(),
      next_step: "Hold the call",
      next_step_on: day,
      by: WALKER,
    });
    expect(moved.status).toBe(200);
    const after = (await stack.ask("GET", "/data/_test/numbers/feeds")).json!;
    expect(after.moves).toContainEqual(
      expect.objectContaining({ entry_id: id, to: "call_booked" }),
    );
    // The yes counts this week; the no does not.
    const numbers = (await stack.ask("GET", "/data/numbers")).json!;
    const weekly = numbers.weekly as Record<string, number[]>;
    expect(weekly.yeses?.at(-1)).toBe(1);
    expect(weekly.calls_booked?.at(-1)).toBe(1);
    expect(weekly.firms_joined?.at(-1)).toBe(1);
  });
});
