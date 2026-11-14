/**
 * Touches by hand (ws-notes/company/spec.md §8.3): a connection request, a message, a call or
 * a meeting outside email, logged on a lead or an investor firm. Nothing here is automated
 * and nothing is sent; the network is never named.
 */

import type { Staff } from "../protocol";

export type TouchKind =
  "request" | "accepted" | "message" | "replied" | "comment" | "call" | "met" | "other";

export type TouchSubject = { kind: "lead" | "investor"; id: string; name: string };

export type Touch = {
  touch_id: string;
  subject: TouchSubject;
  on: string;
  kind: TouchKind;
  note: string;
  at: string;
  by: Staff;
  withdrawn: { at: string; by: Staff } | null;
};

/** A week, Monday to Sunday, and what was logged in it (withdrawn touches left out). */
export type TouchWeek = {
  week_from: string;
  requests: number;
  accepted: number;
  messages: number;
  other: number;
};
