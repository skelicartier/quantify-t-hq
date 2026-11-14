// @vitest-environment node
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import { peopleCsv } from "./leads-kit";
import { WALKER, codeOf, startStack, until, type Stack } from "./helpers";

/**
 * The calendar feed (raise spec §7.3, §7.4) on the real stack: the link is made once and
 * only its SHA-256 is kept (never in the replay file), the feed answers only to its token,
 * a new link ends the old one and "off" ends both, the 400-day window, the three sources
 * U3 gives (Key dates, the waitlist, follow-ups) and stand-ins for the others, and the
 * count of reads. Every person and firm is invented, on `.example`.
 */

let stack: Stack;
const today = () => localDay(new Date());
type Body = Record<string, unknown>;

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const feedFile = (): { format: number; feed: Body } =>
  JSON.parse(readFileSync(join(stack.dir, "data", "calendar", "feed.json"), "utf8"));
const attemptsText = () => readFileSync(join(stack.dir, "data", "attempts.jsonl"), "utf8");

const read = (token: string) => stack.ask("POST", "/data/calendar/feed", { token });
const keys = (body: Body) => ((body.items as Body[]) ?? []).map((item) => String(item.key));

beforeAll(async () => {
  // U3's modules alone (raise spec §3.2): the merged copy's files and notes give the
  // `agenda:files` and `agenda:notes` this file proves absent, so they are left out here.
  // raise-merged.test.ts checks the real sources together.
  stack = await startStack({
    modules: ["leads", "replies", "waitlist", "investors", "dates", "calendar"],
  });
  stack.engine.importList({
    name: "Walk 01",
    file_name: "walk-01.csv",
    text: peopleCsv([
      { email: "asha@peak.example", first: "Asha", company: "Peak Capital" },
      { email: "ben@nine.example", first: "Ben", company: "Nine Ventures" },
    ]),
  });
  await until(async () => {
    const page = (await stack.ask("GET", "/data/leads")).json!;
    return page.total === 2 && page.reading === false;
  }, "the list to be read");
}, 60_000);
afterAll(() => stack.stop());

