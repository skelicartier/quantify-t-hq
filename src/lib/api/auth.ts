import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

/** The auth domain: schemas beside their calls, every route a literal string the
 * route-parity test can find. */

const okEnvelope = z.object({ ok: z.literal(true) });

export const pendingSchema = okEnvelope.extend({
  mfa: z.enum(["totp", "enroll"]),
  pending_token: z.string().min(1),
  /** A passkey may stand in for the code; absent from an older service. */
  passkeys: z.boolean().optional(),
});
export type PendingLogin = z.infer<typeof pendingSchema>;

const staffSummary = z.object({
  staff_id: z.string(),
  email: z.string(),
  display_name: z.string(),
  role: z.string(),
});

export const sessionSchema = okEnvelope.extend({
  token: z.string().min(1),
  session_id: z.string(),
  absolute_expires_at: z.string(),
  staff: staffSummary,
});
export type MintedSession = z.infer<typeof sessionSchema>;

export const enrollBeginSchema = okEnvelope.extend({
  secret: z.string().min(1),
  otpauth_uri: z.string().startsWith("otpauth://"),
});

export const enrolledSessionSchema = sessionSchema.extend({
  recovery_codes: z.array(z.string().min(1)),
});

export const meSchema = okEnvelope.extend({
  staff: staffSummary.extend({ kind: z.string() }),
  role: z.string(),
  capabilities: z.array(z.string()),
  /** Their own role; `role` differs from it only while an elevation is live. */
  standing_role: z.string().optional(),
  elevation: z
    .object({ elevation_id: z.string(), role: z.string(), ends_at: z.string().nullable() })
    .nullable()
    .optional(),
  sudo_fresh: z.boolean(),
  sudo_until: z.string().nullable(),
  /** Unused recovery codes left; absent from an older service. */
  recovery_codes_remaining: z.number().optional(),
  /** How long this role's session may sit idle, and its absolute life. */
  session_policy: z.object({ idle_minutes: z.number(), absolute_hours: z.number() }).optional(),
  /** The zone this person reads times in; "" until set by hand or from their device. */
  time_zone: z.string().default(""),
  environment: z.string(),
  /** Unread inbox rows, counted as this page rendered; absent from an older service. */
  inbox_unread: z.number().optional(),
  /** Whether AI assistance is set up, and the features this person may use. */
  ai: z.object({ configured: z.boolean(), features: z.array(z.string()) }).optional(),
});
export type HqMe = z.infer<typeof meSchema>;

export function regenerateRecoveryCodes(token: string) {
  return postHqJson(
    "hq/auth/recovery/regenerate",
    okEnvelope.extend({ recovery_codes: z.array(z.string()), remaining: z.number() }),
    { token, body: {} },
  );
}

export const sessionsSchema = okEnvelope.extend({
  sessions: z.array(
    z.object({
      session_id: z.string(),
      created_at: z.string().nullable(),
      last_seen_at: z.string().nullable(),
      ip: z.string(),
      user_agent: z.string(),
      /** "Chrome on macOS": how the new-sign-in mail names the same session. */
      device: z.string(),
      current: z.boolean(),
      revoked_at: z.string().nullable(),
      /** False once idle or old enough to be refused, though never revoked in the table. */
      live: z.boolean(),
      ended: z.string(),
    }),
  ),
});

const sentSchema = okEnvelope.extend({ sent: z.boolean() });
const resetSchema = okEnvelope.extend({ reset: z.boolean() });
const signedOutSchema = okEnvelope.extend({ signed_out: z.boolean() });
const revokedSchema = okEnvelope.extend({ revoked: z.boolean() });
const sudoSchema = okEnvelope.extend({ sudo_until: z.string() });
const passwordChangedSchema = okEnvelope.extend({
  changed: z.boolean(),
  other_sessions_revoked: z.number(),
});

/**
 * `enrolTicket` is the one-time link's ticket after an authenticator reset: without it a
 * password alone never reaches enrolment again.
 */
export function login(email: string, password: string, enrolTicket = "") {
  return postHqJson("hq/auth/login", pendingSchema, {
    body: { email, password, ...(enrolTicket ? { enrol_ticket: enrolTicket } : {}) },
  });
}

/** Each step that opens a session names the browser, so the service can say "new device". */
export function verifyTotp(pendingToken: string, code: string, deviceId = "") {
  return postHqJson("hq/auth/totp", sessionSchema, {
    body: { pending_token: pendingToken, code, ...(deviceId ? { device_id: deviceId } : {}) },
  });
}

export function useRecoveryCode(pendingToken: string, recoveryCode: string, deviceId = "") {
  return postHqJson("hq/auth/recovery", sessionSchema, {
    body: {
      pending_token: pendingToken,
      recovery_code: recoveryCode,
      ...(deviceId ? { device_id: deviceId } : {}),
    },
  });
}

