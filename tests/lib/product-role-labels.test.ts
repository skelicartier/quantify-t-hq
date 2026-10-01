import {
  ASSIGNABLE_ROLES,
  capabilityLabel,
  isAssignableRole,
  mismatchLabel,
  mismatchTone,
  roleDescription,
  roleLabel,
  roleReportStatus,
  roleTone,
} from "@/lib/product/role-labels";

describe("role labels", () => {
  it("names every assignable role and degrades unknown ones", () => {
    // The order is the order the picker shows, so it reads as a ladder of reach rather
    // than an alphabet. It mirrors CANONICAL_ROLES in the Account API's capabilities.py.
    expect(ASSIGNABLE_ROLES).toEqual([
      "owner",
      "admin",
      "support_manager",
      "billing_manager",
      "auditor",
      "support",
      "user",
    ]);
    expect(roleLabel("owner")).toBe("Owner");
    expect(roleLabel("support")).toBe("Support agent");
    expect(roleLabel("support_manager")).toBe("Support manager");
    expect(roleLabel("something-else")).toBe("Something Else");
    expect(roleLabel(null)).toBe("User");
    expect(roleDescription("admin")).toMatch(/cannot assign roles/i);
    expect(roleDescription("auditor")).toMatch(/changes nothing/i);
    expect(roleDescription("mystery")).toBe("");
    expect(isAssignableRole("owner")).toBe(true);
    expect(isAssignableRole("support_manager")).toBe(true);
    expect(isAssignableRole("root")).toBe(false);
  });

  it("gives every role a badge tone without inventing one per role", () => {
    // Five near-identical outlines would read as five unrelated things rather than as a
    // scale, so the tones say how much reach a role has and not which role it is.
    expect(roleTone("admin")).toBe("admin");
    expect(roleTone("support_manager")).toBe("admin");
    expect(roleTone("billing_manager")).toBe("admin");
    expect(roleTone("auditor")).toBe("support");
    expect(roleTone("support")).toBe("support");
    expect(roleTone(undefined)).toBe("user");
    expect(roleTone("root")).toBe("user");
  });

  it("names every support capability in words a person on the desk would use", () => {
    expect(capabilityLabel("support:read")).toBe("Read support conversations");
    expect(capabilityLabel("support:read-all")).toBe("Read every support conversation");
    expect(capabilityLabel("support:reply")).toBe("Answer support conversations");
    expect(capabilityLabel("support:manage")).toBe("Assign and close support conversations");
    expect(capabilityLabel("staff:write")).toBe("Manage staff access");
  });

  it("translates capability tokens into product language", () => {
    expect(capabilityLabel("roles:write")).toBe("Manage roles");
    expect(capabilityLabel("audit:read")).toBe("Audit access");
    expect(capabilityLabel("account:read-any")).toBe("Administration access");
    expect(capabilityLabel("future:thing")).toBe("Future thing");
  });

  it("describes reconciliation states without backend vocabulary", () => {
    expect(mismatchLabel("match")).toBe("In sync");
    expect(mismatchLabel("missing-in-database")).toBe("Missing from database");
    expect(mismatchLabel("break-glass-override")).toBe("Set by configuration");
    expect(mismatchLabel(undefined)).toBe("Unknown");
    expect(mismatchTone("match")).toBe("live");
    expect(mismatchTone("missing-in-legacy")).toBe("neutral");
    expect(mismatchTone("divergent")).toBe("attention");
  });

  it("names the subscription capability in words an operator uses", () => {
    expect(capabilityLabel("subscription:write")).toBe("Manage subscriptions");
  });

  it("keeps the role report verdict strings", () => {
    const base = {
      legacy_source_available: true,
      legacy_unparsable_entry_count: 0,
      legacy_retirement_ready: false,
    };
    expect(roleReportStatus(null)).toBe("Not permitted");
    expect(roleReportStatus({ ...base, legacy_source_available: false })).toBe(
      "Legacy store unreadable",
    );
    expect(roleReportStatus({ ...base, legacy_unparsable_entry_count: 2 })).toBe(
      "Legacy entries need review",
    );
    expect(roleReportStatus({ ...base, legacy_retirement_ready: true })).toBe(
      "Ready for reviewed cutover",
    );
    expect(roleReportStatus(base)).toBe("Differences need review");
  });
});
