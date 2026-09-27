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
  if (error instanceof HqApiRequestError || error instanceof HqApiUnavailableError) {
    return {
      status: "error",
      message: "HQ could not reach the service. Nothing was saved and your input is kept.",
    };
  }
  throw error;
}
