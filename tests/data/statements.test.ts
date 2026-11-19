// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  balanceAt,
  cashOf,
  ceilDiv,
  historyOf,
  runwayOf,
} from "../../scripts/data/statements/cash";
import { addsUpOf, fingerprintsOf } from "../../scripts/data/statements/lines";
import type { Account, Line, ReadLine, Statement } from "../../scripts/data/statements/types";
import {
  WALK_CATEGORIES,
  WALK_LINES,
  walkStatementCsv,
} from "../../scripts/data/statements/walk-seed";
import { WALKER, codeOf, startStack, type Stack } from "./helpers";

/**
 * Statements, worked out (ws-notes/duties/spec.md §5.5, §9.12): the fingerprint and an
 * overlapping import, adding up and its first mismatch, the gap check line, withdrawing, the
 * remembered columns, cash over two accounts, a card counted nowhere, §5.5's burn table, its
 * average, runway and the two cash-out days, and no whole month. Everything is invented.
 */

const STAFF = WALKER;
const at = "2026-11-01T10:00:00.000Z";

function account(id: string, extra: Partial<Account> = {}): Account {
  return {
    account_id: id,
    name: `Walk Bank ${id}`,
    kind: "bank",
    bank: "Walk Bank",
    last4: "0000",
    currency: "INR",
    opening: null,
    closed_on: null,
    mapping: null,
    created_at: at,
    created_by: STAFF,
    updated_at: at,
    updated_by: STAFF,
    ...extra,
  };
}

function statement(
  id: string,
  accountId: string,
  from: string,
  to: string,
  opening: number,
): Statement {
  return {
    statement_id: id,
    account_id: accountId,
    from,
    to,
    source: "delimited",
    file: { stored: `${id}.csv`, original_name: `${id}.csv`, bytes: 1, sha256: id },
    copy: null,
    opening_minor: opening,
    closing_minor: null,
    lines: 0,
    skipped: 0,
    ignored_rows: 0,
    adds_up: { ok: null },
    imported_at: at,
    imported_by: STAFF,
    withdrawn: null,
  };
}

let serial = 0;
function line(
  accountId: string,
  statementId: string,
  day: string,
  direction: "debit" | "credit",
  rupees: number,
  category: string | null,
): Line {
  serial += 1;
  return {
    line_id: `line-${serial}`,
    account_id: accountId,
    statement_id: statementId,
    n: serial,
    posted_on: day,
    direction,
    amount_minor: rupees * 100,
    balance_minor: null,
    narration: `WALK LINE ${serial}`,
    reference: `WALK-REF-${serial}`,
    fingerprint: `f${serial}`,
    category_id: category,
    match: null,
    note: "",
    sorted_at: null,
    sorted_by: null,
    withdrawn: false,
  };
}

/** §5.5's table on one rupee account: out, collected, and ₹12,00,000 at the end of October. */
function walkHistory(octoberNet = 155_000) {
  const a = account("a");
  const s = statement(
    "s",
    "a",
    "2026-08-01",
    "2026-10-31",
    165_000_000 - (octoberNet - 155_000) * 100,
  );
  const lines = [
    line("a", "s", "2026-08-03", "debit", 150_000, "walk-cat-hosting"),
    line("a", "s", "2026-08-05", "credit", 10_000, "walk-cat-subscriptions"),
    line("a", "s", "2026-09-03", "debit", 155_000, null),
    line("a", "s", "2026-10-03", "debit", octoberNet + 20_000, "walk-cat-rent"),
    line("a", "s", "2026-10-15", "credit", 20_000, "walk-cat-subscriptions"),
    // A transfer to another own account is neither burn nor collected… and leaves the cash.
    line("a", "s", "2026-10-20", "debit", 0, "walk-cat-transfer"),
  ];
  return { account: a, statements: [s], lines };
}

describe("fingerprints", () => {
  const read = (day: string, narration: string, rupees: number): ReadLine => ({
    row: 1,
    posted_on: day,
    direction: "debit",
    amount_minor: rupees * 100,
    balance_minor: null,
    narration,
    reference: "WALK-REF-1",
  });

  it("keeps two real payments of the same amount on one day apart, and finds a line twice", () => {
    const one = fingerprintsOf("a", [
      read("2026-10-01", "WALK  RENT", 10),
      read("2026-10-01", "walk rent", 10),
    ]);
    expect(one[0]).not.toBe(one[1]);
    const again = fingerprintsOf("a", [read("2026-10-01", "Walk Rent", 10)]);
    expect(again[0]).toBe(one[0]);
    expect(fingerprintsOf("b", [read("2026-10-01", "Walk Rent", 10)])[0]).not.toBe(one[0]);
  });
});

