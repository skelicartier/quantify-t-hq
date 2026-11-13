// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { leadIdOf } from "../../scripts/data/leads/types";
import {
  OTHER,
  WALKER,
  drain,
  peopleCsv,
  readyToSend,
  sendLive,
  startKit,
  type Kit,
} from "./leads-kit";

/**
 * One lead, whole: what was sent is exactly what the provider was handed, a deleted
 * mailing says so, practice never shows, an edit never touches a Mail merge list, notes
 * belong to their author, and the stop list is Mail merge's own.
 */

let kit: Kit;
let listId = "";
let liveId = "";
const PEOPLE = [
  {
    email: "asha@peak.example",
    first: "Asha",
    last: "Rao",
    title: "Analyst",
    company: "Peak Capital",
  },
  {
    email: "ben@peak.example",
    first: "Ben",
    last: "Shah",
    title: "Partner",
    company: "Peak Capital",
  },
  {
    email: "chandra@solo.example",
    first: "Chandra",
    last: "Iyer",
    title: "Principal",
    company: "Solo Fund",
  },
];

type Detail = {
  lead_id: string;
  email: string;
  name: string;
  title: string;
  status: string;
  status_detail: string;
  times_written: number;
  fields: Record<string, string>;
  other: Record<string, string>;
  edited: string[];
  sent: (
    | { gone: false; subject: string; text: string; from: string; to: string; mailing: string }
    | { gone: true; mailing: string }
  )[];
  notes: { note_id: string; text: string; by: { staff_id: string } }[];
  activity: { kind: string; title: string }[];
  stop: { reason: string; why: string | null } | null;
  sources: { label: string; values: Record<string, string> }[];
  firm: { domain: string; free_mail: boolean; people: { email: string }[]; total: number };
};

async function detail(email: string): Promise<Detail> {
  const answer = await kit.ask("GET", `/data/leads/${leadIdOf(email)}`);
  expect(answer.status).toBe(200);
  return answer.body.lead as Detail;
}

beforeAll(async () => {
  kit = await startKit({
    before: async (engine) => {
      await readyToSend(engine);
      listId = engine.importList({
        name: "Walk 01",
        file_name: "walk-01.csv",
        text: peopleCsv(PEOPLE),
      }).list.id;
      const practiceList = engine.importList({
        name: "Walk 02",
        file_name: "walk-02.csv",
        text: peopleCsv([{ email: "dev@practice.example", first: "Dev" }]),
      }).list.id;
      liveId = await sendLive(engine, listId, "Walk live 01");
      const practice = engine.createMailing({ name: "Walk practice 02" }).mailing;
      engine.updateMailing(practice.id, {
        subject: "Practice for {{company}}",
        body: "Hi {{first_name}},\n\nJust practising.",
        list_ids: [practiceList],
      });
      engine.startMailing(practice.id, { practice: true });
      await drain(engine);
    },
  });
}, 60_000);
afterAll(() => kit.close());

