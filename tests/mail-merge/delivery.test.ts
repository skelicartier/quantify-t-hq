// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { WALK_KEY, WalkProvider, resetWalkEvents } from "../../scripts/mail-merge/e2e-provider";
import { MergeEngine } from "../../scripts/mail-merge/engine";
import type { OutgoingMail } from "../../scripts/mail-merge/provider";
import {
  COMPLAINTS_HINT,
  walkDeliveryEventsOf,
  type AppliedStop,
  type MailingDeliveryFile,
} from "@/lib/merge/delivery-contracts";

/**
 * The whole of the spec's §5.6 on the stand-in provider, as the Data stand-in seeds it:
 * 290 invented people (fund 1 to 290) written to for real, one read, and every number the
 * table gives. The provider is the walk's own; nothing leaves this process.
 */

const PEOPLE = 290;
const person = (n: number) => `partner${n}@fund${n}.example`;

let dir: string;
let engine: MergeEngine;
let mailingId: string;
const outbox: OutgoingMail[] = [];
let read: Awaited<ReturnType<MergeEngine["readDelivery"]>>;

beforeAll(async () => {
  resetWalkEvents();
  dir = mkdtempSync(join(tmpdir(), "hq-delivery-walk-"));
  engine = new MergeEngine({
    dir,
    liveProvider: (key) => new WalkProvider(key, (mail) => outbox.push(mail)),
    delivery: { pageGapMs: 0, pageSize: 500 },
  });
  engine.saveSettings({
    from_email: "founder@walk.example",
    from_name: "Walk Founder",
    reply_to: "founder@walk.example",
    footer: "",
    per_minute: 60,
    daily_cap: 5_000,
  });
  await engine.setKey({ key: WALK_KEY });
  const rows = ["Email,First Name,Company"];
  for (let n = 1; n <= PEOPLE; n += 1) rows.push(`${person(n)},Asha${n},Walk Fund ${n}`);
  const list = engine.importList({
    name: "Walk 01",
    file_name: "walk-01.csv",
    text: `${rows.join("\n")}\n`,
  }).list.id;
  mailingId = engine.createMailing({ name: "Walk live 01" }).mailing.id;
  engine.updateMailing(mailingId, {
    subject: "A note for {{company}}",
    body: "Hi {{first_name}},\n\nA short note.\n\nIf this isn't a fit, reply \"no\" and I won't follow up.",
    list_ids: [list],
  });
  await engine.testMailing(mailingId, { to: "founder@walk.example" });
  engine.startMailing(mailingId, { practice: false, confirm: PEOPLE });
  while ((await engine.step()) !== "finished");
  read = await engine.readDelivery("now");
}, 60_000);
afterAll(() => {
  resetWalkEvents();
  rmSync(dir, { recursive: true, force: true });
});

