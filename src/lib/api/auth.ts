import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

/** The auth domain: schemas beside their calls, every route a literal string the
 * route-parity test can find. */

const okEnvelope = z.object({ ok: z.literal(true) });

export const pendingSchema = okEnvelope.extend({
  mfa: z.enum(["totp", "enroll"]),
  pending_token: z.string().min(1),
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
  sudo_fresh: z.boolean(),
  sudo_until: z.string().nullable(),
  environment: z.string(),
});
export type HqMe = z.infer<typeof meSchema>;

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

export function login(email: string, password: string) {
  return postHqJson("hq/auth/login", pendingSchema, { body: { email, password } });
}

export function verifyTotp(pendingToken: string, code: string) {
  return postHqJson("hq/auth/totp", sessionSchema, {
    body: { pending_token: pendingToken, code },
  });
}

export function useRecoveryCode(pendingToken: string, recoveryCode: string) {
  return postHqJson("hq/auth/recovery", sessionSchema, {
    body: { pending_token: pendingToken, recovery_code: recoveryCode },
  });
}

export function beginEnrollment(pendingToken: string) {
  return postHqJson("hq/auth/enroll/begin", enrollBeginSchema, {
    body: { pending_token: pendingToken },
  });
}

export function confirmEnrollment(pendingToken: string, code: string) {
  return postHqJson("hq/auth/enroll/confirm", enrolledSessionSchema, {
    body: { pending_token: pendingToken, code },
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
