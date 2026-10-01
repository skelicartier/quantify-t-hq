/**
 * The shapes the credential forms and their Server Actions agree on.
 *
 * Deliberately free of any Account API import so the browser half of the form can use it:
 * nothing here describes a credential, only the envelope around one — which slot a
 * submission is for, how it should be applied, and what the operator is told afterwards.
 *
 * The one rule that matters in this file: an action result carries a fixed message and a
 * slot name, never anything that came back from the service. Upstream error text is
 * client-supplied provider output, and a provider that echoes a rejected key into its own
 * error body would put that key into the page, the payload, and any screenshot of either.
 */

export type AdminSecretActionState = {
  status: "idle" | "success" | "error";
  message: string;
  /** Which form the message belongs beside; empty until a submission has been made. */
  slot: string;
};

export const INITIAL_ADMIN_SECRET_STATE: AdminSecretActionState = {
  status: "idle",
  message: "",
  slot: "",
};

/** Catalogue slot names, the only thing accepted as a target. */
export const SECRET_SLOT_PATTERN = /^[A-Za-z0-9_]{1,80}$/u;

/** A displayed fingerprint, used as the "still the key I looked at" guard on a write. */
export const SECRET_FINGERPRINT_PATTERN = /^[0-9a-f]{8,64}$/u;

/**
 * Long enough for the longest provider key in the catalogue with room to spare, short
 * enough that a pasted file cannot become a credential.
 */
export const SECRET_VALUE_MAX_LENGTH = 4096;

export const SECRET_MODES = ["replace", "append"] as const;
export type AdminSecretMode = (typeof SECRET_MODES)[number];

export function isAdminSecretMode(value: unknown): value is AdminSecretMode {
  return typeof value === "string" && (SECRET_MODES as readonly string[]).includes(value);
}
