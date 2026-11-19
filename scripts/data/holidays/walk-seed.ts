/**
 * What the holidays walk and the tests add (ws-notes/duties/spec.md §7.7): one invented
 * company holiday, the day §5.1's working-day rows move the close by. No real list: the
 * national days come from the page's own button, as he would add them.
 */

export const WALK_COMPANY_DAY = "2026-11-04";

export const WALK_HOLIDAYS: readonly { on: string; name: string; kind: string; note: string }[] = [
  {
    on: WALK_COMPANY_DAY,
    name: "Walk company day",
    kind: "company",
    note: "Invented for the walk.",
  },
];

/** The paste the walk tries with one bad line: nothing is added. */
export const WALK_BAD_PASTE =
  "2027-03-08, Walk state day one\n2027-03-09, Walk state day two\n32 Jan 2027, Walk state day three";
