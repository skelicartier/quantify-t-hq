import {
  canonicalPlan,
  FEATURE_KEYS,
  isBooleanFeature,
  planDefault,
  type FeatureKey,
  type PlanDefault,
} from "@/lib/product/plan-catalogue";
import type { AccountApiEntitlementOverride } from "@/lib/product/account-api";

/**
 * State and display maths for the two subscription mutations.
 *
 * Nothing here decides anything. The Account API resolves entitlements and enforces
 * quotas; this file only arranges what it returned so an operator can read a plan
 * default and an override side by side instead of one merged number.
 */

export type AdminSubscriptionPlanState = {
  status: "idle" | "success" | "error" | "conflict";
  message: string;
  /**
   * The profile version the next attempt should compare against. The API refuses a
   * stale one and names the current version in the conflict, so a 409 hands the form
   * the right number and the operator confirms once, deliberately, rather than the
   * console silently retrying a write it was told not to make.
   */
  expectedProfileVersion: number;
};

export const INITIAL_ADMIN_SUBSCRIPTION_PLAN_STATE: AdminSubscriptionPlanState = {
  status: "idle",
  message: "",
  expectedProfileVersion: 1,
};

export type AdminEntitlementOverrideState = {
  status: "idle" | "success" | "error";
  message: string;
  /** Every active override the API returned with the last change, plan-wide. */
  overrides: AccountApiEntitlementOverride[];
};

export const INITIAL_ADMIN_ENTITLEMENT_OVERRIDE_STATE: AdminEntitlementOverrideState = {
  status: "idle",
  message: "",
  overrides: [],
};

/** Expiries the console offers. An override with no end date is not one of them. */
export const OVERRIDE_EXPIRY_CHOICES = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "1 year" },
  { value: "730", label: "2 years" },
] as const;

export const DEFAULT_OVERRIDE_EXPIRY_DAYS = 90;
/** The API's ceiling; anything longer is refused there, so the console never offers it. */
export const MAX_OVERRIDE_EXPIRY_DAYS = 3650;
export const OVERRIDE_REASON_MIN = 8;
export const OVERRIDE_REASON_MAX = 200;

export function isOverrideExpiryChoice(value: unknown): boolean {
  return (
    typeof value === "string" &&
    OVERRIDE_EXPIRY_CHOICES.some((choice) => choice.value === value.trim())
  );
}

/** The two audit event types, read back as something an operator can scan. */
export function subscriptionEventLabel(eventType: string): string {
  if (eventType === "account.subscription_changed") return "Plan changed";
  if (eventType === "account.entitlement_changed") return "Override changed";
  return eventType;
}

function instant(value: string | null | undefined): number | null {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isNaN(parsed) ? null : parsed;
}

/** An override outside its window grants nothing, exactly as the resolver treats it. */
export function isActiveOverride(
  override: AccountApiEntitlementOverride,
  now: number | undefined,
): boolean {
  if (now === undefined) return true;
  const from = instant(override.effective_from);
  const to = instant(override.effective_to);
  if (from !== null && from > now) return false;
  if (to !== null && to <= now) return false;
  return true;
}

export type EffectiveEntitlement = {
  feature: FeatureKey;
  /** What the plan alone grants. */
  planValue: PlanDefault;
  /** The override that won, if one did. */
  override: AccountApiEntitlementOverride | null;
  /** Plan overlaid with that override. */
  effective: PlanDefault;
};

/**
 * Plan defaults overlaid with overrides, the way `entitlements.resolve` does it: the
 * more generous of two active rows wins and unlimited beats every number, so an
 * operator who grants the same thing twice cannot accidentally restrict an account.
 *
 * This is a rendering of a decision the server has already made, not the decision.
 */
export function effectiveEntitlements(
  plan: string | null | undefined,
  overrides: readonly AccountApiEntitlementOverride[] = [],
  now?: number | undefined,
): EffectiveEntitlement[] {
  const resolved = canonicalPlan(plan);
  return FEATURE_KEYS.map((feature) => {
    const planValue = planDefault(resolved, feature);
    let effective = planValue;
    let winner: AccountApiEntitlementOverride | null = null;

    for (const override of overrides) {
      if (override.feature_key !== feature) continue;
      if (!isActiveOverride(override, now)) continue;

      if (isBooleanFeature(feature)) {
        if (override.bool_value === true && effective.kind === "boolean" && !effective.enabled) {
          effective = { kind: "boolean", enabled: true };
          winner = override;
        }
        continue;
      }
      if (effective.kind !== "limit") continue;
      if (override.limit_value === null) {
        effective = { kind: "limit", limit: null };
        winner = override;
        continue;
      }
      if (effective.limit === null) continue;
      if (override.limit_value > effective.limit) {
        effective = { kind: "limit", limit: override.limit_value };
        winner = override;
      }
    }

    return { feature, planValue, override: winner, effective };
  });
}
