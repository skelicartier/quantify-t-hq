import "server-only";

import { z } from "zod";

import { HqApiRequestError, HqApiUnavailableError, fetchHqJson, postHqJson } from "@/lib/api/core";

import { ASSIGNABLE_ROLES, type AssignableRole } from "@/lib/product/role-labels";

export { ASSIGNABLE_ROLES, type AssignableRole };
export const ADMIN_ENTRY_CAPABILITY = "account:read-any";
export const ROLE_REPORT_CAPABILITY = "roles:read-report";
export const MANAGE_ROLES_CAPABILITY = "roles:write";
export const ROLE_WRITE_CAPABILITY = MANAGE_ROLES_CAPABILITY;
export const AUDIT_EVENTS_CAPABILITY = "audit:read";
export const USER_ACTIVATION_CAPABILITY = "users:set-active";
export const USER_SESSION_REVOKE_CAPABILITY = "sessions:revoke-any";
export const NOTIFICATIONS_CAPABILITY = "notifications:write";
export const CONFIGURATION_CAPABILITY = "configuration:read";
export const CREDENTIAL_STATUS_CAPABILITY = "credentials:read-status";
export const RELEASE_STATUS_CAPABILITY = "releases:read-status";
/**
 * Publishing a release, rolling one back, disabling one.
 *
 * Owner-only, and separated from reading release status for the same reason the two secret
 * capabilities are separated — only more so. Every other write in this console changes what
 * one account may do; this one changes what executable every installed desktop downloads,
 * and whether it installs without asking.
 */
export const RELEASE_PUBLISH_CAPABILITY = "releases:publish";
/**
 * The credentials the product spends — provider keys, market-data keys, map tokens — as
 * distinct from the account service's own settings (`CREDENTIAL_STATUS_CAPABILITY`).
 *
 * Reading and writing are separate on purpose. "Which key is failing?" is a question
 * someone must be able to answer at 2am; replacing one is not. Collapsing them would give
 * everyone who can answer the question the whole blast radius of the answer.
 */
export const SECRETS_READ_CAPABILITY = "secrets:read";
export const SECRETS_WRITE_CAPABILITY = "secrets:write";
/**
 * Changing what an account may do, as distinct from who they are. Deliberately separate
 * from role management: Support must be able to look at a plan without granting one, and
 * an Admin must be able to comp an account without being able to make someone an Owner.
 */
export const SUBSCRIPTION_WRITE_CAPABILITY = "subscription:write";
/** The audit event types every plan and override change is recorded under. */
export const SUBSCRIPTION_CHANGED_EVENT = "account.subscription_changed";
export const ENTITLEMENT_CHANGED_EVENT = "account.entitlement_changed";
/** Granting somebody a staff role, as distinct from `roles:write` over every role. */
export const STAFF_WRITE_CAPABILITY = "staff:write";

type Fetcher = (input: URL, init: RequestInit) => Promise<Response>;

export class AccountApiUnavailableError extends Error {
  readonly correlationId: string | null;

  constructor(correlationId: string | null = null) {
    super("Account administration is temporarily unavailable.");
    this.name = "AccountApiUnavailableError";
    this.correlationId = correlationId;
  }
}

/**
 * Server-side breadcrumb for an Account API failure. Deliberately narrow: the route,
 * the outcome, and the correlation id are enough to find the matching backend log line,
 * and nothing that could carry a token, a body, or a header is ever included.
 */
function logAccountApiFailure(
  route: string,
  method: string,
  detail: Readonly<Record<string, string | number | null>>,
): void {
  const fields = Object.entries({ route, method, ...detail })
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  console.error(`[account-api] ${fields}`);
}

function schemaIssuePaths(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((issue) => issue.path.map(String).join(".") || "<root>")
    .join(",");
}

function parseAccountApiPayload<T>(
  schema: z.ZodType<T>,
  payload: unknown,
  route: string,
  method = "GET",
): T {
  const parsed = schema.safeParse(payload);
  if (parsed.success) return parsed.data;
  const correlationId =
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as { correlation_id?: unknown }).correlation_id === "string"
      ? (payload as { correlation_id: string }).correlation_id
      : null;
  logAccountApiFailure(route, method, {
    outcome: "schema_mismatch",
    issues: schemaIssuePaths(parsed.error),
    correlation_id: correlationId,
  });
  throw new AccountApiUnavailableError(correlationId);
}

export class AccountApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly correlationId: string | null;
  readonly details: Readonly<Record<string, unknown>>;

  constructor({
    status,
    code,
    message,
    correlationId,
    details = {},
  }: {
    status: number;
    code: string;
    message: string;
    correlationId: string | null;
    details?: Readonly<Record<string, unknown>>;
  }) {
    super(message);
    this.name = "AccountApiRequestError";
    this.status = status;
    this.code = code;
    this.correlationId = correlationId;
    this.details = details;
  }
}

// Derived, never retyped. A hand-written second copy of the role list is how a role the
// API started returning becomes a schema mismatch on `/me`, which fails every admin page
// at once rather than the one place that cares.
const roleSchema = z.enum(ASSIGNABLE_ROLES);
const nullableRoleSchema = roleSchema.nullable();
const correlationSchema = z.string().min(1).max(160);

export const accountApiMeSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    user: z
      .object({
        user_id: z.guid(),
        email: z.string().email().max(254),
        is_active: z.boolean(),
      })
      .strict(),
    role: z
      .object({
        effective: roleSchema,
        database: nullableRoleSchema,
        legacy: nullableRoleSchema,
        mismatch: z.string().min(1).max(96),
        break_glass: z.boolean(),
      })
      .strict(),
    capabilities: z.array(z.string().min(1).max(96)).max(64),
    environment: z.string().min(1).max(64),
  })
  .strict();

const roleReportEntrySchema = z
  .object({
    user_id: z.guid(),
    effective_role: roleSchema,
    database_role: nullableRoleSchema,
    legacy_role: nullableRoleSchema,
    mismatch: z.string().min(1).max(96),
    break_glass: z.boolean(),
  })
  .strict();

export const accountApiRoleReportSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    legacy_source_available: z.boolean(),
    legacy_retirement_ready: z.boolean(),
    legacy_blob_entry_count: z.number().int().nonnegative(),
    legacy_unparsable_entry_count: z.number().int().nonnegative(),
    legacy_entry_count: z.number().int().nonnegative(),
    legacy_bootstrap_count: z.number().int().nonnegative(),
    counts_by_mismatch: z.record(z.string(), z.number().int().nonnegative()),
    // Partial on purpose. The API sends a zero for every canonical role, but the console
    // and the account service deploy separately, and a console that refuses to render
    // because the service has not learned a role yet fails every admin page at once.
    counts_by_role: z.partialRecord(roleSchema, z.number().int().nonnegative()),
    total_users: z.number().int().nonnegative(),
    break_glass_disclosed: z.boolean(),
    entries: z.array(roleReportEntrySchema).max(500),
  })
  .strict();

const metricCounterSchema = z
  .record(z.string().min(1).max(64), z.number().int().nonnegative())
  .refine((value) => Object.keys(value).length <= 64);

const metricDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

const metricCountPointSchema = z
  .object({ date: metricDaySchema, count: z.number().int().nonnegative() })
  .strict();

const metricOutcomePointSchema = z
  .object({
    date: metricDaySchema,
    success: z.number().int().nonnegative(),
    failure: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
  })
  .strict();

/** Daily aggregates for the trailing window; nothing per-account is carried. */
const metricSeriesSchema = z
  .object({
    days: z.number().int().nonnegative().max(366),
    signups: z.array(metricCountPointSchema).max(366),
    sign_ins: z.array(metricCountPointSchema).max(366),
    auth_events: z.array(metricOutcomePointSchema).max(366),
  })
  .strict();

const adminUserRoleSchema = z
  .object({
    effective: roleSchema,
    database: nullableRoleSchema,
    legacy: nullableRoleSchema,
    mismatch: z.string().min(1).max(96),
    break_glass: z.boolean(),
  })
  .strict();

const adminUserSummarySchema = z
  .object({
    user: z
      .object({
        user_id: z.guid(),
        email: z.string().max(254),
        first_name: z.string().max(80),
        last_name: z.string().max(80),
        display_name: z.string().max(180),
        is_active: z.boolean(),
        subscription_tier: z.string().max(64),
        created_at: z.string().max(64),
        last_login_at: z.string().max(64),
        updated_at: z.string().max(64),
      })
      .strict(),
    role: adminUserRoleSchema,
  })
  .strict();

const adminSessionSchema = z
  .object({
    id: z.guid(),
    user_id: z.guid(),
    source: z.string().min(1).max(32),
    provider: z.string().min(1).max(32),
    client_instance_id: z.string().max(256).nullable(),
    device_name: z.string().max(200).nullable(),
    created_at: z.string().max(64).nullable(),
    last_seen_at: z.string().max(64).nullable(),
    expires_at: z.string().max(64).nullable(),
    revoked_at: z.string().max(64).nullable(),
    revoke_reason: z.string().max(80).nullable(),
  })
  .strict();

const adminActivitySchema = z
  .object({
    id: z.guid(),
    user_id: z.guid().nullable(),
    session_id: z.guid().nullable(),
    event_type: z.string().min(1).max(96),
    outcome: z.enum(["success", "failure", "blocked", "unknown"]),
    source: z.string().min(1).max(32),
    occurred_at: z.string().max(64).nullable(),
    created_at: z.string().max(64).nullable(),
  })
  .strict();

export const accountApiAdminMetricsSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    generated_at: z.string().min(1).max(64),
    window: z
      .object({
        hours: z.literal(24),
        since: z.string().min(1).max(64),
      })
      .strict(),
    accounts: z
      .object({
        total: z.number().int().nonnegative(),
        active: z.number().int().nonnegative(),
        inactive: z.number().int().nonnegative(),
        created_24h: z.number().int().nonnegative(),
        logged_in_24h: z.number().int().nonnegative(),
        created_7d: z.number().int().nonnegative().optional(),
        created_30d: z.number().int().nonnegative().optional(),
        logged_in_7d: z.number().int().nonnegative().optional(),
      })
      .strict(),
    series: metricSeriesSchema.optional(),
    sessions: z
      .object({
        total: z.number().int().nonnegative(),
        active: z.number().int().nonnegative(),
        expired: z.number().int().nonnegative(),
        revoked: z.number().int().nonnegative(),
        by_source: metricCounterSchema,
      })
      .strict(),
    auth_events_24h: z
      .object({
        total: z.number().int().nonnegative(),
        by_type: metricCounterSchema,
        by_outcome: metricCounterSchema,
        by_source: metricCounterSchema,
      })
      .strict(),
    limits: z
      .object({
        row_limit: z.number().int().positive(),
        accounts_truncated: z.boolean(),
        sessions_truncated: z.boolean(),
        events_truncated: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const accountApiAdminConfigurationSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    generated_at: z.string().min(1).max(64),
    environment: z.string().min(1).max(64),
    cors: z
      .object({
        allowed_origin_count: z.number().int().nonnegative().max(1000),
        wildcard_allowed: z.boolean(),
      })
      .strict(),
    limits: z
      .object({
        max_body_bytes: z.number().int().positive().max(1_048_576),
        upstream_timeout_seconds: z.number().positive().max(15),
        idempotency_ttl_seconds: z
          .number()
          .int()
          .positive()
          .max(7 * 24 * 60 * 60),
        reservation_lease_seconds: z
          .number()
          .int()
          .positive()
          .max(60 * 60),
        email_worker_batch_limit: z.number().int().positive().max(25),
        artifact_worker_batch_limit: z.number().int().positive().max(10),
        deletion_worker_batch_limit: z.number().int().positive().max(5),
        signed_download_ttl_seconds: z
          .number()
          .int()
          .positive()
          .max(60 * 60),
      })
      .strict(),
    features: z
      .object({
        email_worker_enabled: z.boolean(),
        artifact_worker_enabled: z.boolean(),
        deletion_worker_enabled: z.boolean(),
        signed_downloads_enabled: z.boolean(),
        account_export_encryption_configured: z.boolean(),
        private_artifact_storage_configured: z.boolean(),
        legacy_role_source_configured: z.boolean(),
        break_glass_owner_count: z.number().int().nonnegative().max(1000),
        legacy_bootstrap_admin_count: z.number().int().nonnegative().max(1000),
      })
      .strict(),
  })
  .strict();

const credentialStatusSchema = z
  .object({
    name: z.string().min(1).max(80),
    configured: z.boolean(),
    secret: z.boolean(),
    rotation: z.enum(["source-locked"]),
  })
  .strict();

export const accountApiAdminCredentialStatusSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    generated_at: z.string().min(1).max(64),
    credentials: z.array(credentialStatusSchema).max(32),
  })
  .strict();

/**
 * A managed credential, described without being disclosed.
 *
 * Every field here answers a question an operator can act on — is it set, where does it
 * end up, which key is it, did the paste get truncated, when was it last known good. None
 * of them is derived from the credential in a way that can be run backwards: `fingerprint`
 * is a keyed digest the service computes and stores, and `prefix` is an allow-list lookup
 * of a published provider marker, never a slice of the value.
 *
 * The fields this shape deliberately has no room for are `value`, any suffix of one,
 * `credential_key_id` and `last_error`. `.strict()` is what enforces that: a service that
 * started sending any of them would fail the parse rather than quietly render them.
 */
const adminSecretVerificationSchema = z
  .object({
    state: z.enum([
      "valid",
      "rejected",
      "scoped-wrong",
      "no-quota",
      "inconclusive",
      "unclassified",
      "unverified",
      "unsupported",
      "checking",
    ]),
    checked_at: z.string().min(1).max(64).nullable(),
  })
  .strict();

const adminSecretEntrySchema = z
  .object({
    fingerprint: z.string().min(1).max(64),
    prefix: z.string().max(32),
    length: z.number().int().nonnegative().max(100_000),
    position: z.number().int().nonnegative().max(64),
    set_by: z.string().max(120),
    set_at: z.string().min(1).max(64),
    verification: adminSecretVerificationSchema,
  })
  .strict();

