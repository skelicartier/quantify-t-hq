import "server-only";

import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { formatRateLimitMessage } from "@/lib/auth/rate-limit";
import type { ActionState } from "@/lib/forms/action-state";
import { formatSentence } from "@/lib/format";

/**
 * How a refused record write reads to the person who made it.
 *
 * The service's validation details are written as sentences for this purpose ("an
 * open deal names its next step", "another company already holds this domain"), so
 * they are shown — prefixed with the field they concern — rather than collapsed into
 * "check the values", which would leave the person guessing which value.
 */
export function crmRefusal(error: unknown): ActionState {
  if (error instanceof HqApiRequestError) {
    if (error.status === 404) {
      return { status: "error", message: "That record is no longer available." };
    }
    if (error.status === 403 && error.details["sudo_required"] === true) {
      return {
        status: "error",
        message: "Confirm it's you first: enter a code from your authenticator app above.",
      };
    }
    if (error.status === 403) {
      return { status: "error", message: "Your role cannot make that change." };
    }
    if (error.code === "last_owner_protected") {
      return {
        status: "error",
        message:
          "This is the last Owner who can sign in. Invite and enrol another Owner before ending this one.",
      };
    }
    if (error.code === "idempotency_key_reused") {
      return {
        status: "error",
        message:
          "This form was already submitted once with different values. Reload the page to submit again.",
      };
    }
    if (error.code === "idempotency_attempt_incomplete") {
      return {
        status: "error",
        message: OUTCOME_UNKNOWN,
        keepAttempt: true,
      };
    }
    if (error.code === "rate_limited") {
      const retry = error.details["retry_after_seconds"];
      return {
        status: "error",
        message: formatRateLimitMessage(typeof retry === "number" ? retry : undefined),
      };
    }
    if (error.code === "malformed_request") {
      const reasons = Object.entries(error.details)
        .filter(([, value]) => typeof value === "string" && value)
        .map(([field, value]) =>
          field === "reason" ? String(value) : `${formatSentence(field)}: ${String(value)}`,
        );
      return {
        status: "error",
        message: reasons.length
          ? `Not saved. ${reasons.map((reason) => `${reason.charAt(0).toUpperCase()}${reason.slice(1)}.`).join(" ")}`
          : "Not saved. Check the values and try again.",
      };
    }
  }
  if (error instanceof HqApiRequestError && error.status < 500) {
    return {
      status: "error",
      message: "The service refused this. Nothing was saved and your input is kept.",
    };
  }
  if (error instanceof HqApiRequestError || error instanceof HqApiUnavailableError) {
    // A 5xx or a lost response: the service may have saved it before the answer was
    // lost, so this never claims "nothing was saved". Sending again replays the same
    // attempt instead of repeating it.
    return { status: "error", message: OUTCOME_UNKNOWN, keepAttempt: true };
  }
  throw error;
}

/** Wording for an outcome the portal cannot know. Never "nothing was saved". */
export const OUTCOME_UNKNOWN =
  "HQ could not confirm whether this was saved. Your input is kept — send it again and it will not be recorded twice.";
