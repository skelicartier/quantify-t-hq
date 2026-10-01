/**
 * The plan catalogue, as the console renders it.
 *
 * The Account API's `account_api/entitlements.py` is the only judge of what an account
 * may do: every number below is a *label for what the server already decided*, never an
 * input to a decision. Nothing in the console grants, denies, or meters anything.
 *
 * The mirror exists because two of the three screens have no other way to show a plan
 * default. `GET me/entitlements` returns the resolved value and its source but not the
 * default it was resolved from, and there is no administrative read of another account's
 * resolved entitlements at all — so "Pro allows 300, this account was raised to 900" can
 * only be rendered with the plan template in hand. Showing the effective number alone is
 * what makes an operator approve a comp they cannot see the size of.
 *
 * When the catalogue changes in the API, change it here in the same commit. The two are
 * pinned together by tests/lib/plan-catalogue.test.ts, which states the expected numbers
 * literally so a silent drift fails the build rather than the billing.
 */

export const CANONICAL_PLANS = ["free", "pro", "desk", "teams"] as const;
export type PlanKey = (typeof CANONICAL_PLANS)[number];

export const FEATURE_KEYS = [
  "ai_chat",
  "deep_research",
  "pulse_universe",
  "tracked_symbols",
  "watchlists",
  "portfolios",
  "saved_screens",
  "history_years",
  "point_in_time",
  "export",
  "intelligence",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** Metered: these cost money per use and are the only features that carry a counter. */
export const QUOTA_FEATURES = ["ai_chat", "deep_research"] as const;
/** On or off, never counted. */
export const BOOLEAN_FEATURES = ["point_in_time", "export", "intelligence"] as const;

export type FeaturePeriod = "day" | "month" | "lifetime";

const FEATURE_PERIODS: Record<FeatureKey, FeaturePeriod> = {
  ai_chat: "month",
  deep_research: "month",
  pulse_universe: "lifetime",
  tracked_symbols: "lifetime",
  watchlists: "lifetime",
  portfolios: "lifetime",
  saved_screens: "lifetime",
  history_years: "lifetime",
  point_in_time: "lifetime",
  export: "lifetime",
  intelligence: "lifetime",
};

/** A trial is Desk for fourteen days with Deep Research held below Desk's allowance. */
export const TRIAL_PLAN: PlanKey = "desk";
export const TRIAL_DAYS = 14;
export const TRIAL_DEEP_RESEARCH_CAP = 8;

/**
 * Every plan is Anthropic. One provider is one bill, one status page and one set of terms
 * to have read — and a Free account differs from a Desk one by which Claude it reaches
 * rather than by which company answers it.
 */
const CHAT_MODEL_BY_PLAN: Record<PlanKey, string> = {
  free: "claude-haiku",
  pro: "claude-haiku",
  desk: "claude-sonnet",
  teams: "claude-sonnet",
};

/**
 * Deep Research runs on its own model. The two are different jobs: a chat turn is waited
 * through, where Haiku's speed is the feature; a report is unattended, cited, and read as
 * evidence later, so it gets the stronger model on every plan that sells one.
 */
const RESEARCH_MODEL_BY_PLAN: Record<PlanKey, string> = {
  free: "claude-haiku",
  pro: "claude-sonnet",
  desk: "claude-sonnet",
  teams: "claude-sonnet",
};

/** Model id to the name a person reads. Shared by chat and research: the ids are the same. */
const MODEL_LABELS: Record<string, string> = {
  "claude-haiku": "Claude Haiku",
  "claude-sonnet": "Claude Sonnet",
  "claude-opus": "Claude Opus",
};

/**
 * `null` is unlimited, never zero. A bug that reads a missing limit as zero locks a
 * paying account out; one that reads it as unlimited gives the product away — so the two
 * are spelled differently everywhere they are handled.
 */
const PLAN_LIMITS: Record<PlanKey, Record<FeatureKey, number | boolean | null>> = {
  free: {
    ai_chat: 20,
    deep_research: 1,
    pulse_universe: 25,
    tracked_symbols: 50,
    watchlists: 2,
    portfolios: 1,
    saved_screens: 2,
    history_years: 5,
    point_in_time: false,
    export: false,
    intelligence: false,
  },
  pro: {
    ai_chat: 300,
    deep_research: 10,
    pulse_universe: 250,
    tracked_symbols: 500,
    watchlists: 25,
    portfolios: 10,
    saved_screens: 50,
    history_years: 15,
    point_in_time: true,
    export: true,
    intelligence: true,
  },
  desk: {
    ai_chat: 1000,
    deep_research: 40,
    pulse_universe: 2000,
    tracked_symbols: 5000,
    watchlists: null,
    portfolios: 100,
    saved_screens: null,
    history_years: null,
    point_in_time: true,
    export: true,
    intelligence: true,
  },
  // Teams is not sold. It is where an account negotiated by hand sits, and every number
  // on it is expected to be replaced by an override.
  teams: {
    ai_chat: 1000,
    deep_research: 40,
    pulse_universe: 2000,
    tracked_symbols: 5000,
    watchlists: null,
    portfolios: null,
    saved_screens: null,
    history_years: null,
    point_in_time: true,
    export: true,
    intelligence: true,
  },
};

const PLAN_LABELS: Record<PlanKey, string> = {
  free: "Free",
  pro: "Pro",
  desk: "Desk",
  teams: "Teams",
};

const PLAN_DESCRIPTIONS: Record<PlanKey, string> = {
  free: "The terminal with modest allowances, for evaluating the product.",
  pro: "Raised allowances, point-in-time data and export, on a faster chat model.",
  desk: "Desk-scale allowances with unlimited watchlists, screens and history.",
  teams: "Negotiated by hand. Every allowance is expected to be set by an override.",
};

const FEATURE_LABELS: Record<FeatureKey, string> = {
  ai_chat: "AI chat",
  deep_research: "Deep Research",
  pulse_universe: "Pulse universe",
  tracked_symbols: "Tracked symbols",
  watchlists: "Watchlists",
  portfolios: "Portfolios",
  saved_screens: "Saved screens",
  history_years: "History depth",
  point_in_time: "Point-in-time data",
  export: "Export",
  intelligence: "Model-assisted intelligence",
};

const FEATURE_UNITS: Record<FeatureKey, string> = {
  ai_chat: "messages a month",
  deep_research: "reports a month",
  pulse_universe: "symbols",
  tracked_symbols: "symbols",
  watchlists: "watchlists",
  portfolios: "portfolios",
  saved_screens: "screens",
  history_years: "years",
  point_in_time: "",
  export: "",
  intelligence: "",
};

const FEATURE_NOTES: Record<FeatureKey, string> = {
  ai_chat: "Metered. Each message spends one.",
  deep_research: "Metered. Each report spends one.",
  pulse_universe: "A ceiling on how many symbols Pulse covers. Pulse itself is never metered.",
  tracked_symbols: "A ceiling on how many symbols may be tracked at once.",
  watchlists: "A ceiling on how many watchlists may exist at once.",
  portfolios: "A ceiling on how many portfolios may exist at once.",
  saved_screens: "A ceiling on how many screens may be saved at once.",
  history_years: "How far back history reaches.",
  point_in_time: "Data as it stood on a past date, without later restatements.",
  export: "Downloading data out of the terminal.",
  intelligence:
    "Lets a model read an objective or a typed phrase the terminal did not recognise on its own. Off does not mean no intelligence: the command bar and the planner read the common phrasings deterministically on every plan.",
};

/**
 * A stored tier string reduced to a plan this module knows. An unrecognised value is
 * Free, never something more generous: the column is free text that predates any
 * vocabulary, so it genuinely holds values from earlier schemes and a typo must not
 * grant anything.
 */
export function canonicalPlan(value: string | null | undefined): PlanKey {
  const normalised = String(value ?? "")
    .trim()
    .toLowerCase();
  if ((CANONICAL_PLANS as readonly string[]).includes(normalised)) return normalised as PlanKey;
  const legacy: Record<string, PlanKey> = {
    professional: "desk",
    premium: "desk",
    starter: "pro",
    plus: "pro",
  };
  return legacy[normalised] ?? "free";
}

export function isCanonicalPlan(value: unknown): value is PlanKey {
  return typeof value === "string" && (CANONICAL_PLANS as readonly string[]).includes(value);
}

export function isFeatureKey(value: unknown): value is FeatureKey {
  return typeof value === "string" && (FEATURE_KEYS as readonly string[]).includes(value);
}

export function isBooleanFeature(feature: FeatureKey): boolean {
  return (BOOLEAN_FEATURES as readonly string[]).includes(feature);
}

export function isQuotaFeature(feature: FeatureKey): boolean {
  return (QUOTA_FEATURES as readonly string[]).includes(feature);
}

export function planLabel(value: string | null | undefined): string {
  return PLAN_LABELS[canonicalPlan(value)];
}

export function planDescription(value: string | null | undefined): string {
  return PLAN_DESCRIPTIONS[canonicalPlan(value)];
}

export function featureLabel(feature: FeatureKey): string {
  return FEATURE_LABELS[feature];
}

export function featureUnit(feature: FeatureKey): string {
  return FEATURE_UNITS[feature];
}

export function featureNote(feature: FeatureKey): string {
  return FEATURE_NOTES[feature];
}

export function featurePeriod(feature: FeatureKey): FeaturePeriod {
  return FEATURE_PERIODS[feature];
}

export function chatModelForPlan(value: string | null | undefined): string {
  return CHAT_MODEL_BY_PLAN[canonicalPlan(value)];
}

/** Which model this plan's Deep Research runs on, which is not always its chat model. */
export function researchModelForPlan(value: string | null | undefined): string {
  return RESEARCH_MODEL_BY_PLAN[canonicalPlan(value)];
}

export function modelLabel(model: string | null | undefined): string {
  const key = String(model ?? "").trim();
  return MODEL_LABELS[key] ?? key;
}

export type PlanDefault =
  { kind: "limit"; limit: number | null } | { kind: "boolean"; enabled: boolean };

/** What a plan grants for one feature, before any per-account override. */
export function planDefault(plan: string | null | undefined, feature: FeatureKey): PlanDefault {
  const value = PLAN_LIMITS[canonicalPlan(plan)][feature];
  if (isBooleanFeature(feature)) return { kind: "boolean", enabled: value === true };
  return { kind: "limit", limit: typeof value === "number" ? value : null };
}

/** Every feature for a plan, in display order. */
export function planDefaults(
  plan: string | null | undefined,
): ReadonlyArray<{ feature: FeatureKey; value: PlanDefault }> {
  return FEATURE_KEYS.map((feature) => ({ feature, value: planDefault(plan, feature) }));
}

/** "Unlimited" for `null`, so a missing ceiling never reads as a number. */
export function formatAllowance(limit: number | null | undefined): string {
  if (limit === null || limit === undefined) return "Unlimited";
  return new Intl.NumberFormat("en").format(limit);
}

export type AllowanceStanding = "unlimited" | "healthy" | "near" | "over";

/**
 * How close a spend is to its ceiling. `null` is unlimited and is never "near": an
 * account with no ceiling cannot be approaching one.
 */
export function allowanceStanding(
  spent: number,
  limit: number | null | undefined,
  nearThreshold = 0.8,
): AllowanceStanding {
  if (limit === null || limit === undefined) return "unlimited";
  if (limit <= 0) return spent > 0 ? "over" : "near";
  if (spent >= limit) return "over";
  return spent / limit >= nearThreshold ? "near" : "healthy";
}

export function allowanceRatio(spent: number, limit: number | null | undefined): number | null {
  if (limit === null || limit === undefined || limit <= 0) return null;
  return Math.min(1, Math.max(0, spent / limit));
}
