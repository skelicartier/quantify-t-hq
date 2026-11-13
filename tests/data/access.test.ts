// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const core = vi.hoisted(() => ({
  requireStaff: vi.fn(),
}));

vi.mock("@/lib/access/core", () => ({
  requireStaff: core.requireStaff,
  hasCapability: (context: { me: { capabilities: string[] } }, capability: string) =>
    context.me.capabilities.includes(capability),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import { DATA_CAPABILITY, requireData, withDataNav } from "@/lib/data/access";

const previous = process.env.HQ_MAIL_MERGE_SOCKET;
afterEach(() => {
  if (previous === undefined) delete process.env.HQ_MAIL_MERGE_SOCKET;
  else process.env.HQ_MAIL_MERGE_SOCKET = previous;
  core.requireStaff.mockReset();
});

describe("where Data exists (G3)", () => {
  it("does not exist where no local service is set up: not found before sign-in, no rail group", async () => {
    delete process.env.HQ_MAIL_MERGE_SOCKET;
    await expect(requireData("/data")).rejects.toThrow("NOT_FOUND");
    expect(core.requireStaff).not.toHaveBeenCalled();
    expect(withDataNav(["mail:send", "crm:read"])).toEqual(["mail:send", "crm:read"]);
    process.env.HQ_MAIL_MERGE_SOCKET = "relative/path.sock";
    expect(withDataNav(["mail:send"])).not.toContain(DATA_CAPABILITY);
    await expect(requireData("/data")).rejects.toThrow("NOT_FOUND");
  });

  it("exists for Owners and Admins where the service is set up, and for nobody else", async () => {
    process.env.HQ_MAIL_MERGE_SOCKET = "/tmp/hq-data-test/s.sock";
    expect(withDataNav(["crm:read", "mail:send"])).toEqual([
      "crm:read",
      "mail:send",
      DATA_CAPABILITY,
    ]);
    expect(withDataNav(["crm:read", "crm:write"])).toEqual(["crm:read", "crm:write"]);
    expect(withDataNav(["mail:send", DATA_CAPABILITY])).toEqual(["mail:send", DATA_CAPABILITY]);
    core.requireStaff.mockResolvedValue({ token: "t", me: { capabilities: ["mail:send"] } });
    expect((await requireData("/data")).allowed).toBe(true);
    expect(core.requireStaff).toHaveBeenCalledWith("/data");
    core.requireStaff.mockResolvedValue({ token: "t", me: { capabilities: ["crm:read"] } });
    expect((await requireData("/data/files")).allowed).toBe(false);
  });
});
