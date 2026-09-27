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

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(HQ_SESSION_COOKIE, "", { ...baseAttributes(), maxAge: 0 });
}

export type PendingKind = "totp" | "enroll";

export async function setPendingCookie(kind: PendingKind, token: string): Promise<void> {
  const store = await cookies();
  store.set(HQ_PENDING_COOKIE, JSON.stringify({ kind, token }), {
    ...baseAttributes(),
    maxAge: PENDING_MAX_AGE_SECONDS,
  });
}

export async function readPendingCookie(): Promise<{ kind: PendingKind; token: string } | null> {
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
      return parsed as { kind: PendingKind; token: string };
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
