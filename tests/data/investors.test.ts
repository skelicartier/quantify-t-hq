// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, addWorkingDays, localDay } from "../../scripts/data/days";
import { amountValue, groupLists, moneyOf } from "../../scripts/data/investors/book";
import { investorIdOf } from "../../scripts/data/investors/types";
import { leadIdOf } from "../../scripts/data/leads/types";
import type { SenderList } from "../../scripts/data/sender-files";
import { Scripted, peopleCsv, readyToSend, sendLive } from "./leads-kit";
import { WALKER, codeOf, startStack, until, type RawAnswer, type Stack } from "./helpers";

/**
 * Investors on the real stack: firms grouped from an invented investor list, the written
 * stage seeded from Mail merge's written log, what each reply does to an investor firm with
 * the real replies module (a no reaching Mail merge's stop list, a yes leaving the waitlist
 * alone), the stage rules, and money summed per currency, never across. Every person is
 * invented, on `.example`.
 */

let stack: Stack;
const provider = new Scripted();
let investorListId = "";
const today = () => localDay(new Date());
type Body = Record<string, unknown>;

/** Walk 01: the people the live mailing writes to, before the investor list exists. */
const SENT = [1, 2, 3, 4, 5, 6].map((n) => ({
  email: `partner${n}@fund${n}.example`,
  first: ["Asha", "Ravi", "Meera"][(n - 1) % 3]!,
  last: `Rao${n}`,
  title: "Partner",
  company: `Walk Fund ${n}`,
}));

/** The investor list: five firms written to, two not, two angels on a personal domain. */
const INVESTOR_CSV = [
  "Email,First Name,Last Name,Title,Company,Tier,Category,Email Kind",
  "partner1@fund1.example,Asha,Rao1,Partner,Walk Fund 1,1,Seed VC,named",
  "analyst1@fund1.example,Dev,Menon,Analyst,Walk Fund 1,1,Seed VC,named",
  "partner2@fund2.example,Ravi,Rao2,Partner,Walk Fund 2,2,Micro VC,named",
  "partner3@fund3.example,Meera,Rao3,Partner,Walk Fund 3,2,Micro VC,named",
  "partner4@fund4.example,Asha,Rao4,Partner,Walk Fund 4,1,Family office,named",
  "partner5@fund5.example,Ravi,Rao5,Partner,Walk Fund 5,3,Seed VC,named",
  "gp1@seedhouse.example,Isha,Bose,General partner,Seed House,1,Seed VC,named",
  "gp2@seedhouse.example,Kabir,Shah,Principal,Seed House,1,Seed VC,named",
  "gp@earlyfund.example,Nina,Iyer,General partner,Early Fund,2,Seed VC,named",
  "angel.one@inbox.example,Tara,Nair,Angel,,3,Angel,personal-domain",
  "angel.two@inbox.example,Omar,Khan,Angel,,3,Angel,personal-domain",
].join("\n");

const id = (domainOrKey: string) => investorIdOf(domainOrKey);

async function investor(key: string): Promise<Body> {
  const answer = await stack.ask("GET", `/data/investors/${id(key)}`);
  expect(answer.status).toBe(200);
  return answer.json!.investor as Body;
}

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

function stopList(): { email: string; reason: string }[] {
  return JSON.parse(readFileSync(join(stack.dir, "stop-list.json"), "utf8")) as {
    email: string;
    reason: string;
  }[];
}

beforeAll(async () => {
  stack = await startStack({ liveProvider: () => provider });
  await readyToSend(stack.engine);
  const walk = stack.engine.importList({
    name: "Walk 01",
    file_name: "walk-01.csv",
    text: peopleCsv(SENT),
  }).list.id;
  await sendLive(stack.engine, walk, "Walk live 01");
  investorListId = stack.engine.importList({
    name: "Walk investors",
    file_name: "walk-investors.csv",
    text: `${INVESTOR_CSV}\n`,
  }).list.id;
  await until(async () => {
    const page = (await stack.ask("GET", "/data/leads")).json!;
    return page.total === 12 && page.reading === false;
  }, "the lists to be read");
}, 60_000);
afterAll(() => stack.stop());

