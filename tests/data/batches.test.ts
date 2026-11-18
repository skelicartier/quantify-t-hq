// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  batchOf,
  funnelOf,
  warningLevelOf,
  type BatchRow,
  type Funnel,
  type FunnelInput,
} from "../../scripts/data/batches/funnel";
import { leadIdOf } from "../../scripts/data/leads/types";
import { WALK_KEY, WalkProvider } from "../../scripts/mail-merge/e2e-provider";
import type { MergeEngine } from "../../scripts/mail-merge/engine";
import {
  countsOf,
  standingOf,
  walkDeliveryEventsOf,
  type DeliveryCounts,
  type MailingDelivery,
} from "../../src/lib/merge/delivery-contracts";
import { MODULES } from "../../scripts/data/core";
import { WALKER, startStack, until, type Stack } from "./helpers";

/**
 * The batch funnel (delivery spec §5.5, §7.2): the spec's worked example, cell for cell, as
 * plain data and then end to end on the real stack with the stand-in feed; and the rules
 * one at a time: which batch a reply belongs to, a reply taken back, a firm reached from
 * two batches, a dropped firm, a deleted mailing, delivery not read, and ratios with
 * nothing to be out of. Everyone here is invented, on `.example` domains.
 */

// ------------------------------------------------------------------ the worked example, as data

const A = "mailing-a";
const B = "mailing-b";
const A_SENT = "2026-11-10T04:00:00.000Z";
const B_SENT = "2026-11-11T04:00:00.000Z";
const AFTER = "2026-11-12T09:00:00.000Z";

const batchA = Array.from(
  { length: 40 },
  (_, index) => `partner${index + 1}@fund${index + 1}.example`,
);
const batchB = Array.from(
  { length: 20 },
  (_, index) => `partner${index + 1}@fund${index + 41}.example`,
);

const written: FunnelInput["written"] = [
  ...batchA.map((email) => ({ email, mailing_id: A, at: A_SENT })),
  ...batchB.map((email) => ({ email, mailing_id: B, at: B_SENT })),
];

/** What the stand-in mix says happened to a mailing's sends, as the feed would give it. */
function deliveryOf(mailingId: string, name: string): MailingDelivery {
  const lines = written.filter((line) => line.mailing_id === mailingId);
  return {
    mailing_id: mailingId,
    name,
    first_sent_at: lines[0]!.at,
    last_sent_at: lines[lines.length - 1]!.at,
    read_at: AFTER,
    counts: countsOf(lines.map((line) => standingOf(walkDeliveryEventsOf(line.email, line.at)))),
  };
}

const mailings: FunnelInput["mailings"] = [
  { mailing_id: A, name: "Batch A send", lists: ["Batch A"], list_ids: ["list-a"] },
  { mailing_id: B, name: "Batch B send", lists: ["Batch B"], list_ids: ["list-b"] },
];

let nextReply = 0;
const reply = (
  email: string,
  outcome: string,
  received_at = AFTER,
  taken_back = false,
): FunnelInput["replies"][number] => ({
  reply_id: `reply-${String((nextReply += 1)).padStart(3, "0")}`,
  email,
  outcome,
  received_at,
  taken_back,
});

const exampleReplies: FunnelInput["replies"] = [
  reply("partner1@fund1.example", "replied_positive"),
  reply("partner2@fund2.example", "meeting_request"),
  reply("partner3@fund3.example", "not_interested"),
  reply("partner4@fund4.example", "out_of_office"),
  reply("partner4@fund4.example", "question", "2026-11-13T09:00:00.000Z"),
  reply("partner4@fund44.example", "replied_positive"),
  reply("outsider@elsewhere.example", "question"),
];

/** A yes puts the firm on the waitlist: one entry per firm, by the address's domain. */
const ENTRIES: Record<string, { entry_id: string; firm: string }> = {
  "fund1.example": { entry_id: "entry-1", firm: "Walk Fund 1" },
  "fund2.example": { entry_id: "entry-2", firm: "Walk Fund 2" },
  "fund44.example": { entry_id: "entry-44", firm: "Walk Fund 44" },
};
const entryOf: FunnelInput["entryOf"] = (email) => ENTRIES[email.split("@")[1] ?? ""] ?? null;