describe("adding up", () => {
  it("names the first line the bank's balance disagrees with", () => {
    const lines: ReadLine[] = [
      {
        row: 2,
        posted_on: "2026-10-01",
        direction: "debit",
        amount_minor: 100_00,
        balance_minor: 41_000_000 - 100_00,
        narration: "A",
        reference: "",
      },
      {
        row: 3,
        posted_on: "2026-10-02",
        direction: "credit",
        amount_minor: 200_00,
        balance_minor: 41_020_000,
        narration: "B",
        reference: "",
      },
    ];
    expect(addsUpOf(41_000_000, lines, "INR")).toEqual({
      ok: false,
      at_line: 2,
      words:
        "Does not add up at line 2: the bank's balance is ₹4,10,200.00, the lines give ₹4,10,100.00.",
    });
    expect(addsUpOf(41_000_000, [lines[0]!], "INR")).toEqual({ ok: true });
    expect(addsUpOf(0, [{ ...lines[0]!, balance_minor: null }], "INR")).toEqual({ ok: null });
  });
});

describe("cash, burn and runway (§5.5)", () => {
  it("sums two rupee accounts on the earliest day both are covered to", () => {
    const histories = [
      historyOf(account("a"), [statement("s1", "a", "2026-10-01", "2026-10-31", 90_000_000)], []),
      historyOf(
        account("b"),
        [statement("s2", "b", "2026-10-01", "2026-11-12", 30_000_000)],
        [line("b", "s2", "2026-11-05", "debit", 50_000, null)],
      ),
    ];
    const [rupees] = cashOf(histories, WALK_CATEGORIES);
    expect(rupees).toMatchObject({
      currency: "INR",
      as_of: "2026-10-31",
      cash_minor: 120_000_000,
      months: 1,
    });
  });

  it("counts a card in neither cash nor burn", () => {
    const card = account("c", { kind: "card" });
    const histories = [
      historyOf(account("a"), [statement("s1", "a", "2026-10-01", "2026-10-31", 90_000_000)], []),
      historyOf(
        card,
        [statement("s3", "c", "2026-10-01", "2026-10-31", -500_000)],
        [line("c", "s3", "2026-10-09", "debit", 5_000, null)],
      ),
    ];
    const [rupees] = cashOf(histories, WALK_CATEGORIES);
    expect(rupees).toMatchObject({ cash_minor: 90_000_000, gross_burn_minor: 0, uncategorised: 0 });
  });

  it("works §5.5's table: gross, collected, the average, 8.0 months and 1 Jul 2027", () => {
    const walk = walkHistory();
    const [rupees] = cashOf(
      [historyOf(walk.account, walk.statements, walk.lines)],
      WALK_CATEGORIES,
    );
    expect(rupees?.whole).toEqual([
      {
        period: "2026-08",
        gross_minor: 15_000_000,
        collected_minor: 1_000_000,
        net_minor: 14_000_000,
      },
      { period: "2026-09", gross_minor: 15_500_000, collected_minor: 0, net_minor: 15_500_000 },
      {
        period: "2026-10",
        gross_minor: 17_500_000,
        collected_minor: 2_000_000,
        net_minor: 15_500_000,
      },
    ]);
    expect(rupees).toMatchObject({
      as_of: "2026-10-31",
      cash_minor: 120_000_000,
      gross_burn_minor: 17_500_000,
      collected_minor: 2_000_000,
      avg_net_burn_minor: 15_000_000,
      months: 3,
      runway_months: 8,
      zero_on: "2027-07-01",
      uncategorised: 1,
    });
  });

  it("rounds an average up to a paisa: 7.9 months and 30 Jun 2027", () => {
    expect(ceilDiv(14_000_000 + 15_500_000 + 15_600_000, 3)).toBe(15_033_334);
    expect(runwayOf(120_000_000, 15_033_334, "2026-10-31")).toEqual({
      runway_months: 7.9,
      zero_on: "2027-06-30",
    });
    expect(runwayOf(120_000_000, 15_000_000, "2026-10-31")).toEqual({
      runway_months: 8,
      zero_on: "2027-07-01",
    });
    expect(runwayOf(120_000_000, -1, "2026-10-31")).toEqual({ runway_months: null, zero_on: null });
  });

  it("has no whole month when the first statement starts after the 1st", () => {
    const history = historyOf(
      account("a"),
      [statement("s1", "a", "2026-10-05", "2026-10-31", 50_000_000)],
      [line("a", "s1", "2026-10-07", "debit", 1_000, null)],
    );
    const [rupees] = cashOf([history], WALK_CATEGORIES);
    expect(rupees).toMatchObject({
      cash_minor: 49_900_000,
      months: 0,
      avg_net_burn_minor: null,
      gross_burn_minor: null,
      runway_months: null,
      zero_on: null,
    });
    expect(balanceAt(history, "2026-10-06", true)).toBe(50_000_000);
  });

  it("stops the covered days at a gap and says so", () => {
    const history = historyOf(
      account("a"),
      [
        statement("s1", "a", "2026-08-01", "2026-08-31", 0),
        statement("s2", "a", "2026-10-01", "2026-10-31", 0),
      ],
      [],
    );
    expect(history.covered_to).toBe("2026-08-31");
    expect(history.gaps).toEqual([{ from: "2026-09-01", to: "2026-09-30" }]);
  });
});

