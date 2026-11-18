// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DeliveryOptions } from "../../scripts/mail-merge/delivery";
import { MergeEngine, Refused, type StepResult } from "../../scripts/mail-merge/engine";
import type {
  AccountCheck,
  Blocked,
  EventPage,
  EventQuery,
  MailProvider,
  OutgoingMail,
  ProviderEvent,
  SendResult,
  SenderCheck,
} from "../../scripts/mail-merge/provider";
import type {
  AppliedStop,
  DeliveryStateFile,
  MailingDeliveryFile,
} from "@/lib/merge/delivery-contracts";

/**
 * The reader (delivery spec §6.4 to §6.8, the cases of §6.13): an engine on a temp folder,
 * a provider whose events come from a script, and a clock the test moves. Nothing here can
 * reach the real provider, and everyone is invented.
 */

const KEY = "xkeysib-test-0000000000000000000000000000000000000000-abcd";
const START = "2026-11-14T06:00:00.000Z";

let dir: string;
let provider: Scripted;
let clock: Date;
let logged: string[];

/** A provider that remembers what it was handed and answers events as the script says. */
class Scripted implements MailProvider {
  readonly kind = "live" as const;
  sent: OutgoingMail[] = [];
  /** address → the id of the last message handed over to it. */
  ids = new Map<string, string>();
  /** Addresses whose answer is lost: the engine records "may have been sent", with no id. */
  lost = new Set<string>();
  events: ProviderEvent[] = [];
  queries: EventQuery[] = [];
  /** Answers to give before the events, one a call. */
  answers: EventPage[] = [];
  /** Answers nothing whenever a tag filter is given, as a filter that hid this mail would. */
  hideWhenTagged = false;
  /** Every call waits for this. */
  gate: Promise<void> | null = null;
  /** From this call number on, a call never answers: the process "died" mid-read. */
  hangFrom = 0;
  #count = 0;

  async send(mail: OutgoingMail): Promise<SendResult> {
    const base = { message_id: "", error_code: "", retry_after_seconds: null };
    if (this.lost.has(mail.to_email)) return { ...base, status: "unknown", error_code: "timeout" };
    this.#count += 1;
    const id = `<MSG-${this.#count}@Relay.test>`;
    this.sent.push(mail);
    this.ids.set(mail.to_email, id);
    return { ...base, status: "sent", message_id: id };
  }

  async checkAccount(): Promise<AccountCheck> {
    return { status: "ok", email: "me@quantify.test", company: "QT", plan: "free", credits: 300 };
  }

  async checkSender(email: string): Promise<SenderCheck> {
    return {
      status: "ok",
      domain: email.split("@")[1] ?? "",
      sender_known: true,
      sender_active: true,
      domain_known: true,
      domain_authenticated: true,
    };
  }

  async listBlocked(): Promise<Blocked[]> {
    return [];
  }

  async listEvents(query: EventQuery): Promise<EventPage> {
    this.queries.push({ ...query });
    if (this.hangFrom > 0 && this.queries.length >= this.hangFrom)
      return new Promise<EventPage>(() => undefined);
    if (this.gate) await this.gate;
    const scripted = this.answers.shift();
    if (scripted) return scripted;
    if (this.hideWhenTagged && query.tags !== null) return { status: "ok", events: [] };
    return {
      status: "ok",
      events: this.events.slice(query.offset, query.offset + query.limit),
    };
  }

  /** An event as the provider would write it, for the last message handed over to `email`. */
  add(email: string, event: string, seconds = 3, extra: Partial<ProviderEvent> = {}): void {
    this.events.push({
      email,
      date: new Date(clock.getTime() + seconds * 1_000).toISOString(),
      message_id: this.ids.get(email) ?? "",
      event,
      reason: "",
      tag: "hq-mail-merge",
      ...extra,
    });
  }
}

function open(delivery: Partial<DeliveryOptions> = {}): MergeEngine {
  return new MergeEngine({
    dir,
    now: () => new Date(clock),
    liveProvider: () => provider,
    delivery: { pageGapMs: 0, ...delivery },
  });
}

function people(count: number, domain = "fund.example"): string {
  return [
    "First Name,Firm,Email",
    ...Array.from(
      { length: count },
      (_, index) => `P${index + 1},Firm ${index + 1},p${index + 1}@${domain}`,
    ),
  ].join("\n");
}

const p = (index: number, domain = "fund.example") => `p${index}@${domain}`;

async function drain(engine: MergeEngine, limit = 1_000): Promise<StepResult[]> {
  const seen: StepResult[] = [];
  for (let index = 0; index < limit; index += 1) {
    const outcome = await engine.step();
    seen.push(outcome);
    if (outcome === "idle" || outcome === "paused" || outcome === "finished") break;
  }
  return seen;
}

async function setUp(engine: MergeEngine): Promise<void> {
  await engine.setKey({ key: KEY });
  engine.saveSettings({
    from_email: "founder@quantify.example",
    from_name: "A Founder",
    reply_to: "founder@quantify.example",
    footer: "If you would rather not hear from me again, reply and say so.",
    daily_cap: 5_000,
  });
  await engine.checkProvider();
}

/** A mailing written, tested and ready to go out for real to a new list of `count` people. */
async function draft(
  engine: MergeEngine,
  name: string,
  count: number,
  domain = "fund.example",
  extra: Record<string, unknown> = {},
): Promise<{ id: string; list: string }> {
  const list = engine.importList({
    name: `${name} list`,
    file_name: "list.csv",
    text: people(count, domain),
  }).list.id;
  const id = engine.createMailing({ name }).mailing.id;
  engine.updateMailing(id, {
    subject: "A note for {{firm}}",
    body: "Hi {{first_name}},\n\nA short note.",
    list_ids: [list],
    ...extra,
  });
  await engine.testMailing(id, { to: "me@quantify.example" });
  return { id, list };
}

/** The same, sent in full. */
async function sendTo(
  engine: MergeEngine,
  name: string,
  count: number,
  domain = "fund.example",
  extra: Record<string, unknown> = {},
): Promise<{ id: string; list: string }> {
  const made = await draft(engine, name, count, domain, extra);
  const sendable = engine.mailingDetail(made.id, {}).audience.sendable;
  engine.startMailing(made.id, { practice: false, confirm: sendable });
  await drain(engine);
  return made;
}

const state = (): DeliveryStateFile =>
  JSON.parse(readFileSync(join(dir, "delivery/state.json"), "utf8")) as DeliveryStateFile;
const fileOf = (id: string): MailingDeliveryFile =>
  JSON.parse(
    readFileSync(join(dir, "delivery/mailings", `${id}.json`), "utf8"),
  ) as MailingDeliveryFile;
