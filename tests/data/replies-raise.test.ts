// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { localDay } from "../../scripts/data/days";
import { investorIdOf } from "../../scripts/data/investors/types";
import { leadIdOf } from "../../scripts/data/leads/types";
import { DEFAULT_YES_ANSWER, fillAnswer } from "../../scripts/data/replies/settings";
import { Scripted, peopleCsv, readyToSend, sendLive } from "./leads-kit";
import { WALKER, codeOf, startStack, until, type RawAnswer, type Stack } from "./helpers";

/**
 * The raise batch's replies (spec §7.2) on the real stack: the firm hold (made, counted,
 * released by hand and by taking the reply back, refused for out of office, free mail and
 * more than 200), the two new outcomes for a lead and for an investor, and the answer to a
 * yes. Every person is invented, on `.example`.
 */

let stack: Stack;
const provider = new Scripted();
const today = () => localDay(new Date());
type Body = Record<string, unknown>;

// The hand check's firm: A replies, B never written to, C written to, D stopped, E named.
const A = "asha@firm3001.example";
const B = "ben@firm3001.example";
const C = "cara@firm3001.example";
const D = "dev@firm3001.example";
const E = "esha@firm3001.example";

const person = (email: string, first: string, company: string) => ({
  email,
  first,
  last: "Walk",
  company,
});

const FIRMS = [
  person(A, "Asha", "Walk Capital 3001"),
  person(B, "Ben", "Walk Capital 3001"),
  person(D, "Dev", "Walk Capital 3001"),
  person(E, "Esha", "Walk Capital 3001"),
  // Out of office, with a colleague.
  person("faye@firm3002.example", "Faye", "Walk Capital 3002"),
  person("gil@firm3002.example", "Gil", "Walk Capital 3002"),
  // No box sent: an older caller.
  person("ira@firm3003.example", "Ira", "Walk Capital 3003"),
  person("jai@firm3003.example", "Jai", "Walk Capital 3003"),
  // The release route.
  person("xena@firm3005.example", "Xena", "Walk Capital 3005"),
  person("yash@firm3005.example", "Yash", "Walk Capital 3005"),
  person("zara@firm3005.example", "Zara", "Walk Capital 3005"),
  // A meeting request, needs review.
  person("kian@firm3006.example", "Kian", "Walk Capital 3006"),
  person("mira@firm3007.example", "Mira", "Walk Capital 3007"),
  person("nils@firm3007.example", "Nils", "Walk Capital 3007"),
];

/** One firm with 202 people: a reply there would hold 201, too many at once. */
const BIG = Array.from({ length: 202 }, (_, index) =>
  person(`p${index + 1}@firm3004.example`, `P${index + 1}`, "Walk Capital 3004"),
);

/** Names the answer is filled in with: a full name only, no name, and free mail. */
const ODD_CSV = [
  "Email,Name,Company,Email Kind",
  "zoya@firm3008.example,Zoya Kapoor,,named",
  "nobody@firm3009.example,,,named",
  "hari.walk@inbox.example,Hari Walk,,personal-domain",
].join("\n");

/** One investor firm, never written to. */
const INVESTOR_CSV = [
  "Email,First Name,Last Name,Title,Company,Tier,Category,Email Kind",
  "lena@fund7.example,Lena,Walk,Partner,Walk Fund 7,1,Seed VC,named",
].join("\n");

const LEADS = 1 + FIRMS.length + BIG.length + 3 + 1;

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

const stopped = (email: string) =>
  stack.engine.stops({}).stops.find((stop) => stop.email === email) ?? null;

function holdsFile(): { format: number; holds: { emails: string[]; firm_key: string }[] } {
  return JSON.parse(readFileSync(join(stack.dir, "data", "replies", "firm-holds.json"), "utf8"));
}

