/**
 * Calendar days derived from the request's instant. UTC on purpose: due dates are
 * stored as dates without a zone, and the service compares them against its UTC
 * "today", so the page must draw the overdue line where the service does.
 */
export function isoDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function isoDayPlus(now: number, days: number): string {
  return new Date(now + days * 86_400_000).toISOString().slice(0, 10);
}
