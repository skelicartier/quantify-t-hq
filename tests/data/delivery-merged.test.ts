// @vitest-environment node
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readBatches } from "@/lib/data/api/batches";
import { readLead } from "@/lib/data/api/leads";
import { readDataOverview } from "@/lib/data/api/overview";
import {
  applyMergeDeliveryBacklog,
  makeMergeRetryMailing,
  readMergeDelivery,
  readMergeMailingDelivery,
} from "@/lib/merge/api";
import { dayInWords } from "../../scripts/data/leads/record";
import { leadIdOf } from "../../scripts/data/leads/types";
import { WALK_KEY, WalkProvider, resetWalkEvents } from "../../scripts/mail-merge/e2e-provider";
import type { MergeEngine, StepResult } from "../../scripts/mail-merge/engine";
import type { EventPage, EventQuery, OutgoingMail } from "../../scripts/mail-merge/provider";
import {
  DELIVERY_WORDS,
  NO_COUNTS,
  stopDetailOf,
  warningsOf,
  type AppliedStop,
  type DeliveryCounts,
  type DeliveryStateFile,
  type MailingDeliveryFile,
  type StopKind,
} from "../../src/lib/merge/delivery-contracts";
import { WALKER, codeOf, startStack, until, type RawAnswer, type Stack } from "./helpers";

/**
 * The delivery batch's seams with every module loaded (delivery spec §3.3, §9.1): D1 proved
 * the read-back against its own Data module, D2 proved Batches, the overview block and the
 * leads' consent against a stand-in feed; this file proves the real reader feeds D2's pages.
 * Walk live 01 (fund 1–290, the stand-in provider's mix of §5.6) is read back once, and then:
 * Batches counts it from the real files as the engine does, and the stand-in declines (1);
 * the 11 read-back stops are on Mail merge's stop list and a hard bounce's lead says so (2);
 * the overview's week equals the engine's (3); the leads' delivery filter counts 21 and 1 (4);
 * the backup holds the folder with no address inside a reason (5); a deleted mailing keeps
 * its row (6). Besides those six: the retry draft sends nothing; a read that warns never
 * pauses a mailing that is going out; a read never holds a send up; with no key nothing is
 * read; and what happened before the read-back first ran waits for the one press of "Apply to
 * the stop list". Every person and firm is invented, on `.example` domains.
 */

type Body = Record<string, unknown>;
type StopRow = { email: string; reason: string; detail: string; at: string };

const person = (n: number) => `partner${n}@fund${n}.example`;
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index);

/** §5.6, "Walk live 01": the stand-in provider's mix over fund 1–290. */
const WALK_01: DeliveryCounts = {
  accepted: 290,
  delivered: 268,
  not_yet: 1,
  soft_bounce: 10,
  hard_bounce: 8,
  blocked: 1,
  invalid: 1,
  error: 1,
  didnt_arrive: 21,
  complaint: 1,
  unsubscribed: 1,
  retry: 12,
};
const HARD = [36, 72, 108, 144, 180, 216, 252, 288];
const SOFT = [29, 58, 87, 116, 145, 174, 203, 232, 261, 290];
/** The 11 addresses the read-back stops, with the stop list's reason and the event's kind. */
const STOPPED = new Map<number, { reason: "bounced" | "asked"; kind: StopKind }>([
  ...HARD.map((n) => [n, { reason: "bounced", kind: "hard_bounce" }] as const),
  [59, { reason: "bounced", kind: "invalid" }],
  [41, { reason: "asked", kind: "complaint" }],
  [43, { reason: "asked", kind: "unsubscribed" }],
]);
/** Soft bounces, the blocked one and the one not sent: whom a retry goes to. */
const RETRY = [...SOFT, 53, 61].sort((a, b) => a - b).map(person);

