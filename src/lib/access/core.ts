import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { grantSudo, login, readMe, verifyTotp, type HqMe } from "@/lib/api/auth";
import { DEV_PERSONAS, devAutologinPersona, isDevPersona } from "@/lib/auth/dev-bypass";
import { readSessionToken, setSessionCookie } from "@/lib/auth/session";
import { setRequestTimeZone } from "@/lib/format";

/**
 * The one identity read per request. Every layout, page and loader goes through
 * this; React `cache()` collapses them into a single `hq/me` call, the console's
 * pattern kept exactly.
 */

export type StaffContext = {
  token: string;
  me: HqMe;
};

export const currentStaff = cache(
  async (): Promise<StaffContext | "signed-out" | "unavailable"> => {
    const token = await readSessionToken();
    if (!token) return "signed-out";
    try {
      let me = await readMe(token);
      // Development only, and only for the mock's test personas (nobody at hq.test
      // exists on the real service): the confirm-it's-you window is granted and renewed
      // on every read, so no panel stands between a tester and a door. The mock takes
      // the same code for every prompt.
      if (devAutologinPersona() && isDevPersona(me.staff.email) && !me.sudo_fresh) {
        try {
          await grantSudo(token, "000000");
          me = await readMe(token);
        } catch (error) {
          if (!(error instanceof HqApiRequestError || error instanceof HqApiUnavailableError))
            throw error;
        }
      }
      // Every time this request renders is printed in the person's zone from here on.
      setRequestTimeZone(me.time_zone);
      return { token, me };
    } catch (error) {
      if (error instanceof HqApiRequestError && (error.status === 401 || error.status === 403)) {
        return "signed-out";
      }
      if (error instanceof HqApiUnavailableError) return "unavailable";
      throw error;
    }
  },
);

/**
 * Development only: a press that finds the session gone signs back in where it landed.
 * The mock ends an Owner's session after 15 quiet minutes, and typing into a form is quiet,
 * so the press that follows a long edit arrives signed out. A page load goes through
 * `/dev/signin` and lands again; a server action cannot (the sign-in route is a GET, and the
 * action's answer must be the router's own), so it signs in here, sets the cookie, and the
 * press goes through. Only inside a server action, where a cookie can be set, and once per
 * request: the page drawn after the action reuses the same sign-in.
 */
const devSignBackIn = cache(async (): Promise<StaffContext | null> => {
  const flag = devAutologinPersona();
  if (!flag) return null;
  if ((await headers()).get("next-action") === null) return null;
  const email = isDevPersona(flag) ? flag : DEV_PERSONAS[0].email;
  try {
    const pending = await login(email, "password-123");
    if (pending.mfa !== "totp") return null;
    const session = await verifyTotp(pending.pending_token, "000000");
    await setSessionCookie(session.token);
    const me = await readMe(session.token);
    setRequestTimeZone(me.time_zone);
    return { token: session.token, me };
  } catch {
    return null;
  }
});

/** The signed-in staff member, or a redirect to sign-in that remembers where to return. */
export async function requireStaff(nextPath: string): Promise<StaffContext> {
  const state = await currentStaff();
  if (state === "signed-out") {
    const next = nextPath && nextPath !== "/" ? `?next=${encodeURIComponent(nextPath)}` : "";
    // Development only: a stale cookie (the mock restarted, or the session went quiet)
    // signs straight back in: in place for a press, through /dev/signin for a page.
    if (devAutologinPersona()) {
      const back = await devSignBackIn();
      if (back) return back;
      redirect(`/dev/signin${next}`);
    }
    redirect(`/login${next}`);
  }
  if (state === "unavailable") {
    // The shell still renders; pages show their degraded states. Signing somebody out
    // because the service blinked would lose their place for nothing.
    redirect("/login?notice=unavailable");
  }
  return state;
}

export function hasCapability(context: StaffContext, capability: string): boolean {
  return context.me.capabilities.includes(capability);
}
