import { formatDate } from "@/lib/format";

/** The People pages' own sentences (ws-notes/company/spec.md §8.9.2), shared with the tests. */

export const PEOPLE_ABOUT =
  "Interns, employees and contractors: their terms, mentor and brief, signed letters, evaluations, stipends and the access they hold, kept on this computer for the Owner only. It is a ledger, not payroll: the tax on every stipend is your CA's call.";

export const NO_PEOPLE =
  "No one in the ledger yet. Add each intern, employee or contractor before their first day, with their signed letter.";

/** "1 Dec 2026 – 28 Feb 2027", or "From 1 Dec 2026" for an open-ended one. */
export function datesWords(startsOn: string, endsOn: string | null): string {
  return endsOn
    ? `${formatDate(startsOn)} – ${formatDate(endsOn)}`
    : `From ${formatDate(startsOn)}`;
}