describe("choosing the investor list", () => {
  it("starts with no list chosen and the lists to choose from", async () => {
    const setup = (await stack.ask("GET", "/data/investors/setup")).json!;
    expect((setup.chosen as Body).list_ids).toEqual([]);
    expect((setup.lists as { name: string }[]).map((list) => list.name)).toContain(
      "Walk investors",
    );
    const page = (await stack.ask("GET", "/data/investors")).json!;
    expect(page.total).toBe(0);
  });

  it("groups the rows into one firm per domain; a personal domain is a firm of one (I1)", async () => {
    const chosen = await stack.ask("POST", "/data/investors/setup", {
      list_ids: [investorListId],
      by: WALKER,
    });
    expect(chosen.status).toBe(200);
    expect(chosen.json!.firms).toBe(9);
    const page = (await stack.ask("GET", "/data/investors")).json!;
    expect(page.total).toBe(9);
    const counts = page.counts as Record<string, number>;
    expect(counts.all).toBe(9);
    expect(counts.written).toBe(5);
    expect(counts.not_written).toBe(4);
    const fund1 = await investor("fund1.example");
    expect(fund1.firm).toBe("Walk Fund 1");
    expect((fund1.people as { email: string }[]).map((person) => person.email)).toEqual([
      "partner1@fund1.example",
      "analyst1@fund1.example",
    ]);
    expect(fund1.list_values).toMatchObject({
      Tier: "1",
      Category: "Seed VC",
      Company: "Walk Fund 1",
    });
    expect(JSON.stringify(fund1.list_values)).not.toContain("@");
    const seedHouse = await investor("seedhouse.example");
    expect(seedHouse.stage).toBe("not_written");
    expect((seedHouse.people as unknown[]).length).toBe(2);
    const angel = await investor("mail:angel.one@inbox.example");
    expect(angel.firm).toBe("Tara Nair");
    expect(angel.free_mail).toBe(true);
  });

  it("seeds Written to from the written log, with the mailing and the day", async () => {
    const fund2 = await investor("fund2.example");
    expect(fund2.stage).toBe("written");
    expect(fund2.last_mailing).toBe("Walk live 01");
    expect(localDay(String(fund2.stage_since))).toBe(today());
    const events = (await stack.ask("GET", `/data/investors/${id("fund2.example")}`)).json!
      .events as { kind: string; title: string }[];
    expect(events[0]).toMatchObject({
      kind: "seeded",
      title: "From the list, written to by “Walk live 01”",
    });
    const detail = (await stack.ask("GET", `/data/investors/${id("fund2.example")}`)).json!;
    const sent = detail.sent as { subject: string; email: string }[];
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      subject: "A note for Walk Fund 2",
      email: "partner2@fund2.example",
    });
  });

  it("moves a firm to Written to by itself once Mail merge writes there", async () => {
    const later = stack.engine.importList({
      name: "Walk 02",
      file_name: "walk-02.csv",
      text: peopleCsv([{ email: "gp@earlyfund.example", first: "Nina", company: "Early Fund" }]),
    }).list.id;
    await sendLive(stack.engine, later, "Walk live 02");
    await until(async () => (await investor("earlyfund.example")).stage === "written", "the move");
    const events = (await stack.ask("GET", `/data/investors/${id("earlyfund.example")}`)).json!
      .events as { kind: string; title: string; by: { name: string } }[];
    expect(events[0]).toMatchObject({
      kind: "written",
      title: "Written to by “Walk live 02”",
      by: { name: "Mail merge" },
    });
  });

  it("puts the Investor badge on those leads, and a link to the firm on the lead", async () => {
    await until(async () => {
      const lead = (await stack.ask("GET", `/data/leads/${leadIdOf("partner1@fund1.example")}`))
        .json!.lead as Body;
      return (lead.badges as string[]).includes("Investor");
    }, "the badge");
    const lead = (await stack.ask("GET", `/data/leads/${leadIdOf("partner1@fund1.example")}`)).json!
      .lead as Body;
    expect(lead.investor).toMatchObject({ investor_id: id("fund1.example"), firm: "Walk Fund 1" });
    const other = (await stack.ask("GET", `/data/leads/${leadIdOf("partner6@fund6.example")}`))
      .json!.lead as Body;
    expect(other.badges as string[]).not.toContain("Investor");
    expect(other.investor).toBeNull();
  });

  it("refuses a list that is not in Mail merge, or none", async () => {
    const none = await stack.ask("POST", "/data/investors/setup", { list_ids: [], by: WALKER });
    expect(none.status).toBe(400);
    const gone = await stack.ask("POST", "/data/investors/setup", {
      list_ids: ["not-a-list"],
      by: WALKER,
    });
    expect(codeOf(gone)).toBe("not_found");
  });
});