const adminSecretSlotSchema = z
  .object({
    slot: z.string().min(1).max(80),
    namespace: z.enum(["api", "geo"]),
    label: z.string().min(1).max(120),
    kind: z.enum(["single", "multi", "identifier"]),
    group: z.string().max(64).nullable(),
    hint: z.string().max(240),
    blast_radius: z.string().max(240),
    is_secret: z.boolean(),
    configured: z.boolean(),
    distribution: z.enum(["every-device", "server-only"]),
    distribution_certain: z.boolean(),
    entries: z.array(adminSecretEntrySchema).max(32),
  })
  .strict();

export const accountApiAdminSecretsSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    generated_at: z.string().min(1).max(64),
    store: z
      .object({
        // Three answers because they demand three different actions. "absent" is no
        // document at all in the account this service reads — expected on a new
        // deployment, and the signature of a misconfigured storage connection when
        // credentials were set from somewhere else.
        state: z.enum(["ready", "unreadable", "absent"]),
        dependency: z.string().max(120).nullable().optional(),
      })
      .strict(),
    slots: z.array(adminSecretSlotSchema).max(64),
  })
  .strict();

/** What a write answers with: the slot as it now stands, never the value that was sent. */
export const accountApiAdminSecretWriteSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    slot: adminSecretSlotSchema.nullable(),
    action: z.enum(["set", "append", "revoke", "restore"]),
    /**
     * The credential is committed and in use, but the description of it could not be
     * updated. Reporting that as a failure would send the operator round again to redo a
     * change that has already taken effect, so it is surfaced as a caveat instead.
     */
    metadata_lagging: z.boolean(),
    event: z
      .object({ id: z.string().max(64), event_type: z.string().max(64) })
      .strict()
      .nullable(),
    replayed: z.boolean(),
  })
  .strict();

/** A restore answers with the fingerprint it put back, and nothing else. */
export const accountApiAdminSecretRestoreSchema = accountApiAdminSecretWriteSchema;

// -------------------------------------------------------------------- access control
/**
 * Who is staff, and what each role permits.
 *
 * The capability lists arrive from the service rather than being described here. A console
 * that keeps its own copy of who-can-do-what drifts silently, and the direction it drifts
 * is always towards claiming more than is true.
 */
const staffMemberSchema = z
  .object({
    user_id: z.string().min(1).max(64),
    email: z.string().max(320),
    display_name: z.string().max(240),
    is_active: z.boolean(),
    role: roleSchema,
    capabilities: z.array(z.string().max(64)).max(64),
    mismatch: z.string().max(64),
    break_glass: z.boolean(),
    /** False when the account's profile row could not be read; the row is still named. */
    profile_readable: z.boolean(),
  })
  .strict();

const staffRoleCatalogueSchema = z
  .object({
    role: roleSchema,
    capabilities: z.array(z.string().max(64)).max(64),
    grantable: z.boolean(),
  })
  .strict();

export const accountApiAdminStaffSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    generated_at: z.string().min(1).max(64),
    members: z.array(staffMemberSchema).max(500),
    roles: z.array(staffRoleCatalogueSchema).max(32),
    grantable_roles: z.array(roleSchema).max(32),
    can_grant: z.boolean(),
    can_assign_any_role: z.boolean(),
    legacy_readable: z.boolean(),
  })
  .strict();

export const accountApiAdminStaffWriteSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    member: staffMemberSchema,
    /** False when the account already held the role, so the trail counts changes. */
    changed: z.boolean(),
    event: z
      .object({ id: z.string().max(64), event_type: z.string().max(64) })
      .strict()
      .nullable(),
    replayed: z.boolean(),
  })
  .strict();

export const accountApiAdminReleaseStatusSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    generated_at: z.string().min(1).max(64),
    release_management: z
      .object({
        configured: z.boolean(),
        publish_enabled: z.boolean(),
        rollback_enabled: z.boolean(),
        requires_https_url: z.boolean(),
        requires_checksum: z.boolean(),
        requires_server_signature: z.boolean(),
        // `source-locked` said publishing happened at the deployment source and not here.
        // It does happen here now, so the value changed with the code rather than being
        // left to contradict the form beside it. Both spellings are accepted so a console
        // deployed ahead of the Account API still renders.
        status: z.enum(["source-locked", "console"]),
      })
      .strict(),
  })
  .strict();

export const accountApiAdminUsersSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    generated_at: z.string().min(1).max(64),
    pagination: z
      .object({
        limit: z.number().int().min(1).max(100),
        offset: z.number().int().nonnegative().max(100000),
        has_more: z.boolean(),
        next_offset: z.number().int().nonnegative().max(100100).nullable(),
        total: z.number().int().nonnegative().optional(),
      })
      .strict(),
    users: z.array(adminUserSummarySchema).max(100),
  })
  .strict();

export const accountApiAdminUserDetailSchema = adminUserSummarySchema
  .extend({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    sessions: z.array(adminSessionSchema).max(10),
    activity: z.array(adminActivitySchema).max(20),
  })
  .strict();

// --------------------------------------------------------------- subscriptions
// One entitlement as the API resolved it. A metered or counted feature carries numbers,
// a boolean feature carries `enabled`, and exactly one of the two is present for a given
// key — which is why the fields are optional here rather than a union of two objects the
// caller would have to narrow before it could read `source`.
const entitlementFeatureSchema = z
  .object({
    period: z.enum(["day", "month", "lifetime"]),
    source: z.string().min(1).max(16),
    /** `null` is unlimited, never zero. */
    limit: z.number().int().nonnegative().nullable().optional(),
    used: z.number().int().nonnegative().optional(),
    reserved: z.number().int().nonnegative().optional(),
    remaining: z.number().int().nonnegative().nullable().optional(),
    /** An absolute instant, so the client renders it in the reader's own timezone. */
    resets_at: z.string().min(1).max(64).optional(),
    period_key: z.string().min(1).max(64).optional(),
    enabled: z.boolean().optional(),
    reason: z.string().max(200).optional(),
  })
  .strict();

export const accountApiEntitlementsSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    /**
     * The plan these allowances belong to. During a trial that is the trial's plan, not
     * the tier stored on the profile — the label and the numbers have to come from the
     * same place or the page reads "Included with Free" beside 1,000 AI chats.
     */
    plan: z.string().min(1).max(50),
    /** Sent only when it differs from `plan`: the tier the account drops back to. */
    stored_plan: z.string().min(1).max(50).optional(),
    /** The cache key: it moves on every entitlement change. */
    entitlement_version: z.number().int().nonnegative(),
    chat_model: z.string().min(1).max(64).optional(),
    generated_at: z.string().max(64),
    ttl_seconds: z.number().int().nonnegative(),
    /** Present only while a trial is live. */
    trial_ends_at: z.string().min(1).max(64).optional(),
    features: z.record(z.string().min(1).max(64), entitlementFeatureSchema),
  })
  .strict();

export const accountApiAdminSubscriptionsSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    generated_at: z.string().min(1).max(64),
    /** Keys are raw stored tiers, not canonical plans; the console canonicalises them. */
    plans: metricCounterSchema,
    total_accounts: z.number().int().nonnegative(),
  })
  .strict();

