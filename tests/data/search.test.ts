// @vitest-environment node
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inventedLead, leadFileText } from "../../scripts/data/leads/walk-seed";
import { leadIdOf } from "../../scripts/data/leads/types";
import { WALKER, startKit, type Kit } from "./leads-kit";

/**
 * Data's search (raise spec §7.5) over the leads index and stand-ins for the sources other
 * units add: the groups in their fixed order with exact counts, the limits, a word only
 * one invented lead has, and a source that fails left out. Every lead is invented.
 */

let kit: Kit;
type Body = Record<string, unknown>;
const LEADS = 2_000;

const search = async (query: string): Promise<Body> => {
  const answer = await kit.ask("GET", `/data/search?${query}`);
  expect(answer.status).toBe(200);
  return answer.body;
};
const groupsOf = (body: Body) =>
  body.groups as { kind: string; label: string; count: number; hits: Body[] }[];

beforeAll(async () => {
  kit = await startKit({
    before: (_engine, files, dir) => {
      const file = files.add("all_leads.csv", leadFileText(0, LEADS));
      mkdirSync(join(dir, "data", "leads"), { recursive: true });
      writeFileSync(
        join(dir, "data", "leads", "sources.json"),
        JSON.stringify([
          {
            source_id: randomUUID(),
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
  await kit.settle();
  (await import("../../scripts/data/search/index")).register(kit.core);
}, 60_000);
afterAll(() => kit.close());

describe("search:leads", () => {
  it("finds the one invented lead a word belongs to, with who they are and where they stand", async () => {
    expect(kit.module.index.size).toBe(LEADS);
    const row = inventedLead(1234);
    const email = row[0]!;
    const word = email.split("@")[0]!;
    const body = await search(`q=${encodeURIComponent(word)}`);
    expect(body.total).toBe(1);
    expect(groupsOf(body)).toEqual([
      {
        kind: "lead",
        label: "All leads",
        count: 1,
        hits: [
          {
            kind: "lead",
            id: leadIdOf(email),
            title: row[3],
            subtitle: `${row[4]} · ${row[5]} · Not sent yet`,
            snippet: email,
            href: `/data/leads/${leadIdOf(email)}`,
          },
        ],
      },
    ]);
  });

  it("needs every word, counts exactly, and keeps five a group unless a kind is asked for", async () => {
    const every = await search("q=walk%20capital");
    const [leads] = groupsOf(every);
    expect(leads!.count).toBe(LEADS);
    expect(leads!.hits).toHaveLength(5);
    expect(groupsOf(await search("q=walk%20capital&limit=12"))[0]!.hits).toHaveLength(12);
    expect(groupsOf(await search("q=walk%20capital&limit=900"))[0]!.hits).toHaveLength(50);
    expect(groupsOf(await search("q=walk%20capital&kind=lead"))[0]!.hits).toHaveLength(50);
    // Every word must match: Delhi narrows the firms to those in Delhi.
    const narrow = groupsOf(await search("q=walk%20capital%20delhi"))[0]!;
    expect(narrow.count).toBeGreaterThan(0);
    expect(narrow.count).toBeLessThan(LEADS);
    expect(await search("q=zzzz%20walk")).toEqual(
      expect.objectContaining({ total: 0, groups: [] }),
    );
  });

  it("answers nothing under two characters", async () => {
    expect(await search("q=a")).toMatchObject({ query: "a", total: 0, groups: [] });
    expect(await search("q=")).toMatchObject({ total: 0, groups: [] });
  });
});

describe("the groups", () => {
  it("come in a fixed order, from stand-ins where a source is missing, never over a real one", async () => {
    for (const name of ["contacts", "notes", "files", "investors"]) {
      const answer = await kit.ask("POST", "/data/_test/search/source", { name, by: WALKER });
      expect(answer.body).toMatchObject({ installed: true });
    }
    const real = await kit.ask("POST", "/data/_test/search/source", { name: "leads", by: WALKER });
    expect(real.body).toMatchObject({ installed: false, real: true });
    const body = await search("q=walk%20stand-in");
    expect(groupsOf(body).map((group) => [group.kind, group.label, group.count])).toEqual([
      ["investor", "Investors", 1],
      ["file", "Files", 1],
      ["note", "Notes", 1],
      ["faq", "Investor FAQ", 1],
      ["decision", "Decisions", 1],
      ["contact", "Contacts", 1],
    ]);
    expect(body.total).toBe(6);
    const contacts = await search("q=walk%20stand-in&kind=contact");
    expect(groupsOf(contacts).map((group) => group.kind)).toEqual(["contact"]);
    expect(groupsOf(contacts)[0]!.hits[0]).toMatchObject({
      kind: "contact",
      title: "Walk stand-in contact",
    });
  });

  it("leaves out a source that fails, and the rest still answer", async () => {
    await kit.ask("POST", "/data/_test/search/source", { name: "files", throws: true, by: WALKER });
    const body = await search("q=walk%20stand-in");
    expect(groupsOf(body).map((group) => group.kind)).toEqual([
      "investor",
      "note",
      "faq",
      "decision",
      "contact",
    ]);
    for (const name of ["contacts", "notes", "files", "investors"])
      await kit.ask("POST", "/data/_test/search/source", { name, on: false, by: WALKER });
    expect(await search("q=walk%20stand-in")).toMatchObject({ total: 0, groups: [] });
  });
});
