// @vitest-environment node
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, addWorkingDays, localDay, workingDayAfter } from "../../scripts/data/days";
import { leadIdOf } from "../../scripts/data/leads/types";
import { Scripted, peopleCsv, readyToSend, sendLive } from "./leads-kit";
import { WALKER, codeOf, startStack, until, type RawAnswer, type Stack } from "./helpers";

/**
 * Each reply's effects (spec §3.8) on the real stack: the worker, the host's engine bridge
 * and Mail merge's engine on a temp folder. The waitlist is Unit 4's; until it exists a
 * Yes is refused with the spec's sentence, and a stand-in (a test route) proves the join.
 */

let stack: Stack;
const provider = new Scripted();
let listId = "";
const PEOPLE = Array.from({ length: 30 }, (_, index) => ({
  email: `partner${index + 1}@fund${index + 1}.example`,
  first: ["Asha", "Ravi", "Meera"][index % 3]!,
  last: `Rao${index + 1}`,
  company: `Walk Fund ${index + 1}`,
  title: "Partner",
}));
// Two colleagues at the first firm, never written to.
PEOPLE.push(
  {
    email: "analyst@fund1.example",
    first: "Dev",
    last: "Menon",
    company: "Walk Fund 1",
    title: "Analyst",
  },
  {
    email: "intern@fund1.example",
    first: "Isha",
    last: "Bose",
    company: "Walk Fund 1",
    title: "Intern",
  },
);

type Body = Record<string, unknown>;
const today = () => localDay(new Date());

function record(body: Body): Promise<RawAnswer> {
  return stack.ask("POST", "/data/replies", {
    by: WALKER,
    words: "Invented words.",
    subject: "Re: A note",
    received_at: new Date().toISOString(),
    add_if_missing: false,
    ...body,
  });
}

async function lead(email: string): Promise<Body> {
  const answer = await stack.ask("GET", `/data/leads/${leadIdOf(email)}`);
  expect(answer.status).toBe(200);
  return answer.json!.lead as Body;
}

async function followUps(): Promise<Body[]> {
  return (await stack.ask("GET", "/data/follow-ups?state=all")).json!.follow_ups as Body[];
}

beforeAll(async () => {
  // The interim state between Units 3 and 4 (no waitlist yet): the waitlist module is left out.
  stack = await startStack({
    liveProvider: () => provider,
    modules: ["files", "leads", "replies"],
  });
  await readyToSend(stack.engine);
  listId = stack.engine.importList({
    name: "Walk 01",
    file_name: "walk-01.csv",
    text: peopleCsv(PEOPLE),
  }).list.id;
  await until(async () => {
    const page = (await stack.ask("GET", "/data/leads")).json!;
    return page.total === PEOPLE.length && page.reading === false;
  }, "the list to be read");
}, 60_000);
afterAll(() => stack.stop());

