import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Statements on the page (ws-notes/duties/spec.md §9.11, §9.12): the import preview's
 * sentences as he reads them, the first rows as read and Import; and for an Admin the
 * Statements pages draw only the Owner line, read nothing, refuse every action with it, and
 * the file and export routes answer 403. Every line and name is invented.
 */

const mocks = vi.hoisted(() => ({
  requireData: vi.fn(),
  requireStaff: vi.fn(),
  readStatements: vi.fn(),
  readLines: vi.fn(),
  addAccount: vi.fn(),
  previewImport: vi.fn(),
  readStatementFile: vi.fn(),
  exportLines: vi.fn(),
}));

vi.mock("@/lib/access/core", () => ({
  requireStaff: mocks.requireStaff,
  hasCapability: (context: { me: { capabilities: string[] } }, capability: string) =>
    context.me.capabilities.includes(capability),
}));
vi.mock("@/lib/security/action-origin", () => ({
  requireSameOriginServerAction: async () => undefined,
  SameOriginActionError: class extends Error {},
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/data/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/access")>()),
  requireData: mocks.requireData,
}));
vi.mock("@/lib/data/api/statements", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/api/statements")>()),
  readStatements: mocks.readStatements,
  readLines: mocks.readLines,
  addAccount: mocks.addAccount,
  previewImport: mocks.previewImport,
  readStatementFile: mocks.readStatementFile,
  exportLines: mocks.exportLines,
}));

import {
  addAccountAction,
  previewImportAction,
} from "@/app/(portal)/data/money/statements/actions";
import AccountLinesRoute from "@/app/(portal)/data/money/statements/[accountId]/page";
import { GET as exportRoute } from "@/app/(portal)/data/money/statements/export/route";
import { GET as fileRoute } from "@/app/(portal)/data/money/statements/files/[statementId]/route";
import StatementsRoute from "@/app/(portal)/data/money/statements/page";
import { StatementPreview, type PreviewShown } from "@/components/data/statements/statement-import";
import { STATEMENTS_OWNER_LINE, balancesWords, previewWords } from "@/lib/data/labels-statements";
import { INITIAL_ACTION_STATE } from "@/lib/forms/action-state";

const STAFF = { staff_id: "walk-staff", display_name: "Walk Staff", email: "staff@hq.test" };
const contextFor = (role: string, capabilities: string[]) => ({
  token: "walk-token",
  me: { role, capabilities, staff: STAFF },
});
const ADMIN = contextFor("admin", ["mail:send", "crm:read"]);
const INTERN = contextFor("intern", ["crm:read"]);

const previous = process.env.HQ_MAIL_MERGE_SOCKET;
beforeEach(() => {
  process.env.HQ_MAIL_MERGE_SOCKET = "/nonexistent/hq-test/s.sock";
  for (const mock of Object.values(mocks)) mock.mockReset();
});
afterEach(() => {
  if (previous === undefined) delete process.env.HQ_MAIL_MERGE_SOCKET;
  else process.env.HQ_MAIL_MERGE_SOCKET = previous;
});

