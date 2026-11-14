// @vitest-environment node
import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays } from "../../scripts/data/days";
import { investorIdOf } from "../../scripts/data/investors/types";
import type { FunnelSummary } from "../../scripts/data/raise-contracts";
import { GET as calendarFeedRoute } from "@/app/cal/[token]/route";
import { dataOwedRows } from "@/components/data/home-block";
import { readDataOverview } from "@/lib/data/api/overview";
import { proxy } from "@/proxy";
import { Scripted, readyToSend, sendLive } from "./leads-kit";
import { WALKER, codeOf, startStack, until, type RawAnswer, type Stack } from "./helpers";

/**
 * The raise batch's seams with every module loaded (raise spec §3.4): each unit proved its
 * half against a stand-in; this file proves the halves meet. A note's action reaches Due,
 * Home, the calendar and the search; an introducer contact reaches the investor's picker
 * and the funnel; a pack shared with a firm reaches its data room and the pack's firm
 * picker; Numbers carries the real funnel and the real recipients; the `.ics` served at
 * `/cal/<token>` holds an offer deadline and a file review; and one search answers every
 * kind. Every person, firm and file is invented, on `.example`.
 */

type Body = Record<string, unknown>;

const FUNDRAISING = "10 Fundraising and investors";

const INVESTOR_CSV = [
  "Email,First Name,Last Name,Title,Company,Tier,Email Kind",
  "partner1@fund1.example,Asha,Rao1,Partner,Walk Fund 1,1,named",
  "partner2@fund2.example,Ben,Rao2,Partner,Walk Fund 2,1,named",
  "partner3@fund3.example,Cara,Rao3,Partner,Walk Fund 3,2,named",
  "gp@zephyrine.example,Ira,Vale,General partner,Zephyrine Capital,2,named",
].join("\n");

const FUND1 = investorIdOf("fund1.example");
const FUND2 = investorIdOf("fund2.example");
const FUND3 = investorIdOf("fund3.example");
const ZEPHYRINE = investorIdOf("zephyrine.example");

let stack: Stack;
let today = "";
const provider = new Scripted();

const message = (answer: RawAnswer): string =>
  String(((answer.json?.error ?? {}) as { message?: unknown }).message ?? "");

async function ok(path: string, body: Body = {}): Promise<Body> {
  const answer = await stack.ask("POST", path, { by: WALKER, ...body });
  expect(answer.status, `${path}: ${message(answer)}`).toBe(200);
  return answer.json!;
}

async function get(path: string): Promise<Body> {
  const answer = await stack.ask("GET", path);
  expect(answer.status, `${path}: ${message(answer)}`).toBe(200);
  return answer.json!;
}

const reply = (email: string, outcome: string) =>
  ok("/data/replies", {
    email,
    outcome,
    words: "Invented words.",
    subject: "Re: A note",
    received_at: new Date().toISOString(),
    add_if_missing: false,
  });

const toSoft = (investorId: string) =>
  ok(`/data/investors/${investorId}/stage`, {
    stage: "soft",
    next_step: "Send the papers",
    next_step_on: today,
  });

async function putFile(title: string, name: string): Promise<string> {
  const answer = await ok("/data/_test/files/put", {
    folder_path: [FUNDRAISING],
    title,
    name,
    base64: Buffer.from(`Invented text for ${title}.`).toString("base64"),
  });
  return String((answer.file as Body).file_id);
}

async function search(
  q: string,
): Promise<{ kind: string; hits: { id: string; href: string }[] }[]> {
  return (await get(`/data/search?q=${encodeURIComponent(q)}`)).groups as {
    kind: string;
    hits: { id: string; href: string }[];
  }[];
}

const funnel = async () => (await get("/data/raise/funnel")).funnel as FunnelSummary;

