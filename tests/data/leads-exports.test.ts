// @vitest-environment node
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Lead } from "../../scripts/data/leads/build";
import { TRACKER_COLUMNS, VIEW_COLUMNS, trackerStatus } from "../../scripts/data/leads/exports";
import { leadIdOf } from "../../scripts/data/leads/types";
import { leadFileText } from "../../scripts/data/leads/walk-seed";
import type { Stop } from "../../scripts/data/sender-files";
import type { WaitlistService } from "../../scripts/data/leads/contracts";
import { parseCsv } from "../../src/lib/crm/csv";
import { WALKER, peopleCsv, readyToSend, sendLive, startKit, type Kit } from "./leads-kit";

/**
 * The downloads and the Mail merge list made from a view: the exact columns, the
 * founder's tracker words, formulas defused, a byte-order mark, the export ledger, and a
 * list that holds 5,000 at most and never anyone on the stop list.
 */

let kit: Kit;
let walk01 = "";
let sourceId = "";
const BIG = 6_000;

const waitlist: WaitlistService = {
  joinFromReply: ({ lead }) => ({
    entry_id: randomUUID(),
    created: true,
    firm: lead.company,
    unsent: 0,
    href: "/data/waitlist/x",
  }),
  forEmail: () => null,
  forFirm: () => null,
  stageCounts: () => ({
    joined: 0,
    call_booked: 0,
    call_held: 0,
    pilot: 0,
    customer: 0,
    dropped: 0,
  }),
  usedFor: () => [],
};

beforeAll(async () => {
  kit = await startKit({
    before: async (engine, files, dir) => {
      await readyToSend(engine);
      const people = Array.from({ length: 290 }, (_, index) => ({
        email: `partner${index + 1}@fund${index + 1}.example`,
        company: index === 0 ? "=SUM(1+1)" : `Walk Fund ${index + 1}`,
      }));
      walk01 = engine.importList({
        name: "Walk 01",
        file_name: "walk-01.csv",
        text: peopleCsv(people),
      }).list.id;
      await sendLive(engine, walk01, "Walk live 01");
      engine.addStops({
        emails: "partner2@fund2.example partner3@fund3.example partner4@fund4.example",
        reason: "asked",
      });
      const file = files.add("all_leads.csv", leadFileText(0, BIG));
      sourceId = randomUUID();
      mkdirSync(join(dir, "data", "leads"), { recursive: true });
      writeFileSync(
        join(dir, "data", "leads", "sources.json"),
        JSON.stringify([
          {
            source_id: sourceId,
            file_id: file.file_id,
            role: "leads",
            reason: "",
            added_at: new Date().toISOString(),
            added_by: WALKER,
            state: "waiting",
            detail: "",
            title: file.title,
            read: null,
          },
        ]),
      );
    },
  });
  kit.core.provide("waitlist", waitlist);
  const record = (email: string, outcome: string, extra: Record<string, unknown> = {}) =>
    kit.ask("POST", "/data/replies", {
      by: WALKER,
      email,
      outcome,
      words: "Invented.",
      subject: "Re",
      add_if_missing: false,
      ...extra,
    });
  await record("partner10@fund10.example", "replied_positive");
  await record("partner11@fund11.example", "not_interested");
  await record("partner12@fund12.example", "not_now");
  await record("partner13@fund13.example", "question");
  await record("partner14@fund14.example", "wrong_person");
}, 60_000);
afterAll(() => kit.close());

function rowsOf(text: string): { header: string[]; rows: Record<string, string>[] } {
  const table = parseCsv(text);
  return {
    header: table.header,
    rows: table.rows.map((cells) =>
      Object.fromEntries(table.header.map((key, index) => [key, cells[index] ?? ""])),
    ),
  };
}

