import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { grantSudo, readMe, type HqMe } from "@/lib/api/auth";
import { devAutologinPersona, isDevPersona } from "@/lib/auth/dev-bypass";
import { readSessionToken } from "@/lib/auth/session";

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

/** The signed-in staff member, or a redirect to sign-in that remembers where to return. */
export async function requireStaff(nextPath: string): Promise<StaffContext> {
  const state = await currentStaff();
  if (state === "signed-out") {
    const next = nextPath && nextPath !== "/" ? `?next=${encodeURIComponent(nextPath)}` : "";
    // Development only: a stale cookie (the mock restarted) signs straight back in.
    if (devAutologinPersona()) redirect(`/dev/signin${next}`);
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