const usageCounterSchema = z
  .object({
    feature_key: z.string().min(1).max(64),
    period_key: z.string().max(64),
    used: z.number().int().nonnegative(),
    reserved: z.number().int().nonnegative(),
    updated_at: z.string().max(64),
  })
  .strict();

export const accountApiAdminUserUsageSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    user_id: z.guid(),
    plan: z.string().min(1).max(50),
    generated_at: z.string().min(1).max(64),
    counters: z.array(usageCounterSchema).max(200),
  })
  .strict();

/** One account's resolved entitlements, read by an operator. Same shape as the account's
 *  own `me/entitlements`, plus the profile version a plan change compares against. */
export const accountApiAdminUserEntitlementsSchema = accountApiEntitlementsSchema
  .extend({
    user_id: z.guid(),
    profile_version: z.number().int().nonnegative(),
  })
  .strict();

const entitlementOverrideSchema = z
  .object({
    feature_key: z.string().min(1).max(64),
    source: z.string().max(16),
    source_ref: z.string().max(128),
    limit_value: z.number().int().nonnegative().nullable(),
    bool_value: z.boolean().nullable(),
    effective_from: z.string().max(64),
    effective_to: z.string().max(64),
    granted_by: z.string().max(64),
    reason: z.string().max(200),
  })
  .strict();

/** The receipt for a plan change or an override, in the house mutation envelope. */
export const accountApiAdminSubscriptionUpdateSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    user_id: z.guid(),
    plan: z.string().max(50),
    previous_plan: z.string().max(50),
    profile_version: z.number().int().nonnegative(),
    entitlement_version: z.number().int().nonnegative(),
    overrides: z.array(entitlementOverrideSchema).max(64),
    /**
     * The receipt for a trial: an instant means a window is open until then, an empty
     * string means there is none. The page says "with a 14-day trial" from this and never
     * from its own checkbox, so it can only say it about a trial that was written.
     */
    trial_ends_at: z.string().max(64),
    /**
     * The submitted plan was the one the account already had, with no trial to start or
     * end, so nothing was written. Bumping `entitlement_version` invalidates the cached
     * entitlement document on every device the account is signed in to, and filing an
     * audit event for a change that did not happen is worse than saying nothing.
     */
    unchanged: z.boolean(),
    event: z
      .object({
        id: z.string().max(64),
        event_type: z.string().max(64),
      })
      .strict()
      .nullable(),
    replayed: z.boolean(),
    legacy_mirrored: z.boolean(),
  })
  .strict();

export const accountApiAdminUserActivationSchema = adminUserSummarySchema
  .extend({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    event: z
      .object({
        id: z.string().max(64),
        event_type: z.string().max(64),
      })
      .strict(),
    replayed: z.boolean(),
    legacy_mirrored: z.boolean(),
  })
  .strict();

export const accountApiAdminUserSessionRevokeSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    session: adminSessionSchema,
    event: z
      .object({
        id: z.string().max(64),
        event_type: z.string().max(64),
        outcome: z.enum(["success", "failure", "blocked", "unknown"]),
      })
      .strict()
      .nullable(),
    replayed: z.boolean(),
    legacy_mirrored: z.boolean(),
  })
  .strict();

const adminAuditEventSchema = z
  .object({
    id: z.string().max(64),
    subject_user_id: z.guid().nullable(),
    subject_email: z.string().max(254).nullable().optional(),
    actor_user_id: z.guid().nullable(),
    actor_email: z.string().max(254).nullable().optional(),
    session_id: z.guid().nullable(),
    event_type: z.string().min(1).max(96),
    outcome: z.enum(["success", "failure", "blocked", "unknown"]),
    source: z.string().min(1).max(32),
    request_id: z.string().max(160).nullable(),
    occurred_at: z.string().max(64),
    created_at: z.string().max(64),
    summary: z.object({ actor_role: z.string().max(32) }).strict(),
  })
  .strict();

export const accountApiAdminAuditEventsSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    generated_at: z.string().min(1).max(64),
    pagination: z
      .object({
        limit: z.number().int().min(1).max(100),
        offset: z.number().int().nonnegative().max(100000),
        has_more: z.boolean(),
        next_offset: z.number().int().nonnegative().max(100100).nullable(),
      })
      .strict(),
    filters: z.record(z.string().min(1).max(32), z.string().max(160)),
    events: z.array(adminAuditEventSchema).max(100),
  })
  .strict();

const adminReportDownloadSchema = z
  .object({
    available: z.boolean(),
    private: z.boolean(),
    source_locked: z.boolean(),
    content_type: z.literal("text/csv; charset=utf-8"),
    filename: z.string().min(1).max(140),
    expires_at: z.string().max(64),
    ttl_seconds: z.number().int().positive().max(3600),
    byte_count: z.number().int().nonnegative().max(10_000_000),
    sha256: z.string().max(64),
    url: z.string().url().max(2048).nullable(),
  })
  .strict();

const adminReportJobSchema = z
  .object({
    id: z.guid(),
    report_type: z.literal("audit-events"),
    format: z.literal("csv"),
    filters: z.record(z.string().min(1).max(32), z.string().max(160)),
    status: z.enum(["queued", "retry", "ready", "failed", "expired"]),
    queued_at: z.string().max(64),
    generated_at: z.string().max(64),
    expires_at: z.string().max(64),
    attempts: z.number().int().nonnegative().max(100),
    max_attempts: z.number().int().positive().max(10),
    next_attempt_at: z.string().max(64),
    last_error: z.string().max(240),
    row_count: z.number().int().nonnegative().max(1000),
    download: adminReportDownloadSchema,
  })
  .strict();

export const accountApiAdminReportsSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    revision: z.string().max(64),
    generated_at: z.string().min(1).max(64),
    queue: z
      .object({
        job_limit: z.number().int().positive().max(200),
        returned: z.number().int().nonnegative().max(200),
      })
      .strict(),
    jobs: z.array(adminReportJobSchema).max(200),
  })
  .strict();

export const accountApiAdminReportEnqueueSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    revision: z.string().max(64),
    job: adminReportJobSchema,
    event: z
      .object({
        id: z.string().max(64),
        event_type: z.literal("reports.queued"),
      })
      .strict()
      .nullable(),
    replayed: z.boolean(),
    legacy_mirrored: z.boolean(),
  })
  .strict();

const notificationActionSchema = z
  .object({
    label: z.string().max(60),
    url: z.string().max(500),
    kind: z.string().max(24),
    primary: z.boolean(),
  })
  .strict();

const notificationSchema = z
  .object({
    id: z.string().min(1).max(64),
    title: z.string().max(140),
    body: z.string().max(4000),
    severity: z.enum(["info", "success", "warning", "critical"]),
    display: z.enum(["popup", "center"]),
    dismissible: z.boolean(),
    active: z.boolean(),
    created_at: z.string().max(64),
    starts_at: z.string().max(64),
    expires_at: z.string().max(64),
    actions: z.array(notificationActionSchema).max(4),
  })
  .strict();