function listCsv(emails: readonly string[]): string {
  const rows = ["Email,First Name,Last Name,Title,Company,Firm Type,City,Country"];
  for (const email of emails) {
    const firm = /@[a-z]+(\d+)\.example$/.exec(email)?.[1] ?? "0";
    rows.push(`${email},Asha${firm},Rao${firm},Partner,Walk Fund ${firm},AIF,Mumbai,India`);
  }
  return `${rows.join("\n")}\n`;
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

function importList(engine: MergeEngine, name: string, emails: readonly string[]): string {
  return engine.importList({ name, file_name: "walk.csv", text: listCsv(emails) }).list.id;
}

/** A live mailing to one list, tested and started; nothing sent yet. */
async function startLive(
  engine: MergeEngine,
  listId: string,
  name: string,
  people: number,
): Promise<string> {
  const id = engine.createMailing({ name }).mailing.id;
  engine.updateMailing(id, {
    subject: "A note for {{company}}",
    body: "Hi {{first_name}},\n\nA short note, in the words of a person.\n\nA Founder",
    list_ids: [listId],
  });
  await engine.testMailing(id, { to: "founder@walk.example" });
  engine.startMailing(id, { practice: false, confirm: people });
  return id;
}

/** Every step until the mailing is done, and what each said. */
async function finish(engine: MergeEngine): Promise<StepResult[]> {
  const said: StepResult[] = [];
  for (let turn = 0; turn < 5_000; turn += 1) {
    const result = await engine.step();
    if (result === "finished") return said;
    said.push(result);
  }
  throw new Error("the mailing did not finish");
}

const stateOf = (engine: MergeEngine, id: string) =>
  engine.mailings().mailings.find((mailing) => mailing.id === id)?.state;

function message(answer: RawAnswer): string {
  return String(((answer.json?.error ?? {}) as { message?: unknown }).message ?? "");
}

function appliedLines(dir: string): AppliedStop[] {
  const path = join(dir, "delivery/applied.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AppliedStop);
}

const stateFile = (dir: string): DeliveryStateFile =>
  JSON.parse(readFileSync(join(dir, "delivery/state.json"), "utf8")) as DeliveryStateFile;

// ------------------------------------------------------------------ Walk live 01, read back for real

describe("Walk live 01, read back by the real reader, with every module loaded (§3.3)", () => {
  let stack: Stack;
  let out = "";
  let today = "";
  let walk01 = "";
  let live01 = "";
  let kept = 0;
  const sent: OutgoingMail[] = [];

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
  const stops = (): StopRow[] => stack.engine.stops({}).stops as StopRow[];

  beforeAll(async () => {
    resetWalkEvents();
    out = mkdtempSync(join(tmpdir(), "hqdm-"));
    // Every module, as the sender loads them (core.ts MODULES): the real `delivery` among them.
    stack = await startStack({
      env: true,
      liveProvider: (key) => new WalkProvider(key, (mail) => sent.push(mail)),
      engine: { delivery: { pageGapMs: 0, minGapMs: 0 } },
    });
    today = String((await get("/data/_test/day")).day);
    await setUp(stack.engine);
    walk01 = importList(stack.engine, "Walk 01", range(1, 290).map(person));
    live01 = await startLive(stack.engine, walk01, "Walk live 01", 290);
    await finish(stack.engine);
    const read = await stack.engine.readDelivery("now");
    expect(read.outcome).toBe("ok");
    kept = read.kept;
    await until(
      async () => {
        const row = ((await get("/data/batches")).funnel as { rows: Body[] }).rows.find(
          (item) => item.mailing_id === live01,
        );
        return row !== undefined && row.delivery !== null;
      },
      "Batches to read Walk live 01's delivery",
      20_000,
      100,
    );
    await until(
      async () => Number(((await get("/data/leads")).book as { written: number }).written) === 290,
      "the 290 sends to reach the leads",
      30_000,
      100,
    );
  }, 180_000);

  afterAll(async () => {
    await stack.stop();
    rmSync(out, { recursive: true, force: true });
    resetWalkEvents();
  });

  it("1. Batches counts Walk live 01 from the real files, as the engine does, and the stand-in declines", async () => {
    // §5.6 by kind: 266 plain deliveries, 8 hard, 10 soft twice (delayed, then bounced), the
    // complaint and the unsubscribe twice (delivered, then the reaction), and four of one.
    expect(kept).toBe(302);
    const modules = (
      (await get("/data/status")).data as { modules: { name: string; state: string }[] }
    ).modules;
    expect(
      modules
        .filter((module) => module.name === "delivery" || module.name === "batches")
        .map((module) => [module.name, module.state]),
    ).toEqual([
      ["delivery", "ready"],
      ["batches", "ready"],
    ]);

    // Through the portal's own clients, so each answer also passes its schema.
    const batches = await readBatches();
    expect(batches.loaded).toEqual({ delivery: true, replies: true, waitlist: true });
    expect(batches.gone).toEqual([]);
    const row = batches.funnel.rows.find((item) => item.mailing_id === live01)!;
    expect(row).toMatchObject({
      name: "Walk live 01",
      lists: ["Walk 01"],
      list_ids: [walk01],
      accepted: 290,
      warning: "danger",
    });
    expect(row.delivery).toEqual(WALK_01);

    const engineSide = await readMergeMailingDelivery(live01);
    expect(engineSide.delivery!.counts).toEqual(WALK_01);
    expect(row.delivery).toEqual(engineSide.delivery!.counts);
    expect(row.read_at).toBe(engineSide.delivery!.read_at);
    expect(row.first_sent_at).toBe(engineSide.delivery!.first_sent_at);
    expect(row.last_sent_at).toBe(engineSide.delivery!.last_sent_at);
    expect(batches.funnel.total.delivery).toEqual(WALK_01);

    // The feed's state is the sender's own: the read, its time and nothing waiting.
    expect(batches.read).toEqual({
      last_read_at: engineSide.read.last_read_at,
      outcome: "ok",
      detail: "",
      auto_stop_from: engineSide.read.auto_stop_from,
      waiting: 0,
    });

    // D2's stand-in route never installs over the real reader, and never takes it away.
    expect(await ok("/data/_test/batches/delivery")).toMatchObject({
      installed: false,
      real: true,
    });
    expect(await ok("/data/_test/batches/delivery", { on: false })).toMatchObject({
      installed: false,
    });
    const after = await readBatches();
    expect(after.loaded.delivery).toBe(true);
    expect(after.funnel.rows.find((item) => item.mailing_id === live01)!.delivery).toEqual(WALK_01);
  });

  it("2. the read-back put the 11 of §5.6 on Mail merge's stop list, and the hard bounce's lead says so", async () => {
    const rows = stops();
    expect(rows).toHaveLength(11);
    const byEmail = new Map(rows.map((row) => [row.email, row]));
    expect(new Set(byEmail.keys())).toEqual(new Set([...STOPPED.keys()].map(person)));
    expect(rows.filter((row) => row.reason === "bounced")).toHaveLength(9);
    expect(rows.filter((row) => row.reason === "asked")).toHaveLength(2);

    const file = JSON.parse(
      readFileSync(join(stack.dir, "delivery/mailings", `${live01}.json`), "utf8"),
    ) as MailingDeliveryFile;
    for (const [n, { reason, kind }] of STOPPED) {
      const stop = byEmail.get(person(n))!;
      expect(stop, person(n)).toMatchObject({ reason, detail: stopDetailOf(kind, "Walk live 01") });
      // Dated when the provider saw it, not when it was read.
      const event = file.recipients
        .find((recipient) => recipient.email === person(n))!
        .events.find((item) => item.kind === kind)!;
      expect(stop.at, person(n)).toBe(event.at);
    }
    expect(byEmail.get(person(36))!.detail).toBe("Hard bounce · Walk live 01");
    expect(byEmail.get(person(41))!.detail).toBe("Marked as spam · Walk live 01");
    // Soft bounces, the delayed, the blocked and the not sent are listed, never stopped.
    for (const n of [...SOFT, 47, 53, 61]) expect(byEmail.has(person(n)), person(n)).toBe(false);
    // Each event acted once, by itself.
    const applied = appliedLines(stack.dir);
    expect(applied).toHaveLength(11);
    expect(applied.every((line) => line.how === "auto" && line.result === "added")).toBe(true);
    // The sender's own route gives the same list.
    expect((await get("/stops")).total).toBe(11);

    await until(
      async () =>
        (await readLead(leadIdOf(person(36)))).lead.consent.stop_words !== "Not on the stop list",
      "Data to see the stop",
      15_000,
      100,
    );
    const lead36 = (await readLead(leadIdOf(person(36)))).lead;
    expect(lead36.consent).toEqual({
      where: "in",
      opted_out_on: null,
      stop_words: `Bounced on ${dayInWords(today)} (not an opt-out)`,
      said_yes_on: null,
    });
    expect(lead36.stop).toMatchObject({ reason: "bounced", detail: "Hard bounce · Walk live 01" });
    expect(lead36.delivery).toHaveLength(1);
    expect(lead36.delivery[0]).toMatchObject({
      mailing_id: live01,
      mailing: "Walk live 01",
      shown: "hard_bounce",
      reason: "550 5.1.1 <[address]>: user unknown",
    });
    expect(DELIVERY_WORDS[lead36.delivery[0]!.shown].label).toBe("Hard bounce");
    expect(JSON.stringify(lead36.delivery)).not.toContain("@fund36");

    // A complaint is an opt-out, dated; the read-back's delivery of it is "Marked as spam".
    const lead41 = (await readLead(leadIdOf(person(41)))).lead;
    expect(lead41.consent).toMatchObject({
      opted_out_on: today,
      stop_words: `Asked to stop on ${dayInWords(today)}`,
    });
    expect(lead41.delivery[0]).toMatchObject({ shown: "complaint", reason: "" });
  });

  it("3. the overview's 'Delivery, last 7 days' is the engine's week, with the contract's warnings", async () => {
    const engineSide = await readMergeDelivery();
    const overview = await readDataOverview();
    expect(overview.delivery).toBeDefined();
    const block = overview.delivery!;
    expect(block.loaded).toBe(true);
    expect(block.counts).toEqual(engineSide.week.counts);
    expect(block.counts).toEqual(WALK_01);
    expect(block.warnings).toEqual(warningsOf(engineSide.week.counts, "week"));
    expect(block.warnings).toEqual(engineSide.week.warnings);
    expect(block.warnings.map((warning) => [warning.key, warning.level])).toEqual([
      ["complaints", "danger"],
      ["hard_bounces", "attention"],
    ]);
    expect(block.warnings[0]!.body).toContain(
      "1 spam complaint from 268 delivered in the last 7 days: 0.37 per cent.",
    );
    expect(block.warnings[1]!.body).toContain(
      "8 of 290 accepted bounced hard in the last 7 days: 2.8 per cent.",
    );
    expect(block.read_at).toBe(engineSide.read.last_read_at);
    expect(block.waiting).toBe(0);
    expect(engineSide.backlog).toMatchObject({ total: 0, would_add: 0 });
    // The week starts 7 × 24 hours before now on both sides (the two answers are moments apart).
    expect(Math.abs(Date.parse(block.since) - Date.parse(engineSide.week.since))).toBeLessThan(
      60_000,
    );
    expect(JSON.stringify([block, engineSide.week])).not.toContain("%");
  });

  it("4. All leads' delivery filter counts the batch's 21 that did not arrive and the 1 not yet", async () => {
    type LeadsPage = { total: number; facets: Record<string, { value: string; count: number }[]> };
    const leads = async (query: string) => (await get(`/data/leads?${query}`)) as LeadsPage;
    expect((await leads(`delivery=didnt_arrive&batch=${walk01}`)).total).toBe(21);
    expect((await leads("delivery=not_yet")).total).toBe(1);
    expect((await leads(`delivery=not_yet&batch=${walk01}`)).total).toBe(1);
    expect((await leads(`delivery=delivered&batch=${walk01}`)).total).toBe(268);
    const all = await leads(`batch=${walk01}`);
    expect(all.total).toBe(290);
    expect(
      Object.fromEntries(all.facets.delivery!.map((entry) => [entry.value, entry.count])),
    ).toEqual({ delivered: 268, didnt_arrive: 21, not_yet: 1 });
  });

  it("5. the backup holds the read-back's folder, and no address inside a provider's reason", async () => {
    const made = await ok("/data/builds", { kind: "backup" });
    const buildId = String((made.build as Body).build_id);
    let build: Body = {};
    await until(
      async () => {
        build = (await get(`/data/builds/${buildId}`)).build as Body;
        return build.state !== "building";
      },
      "the backup",
      60_000,
      200,
    );
    expect(build.state).toBe("ready");
    const bytes = await stack.raw(stack.socket, "GET", `/data/builds/${buildId}/bytes`);
    const path = join(out, `${buildId}.zip`);
    writeFileSync(path, bytes.bytes);
    execFileSync("unzip", ["-tq", path]);
    const names = execFileSync("unzip", ["-Z1", path], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    expect(names).toContain("mail-merge/delivery/state.json");
    expect(names).toContain("mail-merge/delivery/applied.jsonl");
    expect(names.filter((name) => name.startsWith("mail-merge/delivery/mailings/"))).toEqual([
      `mail-merge/delivery/mailings/${live01}.json`,
    ]);
    const entry = (name: string) => execFileSync("unzip", ["-p", path, name]).toString("utf8");
    const copied = JSON.parse(
      entry(`mail-merge/delivery/mailings/${live01}.json`),
    ) as MailingDeliveryFile;
    const reasons = copied.recipients.flatMap((recipient) =>
      recipient.events.map((event) => event.reason),
    );
    expect(
      reasons.filter((reason) => reason === "550 5.1.1 <[address]>: user unknown"),
    ).toHaveLength(8);
    expect(reasons.some((reason) => reason.includes("@"))).toBe(false);
    for (const name of names) {
      const text = entry(name);
      expect(text, name).not.toMatch(/user unknown[^"]*@|5\.1\.1 <[^[]/);
      expect(text.includes(WALK_KEY), name).toBe(false);
    }
    expect(names.some((name) => /provider\.key|provider-status\.json/.test(name))).toBe(false);
  }, 90_000);

  it("makes a retry mailing as a draft only, for the 12 the read-back says may arrive, and sends nothing", async () => {
    const before = sent.length;
    const page = await readMergeMailingDelivery(live01, { view: "retry" });
    expect(page.retry).toEqual({ count: 12, on_stop_list: 0 });
    expect(page.rows.map((row) => row.email)).toEqual(RETRY);

    const made = await makeMergeRetryMailing(live01);
    expect(made).toMatchObject({ picked: 12, not_on_lists: 0 });
    expect(made.mailing).toMatchObject({
      name: "Walk live 01 (retry)",
      state: "draft",
      mode: null,
      started_at: null,
    });
    const detail = stack.engine.mailingDetail(made.mailing.id, {});
    expect(detail.mailing).toMatchObject({
      list_ids: [walk01],
      pick_only: true,
      picked_count: 12,
      skip_written: false,
    });
    const picked = stack.engine
      .people(made.mailing.id, { view: "picked" })
      .rows.map((row) => row.email)
      .sort((a, b) => Number(/\d+/.exec(a)![0]) - Number(/\d+/.exec(b)![0]));
    expect(picked).toEqual(RETRY);
    // Nobody on the stop list is picked, nothing went, nothing started.
    for (const n of STOPPED.keys()) expect(picked).not.toContain(person(n));
    expect(sent).toHaveLength(before);
    expect(await stack.engine.step()).toBe("idle");
    expect(stateOf(stack.engine, live01)).toBe("finished");
    // A draft is not a batch: Batches still has the one mailing sent for real.
    expect((await readBatches()).funnel.rows.map((row) => row.name)).toEqual(["Walk live 01"]);
  });

  it("never pauses a mailing that is going out when a read finds complaints and hard bounces", async () => {
    // Five who complain and five whose addresses bounce hard, alternating.
    const people = range(1, 5).flatMap((n) => [
      `complaint${n}@walkc${n}.example`,
      `hardbounce${n}@walkh${n}.example`,
    ]);
    const list = importList(stack.engine, "Walk 02", people);
    const id = await startLive(stack.engine, list, "Walk live 02", 10);
    for (let turn = 0; turn < 4; turn += 1) expect(await stack.engine.step()).toBe("sent");
    expect(stateOf(stack.engine, id)).toBe("sending");

    const read = await stack.engine.readDelivery("now");
    expect(read.outcome).toBe("ok");
    // The read warns, at the danger level on both counts, and pauses nothing.
    const page = await readMergeMailingDelivery(id);
    expect(page.delivery!.counts).toMatchObject({ accepted: 4, complaint: 2, hard_bounce: 2 });
    expect(page.warnings.map((warning) => [warning.key, warning.level])).toEqual([
      ["complaints", "danger"],
      ["hard_bounces", "danger"],
    ]);
    for (const warning of page.warnings)
      expect(warning.body).toContain("Nothing has been paused: you decide.");
    expect(page.mailing.state).toBe("sending");
    // Over the week (Walk live 01 as well): 3 of 270 complained, 10 of 294 bounced hard.
    const week = await readMergeDelivery();
    expect(week.week.warnings.map((warning) => [warning.key, warning.level])).toEqual([
      ["complaints", "danger"],
      ["hard_bounces", "attention"],
    ]);
    await readDataOverview();
    await readBatches();
    expect(stateOf(stack.engine, id)).toBe("sending");
    expect(stack.engine.mailings().mailings.find((mailing) => mailing.id === id)).toMatchObject({
      state: "sending",
      pause_reason: null,
    });
    // The four it stopped had already gone; the other six go as before.
    expect(stops()).toHaveLength(15);
    const said = await finish(stack.engine);
    expect(said).not.toContain("paused");
    expect(said.filter((result) => result === "sent")).toHaveLength(6);
    expect(stateOf(stack.engine, id)).toBe("finished");
    const written = sent.filter((mail) => people.includes(mail.to_email));
    expect(written).toHaveLength(10);
  });

  it("6. a mailing deleted in Mail merge keeps its row on Waitlist › Batches, named as it was", async () => {
    const deleted = await stack.ask("POST", `/mailings/${live01}/delete`, {});
    expect(deleted.status, message(deleted)).toBe(200);
    await until(
      async () => (await readBatches()).gone.includes(live01),
      "Data to see the mailing is gone",
      15_000,
      100,
    );
    const row = (await readBatches()).funnel.rows.find((item) => item.mailing_id === live01)!;
    expect(row).toMatchObject({ name: "Walk live 01", lists: [], list_ids: [], accepted: 290 });
    expect(row.delivery).toEqual(WALK_01);
  });
});

// ------------------------------------------------------------------ before the first run, and no key

/** The stand-in provider, with its delivery events counted and, when asked, held back. */
let asked = 0;
let made = 0;
let gate: Promise<void> | null = null;
class HeldBack extends WalkProvider {
  override async listEvents(query: EventQuery): Promise<EventPage> {
    asked += 1;
    if (gate) await gate;
    return super.listEvents(query);
  }
}

describe("no key reads nothing; a read never holds a send up; the past waits for one press", () => {
  const FROM = "2099-01-01T00:00:00.000Z";
  let stack: Stack;
  let today = "";
  let mailing = "";
  const sent: OutgoingMail[] = [];

  async function get(path: string): Promise<Body> {
    const answer = await stack.ask("GET", path);
    expect(answer.status, `${path}: ${message(answer)}`).toBe(200);
    return answer.json!;
  }
  const waiting = async () => (await readDataOverview()).delivery!.waiting;

  beforeAll(async () => {
    resetWalkEvents();
    stack = await startStack({
      env: true,
      liveProvider: (key) => {
        made += 1;
        return new HeldBack(key, (mail) => sent.push(mail));
      },
      // Every event the stand-in makes is before this instant: as on his Mac on the first run.
      engine: { delivery: { pageGapMs: 0, minGapMs: 0, stopFrom: FROM } },
    });
    today = String((await get("/data/_test/day")).day);
  }, 180_000);

  afterAll(async () => {
    await stack.stop();
    resetWalkEvents();
  });

  it("with no key, nothing is read: no provider, no folder, no request, and Data says not read", async () => {
    expect(await stack.engine.readDelivery("now")).toMatchObject({
      outcome: "no_key",
      pages: 0,
      kept: 0,
    });
    const check = await stack.ask("POST", "/delivery/check", { wait: true });
    expect([check.status, codeOf(check)]).toEqual([409, "no_key"]);
    expect(message(check)).toBe("Delivery is read with the provider key. Add it in Setup.");
    // The loop turns and asks nothing; after five turns its sleep never ends, so it stays out
    // of the rest of this file.
    let turns = 0;
    void stack.engine.deliveryLoop(() => {
      turns += 1;
      return turns <= 5
        ? new Promise<void>((resolve) => setTimeout(resolve, 20))
        : new Promise<void>(() => undefined);
    });
    await until(() => turns > 5, "five turns of the delivery loop");
    expect([made, asked]).toEqual([0, 0]);
    expect(existsSync(join(stack.dir, "delivery"))).toBe(false);

    const view = await readMergeDelivery();
    expect(view.read).toMatchObject({
      key_set: false,
      reading: false,
      last_read_at: null,
      next_at: null,
      auto_stop_from: null,
    });
    const overview = await readDataOverview();
    expect(overview.delivery).toEqual({
      loaded: true,
      since: overview.delivery!.since,
      counts: NO_COUNTS,
      warnings: [],
      read_at: null,
      waiting: 0,
    });
    expect((await readBatches()).read).toEqual({
      last_read_at: null,
      outcome: null,
      detail: "",
      auto_stop_from: null,
      waiting: 0,
    });
  });

  it("a read the provider has not answered yet never holds up a mailing that is going out", async () => {
    await setUp(stack.engine);
    expect(stateFile(stack.dir).auto_stop_from).toBe(FROM);
    const old = importList(stack.engine, "Walk 03", range(30, 61).map(person));
    mailing = await startLive(stack.engine, old, "Walk live 03", 32);
    await finish(stack.engine);

    let open: () => void = () => undefined;
    gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const before = asked;
    const reading = stack.engine.readDelivery("now");
    await until(() => asked > before, "the read to ask the provider");
    expect(stack.engine.deliveryOverview().read.reading).toBe(true);

    // While the provider has not answered, a second mailing goes out in full.
    const next = importList(stack.engine, "Walk 04", range(62, 70).map(person));
    const second = await startLive(stack.engine, next, "Walk live 04", 9);
    const said = await finish(stack.engine);
    expect(said.filter((result) => result === "sent")).toHaveLength(9);
    expect(said).not.toContain("paused");
    expect(stateOf(stack.engine, second)).toBe("finished");
    expect(stack.engine.deliveryOverview().read.reading).toBe(true);

    open();
    gate = null;
    expect((await reading).outcome).toBe("ok");
    expect((await stack.engine.readDelivery("now")).outcome).toBe("ok");
  });

  it("puts nothing from before the first run on the stop list until the one press, then everything", async () => {
    // Fund 36 bounced hard, 41 complained, 43 unsubscribed, 59 cannot take mail: all before.
    const WAITING = [36, 41, 43, 59].map(person);
    expect(stack.engine.stops({}).total).toBe(0);
    expect(appliedLines(stack.dir)).toEqual([]);
    const view = await readMergeDelivery();
    expect(view.backlog).toMatchObject({ total: 4, would_add: 4 });
    expect(view.backlog.rows.map((row) => row.email).sort()).toEqual([...WAITING].sort());
    expect(view.backlog.rows.every((row) => row.mailing === "Walk live 03")).toBe(true);

    // Data counts what waits for his say, and the leads are not on the stop list yet.
    await until(async () => (await waiting()) === 4, "Data to count four waiting", 15_000, 100);
    expect((await readBatches()).read).toMatchObject({ auto_stop_from: FROM, waiting: 4 });
    const lead = (await readLead(leadIdOf(person(36)))).lead;
    expect(lead.consent.stop_words).toBe("Not on the stop list");
    expect(lead.delivery[0]).toMatchObject({ mailing: "Walk live 03", shown: "hard_bounce" });

    // The press carries the count it showed; any other is refused and changes nothing.
    const wrong = await stack.ask("POST", "/delivery/apply", { count: 3 });
    expect([wrong.status, codeOf(wrong), message(wrong)]).toEqual([
      409,
      "changed",
      "The list changed since this page was drawn: 4 now. Look again, then press once more.",
    ]);
    const unsaid = await stack.ask("POST", "/delivery/apply", { count: "four" });
    expect([unsaid.status, codeOf(unsaid)]).toEqual([400, "invalid"]);
    expect(stack.engine.stops({}).total).toBe(0);

    expect(await applyMergeDeliveryBacklog(4)).toMatchObject({ added: 4, already: 0 });
    const again = await stack.ask("POST", "/delivery/apply", { count: 4 });
    expect([again.status, codeOf(again)]).toEqual([409, "nothing"]);

    const rows = stack.engine.stops({}).stops as StopRow[];
    expect(rows.map((row) => row.email).sort()).toEqual([...WAITING].sort());
    const detailOf = (email: string) => rows.find((row) => row.email === email)!;
    expect(detailOf(person(36))).toMatchObject({
      reason: "bounced",
      detail: "Hard bounce · Walk live 03",
    });
    expect(detailOf(person(59))).toMatchObject({
      reason: "bounced",
      detail: "Not a working address · Walk live 03",
    });
    expect(detailOf(person(41))).toMatchObject({
      reason: "asked",
      detail: "Marked as spam · Walk live 03",
    });
    expect(detailOf(person(43))).toMatchObject({
      reason: "asked",
      detail: "Unsubscribed · Walk live 03",
    });
    const applied = appliedLines(stack.dir);
    expect(applied.map((line) => [line.how, line.result])).toEqual(
      Array.from({ length: 4 }, () => ["press", "added"]),
    );
    expect(stateFile(stack.dir).backlog_applied_at).not.toBeNull();
    expect(stateFile(stack.dir).auto_stop_from).toBe(FROM);

    await until(async () => (await waiting()) === 0, "Data to count none waiting", 15_000, 100);
    await until(
      async () =>
        (await readLead(leadIdOf(person(36)))).lead.consent.stop_words ===
        `Bounced on ${dayInWords(today)} (not an opt-out)`,
      "the lead to read bounced",
      15_000,
      100,
    );
    expect((await readLead(leadIdOf(person(41)))).lead.consent).toMatchObject({
      opted_out_on: today,
      stop_words: `Asked to stop on ${dayInWords(today)}`,
    });

    // From the press on, an older event a later read finds goes on by itself.
    const late = importList(stack.engine, "Walk 05", [person(72)]);
    const fifth = await startLive(stack.engine, late, "Walk live 05", 1);
    await finish(stack.engine);
    expect((await stack.engine.readDelivery("now")).outcome).toBe("ok");
    expect(stack.engine.stops({}).stops as StopRow[]).toContainEqual(
      expect.objectContaining({
        email: person(72),
        reason: "bounced",
        detail: "Hard bounce · Walk live 05",
      }),
    );
    expect(appliedLines(stack.dir).at(-1)).toMatchObject({
      email: person(72),
      mailing_id: fifth,
      how: "auto",
      result: "added",
    });
    // Nothing in this file paused: every mailing went out in full.
    for (const each of stack.engine.mailings().mailings)
      if (each.mode === "live") expect(each.state, each.name).toBe("finished");
    expect(stateOf(stack.engine, mailing)).toBe("finished");
  });
});
