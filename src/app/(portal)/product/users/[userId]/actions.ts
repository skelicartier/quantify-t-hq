"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import {
  AccountApiRequestError,
  ASSIGNABLE_ROLES,
  fetchAccountApiMe,
  revokeAccountApiAdminUserSession,
  ROLE_WRITE_CAPABILITY,
  setAccountApiAdminUserActive,
  setAccountApiAdminUserEntitlement,
  setAccountApiAdminUserRole,
  setAccountApiAdminUserSubscription,
  SUBSCRIPTION_WRITE_CAPABILITY,
  USER_ACTIVATION_CAPABILITY,
  USER_SESSION_REVOKE_CAPABILITY,
  type AccountApiEntitlementUpdateBody,
  type AssignableRole,
} from "@/lib/product/account-api";
import {
  hasAdminPortalAccess,
  hasPrivilegedRole,
  hasSatisfiedPrivilegedAssurance,
} from "@/lib/product/access";
import {
  featureLabel,
  isBooleanFeature,
  isCanonicalPlan,
  isFeatureKey,
  planLabel,
  TRIAL_DAYS,
  type FeatureKey,
  type PlanKey,
} from "@/lib/product/plan-catalogue";
import { roleLabel } from "@/lib/product/role-labels";
import {
  isOverrideExpiryChoice,
  OVERRIDE_REASON_MAX,
  OVERRIDE_REASON_MIN,
  type AdminEntitlementOverrideState,
  type AdminSubscriptionPlanState,
} from "@/lib/product/subscription";
import type { AdminUserActivationState } from "@/lib/product/user-activation";
import type { AdminUserRoleState } from "@/lib/product/user-role";
import type { AdminUserSessionRevocationState } from "@/lib/product/user-session-revocation";
import { getCurrentAssurance } from "@/lib/product/assurance-guard";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { createServerAzureClient } from "@/lib/product/session";

const AUTH_ERROR: AdminUserActivationState = {
  status: "error",
  message: "Your administrative session could not be verified. Sign in again and retry.",
};

const CHALLENGE_ERROR: AdminUserActivationState = {
  status: "error",
  message: "Finish signing in with your authenticator code before changing user status.",
};

const FORBIDDEN_ERROR: AdminUserActivationState = {
  status: "error",
  message: "This administrative session cannot change that account.",
};

const SERVICE_ERROR: AdminUserActivationState = {
  status: "error",
  message: "User status changes are temporarily unavailable. Please try again.",
};

function parseUuid(value: FormDataEntryValue | null): string | null {
  const candidate = String(value ?? "")
    .trim()
    .toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
    candidate,
  )
    ? candidate
    : null;
}