const exampleStages: FunnelInput["stages"] = new Map([
  ["entry-1", { stage: "pilot", reached: new Set(["call_booked", "call_held", "pilot"]) }],
  ["entry-2", { stage: "call_booked", reached: new Set(["call_booked"]) }],
  ["entry-44", { stage: "joined", reached: new Set<string>() }],
]);

const example = (): FunnelInput => ({
  mailings,
  written,
  delivery: new Map([
    [A, deliveryOf(A, "Batch A send")],
    [B, deliveryOf(B, "Batch B send")],
  ]),
  replies: exampleReplies,
  entryOf,
  stages: exampleStages,
});

/** One row of §5.5's table: the cells the page prints, as numbers. */
type Cells = {
  accepted: number;
  delivered: number | null;
  didnt_arrive: number | null;
  complaint: number | null;
  replied: number;
  out_of_office: number;
  yes: number;
  joined: number;
  calls_booked: number;
  calls_held: number;
  pilots: number;
};
const cellsOf = (row: {
  accepted: number;
  delivery: DeliveryCounts | null;
  replied: number;
  out_of_office: number;
  yes: number;
  joined: number;
  calls_booked: number;
  calls_held: number;
  pilots: number;
}): Cells => ({
  accepted: row.accepted,
  delivered: row.delivery?.delivered ?? null,
  didnt_arrive: row.delivery?.didnt_arrive ?? null,
  complaint: row.delivery?.complaint ?? null,
  replied: row.replied,
  out_of_office: row.out_of_office,
  yes: row.yes,
  joined: row.joined,
  calls_booked: row.calls_booked,
  calls_held: row.calls_held,
  pilots: row.pilots,
});

const ROW_A: Cells = {
  accepted: 40,
  delivered: 38,
  didnt_arrive: 2,
  complaint: 0,
  replied: 4,
  out_of_office: 1,
  yes: 2,
  joined: 2,
  calls_booked: 2,
  calls_held: 1,
  pilots: 1,
};
const ROW_B: Cells = {
  accepted: 20,
  delivered: 16,
  didnt_arrive: 3,
  complaint: 1,
  replied: 1,
  out_of_office: 0,
  yes: 1,
  joined: 1,
  calls_booked: 0,
  calls_held: 0,
  pilots: 0,
};
const ROW_ALL: Cells = {
  accepted: 60,
  delivered: 54,
  didnt_arrive: 5,
  complaint: 1,
  replied: 5,
  out_of_office: 1,
  yes: 3,
  joined: 3,
  calls_booked: 2,
  calls_held: 1,
  pilots: 1,
};
const OUTCOMES_A = {
  replied_positive: 1,
  meeting_request: 1,
  not_interested: 1,
  not_now: 0,
  out_of_office: 1,
  wrong_person: 0,
  question: 1,
  needs_review: 0,
};

const rowNamed = (funnel: Funnel, name: string): BatchRow =>
  funnel.rows.find((row) => row.name === name)!;

/** Every cell of the spec's table, on a funnel however it was made. */
function expectTheTable(funnel: Funnel): void {
  expect(funnel.rows.map((row) => row.name)).toEqual(["Batch B send", "Batch A send"]);
  const a = rowNamed(funnel, "Batch A send");
  const b = rowNamed(funnel, "Batch B send");
  expect(cellsOf(a)).toEqual(ROW_A);
  expect(cellsOf(b)).toEqual(ROW_B);
  expect(cellsOf(funnel.total)).toEqual(ROW_ALL);
  // Batch A: fund 29 soft, fund 36 hard, the rest delivered.
  expect(a.delivery).toMatchObject({
    accepted: 40,
    delivered: 38,
    not_yet: 0,
    soft_bounce: 1,
    hard_bounce: 1,
    didnt_arrive: 2,
    complaint: 0,
    unsubscribed: 0,
  });
  // Batch B: 41 complaint and 43 unsubscribed (both delivered), 47 delayed, 53 blocked, 58 soft, 59 invalid.
  expect(b.delivery).toMatchObject({
    accepted: 20,
    delivered: 16,
    not_yet: 1,
    soft_bounce: 1,
    blocked: 1,
    invalid: 1,
    hard_bounce: 0,
    error: 0,
    didnt_arrive: 3,
    complaint: 1,
    unsubscribed: 1,
  });
  expect(funnel.total.delivery).toMatchObject({ not_yet: 1, unsubscribed: 1, retry: 3 });
  expect(a.by_outcome).toEqual(OUTCOMES_A);
  expect(b.by_outcome).toMatchObject({ replied_positive: 1, question: 0 });
  expect(a.yes_not_on_waitlist).toBe(0);
  expect(a.lists).toEqual(["Batch A"]);
  expect(funnel.not_from_a_batch).toMatchObject({ replied: 1, out_of_office: 0, yes: 0 });
  expect(funnel.not_from_a_batch.by_outcome).toMatchObject({ question: 1, replied_positive: 0 });
  // 1 hard bounce of 40 is 2.5 per cent (100 > 80): attention. 1 complaint of 16 delivered: danger.
  expect(a.warning).toBe("attention");
  expect(b.warning).toBe("danger");
}