// ------------------------------------------------------------------ through the service

let stack: Stack;
const owner = { by: WALKER, owner: true };
const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64");
const OCT_TO_NOV: typeof WALK_LINES = [
  ...WALK_LINES.filter(([day]) => day.endsWith("/10/2026") && Number(day.slice(0, 2)) >= 15),
  ["03/11/2026", "NEFT WALK CLOUD HOSTING NOV", "WALK-REF-1101", 40_000, 0],
  ["10/11/2026", "NEFT WALK DATA LICENCE NOV", "WALK-REF-1102", 60_000, 0],
];

beforeAll(async () => {
  stack = await startStack({ modules: ["files", "statements"] });
}, 60_000);
afterAll(async () => {
  await stack.stop();
});

async function addAccount(name: string) {
  const made = await stack.ask("POST", "/data/statements/accounts", {
    ...owner,
    name,
    kind: "bank",
    bank: "Walk Bank",
    last4: "0000",
    currency: "INR",
  });
  expect(made.status).toBe(200);
  return (made.json!.account as { account_id: string }).account_id;
}

async function importText(
  accountId: string,
  text: string,
  name: string,
  extra: Record<string, unknown> = {},
) {
  const preview = await stack.ask("POST", `/data/statements/accounts/${accountId}/preview`, {
    ...owner,
    content: b64(text),
    name,
  });
  expect(preview.status).toBe(200);
  const shown = preview.json!.preview as Record<string, unknown>;
  const done = await stack.ask("POST", `/data/statements/accounts/${accountId}/import`, {
    ...owner,
    import_id: shown.import_id,
    ...extra,
  });
  return { preview: shown, done };
}