export function beginEnrollment(pendingToken: string) {
  return postHqJson("hq/auth/enroll/begin", enrollBeginSchema, {
    body: { pending_token: pendingToken },
  });
}

export function confirmEnrollment(pendingToken: string, code: string, deviceId = "") {
  return postHqJson("hq/auth/enroll/confirm", enrolledSessionSchema, {
    body: { pending_token: pendingToken, code, ...(deviceId ? { device_id: deviceId } : {}) },
  });
}

export function acceptInvite(token: string, password: string) {
  return postHqJson("hq/auth/invite/accept", pendingSchema, { body: { token, password } });
}

export function requestPasswordReset(email: string) {
  return postHqJson("hq/auth/forgot", sentSchema, { body: { email } });
}

export function resetPassword(token: string, password: string) {
  return postHqJson("hq/auth/reset", resetSchema, { body: { token, password } });
}

export function readMe(token: string) {
  return fetchHqJson("hq/me", meSchema, { token });
}

export function grantSudo(token: string, code: string) {
  return postHqJson("hq/auth/sudo", sudoSchema, { token, body: { code } });
}

export function signOut(token: string) {
  return postHqJson("hq/auth/logout", signedOutSchema, { token, body: {} });
}

export function listSessions(token: string) {
  return fetchHqJson("hq/sessions", sessionsSchema, { token });
}

export function revokeSession(token: string, sessionId: string) {
  return postHqJson("hq/sessions/revoke", revokedSchema, {
    token,
    body: { session_id: sessionId },
  });
}

export function changePassword(token: string, currentPassword: string, newPassword: string) {
  return postHqJson("hq/auth/password", passwordChangedSchema, {
    token,
    body: { current_password: currentPassword, new_password: newPassword },
  });
}

// --- passkeys ---------------------------------------------------------------------------

export const assertionOptionsSchema = okEnvelope.extend({
  challenge: z.string(),
  challenge_token: z.string(),
  rp_id: z.string(),
  allow_credentials: z.array(
    z.object({ type: z.string(), id: z.string(), transports: z.array(z.string()) }),
  ),
  user_verification: z.string(),
  timeout_ms: z.number(),
});
export type AssertionOptionsPayload = z.infer<typeof assertionOptionsSchema>;

/** What the browser needs to ask the authenticator, for the account the pending token names. */
export function passkeyOptions(pendingToken: string) {
  return postHqJson("hq/auth/passkey/options", assertionOptionsSchema, {
    body: { pending_token: pendingToken },
  });
}

export function signInWithPasskey(
  pendingToken: string,
  input: {
    challenge_token: string;
    credential_id: string;
    client_data_json: string;
    authenticator_data: string;
    signature: string;
  },
  deviceId = "",
) {
  return postHqJson("hq/auth/passkey", sessionSchema, {
    body: { pending_token: pendingToken, ...input, ...(deviceId ? { device_id: deviceId } : {}) },
  });
}

export const passkeySchema = z.object({
  passkey_id: z.string(),
  label: z.string(),
  transports: z.array(z.string()),
  created_at: z.string().nullable(),
  last_used_at: z.string().nullable(),
});
export type Passkey = z.infer<typeof passkeySchema>;

export function listPasskeys(token: string) {
  return fetchHqJson(
    "hq/passkeys",
    okEnvelope.extend({ passkeys: z.array(passkeySchema), limit: z.number() }),
    { token },
  );
}

export const creationOptionsSchema = okEnvelope.extend({
  challenge: z.string(),
  challenge_token: z.string(),
  rp: z.object({ id: z.string(), name: z.string() }),
  user: z.object({ id: z.string(), name: z.string(), display_name: z.string() }),
  pub_key_cred_params: z.array(z.object({ type: z.string(), alg: z.number() })),
  exclude_credentials: z.array(z.object({ type: z.string(), id: z.string() })),
  authenticator_selection: z.object({ residentKey: z.string(), userVerification: z.string() }),
  attestation: z.string(),
  timeout_ms: z.number(),
});
export type CreationOptionsPayload = z.infer<typeof creationOptionsSchema>;

export function passkeyRegisterOptions(token: string) {
  return postHqJson("hq/passkeys/register/options", creationOptionsSchema, { token, body: {} });
}

export function registerPasskey(
  token: string,
  input: {
    challenge_token: string;
    label: string;
    client_data_json: string;
    attestation_object: string;
    transports: string[];
  },
) {
  return postHqJson("hq/passkeys/register", okEnvelope.extend({ passkey: passkeySchema }), {
    token,
    body: input,
  });
}

export function deletePasskey(token: string, passkeyId: string) {
  return postHqJson(
    `hq/passkeys/${passkeyId}/delete`,
    okEnvelope.extend({ deleted: z.boolean() }),
    {
      token,
      body: {},
    },
  );
}
