/**
 * Dates suggested for an Indian private company (spec §3.4.8, research-founder-hq §4.2 and
 * §4.3), each a rule kept as data with the day it was last checked. They are suggestions:
 * nothing is added until he presses "Add it", nothing alarms for a date he did not add,
 * and every row says to check it with the CA, because five of these rules changed in the
 * last twelve months and the entity question was still open.
 *
 * `next(today, facts)` is the next due date on or after today; the AGM-based ones need the
 * day the AGM was held and answer null without it, and the renewals are dates he types
 * (null). Calendar dates are strings and are never shifted into a zone.
 */

import { addDays } from "../days";
import type { DateKind, Repeats } from "../../../src/lib/data/labels";

/** The day every rule here was last checked against its source. */
export const CHECKED_ON = "2026-11-10";

export type Facts = { agm_on: string | null };

export type Group = "monthly" | "quarterly" | "yearly" | "renewal";

export type CatalogueItem = {
  /** In a URL: letters, digits and hyphens only. */
  key: string;
  title: string;
  kind: DateKind;
  group: Group;
  /** The rule in a few words: "AGM + 60 days". */
  rule: string;
  /** "Applies when …": who it is for. */
  applies: string;
  repeats: Repeats;
  /** Worked out from the AGM date. */
  needs_agm: boolean;
  /** A date he types (a renewal): there is nothing to work out. */
  typed: boolean;
  remind_days: 0 | 2 | 7 | 14;
  next(today: string, facts: Facts): string | null;
};

const pad = (value: number): string => String(value).padStart(2, "0");

function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The first of the candidate days on or after today. */
function firstFrom(today: string, candidates: readonly string[]): string | null {
  return [...candidates].sort().find((day) => day >= today) ?? null;
}

/** One day of every month, from the month before today's to a year and a bit after. */
function everyMonth(today: string, dayOf: (year: number, month: number) => string): string[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const days: string[] = [];
  for (let offset = -1; offset <= 14; offset += 1) {
    const index = month - 1 + offset;
    const y = year + Math.floor(index / 12);
    const m = (((index % 12) + 12) % 12) + 1;
    days.push(dayOf(y, m));
  }
  return days;
}

const monthDay = (day: number) => (year: number, month: number) =>
  `${year}-${pad(month)}-${pad(Math.min(day, daysIn(year, month)))}`;

/** Fixed days of the year ("07-31", "10-31"), in this year, the last and the next two. */
function everyYear(today: string, monthDays: readonly string[]): string[] {
  const year = Number(today.slice(0, 4));
  const days: string[] = [];
  for (const y of [year - 1, year, year + 1, year + 2])
    for (const md of monthDays) days.push(`${y}-${md}`);
  return days;
}

const fixed =
  (...monthDays: string[]) =>
  (today: string): string | null =>
    firstFrom(today, everyYear(today, monthDays));

const afterAgm =
  (days: number) =>
  (_today: string, facts: Facts): string | null =>
    facts.agm_on ? addDays(facts.agm_on, days) : null;

const typed = (): string | null => null;

