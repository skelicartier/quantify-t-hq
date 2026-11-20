/**
 * The walk's regulatory profile (ws-notes/security/spec.md §9.8 PR1–PR4): on the waitlist firm
 * "Walk Capital 2000" as the waitlist's walk seeds it, SEBI CSCRF (mid-size), with the duty
 * "High-severity missing patches fixed within 1 week" marked in the contract. Invented.
 */

import { WALK_ENTRIES } from "../waitlist/walk-seed";

export const WALK_PROFILE_ENTRY = WALK_ENTRIES.firm;
export const WALK_PROFILE_DUTY = "cscrf-patch" as const;
export const WALK_PROFILE_CATEGORY = "mid" as const;
