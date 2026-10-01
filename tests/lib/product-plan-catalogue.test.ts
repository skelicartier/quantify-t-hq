import {
  allowanceRatio,
  allowanceStanding,
  canonicalPlan,
  CANONICAL_PLANS,
  chatModelForPlan,
  researchModelForPlan,
  FEATURE_KEYS,
  featureLabel,
  featureNote,
  featurePeriod,
  formatAllowance,
  isBooleanFeature,
  isQuotaFeature,
  planDefault,
  planDefaults,
  planLabel,
  QUOTA_FEATURES,
  TRIAL_DAYS,
  TRIAL_DEEP_RESEARCH_CAP,
  TRIAL_PLAN,
} from "@/lib/product/plan-catalogue";
import {
  effectiveEntitlements,
  isActiveOverride,
  subscriptionEventLabel,
} from "@/lib/product/subscription";
import type { AccountApiEntitlementOverride } from "@/lib/product/account-api";

/**
 * The console's copy of the catalogue is a label for a decision the Account API has
 * already made. These expectations are written out literally, in the same order the API
 * writes them, so a change on either side fails here rather than in someone's billing.
 */
const EXPECTED: Record<string, Array<number | null | boolean>> = {
  // ai_chat, deep_research, pulse_universe, tracked_symbols, watchlists,
  // portfolios, saved_screens, history_years, point_in_time, export, intelligence
  free: [20, 1, 25, 50, 2, 1, 2, 5, false, false, false],
  pro: [300, 10, 250, 500, 25, 10, 50, 15, true, true, true],
  desk: [1000, 40, 2000, 5000, null, 100, null, null, true, true, true],
  teams: [1000, 40, 2000, 5000, null, null, null, null, true, true, true],
};

function override(
  fields: Partial<AccountApiEntitlementOverride> & { feature_key: string },
): AccountApiEntitlementOverride {
  return {
    source: "override",
    source_ref: "",
    limit_value: null,
    bool_value: null,
    effective_from: "2026-09-01T00:00:00Z",
    effective_to: "2026-12-01T00:00:00Z",
    granted_by: "860aac31-73fb-4e10-8f3f-bfcf22a71c11",
    reason: "Pilot",
    ...fields,
  };
}

describe("plan catalogue", () => {
  it.each(CANONICAL_PLANS)("publishes every %s allowance exactly as the API does", (plan) => {
    const values = planDefaults(plan).map(({ value }) =>
      value.kind === "boolean" ? value.enabled : value.limit,
    );

    expect(values).toEqual(EXPECTED[plan]);
  });

  it("names the trial as Desk for fourteen days with Deep Research held back", () => {
    expect(TRIAL_PLAN).toBe("desk");
    expect(TRIAL_DAYS).toBe(14);
    expect(TRIAL_DEEP_RESEARCH_CAP).toBe(8);
    expect(TRIAL_DEEP_RESEARCH_CAP).toBeLessThan(
      planDefault("desk", "deep_research").kind === "limit"
        ? (planDefault("desk", "deep_research") as { limit: number }).limit
        : 0,
    );
  });

  it("meters only the two features that cost money, and never Pulse", () => {
    expect(QUOTA_FEATURES).toEqual(["ai_chat", "deep_research"]);
    expect(isQuotaFeature("pulse_universe")).toBe(false);
    expect(featurePeriod("pulse_universe")).toBe("lifetime");
    expect(FEATURE_KEYS.filter(isBooleanFeature)).toEqual([
      "point_in_time",
      "export",
      "intelligence",
    ]);
    expect(isQuotaFeature("intelligence")).toBe(false);
  });

  it("gives the model-assisted reading to paying plans only", () => {
    // Free is deliberately false rather than absent. The command bar and the planner read
    // the common phrasings deterministically on every plan; what this switch buys is a
    // model being asked about the phrasings they do not cover.
    expect(planDefault("free", "intelligence")).toEqual({ kind: "boolean", enabled: false });
    for (const plan of ["pro", "desk", "teams"] as const) {
      expect(planDefault(plan, "intelligence")).toEqual({ kind: "boolean", enabled: true });
    }
    expect(featureLabel("intelligence")).toBe("Model-assisted intelligence");
    expect(featureNote("intelligence")).toContain("deterministically");
  });

  it("runs every plan on one provider", () => {
    // One bill, one status page, one set of terms. A plan differs from another by which
    // Claude it reaches, never by which company answers it.
    for (const plan of CANONICAL_PLANS) {
      expect(chatModelForPlan(plan)).toMatch(/^claude-/);
      expect(researchModelForPlan(plan)).toMatch(/^claude-/);
    }
  });

  it("gives research its own model, stronger than chat on every paid plan", () => {
    // Different jobs: a chat turn is waited through, a report is unattended and cited.
    expect(researchModelForPlan("free")).toBe("claude-haiku");
    for (const plan of ["pro", "desk", "teams"] as const) {
      expect(researchModelForPlan(plan)).toBe("claude-sonnet");
    }
    expect(researchModelForPlan("pro")).not.toBe(chatModelForPlan("pro"));
  });

  it("resolves an unknown or legacy tier without granting anything extra", () => {
    expect(canonicalPlan("professional")).toBe("desk");
    expect(canonicalPlan("starter")).toBe("pro");
    expect(canonicalPlan(" PRO ")).toBe("pro");
    expect(canonicalPlan("wildly-made-up")).toBe("free");
    expect(canonicalPlan(null)).toBe("free");
    expect(planLabel("professional")).toBe("Desk");
  });

  it("pins the chat model each plan runs on", () => {
    expect(chatModelForPlan("free")).toBe("claude-haiku");
    expect(chatModelForPlan("pro")).toBe("claude-haiku");
    expect(chatModelForPlan("desk")).toBe("claude-sonnet");
    expect(chatModelForPlan("teams")).toBe("claude-sonnet");
  });

  it("reads an absent limit as unlimited, never as zero", () => {
    expect(formatAllowance(null)).toBe("Unlimited");
    expect(formatAllowance(undefined)).toBe("Unlimited");
    expect(formatAllowance(0)).toBe("0");
    expect(allowanceStanding(9_000, null)).toBe("unlimited");
    expect(allowanceRatio(9_000, null)).toBeNull();
  });

  it("calls a spend near or over only against a real ceiling", () => {
    expect(allowanceStanding(100, 300)).toBe("healthy");
    expect(allowanceStanding(240, 300)).toBe("near");
    expect(allowanceStanding(300, 300)).toBe("over");
    expect(allowanceStanding(301, 300)).toBe("over");
    expect(allowanceRatio(600, 300)).toBe(1);
  });
});

