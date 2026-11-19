import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The cash view keeps the people ledger to the Owner (duties spec §2 rule 1, §7.6): the page
 * asks the service with the Owner flag only when the role is Owner, an Admin's page draws
 * "Stipends are in the people ledger, which is for the Owner only. They are left out here."
 * and no Stipends column, and the CSV route asks for stipends only for the Owner. With the
 * client mocked; every name is invented.
 */

const mocks = vi.hoisted(() => ({
  requireData: vi.fn(),
  requireStaff: vi.fn(),
  readCash: vi.fn(),
  startBuild: vi.fn(),
}));

vi.mock("@/lib/access/core", () => ({
  requireStaff: mocks.requireStaff,
  hasCapability: (context: { me: { capabilities: string[] } }, capability: string) =>
    context.me.capabilities.includes(capability),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/data/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/access")>()),
  requireData: mocks.requireData,
}));
vi.mock("@/lib/data/api/cash", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/api/cash")>()),
  readCash: mocks.readCash,
}));
vi.mock("@/lib/data/api/builds", () => ({
  startBuild: mocks.startBuild,
  waitForBuild: vi.fn(async () => ({ build_id: "b", state: "failed", detail: "Walk stop." })),
  openBuild: vi.fn(),
}));

import CashViewPage from "@/app/(portal)/data/numbers/cash/page";
import { GET as cashCsv } from "@/app/(portal)/data/numbers/cash/export/route";
import type { CashPage } from "@/lib/data/api/cash";

const STAFF = { staff_id: "walk-staff", display_name: "Walk Staff", email: "staff@hq.test" };
const contextFor = (role: string) => ({
  token: "walk-token",
  me: { role, capabilities: ["mail:send", "crm:read"], staff: STAFF },
});

const weeks = Array.from({ length: 14 }, (_, n) => ({
  n,
  from: "2026-11-09",
  to: "2026-11-15",
  label: n === 0 ? "Since 31 Oct" : `Week ${n}`,
}));

function page(owner: boolean): CashPage {
  const rows = [
    { key: "bills" as const, by_week: weeks.map(() => 0) },
    ...(owner
      ? [{ key: "stipends" as const, by_week: weeks.map((_, n) => (n === 4 ? 1_500_000 : 0)) }]
      : []),
    { key: "other_out" as const, by_week: weeks.map(() => 0) },
    { key: "expected_in" as const, by_week: weeks.map(() => 0) },
  ];
  return {
    ok: true,
    today: "2026-11-14",
    weeks,
    tables: [
      {
        currency: "INR",
        opening: { minor: 120_000_000, as_of: "2026-10-31", source: "statements" },
        rows,
        closing: weeks.map((_, n) => (owner && n >= 4 ? 118_500_000 : 120_000_000)),
        items: owner
          ? [
              {
                key: "stipend:walk-cash-intern:2026-11",
                week: 4,
                on: "2026-11-30",
                name: "Walk Intern One's stipend for Nov 2026",
                minor: 1_500_000,
                counted_minor: 1_500_000,
                href: "/data/people/walk-cash-intern",
              },
            ]
          : [],
      },
    ],
    stipends_left_out: !owner,
    scenarios: null,
    assumptions: {
      burn_minor: null,
      burn_source: null,
      collections_minor: 0,
      growth: 0,
      hire_delay_months: 3,
      events: [],
    },
    tiles: [],
    lines: [],
    typed: { opening: {}, burn_minor: null, other_sales_minor: 0, caro: null },
    here: { money: false, statements: true, people: true },
  };
}

const previous = process.env.HQ_MAIL_MERGE_SOCKET;
beforeEach(() => {
  process.env.HQ_MAIL_MERGE_SOCKET = "/nonexistent/hq-test/s.sock";
  for (const mock of Object.values(mocks)) mock.mockReset();
});
afterEach(() => {
  if (previous === undefined) delete process.env.HQ_MAIL_MERGE_SOCKET;
  else process.env.HQ_MAIL_MERGE_SOCKET = previous;
});

describe("the cash view and the Owner", () => {
  it("as an Admin asks without the flag and draws the left-out line, no Stipends column", async () => {
    mocks.requireData.mockResolvedValue({ context: contextFor("admin"), allowed: true });
    mocks.readCash.mockResolvedValue(page(false));
    const { container } = render(await CashViewPage());
    expect(mocks.readCash).toHaveBeenCalledWith(false);
    expect(container.textContent).toContain(
      "Stipends are in the people ledger, which is for the Owner only. They are left out here.",
    );
    expect(container.querySelector("table")?.textContent).not.toContain("Stipends");
    expect(container.textContent).not.toContain("Walk Intern One");
    expect(container.textContent).toContain(
      "Opening cash is the statements' ₹12,00,000 as of 31 Oct 2026.",
    );
    expect(container.textContent).not.toContain("%");
  });

  it("as the Owner asks with the flag and draws the stipends", async () => {
    mocks.requireData.mockResolvedValue({ context: contextFor("owner"), allowed: true });
    mocks.readCash.mockResolvedValue(page(true));
    const { container } = render(await CashViewPage());
    expect(mocks.readCash).toHaveBeenCalledWith(true);
    expect(container.textContent).not.toContain("left out here");
    expect(container.querySelector("table")?.textContent).toContain("Stipends");
    expect(container.textContent).toContain("Walk Intern One's stipend for Nov 2026");
  });

  it("asks the CSV for stipends only for the Owner", async () => {
    for (const [role, owner] of [
      ["admin", false],
      ["owner", true],
    ] as const) {
      mocks.startBuild.mockReset();
      mocks.requireStaff.mockResolvedValue(contextFor(role));
      mocks.startBuild.mockResolvedValue({ ok: true, build: { build_id: "b" } });
      await cashCsv(new Request("http://127.0.0.1/data/numbers/cash/export") as never);
      expect(mocks.startBuild).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "cash_csv", owner }),
      );
    }
  });
});