describe("This view", () => {
  it("is every matching lead with the spec's columns, a byte-order mark and formulas defused (L8)", async () => {
    const view = (await kit.ask("GET", `/data/leads?batch=${walk01}`)).body as { total: number };
    expect(view.total).toBe(290);
    const text = await kit.build("leads_csv", { query: `batch=${walk01}` });
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const { header, rows } = rowsOf(text);
    expect(header).toEqual([...VIEW_COLUMNS]);
    expect(header.join(",")).toBe(
      "email,name,first_name,last_name,title,company,firm_type,website,country,city,phone,registration_no,source,source_url,email_kind,notes,status,status_detail,first_written_on,last_written_on,times_written,last_mailing,batches,reply,reply_on,held_reason,stop_reason,tags",
    );
    expect(rows).toHaveLength(290);
    const first = rows.find((row) => row.email === "partner1@fund1.example")!;
    expect(first.company).toBe("'=SUM(1+1)");
    expect(first).toMatchObject({
      status: "Sent",
      times_written: "1",
      last_mailing: "Walk live 01",
      batches: "Walk 01",
    });
    expect(rows.find((row) => row.email === "partner2@fund2.example")).toMatchObject({
      status: "Stopped",
      stop_reason: "Asked to stop",
    });
    expect(rows.find((row) => row.email === "partner12@fund12.example")).toMatchObject({
      status: "Later",
      reply: "Not now",
    });
    const ledger = kit.module.records.exports();
    expect(ledger.at(-1)).toMatchObject({
      kind: "this_view",
      view: `batch=${walk01}`,
      rows: 290,
      by: WALKER,
    });
  });
});

describe("The old tracker", () => {
  it("has his header and his words for every status (L9)", async () => {
    const text = await kit.build("leads_tracker");
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const { header, rows } = rowsOf(text);
    expect(header.join(",")).toBe(
      "status,sent_on,sent_in,batch,email,name,company,firm_type,country",
    );
    expect(header).toEqual([...TRACKER_COLUMNS]);
    expect(rows).toHaveLength(290 + BIG);
    const word = (email: string) => rows.find((row) => row.email === email)?.status;
    expect(word("partner1@fund1.example")).toBe("Sent");
    expect(word("partner2@fund2.example")).toBe("Asked to stop");
    expect(word("partner10@fund10.example")).toBe("Joined waitlist");
    expect(word("partner11@fund11.example")).toBe("Said no");
    expect(word("partner12@fund12.example")).toBe("Replied: later");
    expect(word("partner13@fund13.example")).toBe("Replied: question");
    expect(word("partner14@fund14.example")).toBe("Replied: wrong person");
    expect(word("asha.rao0@firm0.example")).toBe("Not sent yet");
    const sent = rows.find((row) => row.email === "partner1@fund1.example")!;
    expect(sent.sent_in).toBe("Walk live 01");
    expect(sent.sent_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sent.batch).toBe("Walk 01");
    expect(kit.module.records.exports().at(-1)).toMatchObject({ kind: "tracker", rows: 290 + BIG });
  });

  it("words held back, bounced and other stops as his tracker did", () => {
    const lead = (status: Lead["status"], detail = "", email = "x@y.example") =>
      ({ status, detail, email }) as Lead;
    const stops = new Map<string, Stop>([
      ["b@y.example", { email: "b@y.example", reason: "bounced", detail: "", at: "" }],
      ["m@y.example", { email: "m@y.example", reason: "manual", detail: "", at: "" }],
      ["k@y.example", { email: "k@y.example", reason: "blocked", detail: "", at: "" }],
    ]);
    expect(trackerStatus(lead("held_back", "Not a buyer"), stops)).toBe("Held back: not a buyer");
    expect(trackerStatus(lead("held_back", "Firm already joined"), stops)).toBe(
      "Held back: firm already joined",
    );
    expect(trackerStatus(lead("held_back", "Competitor"), stops)).toBe("Held back: Competitor");
    expect(trackerStatus(lead("stopped", "", "b@y.example"), stops)).toBe("Bounced");
    expect(trackerStatus(lead("stopped", "", "m@y.example"), stops)).toBe("Stopped");
    expect(trackerStatus(lead("stopped", "", "k@y.example"), stops)).toBe("Stopped");
  });
});

