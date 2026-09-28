import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { formatRateLimitMessage } from "@/lib/auth/rate-limit";

/**
 * Shared state shapes and refusal wording for the auth forms. One vocabulary,
 * deliberately terse: an auth surface that explains which part was wrong is an oracle.
 */

export type { AuthFormState } from "@/lib/auth/form-state";
export { INITIAL_AUTH_STATE } from "@/lib/auth/form-state";

export const GENERIC_REFUSAL = "That was not accepted. Check the details and try again.";
export const SERVICE_UNAVAILABLE =
  "The service could not be reached. Nothing was changed — try again shortly.";
export const ALREADY_ENROLLED =
  "This account already has an authenticator. Sign in with it, or ask an Owner to reset it.";

export function refusalMessage(error: unknown): string {
  if (error instanceof HqApiRequestError) {
    if (error.code === "rate_limited") {
      const retry = error.details["retry_after_seconds"];
      return formatRateLimitMessage(typeof retry === "number" ? retry : undefined);
    }
    if (error.code === "unauthenticated") return GENERIC_REFUSAL;
    if (error.code === "malformed_request") return GENERIC_REFUSAL;
    if (error.code === "forbidden") return ALREADY_ENROLLED;
    return SERVICE_UNAVAILABLE;
  }
  if (error instanceof HqApiUnavailableError) return SERVICE_UNAVAILABLE;
  throw error;
}

export function fieldValue(formData: FormData, name: string, maxLength = 1024): string {
  const raw = formData.get(name);
  return typeof raw === "string" ? raw.slice(0, maxLength) : "";
}