describe("the import preview's sentences", () => {
  it("say how the file was read, what is skipped, and whether the lines add up", () => {
    expect(
      previewWords({
        source: "delimited",
        delimiter: ",",
        date_format: "DD/MM/YYYY",
        lines: 42,
        from: "2026-10-01",
        to: "2026-10-31",
        already_here: 17,
        ignored_rows: 3,
      }),
    ).toBe(
      "Read as comma-separated, day first. 42 lines from 1 to 31 Oct 2026; 17 are already here and will be skipped; 3 rows were not transactions.",
    );
    expect(
      balancesWords({
        currency: "INR",
        opening_minor: 41_000_000,
        closing_minor: 120_000_000,
        adds_up: { ok: true },
      }),
    ).toBe("Opening balance ₹4,10,000.00 · closing ₹12,00,000.00 · the lines add up.");
  });

  it("draws the first rows as read, the days it covers and Import", () => {
    const preview: PreviewShown = {
      import_id: "walk-import",
      source: "delimited",
      mapping: {
        delimiter: ",",
        header_row: 1,
        date: 0,
        date_format: "DD/MM/YYYY",
        narration: 1,
        reference: 2,
        amount: { style: "two_columns", debit: 3, credit: 4 },
        balance: 5,
      },
      header: [
        "Txn Date",
        "Narration",
        "Chq./Ref.No.",
        "Withdrawal Amt.",
        "Deposit Amt.",
        "Closing Balance",
      ],
      day_first_chosen: true,
      rows: [
        {
          row: 3,
          posted_on: "2026-10-06",
          direction: "debit",
          amount_minor: 1_180_000,
          balance_minor: 40_820_000,
          narration: "NEFT WALK LEGAL LLP WALK-INV-0007",
          reference: "WALK-UTR-0007",
        },
      ],
      from: "2026-10-01",
      to: "2026-10-31",
      lines: 1,
      already_here: 0,
      ignored_rows: 0,
      opening_minor: 42_000_000,
      closing_minor: 40_820_000,
      adds_up: { ok: true },
      locked_months: [],
      already_imported_on: null,
    };
    const { container } = render(
      <StatementPreview
        account={{
          account_id: "walk-account",
          name: "Walk Bank current",
          last4: "0000",
          currency: "INR",
        }}
        preview={preview}
        readAction={() => undefined}
        reading={false}
        doAction={() => undefined}
        importing={false}
        done={INITIAL_ACTION_STATE}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain(
      "Read as comma-separated, day first. 1 line from 1 to 31 Oct 2026. Read as day first.",
    );
    expect(text).toContain("NEFT WALK LEGAL LLP WALK-INV-0007");
    expect(text).toContain("₹11,800.00");
    expect(text).toContain(
      "Opening balance ₹4,20,000.00 · closing ₹4,08,200.00 · the lines add up.",
    );
    expect(text).toContain(
      "A statement for October covers 1 to 31 October even if the last line is on the 29th.",
    );
    expect(screen.getByRole("button", { name: "Import" })).toBeTruthy();
    expect(text).not.toMatch(/%|target|goal/i);
  });
});

describe("for anyone but the Owner", () => {
  it("draws only the Owner line on Statements and an account's lines, and reads nothing", async () => {
    mocks.requireData.mockResolvedValue({ context: ADMIN, allowed: true });
    const { unmount } = render(await StatementsRoute());
    expect(screen.getByText(STATEMENTS_OWNER_LINE)).toBeTruthy();
    expect(STATEMENTS_OWNER_LINE).toBe("This is for the Owner only: it names who was paid what.");
    expect(screen.queryByText("Add an account")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    // The Money strip leaves Statements out for an Admin.
    expect(screen.queryByRole("link", { name: "Statements" })).toBeNull();
    unmount();
    render(
      await AccountLinesRoute({
        params: Promise.resolve({ accountId: "walk-account" }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(screen.getByText(STATEMENTS_OWNER_LINE)).toBeTruthy();
    expect(mocks.readStatements).not.toHaveBeenCalled();
    expect(mocks.readLines).not.toHaveBeenCalled();
  });

  it("draws Data's own line for someone Data is not for", async () => {
    mocks.requireData.mockResolvedValue({ context: INTERN, allowed: false });
    render(await StatementsRoute());
    expect(screen.getByText("Data is for Owners and Admins.")).toBeTruthy();
    expect(mocks.readStatements).not.toHaveBeenCalled();
  });

  it("refuses an Admin's action with the Owner line before anything is sent", async () => {
    mocks.requireStaff.mockResolvedValue(ADMIN);
    const form = new FormData();
    form.set("name", "Walk Bank current");
    form.set("last4", "0000");
    expect(await addAccountAction(INITIAL_ACTION_STATE, form)).toEqual({
      status: "error",
      message: STATEMENTS_OWNER_LINE,
    });
    form.set("account_id", "walk-account");
    expect(await previewImportAction(INITIAL_ACTION_STATE, form)).toEqual({
      status: "error",
      message: STATEMENTS_OWNER_LINE,
    });
    expect(mocks.addAccount).not.toHaveBeenCalled();
    expect(mocks.previewImport).not.toHaveBeenCalled();
  });

  it("answers an Admin's file and export with 403 and asks nothing", async () => {
    mocks.requireStaff.mockResolvedValue(ADMIN);
    const file = await fileRoute(
      new Request("http://127.0.0.1/data/money/statements/files/walk?which=file") as never,
      { params: Promise.resolve({ statementId: "walk" }) },
    );
    expect(file.status).toBe(403);
    const exported = await exportRoute(
      new Request("http://127.0.0.1/data/money/statements/export?month=2026-10") as never,
    );
    expect(exported.status).toBe(403);
    expect(mocks.readStatementFile).not.toHaveBeenCalled();
    expect(mocks.exportLines).not.toHaveBeenCalled();
  });
});