describe('"Walk live 01" on the stand-in provider (§5.6)', () => {
  it("was handed over whole, and read back in one read", () => {
    expect(outbox).toHaveLength(PEOPLE + 1);
    expect(read.outcome).toBe("ok");
    const file = JSON.parse(
      readFileSync(join(dir, "delivery/mailings", `${mailingId}.json`), "utf8"),
    ) as MailingDeliveryFile;
    expect(file.recipients.map((recipient) => recipient.email)).toEqual(
      Array.from({ length: PEOPLE }, (_, index) => person(index + 1)),
    );
    // Every kept event is the contract's own for that address, and nothing else was kept.
    let kept = 0;
    for (const recipient of file.recipients) {
      // The provider stamps a message a moment before the engine writes its outcome down,
      // so the times are the contract's to within that moment; the kinds and reasons exactly.
      const expected = walkDeliveryEventsOf(recipient.email, recipient.sent_at);
      expect(recipient.events.map(({ kind, reason }) => ({ kind, reason }))).toEqual(
        expected.map(({ kind, reason }) => ({ kind, reason })),
      );
      for (const [index, event] of recipient.events.entries())
        expect(Math.abs(Date.parse(event.at) - Date.parse(expected[index]!.at))).toBeLessThan(250);
      expect(recipient.message_id).toMatch(/^walk-\d+-\d+@walk\.invalid$/);
      kept += recipient.events.length;
    }
    expect(read.kept).toBe(kept);
    // 290 × requests; an open, a proxy load and a click for the 266 plain deliveries and for
    // the one who complained (the one who unsubscribed has none); the test's own five.
    expect(read.dropped).toBe(290 + 3 * 266 + 3 + 5);
    expect(read.pages).toBe(Math.floor((kept + read.dropped) / 500) + 1);
    const bytes = JSON.stringify(file);
    for (const never of ["opened", "clicks", "loadedByProxy", "requests", "founder@walk.example"])
      expect(bytes).not.toContain(never);
    expect(bytes).not.toMatch(/user unknown[^"]*@fund|<partner\d+@fund/);
  });

  it("counts what the table says: 268 of 290 delivered", () => {
    const page = engine.mailingDelivery(mailingId, {});
    expect(page.delivery!.counts).toEqual({
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
    });
    expect(page.counts_by_view).toEqual({ didnt: 21, not_yet: 1, retry: 12, all: 290 });
    expect(page.rows).toHaveLength(21);
    expect(engine.mailings().mailings[0]!.delivery).toMatchObject({
      accepted: 290,
      delivered: 268,
      not_yet: 1,
      didnt_arrive: 21,
      hard_bounce: 8,
      complaint: 1,
      unsubscribed: 1,
      warning: "danger",
    });
    const overview = engine.deliveryOverview();
    expect(overview.week.counts).toEqual(page.delivery!.counts);
    expect(overview.week.by_mailing).toEqual([
      { mailing_id: mailingId, name: "Walk live 01", hard_bounce: 8, complaint: 1 },
    ]);
    expect(overview.backlog).toEqual({ total: 0, would_add: 0, rows: [] });
  });

  it("put eleven addresses on the stop list, and nobody else", () => {
    const stops = new Map(engine.stops({}).stops.map((stop) => [stop.email, stop]));
    const hard = [36, 72, 108, 144, 180, 216, 252, 288].map(person);
    expect([...stops.keys()].sort()).toEqual([...hard, person(59), person(41), person(43)].sort());
    for (const email of hard)
      expect(stops.get(email)).toMatchObject({
        reason: "bounced",
        detail: "Hard bounce · Walk live 01",
      });
    expect(stops.get(person(59))).toMatchObject({
      reason: "bounced",
      detail: "Not a working address · Walk live 01",
    });
    expect(stops.get(person(41))).toMatchObject({
      reason: "asked",
      detail: "Marked as spam · Walk live 01",
    });
    expect(stops.get(person(43))).toMatchObject({
      reason: "asked",
      detail: "Unsubscribed · Walk live 01",
    });
    expect([...stops.values()].filter((stop) => stop.reason === "bounced")).toHaveLength(9);
    expect([...stops.values()].filter((stop) => stop.reason === "asked")).toHaveLength(2);
    const applied = readFileSync(join(dir, "delivery/applied.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as AppliedStop);
    expect(applied).toHaveLength(11);
    expect(applied.every((line) => line.result === "added" && line.how === "auto")).toBe(true);
    // The soft bounces, the delayed one, the blocked and the not sent are listed, never stopped.
    for (const n of [29, 58, 290, 47, 53, 61]) expect(stops.has(person(n)), String(n)).toBe(false);
    expect(engine.status().counts.stopped).toBe(11);
  });

  it("offers twelve for a retry, and makes a draft of them", () => {
    const page = engine.mailingDelivery(mailingId, { view: "retry" });
    expect(page.retry).toEqual({ count: 12, on_stop_list: 0 });
    expect(page.rows.map((row) => row.email).sort()).toEqual(
      [29, 58, 87, 116, 145, 174, 203, 232, 261, 290, 53, 61].map(person).sort(),
    );
    const before = outbox.length;
    const made = engine.retryMailing(mailingId);
    expect(made).toMatchObject({ picked: 12, not_on_lists: 0 });
    expect(made.mailing).toMatchObject({ name: "Walk live 01 (retry)", state: "draft" });
    expect(engine.mailingDetail(made.mailing.id, {}).audience.sendable).toBe(12);
    expect(outbox).toHaveLength(before);
    engine.deleteMailing(made.mailing.id);
  });

  it("says both warnings, word for word, and has paused nothing", () => {
    const page = engine.mailingDelivery(mailingId, {});
    expect(page.warnings).toEqual([
      {
        key: "complaints",
        level: "danger",
        title: "Spam complaints are at or over Gmail's and Yahoo's limit",
        body:
          "1 spam complaint from 268 delivered in this mailing: 0.37 per cent. Gmail asks senders to " +
          "keep complaints under 0.1 per cent and never to reach 0.3 per cent; Yahoo's limit is also " +
          "0.3 per cent. At about 290 a day, a single complaint is 0.34 per cent. Nothing has been " +
          "paused: you decide.",
      },
      {
        key: "hard_bounces",
        level: "attention",
        title: "More addresses bounced hard than is healthy",
        body:
          "8 of 290 accepted bounced hard in this mailing: 2.8 per cent. Under 2 per cent is healthy " +
          "and over 5 per cent is poor: a high rate tells mailbox providers a list is old or bought. " +
          "Nothing has been paused: you decide.",
      },
    ]);
    const week = engine.deliveryOverview().week.warnings;
    expect(week.map((warning) => warning.level)).toEqual(["danger", "attention"]);
    expect(week[0]!.body).toContain("in the last 7 days: 0.37 per cent");
    expect(week[1]!.body).toContain(
      "8 of 290 accepted bounced hard in the last 7 days: 2.8 per cent",
    );
    expect(COMPLAINTS_HINT).toContain("Gmail does not tell senders who complained");
    expect(engine.mailings().mailings[0]).toMatchObject({ state: "finished", pause_reason: null });
  });

  it("shows the hard bounce's reason without the address in it", () => {
    const row = engine
      .mailingDelivery(mailingId, {})
      .rows.find((item) => item.email === person(36))!;
    expect(row).toMatchObject({
      shown: "hard_bounce",
      reason: "550 5.1.1 <[address]>: user unknown",
      stop: { on: true, waiting: false },
    });
    expect(engine.outcomes(mailingId).rows[35]).toMatchObject({
      email: person(36),
      delivery: "Hard bounce",
      delivery_reason: "550 5.1.1 <[address]>: user unknown",
    });
  });
});