beforeAll(async () => {
  stack = await startStack({
    liveProvider: () => provider,
    modules: ["files", "leads", "replies", "investors"],
  });
  await readyToSend(stack.engine);
  // C is written to by a live mailing; nobody else at the firm is.
  const sent = stack.engine.importList({
    name: "Walk 01",
    file_name: "walk-01.csv",
    text: peopleCsv([person(C, "Cara", "Walk Capital 3001")]),
  }).list.id;
  await sendLive(stack.engine, sent, "Walk live 01");
  stack.engine.importList({
    name: "Walk firms",
    file_name: "walk-firms.csv",
    text: peopleCsv(FIRMS),
  });
  stack.engine.importList({ name: "Walk big", file_name: "walk-big.csv", text: peopleCsv(BIG) });
  stack.engine.importList({ name: "Walk odd", file_name: "walk-odd.csv", text: `${ODD_CSV}\n` });
  const investors = stack.engine.importList({
    name: "Walk investors",
    file_name: "walk-investors.csv",
    text: `${INVESTOR_CSV}\n`,
  }).list.id;
  // D asked to stop before anything here.
  stack.engine.addStops({ emails: D, reason: "asked" });
  await until(async () => {
    const page = (await stack.ask("GET", "/data/leads")).json!;
    return page.total === LEADS && page.reading === false;
  }, "the lists to be read");
  expect(
    (await stack.ask("POST", "/data/investors/setup", { list_ids: [investors], by: WALKER }))
      .status,
  ).toBe(200);
  expect(
    (await stack.ask("POST", "/data/_test/waitlist", { by: WALKER, on: true })).json,
  ).toMatchObject({ installed: true });
}, 60_000);
afterAll(() => stack.stop());

describe("the firm hold", () => {
  it("holds B and C, counts D as stopped already, never touches A or E (hand check)", async () => {
    const answer = await record({
      email: A,
      outcome: "wrong_person",
      referral: { name: "Esha Walk", email: E, title: "Analyst" },
      hold_firm: true,
    });
    expect(answer.status).toBe(200);
    expect(answer.json!.message).toMatch(
      /^Recorded: wrong person\. Esha Walk is already a lead; a follow-up for .+ is set\. 2 other addresses at firm3001\.example are held: nobody else there is written to\.$/,
    );
    const effects = (answer.json!.reply as Body).effects as Body[];
    expect(effects).toContainEqual({
      kind: "firm_held",
      hold_id: expect.any(String),
      domain: "firm3001.example",
      held: 2,
    });
    expect(holdsFile().holds).toEqual([
      expect.objectContaining({ firm_key: "firm3001.example", emails: [B, C] }),
    ]);
    expect(stopped(B)).toMatchObject({ reason: "manual" });
    expect(stopped(C)).toMatchObject({ reason: "manual" });
    expect(stopped(D)).toMatchObject({ reason: "asked" });
    expect(stopped(A)).toBeNull();
    expect(stopped(E)).toBeNull();
    // B's lead reads Held back, because someone at the firm replied.
    const held = await lead(B);
    expect(held).toMatchObject({
      status: "held_back",
      status_detail: "Someone at the firm replied",
    });
    expect(held.firm_hold).toMatchObject({
      reason: "Someone at the firm replied",
      firm: "firm3001.example",
      on: today(),
    });
    // The reply row says what it held.
    const row = ((await stack.ask("GET", "/data/replies?q=asha")).json!.replies as Body[])[0]!;
    expect(row.firm_hold).toMatchObject({ domain: "firm3001.example", held: 2, open: 2 });
  });

  it("taking A's reply back releases B, and keeps C because C said no in between", async () => {
    const no = await record({ email: C, outcome: "not_interested" });
    expect(no.status).toBe(200);
    expect((no.json!.reply as Body).effects).toEqual([{ kind: "stop_already", email: C }]);
    const replyId = String(
      (((await stack.ask("GET", "/data/replies?q=asha")).json!.replies as Body[])[0] ?? {})
        .reply_id,
    );
    const plan = (await stack.ask("GET", `/data/replies/${replyId}/take-back-preview`)).json!;
    expect(plan.undo).toContainEqual({
      kind: "firm_held",
      hold_id: expect.any(String),
      domain: "firm3001.example",
      held: 2,
    });
    const taken = await stack.ask("POST", `/data/replies/${replyId}/take-back`, { by: WALKER });
    expect(taken.status).toBe(200);
    expect(taken.json!.message).toContain("the 1 address held at firm3001.example is released");
    expect(taken.json!.kept).toContainEqual({
      effect: expect.objectContaining({ kind: "firm_held" }),
      why: `${C} stays on the stop list: they said no.`,
    });
    expect(stopped(B)).toBeNull();
    expect(stopped(C)).not.toBeNull();
    expect(await lead(B)).toMatchObject({ firm_hold: null });
    expect((await lead(C)).status).toBe("no");
  });

  it("never holds for an out-of-office reply, free mail, or a caller that sends no box", async () => {
    const away = await record({
      email: "faye@firm3002.example",
      outcome: "not_now",
      auto_reply: true,
      hold_firm: true,
    });
    expect(away.status).toBe(200);
    expect(away.json!.message).not.toMatch(/held/);
    expect(stopped("gil@firm3002.example")).toBeNull();
    const free = await record({
      email: "hari.walk@inbox.example",
      outcome: "question",
      hold_firm: true,
    });
    expect(free.status).toBe(200);
    expect(free.json!.message).toBe("Recorded: a question. It is on today's follow-ups.");
    const older = await record({ email: "ira@firm3003.example", outcome: "question" });
    expect(older.json!.message).toBe("Recorded: a question. It is on today's follow-ups.");
    expect(stopped("jai@firm3003.example")).toBeNull();
    for (const body of [away, free, older])
      expect(
        ((body.json!.reply as Body).effects as Body[]).some((e) => e.kind === "firm_held"),
      ).toBe(false);
  });

  it("holds none when there are more than 200, and says how many", async () => {
    const before = stack.engine.stops({}).stops.length;
    const answer = await record({
      email: "p1@firm3004.example",
      outcome: "question",
      hold_firm: "on",
    });
    expect(answer.status).toBe(200);
    expect(answer.json!.message).toBe(
      "Recorded: a question. It is on today's follow-ups. There are 201 other addresses at firm3004.example, too many to hold at once: none were held.",
    );
    expect(stack.engine.stops({}).stops.length).toBe(before);
  });

  it("releases from Replies: one, then the rest; an entry put back for another reason stays", async () => {
    const answer = await record({
      email: "zara@firm3005.example",
      outcome: "question",
      hold_firm: "true",
    });
    expect(answer.json!.message).toContain("2 other addresses at firm3005.example are held");
    const replyId = String((answer.json!.reply as Body).reply_id);
    // Xena is taken off by hand and put back as "asked to stop": not the hold's entry now.
    stack.engine.removeStop({ email: "xena@firm3005.example" });
    stack.engine.addStops({ emails: "xena@firm3005.example", reason: "asked" });
    const one = await stack.ask("POST", `/data/replies/${replyId}/release-hold`, {
      emails: ["yash@firm3005.example"],
      by: WALKER,
    });
    expect(one.json).toMatchObject({
      released: ["yash@firm3005.example"],
      not_stopped: [],
      kept: [],
      message: "Released 1.",
    });
    expect(stopped("yash@firm3005.example")).toBeNull();
    const rest = await stack.ask("POST", `/data/replies/${replyId}/release-hold`, { by: WALKER });
    expect(rest.json).toMatchObject({
      released: [],
      kept: [
        {
          email: "xena@firm3005.example",
          why: "it was put on the stop list again since, for another reason",
        },
      ],
    });
    expect(stopped("xena@firm3005.example")).toMatchObject({ reason: "asked" });
    const again = await stack.ask("POST", `/data/replies/${replyId}/release-hold`, { by: WALKER });
    expect(again.status).toBe(409);
    expect(codeOf(again)).toBe("nothing_held");
    expect((again.json!.error as Body).message).toBe("Nothing in that hold is still held back.");
  });
});

