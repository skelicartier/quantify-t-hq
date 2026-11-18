// @vitest-environment node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { WALK_KEY, WalkProvider, resetWalkEvents } from "../../scripts/mail-merge/e2e-provider";
import type { MergeEngine } from "../../scripts/mail-merge/engine";
import type {
  AddressDelivery,
  DeliveryFeedState,
  MailingDelivery,
} from "@/lib/merge/delivery-contracts";
import { startStack, until, type Stack } from "./helpers";

/**
 * Data's read of the sender's delivery files (delivery spec §6.11), on the real stack: the
 * engine reads the stand-in provider and writes `delivery/`; the worker's `delivery`
 * module reads those files and nothing else, and answers what the engine answers.
 */

type Feed = { state: DeliveryFeedState; mailings: MailingDelivery[]; for: AddressDelivery[] };

const person = (n: number) => `partner${n}@fund${n}.example`;
const DELIVERY = { pageGapMs: 0, minGapMs: 0 };

async function feed(stack: Stack, email = ""): Promise<Feed> {
  const answer = await stack.ask("GET", `/data/_test/delivery?email=${encodeURIComponent(email)}`);
  expect(answer.status).toBe(200);
  return answer.json as unknown as Feed;
}

async function setUp(engine: MergeEngine): Promise<void> {
  engine.saveSettings({
    from_email: "founder@walk.example",
    from_name: "Walk Founder",
    reply_to: "founder@walk.example",
    footer: "",
    per_minute: 60,
    daily_cap: 5_000,
  });
  await engine.setKey({ key: WALK_KEY });
}

/** A live mailing to fund `from`..`to`, sent in full. */
async function send(engine: MergeEngine, name: string, from: number, to: number): Promise<string> {
  const rows = ["Email,First Name,Company"];
  for (let n = from; n <= to; n += 1) rows.push(`${person(n)},Asha${n},Walk Fund ${n}`);
  const list = engine.importList({
    name: `${name} list`,
    file_name: "walk.csv",
    text: `${rows.join("\n")}\n`,
  }).list.id;
  const id = engine.createMailing({ name }).mailing.id;
  engine.updateMailing(id, {
    subject: "A note for {{company}}",
    body: "Hi {{first_name}},\n\nA short note, in the words of a person.",
    list_ids: [list],
  });
  await engine.testMailing(id, { to: "founder@walk.example" });
  engine.startMailing(id, { practice: false, confirm: to - from + 1 });
  while ((await engine.step()) !== "finished");
  return id;
}

