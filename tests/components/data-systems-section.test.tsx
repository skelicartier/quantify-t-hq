import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Systems on the screen (ws-notes/security/spec.md §3.5, §6.8): the person's Systems section in
 * its three states (Systems not loaded; nothing linked; accounts, devices not loaded and an
 * account possibly theirs) and with the devices stand-in's lines; the Accounts page and a
 * tool's page as an Admin (the `OWNER_LEFT_OUT` line, no ledger column, no link button, and
 * the read asked without the Owner flag) and as the Owner (the two columns, the flag set
 * from the role); an Admin's link refused before anything is sent; and no "%" anywhere.
 * With the client mocked; every person and tool is invented.
 */

const mocks = vi.hoisted(() => ({
  requireData: vi.fn(),
  requireStaff: vi.fn(),
  readAccounts: vi.fn(),
  readTool: vi.fn(),
  readTools: vi.fn(),
  linkAccount: vi.fn(),
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
vi.mock("@/lib/data/api/tools", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/api/tools")>()),
  readAccounts: mocks.readAccounts,
  readTool: mocks.readTool,
  readTools: mocks.readTools,
  linkAccount: mocks.linkAccount,
}));

import { linkAccountAction } from "@/app/(portal)/data/systems/actions";
import AccountsListPage from "@/app/(portal)/data/systems/accounts/page";
import ToolsRegisterPage from "@/app/(portal)/data/systems/page";
import ToolRecordPage from "@/app/(portal)/data/systems/tools/[toolId]/page";
import { SystemsSectionView } from "@/components/data/people/systems-section";
import type {
  AccountRow,
  AccountsPage,
  PersonSystems,
  ToolPage,
  ToolsPage,
} from "@/lib/data/api/tools";
import { NOT_ADVICE, OWNER_LEFT_OUT } from "@/lib/data/labels-controls";
import { DATA_OWNER_LINE } from "@/lib/data/owner";
import { INITIAL_ACTION_STATE } from "@/lib/forms/action-state";

const STAFF = { staff_id: "walk-staff", display_name: "Walk Staff", email: "staff@hq.test" };
const contextFor = (role: string) => ({
  token: "walk-token",
  me: { role, capabilities: ["mail:send", "crm:read"], staff: STAFF },
});
const ADMIN = contextFor("admin");
const OWNER = contextFor("owner");
const WALKER = { staff_id: "walk-owner", name: "Walk Owner" };
const STAMP = {
  created_at: "2026-11-20T06:00:00.000Z",
  created_by: WALKER,
  updated_at: "2026-11-20T06:00:00.000Z",
  updated_by: WALKER,
};

function account(owner: boolean, fields: Partial<AccountRow> = {}): AccountRow {
  return {
    account_id: "walk-account",
    tool_id: "walk-mail",
    holder: "walk.intern@walk.example",
    kind: "person",
    role: "member",
    mfa: "yes",
    critical: null,
    opened_on: "2026-11-02",
    closed_on: null,
    closed_note: "",
    notes: "",
    ...STAMP,
    tool_name: "Walk Mail",
    tool_retired: false,
    critical_now: true,
    href: "/data/systems/tools/walk-mail#tool-accounts",
    ...(owner
      ? {
          person: {
            person_id: "walk-intern-one",
            name: "Walk Intern One",
            state: "offboarding" as const,
            href: "/data/people/walk-intern-one",
          },
          close_by: { on: "2026-11-28", words: "Close by 28 Nov 2026", overdue: false },
        }
      : {}),
    ...fields,
  };
}

const TOOL = {
  tool_id: "walk-mail",
  name: "Walk Mail",
  what: "Mail and documents",
  category: "mail_docs" as const,
  status: "in_use" as const,
  business_owner: "Walk Owner",
  admins: "Walk Owner",
  vendor_id: null,
  legal_name: "",
  plan: "Business",
  seats: 5,
  amount_minor: 118_050,
  currency: "INR",
  billing: "yearly" as const,
  renews_on: "2027-03-15",
  notice_days: 30,
  auto_renews: "yes" as const,
  key_date: "mail-plan" as const,
  sign_in: "sso" as const,
  sso_with: "",
  mfa: "enforced" as const,
  critical: true,
  holds: ["personal" as const],
  subprocessor: null,
  data_location: "India",
  exit: "",
  reviewed: null,
  retired: null,
  notes: "",
  ...STAMP,
  next: { renewal: { next: "2027-03-15", cancel_by: "2027-02-13" }, review: "2027-11-20" },
  looked_on: "2026-11-20",
  review_owed: false,
  accounts_open: 1,
  accounts_line: "1 account on 5 seats",
  checks: ["Holds customer or personal data but is not marked as a sub-processor."],
  href: "/data/systems/tools/walk-mail",
};

function accountsPage(owner: boolean): AccountsPage {
  return {
    ok: true,
    view: "open",
    accounts: [account(owner)],
    holders: ["walk.intern@walk.example"],
    counts: { open: 1, closed: 0, shared: 0, admin_without_mfa: 0 },
    ...(owner
      ? {
          roster: [{ person_id: "walk-intern-one", name: "Walk Intern One", state: "offboarding" }],
          roster_here: true,
        }
      : {}),
    today: "2026-11-20",
  };
}

function toolPage(owner: boolean): ToolPage {
  return {
    ok: true,
    tool: { ...TOOL, refs: ["a5_9", "a5_18"] },
    accounts: [account(owner)],
    vendor: null,
    vendors: null,
    billed: null,
    billed_since: "2025-11-20",
    senders: null,
    events: [],
    files_here: false,
    file_choices: [],
    dpa_file: null,
    review_months: null,
    ...(owner
      ? {
          roster: [{ person_id: "walk-intern-one", name: "Walk Intern One", state: "offboarding" }],
          roster_here: true,
        }
      : {}),
    today: "2026-11-20",
  };
}

const TOOLS: ToolsPage = {
  ok: true,
  view: "in_use",
  tools: [TOOL],
  counts: { in_use: 1, trial: 0, ending: 0, retired: 0, subprocessors: 0 },
  review_months: null,
  subprocessors: [],
  kept: null,
  files_here: true,
  today: "2026-11-20",
};

const previous = process.env.HQ_MAIL_MERGE_SOCKET;
beforeEach(() => {
  process.env.HQ_MAIL_MERGE_SOCKET = "/nonexistent/hq-test/s.sock";
  for (const mock of Object.values(mocks)) mock.mockReset();
});
afterEach(() => {
  if (previous === undefined) delete process.env.HQ_MAIL_MERGE_SOCKET;
  else process.env.HQ_MAIL_MERGE_SOCKET = previous;
});

const headers = (table: HTMLElement) =>
  within(table)
    .getAllByRole("columnheader")
    .map((cell) => cell.textContent?.trim() ?? "");

describe("the person's Systems section", () => {
  it("says Systems is not loaded when the tools module is absent", () => {
    const { container } = render(
      <SystemsSectionView personId="walk-intern-one" answer="missing" />,
    );
    expect(container.textContent).toContain("Systems is not loaded here.");
    expect(container.querySelector("table")).toBeNull();
    expect(container.textContent).not.toContain("%");
  });

  it("with nothing linked, names the person and where to link from", () => {
    const answer: PersonSystems = {
      ok: true,
      name: "Walk Intern One",
      accounts: [],
      devices: [],
      possible: [],
    };
    const { container } = render(<SystemsSectionView personId="walk-intern-one" answer={answer} />);
    expect(container.textContent).toContain(
      "No accounts or devices in Systems are linked to Walk Intern One. Link them from Systems › Accounts.",
    );
    expect(container.textContent).toContain(
      "Accounts typed in the access list above and accounts in Systems are listed apart. Record each system once.",
    );
    expect(screen.getByRole("link", { name: "Systems › Accounts" }).getAttribute("href")).toBe(
      "/data/systems/accounts",
    );
    expect(container.querySelector("table")).toBeNull();
  });

  it("lists the accounts with the close-by, says devices are not loaded, and offers a Link for what is possibly theirs", () => {
    const answer: PersonSystems = {
      ok: true,
      name: "Walk Intern One",
      accounts: [account(true)],
      devices: null,
      possible: [
        account(false, {
          account_id: "walk-code-account",
          tool_id: "walk-code",
          tool_name: "Walk Code",
          holder: "Walk Intern One",
        }),
      ],
    };
    const { container } = render(<SystemsSectionView personId="walk-intern-one" answer={answer} />);
    const table = screen.getByRole("table", { name: "Accounts in Systems" });
    expect(headers(table)).toEqual(["Tool", "Account", "Role", "Close by", "Closed"]);
    expect(table.textContent).toContain("Close by 28 Nov 2026");
    expect(container.textContent).toContain("Devices is not loaded here.");
    expect(container.textContent).toContain(
      "Possibly theirs: open accounts not linked to anyone whose holder is this person's name or address",
    );
    expect(screen.getByRole("button", { name: "Link Walk Code: Walk Intern One" })).toBeTruthy();
    expect(container.textContent).not.toContain("%");
  });

  it("draws the devices table from the stand-in's lines", () => {
    const answer: PersonSystems = {
      ok: true,
      name: "Walk Intern One",
      accounts: [],
      devices: [
        {
          device_id: "walk-laptop",
          label: "Walk Laptop 14",
          ownership: "personal",
          by: "2026-12-02",
          done: false,
          href: "/data/systems/devices/walk-laptop",
        },
      ],
      possible: [],
    };
    render(<SystemsSectionView personId="walk-intern-one" answer={answer} />);
    const table = screen.getByRole("table", { name: "Devices in Systems" });
    expect(headers(table)).toEqual(["Device", "Company or personal", "Owed by", "Done"]);
    expect(table.textContent).toContain("Walk Laptop 14");
    expect(table.textContent).toContain("2 Dec 2026");
  });
});

describe("Accounts and a tool's page keep the ledger to the Owner", () => {
  const params = { searchParams: Promise.resolve({}) };

  it("Accounts as an Admin: the line, no ledger column, no link button, asked without the flag", async () => {
    mocks.requireData.mockResolvedValue({ context: ADMIN, allowed: true });
    mocks.readAccounts.mockResolvedValue(accountsPage(false));
    const { container } = render(await AccountsListPage(params));
    expect(mocks.readAccounts).toHaveBeenCalledWith({ view: "open", holder: "", owner: false });
    expect(screen.getByText(OWNER_LEFT_OUT)).toBeTruthy();
    const table = screen.getByRole("table", { name: "Accounts" });
    expect(headers(table)).toEqual([
      "Holder",
      "Tool",
      "Kind",
      "Role",
      "Two-step",
      "Opened",
      "Closed",
    ]);
    expect(container.textContent).not.toContain("Link to the people ledger");
    expect(container.textContent).not.toContain("Walk Intern One");
    expect(container.textContent).toContain(NOT_ADVICE);
    expect(container.textContent).not.toContain("%");
  });

  it("Accounts as the Owner: the two columns and the link, asked with the flag", async () => {
    mocks.requireData.mockResolvedValue({ context: OWNER, allowed: true });
    mocks.readAccounts.mockResolvedValue(accountsPage(true));
    const { container } = render(await AccountsListPage(params));
    expect(mocks.readAccounts).toHaveBeenCalledWith({ view: "open", holder: "", owner: true });
    expect(screen.queryByText(OWNER_LEFT_OUT)).toBeNull();
    const table = screen.getByRole("table", { name: "Accounts" });
    expect(headers(table)).toEqual([
      "Holder",
      "Tool",
      "Kind",
      "Role",
      "Two-step",
      "Opened",
      "Closed",
      "In the people ledger",
      "Close by",
    ]);
    expect(table.textContent).toContain("Walk Intern One");
    expect(table.textContent).toContain("Close by 28 Nov 2026");
    expect(container.textContent).toContain("Link to the people ledger");
  });

  it("a tool's page as an Admin and as the Owner", async () => {
    const toolParams = { params: Promise.resolve({ toolId: "walk-mail" }) };
    mocks.requireData.mockResolvedValue({ context: ADMIN, allowed: true });
    mocks.readTool.mockResolvedValue(toolPage(false));
    const admin = render(await ToolRecordPage(toolParams));
    expect(mocks.readTool).toHaveBeenCalledWith("walk-mail", false);
    expect(admin.container.textContent).toContain(OWNER_LEFT_OUT);
    expect(admin.container.textContent).not.toContain("In the people ledger");
    expect(admin.container.textContent).toContain(
      "Every year, HQ's default. Once a year: its sign-in, the data it holds and its terms.",
    );
    expect(admin.container.textContent).toContain(NOT_ADVICE);
    expect(admin.container.textContent).not.toContain("%");
    admin.unmount();
    mocks.requireData.mockResolvedValue({ context: OWNER, allowed: true });
    mocks.readTool.mockResolvedValue(toolPage(true));
    const owner = render(await ToolRecordPage(toolParams));
    expect(mocks.readTool).toHaveBeenLastCalledWith("walk-mail", true);
    expect(owner.container.textContent).not.toContain(OWNER_LEFT_OUT);
    expect(owner.container.textContent).toContain("In the people ledger");
    expect(owner.container.textContent).toContain("Walk Intern One");
  });

  it("the Tools page: the empty sentence, the references, and no per cent sign", async () => {
    mocks.requireData.mockResolvedValue({ context: ADMIN, allowed: true });
    mocks.readTools.mockResolvedValue({
      ...TOOLS,
      tools: [],
      counts: { in_use: 0, trial: 0, ending: 0, retired: 0, subprocessors: 0 },
    });
    const { container } = render(await ToolsRegisterPage(params));
    expect(container.textContent).toContain(
      "No tools recorded. Add every tool the company signs in to, paid or free, starting with the mail suite: buyers ask which tools hold their data, and a leaver's accounts are closed from this list.",
    );
    expect(container.textContent).toContain(
      "ISO/IEC 27001:2022 A.5.9 Inventory of information and other associated assets.",
    );
    expect(container.textContent).not.toContain("%");
    mocks.readTools.mockResolvedValue(TOOLS);
    const full = render(await ToolsRegisterPage(params));
    const table = within(full.container).getByRole("table", { name: "Tools" });
    expect(headers(table)).toEqual([
      "Tool",
      "Category",
      "Owner",
      "Sign-in",
      "Two-step",
      "Holds",
      "Accounts",
      "Renewal",
      "Looked at",
    ]);
    expect(table.textContent).toContain("1 on 5 seats");
    expect(table.textContent).toContain("Cancel by 13 Feb 2027");
  });

  it("an Admin's link is refused with the owner line before anything is sent", async () => {
    mocks.requireStaff.mockResolvedValue(ADMIN);
    const form = new FormData();
    form.set("account_id", "walk-account");
    form.set("person_id", "walk-intern-one");
    expect(await linkAccountAction(INITIAL_ACTION_STATE, form)).toEqual({
      status: "error",
      message: DATA_OWNER_LINE,
    });
    expect(mocks.linkAccount).not.toHaveBeenCalled();
  });
});