const applied = (): AppliedStop[] =>
  existsSync(join(dir, "delivery/applied.jsonl"))
    ? readFileSync(join(dir, "delivery/applied.jsonl"), "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as AppliedStop)
    : [];
const stopsOf = (engine: MergeEngine) =>
  new Map(engine.stops({}).stops.map((stop) => [stop.email, stop]));
const later = (ms: number): void => {
  clock = new Date(clock.getTime() + ms);
};
const at = (seconds: number): string => new Date(clock.getTime() + seconds * 1_000).toISOString();

/** One turn of the delivery loop, as the service runs it; the engine is stopped after. */
async function tick(engine: MergeEngine): Promise<void> {
  await engine.deliveryLoop(async () => {
    engine.stop();
  });
}

async function refusal(act: () => unknown): Promise<Refused> {
  try {
    await act();
  } catch (error) {
    if (error instanceof Refused) return error;
    throw error;
  }
  throw new Error("expected a refusal");
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hq-delivery-"));
  provider = new Scripted();
  clock = new Date(START);
  logged = [];
  vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
    logged.push(parts.map(String).join(" "));
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe("1. the state file", () => {
  it("is made when a key is set, with auto_stop_from the instant of that, and never changed", async () => {
    const engine = open();
    expect(existsSync(join(dir, "delivery"))).toBe(false);
    expect(await engine.readDelivery("now")).toMatchObject({ outcome: "no_key", pages: 0 });
    expect(existsSync(join(dir, "delivery"))).toBe(false);
    await engine.setKey({ key: KEY });
    expect(state()).toEqual({
      format: 1,
      auto_stop_from: START,
      backlog_applied_at: null,
      last_read: null,
      last_recent_at: null,
      last_older_at: null,
      in_progress: null,
      wait_until: null,
      requests: [],
      tags_filter: true,
    });
    expect(statSync(join(dir, "delivery")).mode & 0o777).toBe(0o700);
    expect(statSync(join(dir, "delivery/mailings")).mode & 0o777).toBe(0o700);
    expect(statSync(join(dir, "delivery/state.json")).mode & 0o777).toBe(0o600);
    later(3 * 86_400_000);
    open();
    await open().setKey({ key: KEY });
    expect(state().auto_stop_from).toBe(START);
  });

  it("is made at construction when a key is already there", async () => {
    await open().setKey({ key: KEY });
    rmSync(join(dir, "delivery"), { recursive: true, force: true });
    later(60_000);
    open();
    expect(state().auto_stop_from).toBe("2026-11-14T06:01:00.000Z");
  });

  it("starts again from now when it cannot be read, and keeps the bytes aside", async () => {
    await open().setKey({ key: KEY });
    const file = join(dir, "delivery/state.json");
    rmSync(file);
    const { writeFileSync } = await import("node:fs");
    writeFileSync(file, "{ not json");
    later(120_000);
    open();
    expect(state().auto_stop_from).toBe("2026-11-14T06:02:00.000Z");
    expect(readdirSync(join(dir, "delivery")).some((name) => name.includes(".unreadable-"))).toBe(
      true,
    );
  });
});

describe("2. which events are kept", () => {
  it("matches by message id, then by tag and address; drops everything else unread", async () => {
    const engine = open();
    await setUp(engine);
    provider.lost.add(p(3));
    const { id } = await sendTo(engine, "Intro", 3);
    const gone = await sendTo(engine, "Gone", 2, "other.example");
    const goneId = provider.ids.get(p(1, "other.example"))!;
    engine.deleteMailing(gone.id);
    const tag = id.slice(0, 8);

    // Case and brackets aside, it is the same message.
    provider.add(p(1), "delivered", 1, { message_id: "MSG-2@RELAY.TEST" });
    provider.add(p(1), "requests", 0);
    provider.add(p(1), "opened", 7);
    provider.add(p(1), "loadedByProxy", 8);
    provider.add(p(1), "clicks", 9);
    provider.add(p(1), "someNewEvent", 9);
    provider.add(p(2), "deferred", 2);
    provider.add(p(2), "softBounces", 3, { reason: `452 4.2.2 mailbox full for <${p(2)}>` });
    // The answer was lost, so there is no id to go by: its tag and its address.
    provider.add(p(3), "delivered", 1, { message_id: "", tag: `hq-mail-merge,${tag}` });
    // A test of the wording, other mail on the account, a deleted mailing's send.
    provider.add("me@quantify.example", "delivered", 1, { message_id: "<MSG-1@Relay.test>" });
    provider.add("stranger@elsewhere.example", "hardBounces", 1, {
      message_id: "<999@elsewhere.example>",
      tag: "sign-in",
    });
    provider.add(p(1, "other.example"), "hardBounces", 1, { message_id: goneId });
    // The right id on the wrong address, a date that is not one, a lost-answer tag of another mailing.
    provider.add(p(2), "hardBounces", 4, { email: "someone.else@fund.example" });
    provider.add(p(2), "delivered", 5, { date: "the other day" });
    provider.add(p(3), "hardBounces", 6, { message_id: "", tag: "hq-mail-merge,ffffffff" });

    const read = await engine.readDelivery("now");
    expect(read).toEqual({ outcome: "ok", pages: 1, kept: 4, dropped: 11, detail: "" });

    const file = fileOf(id);
    expect(file).toMatchObject({ format: 1, mailing_id: id, name: "Intro", read_at: START });
    expect(file.recipients.map((recipient) => recipient.email)).toEqual([p(1), p(2), p(3)]);
    expect(file.recipients[0]).toEqual({
      email: p(1),
      message_id: "msg-2@relay.test",
      sent_at: START,
      events: [{ kind: "delivered", at: at(1), reason: "" }],
    });
    expect(file.recipients[1]!.events).toEqual([
      { kind: "deferred", at: at(2), reason: "" },
      { kind: "soft_bounce", at: at(3), reason: "452 4.2.2 mailbox full for <[address]>" },
    ]);
    expect(file.recipients[2]).toMatchObject({
      message_id: "",
      events: [{ kind: "delivered", at: at(1), reason: "" }],
    });
    // Nothing of the deleted mailing, the test or the stranger was written anywhere.
    expect(readdirSync(join(dir, "delivery/mailings"))).toEqual([`${id}.json`]);
    // (`state.json` has a key of its own called "requests": the times HQ asked the provider.)
    expect(Object.keys(state()).sort()).toEqual(
      [
        "auto_stop_from",
        "backlog_applied_at",
        "format",
        "in_progress",
        "last_older_at",
        "last_read",
        "last_recent_at",
        "requests",
        "tags_filter",
        "wait_until",
      ].sort(),
    );
    const bytes =
      readFileSync(join(dir, "delivery", `mailings/${id}.json`), "utf8") +
      JSON.stringify(Object.values(state()));
    for (const never of [
      "opened",
      "clicks",
      "loadedByProxy",
      "requests",
      "someNewEvent",
      "stranger",
      "elsewhere",
      "me@quantify",
      "other.example",
    ])
      expect(bytes, never).not.toContain(never);
    expect(stopsOf(engine).size).toBe(0);
    // The log has counts and codes: never an address, an id or the provider's words.
    const lines = logged.filter((line) => line.includes("delivery"));
    expect(lines).toEqual(["[mail-merge] delivery read (now, 8 days): 1 page, 4 kept, 11 dropped"]);
  });

  it("gives a mailing with no kept event a file all the same: read, and nothing has arrived", async () => {
    const engine = open();
    await setUp(engine);
    const { id } = await sendTo(engine, "Quiet", 2);
    expect(engine.mailings().mailings[0]!.delivery).toBeNull();
    await engine.readDelivery("now");
    expect(fileOf(id).recipients.map((recipient) => recipient.events)).toEqual([[], []]);
    expect(engine.mailings().mailings[0]!.delivery).toMatchObject({
      accepted: 2,
      delivered: 0,
      not_yet: 2,
      read_at: START,
      warning: null,
    });
  });
});

describe("3. paging", () => {
  it("asks page after page by offset, and a repeat of the same events adds nothing", async () => {
    const engine = open({ pageSize: 2 });
    await setUp(engine);
    const { id } = await sendTo(engine, "Intro", 5);
    for (let index = 1; index <= 5; index += 1) provider.add(p(index), "delivered", index);
    const first = await engine.readDelivery("now");
    expect(first).toMatchObject({ outcome: "ok", pages: 3, kept: 5, dropped: 0 });
    expect(provider.queries).toEqual([
      { days: 8, offset: 0, limit: 2, tags: ["hq-mail-merge"] },
      { days: 8, offset: 2, limit: 2, tags: ["hq-mail-merge"] },
      { days: 8, offset: 4, limit: 2, tags: ["hq-mail-merge"] },
    ]);
    const before = readFileSync(join(dir, "delivery/mailings", `${id}.json`), "utf8");
    later(5_000);
    const again = await engine.readDelivery("now");
    expect(again).toMatchObject({ outcome: "ok", pages: 3, kept: 0, dropped: 5 });
    const after = fileOf(id);
    expect(after.recipients).toEqual((JSON.parse(before) as MailingDeliveryFile).recipients);
    expect(after.read_at).toBe("2026-11-14T06:00:05.000Z");
    expect(state()).toMatchObject({
      in_progress: null,
      last_read: { scope: "now", days: 8, pages: 3, kept: 0, outcome: "ok", detail: "" },
      last_recent_at: "2026-11-14T06:00:05.000Z",
      last_older_at: null,
    });
  });

  it("stops at the most pages one read takes, and carries on from there", async () => {
    const engine = open({ pageSize: 1, maxPages: 2 });
    await setUp(engine);
    await sendTo(engine, "Intro", 5);
    for (let index = 1; index <= 5; index += 1) provider.add(p(index), "delivered", index);
    expect(await engine.readDelivery("now")).toEqual({
      outcome: "partial",
      pages: 2,
      kept: 2,
      dropped: 0,
      detail: "Read 2 pages; the rest follows at the next read.",
    });
    expect(state().in_progress).toMatchObject({ scope: "now", days: 8, offset: 2 });
    await tick(engine);
    expect(provider.queries.map((query) => query.offset)).toEqual([0, 1, 2, 3]);
    expect(state().last_read).toMatchObject({ outcome: "partial", pages: 4, kept: 4 });
  });
});

describe("4. a restart in the middle of a read", () => {
  it("carries on from the page it had reached; one cut short too long ago starts again", async () => {
    const first = open({ pageSize: 2 });
    await setUp(first);
    const { id } = await sendTo(first, "Intro", 5);
    for (let index = 1; index <= 5; index += 1) provider.add(p(index), "delivered", index);
    // The second request never answers: the sender is gone before it does.
    provider.hangFrom = 2;
    void first.readDelivery("now");
    await vi.waitFor(() => expect(provider.queries).toHaveLength(2));
    expect(state().in_progress).toEqual({ scope: "now", days: 8, offset: 2, started_at: START });
    expect(fileOf(id).recipients.filter((recipient) => recipient.events.length > 0)).toHaveLength(
      2,
    );

    provider.hangFrom = 0;
    provider.queries = [];
    later(10 * 60_000);
    const second = open({ pageSize: 2 });
    await tick(second);
    expect(provider.queries.map((query) => query.offset)).toEqual([2, 4]);
    expect(fileOf(id).recipients.every((recipient) => recipient.events.length === 1)).toBe(true);
    expect(state()).toMatchObject({ in_progress: null, last_read: { outcome: "ok" } });

    // Again, and this time nobody comes back for three hours.
    rmSync(join(dir, "delivery/mailings", `${id}.json`));
    provider.queries = [];
    provider.hangFrom = 2;
    later(2 * 60_000);
    const third = open({ pageSize: 2 });
    void third.readDelivery("now");
    await vi.waitFor(() => expect(provider.queries).toHaveLength(2));
    expect(state().in_progress).toMatchObject({ offset: 2 });
    provider.hangFrom = 0;
    provider.queries = [];
    later(3 * 3_600_000);
    const fourth = open({ pageSize: 2 });
    await tick(fourth);
    expect(provider.queries.map((query) => query.offset)).toEqual([0, 2, 4]);
    expect(state().in_progress).toBeNull();
  });
});

describe("5. when the provider says no", () => {
  it("waits when it is asked to slow down, and asks nothing until then", async () => {
    const engine = open({ pageSize: 2 });
    await setUp(engine);
    await sendTo(engine, "Intro", 3);
    for (let index = 1; index <= 3; index += 1) provider.add(p(index), "delivered", index);
    provider.answers = [
      { status: "ok", events: provider.events.slice(0, 2) },
      { status: "rate_limited", retry_after_seconds: 120 },
    ];
    const slowed = await engine.readDelivery("now");
    expect(slowed.outcome).toBe("slowed");
    expect(slowed.detail).toMatch(
      /^The provider asked HQ to slow down; reading again after \d\d:\d\d\. Sending is not affected\.$/,
    );
    expect(state()).toMatchObject({
      wait_until: "2026-11-14T06:02:00.000Z",
      in_progress: { offset: 2 },
      last_read: { outcome: "slowed", kept: 2 },
    });
    expect(provider.queries).toHaveLength(2);
    later(60_000);
    expect((await engine.readDelivery("now")).outcome).toBe("slowed");
    expect((await refusal(() => engine.checkDelivery({}))).code).toBe("slowed");
    expect(engine.deliveryOverview().read).toMatchObject({
      outcome: "slowed",
      next_at: "2026-11-14T06:02:00.000Z",
    });
    await tick(engine);
    expect(provider.queries).toHaveLength(2);

    later(61_000);
    await tick(open({ pageSize: 2 }));
    expect(provider.queries.map((query) => query.offset)).toEqual([0, 2, 2]);
    expect(state()).toMatchObject({ wait_until: null, in_progress: null });
    expect(state().last_read).toMatchObject({ outcome: "ok" });
  });

  it("waits a quarter of an hour when the provider does not say how long", async () => {
    const engine = open();
    await setUp(engine);
    provider.answers = [{ status: "rate_limited", retry_after_seconds: null }];
    await engine.readDelivery("now");
    expect(state().wait_until).toBe("2026-11-14T06:15:00.000Z");
  });

  it("says so when the key is not accepted for reading, and leaves the mailing alone", async () => {
    const engine = open();
    await setUp(engine);
    await sendTo(engine, "Intro", 2);
    provider.answers = [{ status: "auth_failed" }];
    expect(await engine.readDelivery("now")).toEqual({
      outcome: "refused",
      pages: 0,
      kept: 0,
      dropped: 0,
      detail:
        "The provider did not accept the key for reading delivery. Check it in Setup. Sending is not affected.",
    });
    expect(state()).toMatchObject({ in_progress: null, last_read: { outcome: "refused" } });
    expect(engine.mailings().mailings[0]).toMatchObject({ state: "finished", delivery: null });
  });

  it("drops the tag filter when the provider refuses it, once, and reads on without it", async () => {
    const engine = open();
    await setUp(engine);
    await sendTo(engine, "Intro", 2);
    provider.add(p(1), "delivered", 1);
    provider.answers = [{ status: "refused", code: "invalid_parameter", http: 400 }];
    expect(await engine.readDelivery("now")).toMatchObject({ outcome: "ok", kept: 1 });
    expect(provider.queries.map((query) => query.tags)).toEqual([["hq-mail-merge"], null]);
    expect(state()).toMatchObject({ tags_filter: false });
    expect(state().requests).toHaveLength(2);
    expect(logged).toContain(
      "[mail-merge] the provider refused the tag filter; reading without it",
    );
    // With the filter gone, a refusal is a refusal.
    later(1_000);
    provider.answers = [
      { status: "refused", code: "bad request for <p1@fund.example>", http: 400 },
    ];
    expect(await engine.readDelivery("now")).toMatchObject({
      outcome: "refused",
      detail:
        "The provider refused the read (badrequestforp1fund.example). Sending is not affected.",
    });
    expect(provider.queries.at(-1)!.tags).toBeNull();
    expect(state().in_progress).toBeNull();
  });

  it("keeps its place when the provider does not answer, and does not ask at every tick", async () => {
    const engine = open({ pageSize: 2 });
    await setUp(engine);
    await sendTo(engine, "Intro", 3);
    for (let index = 1; index <= 3; index += 1) provider.add(p(index), "delivered", index);
    provider.answers = [
      { status: "ok", events: provider.events.slice(0, 2) },
      { status: "unavailable" },
    ];
    expect(await engine.readDelivery("now")).toEqual({
      outcome: "unreachable",
      pages: 1,
      kept: 2,
      dropped: 0,
      detail:
        "The provider did not answer. It is asked again at the next read. Sending is not affected.",
    });
    expect(state().in_progress).toMatchObject({ offset: 2 });
    // A provider that throws is the same as one that does not answer.
    later(1_000);
    provider.listEvents = async () => {
      throw new Error("the line fell over");
    };
    expect((await engine.readDelivery("now")).outcome).toBe("unreachable");
    const asked = state().requests.length;
    later(60_000);
    await tick(engine);
    expect(state().requests).toHaveLength(asked);
  });
});

describe("6. the hour's budget", () => {
  it("stops at the budget, carries on by itself an hour later, and never goes over", async () => {
    const engine = open({ pageSize: 1, hourlyBudget: 3 });
    await setUp(engine);
    const { id } = await sendTo(engine, "Intro", 6);
    for (let index = 1; index <= 6; index += 1) provider.add(p(index), "delivered", index);
    expect(await engine.readDelivery("now")).toEqual({
      outcome: "partial",
      pages: 3,
      kept: 3,
      dropped: 0,
      detail:
        "Stopped at this hour's limit of 3 requests to the provider; it carries on by itself.",
    });
    expect(provider.queries).toHaveLength(3);
    expect(state()).toMatchObject({ in_progress: { offset: 3 } });
    expect(state().requests).toHaveLength(3);
    // Inside the hour nothing more is asked, by the loop or by hand.
    later(30 * 60_000);
    await tick(engine);
    expect(provider.queries).toHaveLength(3);
    expect((await open({ pageSize: 1, hourlyBudget: 3 }).readDelivery("now")).outcome).toBe(
      "partial",
    );
    expect(provider.queries).toHaveLength(3);

    expect(state().in_progress).toMatchObject({ offset: 3 });

    later(31 * 60_000);
    await tick(open({ pageSize: 1, hourlyBudget: 3 }));
    expect(provider.queries.map((query) => query.offset)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(state()).toMatchObject({
      in_progress: { offset: 6 },
      last_read: { outcome: "partial" },
    });
    // More than two hours after it began, and still the same read: it was cut short an hour ago.
    later(61 * 60_000);
    await tick(open({ pageSize: 1, hourlyBudget: 3 }));
    expect(provider.queries.map((query) => query.offset).slice(6)).toEqual([6]);
    expect(state()).toMatchObject({ in_progress: null, last_read: { outcome: "ok" } });
    expect(fileOf(id).recipients.every((recipient) => recipient.events.length === 1)).toBe(true);
  });
});

describe("6a. a tag filter that hides this computer's mail", () => {
  it("is noticed when a read keeps nothing of mail old enough, and dropped once the read without it does", async () => {
    const engine = open();
    await setUp(engine);
    const { id } = await sendTo(engine, "Intro", 3);
    for (let index = 1; index <= 3; index += 1) provider.add(p(index), "delivered", index);
    provider.hideWhenTagged = true;
    later(11 * 60_000);
    expect(await engine.readDelivery("now")).toMatchObject({ outcome: "ok", kept: 0 });
    expect(state().tags_filter).toBe(true);
    expect(fileOf(id).recipients.every((recipient) => recipient.events.length === 0)).toBe(true);
    await tick(engine);
    expect(provider.queries.map((query) => query.tags)).toEqual([["hq-mail-merge"], null]);
    expect(state()).toMatchObject({ tags_filter: false, last_read: { kept: 3, outcome: "ok" } });
    expect(fileOf(id).recipients.every((recipient) => recipient.events.length === 1)).toBe(true);
    expect(logged).toContain(
      "[mail-merge] the tag filter hid this computer's mail; reading without it",
    );
    later(1_000);
    await open().readDelivery("now");
    expect(provider.queries.at(-1)!.tags).toBeNull();
  });

  it("changes nothing when the read without it keeps nothing either, or the mail is too fresh to tell", async () => {
    const engine = open();
    await setUp(engine);
    await sendTo(engine, "Intro", 2);
    // Fresh mail with no events yet says nothing about the filter.
    expect(await engine.readDelivery("now")).toMatchObject({ outcome: "ok", kept: 0 });
    later(11 * 60_000);
    const second = open();
    expect(await second.readDelivery("now")).toMatchObject({ outcome: "ok", kept: 0 });
    await tick(second);
    expect(provider.queries.map((query) => query.tags)).toEqual([
      ["hq-mail-merge"],
      ["hq-mail-merge"],
      null,
    ]);
    expect(state().tags_filter).toBe(true);
  });

  it("does not doubt the filter when a read brings back only events it already has", async () => {
    const engine = open();
    await setUp(engine);
    await sendTo(engine, "Intro", 2);
    provider.add(p(1), "delivered", 1);
    await engine.readDelivery("now");
    later(11 * 60_000);
    const second = open();
    expect(await second.readDelivery("now")).toMatchObject({ outcome: "ok", kept: 0, dropped: 1 });
    await tick(second);
    expect(provider.queries.map((query) => query.tags)).toEqual([
      ["hq-mail-merge"],
      ["hq-mail-merge"],
    ]);
  });
});

describe("7. one read at a time", () => {
  it("answers a second ask while one goes, refuses a third too soon, and needs a key", async () => {
    const none = open();
    expect(await refusal(() => none.checkDelivery({}))).toMatchObject({
      status: 409,
      code: "no_key",
      message: "Delivery is read with the provider key. Add it in Setup.",
    });

    const engine = open();
    await setUp(engine);
    await sendTo(engine, "Intro", 2);
    provider.add(p(1), "delivered", 1);
    let release: () => void = () => undefined;
    provider.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = await engine.checkDelivery({});
    expect(first).toMatchObject({ started: true, reading: true, days: 8 });
    expect(first.read).toMatchObject({ key_set: true, reading: true, last_read_at: null });
    const second = await engine.checkDelivery({});
    expect(second).toMatchObject({ started: false, reading: true });
    expect(provider.queries).toHaveLength(1);
    release();
    provider.gate = null;
    expect(await engine.readDelivery("now")).toMatchObject({ outcome: "ok", kept: 1 });
    expect(provider.queries).toHaveLength(1);

    expect(await refusal(() => engine.checkDelivery({}))).toMatchObject({
      status: 409,
      code: "too_soon",
      message: "Delivery was read less than a minute ago. Try again in a moment.",
    });
    later(59_000);
    expect((await refusal(() => engine.checkDelivery({}))).code).toBe("too_soon");
    later(1_000);
    const waited = await engine.checkDelivery({ wait: true });
    expect(waited).toMatchObject({ started: true, reading: false, days: 8 });
    expect(waited.read).toMatchObject({
      outcome: "ok",
      scope: "now",
      days: 8,
      kept: 0,
      last_read_at: "2026-11-14T06:01:00.000Z",
      auto_stop_from: START,
      backlog_applied_at: null,
    });
  });

  it("reads further back for one mailing, and refuses a practice run or a mailing that is gone", async () => {
    const engine = open();
    await setUp(engine);
    const { id } = await sendTo(engine, "Old", 2);
    const practice = await draft(engine, "Rehearsal", 2, "practice.example");
    engine.startMailing(practice.id, { practice: true });
    await drain(engine);
    expect(await refusal(() => engine.checkDelivery({ mailing_id: "nobody" }))).toMatchObject({
      status: 404,
      code: "not_found",
    });
    expect(await refusal(() => engine.checkDelivery({ mailing_id: practice.id }))).toMatchObject({
      status: 409,
      code: "practice",
      message: "A practice run has no delivery to read.",
    });
    expect((await engine.checkDelivery({ mailing_id: id, wait: true })).days).toBe(8);
    later(40 * 86_400_000 + 3_600_000);
    expect((await engine.checkDelivery({ mailing_id: id, wait: true })).days).toBe(42);
    expect(provider.queries.at(-1)!.days).toBe(42);
    expect(state()).toMatchObject({ last_read: { scope: "now", days: 42 } });
    expect(state().last_older_at).toBe(state().last_read!.at);
    later(200 * 86_400_000);
    expect((await engine.checkDelivery({ mailing_id: id, wait: true })).days).toBe(90);
  });
});

describe("the schedule", () => {
  it("reads first for 31 days, then the last week every half hour, then the older once a day", async () => {
    const engine = open();
    await setUp(engine);
    await sendTo(engine, "Intro", 2);
    const turn = async () => {
      await tick(open());
      return provider.queries.map((query) => query.days);
    };
    void engine;
    expect(await turn()).toEqual([31]);
    expect(state()).toMatchObject({
      last_read: { scope: "first", days: 31 },
      last_recent_at: START,
      last_older_at: START,
    });
    later(29 * 60_000);
    expect(await turn()).toEqual([31]);
    expect(open().deliveryOverview().read.next_at).toBe("2026-11-14T06:30:00.000Z");
    later(60_000);
    expect(await turn()).toEqual([31, 8]);
    expect(state().last_read).toMatchObject({ scope: "recent", days: 8 });
    // Eight days on, the send is no longer in the last week: once a day, 31 days back.
    later(8 * 86_400_000);
    expect(await turn()).toEqual([31, 8, 31]);
    expect(state().last_read).toMatchObject({ scope: "older" });
    later(23 * 3_600_000);
    expect(await turn()).toEqual([31, 8, 31]);
    later(3_600_000);
    expect(await turn()).toEqual([31, 8, 31, 31]);
    // Past 30 days nothing is read by itself.
    later(40 * 86_400_000);
    expect(await turn()).toEqual([31, 8, 31, 31]);
    expect(open().deliveryOverview().read.next_at).toBeNull();
  });

  it("reads nothing without a key, and nothing from a provider that has no events to give", async () => {
    const engine = open();
    await tick(engine);
    expect(provider.queries).toEqual([]);
    expect(engine.deliveryOverview().read).toEqual({
      key_set: false,
      reading: false,
      last_read_at: null,
      scope: null,
      days: null,
      outcome: null,
      detail: "",
      kept: 0,
      next_at: null,
      wait_until: null,
      auto_stop_from: null,
      backlog_applied_at: null,
    });
    const plain = open();
    await setUp(plain);
    (provider as { listEvents?: unknown }).listEvents = undefined;
    await tick(plain);
    expect((await open().readDelivery("now")).outcome).toBe("no_key");
    expect(state().last_read).toBeNull();
  });
});

describe("8. it never blocks sending", () => {
  it("sends three live messages while a read is still waiting for the provider", async () => {
    const engine = open();
    await setUp(engine);
    const { id } = await draft(engine, "Intro", 3);
    provider.sent = [];
    let release: () => void = () => undefined;
    provider.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reading = engine.readDelivery("now");
    await vi.waitFor(() => expect(provider.queries).toHaveLength(1));
    engine.startMailing(id, { practice: false, confirm: 3 });
    expect([await engine.step(), await engine.step(), await engine.step()]).toEqual([
      "sent",
      "sent",
      "sent",
    ]);
    expect(provider.sent.map((mail) => mail.to_email)).toEqual([p(1), p(2), p(3)]);
    expect(engine.deliveryOverview().read.reading).toBe(true);
    release();
    expect((await reading).outcome).toBe("ok");
    expect(await engine.step()).toBe("finished");
  });

  it("takes five seconds over a read, on a real clock, and the send does not wait", async () => {
    const engine = open();
    await setUp(engine);
    const { id } = await draft(engine, "Intro", 3);
    provider.gate = new Promise<void>((resolve) => setTimeout(resolve, 5_000));
    const begun = Date.now();
    const reading = engine.readDelivery("now");
    engine.startMailing(id, { practice: false, confirm: 3 });
    const steps = [await engine.step(), await engine.step(), await engine.step()];
    expect(steps).toEqual(["sent", "sent", "sent"]);
    expect(Date.now() - begun).toBeLessThan(2_000);
    expect((await reading).outcome).toBe("ok");
    expect(Date.now() - begun).toBeGreaterThanOrEqual(4_900);
  }, 15_000);
});

describe("9. the stop list", () => {
  it("stops a hard bounce, an address that cannot take mail, a complaint and an unsubscribe; nobody else", async () => {
    const engine = open();
    await setUp(engine);
    const { id } = await sendTo(engine, "Intro", 9);
    engine.addStops({ emails: p(9), reason: "manual" });
    provider.add(p(1), "hardBounces", 3, { reason: `550 5.1.1 <${p(1)}>: user unknown` });
    provider.add(p(2), "delivered", 1);
    provider.add(p(2), "spam", 5);
    provider.add(p(3), "softBounces", 3, { reason: "452 4.2.2 The mailbox is full" });
    provider.add(p(4), "deferred", 2);
    provider.add(p(5), "blocked", 1);
    provider.add(p(6), "error", 1);
    provider.add(p(7), "invalid", 1);
    provider.add(p(8), "unsubscribed", 6);
    provider.add(p(9), "hardBounces", 4);
    await engine.readDelivery("now");

    const stops = stopsOf(engine);
    expect([...stops.keys()].sort()).toEqual([p(1), p(2), p(7), p(8), p(9)].sort());
    expect(stops.get(p(1))).toEqual({
      email: p(1),
      reason: "bounced",
      detail: "Hard bounce · Intro",
      at: at(3),
    });
    expect(stops.get(p(2))).toEqual({
      email: p(2),
      reason: "asked",
      detail: "Marked as spam · Intro",
      at: at(5),
    });
    expect(stops.get(p(7))).toMatchObject({
      reason: "bounced",
      detail: "Not a working address · Intro",
    });
    expect(stops.get(p(8))).toMatchObject({ reason: "asked", detail: "Unsubscribed · Intro" });
    // Someone he had put on by hand stays as he put them.
    expect(stops.get(p(9))).toMatchObject({ reason: "manual", detail: "", at: START });

    const lines = applied();
    expect(lines).toHaveLength(5);
    expect(lines.map((line) => [line.email, line.kind, line.result, line.how])).toEqual([
      [p(1), "hard_bounce", "added", "auto"],
      [p(2), "complaint", "added", "auto"],
      [p(7), "invalid", "added", "auto"],
      [p(8), "unsubscribed", "added", "auto"],
      [p(9), "hard_bounce", "already", "auto"],
    ]);
    expect(lines[0]).toEqual({
      email: p(1),
      kind: "hard_bounce",
      mailing_id: id,
      at: at(3),
      applied_at: START,
      result: "added",
      how: "auto",
    });
    // The provider's words are kept without the address in them.
    expect(JSON.stringify(fileOf(id))).not.toContain(`<${p(1)}>`);
    expect(fileOf(id).recipients[0]!.events[0]!.reason).toBe("550 5.1.1 <[address]>: user unknown");
    // The stop list file is the engine's own, in its own shape.
    expect(
      (JSON.parse(readFileSync(join(dir, "stop-list.json"), "utf8")) as unknown[]).length,
    ).toBe(5);
  });

  it("does not put back someone taken off by hand, until a new event says so", async () => {
    const engine = open();
    await setUp(engine);
    await sendTo(engine, "Intro", 2);
    provider.add(p(1), "hardBounces", 3);
    await engine.readDelivery("now");
    expect(stopsOf(engine).has(p(1))).toBe(true);
    engine.removeStop({ email: p(1) });

    later(1_000);
    await engine.readDelivery("now");
    expect(stopsOf(engine).has(p(1))).toBe(false);
    // Not after a restart either, nor when the mailing's own file is lost and read anew.
    later(1_000);
    const restarted = open();
    await restarted.readDelivery("now");
    expect(stopsOf(restarted).has(p(1))).toBe(false);
    rmSync(join(dir, "delivery/mailings"), { recursive: true, force: true });
    later(1_000);
    const again = open();
    expect(await again.readDelivery("now")).toMatchObject({ kept: 1 });
    expect(stopsOf(again).has(p(1))).toBe(false);
    expect(applied()).toHaveLength(1);

    // A later mailing bounces again: that is new evidence.
    later(60_000);
    const list = again.lists().lists.find((item) => item.name === "Intro list")!.id;
    const second = again.createMailing({ name: "Second" }).mailing.id;
    again.updateMailing(second, {
      subject: "Again, {{firm}}",
      body: "Hi {{first_name}},\n\nOnce more.",
      list_ids: [list],
      skip_written: false,
    });
    await again.testMailing(second, { to: "me@quantify.example" });
    again.startMailing(second, { practice: false, confirm: 2 });
    await drain(again);
    provider.add(p(1), "hardBounces", 3);
    await again.readDelivery("now");
    expect(stopsOf(again).get(p(1))).toEqual({
      email: p(1),
      reason: "bounced",
      detail: "Hard bounce · Second",
      at: at(3),
    });
    expect(applied().map((line) => line.mailing_id)).toHaveLength(2);
  });

  it("stops the rest of a mailing still going out to an address that has just bounced elsewhere", async () => {
    const engine = open();
    await setUp(engine);
    await sendTo(engine, "First", 2);
    const list = engine.lists().lists[0]!.id;
    const second = engine.createMailing({ name: "Second" }).mailing.id;
    engine.updateMailing(second, {
      subject: "Again, {{firm}}",
      body: "Hi {{first_name}},\n\nOnce more.",
      list_ids: [list],
      skip_written: false,
    });
    await engine.testMailing(second, { to: "me@quantify.example" });
    engine.startMailing(second, { practice: false, confirm: 2 });
    provider.add(p(1), "hardBounces", 3);
    provider.add(p(2), "hardBounces", 3);
    await engine.readDelivery("now");
    expect(await drain(engine)).toEqual(["skipped", "skipped", "finished"]);
    expect(engine.mailingDetail(second, {}).recipients.rows.map((row) => row.reason)).toEqual([
      "On the stop list",
      "On the stop list",
    ]);
  });
});

describe("10. what happened before the first run with a key waits for his press", () => {
  const FUTURE = "2026-11-15T00:00:00.000Z";

  it("puts nothing on by itself, lists it, takes one press with the count it showed, and is automatic after", async () => {
    const engine = open({ stopFrom: FUTURE });
    await setUp(engine);
    expect(state().auto_stop_from).toBe(FUTURE);
    const { id } = await sendTo(engine, "Waitlist 07", 6);
    await sendTo(engine, "Waitlist 08", 2, "fund.example", { skip_written: false });
    // p1 bounced in both mailings: listed once, by the earlier.
    provider.add(p(1), "hardBounces", 9);
    provider.events.push({
      email: p(1),
      date: at(3),
      message_id: "<MSG-2@Relay.test>",
      event: "hardBounces",
      reason: "",
      tag: "hq-mail-merge",
    });
    provider.events.push({
      email: p(2),
      date: at(4),
      message_id: "<MSG-3@Relay.test>",
      event: "spam",
      reason: "",
      tag: "hq-mail-merge",
    });
    provider.add(p(3), "invalid", 5);
    provider.add(p(4), "unsubscribed", 6);
    provider.add(p(5), "softBounces", 7);
    engine.addStops({ emails: p(4), reason: "asked" });

    await engine.readDelivery("now");
    expect([...stopsOf(engine).keys()]).toEqual([p(4)]);
    expect(applied()).toEqual([]);

    const backlog = engine.deliveryOverview().backlog;
    expect(backlog).toMatchObject({ total: 4, would_add: 3 });
    expect(backlog.rows).toEqual([
      {
        email: p(1),
        kind: "hard_bounce",
        at: at(3),
        mailing_id: id,
        mailing: "Waitlist 07",
        on_stop_list: false,
      },
      {
        email: p(2),
        kind: "complaint",
        at: at(4),
        mailing_id: id,
        mailing: "Waitlist 07",
        on_stop_list: false,
      },
      {
        email: p(3),
        kind: "invalid",
        at: at(5),
        mailing_id: id,
        mailing: "Waitlist 07",
        on_stop_list: false,
      },
      {
        email: p(4),
        kind: "unsubscribed",
        at: at(6),
        mailing_id: id,
        mailing: "Waitlist 07",
        on_stop_list: true,
      },
    ]);
    const page = engine.mailingDelivery(id, { view: "didnt" });
    expect(page.waiting_stops).toBe(3);
    expect(page.rows.find((row) => row.email === p(1))!.stop).toEqual({
      on: false,
      since: null,
      waiting: true,
    });
    expect(page.rows.find((row) => row.email === p(5))!.stop.waiting).toBe(false);

    // A press that does not carry today's count is refused, and nothing changes.
    for (const count of ["3", 3.5, -1, null, undefined])
      expect(await refusal(() => engine.applyDeliveryBacklog({ count }))).toMatchObject({
        status: 400,
        code: "invalid",
        message: "Say how many.",
      });
    expect(await refusal(() => engine.applyDeliveryBacklog({ count: 4 }))).toMatchObject({
      status: 409,
      code: "changed",
      message:
        "The list changed since this page was drawn: 3 now. Look again, then press once more.",
    });
    expect([...stopsOf(engine).keys()]).toEqual([p(4)]);
    expect(state().backlog_applied_at).toBeNull();
    // The list changes under him: someone is put on by hand between the page and the press.
    engine.addStops({ emails: p(3), reason: "manual" });
    expect((await refusal(() => engine.applyDeliveryBacklog({ count: 3 }))).message).toContain(
      "2 now",
    );

    later(5_000);
    expect(engine.applyDeliveryBacklog({ count: 2 })).toEqual({ added: 2, already: 2 });
    const stops = stopsOf(engine);
    expect([...stops.keys()].sort()).toEqual([p(1), p(2), p(3), p(4)].sort());
    expect(stops.get(p(1))).toEqual({
      email: p(1),
      reason: "bounced",
      detail: "Hard bounce · Waitlist 07",
      at: new Date(Date.parse(START) + 3_000).toISOString(),
    });
    expect(stops.get(p(3))).toMatchObject({ reason: "manual" });
    expect(applied().map((line) => [line.email, line.result, line.how])).toEqual([
      [p(1), "added", "press"],
      [p(2), "added", "press"],
      [p(3), "already", "press"],
      [p(4), "already", "press"],
    ]);
    expect(state().backlog_applied_at).toBe("2026-11-14T06:00:05.000Z");
    expect(state().auto_stop_from).toBe(FUTURE);
    expect(engine.deliveryOverview().backlog).toEqual({ total: 0, would_add: 0, rows: [] });
    expect(await refusal(() => engine.applyDeliveryBacklog({ count: 0 }))).toMatchObject({
      status: 409,
      code: "nothing",
      message: "Nothing is waiting for the stop list.",
    });

    // From then on, an older event a later read finds goes on by itself.
    provider.add(p(6), "hardBounces", 2);
    later(1_000);
    await engine.readDelivery("now");
    expect(stopsOf(engine).get(p(6))).toMatchObject({ reason: "bounced" });
    expect(applied().at(-1)).toMatchObject({ email: p(6), how: "auto", result: "added" });
    // And taking one of the pressed off sticks.
    engine.removeStop({ email: p(1) });
    later(1_000);
    await open({ stopFrom: FUTURE }).readDelivery("now");
    expect(stopsOf(open()).has(p(1))).toBe(false);
  });

  it("keeps waiting across restarts and reads, however many, until the press", async () => {
    const engine = open({ stopFrom: FUTURE });
    await setUp(engine);
    await sendTo(engine, "Waitlist 07", 3);
    provider.add(p(1), "hardBounces", 3);
    provider.add(p(2), "spam", 4);
    for (let round = 0; round < 3; round += 1) {
      later(31 * 60_000);
      const next = open();
      await next.readDelivery("now");
      await tick(next);
      expect(stopsOf(open()).size, `round ${round}`).toBe(0);
    }
    expect(applied()).toEqual([]);
    expect(open().deliveryOverview().backlog).toMatchObject({ total: 2, would_add: 2 });
    // An event dated at or after the cut-off acts by itself: that is the rule from then on.
    provider.events.push({
      email: p(3),
      date: FUTURE,
      message_id: provider.ids.get(p(3))!,
      event: "hardBounces",
      reason: "",
      tag: "hq-mail-merge",
    });
    later(1_000);
    const last = open();
    await last.readDelivery("now");
    expect([...stopsOf(last).keys()]).toEqual([p(3)]);
    expect(last.deliveryOverview().backlog.total).toBe(2);
  });

  it("has nothing to apply without a key", async () => {
    expect(await refusal(() => open().applyDeliveryBacklog({ count: 0 }))).toMatchObject({
      status: 409,
      code: "nothing",
    });
  });
});

describe("11. a warning never pauses", () => {
  it("leaves a sending mailing sending after a read with a complaint, and after the pages read it", async () => {
    const engine = open();
    await setUp(engine);
    const { id } = await draft(engine, "Intro", 12);
    engine.startMailing(id, { practice: false, confirm: 12 });
    for (let index = 0; index < 10; index += 1) expect(await engine.step()).toBe("sent");
    for (let index = 1; index <= 10; index += 1) provider.add(p(index), "delivered", 1);
    provider.add(p(4), "spam", 5);
    await engine.readDelivery("now");

    const overview = engine.deliveryOverview();
    expect(overview.week.counts).toMatchObject({ accepted: 10, delivered: 10, complaint: 1 });
    expect(overview.week.warnings.map((warning) => [warning.key, warning.level])).toEqual([
      ["complaints", "danger"],
    ]);
    expect(overview.week.warnings[0]!.body).toContain(
      "1 spam complaint from 10 delivered in the last 7 days: 10.0 per cent.",
    );
    expect(overview.week.by_mailing).toEqual([
      { mailing_id: id, name: "Intro", hard_bounce: 0, complaint: 1 },
    ]);
    expect(overview.week.since).toBe("2026-11-07T06:00:00.000Z");
    const page = engine.mailingDelivery(id, {});
    expect(page.warnings[0]).toMatchObject({ key: "complaints", level: "danger" });
    expect(page.mailing).toEqual({ id, name: "Intro", state: "sending", mode: "live" });

    const summary = engine.mailings().mailings.find((mailing) => mailing.id === id)!;
    expect(summary).toMatchObject({
      state: "sending",
      pause_reason: null,
      delivery: { accepted: 10, complaint: 1, warning: "danger" },
    });
    expect(engine.status().sending).toEqual({ mailing_id: id, name: "Intro" });
    // It goes on to the end; the one who complained is on the stop list, nobody else.
    expect(await drain(engine)).toEqual(["sent", "sent", "finished"]);
    expect([...stopsOf(engine).keys()]).toEqual([p(4)]);
    expect(provider.sent.filter((mail) => mail.tags.includes(id.slice(0, 8)))).toHaveLength(12);
  });

  it("leaves the pauses there were exactly as they were: the day's limit", async () => {
    const engine = open();
    await setUp(engine);
    engine.saveSettings({ daily_cap: 3 });
    const { id } = await draft(engine, "Intro", 4);
    engine.startMailing(id, { practice: false, confirm: 4 });
    provider.add("me@quantify.example", "spam", 1);
    await engine.readDelivery("now");
    expect(await drain(engine)).toEqual(["sent", "sent", "paused"]);
    expect(engine.mailings().mailings[0]!.pause_reason).toBe(
      "Today's limit of 3 is reached. Press Resume tomorrow.",
    );
  });
});

describe("12. a retry is a draft and nothing else", () => {
  it("picks the soft bounces, the blocked and the not sent who are not stopped and still on the lists", async () => {
    const engine = open();
    await setUp(engine);
    const { id, list } = await sendTo(engine, "Intro", 8, "fund.example", {
      hold_column: "",
    });
    provider.add(p(1), "delivered", 1);
    provider.add(p(2), "hardBounces", 3);
    provider.add(p(3), "softBounces", 3, { reason: "452 4.2.2 The mailbox is full" });
    provider.add(p(4), "deferred", 2);
    provider.add(p(5), "blocked", 1);
    provider.add(p(6), "error", 1);
    provider.add(p(7), "softBounces", 3);
    provider.add(p(8), "softBounces", 3);
    await engine.readDelivery("now");
    // One of them has since been put on the stop list, and one taken off the list of people.
    engine.addStops({ emails: p(7), reason: "manual" });
    const row = engine.listDetail(list, { q: p(8) }).rows[0]!;
    engine.removeRow(list, row.id);

    const page = engine.mailingDelivery(id, { view: "retry" });
    expect(page.retry).toEqual({ count: 4, on_stop_list: 1 });
    expect(page.rows.map((item) => item.email)).toEqual([p(3), p(5), p(6), p(8)]);

    const before = provider.sent.length;
    later(60_000);
    const made = engine.retryMailing(id);
    expect(made).toMatchObject({ picked: 3, not_on_lists: 1 });
    expect(made.mailing).toMatchObject({
      name: "Intro (retry)",
      state: "draft",
      mode: null,
      editable: true,
      delivery: null,
      started_at: null,
      progress: { total: 0, sent: 0 },
    });
    expect(made.mailing.id).not.toBe(id);
    const detail = engine.mailingDetail(made.mailing.id, {});
    expect(detail.mailing).toMatchObject({
      subject: "A note for {{firm}}",
      body: "Hi {{first_name}},\n\nA short note.",
      list_ids: [list],
      only_column: "",
      only_value: "",
      pick_only: true,
      picked_count: 3,
      skip_written: false,
    });
    expect(detail.audience.sendable).toBe(3);
    expect(
      engine
        .people(made.mailing.id, { view: "picked" })
        .rows.map((person) => person.email)
        .sort(),
    ).toEqual([p(3), p(5), p(6)]);
    const labels = detail.checks.map((check) => check.label);
    expect(labels).toContain(
      '3 people were already written to by "Intro", and will be written to again',
    );
    expect(labels).toContain("Send yourself a test of this wording");
    // Nothing went, nothing started, and the first mailing is as it was.
    expect(provider.sent).toHaveLength(before);
    expect(await engine.step()).toBe("idle");
    expect(engine.mailings().mailings.find((mailing) => mailing.id === id)!.state).toBe("finished");
    // A real send of it still needs its own test and its own typed count.
    expect(
      (await refusal(() => engine.startMailing(made.mailing.id, { practice: false, confirm: 3 })))
        .code,
    ).toBe("not_ready");
    // A second press makes a second draft.
    expect(engine.retryMailing(id).mailing.id).not.toBe(made.mailing.id);
  });

  it("refuses when there is nobody to retry, nobody left on the lists, or nothing was sent for real", async () => {
    const engine = open();
    await setUp(engine);
    const { id, list } = await sendTo(engine, "Intro", 2);
    expect(await refusal(() => engine.retryMailing(id))).toMatchObject({
      status: 409,
      code: "nothing_to_retry",
      message: "Nobody here is waiting for a retry.",
    });
    provider.add(p(1), "delivered", 1);
    provider.add(p(2), "softBounces", 3);
    await engine.readDelivery("now");
    engine.removeRow(list, engine.listDetail(list, { q: p(2) }).rows[0]!.id);
    expect(await refusal(() => engine.retryMailing(id))).toMatchObject({
      status: 409,
      code: "not_on_lists",
      message: "The people to retry are no longer on this mailing's lists.",
    });
    const practice = await draft(engine, "Rehearsal", 2, "practice.example");
    engine.startMailing(practice.id, { practice: true });
    await drain(engine);
    expect(await refusal(() => engine.retryMailing(practice.id))).toMatchObject({
      status: 409,
      code: "practice",
      message: "Only a mailing sent for real has deliveries to retry.",
    });
    expect(await refusal(() => engine.retryMailing(practice.id.replace(/./g, "0")))).toMatchObject({
      status: 404,
      code: "not_found",
    });
    expect(await refusal(() => engine.retryMailing(`${id}`.slice(0, 8)))).toMatchObject({
      status: 404,
    });
  });
});

describe("13. what the answers carry", () => {
  it("puts delivery on the summaries, the recipient rows, the record and the mailing's own page", async () => {
    const engine = open();
    await setUp(engine);
    const { id } = await sendTo(engine, "Intro", 120);
    for (let index = 1; index <= 120; index += 1) {
      if (index % 40 === 0) provider.add(p(index), "hardBounces", 3, { reason: "550 gone" });
      else if (index === 7) provider.add(p(index), "softBounces", 3, { reason: "452 full" });
      else if (index === 9) provider.add(p(index), "deferred", 2);
      else if (index !== 11) provider.add(p(index), "delivered", 1);
    }
    provider.add(p(5), "spam", 5);
    const practice = await draft(engine, "Rehearsal", 2, "practice.example");
    engine.startMailing(practice.id, { practice: true });
    await drain(engine);
    await engine.readDelivery("now");

    const summaries = new Map(engine.mailings().mailings.map((mailing) => [mailing.id, mailing]));
    expect(summaries.get(id)!.delivery).toEqual({
      accepted: 120,
      delivered: 114,
      not_yet: 2,
      didnt_arrive: 4,
      hard_bounce: 3,
      complaint: 1,
      unsubscribed: 0,
      read_at: START,
      warning: "danger",
    });
    expect(summaries.get(practice.id)!.delivery).toBeNull();

    const rows = engine.mailingDetail(id, {}).recipients.rows;
    expect(rows[0]).toMatchObject({ email: p(1), state: "sent", delivery: "delivered" });
    expect(rows[4]!.delivery).toBe("complaint");
    expect(rows[6]!.delivery).toBe("soft_bounce");
    expect(rows[8]!.delivery).toBe("deferred");
    expect(rows[10]!.delivery).toBe("not_yet");
    expect(rows[39]!.delivery).toBe("hard_bounce");
    expect(
      engine.mailingDetail(practice.id, {}).recipients.rows.map((item) => item.delivery),
    ).toEqual([null, null]);

    const record = engine.outcomes(id).rows;
    expect(record[39]).toEqual({
      email: p(40),
      name: "P40",
      list: "Intro list",
      state: "sent",
      reason: "",
      at: START,
      delivery: "Hard bounce",
      delivery_reason: "550 gone",
      delivery_at: at(3),
    });
    expect(record[4]).toMatchObject({
      delivery: "Marked as spam",
      delivery_reason: "",
      delivery_at: at(5),
    });
    expect(record[10]).toMatchObject({
      delivery: "Not delivered yet",
      delivery_reason: "",
      delivery_at: "",
    });
    expect(engine.outcomes(practice.id).rows[0]).toMatchObject({
      delivery: "",
      delivery_reason: "",
      delivery_at: "",
    });

    const didnt = engine.mailingDelivery(id, {});
    expect(didnt.counts_by_view).toEqual({ didnt: 4, not_yet: 2, retry: 1, all: 120 });
    expect(didnt).toMatchObject({ offset: 0, limit: 100, total: 4, waiting_stops: 0 });
    expect(didnt.delivery).toMatchObject({
      mailing_id: id,
      name: "Intro",
      first_sent_at: START,
      last_sent_at: START,
      read_at: START,
      counts: { accepted: 120, delivered: 114, hard_bounce: 3, soft_bounce: 1, retry: 1 },
    });
    expect(didnt.rows.map((item) => item.email)).toEqual([p(7), p(40), p(80), p(120)]);
    expect(didnt.rows[1]).toEqual({
      email: p(40),
      name: "P40",
      list: "Intro list",
      sent_at: START,
      shown: "hard_bounce",
      delivery: "hard_bounce",
      delivery_at: at(3),
      reason: "550 gone",
      reaction: null,
      reaction_at: null,
      stop: { on: true, since: at(3), waiting: false },
    });
    expect(didnt.warnings.map((warning) => warning.key)).toEqual(["complaints", "hard_bounces"]);
    expect(engine.mailingDelivery(id, { view: "nonsense" }).total).toBe(4);
    expect(engine.mailingDelivery(id, { view: "not_yet" }).rows.map((item) => item.shown)).toEqual([
      "deferred",
      "not_yet",
    ]);
    expect(engine.mailingDelivery(id, { view: "retry" }).rows.map((item) => item.email)).toEqual([
      p(7),
    ]);
    const everyone = engine.mailingDelivery(id, { view: "all" });
    expect(everyone).toMatchObject({ total: 120, offset: 0 });
    expect(everyone.rows).toHaveLength(100);
    const rest = engine.mailingDelivery(id, { view: "all", offset: 100 });
    expect(rest.rows.map((item) => item.email)).toEqual(
      Array.from({ length: 20 }, (_, index) => p(index + 101)),
    );
    expect(rest.rows[19]!.stop.on).toBe(true);
    expect(everyone.rows[4]).toMatchObject({
      shown: "complaint",
      delivery: "delivered",
      reaction: "complaint",
      reaction_at: at(5),
      stop: { on: true },
    });

    // A practice mailing, and a live one not read yet, have no delivery to show.
    expect(engine.mailingDelivery(practice.id, {})).toMatchObject({
      delivery: null,
      warnings: [],
      rows: [],
      total: 0,
      counts_by_view: { didnt: 0, not_yet: 0, retry: 0, all: 0 },
      retry: { count: 0, on_stop_list: 0 },
    });
    expect(await refusal(() => engine.mailingDelivery("nobody", {}))).toMatchObject({
      status: 404,
    });
  });

  it("keeps a deleted mailing's file, named as it was, and counts it in the week", async () => {
    const engine = open();
    await setUp(engine);
    const { id } = await sendTo(engine, "Soon gone", 2);
    provider.add(p(1), "delivered", 1);
    provider.add(p(2), "hardBounces", 3);
    await engine.readDelivery("now");
    engine.deleteMailing(id);
    later(60_000);
    const restarted = open();
    await restarted.readDelivery("now");
    expect(fileOf(id)).toMatchObject({ name: "Soon gone", read_at: START });
    expect(restarted.deliveryOverview().week.counts).toMatchObject({
      accepted: 2,
      delivered: 1,
      hard_bounce: 1,
    });
  });
});
