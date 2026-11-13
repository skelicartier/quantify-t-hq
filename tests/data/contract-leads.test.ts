// @vitest-environment node
import { notFound } from "next/navigation";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { leadIdOf } from "../../scripts/data/leads/types";
import { openBuild, startBuild, waitForBuild } from "@/lib/data/api/builds";
import {
  addLead,
  addLeadNote,
  addLeadSource,
  bulkTagLeads,
  deleteLeadNote,
  leadsToMailMerge,
  readLead,
  readLeads,
  readLeadSources,
  readLeadsAgain,
  readSourceLeftOut,
  readSourceRemovePreview,
  removeLeadSource,
  stopLead,
  tagLead,
  unstopLead,
  updateLead,
} from "@/lib/data/api/leads";
import { dataRead } from "@/lib/data/read";
import { DataRequestError } from "@/lib/data/socket";
import { Scripted, peopleCsv, readyToSend, sendLive } from "./leads-kit";
import { WALKER, startStack, until, type Stack } from "./helpers";

/**
 * The portal's All leads client against the real server, host and worker: every answer
 * must pass the portal's own schema, and refusals arrive as the service said them.
 */

let stack: Stack;
const provider = new Scripted();
let listId = "";

beforeAll(async () => {
  // Files is left out: this file proves All leads on Mail merge's lists alone, and the
  // sources answers when no files service is there (contract-files covers the files).
  stack = await startStack({
    env: true,
    liveProvider: () => provider,
    modules: ["leads", "replies"],
  });
  await readyToSend(stack.engine);
  listId = stack.engine.importList({
    name: "Walk 01",
    file_name: "walk-01.csv",
    text: peopleCsv([
      { email: "asha@peak.example", first: "Asha", company: "Peak Capital" },
      { email: "ben@peak.example", first: "Ben", company: "Peak Capital" },
      { email: "chandra@solo.example", first: "Chandra", company: "Solo Fund" },
    ]),
  }).list.id;
  await sendLive(stack.engine, listId, "Walk live 01");
  await until(async () => {
    const page = await readLeads();
    return page.total === 3 && !page.reading && page.book.written === 3;
  }, "the list to be read");
}, 60_000);
afterAll(() => stack.stop());

describe("the portal and All leads agree", () => {
  it("on the list, with every filter, facet and count", async () => {
    const page = await readLeads({ sort: "name" });
    expect(page.total).toBe(3);
    expect(page.leads.map((lead) => lead.email)).toEqual([
      "asha@peak.example",
      "ben@peak.example",
      "chandra@solo.example",
    ]);
    expect(page.counts.status.sent).toBe(3);
    expect(page.facets.batch).toEqual([{ value: listId, label: "Walk 01", count: 3 }]);
    const narrowed = await readLeads({ q: "peak", status: "sent", batch: listId, offset: 0 });
    expect(narrowed.total).toBe(2);
  });

  it("on one lead, with what was sent, and on a lead that is not there", async () => {
    const { lead } = await readLead(leadIdOf("asha@peak.example"));
    expect(lead.status).toBe("sent");
    expect(lead.sent).toHaveLength(1);
    expect(lead.sent[0]).toMatchObject({ gone: false, mailing: "Walk live 01" });
    expect(lead.firm.people.map((person) => person.email)).toEqual(["ben@peak.example"]);
    await expect(readLead("0".repeat(32))).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });
    vi.mocked(notFound).mockClear();
    await dataRead(() => readLead("0".repeat(32)));
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("on every write to a lead", async () => {
    const id = leadIdOf("ben@peak.example");
    expect((await updateLead(id, "title", "Partner", WALKER)).lead.title).toBe("Partner");
    expect((await tagLead(id, { add: ["Warm"] }, WALKER)).lead.tags).toEqual(["Warm"]);
    const { note } = await addLeadNote(id, "Invented note.", WALKER, crypto.randomUUID());
    expect(note.text).toBe("Invented note.");
    expect((await deleteLeadNote(id, note.note_id, WALKER)).deleted).toBe(true);
    expect((await stopLead(id, "asked", "", WALKER)).lead.status).toBe("stopped");
    expect((await unstopLead(id, WALKER)).lead.status).toBe("sent");
    const added = await addLead(
      { email: "dev@new.example", values: { full_name: "Dev Menon", company: "New Fund" } },
      WALKER,
      crypto.randomUUID(),
    );
    expect(added.lead).toMatchObject({ email: "dev@new.example", status: "not_sent" });
    await expect(
      addLead({ email: "dev@new.example", values: {} }, WALKER, crypto.randomUUID()),
    ).rejects.toMatchObject({
      name: "DataRequestError",
      status: 409,
      code: "already_a_lead",
      message: "That address is already a lead.",
    });
    expect(
      (await bulkTagLeads([id, leadIdOf("dev@new.example")], { add: ["Cold"] }, WALKER)).changed,
    ).toBe(2);
  });

  it("on a Mail merge list made from a view", async () => {
    const { list } = await leadsToMailMerge(
      `batch=${listId}`,
      "Walk 01 again",
      WALKER,
      crypto.randomUUID(),
    );
    expect(list).toMatchObject({ name: "Walk 01 again", people: 3 });
    await expect(
      leadsToMailMerge("q=nobody-at-all", "Empty", WALKER, crypto.randomUUID()),
    ).rejects.toBeInstanceOf(DataRequestError);
  });

  it("on the sources page, with no files service in this copy", async () => {
    const page = await readLeadSources();
    expect(page).toMatchObject({ files: false, sources: [], csv_files: [] });
    expect(page.merge.lists).toBeGreaterThanOrEqual(1);
    await expect(
      addLeadSource({ file_id: "f-1", role: "leads", reason: "" }, WALKER),
    ).rejects.toMatchObject({ status: 409, code: "files_missing" });
    await expect(readSourceRemovePreview("nope")).rejects.toMatchObject({ status: 404 });
    await expect(removeLeadSource("nope", WALKER)).rejects.toMatchObject({ status: 404 });
    await expect(readSourceLeftOut("nope")).rejects.toMatchObject({ status: 404 });
    expect((await readLeadsAgain(WALKER)).state).toBe("reading");
  });

  it("on the two downloads, built and streamed", async () => {
    for (const kind of ["leads_csv", "leads_tracker"]) {
      const started = await startBuild({ kind, query: `batch=${listId}`, by: WALKER });
      const ready = await waitForBuild(started.build.build_id, { timeoutMs: 10_000, everyMs: 50 });
      expect(ready.state).toBe("ready");
      const opened = await openBuild(started.build.build_id);
      expect(opened.type).toBe("text/csv; charset=utf-8");
      const chunks: Buffer[] = [];
      for await (const chunk of opened.body) chunks.push(chunk as Buffer);
      const text = Buffer.concat(chunks).toString("utf8");
      expect(text.charCodeAt(0)).toBe(0xfeff);
      expect(text).toContain("asha@peak.example");
    }
  });
});