describe("the funnel, by the spec's worked example", () => {
  it("gives every cell of the table, the by-outcome row and Not from a batch", () => {
    expectTheTable(funnelOf(example()));
  });

  it("adds up: each batch's delivery buckets make its accepted, and the total is the rows' sum", () => {
    const funnel = funnelOf(example());
    for (const row of funnel.rows) {
      const d = row.delivery!;
      expect(d.delivered + d.not_yet + d.didnt_arrive).toBe(row.accepted);
    }
    for (const key of ["accepted", "replied", "yes", "joined", "calls_booked", "pilots"] as const)
      expect(funnel.total[key]).toBe(funnel.rows.reduce((sum, row) => sum + row[key], 0));
  });
});

// ------------------------------------------------------------------ the rules, one at a time

describe("which batch a reply belongs to", () => {
  const sends = [
    { mailing_id: "first", at: "2026-11-01T10:00:00.000Z" },
    { mailing_id: "second", at: "2026-11-05T10:00:00.000Z" },
  ];

  it("is the latest send at or before the reply", () => {
    expect(batchOf(sends, "2026-11-03T00:00:00.000Z")).toBe("first");
    expect(batchOf(sends, "2026-11-05T10:00:00.000Z")).toBe("second");
    expect(batchOf(sends, "2026-11-09T00:00:00.000Z")).toBe("second");
    expect(batchOf([...sends].reverse(), "2026-11-09T00:00:00.000Z")).toBe("second");
  });

  it("is the earliest send when the reply came before any", () => {
    expect(batchOf(sends, "2026-10-01T00:00:00.000Z")).toBe("first");
    expect(batchOf([...sends].reverse(), "2026-10-01T00:00:00.000Z")).toBe("first");
  });

  it("is none for an address never written to", () => {
    expect(batchOf(undefined, AFTER)).toBeNull();
    expect(batchOf([], AFTER)).toBeNull();
  });

  it("counts a reply before any send in the earliest batch, and an address in two in the latest before the reply", () => {
    const twice = "partner1@fund1.example";
    const funnel = funnelOf({
      ...example(),
      // The same person is written to again in batch B, a day after batch A.
      written: [...written, { email: twice, mailing_id: B, at: B_SENT }],
      delivery: null,
      replies: [
        reply("partner5@fund5.example", "question", "2026-11-01T00:00:00.000Z"),
        reply(twice, "question", "2026-11-10T12:00:00.000Z"),
        reply(twice, "not_now", AFTER),
      ],
    });
    const a = rowNamed(funnel, "Batch A send");
    const b = rowNamed(funnel, "Batch B send");
    // Before any send: partner5 belongs to batch A, the only batch that wrote to them.
    expect(a.replied).toBe(2);
    expect(a.by_outcome.question).toBe(2);
    // After batch B went: the same person's later answer belongs to batch B.
    expect(b.replied).toBe(1);
    expect(b.by_outcome.not_now).toBe(1);
  });
});