describe("a meeting request", () => {
  it("from a lead: the firm joins the waitlist, the lead said yes, and it counts as a yes", async () => {
    const before = (await stack.ask("GET", "/data/overview")).json!.replies as Body;
    const answer = await record({ email: "kian@firm3006.example", outcome: "meeting_request" });
    expect(answer.status).toBe(200);
    expect(answer.json!.message).toBe(
      "Recorded: Kian Walk asked to meet. Walk Capital 3006 is on the waitlist.",
    );
    const joins = (await stack.ask("GET", "/data/_test/waitlist")).json!.joins as Body[];
    expect(joins.map((join) => join.email)).toContain("kian@firm3006.example");
    expect(await lead("kian@firm3006.example")).toMatchObject({ status: "yes" });
    const after = (await stack.ask("GET", "/data/overview")).json!.replies as Body;
    expect(after.yes_today).toBe(Number(before.yes_today) + 1);
    expect(after.yes_total).toBe(Number(before.yes_total) + 1);
  });

  it("from an investor: Replied, with the next step to send times, not the waitlist", async () => {
    const answer = await record({ email: "lena@fund7.example", outcome: "meeting_request" });
    expect(answer.status).toBe(200);
    expect(answer.json!.message).toBe(
      "Recorded: Lena Walk asked to meet. Walk Fund 7 moves to Replied in Investors, not the waitlist.",
    );
    const firm = (await stack.ask("GET", `/data/investors/${investorIdOf("fund7.example")}`)).json!
      .investor as Body;
    expect(firm).toMatchObject({
      stage: "replied",
      next_step: "Send times or your booking link",
      next_step_on: today(),
    });
    const joins = (await stack.ask("GET", "/data/_test/waitlist")).json!.joins as Body[];
    expect(joins.map((join) => join.email)).not.toContain("lena@fund7.example");
  });
});