const notificationTargetSchema = z
  .object({
    mode: z.enum(["all", "active", "selected"]),
    user_ids: z.array(z.guid()).max(5000),
    emails: z.array(z.string().email().max(254)).max(5000),
  })
  .strict();

const adminNotificationSchema = notificationSchema
  .extend({
    target: notificationTargetSchema,
  })
  .strict();

export const accountApiAdminNotificationsSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    revision: z.string().max(64),
    notifications: z.array(adminNotificationSchema).max(200),
  })
  .strict();

export const accountApiAdminNotificationsUpdateSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    revision: z.string().max(64),
    count: z.number().int().nonnegative().max(200),
    event: z
      .object({
        id: z.string().max(64),
        event_type: z.string().max(64),
      })
      .strict()
      .nullable(),
    replayed: z.boolean(),
    legacy_mirrored: z.boolean(),
  })
  .strict();

const notificationEmailJobSchema = z
  .object({
    id: z.guid(),
    subject: z.string().max(140),
    body: z.string().max(4000),
    target: notificationTargetSchema,
    status: z.enum(["queued", "retry", "sent", "dead"]),
    queued_at: z.string().max(64),
    scheduled_at: z.string().max(64),
    attempts: z.number().int().nonnegative().max(100),
    max_attempts: z.number().int().positive().max(10),
    next_attempt_at: z.string().max(64),
    last_error: z.string().max(240),
    last_attempt_at: z.string().max(64),
    completed_at: z.string().max(64),
  })
  .strict();

export const accountApiAdminNotificationEmailQueueSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    revision: z.string().max(64),
    generated_at: z.string().min(1).max(64),
    quota: z
      .object({
        daily_limit: z.number().int().positive().max(1000),
        queued_24h: z.number().int().nonnegative().max(1000),
        queue_limit: z.number().int().positive().max(5000),
      })
      .strict(),
    jobs: z.array(notificationEmailJobSchema).max(500),
  })
  .strict();

export const accountApiAdminNotificationEmailEnqueueSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    revision: z.string().max(64),
    job: notificationEmailJobSchema,
    event: z
      .object({
        id: z.string().max(64),
        event_type: z.string().max(64),
      })
      .strict()
      .nullable(),
    replayed: z.boolean(),
    legacy_mirrored: z.boolean(),
  })
  .strict();

export type AccountApiMe = z.infer<typeof accountApiMeSchema>;
export type AccountApiRoleReport = z.infer<typeof accountApiRoleReportSchema>;
export type AccountApiAdminMetrics = z.infer<typeof accountApiAdminMetricsSchema>;
export type AccountApiAdminConfiguration = z.infer<typeof accountApiAdminConfigurationSchema>;
export type AccountApiAdminCredentialStatus = z.infer<typeof accountApiAdminCredentialStatusSchema>;
export type AccountApiAdminReleaseStatus = z.infer<typeof accountApiAdminReleaseStatusSchema>;
export type AccountApiAdminStaff = z.infer<typeof accountApiAdminStaffSchema>;
export type AccountApiAdminStaffWrite = z.infer<typeof accountApiAdminStaffWriteSchema>;
export type AccountApiStaffMember = z.infer<typeof staffMemberSchema>;
export type AccountApiStaffRoleCatalogue = z.infer<typeof staffRoleCatalogueSchema>;
export type AccountApiAdminSecrets = z.infer<typeof accountApiAdminSecretsSchema>;
export type AccountApiAdminSecretSlot = AccountApiAdminSecrets["slots"][number];
export type AccountApiAdminSecretEntry = AccountApiAdminSecretSlot["entries"][number];
export type AccountApiAdminSecretWrite = z.infer<typeof accountApiAdminSecretWriteSchema>;
export type AccountApiAdminSecretRestore = z.infer<typeof accountApiAdminSecretRestoreSchema>;
export type AccountApiAdminSubscriptions = z.infer<typeof accountApiAdminSubscriptionsSchema>;
export type AccountApiAdminUserUsage = z.infer<typeof accountApiAdminUserUsageSchema>;
export type AccountApiAdminUserEntitlements = z.infer<typeof accountApiAdminUserEntitlementsSchema>;
export type AccountApiAdminSubscriptionUpdate = z.infer<
  typeof accountApiAdminSubscriptionUpdateSchema
>;
export type AccountApiEntitlementOverride = z.infer<typeof entitlementOverrideSchema>;
export type AccountApiAdminUsers = z.infer<typeof accountApiAdminUsersSchema>;
export type AccountApiAdminUserDetail = z.infer<typeof accountApiAdminUserDetailSchema>;
export type AccountApiAdminUserActivation = z.infer<typeof accountApiAdminUserActivationSchema>;
export type AccountApiAdminUserSessionRevoke = z.infer<
  typeof accountApiAdminUserSessionRevokeSchema
>;
export type AccountApiAdminAuditEvents = z.infer<typeof accountApiAdminAuditEventsSchema>;
export type AccountApiAdminReports = z.infer<typeof accountApiAdminReportsSchema>;
export type AccountApiAdminReportEnqueue = z.infer<typeof accountApiAdminReportEnqueueSchema>;
export type AccountApiAdminNotifications = z.infer<typeof accountApiAdminNotificationsSchema>;
export type AccountApiAdminNotificationsUpdate = z.infer<
  typeof accountApiAdminNotificationsUpdateSchema
>;
export type AccountApiAdminNotificationEmailQueue = z.infer<
  typeof accountApiAdminNotificationEmailQueueSchema
>;
export type AccountApiAdminNotificationEmailEnqueue = z.infer<
  typeof accountApiAdminNotificationEmailEnqueueSchema
>;

type AccountApiFetchOptions = {
  environment?: Readonly<Partial<Record<string, string>>>;
  fetcher?: Fetcher;
  query?: Readonly<Record<string, string>>;
};

export const ADMIN_USER_STATUS_FILTERS = ["active", "inactive"] as const;
export type AdminUserStatusFilter = (typeof ADMIN_USER_STATUS_FILTERS)[number];

export type AccountApiAdminUserFilters = {
  /** Case-insensitive substring match on email, first name or last name. */
  q?: string | undefined;
  status?: AdminUserStatusFilter | undefined;
};

type AccountApiAdminUsersOptions = AccountApiFetchOptions &
  AccountApiAdminUserFilters & {
    limit?: number;
    offset?: number;
  };

export type AccountApiAdminAuditFilters = {
  actor_user_id?: string;
  event_type?: string;
  outcome?: string;
  request_id?: string;
  session_id?: string;
  source?: string;
  subject_user_id?: string;
};

type AccountApiAdminAuditOptions = AccountApiFetchOptions & {
  filters?: AccountApiAdminAuditFilters;
  limit?: number;
  offset?: number;
};

type AccountApiAdminReportBody = {
  expected_revision?: string;
  report_type: "audit-events";
  format: "csv";
  filters?: AccountApiAdminAuditFilters;
};

export type AccountApiSubscriptionUpdateBody = {
  plan: string;
  /** Compare-and-swap against the target's profile; the API refuses a stale one. */
  expected_profile_version: number;
  trial_days?: number;
};

