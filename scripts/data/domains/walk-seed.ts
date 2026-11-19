/**
 * What the walk's handshakes read (ws-notes/duties/spec.md §6.6): the scripted prober's
 * answers for invented `.example` names, which never resolve. `www.walk.example` was issued
 * on 14 Aug 2026 and is good until 2 Mar 2027, 200 days: "At the 200-day limit.";
 * `down.walk.example` cannot be reached.
 */

import type { Probe } from "./types";

export const WALK_PROBES: Record<string, Omit<Probe, "checked_at">> = {
  "www.walk.example": {
    ok: true,
    not_before: "2026-08-14T06:00:00.000Z",
    not_after: "2027-03-02T06:00:00.000Z",
    issuer: "Walk Test Authority",
    subject: "www.walk.example",
    verified: true,
    error: "",
  },
  "down.walk.example": {
    ok: false,
    not_before: null,
    not_after: null,
    issuer: "",
    subject: "",
    verified: false,
    error: "Could not connect",
  },
};
