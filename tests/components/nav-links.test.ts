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
});