describe("a reply from an investor address (the interceptor)", () => {
  it("Yes: Replied, Book a meeting in one working day, and the waitlist untouched (I2)", async () => {
    const fake = (await stack.ask("POST", "/data/_test/waitlist", { on: true, by: WALKER })).json!;
    const before = (await stack.ask("GET", "/data/_test/waitlist")).json!.joins as unknown[];
    const answer = await record({ email: "partner1@fund1.example", outcome: "replied_positive" });
    expect(answer.status).toBe(200);
    expect(String(answer.json!.message)).toContain(
      "Walk Fund 1 moves to Replied in Investors, not the waitlist.",
    );
    const effects = (answer.json!.reply as Body).effects as { kind: string; to?: string }[];
    expect(effects).toContainEqual(
      expect.objectContaining({ kind: "investor_stage", from: "written", to: "replied" }),
    );
    expect(effects.some((effect) => effect.kind === "waitlist_joined")).toBe(false);
    if (fake.installed) {
      const after = (await stack.ask("GET", "/data/_test/waitlist")).json!.joins as unknown[];
      expect(after).toHaveLength(before.length);
    }
    const fund1 = await investor("fund1.example");
    expect(fund1).toMatchObject({
      stage: "replied",
      next_step: "Book a meeting",
      next_step_on: addWorkingDays(today(), 1),
    });
    await stack.ask("POST", "/data/_test/waitlist", { on: false, by: WALKER });
  });

  it("anyone else's Yes is not taken over: it goes the waitlist's way as before", async () => {
    const waitlist = (await stack.ask("POST", "/data/_test/need", { name: "waitlist" })).json!;
    const other = await record({ email: "partner6@fund6.example", outcome: "replied_positive" });
    if (waitlist.found) {
      const effects = (other.json!.reply as Body).effects as { kind: string }[];
      expect(effects.map((effect) => effect.kind)).toContain("waitlist_joined");
    } else expect(codeOf(other)).toBe("waitlist_missing");
  });

  it("No: Passed, No reason given, and the address on Mail merge's stop list", async () => {
    const answer = await record({ email: "partner2@fund2.example", outcome: "not_interested" });
    expect(answer.status).toBe(200);
    const fund2 = await investor("fund2.example");
    expect(fund2).toMatchObject({ stage: "passed", passed_reason: "none_given", next_step: "" });
    expect(stopList()).toContainEqual(
      expect.objectContaining({ email: "partner2@fund2.example", reason: "asked" }),
    );
    const effects = (answer.json!.reply as Body).effects as { kind: string }[];
    expect(effects.map((effect) => effect.kind)).toEqual(["investor_stage", "stop_added"]);
  });

  it("Later: Set aside until the day given", async () => {
    const until_ = addDays(today(), 45);
    const answer = await record({
      email: "partner3@fund3.example",
      outcome: "not_now",
      later_until: until_,
    });
    expect(answer.status).toBe(200);
    expect(await investor("fund3.example")).toMatchObject({
      stage: "set_aside",
      set_aside_until: until_,
      next_step: "Write to them again",
      next_step_on: until_,
    });
  });

  it("Question: Replied, plus the replies module's follow-up, listed once in Due", async () => {
    const answer = await record({
      email: "partner4@fund4.example",
      outcome: "question",
      words: "Which funds use it?",
    });
    expect(answer.status).toBe(200);
    const fund4 = await investor("fund4.example");
    expect(fund4).toMatchObject({ stage: "replied", next_step_on: today() });
    const follow = (await stack.ask("GET", "/data/follow-ups")).json!.follow_ups as Body[];
    expect(follow).toContainEqual(
      expect.objectContaining({ email: "partner4@fund4.example", kind: "answer" }),
    );
    const due = (await stack.ask("GET", "/data/overview")).json!.due as Body[];
    const rows = due.filter((item) => String(item.title).startsWith("Answer Asha Rao4"));
    expect(rows).toHaveLength(1);
  });

  it("Wrong person: the named person joins the firm's people and All leads", async () => {
    const answer = await record({
      email: "gp1@seedhouse.example",
      outcome: "wrong_person",
      referral: { name: "Rhea Walkname", email: "rhea@seedhouse.example", title: "Principal" },
    });
    expect(answer.status).toBe(200);
    const house = await investor("seedhouse.example");
    expect(house.people as Body[]).toContainEqual(
      expect.objectContaining({ email: "rhea@seedhouse.example", from: "added" }),
    );
    expect(house.stage).toBe("replied");
    expect(String(house.next_step)).toBe("Write to Rhea Walkname, named by Isha Bose");
    const lead = (await stack.ask("GET", `/data/leads/${leadIdOf("rhea@seedhouse.example")}`)).json!
      .lead as Body;
    expect(lead.tags).toContain("Referral");
    expect(lead.badges).toContain("Investor");
  });

  it("Out of office: a follow-up for the working day after, and no move", async () => {
    const before = await investor("earlyfund.example");
    const answer = await record({
      email: "gp@earlyfund.example",
      outcome: "not_now",
      auto_reply: true,
      later_until: addDays(today(), 7),
    });
    expect(answer.status).toBe(200);
    const after = await investor("earlyfund.example");
    expect(after.stage).toBe(before.stage);
    const effects = (answer.json!.reply as Body).effects as { kind: string }[];
    expect(effects.map((effect) => effect.kind)).toEqual(["follow_up"]);
  });

  it("taking a reply back keeps the investor's stage, and says so", async () => {
    const replies = (await stack.ask("GET", "/data/replies")).json!.replies as Body[];
    const yes = replies.find((row) => row.email === "partner1@fund1.example")!;
    const plan = (await stack.ask("GET", `/data/replies/${String(yes.reply_id)}/take-back-preview`))
      .json!;
    expect(plan.keep).toContainEqual(
      expect.objectContaining({ why: "The investor keeps its stage; move it back in Investors." }),
    );
  });
});

