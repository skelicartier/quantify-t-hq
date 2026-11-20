// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import { catalogueItem } from "../../scripts/data/dates/catalogue";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * Key dates and the tools register (ws-notes/security/spec.md §6.7, §13.1 choice 15): "The
 * founders@ mailbox", "The mail provider's plan" and "Mac developer programme membership" are
 * hidden with "This renewal is on its tool's row in Systems." once a tool with a renewal day
 * stands for each, shown again when that tool is retired, and shown while the tool has no
 * renewal day. Every tool is invented.
 */

type Body = Record<string, unknown>;
const COVERS = ["mailbox", "mail-plan", "developer-programme"] as const;
const WHY = "This renewal is on its tool's row in Systems.";
const today = () => localDay(new Date());
let stack: Stack;

beforeAll(async () => {
  stack = await startStack({ modules: ["files", "company", "dates", "tools"] });
}, 60_000);
afterAll(() => stack.stop());

const suggestions = async () => {
  const page = (await stack.ask("GET", "/data/dates")).json!;
  return {
    shown: (page.suggestions as Body[]).map((row) => String(row.key)),
    hidden: page.hidden as { key: string; title: string; why: string }[],
  };
};

async function addTool(name: string, fields: Body): Promise<string> {
  const answer = await stack.ask("POST", "/data/tools", {
    name,
    ...fields,
    attempt: crypto.randomUUID(),
    by: WALKER,
  });
  expect(answer.status, JSON.stringify(answer.json)).toBe(200);
  return String((answer.json!.tool as Body).tool_id);
}

describe("the three suggestions a tool stands for", () => {
  it("the catalogue's rule: hidden only when the facts name the cover", () => {
    for (const key of COVERS) {
      const item = catalogueItem(key)!;
      expect(item.hidden({ agm_on: null })).toBeNull();
      expect(item.hidden({ agm_on: null, tool_covers: [key] })).toBe(WHY);
      expect(
        item.hidden({ agm_on: null, tool_covers: COVERS.filter((other) => other !== key) }),
      ).toBeNull();
    }
  });

  it("all three are suggested while no tool stands for them", async () => {
    const before = await suggestions();
    for (const key of COVERS) expect(before.shown).toContain(key);
    expect(before.hidden.filter((row) => (COVERS as readonly string[]).includes(row.key))).toEqual(
      [],
    );
  });

  it("a tool standing for a cover with no renewal day hides nothing", async () => {
    await addTool("Walk Mailbox", { key_date: "mailbox", billing: "yearly" });
    expect((await suggestions()).shown).toContain("mailbox");
  });

  it("hidden with the reason once a tool with a renewal day stands for each", async () => {
    const mailbox = ((await stack.ask("GET", "/data/tools")).json!.tools as Body[]).find(
      (tool) => tool.name === "Walk Mailbox",
    )!.tool_id as string;
    await stack.ask("POST", `/data/tools/${mailbox}/update`, {
      renews_on: addDays(today(), 90),
      by: WALKER,
    });
    await addTool("Walk Mail", {
      key_date: "mail-plan",
      billing: "yearly",
      renews_on: addDays(today(), 40),
    });
    const devId = await addTool("Walk Developer", {
      key_date: "developer-programme",
      billing: "yearly",
      renews_on: addDays(today(), 200),
    });
    const after = await suggestions();
    for (const key of COVERS) expect(after.shown).not.toContain(key);
    expect(after.hidden.filter((row) => (COVERS as readonly string[]).includes(row.key))).toEqual([
      { key: "mailbox", title: "The founders@ mailbox", why: WHY },
      { key: "mail-plan", title: "The mail provider's plan", why: WHY },
      { key: "developer-programme", title: "Mac developer programme membership", why: WHY },
    ]);

    // Retired: the suggestion is shown again.
    const retired = await stack.ask("POST", `/data/tools/${devId}/retire`, {
      why: "The programme lapsed",
      by: WALKER,
    });
    expect(retired.status).toBe(200);
    const again = await suggestions();
    expect(again.shown).toContain("developer-programme");
    expect(again.shown).not.toContain("mail-plan");
    expect(again.hidden.map((row) => row.key)).not.toContain("developer-programme");
  });
});