export const CATALOGUE: readonly CatalogueItem[] = [
  // ---------------------------------------------------------------- monthly
  {
    key: "tds-deposit",
    title: "TDS deposit",
    kind: "tax",
    group: "monthly",
    rule: "7th of the next month; 30 Apr for March",
    applies: "The company holds a TAN and deducted tax last month",
    repeats: "monthly",
    needs_agm: false,
    typed: false,
    remind_days: 7,
    next: (today) =>
      firstFrom(
        today,
        everyMonth(today, (year, month) =>
          month === 4 ? `${year}-04-30` : `${year}-${pad(month)}-07`,
        ),
      ),
  },
  {
    key: "gstr-1",
    title: "GSTR-1 (monthly filers)",
    kind: "filing",
    group: "monthly",
    rule: "11th of the next month",
    applies: "GST registered, filing every month",
    repeats: "monthly",
    needs_agm: false,
    typed: false,
    remind_days: 7,
    next: (today) => firstFrom(today, everyMonth(today, monthDay(11))),
  },
  {
    key: "gstr-3b",
    title: "GSTR-3B (monthly filers)",
    kind: "filing",
    group: "monthly",
    rule: "20th of the next month",
    applies: "GST registered, filing every month",
    repeats: "monthly",
    needs_agm: false,
    typed: false,
    remind_days: 7,
    next: (today) => firstFrom(today, everyMonth(today, monthDay(20))),
  },
  // ---------------------------------------------------------------- quarterly
  {
    key: "tds-returns",
    title: "TDS returns (Forms 138, 140 and 144)",
    kind: "filing",
    group: "quarterly",
    rule: "31 Jul, 31 Oct, 31 Jan and 31 May",
    applies:
      "The company deducted tax in the quarter; the new form numbers apply from the April–June 2026 quarter",
    repeats: "quarterly",
    needs_agm: false,
    typed: false,
    remind_days: 14,
    next: fixed("01-31", "05-31", "07-31", "10-31"),
  },
  {
    key: "advance-tax",
    title: "Advance tax instalment",
    kind: "tax",
    group: "quarterly",
    rule: "15 Jun, 15 Sep, 15 Dec and 15 Mar",
    applies:
      "The year's tax is ₹10,000 or more; a loss-making startup usually owes none, so ask the CA",
    repeats: "quarterly",
    needs_agm: false,
    typed: false,
    remind_days: 14,
    next: fixed("03-15", "06-15", "09-15", "12-15"),
  },
  {
    key: "gstr-3b-quarterly",
    title: "GSTR-3B (quarterly filers, the 24th group)",
    kind: "filing",
    group: "quarterly",
    rule: "24th of the month after the quarter",
    applies:
      "GST quarterly filers (QRMP) registered in J&K, Ladakh, Delhi or the north and east; the south and west file by the 22nd",
    repeats: "quarterly",
    needs_agm: false,
    typed: false,
    remind_days: 7,
    next: fixed("01-24", "04-24", "07-24", "10-24"),
  },
  // ---------------------------------------------------------------- yearly
  {
    key: "agm",
    title: "Annual general meeting",
    kind: "board",
    group: "yearly",
    rule: "By 30 Sep; at most 15 months after the last one",
    applies: "Every private company that is not a one-person company",
    repeats: "yearly",
    needs_agm: false,
    typed: false,
    remind_days: 14,
    next: fixed("09-30"),
  },
  {
    key: "adt-1",
    title: "ADT-1 (auditor appointment)",
    kind: "filing",
    group: "yearly",
    rule: "AGM + 15 days",
    applies: "An auditor was appointed or reappointed at the AGM",
    repeats: "yearly",
    needs_agm: true,
    typed: false,
    remind_days: 7,
    next: afterAgm(15),
  },
  {
    key: "aoc-4",
    title: "AOC-4 (financial statements)",
    kind: "filing",
    group: "yearly",
    rule: "AGM + 30 days",
    applies: "Every company",
    repeats: "yearly",
    needs_agm: true,
    typed: false,
    remind_days: 14,
    next: afterAgm(30),
  },
  {
    key: "mgt-7a",
    title: "MGT-7A or MGT-7 (annual return)",
    kind: "filing",
    group: "yearly",
    rule: "AGM + 60 days",
    applies: "Every company: MGT-7A for a small company or a one-person company, MGT-7 otherwise",
    repeats: "yearly",
    needs_agm: true,
    typed: false,
    remind_days: 14,
    next: afterAgm(60),
  },
  {
    key: "company-itr",
    title: "Company income-tax return",
    kind: "filing",
    group: "yearly",
    rule: "31 Oct; this year 21 Nov 2026",
    applies: "Every company, even in a year with no income; file on time to keep a loss",
    repeats: "yearly",
    needs_agm: false,
    typed: false,
    remind_days: 14,
    next: (today) => {
      const year = Number(today.slice(0, 4));
      const days = [year - 1, year, year + 1, year + 2].map((y) =>
        y === 2026 ? "2026-11-21" : `${y}-10-31`,
      );
      return firstFrom(today, days);
    },
  },
  {
    key: "gstr-9",
    title: "GSTR-9 (annual GST return)",
    kind: "filing",
    group: "yearly",
    rule: "31 Dec",
    applies: "GST registered; optional below the turnover limit",
    repeats: "yearly",
    needs_agm: false,
    typed: false,
    remind_days: 14,
    next: fixed("12-31"),
  },
  {
    key: "dpt-3",
    title: "DPT-3 (deposits and loans)",
    kind: "filing",
    group: "yearly",
    rule: "30 Jun, as on 31 Mar",
    applies: "The company took deposits or loans, such as loans from directors",
    repeats: "yearly",
    needs_agm: false,
    typed: false,
    remind_days: 14,
    next: fixed("06-30"),
  },
  {
    key: "msme-1-april",
    title: "MSME-1 (October to March)",
    kind: "filing",
    group: "yearly",
    rule: "30 Apr",
    applies: "MSME suppliers were left unpaid for more than 45 days",
    repeats: "yearly",
    needs_agm: false,
    typed: false,
    remind_days: 7,
    next: fixed("04-30"),
  },
  {
    key: "msme-1-october",
    title: "MSME-1 (April to September)",
    kind: "filing",
    group: "yearly",
    rule: "31 Oct",
    applies: "MSME suppliers were left unpaid for more than 45 days",
    repeats: "yearly",
    needs_agm: false,
    typed: false,
    remind_days: 7,
    next: fixed("10-31"),
  },
  {
    key: "dir-3-kyc",
    title: "DIR-3 KYC, each director",
    kind: "filing",
    group: "yearly",
    rule: "30 Jun, once every three years",
    applies:
      "Each director; next due 30 Jun 2028 for those who completed it, and within 30 days of any change in their details",
    repeats: "never",
    needs_agm: false,
    typed: false,
    remind_days: 14,
    next: (today) => {
      const year = Math.max(2028, Number(today.slice(0, 4)));
      for (let y = year; y <= year + 3; y += 1)
        if ((y - 2028) % 3 === 0 && `${y}-06-30` >= today) return `${y}-06-30`;
      return null;
    },
  },
  {
    key: "board-first-half",
    title: "Board meeting, January to June",
    kind: "board",
    group: "yearly",
    rule: "One by 30 Jun, at least 90 days after the last",
    applies:
      "A small company or a DPIIT-recognised startup; other companies hold four a year, at most 120 days apart",
    repeats: "yearly",
    needs_agm: false,
    typed: false,
    remind_days: 14,
    next: fixed("06-30"),
  },
  {
    key: "board-second-half",
    title: "Board meeting, July to December",
    kind: "board",
    group: "yearly",
    rule: "One by 31 Dec, at least 90 days after the last",
    applies:
      "A small company or a DPIIT-recognised startup; other companies hold four a year, at most 120 days apart",
    repeats: "yearly",
    needs_agm: false,
    typed: false,
    remind_days: 14,
    next: fixed("12-31"),
  },
  {
    key: "lut",
    title: "LUT for exports (GST RFD-11)",
    kind: "filing",
    group: "yearly",
    rule: "Before 31 Mar, for the next year",
    applies: "The company bills customers abroad without IGST",
    repeats: "yearly",
    needs_agm: false,
    typed: false,
    remind_days: 14,
    next: fixed("03-31"),
  },
  // ---------------------------------------------------------------- renewals he types
  {
    key: "domain",
    title: "The company's domain",
    kind: "renewal",
    group: "renewal",
    rule: "The renewal date at the registrar",
    applies: "The main domain and any domain mail is sent from",
    repeats: "yearly",
    needs_agm: false,
    typed: true,
    remind_days: 14,
    next: typed,
  },
  {
    key: "mailbox",
    title: "The founders@ mailbox",
    kind: "renewal",
    group: "renewal",
    rule: "The renewal date on the mailbox's plan",
    applies: "The mailbox replies arrive in",
    repeats: "yearly",
    needs_agm: false,
    typed: true,
    remind_days: 14,
    next: typed,
  },
  {
    key: "mail-plan",
    title: "The mail provider's plan",
    kind: "renewal",
    group: "renewal",
    rule: "The renewal date on the provider's account page",
    applies: "The plan Mail merge sends through",
    repeats: "yearly",
    needs_agm: false,
    typed: true,
    remind_days: 14,
    next: typed,
  },
  {
    key: "developer-programme",
    title: "Mac developer programme membership",
    kind: "renewal",
    group: "renewal",
    rule: "A year from joining",
    applies: "Signing and notarising the Mac app depend on it",
    repeats: "yearly",
    needs_agm: false,
    typed: true,
    remind_days: 14,
    next: typed,
  },
  {
    key: "code-signing",
    title: "Code-signing certificate",
    kind: "renewal",
    group: "renewal",
    rule: "The expiry date on the certificate",
    applies: "A certificate bought by hand; the website's own renews itself",
    repeats: "yearly",
    needs_agm: false,
    typed: true,
    remind_days: 14,
    next: typed,
  },
  {
    key: "director-dsc",
    title: "Director's DSC (Class 3)",
    kind: "renewal",
    group: "renewal",
    rule: "The expiry date on the DSC, usually one or two years",
    applies: "Every MCA form needs a director's DSC; add one date per director",
    repeats: "never",
    needs_agm: false,
    typed: true,
    remind_days: 14,
    next: typed,
  },
  {
    key: "trademark",
    title: "Trademark registration",
    kind: "renewal",
    group: "renewal",
    rule: "Ten years from registration",
    applies: "Each registered mark",
    repeats: "never",
    needs_agm: false,
    typed: true,
    remind_days: 14,
    next: typed,
  },
];

export function catalogueItem(key: string): CatalogueItem | null {
  return CATALOGUE.find((item) => item.key === key) ?? null;
}