describe("moving a firm", () => {
  it("needs a next step and its day, except to Money in, Passed or Do not pitch", async () => {
    const path = `/data/investors/${id("fund5.example")}/stage`;
    const bare = await stack.ask("POST", path, { stage: "meeting", by: WALKER });
    expect(codeOf(bare)).toBe("needs_next_step");
    const passed = await stack.ask("POST", path, { stage: "passed", by: WALKER });
    expect(codeOf(passed)).toBe("needs_reason");
    const aside = await stack.ask("POST", path, {
      stage: "set_aside",
      next_step: "Write again",
      next_step_on: addDays(today(), 3),
      by: WALKER,
    });
    expect(aside.status).toBe(400);
    const past = await stack.ask("POST", path, {
      stage: "meeting",
      next_step: "Hold the call",
      next_step_on: addDays(today(), -1),
      by: WALKER,
    });
    expect(past.status).toBe(400);
    const booked = await stack.ask("POST", path, {
      stage: "meeting",
      next_step: "Hold the call",
      next_step_on: today(),
      by: WALKER,
    });
    expect(booked.status).toBe(200);
    const due = (await stack.ask("GET", "/data/overview")).json!.due as Body[];
    expect(due).toContainEqual(
      expect.objectContaining({
        kind: "investor",
        title: "Hold the call",
        href: `/data/investors/${id("fund5.example")}`,
      }),
    );
    const dnp = await stack.ask("POST", path, { stage: "do_not_pitch", by: WALKER });
    expect(dnp.status).toBe(200);
    expect(await investor("fund5.example")).toMatchObject({
      stage: "do_not_pitch",
      next_step: "",
      next_step_on: null,
    });
    const readouts = (await stack.ask("GET", "/data/investors")).json!.readouts as Body;
    expect(readouts.meetings).toBe(1);
  });

  it("keeps notes and one-field changes, each on the activity", async () => {
    const path = `/data/investors/${id("fund4.example")}`;
    expect(
      (await stack.ask("POST", `${path}/notes`, { text: "Met at a dinner.", by: WALKER })).status,
    ).toBe(200);
    expect(
      (
        await stack.ask("POST", `${path}/update`, {
          field: "owner",
          value: "Walk Owner",
          by: WALKER,
        })
      ).status,
    ).toBe(200);
    const secret = await stack.ask("POST", `${path}/notes`, {
      text: "key xkeysib-abc",
      by: WALKER,
    });
    expect(codeOf(secret)).toBe("secret");
    const detail = (await stack.ask("GET", path)).json!;
    expect((detail.investor as Body).owner).toBe("Walk Owner");
    const kinds = (detail.events as { kind: string }[]).map((event) => event.kind);
    expect(kinds).toContain("note");
    expect(kinds).toContain("update");
  });
});

