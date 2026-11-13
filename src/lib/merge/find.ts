/**
 * Finding a mailing or a list on the Mail merge page. Every word typed must appear
 * somewhere in it. A number matches a number written in it, so "8" finds "Waitlist 08"
 * but not "Waitlist 18", and a mailing whose name starts with that number comes first.
 */

export type MailingShow = "all" | "drafts" | "going" | "done";

export const MAILING_SHOWS: ReadonlyArray<{ key: MailingShow; label: string }> = [
  { key: "all", label: "All" },
  { key: "drafts", label: "Drafts" },
  { key: "going", label: "Going out" },
  { key: "done", label: "Sent or ended" },
];

/** The words of a search, lower-cased; at most twelve are used. */
export function findTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 12);
}

const isNumber = (term: string) => /^\d+$/.test(term);
const asNumber = (digits: string) => String(Number.parseInt(digits, 10));

function numbersIn(text: string): Set<string> {
  return new Set(Array.from(text.matchAll(/\d+/g), (match) => asNumber(match[0])));
}

/** Whether every word appears in one of the texts; a number must match a whole number. */
export function matchesTerms(texts: ReadonlyArray<string>, terms: ReadonlyArray<string>): boolean {
  if (terms.length === 0) return true;
  const haystack = texts.join("\n").toLowerCase();
  const numbers = terms.some(isNumber) ? numbersIn(haystack) : new Set<string>();
  return terms.every((term) =>
    isNumber(term) ? numbers.has(asNumber(term)) : haystack.includes(term),
  );
}

/** Whether a mailing in this state is shown under this choice. */
export function showsMailing(state: string, show: MailingShow): boolean {
  if (show === "drafts") return state === "draft";
  if (show === "going") return state === "sending" || state === "paused";
  if (show === "done") return state === "finished" || state === "cancelled";
  return true;
}

export function parseShow(value: string | undefined): MailingShow {
  return MAILING_SHOWS.some((show) => show.key === value) ? (value as MailingShow) : "all";
}

/** Items whose name starts with a searched number first; otherwise the order is kept. */
export function rankByNumber<T>(
  items: ReadonlyArray<T>,
  terms: ReadonlyArray<string>,
  nameOf: (item: T) => string,
): T[] {
  const wanted = new Set(terms.filter(isNumber).map(asNumber));
  if (wanted.size === 0) return [...items];
  const leads = (item: T) => {
    const first = nameOf(item).match(/\d+/);
    return first !== null && wanted.has(asNumber(first[0]));
  };
  return [...items.filter(leads), ...items.filter((item) => !leads(item))];
}
