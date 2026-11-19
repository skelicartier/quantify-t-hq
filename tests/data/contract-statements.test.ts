// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as statements from "@/lib/data/api/statements";
import { DataRequestError } from "@/lib/data/socket";
import { walkStatementCsv } from "../../scripts/data/statements/walk-seed";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's Statements client held to the real service (ws-notes/duties/spec.md §9.12):
 * every call the Statements pages and actions make, made here over the socket, and every
 * answer has to pass the portal's own schema. Money and the people ledger are stand-ins;
 * the statement is the walk's, made here from invented lines.
 */

let stack: Stack;

beforeAll(async () => {
  stack = await startStack({ env: true, modules: ["files", "statements", "close"] });
  await stack.ask("POST", "/data/_test/statements/money", { by: WALKER });
  await stack.ask("POST", "/data/_test/statements/people-pay", { by: WALKER });
}, 60_000);
afterAll(async () => {
  await stack.stop();
});

describe("the portal and Statements agree", () => {
  it("from an empty page to an account, a two-step import and its lines", async () => {
    expect((await statements.readStatements(true)).accounts).toEqual([]);
    expect((await statements.readStatementsSummary()).cash).toEqual([]);
    const { account } = await statements.addAccount(
      true,
      {
        name: "Walk Bank current",
        kind: "bank",
        bank: "Walk Bank",
        last4: "0000",
        currency: "INR",
        opening_on: "",
        opening_balance: "",
      },
      WALKER,
      crypto.randomUUID(),
    );
    const { preview } = await statements.previewImport(
      true,
      account.account_id,
      { content: Buffer.from(walkStatementCsv()).toString("base64"), name: "walk.csv" },
      WALKER,
    );
    if ("refused" in preview) throw new Error(preview.refused);
    expect(preview).toMatchObject({ lines: 13, adds_up: { ok: true }, opening_minor: 165_000_000 });
    const again = await statements.previewImport(
      true,
      account.account_id,
      { import_id: preview.import_id, mapping: preview.mapping! },
      WALKER,
    );
    expect("rows" in again.preview && again.preview.rows.length).toBe(13);
    const made = await statements.importStatement(
      true,
      account.account_id,
      { import_id: preview.import_id, from: "2026-08-01", to: "2026-10-31" },
      WALKER,
      crypto.randomUUID(),
    );
    expect(made.added).toBe(13);
    const page = await statements.readStatements(true);
    expect(page.accounts[0]).toMatchObject({
      covered_to: "2026-10-31",
      closing_minor: 120_000_000,
    });
    const summary = await statements.readStatementsSummary();
    expect(summary.cash[0]).toMatchObject({ currency: "INR", cash_minor: 120_000_000 });
    const lines = await statements.readLines(true, account.account_id, "2026-10", "all");
    expect(lines.lines).toHaveLength(6);
    expect(lines.sure).toBe(1);
    const legal = lines.lines.find((line) => line.narration.includes("WALK LEGAL"))!;
    await statements.matchLine(true, legal.line_id, { ref: legal.suggestions[0]!.ref }, WALKER);
    await statements.unmatchLine(true, legal.line_id, "", WALKER);
    const accepted = await statements.acceptSure(true, account.account_id, "2026-10", WALKER);
    expect(accepted.accepted).toBe(1);
    const stipend = lines.lines.find((line) => line.narration.includes("STIPEND"))!;
    await statements.setLineCategory(true, stipend.line_id, "walk-cat-stipends", WALKER);
    await statements.noteLine(true, stipend.line_id, "October's stipend.", WALKER);
    const file = await statements.readStatementFile(true, made.statement.statement_id, "file");
    expect(Buffer.from(file.content, "base64").toString("utf8")).toBe(walkStatementCsv());
    const copy = await statements.addStatementCopy(
      true,
      made.statement.statement_id,
      { name: "walk.pdf", content: Buffer.from("%PDF-1.4\n% invented\n").toString("base64") },
      WALKER,
    );
    expect(copy.statement.copy_name).toBe("Walk Bank current 2026-08-01 to 2026-10-31.pdf");
    const csv = await statements.exportLines(true, "2026-10", account.account_id);
    expect(csv.csv).toContain("Intern stipends");
    await expect(
      statements.withdrawStatement(
        true,
        made.statement.statement_id,
        "Matched lines block it.",
        WALKER,
      ),
    ).rejects.toThrow("Take back the match made from this statement first.");
    await statements.closeAccount(true, account.account_id, "", WALKER);
  });

  it("is refused for the Admin's flag on every Owner call", async () => {
    await expect(statements.readStatements(false)).rejects.toThrow(DataRequestError);
    await expect(statements.readLines(false, "x", "2026-10", "all")).rejects.toThrow(
      "Statements are for the Owner only: they name who was paid what.",
    );
  });
});