describe("amounts", () => {
  it("sum per currency from each firm's newest amount, never across (I3)", async () => {
    const amounts = async (key: string, body: Body) => {
      const answer = await stack.ask("POST", `/data/investors/${id(key)}/amounts`, {
        by: WALKER,
        on: today(),
        instrument: "SAFE",
        ...body,
      });
      expect(answer.status).toBe(200);
    };
    await amounts("fund1.example", { state: "soft", amount: "50,000", currency: "USD" });
    await amounts("seedhouse.example", { state: "soft", amount: "2500000", currency: "INR" });
    await amounts("fund4.example", { state: "signed", amount: 100000, currency: "USD" });
    await amounts("fund4.example", { state: "money_in", amount: 100000, currency: "USD" });
    await amounts("fund3.example", { state: "asked", amount: 25000, currency: "USD" });
    const page = (await stack.ask("GET", "/data/investors")).json!;
    expect(page.money).toEqual({
      USD: { soft: 50000, signed_and_in: 100000 },
      INR: { soft: 2500000, signed_and_in: 0 },
    });
    expect((page.readouts as Body).soft_firms).toBe(2);
    expect((page.readouts as Body).signed_firms).toBe(1);
    const bad = await stack.ask("POST", `/data/investors/${id("fund1.example")}/amounts`, {
      state: "soft",
      amount: "fifty",
      currency: "USD",
      by: WALKER,
    });
    expect(bad.status).toBe(400);
    const euro = await stack.ask("POST", `/data/investors/${id("fund1.example")}/amounts`, {
      state: "soft",
      amount: 10,
      currency: "EUR",
      by: WALKER,
    });
    expect(euro.status).toBe(400);
  });

  it("the sum, worked by hand", () => {
    const at = "2026-11-10T00:00:00.000Z";
    const by = WALKER;
    const amount = (
      state: "asked" | "soft" | "signed" | "money_in",
      value: number,
      currency: "USD" | "INR",
      on: string,
    ) => ({
      amount_id: `${state}-${value}`,
      state,
      amount: value,
      currency,
      instrument: "SAFE",
      on,
      by,
      at,
    });
    expect(
      moneyOf([
        {
          amounts: [
            amount("soft", 10, "USD", "2026-11-01"),
            amount("signed", 10, "USD", "2026-11-05"),
          ],
        },
        { amounts: [amount("soft", 7, "INR", "2026-11-02")] },
        { amounts: [amount("asked", 99, "USD", "2026-11-02")] },
        { amounts: [] },
      ]),
    ).toEqual({ USD: { soft: 0, signed_and_in: 10 }, INR: { soft: 7, signed_and_in: 0 } });
    expect(amountValue("25,00,000")).toBe(2_500_000);
    expect(amountValue("-5")).toBeNull();
    expect(amountValue("0")).toBeNull();
  });
});

