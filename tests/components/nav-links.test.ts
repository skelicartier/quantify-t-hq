import { describe, expect, it } from "vitest";

import { NAV_GROUPS, visibleNavGroups } from "@/components/shell/nav-links";

describe("capability-filtered navigation", () => {
  it("an intern sees no Business, Team or Admin surface", () => {
    const groups = visibleNavGroups(["crm:read", "deals:read", "tickets:read"]);
    const labels = groups.map((group) => group.label);
    expect(labels).toContain("CRM");
    expect(labels).toContain("Desk");
    expect(labels).not.toContain("Business");
    expect(labels).not.toContain("Team");
    const system = groups.find((group) => group.label === "System");
    // The company's particulars are on every printed page already; reading them is everyone's.
    expect(system?.links.map((link) => link.href)).toEqual([
      "/company",
      "/me/security",
      "/me/digests",
    ]);
  });

  it("an owner sees every group", () => {
    const everything = NAV_GROUPS.flatMap((group) => group.links)
      .map((link) => link.capability)
      .filter((capability): capability is string => Boolean(capability));
    const groups = visibleNavGroups([...new Set(everything)]);
    expect(groups.map((group) => group.label)).toEqual(NAV_GROUPS.map((group) => group.label));
  });

  it("home and my security are reachable with no capability at all", () => {
    const groups = visibleNavGroups([]);
    const hrefs = groups.flatMap((group) => group.links.map((link) => link.href));
    expect(hrefs).toContain("/home");
    expect(hrefs).toContain("/me/security");
  });

  it("the Data group is absent without local:data", () => {
    // Even an Owner's real capabilities do not show it: the layout adds the made-up one
    // only where the local service is set up.
    const groups = visibleNavGroups(["mail:send", "hq:admin", "crm:read", "crm:write"]);
    expect(groups.map((group) => group.label)).not.toContain("Data");
    // (`/data-health` is CRM's and stays; only `/data` and `/data/…` are the group's.)
    expect(
      groups
        .flatMap((group) => group.links)
        .some((link) => link.href === "/data" || link.href.startsWith("/data/")),
    ).toBe(false);
  });

  it("an Owner with local:data and local:data:owner sees thirteen Data links in order, right after Command", () => {
    const everything = NAV_GROUPS.flatMap((group) => group.links)
      .map((link) => link.capability)
      .filter((capability): capability is string => Boolean(capability));
    const groups = visibleNavGroups([
      ...new Set([...everything, "local:data", "local:data:owner"]),
    ]);
    expect(groups[1]?.label).toBe("Data");
    const data = groups.find((group) => group.label === "Data");
    expect(data?.links.map((link) => link.href)).toEqual([
      "/data",
      "/data/files",
      "/data/leads",
      "/data/replies",
      "/data/waitlist",
      "/data/investors",
      "/data/notes",
      "/data/contacts",
      "/data/decisions",
      "/data/company",
      "/data/people",
      "/data/dates",
      "/data/numbers",
    ]);
    expect(data?.links.map((link) => link.label)).toEqual([
      "Data",
      "Files",
      "All leads",
      "Replies",
      "Waitlist",
      "Investors",
      "Notes",
      "Contacts",
      "Decisions",
      "Company record",
      "People ledger",
      "Key dates",
      "Numbers",
    ]);
    expect(data?.links.find((link) => link.href === "/data/files")?.key).toBe("f");
    expect(data?.links.find((link) => link.href === "/data")?.activePrefix).toBeUndefined();
  });

  it("an Admin with local:data but not local:data:owner sees no People link", () => {
    const everything = NAV_GROUPS.flatMap((group) => group.links)
      .map((link) => link.capability)
      .filter((capability): capability is string => Boolean(capability))
      .filter((capability) => capability !== "local:data:owner");
    const groups = visibleNavGroups([...new Set([...everything, "local:data"])]);
    const data = groups.find((group) => group.label === "Data");
    expect(data?.links.map((link) => link.href)).toEqual([
      "/data",
      "/data/files",
      "/data/leads",
      "/data/replies",
      "/data/waitlist",
      "/data/investors",
      "/data/notes",
      "/data/contacts",
      "/data/decisions",
      "/data/company",
      "/data/dates",
      "/data/numbers",
    ]);
  });
});
