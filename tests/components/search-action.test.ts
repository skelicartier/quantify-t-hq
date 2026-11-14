// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The palette's search (raise spec §7.5): for an Owner where Data is set up, Data's hits
 * come first, in Data's group order, then the service's; for an intern there are none of
 * Data's, and Data is never asked. A Data failure gives no Data hits and the service's
 * still come. Every name is invented.
 */

const mocks = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  readSearch: vi.fn(),
  searchData: vi.fn(),
}));

vi.mock("@/lib/access/core", () => ({
  requireStaff: mocks.requireStaff,
  hasCapability: (context: { me: { capabilities: string[] } }, capability: string) =>
    context.me.capabilities.includes(capability),
}));
vi.mock("@/lib/security/action-origin", () => ({
  requireSameOriginServerAction: async () => undefined,
}));
vi.mock("@/lib/api/search", () => ({
  readSearch: mocks.readSearch,
  readRecent: vi.fn(),
}));
vi.mock("@/lib/data/api/search", () => ({ searchData: mocks.searchData }));

import { searchRecordsAction } from "@/app/(portal)/_actions/search";
import { DataUnavailableError } from "@/lib/data/socket";

const SERVICE = {
  q: "walk",
  kind: "",
  total: 1,
  groups: [
    {
      kind: "company",
      label: "Companies",
      count: 1,
      more: false,
      results: [
        {
          kind: "company",
          id: "c1",
          title: "Walk Holdings",
          subtitle: "Mumbai",
          href: "/companies/c1",
          snippet: "",
          archived: false,
          at: null,
        },
      ],
    },
  ],
};

const DATA = {
  ok: true,
  query: "walk",
  total: 2,
  groups: [
    {
      kind: "lead",
      label: "All leads",
      count: 1,
      hits: [
        {
          kind: "lead",
          id: "l1",
          title: "Asha Walk",
          subtitle: "Partner · Walk Fund 1 · Sent",
          snippet: "asha@fund1.example",
          href: "/data/leads/l1",
        },
      ],
    },
    {
      kind: "contact",
      label: "Contacts",
      count: 1,
      hits: [
        {
          kind: "contact",
          id: "k1",
          title: "Walk Lawyer",
          subtitle: "",
          snippet: "",
          href: "/data/contacts/k1",
        },
      ],
    },
  ],
};

const previous = process.env.HQ_MAIL_MERGE_SOCKET;
beforeEach(() => {
  process.env.HQ_MAIL_MERGE_SOCKET = "/tmp/hq-search-test/s.sock";
  mocks.readSearch.mockResolvedValue(SERVICE);
  mocks.searchData.mockResolvedValue(DATA);
});
afterEach(() => {
  if (previous === undefined) delete process.env.HQ_MAIL_MERGE_SOCKET;
  else process.env.HQ_MAIL_MERGE_SOCKET = previous;
  vi.clearAllMocks();
});

const owner = { token: "t", me: { capabilities: ["mail:send", "crm:read"] } };
const intern = { token: "t", me: { capabilities: ["crm:read"] } };

describe("searchRecordsAction", () => {
  it("puts Data's hits first for an Owner, in Data's order, then the service's", async () => {
    mocks.requireStaff.mockResolvedValue(owner);
    const hits = await searchRecordsAction("  walk ");
    expect(mocks.searchData).toHaveBeenCalledWith("walk", { limit: 5 });
    expect(hits).toEqual([
      {
        kind: "data_lead",
        id: "l1",
        title: "Asha Walk",
        subtitle: "Partner · Walk Fund 1 · Sent · asha@fund1.example",
        href: "/data/leads/l1",
      },
      {
        kind: "data_contact",
        id: "k1",
        title: "Walk Lawyer",
        subtitle: "",
        href: "/data/contacts/k1",
      },
      {
        kind: "company",
        id: "c1",
        title: "Walk Holdings",
        subtitle: "Mumbai",
        href: "/companies/c1",
      },
    ]);
  });

  it("gives an intern none of Data's, and never asks Data", async () => {
    mocks.requireStaff.mockResolvedValue(intern);
    const hits = await searchRecordsAction("walk");
    expect(mocks.searchData).not.toHaveBeenCalled();
    expect(hits.map((hit) => hit.kind)).toEqual(["company"]);
  });

  it("asks Data nowhere it is not set up", async () => {
    delete process.env.HQ_MAIL_MERGE_SOCKET;
    mocks.requireStaff.mockResolvedValue(owner);
    expect((await searchRecordsAction("walk")).map((hit) => hit.kind)).toEqual(["company"]);
    expect(mocks.searchData).not.toHaveBeenCalled();
  });

  it("keeps the service's hits when Data cannot answer", async () => {
    mocks.requireStaff.mockResolvedValue(owner);
    mocks.searchData.mockRejectedValue(new DataUnavailableError("the service is not running"));
    expect((await searchRecordsAction("walk")).map((hit) => hit.kind)).toEqual(["company"]);
  });

  it("asks nothing for under two letters", async () => {
    mocks.requireStaff.mockResolvedValue(owner);
    expect(await searchRecordsAction("w")).toEqual([]);
    expect(mocks.readSearch).not.toHaveBeenCalled();
    expect(mocks.searchData).not.toHaveBeenCalled();
  });
});