export type AccountApiEntitlementUpdateBody = {
  feature_key: string;
  /** `null` means unlimited. Omitted entirely for a boolean feature. */
  limit_value?: number | null;
  bool_value?: boolean;
  expires_in_days?: number;
  /** Required unless `remove` is true: a comp nobody can attribute is a revenue leak. */
  reason?: string;
  remove?: boolean;
};

type AccountApiJsonRequestOptions = AccountApiFetchOptions & {
  body?: Readonly<Record<string, unknown>>;
  idempotencyKey?: string;
  method?: "GET" | "POST";
};

/**
 * The transport, HQ's way. The console called the Account API's `admin/*` routes with the
 * customer session of whoever was signed in; HQ calls `hq/product/*` with the staff
 * member's HQ session, and the service runs the very same `admin/*` handler as their
 * linked Quantify Terminal account. Everything else here — every schema and every call —
 * is the console's, unchanged. Only administration routes are reachable from here.
 */
function hqRouteFor(route: string): string {
  if (!route.startsWith("admin/")) throw new AccountApiUnavailableError();
  return `hq/product/${route.slice("admin/".length)}`;
}

function translated(error: unknown, route: string, method: string): Error {
  if (error instanceof HqApiRequestError) {
    return new AccountApiRequestError({
      status: error.status,
      code: error.code,
      message: error.message,
      correlationId: error.correlationId || null,
      details: error.details,
    });
  }
  if (error instanceof HqApiUnavailableError) {
    logAccountApiFailure(route, method, { outcome: "unavailable" });
    return new AccountApiUnavailableError();
  }
  return error instanceof Error ? error : new AccountApiUnavailableError();
}

async function fetchAccountApiJson(
  route: string,
  accessToken: string,
  options: AccountApiJsonRequestOptions = {},
): Promise<unknown> {
  const token = accessToken.trim();
  if (!token) throw new AccountApiUnavailableError();
  const method = options.method ?? (options.body ? "POST" : "GET");
  const hqRoute = hqRouteFor(route);
  try {
    if (method === "POST") {
      return await postHqJson(hqRoute, z.unknown(), {
        token,
        body: { ...(options.body ?? {}) },
        idempotencyKey: options.idempotencyKey || undefined,
      });
    }
    return await fetchHqJson(hqRoute, z.unknown(), { token, query: { ...(options.query ?? {}) } });
  } catch (error) {
    throw translated(error, route, method);
  }
}

export async function postAccountApiJson(
  route: string,
  accessToken: string,
  body: Readonly<Record<string, unknown>>,
  options: AccountApiFetchOptions & { idempotencyKey: string } = { idempotencyKey: "" },
): Promise<unknown> {
  return fetchAccountApiJson(route, accessToken, {
    ...options,
    body,
    method: "POST",
  });
}

const whoamiSchema = z.object({
  ok: z.literal(true),
  correlation_id: z.string().default(""),
  linked: z.boolean(),
  reason: z.string(),
  me: z.record(z.string(), z.unknown()).nullable().optional(),
  sudo_fresh: z.boolean().optional(),
});

/** Why a staff member can or cannot reach the administration, and as which account. */
export type ProductLink = {
  linked: boolean;
  reason: string;
  me: AccountApiMe | null;
  correlationId: string;
};

export async function fetchProductLink(accessToken: string): Promise<ProductLink> {
  let payload: z.infer<typeof whoamiSchema>;
  try {
    payload = await fetchHqJson("hq/product/whoami", whoamiSchema, { token: accessToken });
  } catch (error) {
    throw translated(error, "hq/product/whoami", "GET");
  }
  const correlationId = payload.correlation_id || "hq";
  const me =
    payload.linked && payload.me
      ? parseAccountApiPayload(
          accountApiMeSchema,
          { ok: true, correlation_id: correlationId, ...payload.me },
          "hq/product/whoami",
        )
      : null;
  return { linked: payload.linked, reason: payload.reason, me, correlationId };
}

/**
 * The product's own `me` for the staff member's linked account, as the console read it for
 * the signed-in customer — so every capability check in these screens is the product's.
 * Unlinked, it is a plain account with no capabilities: every screen then refuses, and the
 * Product section says why and how to fix it.
 */
export async function fetchAccountApiMe(
  accessToken: string,
  _options: AccountApiFetchOptions = {},
): Promise<AccountApiMe> {
  void _options;
  const link = await fetchProductLink(accessToken);
  if (link.me) return link.me;
  return {
    ok: true,
    correlation_id: link.correlationId,
    user: {
      user_id: "00000000-0000-4000-8000-000000000000",
      email: "not-linked@example.invalid",
      is_active: false,
    },
    role: { effective: "user", database: null, legacy: null, mismatch: "none", break_glass: false },
    capabilities: [],
    environment: "production",
  } as AccountApiMe;
}

export async function fetchAccountApiRoleReport(
  accessToken: string,
  options: AccountApiFetchOptions & { includeMatches?: boolean } = {},
): Promise<AccountApiRoleReport> {
  const { includeMatches = false, ...fetchOptions } = options;
  const requestOptions: AccountApiFetchOptions = includeMatches
    ? { ...fetchOptions, query: { include_matches: "true" } }
    : fetchOptions;
  const payload = await fetchAccountApiJson("admin/role-report", accessToken, requestOptions);
  return parseAccountApiPayload(accountApiRoleReportSchema, payload, "admin/role-report", "GET");
}

