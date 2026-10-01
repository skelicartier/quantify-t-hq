/**
 * The shape the product's administration screens read a second factor through. In the
 * console it came from the customer's own sign-in; in HQ every staff member has signed in
 * with their authenticator already, and a change additionally needs a fresh code (HQ's
 * "confirm it's you"). `assurance-guard.ts` maps that onto this shape.
 */
export type VerifiedTotpFactor = { id: string; friendlyName: string | null };

export type AssuranceState = {
  verifiedTotpFactors: VerifiedTotpFactor[];
  unverifiedTotpFactorIds: string[];
  currentLevel: "aal1" | "aal2" | null;
  requiredLevel: "aal1" | "aal2" | null;
  mfaEnrolled: boolean;
  challengeRequired: boolean;
  levelReadable: boolean;
  factorsReadable: boolean;
};
