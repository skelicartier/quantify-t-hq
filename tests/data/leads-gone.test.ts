// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { leadIdOf } from "../../scripts/data/leads/types";
import { WALKER, peopleCsv, startKit, type Kit } from "./leads-kit";

/**
 * No lead ever leaves All leads: not when its only Mail merge list is deleted, nor when it
 * is taken off a list. It keeps the fields it had when last seen, its note and tag, and its
 * page; the batch reads as gone. Data keeps the rows itself, so a restart reads the same.
 */

let kit: Kit | null = null;
let dir = "";
afterEach(() => {
  kit?.close();
  kit = null;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = "";
});

type Detail = {
  email: string;
  name: string;
  company: string;
  tags: string[];
  batches: string[];
  status: string;
  status_detail: string;
  notes: { text: string }[];
  sources: { label: string; values: Record<string, string> }[];
};

async function detail(email: string): Promise<{ status: number; lead: Detail }> {
  const answer = await kit!.ask("GET", `/data/leads/${leadIdOf(email)}`);
  return { status: answer.status, lead: answer.body.lead as Detail };
}

describe("a lead whose list goes from Mail merge", () => {
  it("stays, with its fields, note, tag and page, and its batch reads as gone", async () => {
    dir = mkdtempSync(join(tmpdir(), "hqlg-"));
    let draftId = "";
    let keepId = "";
    kit = await startKit({
      dir,
      before: (engine) => {
        draftId = engine.importList({
          name: "Walk draft",
          file_name: "walk-draft.csv",
          text: peopleCsv([
            { email: "asha@draft.example", first: "Asha", last: "Rao", company: "Draft Capital" },
          ]),
        }).list.id;
        keepId = engine.importList({
          name: "Walk keep",
          file_name: "walk-keep.csv",
          text: peopleCsv([
            { email: "ben@keep.example", first: "Ben", last: "Shah", company: "Keep Fund" },
            { email: "chandra@keep.example", first: "Chandra", last: "Iyer" },
          ]),
        }).list.id;
      },
    });
    const asha = leadIdOf("asha@draft.example");
    expect(
      (await kit.ask("POST", `/data/leads/${asha}/notes`, { by: WALKER, text: "Invented note." }))
        .status,
    ).toBe(200);
    expect(
      (await kit.ask("POST", `/data/leads/${asha}/tags`, { by: WALKER, add: ["Walk tag"] })).status,
    ).toBe(200);

    // The draft list is deleted, and Ben is taken off the other one, in Mail merge.
    kit.engine.deleteList(draftId);
    const benRow = kit.engine
      .listDetail(keepId, {})
      .rows.find((row) => row.email === "ben@keep.example")!;
    kit.engine.removeRow(keepId, benRow.id);
    await kit.ask("GET", "/data/leads"); // the poll sees the lists change and rebuilds
    await kit.settle();

    const check = async (): Promise<void> => {
      expect((await kit!.ask("GET", "/data/leads")).body.total).toBe(3);
      const kept = await detail("asha@draft.example");
      expect(kept.status).toBe(200);
      expect(kept.lead).toMatchObject({
        email: "asha@draft.example",
        name: "Asha Rao",
        company: "Draft Capital",
        tags: ["Walk tag"],
        batches: ["Walk draft (gone)"],
        status: "not_sent",
        status_detail: "On no list now",
      });
      expect(kept.lead.notes.map((note) => note.text)).toEqual(["Invented note."]);
      expect(kept.lead.sources[0]).toMatchObject({
        label: expect.stringMatching(/^Mail merge list “Walk draft” \(gone\), row /),
        values: expect.objectContaining({ Company: "Draft Capital" }),
      });
      const ben = await detail("ben@keep.example");
      expect(ben.status).toBe(200);
      expect(ben.lead).toMatchObject({ company: "Keep Fund", batches: ["Walk keep (gone)"] });
      expect((await detail("chandra@keep.example")).lead.batches).toEqual(["Walk keep"]);
      // A batch holds who is on it now; a deleted one, who was on it when it went.
      expect((await kit!.ask("GET", `/data/leads?batch=${keepId}`)).body.total).toBe(1);
      expect((await kit!.ask("GET", `/data/leads?batch=${draftId}`)).body.total).toBe(1);
    };
    await check();

    // A restart: Mail merge no longer has those rows, Data still does.
    kit.close();
    kit = await startKit({ dir });
    await check();
  });

  it("reads only its new list when it moved to another one", async () => {
    dir = mkdtempSync(join(tmpdir(), "hqlg-"));
    let oldId = "";
    kit = await startKit({
      dir,
      before: (engine) => {
        oldId = engine.importList({
          name: "Walk old",
          file_name: "walk-old.csv",
          text: peopleCsv([{ email: "dev@moved.example", first: "Dev", company: "Moved Capital" }]),
        }).list.id;
      },
    });
    // The drafts are packed again: a new list with the same person, then the old one goes.
    kit.engine.importList({
      name: "Walk new",
      file_name: "walk-new.csv",
      text: peopleCsv([{ email: "dev@moved.example", first: "Dev", company: "Moved Capital" }]),
    });
    kit.engine.deleteList(oldId);
    await kit.ask("GET", "/data/leads");
    await kit.settle();
    expect((await detail("dev@moved.example")).lead.batches).toEqual(["Walk new"]);
    expect((await kit.ask("GET", `/data/leads?batch=${oldId}`)).body.total).toBe(0);
  });
});
