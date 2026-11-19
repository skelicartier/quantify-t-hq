// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { WALKER, codeOf, startStack, type Stack } from "./helpers";

/**
 * Statements are for the Owner only, at the service too (ws-notes/duties/spec.md §2 rule 1,
 * §9.4): every `/data/statements/…` route but the summary refuses without the Owner flag,
 * and the summary, the `statements` feed and Numbers carry totals only, never a narration,
 * a reference, an account number or the walk intern's name. Everything is invented.
 */

let stack: Stack;
let accountId = "";
let statementId = "";
let lineId = "";

/** Words that name who was paid what, from the walk statement; none may leave the Owner's routes. */
const NAMING = [
  "NEFT",
  "WALK LEGAL",
  "WALK-UTR",
  "WALK-REF",
  "WALK-INV",
  "Walk Intern One",
  "INTERN ONE",
  "STIPEND",
  "··",
  "last4",
];

beforeAll(async () => {
  stack = await startStack({ modules: ["files", "numbers", "statements"] });
  await stack.ask("POST", "/data/_test/statements/money", { by: WALKER });
  await stack.ask("POST", "/data/_test/statements/people-pay", { by: WALKER });
  const seeded = await stack.ask("POST", "/data/_test/statements/seed", { by: WALKER });
  accountId = String(seeded.json!.account_id);
  statementId = String(seeded.json!.statement_id);
  const lines = await stack.ask(
    "GET",
    `/data/statements/accounts/${accountId}/lines?owner=1&month=2026-10&view=all`,
  );
  lineId = String((lines.json!.lines as { line_id: string }[])[0]!.line_id);
}, 60_000);
afterAll(async () => {
  await stack.stop();
});

describe("without the Owner flag", () => {
  it("refuses every statements route but the summary, 403 owner_only", async () => {
    const gets = [
      "/data/statements",
      "/data/statements/export?month=2026-10",
      `/data/statements/accounts/${accountId}/lines?month=2026-10`,
      `/data/statements/${statementId}/file`,
      `/data/statements/${statementId}/copy`,
    ];
    for (const path of gets) {
      for (const query of ["", path.includes("?") ? "&owner=0" : "?owner=0"]) {
        const answer = await stack.ask("GET", `${path}${query}`);
        expect([path, answer.status, codeOf(answer)]).toEqual([path, 403, "owner_only"]);
        expect(JSON.stringify(answer.json)).toContain(
          "Statements are for the Owner only: they name who was paid what.",
        );
      }
    }
    const posts = [
      "/data/statements/accounts",
      `/data/statements/accounts/${accountId}/update`,
      `/data/statements/accounts/${accountId}/close`,
      `/data/statements/accounts/${accountId}/preview`,
      `/data/statements/accounts/${accountId}/import`,
      `/data/statements/accounts/${accountId}/accept-sure`,
      `/data/statements/${statementId}/withdraw`,
      `/data/statements/${statementId}/copy`,
      `/data/statements/lines/${lineId}/category`,
      `/data/statements/lines/${lineId}/match`,
      `/data/statements/lines/${lineId}/unmatch`,
      `/data/statements/lines/${lineId}/note`,
    ];
    for (const path of posts)
      for (const flag of [{}, { owner: false }, { owner: "true" }]) {
        const answer = await stack.ask("POST", path, {
          by: WALKER,
          ...flag,
          name: "x",
          why: "Because I said so.",
        });
        expect([path, answer.status, codeOf(answer)]).toEqual([path, 403, "owner_only"]);
      }
    // Nothing was changed by any of them.
    const listed = await stack.ask("GET", "/data/statements?owner=1");
    expect((listed.json!.accounts as unknown[]).length).toBe(1);
  });

  it("gives totals only in the summary: no line, narration, reference, account number or name", async () => {
    const summary = await stack.ask("GET", "/data/statements/summary");
    expect(summary.status).toBe(200);
    const text = JSON.stringify(summary.json);
    for (const words of NAMING) expect([words, text.includes(words)]).toEqual([words, false]);
    const [row] = summary.json!.accounts as Record<string, unknown>[];
    expect(Object.keys(row!).sort()).toEqual(
      ["account_id", "closing_minor", "covered_to", "currency", "kind", "name", "to_sort"].sort(),
    );
    expect(summary.json!.cash).toEqual([
      expect.objectContaining({ currency: "INR", as_of: "2026-10-31", cash_minor: 120_000_000 }),
    ]);
  });

  it("gives the same totals, and nothing that names anyone, through the feed and Numbers", async () => {
    const feed = await stack.ask("GET", "/data/_test/statements/feed");
    const numbers = await stack.ask("GET", "/data/numbers");
    for (const answer of [feed, numbers]) {
      const text = JSON.stringify(answer.json);
      for (const words of NAMING) expect([words, text.includes(words)]).toEqual([words, false]);
    }
    expect(Object.keys((feed.json!.cash as Record<string, unknown>[])[0]!).sort()).toEqual(
      [
        "as_of",
        "avg_net_burn_minor",
        "cash_minor",
        "collected_minor",
        "currency",
        "gross_burn_minor",
        "months",
        "uncategorised",
      ].sort(),
    );
  });
});
