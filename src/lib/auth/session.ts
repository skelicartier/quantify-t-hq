import "server-only";

import { cookies } from "next/headers";

/**
 * The portal's own cookies, and the only file that names them.
 *
 * One session cookie, no refresh cookie: the service's staff sessions are opaque
 * tokens with their own idle and absolute limits, so there is nothing to refresh —
 * the cookie simply outlives the session slightly and the service says no.
 *
 * The pending cookie carries the five-minute typed token between the password step
 * and the code step. It is HttpOnly like everything else: the browser never needs to
 * read it, only to carry it to the next server action.
 */

export const HQ_SESSION_COOKIE = "hq-session";
export const HQ_PENDING_COOKIE = "hq-pending";
/**
 * A random value that names this browser profile to the service, which keeps only its
 * hash: "a new sign-in" then means a browser the account has never finished a sign-in
 * on, not a new network. It outlives sessions on purpose (400 days, the most a browser
 * keeps a cookie) and carries nothing about the person.
 */
export const HQ_DEVICE_COOKIE = "hq-device";
const DEVICE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
const PENDING_MAX_AGE_SECONDS = 5 * 60;

function baseAttributes() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(HQ_SESSION_COOKIE, token, {
    ...baseAttributes(),
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function readSessionToken(): Promise<string> {
  try {
    const store = await cookies();
    return store.get(HQ_SESSION_COOKIE)?.value ?? "";
  } catch {
    return "";
  }
}

function newDeviceId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** This browser's device id, minted and stored the first time a sign-in needs it. */
export async function readOrMintDeviceId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(HQ_DEVICE_COOKIE)?.value ?? "";
  if (/^[A-Za-z0-9_-]{32,128}$/.test(existing)) return existing;
  const minted = newDeviceId();
  store.set(HQ_DEVICE_COOKIE, minted, { ...baseAttributes(), maxAge: DEVICE_MAX_AGE_SECONDS });
  return minted;
}

/** The SHA-256 of this browser's device id, as the service stores it; "" when none. */
export async function currentDeviceHash(): Promise<string> {
  try {
    const store = await cookies();
    const value = store.get(HQ_DEVICE_COOKIE)?.value ?? "";
    if (!value) return "";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    );
  } catch {
    return "";
  }
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(HQ_SESSION_COOKIE, "", { ...baseAttributes(), maxAge: 0 });
}

export type PendingKind = "totp" | "enroll";

export type PendingStep = {
  kind: PendingKind;
  token: string;
  /** The account holds a passkey, so the code step may offer it. */
  passkeys?: boolean;
};

export async function setPendingCookie(
  kind: PendingKind,
  token: string,
  options: { passkeys?: boolean } = {},
): Promise<void> {
  const store = await cookies();
  const value: PendingStep = { kind, token, ...(options.passkeys ? { passkeys: true } : {}) };
  store.set(HQ_PENDING_COOKIE, JSON.stringify(value), {
    ...baseAttributes(),
    maxAge: PENDING_MAX_AGE_SECONDS,
  });
}

export async function readPendingCookie(): Promise<PendingStep | null> {
  try {
    const store = await cookies();
    const raw = store.get(HQ_PENDING_COOKIE)?.value;
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      ((parsed as { kind?: unknown }).kind === "totp" ||
        (parsed as { kind?: unknown }).kind === "enroll") &&
      typeof (parsed as { token?: unknown }).token === "string"
    ) {
      const step = parsed as PendingStep;
      return { kind: step.kind, token: step.token, passkeys: step.passkeys === true };
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearPendingCookie(): Promise<void> {
  const store = await cookies();
  store.set(HQ_PENDING_COOKIE, "", { ...baseAttributes(), maxAge: 0 });
}