beforeAll(async () => {
  // Every module, as the sender loads them (core.ts MODULES).
  stack = await startStack({ env: true, liveProvider: () => provider });
  today = String((await get("/data/_test/day")).day);
  await readyToSend(stack.engine);
  const list = stack.engine.importList({
    name: "Walk investors",
    file_name: "walk-investors.csv",
    text: `${INVESTOR_CSV}\n`,
  }).list.id;
  await sendLive(stack.engine, list, "Walk investors live");
  await until(async () => {
    const setup = await get("/data/investors/setup");
    return (setup.lists as { id: string }[]).some((item) => item.id === list);
  }, "the investor list to be seen");
  expect((await ok("/data/investors/setup", { list_ids: [list] })).firms).toBe(4);
}, 60_000);
afterAll(() => stack.stop());

describe("the raise, merged (raise spec §3.4)", () => {
  let noteId = "";

  it("1. a note's action due today reaches Due, Home, the calendar and the search", async () => {
    const note = (
      await ok("/data/notes", {
        subject_kind: "investor",
        subject_id: FUND1,
        subject_name: "Typed by hand",
        kind: "meeting",
        held_on: today,
        title: "Quillfeather call",
        body: "Invented: they asked how the pilot is going.",
        people: "Asha Rao1, partner",
        objections: "",
        actions: [{ title: "Send the quillfeather summary", due_on: today, owner: "Walk Owner" }],
        attempt: randomUUID(),
      })
    ).note as { note_id: string; subject_name: string; actions: { action_id: string }[] };
    noteId = note.note_id;
    // The real investors module names the firm, whatever the page sent.
    expect(note.subject_name).toBe("Walk Fund 1");
    const href = `/data/notes/${noteId}`;

    const overview = await readDataOverview();
    const action = overview.due.find((item) => item.kind === "action");
    expect(action).toMatchObject({ due_on: today, href, title: "Send the quillfeather summary" });
    const owed = dataOwedRows(overview).filter((row) => row.kind === "Action");
    expect(owed).toEqual([
      expect.objectContaining({ href, title: "Send the quillfeather summary", urgency: 2 }),
    ]);

    const calendar = await get("/data/calendar");
    expect(
      (calendar.sources as { name: string; here: boolean }[]).find(
        (source) => source.name === "notes",
      ),
    ).toMatchObject({ here: true, items: 1 });
    const items = (await get("/data/calendar/items")).items as Body[];
    expect(items.filter((item) => item.kind === "action")).toEqual([
      expect.objectContaining({ on: today, href, plain: expect.any(String) }),
    ]);

    const groups = await search("quillfeather");
    const notes = groups.find((group) => group.kind === "note");
    expect(notes?.hits.map((hit) => hit.href)).toEqual([href]);
  });

  it("2. an introducer contact reaches the firm's picker, and a Made introduction is warm", async () => {
    const contact = (
      await ok("/data/contacts", {
        name: "Walk Introducer",
        role: "introducer",
        firm: "Walk Angels",
        email: "intro@walkangels.example",
        phone: "",
        notes: "",
        attempt: randomUUID(),
      })
    ).contact as { contact_id: string };
    const detail = await get(`/data/investors/${FUND2}`);
    expect(detail.introducers).toEqual([
      { contact_id: contact.contact_id, name: "Walk Introducer", firm: "Walk Angels" },
    ]);

    const before = await funnel();
    const warmBefore = before.by_intro.find((split) => split.key === "warm")?.firms ?? 0;
    const saved = await ok(`/data/investors/${FUND2}/intro`, {
      status: "made",
      introducer: "Walk Introducer",
      contact_id: contact.contact_id,
      on: "",
    });
    expect((saved.investor as Body).intro).toMatchObject({
      status: "made",
      contact_id: contact.contact_id,
      on: today,
    });
    const after = await funnel();
    expect(after.by_intro.find((split) => split.key === "warm")?.firms).toBe(warmBefore + 1);
    const warm = (await get("/data/investors?intro=warm")).investors as Body[];
    expect(warm.map((row) => [row.investor_id, row.warm])).toEqual([[FUND2, true]]);

    // An unknown contact is refused now that Contacts is here.
    const unknown = await stack.ask("POST", `/data/investors/${FUND2}/intro`, {
      status: "made",
      introducer: "Walk Introducer",
      contact_id: "no-such-contact",
      on: "",
      by: WALKER,
    });
    expect(unknown.status).toBe(404);
  });

  it("3. a pack shared with a firm reaches its data room, and the firm is in the pack's picker", async () => {
    const fileId = await putFile("Walk deck", "walk-deck.txt");
    const packId = String(
      ((await ok("/data/packs", { name: "Walk seed pack" })).pack as Body).pack_id,
    );
    expect(
      (await ok(`/data/packs/${packId}/items`, { file_ids: [fileId], covers: ["deck"] })).added,
    ).toBe(1);

    const pack = await get(`/data/packs/${packId}`);
    const firms = pack.firms as { investor_id: string; firm: string }[];
    expect(firms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ investor_id: FUND1, firm: "Walk Fund 1" }),
      ]),
    );
    expect(firms).toHaveLength(4);

    const shared = await ok(`/data/packs/${packId}/shares`, {
      investor_id: FUND1,
      how: "mailbox",
      to: "partner1@fund1.example",
    });
    expect(shared.share).toMatchObject({ investor_id: FUND1, firm: "Walk Fund 1" });
    const room = (await get(`/data/investors/${FUND1}`)).data_room as Body[];
    // In words, as the firm's page prints it ("{pack} v{version} · shared {day} · {how}").
    expect(room).toEqual([
      {
        pack_id: packId,
        name: "Walk seed pack",
        version: (pack.pack as Body).version,
        shared_on: today,
        how: "Sent the zip from my mailbox",
        files: 1,
      },
    ]);
    // A firm it was not shared with has an empty data room, not none.
    expect((await get(`/data/investors/${FUND2}`)).data_room).toEqual([]);
    // A firm the investors module does not know is refused.
    const unknown = await stack.ask("POST", `/data/packs/${packId}/shares`, {
      investor_id: "f".repeat(32),
      how: "mailbox",
      by: WALKER,
    });
    expect([unknown.status, codeOf(unknown)]).toEqual([404, "not_found"]);
  });

  it("4. Numbers carries the real funnel, and the update's recipients are the real firms' people", async () => {
    // Walk Fund 1: a yes, then Soft commit. Walk Fund 2: Soft commit, nobody replied.
    // Walk Fund 3: Soft commit, then its partner says no (the stage is kept; the no is stopped).
    await reply("partner1@fund1.example", "replied_positive");
    await toSoft(FUND1);
    await toSoft(FUND2);
    await toSoft(FUND3);
    await reply("partner3@fund3.example", "not_interested");

    const real = await funnel();
    const numbers = await get("/data/numbers");
    const stage = (name: string) => real.stages.find((row) => row.stage === name)!;
    expect(numbers.raise).toEqual({
      firms: real.firms,
      written: stage("written").reached,
      replied: stage("replied").reached,
      meeting: stage("meeting").reached,
      met: stage("met").reached,
      soft: stage("soft").now,
      signed: stage("signed").now,
      money_in: stage("money_in").now,
      days_since_first_send: real.days_since_first_send,
      money: real.money,
    });
    expect(stage("soft").now).toBe(3);
    expect(real.firms).toBe(4);

    const period = today.slice(0, 7);
    const recipients = await get(`/data/numbers/updates/${period}/recipients?stages=soft`);
    const byFirm = Object.fromEntries(
      (recipients.firms as { investor_id: string; people: Body[] }[]).map((firm) => [
        firm.investor_id,
        firm.people.map((person) => [person.email, person.replied, person.stopped]),
      ]),
    );
    expect(byFirm).toEqual({
      [FUND1]: [["partner1@fund1.example", true, false]],
      [FUND2]: [["partner2@fund2.example", false, false]],
      [FUND3]: [["partner3@fund3.example", true, true]],
    });
    expect(recipients.people).toBe(2);
    expect(recipients.left_out).toEqual([
      { email: "partner3@fund3.example", why: "On the stop list" },
    ]);
  });

  it("5. an offer deadline and a file review are in the .ics served at /cal/<token>, with no cookie", async () => {
    const deadline = addDays(today, 6);
    const review = addDays(today, 9);
    await ok(`/data/investors/${FUND2}/update`, { field: "offer_deadline", value: deadline });
    const fileId = await putFile("Walk cap table", "walk-cap-table.txt");
    await ok(`/data/files/${fileId}/update`, { review_by: review });
    const token = String((await ok("/data/calendar/link")).token);

    const url = `http://127.0.0.1:3110/cal/${token}`;
    // The route policy lets the feed through without a session…
    expect(proxy(new NextRequest(url)).headers.get("location")).toBeNull();
    // …and the portal's own route serves the calendar text from the real sources.
    const response = await calendarFeedRoute(new NextRequest(url), {
      params: Promise.resolve({ token }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    const text = (await response.text()).replace(/\r\n[ \t]/g, "");
    expect(text).toContain("SUMMARY:Offer deadline: Walk Fund 2");
    expect(text).toContain(`DTSTART;VALUE=DATE:${deadline.replaceAll("-", "")}`);
    expect(text).toContain("SUMMARY:Review Walk cap table");
    expect(text).toContain(`DTSTART;VALUE=DATE:${review.replaceAll("-", "")}`);
    // The note's action and an investor next step are there too.
    expect(text).toContain("SUMMARY:Send the quillfeather summary");
    expect(text).toContain("SUMMARY:Send the papers · Walk Fund 1");
    // A wrong token is nothing at all.
    const wrong = `${token.slice(0, 42)}${token.endsWith("A") ? "B" : "A"}`;
    const refused = await calendarFeedRoute(new NextRequest(`http://127.0.0.1:3110/cal/${wrong}`), {
      params: Promise.resolve({ token: wrong }),
    });
    expect(refused.status).toBe(404);
  });

  it("6. one search answers every kind for words seeded in each", async () => {
    // The lead and the investor are Zephyrine Capital's partner and firm, from the list.
    const fileId = await putFile("Zephyrine terms", "zephyrine-terms.txt");
    const note = (
      await ok("/data/notes", {
        subject_kind: "investor",
        subject_id: ZEPHYRINE,
        subject_name: "Zephyrine Capital",
        kind: "call",
        held_on: today,
        title: "Zephyrine first call",
        body: "",
        people: "",
        objections: "",
        actions: [],
        attempt: randomUUID(),
      })
    ).note as { note_id: string };
    const faq = (
      await ok("/data/faq", {
        question: "Does Zephyrine take board seats?",
        answer: "Invented: not at this stage.",
      })
    ).entry as { faq_id: string };
    const decision = (
      await ok("/data/decisions", {
        title: "Offer Zephyrine the same terms",
        why: "Invented.",
        decided_by: "Walk Owner",
        decided_on: today,
        status: "decided",
        attempt: randomUUID(),
      })
    ).decision as { decision_id: string };
    const contact = (
      await ok("/data/contacts", {
        name: "Zara Zephyrine",
        role: "lawyer",
        firm: "Walk Legal",
        email: "zara@walklegal.example",
        phone: "",
        notes: "",
        attempt: randomUUID(),
      })
    ).contact as { contact_id: string };

    const groups = await search("zephyrine");
    expect(groups.map((group) => group.kind)).toEqual([
      "lead",
      "investor",
      "file",
      "note",
      "faq",
      "decision",
      "contact",
    ]);
    const ids = (kind: string) =>
      groups.find((group) => group.kind === kind)!.hits.map((hit) => hit.id);
    expect(ids("investor")).toEqual([ZEPHYRINE]);
    expect(ids("file")).toEqual([fileId]);
    expect(ids("note")).toEqual([note.note_id]);
    expect(ids("faq")).toEqual([faq.faq_id]);
    expect(ids("decision")).toEqual([decision.decision_id]);
    expect(ids("contact")).toEqual([contact.contact_id]);
    expect(groups.find((group) => group.kind === "lead")!.hits).toHaveLength(1);
    for (const group of groups) for (const hit of group.hits) expect(hit.href).toMatch(/^\/data\//);
    // One kind at a time, too.
    expect((await get("/data/search?q=zephyrine&kind=contact")).groups).toEqual([
      expect.objectContaining({ kind: "contact", count: 1 }),
    ]);
  });
});
