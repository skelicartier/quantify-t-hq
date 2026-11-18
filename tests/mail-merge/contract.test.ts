// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { WALK_KEY, WalkProvider, resetWalkEvents } from "../../scripts/mail-merge/e2e-provider";
import { MergeEngine } from "../../scripts/mail-merge/engine";
import { createMergeServer } from "../../scripts/mail-merge/server";
import * as merge from "@/lib/merge/api";

/**
 * The portal's client and the sender, held to one another: every call the portal makes is
 * made here against the sender itself, over its socket, and every answer has to pass the
 * portal's own schema. A field renamed on one side and not the other fails here, not on
 * a screen.
 */
let dir: string;
let server: Server;
let engine: MergeEngine;

beforeAll(async () => {
  // A short path: a socket's name has a length limit, and the system's temp folder is deep.
  dir = mkdtempSync(join(tmpdir(), "hqmm-"));
  engine = new MergeEngine({ dir });
  server = createMergeServer(engine, false);
  const socket = join(dir, "s");
  await new Promise<void>((resolve) => server.listen(socket, resolve));
  process.env.HQ_MAIL_MERGE_SOCKET = socket;
});
afterAll(async () => {
  delete process.env.HQ_MAIL_MERGE_SOCKET;
  await new Promise((resolve) => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
});

describe("the portal and the sender agree", () => {
  it("on setup, lists, the stop list and a whole practice send", async () => {
    expect(merge.mergeConfigured()).toBe(true);
    const fresh = await merge.readMergeStatus();
    expect(fresh.provider).toMatchObject({ key_set: false, key_hint: "", sender_verified: false });

    const saved = await merge.saveMergeSettings({
      from_email: "Aaryan@Quantify.test",
      from_name: "Aaryan",
      per_minute: 30,
      daily_cap: 100,
    });
    expect(saved.settings).toMatchObject({ from_email: "aaryan@quantify.test", per_minute: 30 });

    const imported = await merge.importMergeList({
      name: "",
      file_name: "seed funds.csv",
      text: "Name,Firm,Email\nAsha Rao,Peak,asha@peak.test\nBen Ode,Nine,ben@nine.test\nNo One,Solo,\n",
    });
    expect(imported.list).toMatchObject({ name: "seed funds", people: 2, left_out: 1 });
    expect(imported.left_out).toEqual([{ line: 4, reason: "No address", value: "" }]);
    const listId = imported.list.id;
    expect((await merge.readMergeLists()).lists).toHaveLength(1);
    const detail = await merge.readMergeList(listId);
    expect(detail.rows.map((row) => row.values.first_name)).toEqual(["Asha", "Ben"]);
    expect((await merge.renameMergeList(listId, "Seed funds")).list.name).toBe("Seed funds");

    expect(await merge.addMergeStops("ben@nine.test nonsense", "asked")).toMatchObject({
      added: 1,
      already: 0,
      refused: ["nonsense"],
    });
    expect((await merge.readMergeStops()).stops[0]).toMatchObject({
      email: "ben@nine.test",
      reason: "asked",
    });
    expect((await merge.removeMergeStop("ben@nine.test")).removed).toBe("ben@nine.test");

    const mailing = (await merge.createMergeMailing("Intro")).mailing;
    await merge.updateMergeMailing(mailing.id, {
      subject: "Quantify Terminal x {{firm}}",
      body: "Hi {{first_name}},\n\nA note.",
      list_ids: [listId],
    });
    const draft = await merge.readMergeMailing(mailing.id, { preview: 1 });
    expect(draft.preview).toMatchObject({
      index: 1,
      total: 2,
      email: "ben@nine.test",
      subject: "Quantify Terminal x Nine",
    });
    expect(draft.checks.find((check) => check.key === "key")).toMatchObject({
      ok: false,
      blocking: true,
    });
    expect(draft.fields.map((field) => field.key)).toContain("first_name");

    await merge.startMergeMailing(mailing.id, { practice: true });
    await merge.pauseMergeMailing(mailing.id);
    await merge.resumeMergeMailing(mailing.id);
    while ((await engine.step()) !== "finished");
    const done = await merge.readMergeMailing(mailing.id, { state: "sent" });
    expect(done.mailing).toMatchObject({ state: "finished", mode: "practice" });
    expect(done.recipients).toMatchObject({ total: 2 });
    expect((await merge.readMergeOutcomes(mailing.id)).rows.map((row) => row.state)).toEqual([
      "sent",
      "sent",
    ]);
    expect((await merge.readMergeMailings()).mailings[0]!.progress.sent).toBe(2);

    const copy = (await merge.duplicateMergeMailing(mailing.id)).mailing;
    expect((await merge.deleteMergeMailing(copy.id)).deleted).toBe("Intro (copy)");
    expect((await merge.removeMergeRow(listId, "r1")).list.people).toBe(1);
    expect((await merge.readMergeStatus()).counts).toMatchObject({
      lists: 1,
      people: 1,
      mailings: 1,
    });
  });

  it("on picking people, typing addresses in and editing one person", async () => {
    const list = (
      await merge.importMergeList({
        name: "Picks",
        file_name: "picks.csv",
        text: "Name,Firm,Email,CheckFirst\nAsha Rao,Peak,asha@peak.test,\nBen Ode,Nine,ben@nine.test,Look first\n",
      })
    ).list;
    const mailing = (await merge.createMergeMailing("Chosen")).mailing;
    await merge.updateMergeMailing(mailing.id, {
      subject: "For {Firm}",
      body: "Hi {{first_name}}",
      list_ids: [list.id],
      hold_column: "checkfirst",
      pick_only: true,
      skip_written: true,
    });
    const fresh = await merge.readMergePeople(mailing.id);
    expect(fresh).toMatchObject({ total: 2, picked_total: 0, offset: 0 });
    expect(fresh.columns.map((column) => column.key)).toContain("firm");
    expect(fresh.rows.map((row) => row.kind)).toEqual(["ok", "held"]);
    expect((await merge.readMergePeople(mailing.id, { q: "peak" })).total).toBe(1);

    expect(
      await merge.pickMergePeople(mailing.id, { all: true, picked: true, q: "" }),
    ).toMatchObject({ picked: 1, changed: 1 });
    await merge.pickMergePeople(mailing.id, { emails: ["ben@nine.test"], picked: true });
    expect((await merge.readMergePeople(mailing.id, { view: "picked" })).total).toBe(2);

    const added = await merge.addMergePeople(mailing.id, {
      emails: "new@angel.test",
      values: { first_name: "New", firm: "Angel" },
    });
    expect(added).toEqual({ ok: true, added: 1, already: 0, stopped: 0, refused: [] });
    const detail = await merge.readMergeMailing(mailing.id);
    expect(detail.mailing).toMatchObject({ pick_only: true, picked_count: 3, skip_written: true });
    expect(detail.audience.sendable).toBe(3);
    expect(detail.message_fields.map((field) => field.key)).toEqual(["firm", "first_name"]);
    expect(detail.preview).toMatchObject({ list_id: list.id, row_id: "r1" });

    await merge.updateMergeRow(list.id, "r1", {
      email: "asha@peak.test",
      values: { first_name: "Asha R" },
    });
    const row = await merge.readMergeList(list.id, { q: "asha", row: "r1" });
    expect(row).toMatchObject({ total: 1, editing: { id: "r1" } });
    expect(row.editing?.values.first_name).toBe("Asha R");
    const person = await merge.addMergeRow(list.id, "third@peak.test", { firm: "Peak" });
    expect(person).toMatchObject({ row_id: "r3" });
    await merge.deleteMergeMailing(mailing.id);
    await merge.deleteMergeList(list.id);
  });

  it("on a refusal: the sender's own sentence reaches the portal as it was said", async () => {
    await expect(merge.createMergeMailing("")).rejects.toMatchObject({
      name: "MergeRequestError",
      status: 400,
      message: "Give the mailing a name.",
    });
    await expect(merge.readMergeMailing("not-there")).rejects.toMatchObject({ status: 404 });
    await expect(merge.checkProvider()).rejects.toMatchObject({ code: "no_key" });
    const draft = (await merge.createMergeMailing("Unready")).mailing;
    await expect(
      merge.startMergeMailing(draft.id, { practice: false, confirm: 0 }),
    ).rejects.toThrow("Write a subject and a message.");
    await expect(merge.testMergeMailing(draft.id, "me@quantify.test")).rejects.toMatchObject({
      code: "no_key",
    });
  });

  it("on there being no sender: unavailable, never an empty answer", async () => {
    const socket = process.env.HQ_MAIL_MERGE_SOCKET!;
    process.env.HQ_MAIL_MERGE_SOCKET = join(dir, "nobody-home");
    await expect(merge.readMergeStatus()).rejects.toBeInstanceOf(merge.MergeUnavailableError);
    delete process.env.HQ_MAIL_MERGE_SOCKET;
    expect(merge.mergeConfigured()).toBe(false);
    await expect(merge.readMergeLists()).rejects.toBeInstanceOf(merge.MergeUnavailableError);
    process.env.HQ_MAIL_MERGE_SOCKET = socket;
  });
});

/**
 * Delivery read back (delivery spec §6.12): the five new calls against a real sender whose
 * provider is the walk's stand-in, every answer through the portal's own schema; and the
 * portal that ships before the sender restarts, meeting a sender that knows none of it.
 */
describe("the portal and the sender agree on delivery", () => {
  let ownDir: string;
  let ownServer: Server;
  let sender: MergeEngine;
  let before: string | undefined;
  let mailingId: string;
  let practiceId: string;
  const person = (n: number) => `partner${n}@fund${n}.example`;

  beforeAll(async () => {
    resetWalkEvents();
    ownDir = mkdtempSync(join(tmpdir(), "hqmd-"));
    sender = new MergeEngine({
      dir: ownDir,
      liveProvider: (key) => new WalkProvider(key, () => undefined),
      delivery: { pageGapMs: 0, minGapMs: 0 },
    });
    ownServer = createMergeServer(sender, false);
    const socket = join(ownDir, "s");
    await new Promise<void>((resolve) => ownServer.listen(socket, resolve));
    before = process.env.HQ_MAIL_MERGE_SOCKET;
    process.env.HQ_MAIL_MERGE_SOCKET = socket;
  });
  afterAll(async () => {
    if (before === undefined) delete process.env.HQ_MAIL_MERGE_SOCKET;
    else process.env.HQ_MAIL_MERGE_SOCKET = before;
    await new Promise((resolve) => ownServer.close(resolve));
    resetWalkEvents();
    rmSync(ownDir, { recursive: true, force: true });
  });

  it("before a key: nothing to read, said in the sender's own words", async () => {
    const overview = await merge.readMergeDelivery();
    expect(overview.read).toMatchObject({ key_set: false, last_read_at: null, next_at: null });
    expect(overview.week.counts.accepted).toBe(0);
    expect(overview.backlog).toEqual({ total: 0, would_add: 0, rows: [] });
    await expect(merge.checkMergeDelivery({ wait: true })).rejects.toMatchObject({
      name: "MergeRequestError",
      status: 409,
      code: "no_key",
      message: "Delivery is read with the provider key. Add it in Setup.",
    });
    await expect(merge.applyMergeDeliveryBacklog(0)).rejects.toMatchObject({ code: "nothing" });
  });

  it("on a live send read back: the overview, the mailing's delivery, the record and a retry", async () => {
    await merge.saveMergeSettings({
      from_email: "founder@walk.example",
      from_name: "Walk Founder",
      per_minute: 60,
      daily_cap: 5_000,
    });
    await merge.setProviderKey(WALK_KEY);
    const rows = ["Email,First Name,Company"];
    for (let n = 1; n <= 60; n += 1) rows.push(`${person(n)},Asha${n},Walk Fund ${n}`);
    const list = (
      await merge.importMergeList({
        name: "Walk 01",
        file_name: "walk-01.csv",
        text: rows.join("\n"),
      })
    ).list;
    mailingId = (await merge.createMergeMailing("Walk live 01")).mailing.id;
    await merge.updateMergeMailing(mailingId, {
      subject: "A note for {{company}}",
      body: "Hi {{first_name}},\n\nA note. If this isn't a fit, reply \"no\" and I won't follow up.",
      list_ids: [list.id],
    });
    await merge.testMergeMailing(mailingId, "founder@walk.example");
    const started = await merge.startMergeMailing(mailingId, { practice: false, confirm: 60 });
    expect(started.mailing.delivery).toBeNull();
    while ((await sender.step()) !== "finished");
    practiceId = (await merge.createMergeMailing("Rehearsal")).mailing.id;
    await merge.updateMergeMailing(practiceId, {
      subject: "Practice",
      body: "Hi {{first_name}}",
      list_ids: [list.id],
      skip_written: false,
    });
    await merge.startMergeMailing(practiceId, { practice: true });
    while ((await sender.step()) !== "finished");

    const unread = await merge.readMergeMailingDelivery(mailingId);
    expect(unread).toMatchObject({ delivery: null, warnings: [], rows: [], total: 0 });
    await expect(merge.checkMergeDelivery({ mailing_id: "nobody" })).rejects.toMatchObject({
      status: 404,
    });
    await expect(merge.checkMergeDelivery({ mailing_id: practiceId })).rejects.toMatchObject({
      code: "practice",
    });

    const checked = await merge.checkMergeDelivery({ mailing_id: mailingId, wait: true });
    expect(checked).toMatchObject({ started: true, reading: false, days: 8 });
    expect(checked.read).toMatchObject({ key_set: true, outcome: "ok", scope: "now", days: 8 });
    expect(checked.read.kept).toBeGreaterThan(50);

    // Fund 1 to 60: 36 a hard bounce, 29 and 58 soft, 41 a complaint, 43 unsubscribed,
    // 47 delayed, 53 blocked, 59 not a working address; the other 52 delivered.
    const overview = await merge.readMergeDelivery();
    expect(overview.week.counts).toEqual({
      accepted: 60,
      delivered: 54,
      not_yet: 1,
      soft_bounce: 2,
      hard_bounce: 1,
      blocked: 1,
      invalid: 1,
      error: 0,
      didnt_arrive: 5,
      complaint: 1,
      unsubscribed: 1,
      retry: 3,
    });
    expect(overview.week.warnings.map((warning) => warning.key)).toEqual(["complaints"]);
    expect(overview.week.by_mailing).toEqual([
      { mailing_id: mailingId, name: "Walk live 01", hard_bounce: 1, complaint: 1 },
    ]);
    expect(overview.read.next_at).not.toBeNull();

    const page = await merge.readMergeMailingDelivery(mailingId);
    expect(page.mailing).toEqual({
      id: mailingId,
      name: "Walk live 01",
      state: "finished",
      mode: "live",
    });
    expect(page.delivery?.counts).toEqual(overview.week.counts);
    expect(page.counts_by_view).toEqual({ didnt: 5, not_yet: 1, retry: 3, all: 60 });
    expect(page.retry).toEqual({ count: 3, on_stop_list: 0 });
    expect(page.waiting_stops).toBe(0);
    expect(page.rows.map((row) => row.shown).sort()).toEqual(
      ["blocked", "hard_bounce", "invalid", "soft_bounce", "soft_bounce"].sort(),
    );
    expect(page.rows.find((row) => row.email === person(36))).toMatchObject({
      name: "Asha36",
      list: "Walk 01",
      delivery: "hard_bounce",
      reason: "550 5.1.1 <[address]>: user unknown",
      reaction: null,
      stop: { on: true, waiting: false },
    });
    const everyone = await merge.readMergeMailingDelivery(mailingId, { view: "all", offset: 40 });
    expect(everyone).toMatchObject({ offset: 40, limit: 100, total: 60 });
    expect(everyone.rows).toHaveLength(20);
    expect(everyone.rows[0]).toMatchObject({
      email: person(41),
      shown: "complaint",
      delivery: "delivered",
      reaction: "complaint",
    });
    expect(
      (await merge.readMergeMailingDelivery(mailingId, { view: "not_yet" })).rows,
    ).toHaveLength(1);

    const mailings = (await merge.readMergeMailings()).mailings;
    expect(mailings.find((mailing) => mailing.id === mailingId)!.delivery).toMatchObject({
      accepted: 60,
      delivered: 54,
      didnt_arrive: 5,
      hard_bounce: 1,
      complaint: 1,
      unsubscribed: 1,
      warning: "danger",
    });
    expect(mailings.find((mailing) => mailing.id === practiceId)!.delivery).toBeNull();
    const detail = await merge.readMergeMailing(mailingId);
    expect(detail.recipients.rows[35]).toMatchObject({
      email: person(36),
      delivery: "hard_bounce",
    });
    expect(detail.recipients.rows[0]!.delivery).toBe("delivered");
    expect((await merge.readMergeMailing(practiceId)).recipients.rows[0]!.delivery).toBeNull();
    const record = (await merge.readMergeOutcomes(mailingId)).rows;
    expect(record[35]).toMatchObject({
      delivery: "Hard bounce",
      delivery_reason: "550 5.1.1 <[address]>: user unknown",
    });
    expect(record[35]!.delivery_at).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(record[46]).toMatchObject({ delivery: "Delayed" });

    const stops = (await merge.readMergeStops()).stops;
    expect(stops.map((stop) => stop.email).sort()).toEqual([36, 41, 43, 59].map(person).sort());
    expect(stops.find((stop) => stop.email === person(36))).toMatchObject({
      reason: "bounced",
      detail: "Hard bounce · Walk live 01",
    });

    const retry = await merge.makeMergeRetryMailing(mailingId);
    expect(retry).toMatchObject({ picked: 3, not_on_lists: 0 });
    expect(retry.mailing).toMatchObject({
      name: "Walk live 01 (retry)",
      state: "draft",
      delivery: null,
    });
    expect((await merge.readMergeMailing(retry.mailing.id)).mailing).toMatchObject({
      pick_only: true,
      picked_count: 3,
      skip_written: false,
    });
    await expect(merge.makeMergeRetryMailing(practiceId)).rejects.toMatchObject({
      code: "practice",
      message: "Only a mailing sent for real has deliveries to retry.",
    });
    await expect(merge.applyMergeDeliveryBacklog(3)).rejects.toMatchObject({
      status: 409,
      code: "nothing",
      message: "Nothing is waiting for the stop list.",
    });
  });
});

describe("a portal that ships before the sender restarts", () => {
  let oldDir: string;
  let oldServer: Server;
  let before: string | undefined;
  const OLD_MAILING = {
    id: "m-old",
    name: "Investors",
    subject: "A note",
    state: "finished",
    mode: "live",
    pause_reason: null,
    lists: [{ id: "l1", name: "Investors", people: 2 }],
    progress: {
      total: 2,
      sent: 2,
      failed: 0,
      skipped: 0,
      unknown: 0,
      waiting: 0,
      stopped_since: 0,
    },
    created_at: "2026-11-06T04:00:00.000Z",
    updated_at: "2026-11-06T04:30:00.000Z",
    started_at: "2026-11-06T04:00:00.000Z",
    finished_at: "2026-11-06T04:30:00.000Z",
    editable: false,
  };

  beforeAll(async () => {
    oldDir = mkdtempSync(join(tmpdir(), "hqmo-"));
    // The sender as it was before the read-back: its answers have none of the new fields,
    // and nothing answers at the new paths.
    oldServer = createServer((request, response) => {
      const send = (status: number, body: unknown) =>
        response
          .writeHead(status, { "content-type": "application/json" })
          .end(JSON.stringify(body));
      if (request.url === "/mailings") return send(200, { ok: true, mailings: [OLD_MAILING] });
      if (request.url === "/mailings/m-old/outcomes")
        return send(200, {
          ok: true,
          name: "Investors",
          mode: "live",
          rows: [
            {
              email: "partner1@fund1.example",
              name: "Asha",
              list: "Investors",
              state: "sent",
              reason: "",
              at: "2026-11-06T04:01:00.000Z",
            },
          ],
        });
      return send(404, {
        ok: false,
        error: { code: "no_such_route", message: "Nothing answers there." },
      });
    });
    const socket = join(oldDir, "s");
    await new Promise<void>((resolve) => oldServer.listen(socket, resolve));
    before = process.env.HQ_MAIL_MERGE_SOCKET;
    process.env.HQ_MAIL_MERGE_SOCKET = socket;
  });
  afterAll(async () => {
    if (before === undefined) delete process.env.HQ_MAIL_MERGE_SOCKET;
    else process.env.HQ_MAIL_MERGE_SOCKET = before;
    await new Promise((resolve) => oldServer.close(resolve));
    rmSync(oldDir, { recursive: true, force: true });
  });

  it("still reads the old sender's mailings and record, which have no delivery in them", async () => {
    const mailings = (await merge.readMergeMailings()).mailings;
    expect(mailings).toHaveLength(1);
    expect(mailings[0]!.delivery).toBeUndefined();
    const record = await merge.readMergeOutcomes("m-old");
    expect(record.rows[0]).toMatchObject({ email: "partner1@fund1.example", state: "sent" });
    expect(record.rows[0]!.delivery).toBeUndefined();
  });

  it("is told plainly that nothing answers at the new paths", async () => {
    for (const ask of [
      () => merge.readMergeDelivery(),
      () => merge.readMergeMailingDelivery("m-old"),
      () => merge.checkMergeDelivery({ wait: true }),
      () => merge.applyMergeDeliveryBacklog(0),
      () => merge.makeMergeRetryMailing("m-old"),
    ]) {
      const error = await ask().then(
        () => null,
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(merge.MergeRequestError);
      expect(error).toMatchObject({ status: 404, code: "no_such_route" });
    }
  });
});