export async function fetchAccountApiAdminMetrics(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAdminMetrics> {
  const payload = await fetchAccountApiJson("admin/metrics", accessToken, options);
  return parseAccountApiPayload(accountApiAdminMetricsSchema, payload, "admin/metrics", "GET");
}

export async function fetchAccountApiAdminConfiguration(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAdminConfiguration> {
  const payload = await fetchAccountApiJson("admin/configuration", accessToken, options);
  return parseAccountApiPayload(
    accountApiAdminConfigurationSchema,
    payload,
    "admin/configuration",
    "GET",
  );
}

export async function fetchAccountApiAdminCredentialStatus(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAdminCredentialStatus> {
  const payload = await fetchAccountApiJson("admin/credentials", accessToken, options);
  return parseAccountApiPayload(
    accountApiAdminCredentialStatusSchema,
    payload,
    "admin/credentials",
    "GET",
  );
}

/**
 * Slot names are catalogue identifiers, and the only ones this module will put into a
 * path. The names arrive in a response rather than from a person, but a name that reached
 * the URL unchecked would make the route builder a path-traversal primitive the moment the
 * upstream shape changed, so the check is here rather than assumed upstream.
 */
const SECRET_SLOT_PATTERN = /^[A-Za-z0-9_]{1,80}$/u;

function secretRoute(slot: string, suffix = ""): string {
  if (!SECRET_SLOT_PATTERN.test(slot)) throw new AccountApiUnavailableError();
  return `admin/secrets/${slot}${suffix}`;
}

/**
 * The managed credential inventory: metadata for every catalogue slot, no values.
 *
 * There is no companion "read one credential" call, in this module or upstream. That is
 * the design, not an omission.
 */
export async function fetchAccountApiAdminSecrets(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAdminSecrets> {
  const payload = await fetchAccountApiJson("admin/secrets", accessToken, options);
  return parseAccountApiPayload(accountApiAdminSecretsSchema, payload, "admin/secrets", "GET");
}

export type AccountApiAdminSecretWriteBody = {
  value: string;
  expected_fingerprint?: string;
  mode?: "replace" | "append";
};

export async function setAccountApiAdminSecret(
  accessToken: string,
  slot: string,
  body: AccountApiAdminSecretWriteBody,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAdminSecretWrite> {
  const route = secretRoute(slot);
  const payload = await postAccountApiJson(route, accessToken, body, options);
  return parseAccountApiPayload(accountApiAdminSecretWriteSchema, payload, route, "POST");
}

export async function revokeAccountApiAdminSecret(
  accessToken: string,
  slot: string,
  body: { expected_fingerprint?: string },
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAdminSecretWrite> {
  const route = secretRoute(slot, "/revoke");
  const payload = await postAccountApiJson(route, accessToken, body, options);
  return parseAccountApiPayload(accountApiAdminSecretWriteSchema, payload, route, "POST");
}

export async function restoreAccountApiAdminSecret(
  accessToken: string,
  slot: string,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAdminSecretRestore> {
  const route = secretRoute(slot, "/restore");
  const payload = await postAccountApiJson(route, accessToken, {}, options);
  return parseAccountApiPayload(accountApiAdminSecretRestoreSchema, payload, route, "POST");
}

/** The queue, already narrowed upstream to what this caller may read. */
/** The staff directory: everyone who is not a plain account, and what their role permits. */
export async function fetchAccountApiAdminStaff(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAdminStaff> {
  const payload = await fetchAccountApiJson("admin/staff", accessToken, options);
  return parseAccountApiPayload(accountApiAdminStaffSchema, payload, "admin/staff", "GET");
}

/**
 * Grant or remove a staff role.
 *
 * Owner and Admin are not sendable here: the service refuses them, and the type refuses
 * them first so the refusal is visible where the call is written rather than at run time.
 */
export async function setAccountApiAdminStaffRole(
  accessToken: string,
  userId: string,
  body: { role: AssignableRole; reason?: string },
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAdminStaffWrite> {
  const candidate = z.guid().safeParse(userId.trim().toLowerCase());
  if (!candidate.success) throw new AccountApiUnavailableError();
  const route = `admin/staff/${encodeURIComponent(candidate.data)}`;
  const payload = await postAccountApiJson(route, accessToken, body, options);
  return parseAccountApiPayload(accountApiAdminStaffWriteSchema, payload, route, "POST");
}

/** The staff roles the desk-staffing route may grant; Owner and Admin need `roles:write`. */
export const GRANTABLE_STAFF_ROLES = [
  "support_manager",
  "billing_manager",
  "auditor",
  "support",
  "user",
] as const satisfies readonly AssignableRole[];

export async function fetchAccountApiAdminReleaseStatus(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAdminReleaseStatus> {
  const payload = await fetchAccountApiJson("admin/releases", accessToken, options);
  return parseAccountApiPayload(
    accountApiAdminReleaseStatusSchema,
    payload,
    "admin/releases",
    "GET",
  );
}

export async function fetchAccountApiAdminUsers(
  accessToken: string,
  options: AccountApiAdminUsersOptions = {},
): Promise<AccountApiAdminUsers> {
  const { limit = 50, offset = 0, q, status, ...fetchOptions } = options;
  const query: Record<string, string> = {
    ...(fetchOptions.query ?? {}),
    limit: String(limit),
    offset: String(offset),
  };
  const text = (q ?? "").trim();
  if (text) query.q = text.slice(0, 120);
  if (status) query.status = status;
  const payload = await fetchAccountApiJson("admin/users", accessToken, {
    ...fetchOptions,
    query,
  });
  return parseAccountApiPayload(accountApiAdminUsersSchema, payload, "admin/users", "GET");
}

export async function fetchAccountApiAdminUser(
  accessToken: string,
  userId: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAdminUserDetail> {
  const parsedUserId = z.guid().safeParse(userId.trim().toLowerCase());
  if (!parsedUserId.success) throw new AccountApiUnavailableError();
  const payload = await fetchAccountApiJson(
    `admin/users/${encodeURIComponent(parsedUserId.data)}`,
    accessToken,
    options,
  );
  return parseAccountApiPayload(
    accountApiAdminUserDetailSchema,
    payload,
    `admin/users/${encodeURIComponent(parsedUserId.data)}`,
    "GET",
  );
}

export async function fetchAccountApiAdminAuditEvents(
  accessToken: string,
  options: AccountApiAdminAuditOptions = {},
): Promise<AccountApiAdminAuditEvents> {
  const { filters = {}, limit = 50, offset = 0, ...fetchOptions } = options;
  const query: Record<string, string> = {
    ...(fetchOptions.query ?? {}),
    limit: String(limit),
    offset: String(offset),
  };
  for (const [name, value] of Object.entries(filters)) {
    const cleaned = String(value ?? "").trim();
    if (cleaned) query[name] = cleaned;
  }
  const payload = await fetchAccountApiJson("admin/audit-events/search", accessToken, {
    ...fetchOptions,
    query,
  });
  return parseAccountApiPayload(
    accountApiAdminAuditEventsSchema,
    payload,
    "admin/audit-events/search",
    "GET",
  );
}

export async function fetchAccountApiAdminReports(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAdminReports> {
  const payload = await fetchAccountApiJson("admin/reports", accessToken, options);
  return parseAccountApiPayload(accountApiAdminReportsSchema, payload, "admin/reports", "GET");
}

export async function enqueueAccountApiAdminReport(
  accessToken: string,
  body: AccountApiAdminReportBody,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAdminReportEnqueue> {
  const payload = await postAccountApiJson(
    "admin/reports/enqueue",
    accessToken,
    {
      report_type: body.report_type,
      format: body.format,
      filters: body.filters ?? {},
      ...(body.expected_revision !== undefined
        ? { expected_revision: body.expected_revision }
        : {}),
    },
    options,
  );
  return parseAccountApiPayload(
    accountApiAdminReportEnqueueSchema,
    payload,
    "admin/reports/enqueue",
    "POST",
  );
}

export async function setAccountApiAdminUserActive(
  accessToken: string,
  userId: string,
  isActive: boolean,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAdminUserActivation> {
  const parsedUserId = z.guid().safeParse(userId.trim().toLowerCase());
  if (!parsedUserId.success) throw new AccountApiUnavailableError();
  const payload = await postAccountApiJson(
    `admin/users/${encodeURIComponent(parsedUserId.data)}/activation`,
    accessToken,
    { is_active: isActive },
    options,
  );
  return parseAccountApiPayload(
    accountApiAdminUserActivationSchema,
    payload,
    `admin/users/${encodeURIComponent(parsedUserId.data)}/activation`,
    "POST",
  );
}

/**
 * Assign a canonical role to another account. The API answers with the same projection
 * the activation route uses, so the caller can render the new role without a re-read.
 */
export async function setAccountApiAdminUserRole(
  accessToken: string,
  userId: string,
  role: AssignableRole,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAdminUserActivation> {
  const parsedUserId = z.guid().safeParse(userId.trim().toLowerCase());
  const parsedRole = z.enum(ASSIGNABLE_ROLES).safeParse(role);
  if (!parsedUserId.success || !parsedRole.success) throw new AccountApiUnavailableError();
  const route = `admin/users/${encodeURIComponent(parsedUserId.data)}/role`;
  const payload = await postAccountApiJson(route, accessToken, { role: parsedRole.data }, options);
  return parseAccountApiPayload(accountApiAdminUserActivationSchema, payload, route, "POST");
}

/** How many active accounts sit on each stored tier. */
export async function fetchAccountApiAdminSubscriptions(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAdminSubscriptions> {
  const payload = await fetchAccountApiJson("admin/subscriptions", accessToken, options);
  return parseAccountApiPayload(
    accountApiAdminSubscriptionsSchema,
    payload,
    "admin/subscriptions",
    "GET",
  );
}

/** What one account has actually spent, for answering a support question. */
export async function fetchAccountApiAdminUserUsage(
  accessToken: string,
  userId: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAdminUserUsage> {
  const parsedUserId = z.guid().safeParse(userId.trim().toLowerCase());
  if (!parsedUserId.success) throw new AccountApiUnavailableError();
  const route = `admin/users/${encodeURIComponent(parsedUserId.data)}/usage`;
  const payload = await fetchAccountApiJson(route, accessToken, options);
  return parseAccountApiPayload(accountApiAdminUserUsageSchema, payload, route, "GET");
}

/**
 * One account's resolved entitlements, as that account's own device would see them.
 *
 * The alternative was mirroring the plan catalogue in the console so it could show what a
 * limit *would* be — a second source of truth that drifts the first time a plan changes
 * and nobody remembers the mirror exists. Resolving on the server means what an operator
 * sees is exactly what the user gets, overrides and trials included.
 */
export async function fetchAccountApiAdminUserEntitlements(
  accessToken: string,
  userId: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAdminUserEntitlements> {
  const parsedUserId = z.guid().safeParse(userId.trim().toLowerCase());
  if (!parsedUserId.success) throw new AccountApiUnavailableError();
  const route = `admin/users/${encodeURIComponent(parsedUserId.data)}/entitlements`;
  const payload = await fetchAccountApiJson(route, accessToken, options);
  return parseAccountApiPayload(accountApiAdminUserEntitlementsSchema, payload, route, "GET");
}

/** Move an account to a plan. The API refuses a caller changing their own. */
export async function setAccountApiAdminUserSubscription(
  accessToken: string,
  userId: string,
  body: AccountApiSubscriptionUpdateBody,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAdminSubscriptionUpdate> {
  const parsedUserId = z.guid().safeParse(userId.trim().toLowerCase());
  if (!parsedUserId.success) throw new AccountApiUnavailableError();
  const route = `admin/users/${encodeURIComponent(parsedUserId.data)}/subscription`;
  const payload = await postAccountApiJson(route, accessToken, body, options);
  return parseAccountApiPayload(accountApiAdminSubscriptionUpdateSchema, payload, route, "POST");
}

/** Raise, lower or remove one account's allowance for one feature. */
export async function setAccountApiAdminUserEntitlement(
  accessToken: string,
  userId: string,
  body: AccountApiEntitlementUpdateBody,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAdminSubscriptionUpdate> {
  const parsedUserId = z.guid().safeParse(userId.trim().toLowerCase());
  if (!parsedUserId.success) throw new AccountApiUnavailableError();
  const route = `admin/users/${encodeURIComponent(parsedUserId.data)}/entitlement`;
  const payload = await postAccountApiJson(route, accessToken, body, options);
  return parseAccountApiPayload(accountApiAdminSubscriptionUpdateSchema, payload, route, "POST");
}

export async function revokeAccountApiAdminUserSession(
  accessToken: string,
  userId: string,
  sessionId: string,
  options: AccountApiFetchOptions & { idempotencyKey: string; reason?: string },
): Promise<AccountApiAdminUserSessionRevoke> {
  const parsedUserId = z.guid().safeParse(userId.trim().toLowerCase());
  const parsedSessionId = z.guid().safeParse(sessionId.trim().toLowerCase());
  if (!parsedUserId.success || !parsedSessionId.success) throw new AccountApiUnavailableError();
  const { reason = "admin-revoked", ...fetchOptions } = options;
  const payload = await postAccountApiJson(
    `admin/users/${encodeURIComponent(parsedUserId.data)}/sessions/${encodeURIComponent(parsedSessionId.data)}/revoke`,
    accessToken,
    { reason },
    fetchOptions,
  );
  return parseAccountApiPayload(
    accountApiAdminUserSessionRevokeSchema,
    payload,
    `admin/users/${encodeURIComponent(parsedUserId.data)}/sessions/${encodeURIComponent(parsedSessionId.data)}/revoke`,
    "POST",
  );
}

export async function fetchAccountApiAdminNotifications(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAdminNotifications> {
  const payload = await fetchAccountApiJson("admin/notifications", accessToken, options);
  return parseAccountApiPayload(
    accountApiAdminNotificationsSchema,
    payload,
    "admin/notifications",
    "GET",
  );
}

export async function updateAccountApiAdminNotifications(
  accessToken: string,
  body: Pick<AccountApiAdminNotifications, "notifications"> & { expected_revision?: string },
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAdminNotificationsUpdate> {
  const payload = await postAccountApiJson(
    "admin/notifications/update",
    accessToken,
    {
      notifications: body.notifications,
      ...(body.expected_revision !== undefined
        ? { expected_revision: body.expected_revision }
        : {}),
    },
    options,
  );
  return parseAccountApiPayload(
    accountApiAdminNotificationsUpdateSchema,
    payload,
    "admin/notifications/update",
    "POST",
  );
}

export async function fetchAccountApiAdminNotificationEmailQueue(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAdminNotificationEmailQueue> {
  const payload = await fetchAccountApiJson("admin/email", accessToken, options);
  return parseAccountApiPayload(
    accountApiAdminNotificationEmailQueueSchema,
    payload,
    "admin/email",
    "GET",
  );
}

export async function enqueueAccountApiAdminNotificationEmail(
  accessToken: string,
  body: {
    expected_revision?: string;
    subject: string;
    body: string;
    target: AccountApiAdminNotificationEmailQueue["jobs"][number]["target"];
    scheduled_at?: string;
  },
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAdminNotificationEmailEnqueue> {
  const payload = await postAccountApiJson(
    "admin/email/enqueue",
    accessToken,
    {
      subject: body.subject,
      body: body.body,
      target: body.target,
      scheduled_at: body.scheduled_at ?? "",
      ...(body.expected_revision !== undefined
        ? { expected_revision: body.expected_revision }
        : {}),
    },
    options,
  );
  return parseAccountApiPayload(
    accountApiAdminNotificationEmailEnqueueSchema,
    payload,
    "admin/email/enqueue",
    "POST",
  );
}