describe("a Yes", () => {
  it("is refused while the waitlist is not set up, and the lead stands as it was (R1)", async () => {
    const before = await lead("partner1@fund1.example");
    const answer = await record({ email: "partner1@fund1.example", outcome: "replied_positive" });
    expect(answer.status).toBe(409);
    expect(answer.json!.error).toEqual({
      code: "waitlist_missing",
      message: "The waitlist is not set up here yet.",
    });
    const after = await lead("partner1@fund1.example");
    expect(after.status).toBe(before.status);
    expect(after.replies).toEqual([]);
  });

  it("joins the firm with the quote, subject and received time (R1, with a stand-in waitlist)", async () => {
    expect(
      (await stack.ask("POST", "/data/_test/waitlist", { by: WALKER, on: true })).json,
    ).toMatchObject({
      installed: true,
    });
    try {
      const received = new Date(Date.now() - 3_600_000).toISOString();
      const answer = await record({
        email: "partner1@fund1.example",
        outcome: "replied_positive",
        words: "Yes, please add us. We would like a call.",
        subject: "Re: A note for Walk Fund 1",
        received_at: received,
      });
      expect(answer.status).toBe(200);
      expect(answer.json!.message).toBe(
        "Recorded: Asha Rao1 said yes. Walk Fund 1 is on the waitlist. 2 other addresses at fund1.example have not been written to yet: see them on the firm's page.",
      );
      expect(String(answer.json!.href)).toMatch(/^\/data\/waitlist\//);
      const reply = answer.json!.reply as Body;
      expect(reply.effects).toEqual([
        { kind: "waitlist_joined", entry_id: expect.any(String), created: true },
      ]);
      const joins = (await stack.ask("GET", "/data/_test/waitlist")).json!.joins as Body[];
      expect(joins).toEqual([
        {
          email: "partner1@fund1.example",
          firm_key: "fund1.example",
          quote: "Yes, please add us. We would like a call.",
          subject: "Re: A note for Walk Fund 1",
          received_at: received,
        },
      ]);
      const after = await lead("partner1@fund1.example");
      expect(after).toMatchObject({ status: "yes" });
      expect(String(after.status_detail)).toMatch(/ · on the waitlist$/);
    } finally {
      await stack.ask("POST", "/data/_test/waitlist", { by: WALKER, on: false });
    }
  });
});

describe("a No", () => {
  it("puts the address on Mail merge's stop list as Asked to stop (R2)", async () => {
    const answer = await record({ email: "partner2@fund2.example", outcome: "not_interested" });
    expect(answer.status).toBe(200);
    expect(answer.json!.message).toBe(
      "Recorded: Ravi Rao2 said no. They are on the stop list and will not be written to again.",
    );
    expect((answer.json!.reply as Body).effects).toEqual([
      { kind: "stop_added", email: "partner2@fund2.example", at: expect.any(String) },
    ]);
    expect(stack.engine.stops({}).stops).toEqual([
      expect.objectContaining({ email: "partner2@fund2.example", reason: "asked" }),
    ]);
    expect(await lead("partner2@fund2.example")).toMatchObject({ status: "no" });
  });
});

describe("a Later", () => {
  it("reminds on today + 14 days by default, on the day given otherwise, and refuses the past (R3)", async () => {
    const plain = await record({ email: "partner3@fund3.example", outcome: "not_now" });
    expect(plain.status).toBe(200);
    const fourteen = addDays(today(), 14);
    expect((plain.json!.reply as Body).later_until).toBe(fourteen);
    const given = await record({
      email: "partner4@fund4.example",
      outcome: "not_now",
      later_until: addDays(today(), 30),
    });
    expect(given.status).toBe(200);
    const items = await followUps();
    expect(items.find((item) => item.email === "partner3@fund3.example")).toMatchObject({
      kind: "write_again",
      title: "Write to Meera Rao3 again",
      due_on: fourteen,
      state: "open",
    });
    expect(items.find((item) => item.email === "partner4@fund4.example")).toMatchObject({
      due_on: addDays(today(), 30),
    });
    const past = await record({
      email: "partner5@fund5.example",
      outcome: "not_now",
      later_until: addDays(today(), -1),
    });
    expect(past.status).toBe(400);
    expect((past.json!.error as Body).message).toBe("The day to write again is in the past.");
  });

  it("as out of office, reminds the working day after and counts apart from human replies (R3)", async () => {
    const overviewBefore = (await stack.ask("GET", "/data/overview")).json!.replies as Body;
    const back = addDays(today(), 5);
    const answer = await record({
      email: "partner6@fund6.example",
      outcome: "not_now",
      auto_reply: "on",
      later_until: back,
    });
    expect(answer.status).toBe(200);
    const reply = answer.json!.reply as Body;
    expect(reply.outcome).toBe("out_of_office");
    expect(answer.json!.message).toMatch(
      /^Recorded: out of office until .+\. A reminder is set for .+\.$/,
    );
    const item = (await followUps()).find((entry) => entry.email === "partner6@fund6.example")!;
    expect(item.due_on).toBe(workingDayAfter(back));
    const overviewAfter = (await stack.ask("GET", "/data/overview")).json!.replies as Body;
    expect(overviewAfter.today).toBe(overviewBefore.today);
    expect(await lead("partner6@fund6.example")).toMatchObject({ status: "later" });
  });
});

describe("a Wrong person", () => {
  it("adds whoever they named as a referral lead with the firm's fields, and a follow-up (R4)", async () => {
    const answer = await record({
      email: "partner7@fund7.example",
      outcome: "wrong_person",
      referral: { name: "Rhea Walkname", email: "rhea@fund7.example", title: "Head of research" },
    });
    expect(answer.status).toBe(200);
    const due = addWorkingDays(today(), 2);
    expect(answer.json!.message).toMatch(
      /^Recorded: wrong person\. Rhea Walkname is added as a lead, with a follow-up for .+\.$/,
    );
    const named = await lead("rhea@fund7.example");
    expect(named).toMatchObject({
      name: "Rhea Walkname",
      title: "Head of research",
      company: "Walk Fund 7",
      country: "India",
      city: "Mumbai",
      firm_type: "Family office",
      tags: ["Referral"],
      badges: ["Referral"],
    });
    expect((named.sources as Body[])[0]!.label).toMatch(/^Named by partner7@fund7\.example on /);
    const item = (await followUps()).find((entry) => entry.email === "rhea@fund7.example")!;
    expect(item).toMatchObject({
      kind: "write_to_named",
      title: "Write to Rhea Walkname, named by Asha Rao7",
      due_on: due,
    });
    expect(await lead("partner7@fund7.example")).toMatchObject({
      status: "wrong_person",
      status_detail: "Named Rhea Walkname",
    });
  });

  it("without an address, asks you to find one", async () => {
    const answer = await record({
      email: "partner8@fund8.example",
      outcome: "wrong_person",
      referral: { name: "Kabir Walkname", email: "", title: "" },
    });
    expect(answer.status).toBe(200);
    expect(answer.json!.message).toMatch(
      /A follow-up for .+ asks you to find Kabir Walkname's address\.$/,
    );
    expect(
      (await followUps()).find((entry) => entry.email === "partner8@fund8.example"),
    ).toMatchObject({
      kind: "find_address",
      title: "Find an address for Kabir Walkname",
    });
  });
});

describe("a Question", () => {
  it("makes a follow-up due today, carrying their words (R5)", async () => {
    const answer = await record({
      email: "partner9@fund9.example",
      outcome: "question",
      words: "Does it cover unlisted companies?",
    });
    expect(answer.status).toBe(200);
    expect(answer.json!.message).toBe("Recorded: a question. It is on today's follow-ups.");
    expect(
      (await followUps()).find((entry) => entry.email === "partner9@fund9.example"),
    ).toMatchObject({
      kind: "answer",
      title: "Answer Meera Rao9's question",
      due_on: today(),
      note: "Does it cover unlisted companies?",
    });
    const overview = (await stack.ask("GET", "/data/overview")).json!;
    expect(
      (overview.due as Body[]).some((item) => item.title === "Answer Meera Rao9's question"),
    ).toBe(true);
    expect((overview.follow_ups as Body).due).toBeGreaterThanOrEqual(1);
  });
});

describe("an address that is not a lead", () => {
  it("is refused unless the box is ticked, and added when it is (R6)", async () => {
    const refused = await record({ email: "stranger@unknown.example", outcome: "question" });
    expect(refused.status).toBe(409);
    expect((refused.json!.error as Body).message).toBe(
      "No lead has that address. Tick “If they are not a lead yet, add them” to record it.",
    );
    expect(
      (await stack.ask("GET", `/data/leads/${leadIdOf("stranger@unknown.example")}`)).status,
    ).toBe(404);
    const added = await record({
      email: "Stranger@Unknown.example",
      outcome: "question",
      add_if_missing: true,
    });
    expect(added.status).toBe(200);
    expect((added.json!.reply as Body).effects).toContainEqual({
      kind: "lead_added",
      lead_id: leadIdOf("stranger@unknown.example"),
      email: "stranger@unknown.example",
    });
    expect(await lead("stranger@unknown.example")).toMatchObject({ status: "question" });
    const bad = await record({ email: "not an address", outcome: "question" });
    expect((bad.json!.error as Body).message).toBe("That is not an email address.");
  });
});

describe("a double press", () => {
  it("records one reply (R10)", async () => {
    const attempt = randomUUID();
    const first = await record({ email: "partner10@fund10.example", outcome: "question", attempt });
    const second = await record({
      email: "partner10@fund10.example",
      outcome: "question",
      attempt,
    });
    expect(first.status).toBe(200);
    expect(second.json).toEqual(first.json);
    const replies = (await lead("partner10@fund10.example")).replies as Body[];
    expect(replies).toHaveLength(1);
  });
});

describe("taking a reply back", () => {
  it("takes a No off the stop list and says so, and keeps what must stay (R7)", async () => {
    const answer = await record({ email: "partner11@fund11.example", outcome: "not_interested" });
    const replyId = String((answer.json!.reply as Body).reply_id);
    expect(
      stack.engine.stops({}).stops.some((stop) => stop.email === "partner11@fund11.example"),
    ).toBe(true);
    const preview = (await stack.ask("GET", `/data/replies/${replyId}/take-back-preview`)).json!;
    expect(preview.undo).toEqual([
      { kind: "stop_added", email: "partner11@fund11.example", at: expect.any(String) },
    ]);
    expect(preview.keep).toEqual([]);
    const taken = await stack.ask("POST", `/data/replies/${replyId}/take-back`, { by: WALKER });
    expect(taken.status).toBe(200);
    expect(taken.json!.message).toBe(
      "Taken back: partner11@fund11.example is off the stop list again.",
    );
    expect(
      stack.engine.stops({}).stops.some((stop) => stop.email === "partner11@fund11.example"),
    ).toBe(false);
    const after = await lead("partner11@fund11.example");
    expect(after.status).toBe("not_sent");
    expect((after.replies as Body[])[0]!.taken_back).toMatchObject({
      by: WALKER,
      undone: [{ kind: "stop_added", email: "partner11@fund11.example" }],
      kept: [],
    });
    const twice = await stack.ask("POST", `/data/replies/${replyId}/take-back`, { by: WALKER });
    expect(codeOf(twice)).toBe("taken_back");

    // A referral lead it added stays: no lead is ever removed.
    const wrong = await record({
      email: "partner12@fund12.example",
      outcome: "wrong_person",
      referral: { name: "Tara Walkname", email: "tara@fund12.example", title: "" },
    });
    const wrongId = String((wrong.json!.reply as Body).reply_id);
    const plan = (await stack.ask("GET", `/data/replies/${wrongId}/take-back-preview`)).json!;
    expect(plan.undo).toEqual([{ kind: "follow_up", follow_up_id: expect.any(String) }]);
    expect(plan.keep).toEqual([
      {
        effect: {
          kind: "lead_added",
          lead_id: leadIdOf("tara@fund12.example"),
          email: "tara@fund12.example",
        },
        why: "tara@fund12.example stays in All leads: a lead is never removed.",
      },
    ]);
    const back = await stack.ask("POST", `/data/replies/${wrongId}/take-back`, { by: WALKER });
    expect(back.json!.message).toBe("Taken back: its follow-up is closed.");
    expect((await stack.ask("GET", `/data/leads/${leadIdOf("tara@fund12.example")}`)).status).toBe(
      200,
    );
  });
});

describe("a follow-up", () => {
  it("to write again closes itself when Mail merge writes to them again (R8)", async () => {
    const answer = await record({ email: "partner13@fund13.example", outcome: "not_now" });
    expect(answer.status).toBe(200);
    const open = (await followUps()).find((item) => item.email === "partner13@fund13.example")!;
    expect(open.state).toBe("open");
    await sendLive(stack.engine, listId, "Walk live 02");
    await until(async () => {
      await stack.ask("GET", "/data/leads"); // reads the written log now rather than in 5 s
      const item = (await followUps()).find((entry) => entry.follow_up_id === open.follow_up_id)!;
      return item.state === "closed_by_send";
    }, "the follow-up to close");
    const closed = (await followUps()).find((entry) => entry.follow_up_id === open.follow_up_id)!;
    expect(closed.note).toMatch(/^Done: written to again by “Walk live 02” on /);
  });

  it("can be added by hand, moved and done", async () => {
    const added = await stack.ask("POST", "/data/follow-ups", {
      by: WALKER,
      email: "partner14@fund14.example",
      title: "Send the deck",
      due_on: addDays(today(), 3),
    });
    expect(added.status).toBe(200);
    const id = String((added.json!.follow_up as Body).follow_up_id);
    const moved = await stack.ask("POST", `/data/follow-ups/${id}/move`, {
      by: WALKER,
      due_on: addDays(today(), 4),
    });
    expect((moved.json!.follow_up as Body).due_on).toBe(addDays(today(), 4));
    const past = await stack.ask("POST", `/data/follow-ups/${id}/move`, {
      by: WALKER,
      due_on: addDays(today(), -2),
    });
    expect(past.status).toBe(400);
    const done = await stack.ask("POST", `/data/follow-ups/${id}/done`, {
      by: WALKER,
      note: "Sent it.",
    });
    expect(done.json!.follow_up).toMatchObject({
      state: "done",
      note: "Sent it.",
      done_by: WALKER,
    });
    const notLead = await stack.ask("POST", "/data/follow-ups", {
      by: WALKER,
      email: "nobody@nowhere.example",
      title: "x",
      due_on: today(),
    });
    expect(codeOf(notLead)).toBe("not_a_lead");
  });
});

describe("the replies list", () => {
  it("counts each outcome as the rows under its tab (R9)", async () => {
    const all = (await stack.ask("GET", "/data/replies")).json!;
    const counts = all.counts as Record<string, number>;
    for (const outcome of [
      "replied_positive",
      "not_interested",
      "not_now",
      "out_of_office",
      "wrong_person",
      "question",
    ]) {
      const tab = (await stack.ask("GET", `/data/replies?outcome=${outcome}`)).json!;
      expect({ outcome, rows: (tab.replies as Body[]).length }).toEqual({
        outcome,
        rows: counts[outcome],
      });
      expect(tab.total).toBe(counts[outcome]);
    }
    expect(all.total).toBe(counts.all);
    const sum = Object.entries(counts)
      .filter(([key]) => key !== "all")
      .reduce((total, [, count]) => total + count, 0);
    expect(sum).toBe(counts.all);
    // Taken-back replies stay listed; the readouts count only the ones that stand.
    const live = all.live as Record<string, number>;
    expect(live.all).toBe(counts.all! - 2);
    const searched = (await stack.ask("GET", "/data/replies?q=unlisted%20companies")).json!;
    expect((searched.replies as Body[]).map((row) => row.email)).toEqual([
      "partner9@fund9.example",
    ]);
  });
});