describe("the funnel's other rules", () => {
  it("counts a reply taken back nowhere", () => {
    const funnel = funnelOf({
      ...example(),
      replies: [
        reply("partner1@fund1.example", "replied_positive", AFTER, true),
        reply("outsider@elsewhere.example", "question", AFTER, true),
      ],
    });
    expect(funnel.total).toMatchObject({ replied: 0, yes: 0, joined: 0, calls_booked: 0 });
    expect(funnel.not_from_a_batch).toMatchObject({ replied: 0, yes: 0 });
  });

  it("gives a firm reached from two batches' yeses to the earliest yes", () => {
    const shared = { entry_id: "entry-shared", firm: "Walk Fund 9" };
    const funnel = funnelOf({
      ...example(),
      replies: [
        // The later yes is listed first: the order they were recorded in does not matter.
        reply("partner5@fund45.example", "replied_positive", "2026-11-13T00:00:00.000Z"),
        reply("partner9@fund9.example", "meeting_request", "2026-11-12T00:00:00.000Z"),
      ],
      entryOf: () => shared,
      stages: new Map([
        ["entry-shared", { stage: "call_booked", reached: new Set(["call_booked"]) }],
      ]),
    });
    const a = rowNamed(funnel, "Batch A send");
    const b = rowNamed(funnel, "Batch B send");
    expect([a.yes, a.joined, a.calls_booked]).toEqual([1, 1, 1]);
    expect([b.yes, b.joined, b.calls_booked]).toEqual([1, 0, 0]);
    expect(funnel.total.joined).toBe(1);
  });

  it("keeps the stages a dropped firm reached", () => {
    const funnel = funnelOf({
      ...example(),
      stages: new Map([
        [
          "entry-1",
          { stage: "dropped", reached: new Set(["call_booked", "call_held", "dropped"]) },
        ],
        ["entry-2", { stage: "dropped", reached: new Set(["dropped"]) }],
        ["entry-44", { stage: "customer", reached: new Set(["customer"]) }],
      ]),
    });
    const a = rowNamed(funnel, "Batch A send");
    expect([a.joined, a.calls_booked, a.calls_held, a.pilots]).toEqual([2, 1, 1, 0]);
    // A customer has been through every stage before it, whatever moves were recorded.
    const b = rowNamed(funnel, "Batch B send");
    expect([b.joined, b.calls_booked, b.calls_held, b.pilots]).toEqual([1, 1, 1, 1]);
  });

  it("counts a yes with no waitlist firm as not on the waitlist", () => {
    const funnel = funnelOf({ ...example(), entryOf: () => null });
    const a = rowNamed(funnel, "Batch A send");
    expect([a.yes, a.yes_not_on_waitlist, a.joined]).toEqual([2, 2, 0]);
    expect(funnel.total).toMatchObject({ yes: 3, yes_not_on_waitlist: 3, joined: 0 });
  });

  it("keeps the row of a mailing deleted in Mail merge, named as it was", () => {
    const funnel = funnelOf({
      ...example(),
      mailings: [mailings[0]!, { mailing_id: B, name: "Batch B send", lists: [], list_ids: [] }],
    });
    const b = rowNamed(funnel, "Batch B send");
    expect(b.lists).toEqual([]);
    expect(cellsOf(b)).toEqual(ROW_B);
  });

  it("leaves delivery as null when nothing reads it, and counts accepted from the written log", () => {
    const funnel = funnelOf({ ...example(), delivery: null });
    for (const row of funnel.rows) {
      expect(row.delivery).toBeNull();
      expect(row.read_at).toBeNull();
      expect(row.warning).toBeNull();
    }
    expect(funnel.rows.map((row) => row.accepted)).toEqual([20, 40]);
    expect(funnel.total.delivery).toBeNull();
    expect(funnel.total.accepted).toBe(60);
    // The replies and the waitlist are counted all the same.
    expect(funnel.total).toMatchObject({ replied: 5, yes: 3, joined: 3 });
  });

  it("reads one mailing's delivery when only one was read", () => {
    const funnel = funnelOf({
      ...example(),
      delivery: new Map([[A, deliveryOf(A, "Batch A send")]]),
    });
    expect(rowNamed(funnel, "Batch B send").delivery).toBeNull();
    expect(rowNamed(funnel, "Batch B send").accepted).toBe(20);
    expect(funnel.total.delivery).toMatchObject({ accepted: 40, delivered: 38 });
  });

  it("gives plain zeros for a batch nobody answered, so every ratio's 'of' may be 0", () => {
    const funnel = funnelOf({ ...example(), replies: [] });
    for (const row of funnel.rows)
      expect([
        row.replied,
        row.yes,
        row.joined,
        row.calls_booked,
        row.calls_held,
        row.pilots,
      ]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(funnelOf({ ...example(), mailings: [], written: [] }).rows).toEqual([]);
  });

  it("names the worse warning of a mailing, or none", () => {
    const counts = (over: Partial<DeliveryCounts>): DeliveryCounts => ({
      ...countsOf([]),
      ...over,
    });
    expect(warningLevelOf(null)).toBeNull();
    expect(warningLevelOf(counts({ accepted: 100, delivered: 98, hard_bounce: 2 }))).toBeNull();
    expect(warningLevelOf(counts({ accepted: 100, delivered: 97, hard_bounce: 3 }))).toBe(
      "attention",
    );
    expect(warningLevelOf(counts({ accepted: 100, delivered: 94, hard_bounce: 6 }))).toBe("danger");
    expect(
      warningLevelOf(counts({ accepted: 290, delivered: 290, complaint: 1, hard_bounce: 0 })),
    ).toBe("danger");
  });
});

// ------------------------------------------------------------------ the same example, end to end

type Body = Record<string, unknown>;

let stack: Stack;
let today = "";

async function ok(path: string, body: Body = {}): Promise<Body> {
  const answer = await stack.ask("POST", path, { by: WALKER, ...body });
  expect(answer.status, `${path}: ${JSON.stringify(answer.json)}`).toBe(200);
  return answer.json!;
}
async function get(path: string): Promise<Body> {
  const answer = await stack.ask("GET", path);
  expect(answer.status, path).toBe(200);
  return answer.json!;
}

function listCsv(emails: readonly string[]): string {
  const rows = ["Email,First Name,Last Name,Title,Company,Firm Type,City,Country"];
  for (const email of emails) {
    const firm = /@fund(\d+)\./.exec(email)?.[1] ?? "0";
    rows.push(`${email},Asha,Rao${firm},Partner,Walk Fund ${firm},Family office,Mumbai,India`);
  }
  return `${rows.join("\n")}\n`;
}

async function sendLive(engine: MergeEngine, listId: string, name: string, people: number) {
  const mailing = engine.createMailing({ name }).mailing;
  engine.updateMailing(mailing.id, {
    subject: "A note for {{company}}",
    body: "Hi {{first_name}},\n\nA short note, in the words of a person.\n\nA Founder",
    list_ids: [listId],
  });
  await engine.testMailing(mailing.id, { to: "founder@walk.example" });
  engine.startMailing(mailing.id, { practice: false, confirm: people });
  while ((await engine.step()) !== "finished");
  return mailing.id;
}

const record = (email: string, outcome: string, extra: Body = {}) =>
  ok("/data/replies", {
    email,
    outcome,
    words: "Invented words.",
    subject: "Re: A note",
    received_at: new Date().toISOString(),
    add_if_missing: false,
    ...extra,
  });

async function entryIdOf(email: string): Promise<string> {
  const lead = (await get(`/data/leads/${leadIdOf(email)}`)).lead as {
    waitlist: { entry_id: string } | null;
  };
  expect(lead.waitlist, `${email} is on the waitlist`).not.toBeNull();
  return lead.waitlist!.entry_id;
}

const move = (entryId: string, stage: string, extra: Body = {}) =>
  ok(`/data/waitlist/${entryId}/stage`, {
    stage,
    next_step: "Invented next step",
    next_step_on: today,
    ...extra,
  });

describe("the funnel, end to end on the stand-in feed", () => {
  let mailingA = "";

  beforeAll(async () => {
    const sent: unknown[] = [];
    stack = await startStack({
      env: true,
      modules: MODULES.filter((name) => name !== "delivery"),
      liveProvider: (key) => new WalkProvider(key, (mail) => sent.push(mail)),
    });
    today = String((await get("/data/_test/day")).day);
    stack.engine.saveSettings({
      from_email: "founder@walk.example",
      from_name: "Walk Founder",
      reply_to: "founder@walk.example",
      footer: "",
      per_minute: 60,
      daily_cap: 5_000,
    });
    await stack.engine.setKey({ key: WALK_KEY });
    const listA = stack.engine.importList({
      name: "Batch A",
      file_name: "batch-a.csv",
      text: listCsv(batchA),
    }).list.id;
    const listB = stack.engine.importList({
      name: "Batch B",
      file_name: "batch-b.csv",
      text: listCsv(batchB),
    }).list.id;
    mailingA = await sendLive(stack.engine, listA, "Batch A send", 40);
    // A later first send, so the newest batch is B whatever the clock's grain.
    await new Promise((resolve) => setTimeout(resolve, 20));
    await sendLive(stack.engine, listB, "Batch B send", 20);
    await until(async () => {
      const page = await get("/data/leads");
      return Number((page.book as { written: number }).written) === 60;
    }, "the sixty sends to reach the leads");
  }, 120_000);
  afterAll(() => stack.stop());

  it("says delivery is not loaded before the stand-in is installed, and counts the rest", async () => {
    const before = await get("/data/batches");
    expect(before.read).toBeNull();
    expect(before.loaded).toEqual({ delivery: false, replies: true, waitlist: true });
    const funnel = before.funnel as Funnel;
    expect(funnel.rows.map((row) => [row.name, row.accepted, row.delivery])).toEqual([
      ["Batch B send", 20, null],
      ["Batch A send", 40, null],
    ]);
  });

  it("installs the stand-in once, and gives every cell of the table", async () => {
    expect(await ok("/data/_test/batches/delivery")).toMatchObject({ installed: true });
    expect(await ok("/data/_test/batches/delivery")).toMatchObject({ installed: true });

    await record("partner1@fund1.example", "replied_positive");
    await record("partner2@fund2.example", "meeting_request");
    await record("partner3@fund3.example", "not_interested");
    await record("partner4@fund4.example", "out_of_office");
    await record("partner4@fund4.example", "question");
    await record("partner4@fund44.example", "replied_positive");
    await record("outsider@elsewhere.example", "question", { add_if_missing: true });

    const fund1 = await entryIdOf("partner1@fund1.example");
    const callAt = new Date(Date.now() + 86_400_000).toISOString();
    await move(fund1, "call_booked", { call_at: callAt });
    await move(fund1, "call_held");
    await move(fund1, "pilot", {
      pilot: { starts_on: today, ends_on: today, success: "Invented: two analysts use it weekly." },
    });
    await move(await entryIdOf("partner2@fund2.example"), "call_booked", { call_at: callAt });

    const answer = await get("/data/batches");
    expect(answer.today).toBe(today);
    expect(answer.loaded).toEqual({ delivery: true, replies: true, waitlist: true });
    expect(answer.gone).toEqual([]);
    expect(answer.read).toMatchObject({ outcome: "ok", detail: "", waiting: 0 });
    const funnel = answer.funnel as Funnel;
    expectTheTable(funnel);
    const a = rowNamed(funnel, "Batch A send");
    expect(a.mailing_id).toBe(mailingA);
    expect(a.read_at).toBe((answer.read as { last_read_at: string }).last_read_at);
    expect(a.first_sent_at <= a.last_sent_at).toBe(true);
  });

  it("keeps a deleted mailing's row, named as it was, and says it is gone", async () => {
    stack.engine.deleteMailing(mailingA);
    await until(async () => {
      const answer = await get("/data/batches");
      return (answer.gone as string[]).includes(mailingA);
    }, "Data to see the mailing is gone");
    const answer = await get("/data/batches");
    const a = rowNamed(answer.funnel as Funnel, "Batch A send");
    expect(a.lists).toEqual([]);
    expect(cellsOf(a)).toEqual(ROW_A);
  });

  it("takes the stand-in off again, and only its own", async () => {
    expect(await ok("/data/_test/batches/delivery", { on: false })).toEqual({
      ok: true,
      installed: false,
    });
    expect((await get("/data/batches")).read).toBeNull();
  });
});
