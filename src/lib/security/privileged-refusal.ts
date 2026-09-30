import { HqApiRequestError } from "@/lib/api/core";
import { refusalMessage } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";

const REASONS: Record<string, string> = {
  "elevated-cannot-grant":
    "Not while you are elevated: an elevation cannot grant roles or eligibility, or make itself last.",
  "own-role": "Nobody grants themself a role or eligibility. Another owner does.",
  "own-account": "The break-glass account is a second, sealed account, never the one you use.",
  "own-quota": "Another owner lifts your limit; ask them.",
  "export-quota": "That is more than you can export today. An owner can lift the limit for a day.",
};

/** The service's refusal in words: its reason code, its field message, or the generic one. */
export function privilegedRefusal(error: unknown): ActionState {
  if (error instanceof HqApiRequestError) {
    if (error.details["sudo_required"] === true)
      return {
        status: "error",
        message: "Confirm a fresh code from your authenticator app first.",
      };
    const reason = error.details["reason"];
    if (typeof reason === "string" && REASONS[reason])
      return { status: "error", message: REASONS[reason] };
    if (error.details["required_role"] === "owner")
      return { status: "error", message: "Only an owner can do this." };
    const detail = Object.values(error.details).find((value) => typeof value === "string");
    if (error.code === "malformed_request" && typeof detail === "string")
      return { status: "error", message: `${detail.charAt(0).toUpperCase()}${detail.slice(1)}.` };
    if (error.status === 404) return { status: "error", message: "That is no longer there." };
  }
  return { status: "error", message: refusalMessage(error) };
}