describe("the delivery feed", () => {
  let stack: Stack;
  let first: string;

  beforeAll(async () => {
    resetWalkEvents();
    stack = await startStack({
      liveProvider: (key) => new WalkProvider(key, () => undefined),
      engine: { delivery: DELIVERY },
    });
  }, 90_000);
  afterAll(async () => {
    await stack.stop();
    resetWalkEvents();
  });

  it("is there, and empty, before there is a delivery folder at all", async () => {
    expect(existsSync(join(stack.dir, "delivery"))).toBe(false);
    expect(await feed(stack, person(1))).toEqual({
      ok: true,
      state: { last_read_at: null, outcome: null, detail: "", auto_stop_from: null, waiting: 0 },
      mailings: [],
      for: [],
    });
    expect(
      (
        ((await stack.ask("GET", "/data/status")).json?.data as { modules: unknown }).modules as {
          name: string;
          state: string;
        }[]
      )
        .filter((module) => module.name === "delivery")
        .map((module) => module.state),
    ).toEqual(["ready"]);
  });

  it("counts a mailing as the engine counts it, once the engine has read it back", async () => {
    await setUp(stack.engine);
    first = await send(stack.engine, "Walk live 01", 1, 60);
    const read = await stack.engine.readDelivery("now");
    expect(read.outcome).toBe("ok");
    const engineSide = stack.engine.mailingDelivery(first, {});
    let seen: Feed = await feed(stack);
    await until(
      async () => {
        seen = await feed(stack, person(36));
        return seen.mailings.length === 1 && seen.state.last_read_at !== null;
      },
      "the feed to see the first read",
      6_000,
      100,
    );
    expect(seen.mailings[0]).toEqual(engineSide.delivery);
    expect(seen.mailings[0]!.counts).toMatchObject({
      accepted: 60,
      delivered: 54,
      hard_bounce: 1,
      soft_bounce: 2,
      complaint: 1,
      unsubscribed: 1,
      retry: 3,
    });
    expect(seen.state).toMatchObject({ outcome: "ok", detail: "", waiting: 0 });
    expect(seen.state.auto_stop_from).toBe(stack.engine.deliveryOverview().read.auto_stop_from);
    expect(seen.state.last_read_at).toBe(stack.engine.deliveryOverview().read.last_read_at);
    expect(seen.for).toHaveLength(1);
    expect(seen.for[0]).toMatchObject({
      mailing_id: first,
      mailing: "Walk live 01",
      standing: {
        delivery: "hard_bounce",
        shown: "hard_bounce",
        reason: "550 5.1.1 <[address]>: user unknown",
        reaction: null,
      },
    });
    // An address in any case, with spaces around it, is the same address.
    expect((await feed(stack, `  ${person(41).toUpperCase()} `)).for[0]).toMatchObject({
      standing: { delivery: "delivered", reaction: "complaint", shown: "complaint" },
    });
    expect((await feed(stack, "nobody@nowhere.example")).for).toEqual([]);
    expect((await feed(stack, "not an address")).for).toEqual([]);
  });

  it("sees a later read that changes the files within three seconds", async () => {
    const second = await send(stack.engine, "Walk live 02", 61, 80);
    await stack.engine.readDelivery("now");
    const began = Date.now();
    let seen: Feed = await feed(stack);
    await until(
      async () => {
        seen = await feed(stack, person(72));
        return seen.mailings.length === 2;
      },
      "the feed to see the second mailing",
      3_000,
      100,
    );
    expect(Date.now() - began).toBeLessThan(3_000);
    // Newest first send first.
    expect(seen.mailings.map((mailing) => mailing.mailing_id)).toEqual([second, first]);
    expect(seen.mailings[0]!.counts).toEqual(
      stack.engine.mailingDelivery(second, {}).delivery!.counts,
    );
    expect(seen.for.map((row) => row.standing.shown)).toEqual(["hard_bounce"]);
  });

  it("keeps the last good reading of a file that stops parsing, and never writes to the folder", async () => {
    const path = join(stack.dir, "delivery/mailings", `${first}.json`);
    const good = readFileSync(path, "utf8");
    const before = (await feed(stack)).mailings.find((mailing) => mailing.mailing_id === first)!;
    writeFileSync(path, `${good.slice(0, 200)} and then nothing a reader can use`);
    await new Promise((resolve) => setTimeout(resolve, 2_300));
    const after = await feed(stack, person(36));
    expect(after.mailings.find((mailing) => mailing.mailing_id === first)).toEqual(before);
    expect(after.for[0]).toMatchObject({ mailing_id: first, standing: { shown: "hard_bounce" } });
    expect(readFileSync(path, "utf8")).toContain("and then nothing a reader can use");
    writeFileSync(path, good);
    await new Promise((resolve) => setTimeout(resolve, 2_300));
    expect((await feed(stack)).mailings.find((mailing) => mailing.mailing_id === first)).toEqual(
      before,
    );
  }, 15_000);
});

describe("the delivery feed, for what waits for his press", () => {
  let stack: Stack;

  beforeAll(async () => {
    resetWalkEvents();
    stack = await startStack({
      liveProvider: (key) => new WalkProvider(key, () => undefined),
      engine: { delivery: { ...DELIVERY, stopFrom: "2099-01-01T00:00:00.000Z" } },
    });
  }, 90_000);
  afterAll(async () => {
    await stack.stop();
    resetWalkEvents();
  });

  it("counts the addresses that wait, and leaves out the ones stopped since", async () => {
    await setUp(stack.engine);
    await send(stack.engine, "Walk live 01", 1, 60);
    await stack.engine.readDelivery("now");
    expect(stack.engine.stops({}).total).toBe(0);
    // Fund 36 (hard bounce), 41 (complaint), 43 (unsubscribed) and 59 (cannot take mail).
    await until(async () => (await feed(stack)).state.waiting === 4, "four to wait", 6_000, 100);
    expect((await feed(stack)).state.auto_stop_from).toBe("2099-01-01T00:00:00.000Z");
    stack.engine.addStops({ emails: person(36), reason: "manual" });
    await until(async () => (await feed(stack)).state.waiting === 3, "three to wait", 12_000, 200);
    expect(stack.engine.applyDeliveryBacklog({ count: 3 })).toEqual({ added: 3, already: 1 });
    await until(async () => (await feed(stack)).state.waiting === 0, "none to wait", 12_000, 200);
  }, 40_000);
});