describe("Make a Mail merge list", () => {
  it("makes a list of the view's people, leaving out the stopped (L10)", async () => {
    const before = kit.engine.lists().lists.length;
    const made = await kit.ask("POST", "/data/leads/to-mail-merge", {
      by: WALKER,
      query: `batch=${walk01}`,
      name: "Walk 01 again",
    });
    expect(made.status).toBe(200);
    // 290 in the view, three on the stop list and one who said no (on it too).
    expect(made.body.list).toMatchObject({ name: "Walk 01 again", people: 286 });
    const lists = kit.engine.lists().lists;
    expect(lists).toHaveLength(before + 1);
    const list = lists.find((item) => item.name === "Walk 01 again")!;
    expect(list.people).toBe(286);
    const rows = kit.engine.listDetail(list.id, {}).rows;
    expect(rows.some((row) => row.email === "partner2@fund2.example")).toBe(false);
    expect(rows[0]?.values).toMatchObject({ company: expect.any(String) as string });
    // The new list is read back into the index: its people now have two batches.
    await kit.settle();
    const lead = kit.leads.byEmail("partner5@fund5.example")!;
    expect(lead.batches).toEqual(["Walk 01", "Walk 01 again"]);
  });

  it("refuses more than 5,000, and a view of only the stopped", async () => {
    const tooMany = await kit.ask("POST", "/data/leads/to-mail-merge", {
      by: WALKER,
      query: `source=${sourceId}`,
      name: "Everyone",
    });
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error).toEqual({
      code: "too_many",
      message: "This view has 6,000 leads; a list made here holds 5,000. Narrow it first.",
    });
    const stopped = await kit.ask("POST", "/data/leads/to-mail-merge", {
      by: WALKER,
      query: "status=stopped",
      name: "Stopped",
    });
    expect(stopped.status).toBe(409);
    expect(stopped.body.error).toEqual({
      code: "all_stopped",
      message: "Everyone in this view is on the stop list.",
    });
  });
});

describe("Removing a source", () => {
  it("is refused while a lead only it brings has a note, and allowed after", async () => {
    const only = kit.leads.byEmail("asha.rao0@firm0.example")!;
    const preview = await kit.ask("GET", `/data/leads/sources/${sourceId}/remove-preview`);
    expect(preview.body).toMatchObject({ only_here: BIG, with_data: 0 });
    const note = await kit.ask("POST", `/data/leads/${only.lead_id}/notes`, {
      by: WALKER,
      text: "Keep me.",
    });
    const withNote = await kit.ask("GET", `/data/leads/sources/${sourceId}/remove-preview`);
    expect(withNote.body).toMatchObject({ only_here: BIG, with_data: 1 });
    const refused = await kit.ask("POST", `/data/leads/sources/${sourceId}/remove`, { by: WALKER });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toEqual({
      code: "has_data",
      message:
        "1 of the leads only this file brings have replies, notes or edits; they cannot leave. Upload a corrected version instead.",
    });
    expect(kit.module.index.size).toBe(290 + BIG + 0);
    const noteId = (note.body.note as { note_id: string }).note_id;
    await kit.ask("POST", `/data/leads/${only.lead_id}/notes/${noteId}/delete`, { by: WALKER });
    const removed = await kit.ask("POST", `/data/leads/sources/${sourceId}/remove`, { by: WALKER });
    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({ removed: BIG });
    await kit.settle();
    expect(kit.module.index.size).toBe(290);
    expect(kit.leads.byEmail("partner1@fund1.example")).not.toBeNull();
    expect(
      (await kit.ask("GET", `/data/leads/${leadIdOf("asha.rao0@firm0.example")}`)).status,
    ).toBe(404);
  });
});