describe("needs review", () => {
  it("leaves a follow-up for today and nothing else; a later reply closes it", async () => {
    const words = "Interesting. Let me think about who here would look at it.";
    // The hold box ticked too: needs review does nothing but leave the follow-up.
    const answer = await record({
      email: "mira@firm3007.example",
      outcome: "needs_review",
      words,
      hold_firm: true,
    });
    expect(answer.status).toBe(200);
    expect(answer.json!.message).toBe(
      "Recorded: it needs review. A follow-up for today asks you to decide what it means.",
    );
    const effects = (answer.json!.reply as Body).effects as Body[];
    expect(effects.map((effect) => effect.kind)).toEqual(["follow_up"]);
    expect(stopped("nils@firm3007.example")).toBeNull();
    const items = (await stack.ask("GET", "/data/follow-ups?state=all")).json!.follow_ups as Body[];
    const review = items.find((item) => item.email === "mira@firm3007.example")!;
    expect(review).toMatchObject({
      kind: "review",
      title: "Decide what Mira Walk's reply means",
      due_on: today(),
      note: words,
      state: "open",
    });
    expect(await lead("mira@firm3007.example")).toMatchObject({ status: "review" });
    const yes = await record({ email: "mira@firm3007.example", outcome: "replied_positive" });
    expect(yes.status).toBe(200);
    const closed = (
      (await stack.ask("GET", "/data/follow-ups?state=all")).json!.follow_ups as Body[]
    ).find((item) => item.follow_up_id === review.follow_up_id)!;
    expect(closed).toMatchObject({ state: "done", note: "Answered by a later reply" });
    expect(await lead("mira@firm3007.example")).toMatchObject({ status: "yes" });
  });
});

describe("the answer to a yes", () => {
  it("fills in the first name, the firm and the link, with fallbacks", () => {
    const template = "{first_name} at {firm}: {booking_link}";
    expect(
      fillAnswer(template, "", {
        first_name: "Asha",
        name: "Asha Rao",
        company: "Peak",
        firm_key: "",
      }),
    ).toBe("Asha at Peak: [your booking link]");
    expect(
      fillAnswer(template, "https://book.example/a", {
        first_name: "",
        name: "Zoya Kapoor",
        company: "",
        firm_key: "firm3008.example",
      }),
    ).toBe("Zoya at firm3008.example: https://book.example/a");
    expect(fillAnswer(template, "", { first_name: "", name: "", company: "", firm_key: "" })).toBe(
      "there at your firm: [your booking link]",
    );
  });

  it("is given after a yes or a meeting request, null otherwise, from the saved settings", async () => {
    const settings = (await stack.ask("GET", "/data/replies/settings")).json!.settings as Body;
    expect(settings).toMatchObject({ booking_link: "", yes_answer: DEFAULT_YES_ANSWER });
    const zoya = await record({ email: "zoya@firm3008.example", outcome: "replied_positive" });
    expect(zoya.json!.answer).toBe(
      "Thank you, Zoya. I would be glad to show you what we are building and hear how firm3008.example works today. Choose a time that suits you here: [your booking link]",
    );
    const saved = await stack.ask("POST", "/data/replies/settings", {
      booking_link: "https://book.example/walk",
      yes_answer: "Thank you, {first_name}. {booking_link}",
      by: WALKER,
    });
    expect(saved.status).toBe(200);
    const nobody = await record({ email: "nobody@firm3009.example", outcome: "meeting_request" });
    expect(nobody.json!.answer).toBe("Thank you, there. https://book.example/walk");
    const question = await record({ email: "nobody@firm3009.example", outcome: "question" });
    expect(question.json!.answer).toBeNull();
  });

  it("refuses a link that is not https, an empty answer and anything else in braces", async () => {
    const post = (body: Body) =>
      stack.ask("POST", "/data/replies/settings", { by: WALKER, yes_answer: "Hi", ...body });
    for (const [body, message] of [
      [{ booking_link: "http://book.example/walk" }, "Paste the whole link, starting https://."],
      [{ booking_link: "book.example/walk" }, "Paste the whole link, starting https://."],
      [{ booking_link: "", yes_answer: "  " }, "Write your answer."],
      [
        { booking_link: "", yes_answer: "Hi {name}, {booking_link}" },
        "Only {first_name}, {firm} and {booking_link} can be filled in.",
      ],
    ] as const) {
      const answer = await post(body);
      expect(answer.status).toBe(400);
      expect((answer.json!.error as Body).message).toBe(message);
    }
    // Blank means no link; the answer stands as saved.
    const cleared = await post({ booking_link: "" });
    expect(cleared.status).toBe(200);
    expect((cleared.json!.settings as Body).booking_link).toBe("");
  });
});
