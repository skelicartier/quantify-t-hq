/**
 * Fakes for the services C2 provides, for a copy without C2's modules (ws-notes/company/
 * spec.md §3.3): a `members` with one class and a fixed folio, and a `meetings` that
 * answers `passed()` with the resolutions a test gives. Installed only under test routes
 * and only while the real one is absent; every name in them is invented.
 */

import type {
  MeetingsLookup,
  MembersRegister,
  RegisterLink,
  ResolutionView,
} from "../company-contracts";

export const STAND_IN_CLASS = { class_id: "stand-in-equity", name: "Equity shares of ₹10 each" };
export const STAND_IN_FOLIO = "F-STAND-IN";

export type StandInMembers = MembersRegister & {
  readonly entries: (RegisterLink & { closing_key: string })[];
  /** How many times `allot` was called, by closing key: the tests check it is once. */
  readonly calls: { closing_key: string; shares: number; class_id: string }[];
};

export function standInMembers(): StandInMembers {
  const entries: (RegisterLink & { closing_key: string })[] = [];
  const calls: { closing_key: string; shares: number; class_id: string }[] = [];
  let next = 1;
  const found = (key: string) => entries.find((entry) => entry.closing_key === key) ?? null;
  return {
    entries,
    calls,
    usedFor: () => [],
    classes: () => [{ ...STAND_IN_CLASS, kind: "equity" }],
    allot(input) {
      calls.push({
        closing_key: input.closing_key,
        shares: input.shares,
        class_id: input.class_id,
      });
      const already = found(input.closing_key);
      if (already && !already.reversed) return already;
      const entry = {
        closing_key: input.closing_key,
        entry_id: `stand-in-entry-${next}`,
        member_id: `stand-in-member-${next}`,
        folio: STAND_IN_FOLIO,
        shares: input.shares,
        class_name: STAND_IN_CLASS.name,
        allotted_on: input.allotted_on,
        entered_on: input.entered_on,
        certificate: null,
        reversed: false,
        href: "/data/company/members",
      };
      next += 1;
      entries.push(entry);
      return entry;
    },
    forClosing: (key) => found(key),
    reverse(key) {
      const entry = found(key);
      if (!entry) return null;
      entry.reversed = true;
      return entry;
    },
  };
}

/** A `meetings` that has held nothing and passed exactly the resolutions given. */
export function standInMeetings(resolutions: readonly ResolutionView[]): MeetingsLookup {
  const passed = [...resolutions].sort((a, b) => b.passed_on.localeCompare(a.passed_on));
  return {
    usedFor: () => [],
    held: () => [],
    passed: (kind) => passed.filter((item) => !kind || item.kind === kind),
    resolution: (id) => passed.find((item) => item.resolution_id === id) ?? null,
  };
}