describe("the link", () => {
  it("starts with no link, and every source U3 gives is here", async () => {
    const page = (await stack.ask("GET", "/data/calendar")).json!;
    expect(page.feed).toEqual({
      on: false,
      made_at: null,
      made_by: null,
      detail: "full",
      last_read_at: null,
      reads: 0,
    });
    const sources = page.sources as { name: string; here: boolean }[];
    // The company batch's four (Step 0) are named too, and are not loaded in this stack.
    expect(sources.map((source) => source.name)).toEqual([
      "dates",
      "investors",
      "waitlist",
      "replies",
      "files",
      "notes",
      "meetings",
      "agreements",
      "pilots",
      "diligence",
    ]);
    for (const name of ["dates", "waitlist", "replies"])
      expect(sources.find((source) => source.name === name)?.here).toBe(true);
    expect(sources.find((source) => source.name === "notes")?.here).toBe(false);
    expect(codeOf(await read("A".repeat(43)))).toBe("not_found");
  });

  it("is made once: the answer carries the token, the file keeps only its SHA-256", async () => {
    const made = await stack.ask("POST", "/data/calendar/link", { by: WALKER });
    expect(made.status).toBe(200);
    const token = String(made.json!.token);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(made.json!.feed).toMatchObject({ on: true, made_by: WALKER, reads: 0 });
    const stored = feedFile();
    expect(stored.format).toBe(1);
    expect(stored.feed.token_sha256).toBe(sha256(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(attemptsText()).not.toContain(token);
    // The page's own read never shows it either.
    expect(JSON.stringify((await stack.ask("GET", "/data/calendar")).json)).not.toContain(token);
    // A replay key would put the answer in the replay file: it is refused, nothing is made.
    const replayed = await stack.ask("POST", "/data/calendar/link", {
      by: WALKER,
      attempt: randomUUID(),
    });
    expect(replayed.status).toBe(400);
    expect(feedFile().feed.token_sha256).toBe(sha256(token));
    expect(attemptsText()).not.toContain(token);

    const good = await read(token);
    expect(good.status).toBe(200);
    expect(good.json).toMatchObject({ today: today(), detail: "full" });
    const wrong = await read(`${token.slice(0, 42)}${token.endsWith("A") ? "B" : "A"}`);
    expect(wrong.status).toBe(404);
    expect((wrong.json!.error as Body).message).toBe("Not found.");
    expect(codeOf(await read("short"))).toBe("not_found");
    const after = (await stack.ask("GET", "/data/calendar")).json!.feed as Body;
    expect(after.reads).toBe(1);
    expect(String(after.last_read_at)).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // A new link ends the old one at once; off ends both.
    const again = String(
      (await stack.ask("POST", "/data/calendar/link", { by: WALKER })).json!.token,
    );
    expect(again).not.toBe(token);
    expect((await read(token)).status).toBe(404);
    expect((await read(again)).status).toBe(200);
    expect(((await stack.ask("GET", "/data/calendar")).json!.feed as Body).reads).toBe(1);
    const off = await stack.ask("POST", "/data/calendar/off", { by: WALKER });
    expect(off.json!.feed).toMatchObject({ on: false, reads: 0, last_read_at: null });
    expect((await read(again)).status).toBe(404);
    expect(feedFile().feed.token_sha256).toBeNull();
  });

  it("keeps the choice of what the events say, and refuses anything else", async () => {
    const plain = await stack.ask("POST", "/data/calendar/detail", { detail: "plain", by: WALKER });
    expect(plain.json!.feed).toMatchObject({ detail: "plain" });
    expect((await stack.ask("GET", "/data/calendar/items")).json!.detail).toBe("plain");
    const odd = await stack.ask("POST", "/data/calendar/detail", { detail: "names", by: WALKER });
    expect(odd.status).toBe(400);
    await stack.ask("POST", "/data/calendar/detail", { detail: "full", by: WALKER });
  });
});

describe("what goes in", () => {
  it("holds a key date, a waitlist next step and a follow-up, and keeps 400 days", async () => {
    const day = today();
    for (const [title, due_on] of [
      ["Walk filing", addDays(day, 5)],
      ["Walk far filing", addDays(day, 400)],
      ["Walk too far filing", addDays(day, 401)],
      ["Walk past filing", addDays(day, -3)],
    ] as const)
      expect(
        (
          await stack.ask("POST", "/data/dates", {
            title,
            kind: "filing",
            due_on,
            remind_days: 2,
            by: WALKER,
          })
        ).status,
      ).toBe(200);
    // A yes puts Peak Capital on the (real) waitlist with a next step for today; a question
    // leaves a follow-up for today.
    const reply = (email: string, outcome: string) =>
      stack.ask("POST", "/data/replies", {
        email,
        outcome,
        words: "Invented words.",
        subject: "Re: A note",
        received_at: new Date().toISOString(),
        add_if_missing: false,
        by: WALKER,
      });
    expect((await reply("asha@peak.example", "replied_positive")).status).toBe(200);
    expect((await reply("ben@nine.example", "question")).status).toBe(200);

    const items = (await stack.ask("GET", "/data/calendar/items")).json!.items as Body[];
    const titles = items.map((item) => String(item.title));
    expect(titles).toContain("Walk filing");
    expect(titles).toContain("Walk far filing");
    expect(titles).not.toContain("Walk too far filing");
    const past = items.find((item) => item.title === "Walk past filing")!;
    expect(past).toMatchObject({ kind: "key_date", on: addDays(day, -3), remind_days: [2] });
    const filing = items.find((item) => item.title === "Walk filing")!;
    expect(filing).toMatchObject({
      key: expect.stringMatching(/^key_date:/),
      plain: "Walk filing",
      sub: "Filing · The Indian company",
      href: expect.stringMatching(/^\/data\/dates#date-/),
    });
    const waitlist = items.find((item) => item.kind === "waitlist")!;
    expect(waitlist).toMatchObject({
      plain: "Waitlist next step",
      on: day,
      remind_days: [0],
      href: expect.stringMatching(/^\/data\/waitlist\//),
    });
    expect(String(waitlist.title)).toMatch(/ · Peak Capital$/);
    const follow = items.find((item) => item.kind === "follow_up")!;
    expect(follow).toMatchObject({
      title: "Answer Ben Rao's question",
      plain: "Follow-up",
      sub: "Ben Rao · Nine Ventures",
      on: day,
      remind_days: [0],
    });
    // By day, then title.
    const days = items.map((item) => String(item.on));
    expect([...days].sort()).toEqual(days);
    const page = (await stack.ask("GET", "/data/calendar")).json!;
    expect(page.items).toBe(items.length);
    expect((page.sources as Body[]).find((source) => source.name === "dates")).toMatchObject({
      here: true,
      items: 3,
    });
  });

  it("takes stand-ins only where no source is, and leaves out one that fails", async () => {
    const day = today();
    const note = {
      key: "action:walk-note:1",
      kind: "action",
      title: "Send the pilot summary · Walk Stand-in Fund",
      plain: "Action from a note",
      sub: "Walk Stand-in Fund",
      on: addDays(day, 2),
      remind_days: [0],
      href: "/data",
    };
    const installed = await stack.ask("POST", "/data/_test/calendar/source", {
      name: "notes",
      items: [note],
      by: WALKER,
    });
    expect(installed.json).toMatchObject({ installed: true, items: 1 });
    const real = await stack.ask("POST", "/data/_test/calendar/source", {
      name: "dates",
      items: [],
      by: WALKER,
    });
    expect(real.json).toMatchObject({ installed: false, real: true });
    const failing = await stack.ask("POST", "/data/_test/calendar/source", {
      name: "files",
      throws: true,
      by: WALKER,
    });
    expect(failing.json).toMatchObject({ installed: true });
    const items = (await stack.ask("GET", "/data/calendar/items")).json!.items as Body[];
    expect(items).toContainEqual(note);
    const page = (await stack.ask("GET", "/data/calendar")).json!;
    expect((page.sources as Body[]).find((source) => source.name === "files")).toMatchObject({
      here: true,
      items: 0,
    });
    expect(keys((await stack.ask("GET", "/data/calendar/items")).json!)).toContain(note.key);
    await stack.ask("POST", "/data/_test/calendar/source", {
      name: "notes",
      on: false,
      by: WALKER,
    });
    await stack.ask("POST", "/data/_test/calendar/source", {
      name: "files",
      on: false,
      by: WALKER,
    });
    expect(keys((await stack.ask("GET", "/data/calendar/items")).json!)).not.toContain(note.key);
  });
});
