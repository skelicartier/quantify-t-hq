/**
 * Meetings' own limits (ws-notes/company/spec.md §7.3). `guard.ts` holds the limits every
 * module shares and is not edited for this batch, so the ones new to it live here.
 */

export const MEETING_LIMITS = {
  title: 200,
  place: 200,
  chair: 120,
  agenda: 4_000,
  minutes: 20_000,
  comments: 4_000,
  later_note: 2_000,
  shorter_reason: 300,
  cancel_why: 300,
  attendee_name: 200,
  /** People recorded at one meeting. */
  attendees: 40,
  resolution_title: 200,
  resolution_text: 8_000,
  /** Resolutions on one meeting. */
  resolutions: 50,
  signed_by: 120,
  /** The board's size typed when the company record has no directors. */
  board_min: 1,
  board_max: 15,
  search: 200,
} as const;

/** How many meetings Data keeps, cancelled ones included. */
export const MEETING_TOTAL = 2_000;

/** One page of the list. */
export const MEETINGS_PAGE = 100;

/** A Due row joins this many days before its day and stays until done. */
export const DUE_AHEAD_DAYS = 7;

/** The meeting the walk pins under test routes, so the harness can open it by a fixed path. */
export const WALK_MEETING_ID = "walk-board";