function parseActive(value: FormDataEntryValue | null): boolean | null {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function parseRole(value: FormDataEntryValue | null): AssignableRole | null {
  const candidate = String(value ?? "")
    .trim()
    .toLowerCase();
  return (ASSIGNABLE_ROLES as readonly string[]).includes(candidate)
    ? (candidate as AssignableRole)
    : null;
}

const ROLE_AUTH_ERROR: AdminUserRoleState = {
  status: "error",
  message: "Your administrative session could not be verified. Sign in again and retry.",
};

const ROLE_CHALLENGE_ERROR: AdminUserRoleState = {
  status: "error",
  message: "Finish signing in with your authenticator code before changing roles.",
};

const ROLE_FORBIDDEN_ERROR: AdminUserRoleState = {
  status: "error",
  message: "This administrative session cannot change that account's role.",
};

const ROLE_SERVICE_ERROR: AdminUserRoleState = {
  status: "error",
  message: "Role changes are temporarily unavailable. Please try again.",
};

export async function updateAdminUserRole(
  _previousState: AdminUserRoleState,
  formData: FormData,
): Promise<AdminUserRoleState> {
  const userId = parseUuid(formData.get("userId"));
  const role = parseRole(formData.get("role"));
  if (!userId || !role) {
    return { status: "error", message: "Choose one of the available roles." };
  }
  if (formData.get("confirm") !== "on") {
    return { status: "error", message: "Confirm that you understand the change first." };
  }

  try {
    await requireSameOriginServerAction();
    const azure = await createServerAzureClient();
    const accessToken = azure.getAccessToken();
    if (!accessToken) return ROLE_AUTH_ERROR;

    const me = await fetchAccountApiMe(accessToken);
    if (
      !hasAdminPortalAccess(me) ||
      !me.capabilities.includes(ROLE_WRITE_CAPABILITY) ||
      me.user.user_id === userId
    ) {
      return ROLE_FORBIDDEN_ERROR;
    }

    const assurance = await getCurrentAssurance();
    if (hasPrivilegedRole(me) && !hasSatisfiedPrivilegedAssurance(assurance)) {
      return ROLE_CHALLENGE_ERROR;
    }

    const result = await setAccountApiAdminUserRole(accessToken, userId, role, {
      idempotencyKey: `portal-${randomUUID()}`,
    });

    revalidatePath("/product");
    revalidatePath("/product/users");
    revalidatePath(`/product/users/${userId}`);
    revalidatePath("/product/roles");
    return {
      status: "success",
      message: `Role set to ${roleLabel(result.role.effective)}.`,
    };
  } catch (error) {
    if (error instanceof AccountApiRequestError) {
      if (error.status === 404) return { status: "error", message: "That account was not found." };
      if (error.status === 409) {
        return {
          status: "error",
          message: "That change would leave the workspace without an active owner.",
        };
      }
      if (error.status === 403) return ROLE_FORBIDDEN_ERROR;
    }
    return ROLE_SERVICE_ERROR;
  }
}

export async function updateAdminUserActivation(
  _previousState: AdminUserActivationState,
  formData: FormData,
): Promise<AdminUserActivationState> {
  const userId = parseUuid(formData.get("userId"));
  const isActive = parseActive(formData.get("isActive"));
  if (!userId || isActive === null) return SERVICE_ERROR;

  try {
    await requireSameOriginServerAction();
    const azure = await createServerAzureClient();
    const accessToken = azure.getAccessToken();
    if (!accessToken) return AUTH_ERROR;

    const me = await fetchAccountApiMe(accessToken);
    if (
      !hasAdminPortalAccess(me) ||
      !me.capabilities.includes(USER_ACTIVATION_CAPABILITY) ||
      me.user.user_id === userId
    ) {
      return FORBIDDEN_ERROR;
    }

    const assurance = await getCurrentAssurance();
    if (hasPrivilegedRole(me) && !hasSatisfiedPrivilegedAssurance(assurance)) {
      return CHALLENGE_ERROR;
    }

    await setAccountApiAdminUserActive(accessToken, userId, isActive, {
      idempotencyKey: `portal-${randomUUID()}`,
    });

    revalidatePath("/product");
    revalidatePath("/product/users");
    revalidatePath(`/product/users/${userId}`);
    return {
      status: "success",
      message: isActive ? "User activated." : "User deactivated.",
    };
  } catch (error) {
    if (error instanceof AccountApiRequestError) {
      if (error.status === 404) return { status: "error", message: "That account was not found." };
      if (error.status === 403 || error.status === 409) return FORBIDDEN_ERROR;
    }
    return SERVICE_ERROR;
  }
}

// ------------------------------------------------------------- subscriptions

function parsePlan(value: FormDataEntryValue | null): PlanKey | null {
  const candidate = String(value ?? "")
    .trim()
    .toLowerCase();
  return isCanonicalPlan(candidate) ? candidate : null;
}

function parseFeature(value: FormDataEntryValue | null): FeatureKey | null {
  const candidate = String(value ?? "").trim();
  return isFeatureKey(candidate) ? candidate : null;
}

function parsePositiveInteger(value: FormDataEntryValue | null): number | null {
  const candidate = String(value ?? "").trim();
  if (!/^\d{1,12}$/u.test(candidate)) return null;
  const parsed = Number(candidate);
  return parsed > 0 ? parsed : null;
}

const REFUSED_VALUES = "The Account API refused those override values. Check and retry.";

/**
 * The API's own explanation of a refused override, when it sent one.
 *
 * `details` is keyed by the field that was wrong — for an override that is the feature
 * key — and the message names the allowance the account would actually end up with. An
 * operator who asked for 15 and would get 20 needs to read that sentence, not a generic
 * "check and retry" that leaves them retrying the same number.
 */
function refusalDetail(error: AccountApiRequestError): string | null {
  for (const value of Object.values(error.details)) {
    if (typeof value === "string" && value.trim().length > 0 && value.length <= 400) {
      // Sentence-case it: the API writes lower-case fragments keyed by field.
      const text = value.trim();
      return text.charAt(0).toUpperCase() + text.slice(1);
    }
  }
  return null;
}

/** A trial's end date, in the operator's own locale, for the success line. */
function formatTrialEnd(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toISOString().slice(0, 10);
}

/** The version the API named in a conflict, so the next attempt compares against it. */
function conflictProfileVersion(error: AccountApiRequestError): number | null {
  const value = error.details.profile_version;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

const planFailure = (
  message: string,
  expectedProfileVersion: number,
): AdminSubscriptionPlanState => ({
  status: "error",
  message,
  expectedProfileVersion,
});

/**
 * A refusal keeps whatever overrides the form was already showing.
 *
 * Returning an empty list wiped the table the operator was reading from the moment they
 * mistyped a number, so the screen claimed the account had no overrides — which is a
 * different and much more alarming statement than "that value was rejected".
 */
const overrideFailure = (
  message: string,
  previous?: AdminEntitlementOverrideState,
): AdminEntitlementOverrideState => ({
  status: "error",
  message,
  overrides: previous?.overrides ?? [],
});

/**
 * Move an account to a plan.
 *
 * The write is a compare-and-swap on the target's profile version. The console cannot
 * read that version — no administrative route publishes it — so the first attempt
 * compares against the version the form is holding and a conflict hands back the real
 * one for the operator to confirm against. Retrying automatically would defeat the
 * check the API is making.
 */
export async function updateAdminUserSubscription(
  previousState: AdminSubscriptionPlanState,
  formData: FormData,
): Promise<AdminSubscriptionPlanState> {
  const expected =
    parsePositiveInteger(formData.get("expectedProfileVersion")) ??
    previousState.expectedProfileVersion;
  const userId = parseUuid(formData.get("userId"));
  const plan = parsePlan(formData.get("plan"));
  if (!userId || !plan) return planFailure("Choose one of the available plans.", expected);
  if (formData.get("confirm") !== "on") {
    return planFailure("Confirm that you understand what this plan changes.", expected);
  }
  const startTrial = formData.get("startTrial") === "on";

  try {
    await requireSameOriginServerAction();
    const azure = await createServerAzureClient();
    const accessToken = azure.getAccessToken();
    if (!accessToken) return planFailure(AUTH_ERROR.message, expected);

    const me = await fetchAccountApiMe(accessToken);
    if (
      !hasAdminPortalAccess(me) ||
      !me.capabilities.includes(SUBSCRIPTION_WRITE_CAPABILITY) ||
      me.user.user_id === userId
    ) {
      return planFailure(
        "This administrative session cannot change that account's plan.",
        expected,
      );
    }

    const assurance = await getCurrentAssurance();
    if (hasPrivilegedRole(me) && !hasSatisfiedPrivilegedAssurance(assurance)) {
      return planFailure(
        "Finish signing in with your authenticator code before changing plans.",
        expected,
      );
    }

    const result = await setAccountApiAdminUserSubscription(
      accessToken,
      userId,
      {
        plan,
        expected_profile_version: expected,
        ...(startTrial ? { trial_days: TRIAL_DAYS } : {}),
      },
      { idempotencyKey: `portal-${randomUUID()}` },
    );

    revalidatePath("/product");
    revalidatePath("/product/users");
    revalidatePath(`/product/users/${userId}`);
    revalidatePath("/product/subscriptions");
    if (result.unchanged) {
      // Nothing was written, so nothing is claimed. Saying "plan set" here would also be
      // saying every signed-in device just had its cached entitlements invalidated.
      return {
        status: "success",
        message: `This account is already on ${planLabel(result.plan)}. Nothing was changed.`,
        expectedProfileVersion: Math.max(1, result.profile_version),
      };
    }
    return {
      status: "success",
      // Said from the receipt, never from the form: the checkbox is a request, and only
      // `trial_ends_at` coming back is evidence that a trial was actually started.
      message: `Plan set to ${planLabel(result.plan)}${
        result.trial_ends_at ? ` with a trial until ${formatTrialEnd(result.trial_ends_at)}` : ""
      }. Previously ${planLabel(result.previous_plan || "free")}.`,
      // The receipt carries the version the account is now on, so a second change from
      // the same screen compares against it without a round trip through a conflict.
      expectedProfileVersion: Math.max(1, result.profile_version),
    };
  } catch (error) {
    if (error instanceof AccountApiRequestError) {
      if (error.status === 404) {
        return planFailure("That account was not found.", expected);
      }
      if (error.status === 403) {
        return planFailure(
          "This administrative session cannot change that account's plan.",
          expected,
        );
      }
      if (error.status === 409) {
        const current = conflictProfileVersion(error);
        return {
          status: "conflict",
          message: current
            ? `This account has changed since the page loaded. Confirm again to apply the plan to version ${current}.`
            : "This account has changed since the page loaded. Reload and try again.",
          expectedProfileVersion: current ?? expected,
        };
      }
    }
    return planFailure("Plan changes are temporarily unavailable. Please try again.", expected);
  }
}

/**
 * Grant, raise or remove one account's allowance for one feature.
 *
 * A reason and an expiry are required by the console for the same reason the API
 * requires the reason: a comp nobody can attribute, that nobody has to renew, is how
 * revenue leaks quietly for years.
 */
export async function updateAdminUserEntitlement(
  previousState: AdminEntitlementOverrideState,
  formData: FormData,
): Promise<AdminEntitlementOverrideState> {
  const userId = parseUuid(formData.get("userId"));
  const feature = parseFeature(formData.get("featureKey"));
  if (!userId || !feature)
    return overrideFailure("Choose one of the available features.", previousState);

  const remove = formData.get("intent") === "remove";
  const reason = String(formData.get("reason") ?? "")
    .trim()
    .replace(/\s+/gu, " ");
  const expiry = String(formData.get("expiresInDays") ?? "").trim();
  const allowance = String(formData.get("allowance") ?? "").trim();
  const unlimited = formData.get("unlimited") === "on";
  const enabled = formData.get("enabled") === "on";

  let body: AccountApiEntitlementUpdateBody;
  if (remove) {
    body = { feature_key: feature, remove: true };
  } else {
    if (reason.length < OVERRIDE_REASON_MIN || reason.length > OVERRIDE_REASON_MAX) {
      return overrideFailure(
        `Give a reason of ${OVERRIDE_REASON_MIN}–${OVERRIDE_REASON_MAX} characters so this grant can be attributed later.`,
        previousState,
      );
    }
    if (!isOverrideExpiryChoice(expiry)) {
      return overrideFailure("Choose when this override expires.", previousState);
    }
    if (isBooleanFeature(feature)) {
      body = {
        feature_key: feature,
        bool_value: enabled,
        expires_in_days: Number(expiry),
        reason,
      };
    } else {
      if (!unlimited && !/^\d{1,9}$/u.test(allowance)) {
        return overrideFailure("Enter a whole number of units, or tick unlimited.", previousState);
      }
      body = {
        // `null` is unlimited, never zero: the two must not be able to swap places
        // between the form and the API.
        limit_value: unlimited ? null : Number(allowance),
        feature_key: feature,
        expires_in_days: Number(expiry),
        reason,
      };
    }
  }

  try {
    await requireSameOriginServerAction();
    const azure = await createServerAzureClient();
    const accessToken = azure.getAccessToken();
    if (!accessToken) return overrideFailure(AUTH_ERROR.message, previousState);

    const me = await fetchAccountApiMe(accessToken);
    if (
      !hasAdminPortalAccess(me) ||
      !me.capabilities.includes(SUBSCRIPTION_WRITE_CAPABILITY) ||
      me.user.user_id === userId
    ) {
      return overrideFailure(
        "This administrative session cannot change that account's allowances.",
        previousState,
      );
    }

    const assurance = await getCurrentAssurance();
    if (hasPrivilegedRole(me) && !hasSatisfiedPrivilegedAssurance(assurance)) {
      return overrideFailure(
        "Finish signing in with your authenticator code before changing allowances.",
        previousState,
      );
    }

    const result = await setAccountApiAdminUserEntitlement(accessToken, userId, body, {
      idempotencyKey: `portal-${randomUUID()}`,
    });

    revalidatePath("/product");
    revalidatePath("/product/users");
    revalidatePath(`/product/users/${userId}`);
    revalidatePath("/product/subscriptions");
    return {
      status: "success",
      message: remove
        ? `Override removed from ${featureLabel(feature)}. ${planLabel(result.plan)} defaults apply again.`
        : `${featureLabel(feature)} override recorded on the ${planLabel(result.plan)} plan.`,
      overrides: result.overrides,
    };
  } catch (error) {
    if (error instanceof AccountApiRequestError) {
      if (error.status === 404) {
        return overrideFailure("That account was not found.", previousState);
      }
      if (error.status === 403) {
        return overrideFailure(
          "This administrative session cannot change that account's allowances.",
          previousState,
        );
      }
      if (error.status === 400) {
        // The API refuses an override that resolves to nothing — a limit at or below what
        // the account already has, or a flag turned off — and its message names what the
        // account would actually get. That is exactly what the operator needs to read, so
        // it is passed through rather than replaced with "check and retry".
        return overrideFailure(refusalDetail(error) ?? REFUSED_VALUES, previousState);
      }
    }
    return overrideFailure(
      "Allowance changes are temporarily unavailable. Please try again.",
      previousState,
    );
  }
}

export async function revokeAdminUserSession(
  _previousState: AdminUserSessionRevocationState,
  formData: FormData,
): Promise<AdminUserSessionRevocationState> {
  const userId = parseUuid(formData.get("userId"));
  const sessionId = parseUuid(formData.get("sessionId"));
  if (!userId || !sessionId) return SERVICE_ERROR;

  try {
    await requireSameOriginServerAction();
    const azure = await createServerAzureClient();
    const accessToken = azure.getAccessToken();
    if (!accessToken) return AUTH_ERROR;

    const me = await fetchAccountApiMe(accessToken);
    if (
      !hasAdminPortalAccess(me) ||
      !me.capabilities.includes(USER_SESSION_REVOKE_CAPABILITY) ||
      me.user.user_id === userId
    ) {
      return FORBIDDEN_ERROR;
    }

    const assurance = await getCurrentAssurance();
    if (hasPrivilegedRole(me) && !hasSatisfiedPrivilegedAssurance(assurance)) {
      return CHALLENGE_ERROR;
    }

    await revokeAccountApiAdminUserSession(accessToken, userId, sessionId, {
      idempotencyKey: `portal-${randomUUID()}`,
      reason: "admin-revoked",
    });

    revalidatePath("/product");
    revalidatePath("/product/users");
    revalidatePath(`/product/users/${userId}`);
    return {
      status: "success",
      message: "Session revoke recorded.",
    };
  } catch (error) {
    if (error instanceof AccountApiRequestError) {
      if (error.status === 404) return { status: "error", message: "That session was not found." };
      if (error.status === 403) return FORBIDDEN_ERROR;
    }
    return SERVICE_ERROR;
  }
}