describe("choosing again and the download", () => {
  it("keeps every firm with something recorded, and drops an untouched one no longer listed", async () => {
    const small = stack.engine.importList({
      name: "Walk investors, short",
      file_name: "walk-investors-short.csv",
      text: `${INVESTOR_CSV.split("\n").slice(0, 3).join("\n")}\n`,
    }).list.id;
    await stack.ask("GET", "/data/investors/setup");
    const chosen = await stack.ask("POST", "/data/investors/setup", {
      list_ids: [small],
      by: WALKER,
    });
    expect(chosen.status).toBe(200);
    const keys = new Set(
      ((await stack.ask("GET", "/data/investors")).json!.investors as Body[]).map(
        (row) => row.investor_id,
      ),
    );
    expect(keys.has(id("fund1.example"))).toBe(true);
    expect(keys.has(id("fund2.example"))).toBe(true); // a reply was recorded
    expect(keys.has(id("mail:angel.two@inbox.example"))).toBe(false);
    expect((await investor("fund2.example")).list_ids).toEqual([]);
    const back = await stack.ask("POST", "/data/investors/setup", {
      list_ids: [investorListId],
      by: WALKER,
    });
    expect(back.json!.firms).toBe(9);
    // A firm dropped untouched comes back with its activity started afresh.
    const angel = (await stack.ask("GET", `/data/investors/${id("mail:angel.two@inbox.example")}`))
      .json!.events as { kind: string }[];
    expect(angel.map((event) => event.kind)).toEqual(["seeded"]);
    expect((await investor("fund2.example")).stage).toBe("passed");
  });

  it("downloads the firms as a CSV with no addresses", async () => {
    const made = await stack.ask("POST", "/data/builds", { kind: "investors_csv", by: WALKER });
    const buildId = String((made.json!.build as Body).build_id);
    await until(
      async () =>
        ((await stack.ask("GET", `/data/builds/${buildId}`)).json!.build as Body).state === "ready",
      "the CSV",
    );
    const file = await stack.raw(stack.socket, "GET", `/data/builds/${buildId}/bytes`);
    const text = file.bytes.toString("utf8");
    expect(text.startsWith("﻿firm,domain,stage,since,contact")).toBe(true);
    expect(text).not.toContain("@");
    expect(text.split("\n").filter(Boolean)).toHaveLength(10);
  });
});

describe("grouping, worked by hand", () => {
  it("takes the firm's name from the Company column and the columns as the list heads them", () => {
    const list: SenderList = {
      id: "l1",
      name: "Hand",
      file_name: "hand.csv",
      created_at: "2026-11-10T00:00:00.000Z",
      hand: false,
      columns: [
        { key: "email", label: "Email" },
        { key: "first_name", label: "First Name" },
        { key: "company", label: "Company" },
        { key: "tier", label: "Tier" },
        { key: "email_kind", label: "Email Kind" },
      ],
      rows: [
        {
          id: "r1",
          email: "A@One.example",
          name: "A One",
          values: { email: "a@one.example", first_name: "A", company: "", tier: "2" },
        },
        {
          id: "r2",
          email: "b@one.example",
          name: "B One",
          values: { email: "b@one.example", first_name: "B", company: "One Capital", tier: "" },
        },
        {
          id: "r3",
          email: "c@inbox.example",
          name: "C",
          values: {
            email: "c@inbox.example",
            first_name: "C",
            tier: "3",
            email_kind: "personal-domain",
          },
        },
      ],
    };
    const firms = groupLists([list]);
    expect([...firms.keys()]).toEqual(["one.example", "mail:c@inbox.example"]);
    expect(firms.get("one.example")).toMatchObject({
      firm: "One Capital",
      list_values: { Tier: "2", Company: "One Capital" },
    });
    expect(firms.get("one.example")!.people.map((person) => person.email)).toEqual([
      "a@one.example",
      "b@one.example",
    ]);
    expect(firms.get("mail:c@inbox.example")!.firm).toBe("C");
  });
});