describe("effective entitlements", () => {
  it("shows the plan default beside the override that replaced it", () => {
    const rows = effectiveEntitlements("pro", [
      override({ feature_key: "deep_research", limit_value: 100 }),
    ]);
    const research = rows.find((row) => row.feature === "deep_research");

    expect(research?.planValue).toEqual({ kind: "limit", limit: 10 });
    expect(research?.effective).toEqual({ kind: "limit", limit: 100 });
    expect(research?.override?.reason).toBe("Pilot");

    const chat = rows.find((row) => row.feature === "ai_chat");
    expect(chat?.override).toBeNull();
    expect(chat?.effective).toEqual({ kind: "limit", limit: 300 });
  });

  it("never lets an override restrict what the plan already grants", () => {
    const rows = effectiveEntitlements("pro", [
      override({ feature_key: "deep_research", limit_value: 2 }),
    ]);

    expect(rows.find((row) => row.feature === "deep_research")?.effective).toEqual({
      kind: "limit",
      limit: 10,
    });
    expect(rows.find((row) => row.feature === "deep_research")?.override).toBeNull();
  });

  it("treats a null limit as unlimited and lets unlimited beat every number", () => {
    const rows = effectiveEntitlements("pro", [
      override({ feature_key: "portfolios", limit_value: null }),
      override({ feature_key: "portfolios", limit_value: 40 }),
    ]);

    expect(rows.find((row) => row.feature === "portfolios")?.effective).toEqual({
      kind: "limit",
      limit: null,
    });
  });

  it("turns a boolean feature on but never off", () => {
    const enabled = effectiveEntitlements("free", [
      override({ feature_key: "export", bool_value: true }),
    ]);
    expect(enabled.find((row) => row.feature === "export")?.effective).toEqual({
      kind: "boolean",
      enabled: true,
    });

    const disabled = effectiveEntitlements("pro", [
      override({ feature_key: "export", bool_value: false }),
    ]);
    expect(disabled.find((row) => row.feature === "export")?.effective).toEqual({
      kind: "boolean",
      enabled: true,
    });
  });

  it("ignores an override outside its window", () => {
    const now = Date.parse("2027-01-01T00:00:00Z");
    const expired = override({ feature_key: "deep_research", limit_value: 100 });
    expect(isActiveOverride(expired, now)).toBe(false);

    const rows = effectiveEntitlements("pro", [expired], now);
    expect(rows.find((row) => row.feature === "deep_research")?.effective).toEqual({
      kind: "limit",
      limit: 10,
    });
  });

  it("names the two change events in words an operator can scan", () => {
    expect(subscriptionEventLabel("account.subscription_changed")).toBe("Plan changed");
    expect(subscriptionEventLabel("account.entitlement_changed")).toBe("Override changed");
  });
});
