// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { searchData } from "@/lib/data/api/search";
import { dataAsk, ok } from "@/lib/data/socket";
import { peopleCsv } from "./leads-kit";
import { WALKER, startStack, until, type Stack } from "./helpers";

/**
 * The portal's search client against the real stack: the leads index answers through
 * `search:leads`, stand-ins answer for the kinds other units add, and every answer passes
 * the portal's own schema.
 */

let stack: Stack;

beforeAll(async () => {
  // U3's modules alone (raise spec §3.2): without the modules that give `search:investors`,
  // `search:files`, `search:notes` and `search:contacts`, so the stand-ins answer for them.
  // raise-merged.test.ts checks the real sources together.
  stack = await startStack({
    env: true,
    modules: ["leads", "replies", "waitlist", "dates", "search"],
  });
  stack.engine.importList({
    name: "Walk 01",
    file_name: "walk-01.csv",
    text: peopleCsv([
      { email: "asha@peak.example", first: "Asha", company: "Peak Capital" },
      { email: "ben@nine.example", first: "Ben", company: "Nine Ventures" },
    ]),
  });
  await until(async () => {
    const page = await dataAsk(ok.passthrough(), "GET", "/data/leads");
    return (
      (page as { total?: number }).total === 2 && (page as { reading?: boolean }).reading === false
    );
  }, "the list to be read");
}, 60_000);
afterAll(() => stack.stop());

describe("the portal and Data's search agree", () => {
  it("on a lead, the stand-in kinds, one kind, and nothing under two letters", async () => {
    const lead = await searchData("peak");
    expect(lead.total).toBe(1);
    expect(lead.groups[0]).toMatchObject({
      kind: "lead",
      label: "All leads",
      count: 1,
      hits: [{ title: "Asha Rao", snippet: "asha@peak.example" }],
    });
    for (const name of ["investors", "files", "notes", "contacts"])
      await stack.ask("POST", "/data/_test/search/source", { name, by: WALKER });
    const all = await searchData("walk stand-in", { limit: 5 });
    expect(all.groups.map((group) => group.kind)).toEqual([
      "investor",
      "file",
      "note",
      "faq",
      "decision",
      "contact",
    ]);
    const one = await searchData("walk stand-in", { kind: "faq" });
    expect(one.groups.map((group) => group.label)).toEqual(["Investor FAQ"]);
    expect(await searchData("w")).toMatchObject({ total: 0, groups: [] });
  });
});
