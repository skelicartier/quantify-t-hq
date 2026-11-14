import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The people ledger is for the Owner only (company spec §8.2), with the role check and the
 * client mocked: as an Admin the People page and a person's page draw the owner line and never
 * read the ledger; as the Owner the page reads it once and draws the table; an Admin's action
 * is refused before anything is sent; the stipends CSV answers an Admin 403; and the rail's
 * capability comes with the role Owner only. Every person is invented.
 */

const mocks = vi.hoisted(() => ({
  requireData: vi.fn(),
  requireStaff: vi.fn(),
  readPeople: vi.fn(),
  readPerson: vi.fn(),
  addPerson: vi.fn(),
  readCopy: vi.fn(),
  startBuild: vi.fn(),
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
vi.mock("@/lib/data/api/people", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/api/people")>()),
  readPeople: mocks.readPeople,
  readPerson: mocks.readPerson,
  addPerson: mocks.addPerson,
  readCopy: mocks.readCopy,
}));
vi.mock("@/lib/data/api/builds", () => ({
  startBuild: mocks.startBuild,
  waitForBuild: vi.fn(),
  openBuild: vi.fn(),
}));

import { addPersonAction } from "@/app/(portal)/data/people/actions";
import PersonRecordPage from "@/app/(portal)/data/people/[personId]/page";
import PeoplePage from "@/app/(portal)/data/people/page";
import { GET as personCopy } from "@/app/(portal)/data/people/[personId]/copies/[copyId]/route";
import { GET as stipendsCsv } from "@/app/(portal)/data/people/stipends/route";
import { DATA_CAPABILITY, DATA_OWNER_CAPABILITY, withDataNav } from "@/lib/data/access";
import type { PeoplePage as PeopleData, PersonRow } from "@/lib/data/api/people";
import { DATA_OWNER_LINE } from "@/lib/data/owner";
import { INITIAL_ACTION_STATE } from "@/lib/forms/action-state";

const STAFF = { staff_id: "walk-staff", display_name: "Walk Staff", email: "staff@hq.test" };
const contextFor = (role: string, capabilities: string[]) => ({
  token: "walk-token",
  me: { role, capabilities, staff: STAFF },
});
const ADMIN = contextFor("admin", ["mail:send", "crm:read"]);
const OWNER = contextFor("owner", ["mail:send", "crm:read"]);
const INTERN = contextFor("intern", ["crm:read"]);

const WALKER = { staff_id: "walk-owner", name: "Walk Owner" };

function row(): PersonRow {
  return {
    person_id: "walk-intern",
    name: "Walk Intern",
    email: "intern@walkintern.example",
    kind: "intern",
    role_title: "Research intern",
    starts_on: "2026-12-01",
    ends_on: "2027-02-28",
    mentor: "Walk Mentor",
    brief: "",
    stipend: { amount: 15000, currency: "INR", pays_on: 7 },
    documents: [],
    evaluations: {
      midpoint: { due_on: "2027-01-14", held_on: null, by_name: "", outcome: "", summary: "" },
      final: { due_on: "2027-02-28", held_on: null, by_name: "", outcome: "", summary: "" },
    },
    certificate: null,
    offboarding: null,
    ended_on: null,
    hq_staff_id: null,
    notes: "",
    payments: [],
    created_at: "2026-11-14T06:00:00.000Z",
    created_by: WALKER,
    updated_at: "2026-11-14T06:00:00.000Z",
    updated_by: WALKER,
    state: "starting",
    letter: "missing",
    letter_on: null,
    next: { what: "Midpoint evaluation", on: "2027-01-14" },
    access: { held: 0, to_revoke: 0 },
  };
}

const PAGE: PeopleData = {
  ok: true,
  people: [row()],
  counts: { engaged: 0, starting: 1, ended: 0, all: 1 },
  state: "all",
  today: "2026-11-14",
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

const params = { searchParams: Promise.resolve({}) };

describe("the People page", () => {
  it("as an Admin draws the owner line and never reads the ledger", async () => {
    mocks.requireData.mockResolvedValue({ context: ADMIN, allowed: true });
    render(await PeoplePage(params));
    expect(screen.getByText(DATA_OWNER_LINE)).toBeTruthy();
    expect(DATA_OWNER_LINE).toBe("The people ledger is for the Owner only.");
    expect(mocks.readPeople).not.toHaveBeenCalled();
    expect(screen.queryByText("Add a person")).toBeNull();
    expect(screen.queryByText("Download the stipends (CSV)")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("as someone Data is not for draws Data's own line and never reads the ledger", async () => {
    mocks.requireData.mockResolvedValue({ context: INTERN, allowed: false });
    const { container } = render(await PeoplePage(params));
    expect(screen.getByText("Data is for Owners and Admins.")).toBeTruthy();
    expect(container.textContent).not.toContain("@");
    expect(mocks.readPeople).not.toHaveBeenCalled();
  });

  it("as the Owner reads the ledger once and draws the table", async () => {
    mocks.requireData.mockResolvedValue({ context: OWNER, allowed: true });
    mocks.readPeople.mockResolvedValue(PAGE);
    render(await PeoplePage(params));
    expect(mocks.readPeople).toHaveBeenCalledTimes(1);
    expect(mocks.readPeople).toHaveBeenCalledWith("all");
    const table = screen.getByRole("table");
    expect(table.id).toBe("table-people");
    expect(table.textContent).toContain("Walk Intern");
    expect(table.textContent).toContain("1 Dec 2026 – 28 Feb 2027");
    expect(table.textContent).toContain("Midpoint evaluation · 14 Jan");
    expect(table.textContent).toContain("Missing");
    expect(screen.getByText("Download the stipends (CSV)").getAttribute("href")).toBe(
      "/data/people/stipends",
    );
    expect(screen.queryByText(DATA_OWNER_LINE)).toBeNull();
  });
});

describe("one person's page, the actions and the CSV", () => {
  it("as an Admin draws the owner line and never reads the person", async () => {
    mocks.requireData.mockResolvedValue({ context: ADMIN, allowed: true });
    const { container } = render(
      await PersonRecordPage({ params: Promise.resolve({ personId: "walk-intern" }) }),
    );
    expect(screen.getByText(DATA_OWNER_LINE)).toBeTruthy();
    expect(mocks.readPerson).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Walk Intern");
    expect(container.textContent).not.toContain("15,000");
  });

  it("refuses an Admin's action with the owner line before anything is sent", async () => {
    mocks.requireStaff.mockResolvedValue(ADMIN);
    const form = new FormData();
    form.set("name", "Walk Intern");
    form.set("kind", "intern");
    form.set("starts_on", "2026-12-01");
    form.set("ends_on", "2027-02-28");
    const state = await addPersonAction(INITIAL_ACTION_STATE, form);
    expect(state).toEqual({ status: "error", message: DATA_OWNER_LINE });
    expect(mocks.addPerson).not.toHaveBeenCalled();
  });

  it("answers an Admin's stipends CSV with 403 and starts no build", async () => {
    mocks.requireStaff.mockResolvedValue(ADMIN);
    const answer = await stipendsCsv(new Request("http://127.0.0.1/data/people/stipends") as never);
    expect(answer.status).toBe(403);
    expect(await answer.text()).toBe("Forbidden");
    expect(mocks.startBuild).not.toHaveBeenCalled();
  });
});

describe("a signed copy from the ledger", () => {
  const LETTER = "%PDF-1.4 invented letter\n";
  const copyArgs = {
    params: Promise.resolve({ personId: "walk-intern", copyId: "walk-copy" }),
  };
  const ask = () =>
    personCopy(
      new Request("http://127.0.0.1/data/people/walk-intern/copies/walk-copy") as never,
      copyArgs,
    );

  it("refuses the Admin and the intern with the owner line, and never asks the service", async () => {
    for (const context of [ADMIN, INTERN]) {
      mocks.requireStaff.mockResolvedValue(context);
      const answer = await ask();
      expect(answer.status).toBe(403);
      expect(await answer.text()).toBe(DATA_OWNER_LINE);
    }
    expect(mocks.readCopy).not.toHaveBeenCalled();
  });

  it("gives the Owner the copy as a download", async () => {
    mocks.requireStaff.mockResolvedValue(OWNER);
    mocks.readCopy.mockResolvedValue({
      ok: true,
      copy: { name: "walk-letter.pdf" },
      type: "application/pdf",
      content: Buffer.from(LETTER).toString("base64"),
    });
    const answer = await ask();
    expect(answer.status).toBe(200);
    expect(mocks.readCopy).toHaveBeenCalledWith("walk-intern", "walk-copy");
    expect(answer.headers.get("content-disposition")).toMatch(/^attachment/);
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    expect(await answer.text()).toBe(LETTER);
  });
});

describe("the rail's People ledger link", () => {
  it("comes with the role Owner only", () => {
    const admin = withDataNav(["mail:send"], "admin");
    expect(admin).toContain(DATA_CAPABILITY);
    expect(admin).not.toContain(DATA_OWNER_CAPABILITY);
    expect(withDataNav(["mail:send"], "owner")).toContain(DATA_OWNER_CAPABILITY);
    expect(withDataNav(["crm:read"], "owner")).not.toContain(DATA_OWNER_CAPABILITY);
  });
});
