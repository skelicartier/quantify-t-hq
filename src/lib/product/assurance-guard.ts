import "server-only";

import { requireStaff } from "@/lib/access/core";
import type { AssuranceState } from "@/lib/product/assurance";

const HQ_SIGNED_IN: AssuranceState = {
  verifiedTotpFactors: [],
  unverifiedTotpFactorIds: [],
  currentLevel: "aal2",
  requiredLevel: "aal2",
  mfaEnrolled: true,
  challengeRequired: false,
  levelReadable: true,
  factorsReadable: true,
};

/**
 * For reading the administration screens: every HQ session was opened with an
 * authenticator code, so a read never asks again.
 */
export async function readAssurance(): Promise<AssuranceState> {
  return HQ_SIGNED_IN;
}

/**
 * For changing anything: satisfied only while the staff member's fresh code is open (HQ's
 * ten-minute "confirm it's you"). Otherwise the copied actions answer with their own
 * "verify your authenticator code" line, and the Product bar offers the code. The service
 * refuses a stale change regardless; this only says so in words first.
 */
export async function getCurrentAssurance(): Promise<AssuranceState> {
  const context = await requireStaff("/product");
  return context.me.sudo_fresh
    ? HQ_SIGNED_IN
    : { ...HQ_SIGNED_IN, currentLevel: "aal1", challengeRequired: true };
}