describe("the import, through the service", () => {
  it("imports the walk statement, remembers the columns, and refuses the same file again", async () => {
    const id = await addAccount("Walk Bank current");
    const { preview, done } = await importText(id, walkStatementCsv(), "walk.csv");
    expect(preview).toMatchObject({
      lines: 13,
      already_here: 0,
      ignored_rows: 0,
      from: "2026-08-01",
      to: "2026-10-31",
      opening_minor: 165_000_000,
      closing_minor: 120_000_000,
      adds_up: { ok: true },
    });
    expect(done.status).toBe(200);
    expect(done.json).toMatchObject({ added: 13, skipped: 0 });
    const listed = await stack.ask("GET", "/data/statements?owner=1");
    const row = (
      listed.json!.accounts as {
        account: { mapping: unknown };
        closing_minor: number;
        covered_to: string;
      }[]
    )[0]!;
    expect(row).toMatchObject({ closing_minor: 120_000_000, covered_to: "2026-10-31" });
    expect(row.account.mapping).toMatchObject({
      delimiter: ",",
      header_row: 1,
      date_format: "DD/MM/YYYY",
    });
    const again = await importText(id, walkStatementCsv(), "walk again.csv");
    expect(again.preview.already_imported_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(again.done.status).toBe(409);
    expect(codeOf(again.done)).toBe("already_here");
    expect(String((again.done.json!.error as { message: string }).message)).toMatch(
      /^This file is already here, imported on \d+ \w{3} \d{4}\.$/,
    );
  });

  it("skips the lines an overlapping statement already brought, when the wording is the same", async () => {
    const id = await addAccount("Walk Bank overlap");
    // A file is imported once anywhere (by its SHA-256): each account here gets its own copy.
    await importText(id, `Walk copy for overlap\r\n${walkStatementCsv()}`, "first.csv");
    const opening = 120_000_000 / 100 + 15_000 + 48_200 - 20_000;
    const { preview, done } = await importText(
      id,
      walkStatementCsv(OCT_TO_NOV, opening),
      "second.csv",
    );
    expect(preview).toMatchObject({ lines: 5, already_here: 3 });
    expect(done.json).toMatchObject({ added: 2, skipped: 3 });
    const lines = await stack.ask(
      "GET",
      `/data/statements/accounts/${id}/lines?owner=1&month=2026-11&view=all`,
    );
    expect(lines.json).toMatchObject({
      opening_minor: 120_000_000,
      out_minor: 10_000_000,
      closing_minor: 110_000_000,
    });
  });

  it("flags where a file stops adding up, and a gap as a check line", async () => {
    const id = await addAccount("Walk Bank gaps");
    const broken = walkStatementCsv(WALK_LINES.slice(0, 4)).replace(
      '"16,20,000.00"',
      '"16,20,200.00"',
    );
    const { preview } = await importText(id, broken, "aug.csv");
    expect(preview.adds_up).toEqual({
      ok: false,
      at_line: 2,
      words:
        "Does not add up at line 2: the bank's balance is ₹16,20,200.00, the lines give ₹16,20,000.00.",
    });
    await importText(id, walkStatementCsv(WALK_LINES.slice(7), 1_000_000), "oct.csv", {
      opening_minor: "1000000",
    });
    const listed = await stack.ask("GET", "/data/statements?owner=1");
    const row = (
      listed.json!.accounts as {
        account_id: string;
        gaps: { words: string }[];
        covered_to: string;
      }[]
    ).find((item) => item.account_id === id)!;
    expect(row.covered_to).toBe("2026-08-25");
    expect(row.gaps.map((gap) => gap.words)).toEqual([
      "Nothing covers 26 Aug to 30 Sep 2026 for this account.",
    ]);
  });

  it("withdraws a statement only with a reason; its lines stay, marked, and count nowhere", async () => {
    const id = await addAccount("Walk Bank withdraw");
    const { done } = await importText(
      id,
      `Walk copy for withdraw\r\n${walkStatementCsv()}`,
      "w.csv",
    );
    const statementId = (done.json!.statement as { statement_id: string }).statement_id;
    const bare = await stack.ask("POST", `/data/statements/${statementId}/withdraw`, {
      ...owner,
      why: "no",
    });
    expect(bare.status).toBe(400);
    const withdrawn = await stack.ask("POST", `/data/statements/${statementId}/withdraw`, {
      ...owner,
      why: "Imported into the wrong account.",
    });
    expect(withdrawn.json!.statement).toMatchObject({
      withdrawn: { why: "Imported into the wrong account." },
    });
    const lines = await stack.ask(
      "GET",
      `/data/statements/accounts/${id}/lines?owner=1&month=2026-10&view=all`,
    );
    const all = lines.json!.lines as { withdrawn: boolean }[];
    expect(all.length).toBe(6);
    expect(all.every((item) => item.withdrawn)).toBe(true);
    const summary = await stack.ask("GET", "/data/statements/summary");
    const row = (
      summary.json!.accounts as { account_id: string; covered_to: string | null }[]
    ).find((item) => item.account_id === id);
    expect(row?.covered_to).toBeNull();
  });

  it("refuses only the last four digits' place for a full number", async () => {
    const made = await stack.ask("POST", "/data/statements/accounts", {
      ...owner,
      name: "Walk Bank long",
      kind: "bank",
      last4: "123456780000",
      currency: "INR",
    });
    expect(made.status).toBe(400);
    expect(JSON.stringify(made.json)).not.toContain("123456780000");
  });
});
