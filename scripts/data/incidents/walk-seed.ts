/**
 * The walk's incident (ws-notes/duties/spec.md §6.6): the next incident logged after the seed
 * takes the id `walk-incident`, so the harness can open its page without asking the service;
 * the module's clock is pinned at 23:00 IST on 13 Nov 2026, so the walk's "Walk phishing
 * message", noticed at 21:40 that evening, reads "4 hours 40 minutes left" on every pass.
 */

export const WALK_INCIDENT_ID = "walk-incident";

/** 23:00 IST, 13 Nov 2026. */
export const WALK_NOW = "2026-11-13T17:30:00.000Z";
