import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Assurance › Summary (ws-notes/security/spec.md §8.6): three tables (Systems, Assurance,
 * Buyers), a row per line with "Open", the attention words as a pill (words, never colour
 * alone), a module not loaded here as its row, the Owner-only line under Systems for an Admin
 * and not for the Owner, the service asked with the Owner flag only for the Owner, what buyers
 * usually ask for with its source, and no "%" anywhere. With the client mocked; every line is
 * invented.
 */

const mocks = vi.hoisted(() => ({
  requireData: vi.fn(),
  readAssuranceSummary: vi.fn(),
}));

vi.mock("@/lib/access/core", () => ({
  requireStaff: vi.fn(),
  hasCapability: (context: { me: { capabilities: string[] } }, capability: string) =>
    context.me.capabilities.includes(capability),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/data/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/access")>()),
  requireData: mocks.requireData,
}));
vi.mock("@/lib/data/api/assurance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/api/assurance")>()),
  readAssuranceSummary: mocks.readAssuranceSummary,
}));

import AssurancePage from "@/app/(portal)/data/assurance/page";
import type { AssuranceSummary } from "@/lib/data/api/assurance";
import { ATTENTION_WORDS } from "@/lib/data/labels-assurance";
import { OWNER_LEFT_OUT } from "@/lib/data/labels-controls";

const STAFF = { staff_id: "walk-staff", display_name: "Walk Staff", email: "staff@hq.test" };
const contextFor = (role: string) => ({
  token: "walk-token",
  me: { role, capabilities: ["mail:send"], staff: STAFF },
});

function summary(owner: boolean): AssuranceSummary {
  return {
    ok: true,
    owner,
    today: "2026-11-20",
    areas: [
      {
        area: "systems",
        lines: [
          {
            key: "tools:tools",
            area: "systems",
            title: "Tools",
            words: "12 tools recorded; 3 hold customer data.",
            attention: false,
            href: "/data/systems",
          },
          {
            key: "devices:devices",
            area: "systems",
            title: "Devices",
            words: "2 devices not checked in the last month.",
            attention: true,
            href: "/data/systems/devices",
          },
        ],
      },
      {
        area: "assurance",
        lines: [
          {
            key: "policies:policies",
            area: "assurance",
            title: "Policies",
            words: "8 of 11 expected policies have a current document; 1 lapsed.",
            attention: true,
            href: "/data/assurance/policies",
          },
          {
            key: "findings:findings",
            area: "assurance",
            title: "Findings",
            words: "5 open findings: 1 high, 4 low; 1 overdue.",
            attention: true,
            href: "/data/assurance/findings",
          },
          {
            key: "assurance:review",
            area: "assurance",
            title: "Management review",
            words: "Last management review 20 Nov 2026; next due 20 Nov 2027.",
            attention: false,
            href: "/data/assurance/reviews",
          },
        ],
      },
      { area: "buyers", lines: [] },
    ],
    absent: [
      {
        name: "logs",
        area: "systems",
        title: "Logs and time",
        words: "Logs and time is not loaded here.",
        href: "/data/systems/logs",
      },
      {
        name: "recovery",
        area: "systems",
        title: "Backups",
        words: "Backups is not loaded here.",
        href: "/data/systems/backups",
      },
      {
        name: "questionnaires",
        area: "buyers",
        title: "Questionnaires",
        words: "Questionnaires is not loaded here.",
        href: "/data/waitlist/diligence/questionnaires",
      },
      {
        name: "profiles",
        area: "buyers",
        title: "Customer duties",
        words: "Customer duties is not loaded here.",
        href: "/data/assurance/customers",
      },
    ],
  };
}

beforeEach(() => {
  mocks.readAssuranceSummary.mockImplementation(async (owner: boolean) => summary(owner));
});
afterEach(() => {
  vi.clearAllMocks();
});

async function renderAs(role: string) {
  mocks.requireData.mockResolvedValue({ context: contextFor(role), allowed: true });
  render(await AssurancePage());
}

describe("Assurance › Summary", () => {
  it("draws three tables, each row with its words and Open; absent modules as their rows", async () => {
    await renderAs("admin");
    const tables = screen.getAllByRole("table");
    expect(tables.map((table) => table.querySelector("caption")?.textContent)).toEqual([
      "Systems",
      "Assurance",
      "Buyers",
    ]);
    const systems = within(tables[0]!);
    const rows = systems.getAllByRole("row").slice(1);
    expect(rows.map((row) => row.querySelector(".table-title")?.textContent)).toEqual([
      "Tools",
      "Devices",
      "Logs and time",
      "Backups",
    ]);
    expect(within(rows[2]!).getByText("Not loaded here")).toBeTruthy();
    expect(within(rows[2]!).queryByText("Logs and time is not loaded here.")).toBeNull();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Systems",
      "Assurance",
      "Buyers",
      "What buyers usually ask for",
    ]);
    expect(within(rows[0]!).getByRole("link", { name: "Open" }).getAttribute("href")).toBe(
      "/data/systems",
    );
    const buyers = within(tables[2]!).getAllByRole("row").slice(1);
    expect(buyers.map((row) => row.querySelector(".table-title")?.textContent)).toEqual([
      "Questionnaires",
      "Customer duties",
    ]);
  });

  it("prints what wants him as a pill with words, never by colour alone", async () => {
    await renderAs("admin");
    const pills = screen.getAllByText(ATTENTION_WORDS);
    expect(pills).toHaveLength(3);
    const tables = screen.getAllByRole("table");
    const tools = within(tables[0]!).getAllByRole("row")[1]!;
    expect(within(tools).queryByText(ATTENTION_WORDS)).toBeNull();
    const devices = within(tables[0]!).getAllByRole("row")[2]!;
    expect(within(devices).getByText(ATTENTION_WORDS)).toBeTruthy();
  });

  it("an Admin: asked without the Owner flag, and the Owner-only line under Systems", async () => {
    await renderAs("admin");
    expect(mocks.readAssuranceSummary).toHaveBeenCalledWith(false);
    expect(screen.getByText(OWNER_LEFT_OUT)).toBeTruthy();
  });

  it("the Owner: asked with the flag, and no left-out line", async () => {
    await renderAs("owner");
    expect(mocks.readAssuranceSummary).toHaveBeenCalledWith(true);
    expect(screen.queryByText(OWNER_LEFT_OUT)).toBeNull();
  });

  it("what buyers usually ask for, with where HQ keeps it and its source; no per cent sign", async () => {
    await renderAs("admin");
    expect(screen.getByText("What buyers usually ask for")).toBeTruthy();
    const ask = within(
      document.querySelector('[data-section="summary-buyers-ask"]') as HTMLElement,
    );
    expect(ask.getByRole("link", { name: "Certification" }).getAttribute("href")).toBe(
      "/data/assurance/certification",
    );
    expect(ask.getAllByRole("listitem")).toHaveLength(8);
    const source = screen
      .getAllByRole("link", { name: "Source" })
      .find((link) => link.getAttribute("href")?.includes("theia.org"));
    expect(source).toBeTruthy();
    // A source's address (printed on paper only) may hold "%20"; the words on screen hold no "%".
    const words = document.body.cloneNode(true) as HTMLElement;
    for (const url of words.querySelectorAll(".hqdata-control-ref__url")) url.remove();
    expect(words.textContent).not.toContain("%");
    expect(document.body.textContent).toContain("not legal or certification advice");
  });
});
