import { dayWords } from "@/lib/data/labels-registers";

/** Where a signed copy goes in Files, as the forms' hint says it. */
export const COPY_FOLDERS =
  "05 Founders, team and ESOP for founder and team papers, 10 Fundraising and investors for investment papers, and 06 Contracts and NDAs for the rest";

/** "Ends 14 Nov 2027", "Renews 1 Mar 2027" or "Open-ended". */
export function endsWords(row: { renews_on: string | null; ends_on: string | null }): string {
  if (row.renews_on) return `Renews ${dayWords(row.renews_on)}`;
  if (row.ends_on) return `Ends ${dayWords(row.ends_on)}`;
  return "Open-ended";
}
