// @vitest-environment node
import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { localDay } from "../../scripts/data/days";
import { SenderFiles, readWrittenSince } from "../../scripts/data/sender-files";
import { MergeEngine, type StepResult } from "../../scripts/mail-merge/engine";
import type {
  AccountCheck,
  Blocked,
  MailProvider,
  OutgoingMail,
  SendResult,
  SenderCheck,
} from "../../scripts/mail-merge/provider";

const KEY = "xkeysib-test-0000000000000000000000000000000000000000-abcd";

/** A provider that remembers what it was handed and says every message was sent. */
class Scripted implements MailProvider {
  readonly kind = "live" as const;
  sent: OutgoingMail[] = [];
  async send(mail: OutgoingMail): Promise<SendResult> {
    this.sent.push(mail);
    return {
      status: "sent",
      message_id: `<${this.sent.length}@test>`,
      error_code: "",
      retry_after_seconds: null,
    };
  }
  async checkAccount(): Promise<AccountCheck> {
    return {
      status: "ok",
      email: "founder@walk.example",
      company: "Walk",
      plan: "free",
      credits: 300,
    };
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
}

let dir: string;
let provider: Scripted;
let clock: Date;

const open = () =>
  new MergeEngine({ dir, now: () => new Date(clock), liveProvider: () => provider });

async function drain(engine: MergeEngine): Promise<StepResult[]> {
  const seen: StepResult[] = [];
  for (let index = 0; index < 100; index += 1) {
    const outcome = await engine.step();
    seen.push(outcome);
    if (outcome === "idle" || outcome === "paused" || outcome === "finished") break;
    if (outcome === "waiting") clock = new Date(clock.getTime() + 60_000);
    clock = new Date(clock.getTime() + 1_000);
  }
  return seen;
}

const CSV = [
  "First Name,Company,Email",
  "Asha,Peak Capital,asha@peak.example",
  "Ben,Nine Ventures,ben@nine.example",
  "Chandra,Solo Fund,chandra@solo.example",
].join("\n");

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hqsf-"));
  provider = new Scripted();
  clock = new Date("2026-11-10T04:00:00.000Z");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("the sender readers against the real engine", () => {
  it("see the lists, the live sends, the stop and the message as the provider got it", async () => {
    const engine = open();
    engine.saveSettings({
      from_email: "founder@walk.example",
      from_name: "Walk Founder",
      reply_to: "replies@walk.example",
      footer: "If this isn't a fit, reply \"no\" and I won't follow up.",
      per_minute: 60,
      daily_cap: 100,
    });
    await engine.setKey({ key: KEY });
    const list = engine.importList({ name: "Walk 01", file_name: "walk-01.csv", text: CSV }).list;

    // A practice run first: it must never show as sent.
    const practice = engine.createMailing({ name: "Practice" }).mailing;
    engine.updateMailing(practice.id, {
      subject: "Practice for {{company}}",
      body: "Hi {{first_name}},\n\nJust practising.",
      list_ids: [list.id],
    });
    engine.startMailing(practice.id, { practice: true });
    expect((await drain(engine)).at(-1)).toBe("finished");
    expect(provider.sent).toHaveLength(0);

    const live = engine.createMailing({ name: "Walk live" }).mailing;
    engine.updateMailing(live.id, {
      subject: "A note for {{company}}",
      body: "Hi {{first_name}},\n\nA short note, in the words of a person.\n\nDeck: https://deck.walk.example/latest",
      list_ids: [list.id],
    });
    // A live send needs a test of the wording first; the test counts in Mail merge's day and
    // goes to tests.jsonl, never to the written log.
    await engine.testMailing(live.id, { to: "founder@walk.example" });
    engine.startMailing(live.id, { practice: false, confirm: 3 });
    expect((await drain(engine)).at(-1)).toBe("finished");
    expect(provider.sent.map((mail) => mail.to_email)).toEqual([
      "founder@walk.example",
      "asha@peak.example",
      "ben@nine.example",
      "chandra@solo.example",
    ]);
    provider.sent.shift(); // the test send: not what any lead received
    expect(engine.status().sent_today).toBe(4); // Mail merge counts the test in its day's limit
    engine.addStops({ emails: "ben@nine.example", reason: "asked" });

    const files = new SenderFiles(dir);
    expect(files.lists().map((item) => [item.name, item.rows.length])).toEqual([["Walk 01", 3]]);
    expect(files.listRows(list.id)?.map((row) => row.email)).toEqual([
      "asha@peak.example",
      "ben@nine.example",
      "chandra@solo.example",
    ]);
    expect(files.listRows("nope")).toBeNull();
    // Three live sends and not one practice line.
    expect(files.written().map((line) => line.email)).toEqual([
      "asha@peak.example",
      "ben@nine.example",
      "chandra@solo.example",
    ]);
    expect(new Set(files.written().map((line) => line.mailing_id))).toEqual(new Set([live.id]));
    // Data's "sent today" is the written log's count: the test send and the practice run are not in it.
    expect(files.sentOn(localDay(clock))).toBe(3);
    expect(files.stops().map((stop) => [stop.email, stop.reason])).toEqual([
      ["ben@nine.example", "asked"],
    ]);
    expect(files.isStopped("ben@nine.example")).toBe(true);
    expect(files.isStopped("asha@peak.example")).toBe(false);
    expect(
      files
        .mailings()
        .map((mailing) => mailing.name)
        .sort(),
    ).toEqual(["Practice", "Walk live"]);
    expect(files.sending()).toBeNull();
    expect(files.settings()).toEqual({
      from_email: "founder@walk.example",
      from_name: "Walk Founder",
      reply_to: "replies@walk.example",
    });

    // What was sent is the exact message the provider received, rendered again from the frozen run.
    const sent = files.sentMail("asha@peak.example");
    expect(sent).toHaveLength(1);
    const first = sent[0]!;
    expect(first.gone).toBe(false);
    if (first.gone) throw new Error("unreachable");
    const handed = provider.sent[0]!;
    expect(first.subject).toBe(handed.subject);
    expect(first.text).toBe(handed.text);
    expect(first.subject).toBe("A note for Peak Capital");
    expect(first.text).toContain("Hi Asha,");
    expect(first.text).toContain("If this isn't a fit");
    expect(first.from).toBe("Walk Founder <founder@walk.example>");
    expect(first.reply_to).toBe("replies@walk.example");
    expect(first.to).toBe("asha@peak.example");
    expect(first.state).toBe("sent");
    expect(first.mailing).toBe("Walk live");
    const run = files.runFor(live.id, "ben@nine.example");
    expect(run).not.toBeNull();
    expect(run).not.toBe("gone");
    if (run && run !== "gone") expect(run.outcome.state).toBe("sent");
    expect(files.runFor(practice.id, "asha@peak.example")).toBeNull();
    expect(files.sentMail("nobody@walk.example")).toEqual([]);

    // A deleted mailing: the written record outlives it, and says the run is gone.
    engine.deleteMailing(live.id);
    files.poll();
    const afterDelete = files.sentMail("asha@peak.example");
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0]).toMatchObject({ gone: true, mailing_id: live.id, state: "sent" });
    files.close();
  });