describe("a lead's record", () => {
  it("shows what was sent exactly as the provider was handed it (L5)", async () => {
    const handed = kit.provider.sent.filter((mail) => mail.to_email === "asha@peak.example");
    expect(handed).toHaveLength(1);
    const lead = await detail("asha@peak.example");
    expect(lead.status).toBe("sent");
    expect(lead.times_written).toBe(1);
    expect(lead.sent).toHaveLength(1);
    const sent = lead.sent[0]!;
    expect(sent.gone).toBe(false);
    if (sent.gone) throw new Error("unreachable");
    expect(sent.subject).toBe(handed[0]!.subject);
    expect(sent.text).toBe(handed[0]!.text);
    expect(sent.subject).toBe("A note for Peak Capital");
    expect(sent.from).toBe("Walk Founder <founder@walk.example>");
    expect(sent.to).toBe("asha@peak.example");
    expect(
      lead.activity.some((item) => item.kind === "sent" && item.title === "Sent “Walk live 01”"),
    ).toBe(true);
    expect(lead.sources[0]!.label).toBe("Mail merge list “Walk 01”, row r1");
    expect(lead.sources[0]!.values).toMatchObject({
      "First Name": "Asha",
      Company: "Peak Capital",
    });
    expect(lead.firm).toMatchObject({ domain: "peak.example", free_mail: false, total: 2 });
    expect(lead.firm.people.map((person) => person.email)).toEqual(["ben@peak.example"]);
  });

  it("never shows a practice run or a test as sent (L6)", async () => {
    const dev = await detail("dev@practice.example");
    expect(dev.status).toBe("not_sent");
    expect(dev.status_detail).toBe("On Walk 02");
    expect(dev.sent).toEqual([]);
    // The test send went to the founder's own address, which is not a lead at all.
    expect((await kit.ask("GET", `/data/leads/${leadIdOf("founder@walk.example")}`)).status).toBe(
      404,
    );
  });

  it("changes a detail in Data and leaves the Mail merge list row as it was (L12)", async () => {
    const file = join(kit.dir, "lists", `${listId}.json`);
    const before = readFileSync(file, "utf8");
    const answer = await kit.ask("POST", `/data/leads/${leadIdOf("asha@peak.example")}/update`, {
      by: WALKER,
      field: "title",
      value: "Partner",
    });
    expect(answer.status).toBe(200);
    expect((answer.body.lead as { title: string }).title).toBe("Partner");
    expect(readFileSync(file, "utf8")).toBe(before);
    const row = kit.engine
      .listDetail(listId, {})
      .rows.find((item) => item.email === "asha@peak.example");
    expect(row?.values.title).toBe("Analyst");
    const lead = await detail("asha@peak.example");
    expect(lead.fields.title).toBe("Partner");
    expect(lead.edited).toEqual(["title"]);
    expect(lead.activity.some((item) => item.title === "Title: Analyst → Partner")).toBe(true);
    const refused = await kit.ask("POST", `/data/leads/${leadIdOf("asha@peak.example")}/update`, {
      by: WALKER,
      field: "email",
      value: "other@peak.example",
    });
    expect(refused.status).toBe(400);
    const secret = await kit.ask("POST", `/data/leads/${leadIdOf("asha@peak.example")}/update`, {
      by: WALKER,
      field: "notes",
      value: "key xkeysib-abc",
    });
    expect((secret.body.error as { code: string }).code).toBe("secret");
  });

  it("keeps notes, and only their author deletes one", async () => {
    const id = leadIdOf("ben@peak.example");
    const added = await kit.ask("POST", `/data/leads/${id}/notes`, {
      by: WALKER,
      text: "Met at an invented conference.",
    });
    expect(added.status).toBe(200);
    const noteId = (added.body.note as { note_id: string }).note_id;
    expect((await detail("ben@peak.example")).notes.map((note) => note.text)).toEqual([
      "Met at an invented conference.",
    ]);
    const notYours = await kit.ask("POST", `/data/leads/${id}/notes/${noteId}/delete`, {
      by: OTHER,
    });
    expect(notYours.status).toBe(403);
    const mine = await kit.ask("POST", `/data/leads/${id}/notes/${noteId}/delete`, { by: WALKER });
    expect(mine.status).toBe(200);
    expect((await detail("ben@peak.example")).notes).toEqual([]);
  });

  it("puts a lead on Mail merge's own stop list and takes it off again (L11)", async () => {
    const id = leadIdOf("chandra@solo.example");
    const stopped = await kit.ask("POST", `/data/leads/${id}/stop`, {
      by: WALKER,
      reason: "asked",
      note: "Said so on a call.",
    });
    expect(stopped.status).toBe(200);
    expect((stopped.body.lead as { status: string; status_detail: string }).status_detail).toBe(
      "Asked to stop",
    );
    expect(kit.engine.stops({}).stops.map((stop) => [stop.email, stop.reason])).toEqual([
      ["chandra@solo.example", "asked"],
    ]);
    const lead = await detail("chandra@solo.example");
    expect(lead.stop).toMatchObject({ reason: "asked", why: "by_hand" });
    expect(lead.activity.some((item) => item.title.startsWith("Put on the stop list"))).toBe(true);
    // A mailing that includes them leaves them out, with Mail merge's own reason.
    const again = kit.engine.createMailing({ name: "Walk live 02" }).mailing;
    kit.engine.updateMailing(again.id, {
      subject: "Again",
      body: "Hi {{first_name}}",
      list_ids: [listId],
      skip_written: false,
    });
    const people = kit.engine.people(again.id, {});
    expect(people.rows.find((row) => row.email === "chandra@solo.example")).toMatchObject({
      kind: "stopped",
      reason: "On the stop list",
    });
    const twice = await kit.ask("POST", `/data/leads/${id}/stop`, { by: WALKER, reason: "manual" });
    expect(twice.status).toBe(409);
    const off = await kit.ask("POST", `/data/leads/${id}/unstop`, { by: WALKER });
    expect(off.status).toBe(200);
    expect(kit.engine.stops({}).total).toBe(0);
    expect((await detail("chandra@solo.example")).status).toBe("sent");
  });

  it("says a deleted mailing's words are gone, and keeps the send", async () => {
    kit.engine.deleteMailing(liveId);
    kit.core.sender.poll();
    const lead = await detail("ben@peak.example");
    expect(lead.times_written).toBe(1);
    expect(lead.sent).toEqual([
      expect.objectContaining({ gone: true, mailing: "Walk live 01", state: "sent" }),
    ]);
    expect(lead.status).toBe("sent");
  });

  it("adds a lead by hand once, and refuses the same address again", async () => {
    const added = await kit.ask("POST", "/data/leads/add", {
      by: WALKER,
      email: "Meera@New.example",
      values: { full_name: "Meera Nair", company: "New Fund", title: "Analyst" },
    });
    expect(added.status).toBe(200);
    expect(added.body.lead).toMatchObject({
      email: "meera@new.example",
      name: "Meera Nair",
      status: "not_sent",
    });
    const again = await kit.ask("POST", "/data/leads/add", {
      by: WALKER,
      email: "meera@new.example",
    });
    expect(again.status).toBe(409);
    expect(again.body.error).toEqual({
      code: "already_a_lead",
      message: "That address is already a lead.",
    });
    const lead = await detail("meera@new.example");
    expect(lead.sources.map((source) => source.label)).toEqual(["Added by hand by Walk Owner"]);
    const tagged = await kit.ask("POST", "/data/leads/bulk-tag", {
      by: WALKER,
      ids: [leadIdOf("meera@new.example"), leadIdOf("asha@peak.example")],
      add: ["Warm"],
    });
    expect(tagged.body).toMatchObject({ changed: 2 });
    expect(
      (await detail("asha@peak.example")).activity.some((item) => item.title === "Tagged “Warm”"),
    ).toBe(true);
  });
});
