// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