  it("read the written log incrementally, deduplicated, with a torn line held back", () => {
    const path = join(dir, "written.jsonl");
    const files = new SenderFiles(dir);
    expect(files.written()).toEqual([]);
    const lines = [
      {
        email: "asha@peak.example",
        mailing_id: "m1",
        mailing: "One",
        at: "2026-11-10T04:00:00.000Z",
      },
      {
        email: "ben@nine.example",
        mailing_id: "m1",
        mailing: "One",
        at: "2026-11-10T04:01:00.000Z",
      },
    ];
    appendFileSync(path, lines.map((line) => JSON.stringify(line)).join("\n") + "\n");
    let changes = files.poll();
    expect(changes.written.map((line) => line.email)).toEqual([
      "asha@peak.example",
      "ben@nine.example",
    ]);
    expect(files.poll().written).toEqual([]); // nothing new: nothing said

    // A torn last line: held back until it is whole.
    const third = {
      email: "chandra@solo.example",
      mailing_id: "m1",
      mailing: "One",
      at: "2026-11-10T04:02:00.000Z",
    };
    const text = JSON.stringify(third);
    appendFileSync(path, text.slice(0, 20));
    expect(files.poll().written).toEqual([]);
    appendFileSync(path, `${text.slice(20)}\n`);
    changes = files.poll();
    expect(changes.written).toEqual([third]);

    // The same mailing and address again (a restart replayed a line): counted once.
    appendFileSync(path, `${JSON.stringify(third)}\n`);
    expect(files.poll().written).toEqual([]);
    expect(files.written()).toHaveLength(3);
    expect(files.writtenFor("chandra@solo.example")).toHaveLength(1);

    // The raw reader's offset stops before a torn line too.
    const raw = readWrittenSince(path, 0);
    expect(raw.lines).toHaveLength(4);
    appendFileSync(path, '{"email":"dee@fund.example"');
    const again = readWrittenSince(path, raw.offset);
    expect(again).toEqual({ lines: [], offset: raw.offset });
    files.close();
  });

  it("notice a changed list and a changed stop list within one poll", () => {
    const engine = open();
    const files = new SenderFiles(dir);
    let told: string[] = [];
    const stop = files.watch((changes) => {
      told = [...told, ...changes.lists, ...(changes.stops ? ["stops"] : [])];
    });
    const list = engine.importList({ name: "Walk 01", file_name: "walk-01.csv", text: CSV }).list;
    engine.addStops({ emails: "chandra@solo.example", reason: "manual" });
    const changes = files.poll();
    expect(changes.lists).toEqual([list.id]);
    expect(changes.stops).toBe(true);
    expect(changes.mailings).toBe(false);
    expect(told).toEqual([list.id, "stops"]);
    engine.renameList(list.id, { name: "Walk 01 renamed" });
    expect(files.poll().lists).toEqual([list.id]);
    expect(files.list(list.id)?.name).toBe("Walk 01 renamed");
    engine.deleteList(list.id);
    expect(files.poll().lists).toEqual([list.id]);
    expect(files.lists()).toEqual([]);
    stop();
    files.close();
  });
});
