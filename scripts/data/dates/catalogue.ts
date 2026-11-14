/**
 * Dates suggested for an Indian private company (spec §3.4.8, research-founder-hq §4.2 and
 * §4.3; company spec §6.5), each a rule kept as data with its sources and the day it was
 * last checked. They are suggestions: nothing is added until he presses "Add it", nothing
 * alarms for a date he did not add, and every row says to check it with the CA or CS.
 *
 * `next(today, facts)` is the next due date on or after today. The items behind a clock
 * in the rule book (`rule_key`) learn the company record's facts: the AGM becomes the
 * first AGM until one is held, the AGM-based filings count from the last AGM, the board
 * rows learn the last board meeting, INC-20A counts from incorporation. With no facts
 * every item answers as it always did. `hidden(facts)` gives the reason a row is not
 * shown for this company, or null. Calendar dates are strings, never shifted into a zone.
 */

import {
  addMonths,
  fyEndOf,
  ruleOf,
  type ConfirmWith,
  type Flag,
  type RuleKey,
} from "../company-contracts";
import { addDays } from "../days";
import type { DateKind, Repeats } from "../../../src/lib/data/labels";
import { dayWords } from "../../../src/lib/data/labels-company";

/** The day every calendar rule here was last checked against its source. */
export const CHECKED_ON = "2026-11-10";

export type Facts = {
  /** The last AGM held: from Meetings when it has one, else the day typed on Key dates. */
  agm_on: string | null;
  incorporated_on?: string | null;
  first_fy_end?: string | null;
  small?: Flag;
  startup?: Flag;
  gst_registered?: Flag;
  exports?: Flag;
  last_board_on?: string | null;
  /** His amounts from the rule book. */
  amounts?: Partial<Record<RuleKey, number>>;
  /** Any director in office is recorded on the company record. */
  directors?: number;
};

export type Group = "monthly" | "quarterly" | "yearly" | "renewal";

export type Source = { name: string; url: string };

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
  /** The clock in the rule book this row follows, or null for a calendar date or a renewal. */
  rule_key: RuleKey | null;
  sources: readonly Source[];
  verified_on: string;
  /** Null for a renewal: a day he types, nobody to confirm it with. */
  confirm_with: ConfirmWith | null;
  /** What the sources disagree on, or "". */
  note: string;
  next(today: string, facts: Facts): string | null;
  /** Why the row is not shown for this company, or null. */
  hidden(facts: Facts): string | null;
};

/** How one row reads today, with the facts: what the suggestion list shows. */
export type Worked = {
  title: string;
  rule: string;
  rule_key: RuleKey | null;
  next: string | null;
  /** "Not before 31 Jan 2027": the earliest day, when the rule sets one inside the period. */
  earliest: string | null;
  /** Where its day came from, in words, or null when it is not worked out from a fact. */
  from_fact: string | null;
  /** What is missing to work it out, or null. */
  needs: string | null;
  /** The day the rule counts from, when its date is that day plus the rule's amount. */
  base_on: string | null;
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

/** His amount for a rule, or the rule's own. */
export function amountIn(facts: Facts, key: RuleKey): number {
  return facts.amounts?.[key] ?? ruleOf(key).amount ?? 0;
}

const afterAgm =
  (key: RuleKey) =>
  (_today: string, facts: Facts): string | null =>
    facts.agm_on ? addDays(facts.agm_on, amountIn(facts, key)) : null;

const typed = (): string | null => null;
const shown = (): string | null => null;

const otherCompany = (facts: Facts): boolean => facts.small === "no" && facts.startup === "no";

/** The next AGM after the last one held on L: 6 months after L's financial year, or 15 months after L, whichever is earlier. */
export function nextAgm(last: string, facts: Facts): string {
  const byYear = addMonths(fyEndOf(last), amountIn(facts, "agm"));
  const byGap = addMonths(last, amountIn(facts, "agm-gap"));
  return byYear < byGap ? byYear : byGap;
}

/** The first AGM: 9 months (his amount) after the end of the first financial year. */
export function firstAgm(firstFyEnd: string, facts: Facts): string {
  return addMonths(firstFyEnd, amountIn(facts, "first-agm"));
}

/** A half of the calendar year: its first and last day, for the year given. */
function half(which: "first" | "second", year: number): { from: string; to: string } {
  return which === "first"
    ? { from: `${year}-01-01`, to: `${year}-06-30` }
    : { from: `${year}-07-01`, to: `${year}-12-31` };
}

/**
 * The half-year board row (company spec §5.2): the end of its half on or after today; a
 * board meeting already held in that half moves it to the same half next year.
 */
export function boardHalf(which: "first" | "second", today: string, facts: Facts): string {
  const year = Number(today.slice(0, 4));
  let span = half(which, year);
  if (span.to < today) span = half(which, year + 1);
  const last = facts.last_board_on ?? null;
  if (last && last >= span.from && last <= span.to)
    span = half(which, Number(span.to.slice(0, 4)) + 1);
  return span.to;
}

/** "Not before {last + 90}" when that day falls inside the half the row is due in. */
export function boardEarliest(
  which: "first" | "second",
  today: string,
  facts: Facts,
): string | null {
  const last = facts.last_board_on ?? null;
  if (!last) return null;
  const due = boardHalf(which, today, facts);
  const span = half(which, Number(due.slice(0, 4)));
  const earliest = addDays(last, amountIn(facts, "board-gap-small"));
  return earliest >= span.from && earliest <= span.to ? earliest : null;
}

const GST: readonly Source[] = [
  {
    name: "Treelife: GST for startups",
    url: "https://treelife.in/compliance/gst-compliance-for-startups/",
  },
];
const ROC: readonly Source[] = [
  {
    name: "LegalWiz: ROC calendar FY 2026-27",
    url: "https://www.legalwiz.in/blog/roc-compliance-calendar-for-fy-2026-2027",
  },
];
const TDS: readonly Source[] = [
  {
    name: "India Briefing: tax deadlines",
    url: "https://www.india-briefing.com/news/india-tax-compliance-deadlines-april-may-2026-43913.html",
  },
];

const fromRule = (key: RuleKey) => {
  const rule = ruleOf(key);
  return {
    rule_key: key,
    sources: rule.sources,
    verified_on: rule.verified_on,
    confirm_with: rule.confirm_with,
    note: rule.note,
  };
};

const calendar = (sources: readonly Source[], confirm: ConfirmWith, note = "") => ({
  rule_key: null,
  sources,
  verified_on: CHECKED_ON,
  confirm_with: confirm,
  note,
});

const renewal = {
  rule_key: null,
  sources: [],
  verified_on: CHECKED_ON,
  confirm_with: null,
  note: "",
};

const noGst = (facts: Facts): string | null =>
  facts.gst_registered === "no" ? "Registered for GST is No." : null;

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
    ...calendar(TDS, "CA"),
    next: (today) =>
      firstFrom(
        today,
        everyMonth(today, (year, month) =>
          month === 4 ? `${year}-04-30` : `${year}-${pad(month)}-07`,
        ),
      ),
    hidden: shown,
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
    ...calendar(GST, "CA"),
    next: (today) => firstFrom(today, everyMonth(today, monthDay(11))),
    hidden: noGst,
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
    ...calendar(GST, "CA"),
    next: (today) => firstFrom(today, everyMonth(today, monthDay(20))),
    hidden: noGst,
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
    ...calendar(
      [
        {
          name: "Zoho Books Academy: TDS and TCS",
          url: "https://www.zoho.com/books/academy/in/taxes-and-compliance/income-tax-act-tds-tcs-updates-india.html",
        },
      ],
      "CA",
      "Sources differ on the 30th or the 31st.",
    ),
    next: fixed("01-31", "05-31", "07-31", "10-31"),
    hidden: shown,
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
    ...calendar(
      [
        {
          name: "TaxGuru: Income-tax Act 2025",
          url: "https://taxguru.in/income-tax/income-tax-act-2025-complete-guide-common-taxpayers.html",
        },
      ],
      "CA",
    ),
    next: fixed("03-15", "06-15", "09-15", "12-15"),
    hidden: shown,
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
    ...calendar(GST, "CA"),
    next: fixed("01-24", "04-24", "07-24", "10-24"),
    hidden: noGst,
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
    ...fromRule("agm"),
    next: (today, facts) => {
      if (facts.agm_on) return nextAgm(facts.agm_on, facts);
      if (facts.first_fy_end) return firstAgm(facts.first_fy_end, facts);
      return fixed("09-30")(today);
    },
    hidden: shown,
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
    ...fromRule("adt-1"),
    next: afterAgm("adt-1"),
    hidden: shown,
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
    ...fromRule("aoc-4"),
    next: afterAgm("aoc-4"),
    hidden: shown,
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
    ...fromRule("mgt-7a"),
    next: afterAgm("mgt-7a"),
    hidden: shown,
  },
  {
    key: "inc-20a",
    title: ruleOf("inc-20a").title,
    kind: "filing",
    group: "yearly",
    rule: "Incorporation + 180 days",
    applies: "A company with share capital incorporated on or after 2 Nov 2018",
    repeats: "never",
    needs_agm: false,
    typed: false,
    remind_days: 14,
    ...fromRule("inc-20a"),
    next: (_today, facts) =>
      facts.incorporated_on ? addDays(facts.incorporated_on, amountIn(facts, "inc-20a")) : null,
    hidden: (facts) =>
      facts.incorporated_on && facts.incorporated_on < "2018-11-02"
        ? "Incorporated before 2 Nov 2018, so it does not apply."
        : null,
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
    ...calendar(
      [
        {
          name: "RegisterKaro: private company compliance",
          url: "https://www.registerkaro.in/post/pvt-ltd-compliance",
        },
      ],
      "CA",
      "The 21 Nov 2026 date for this year could not be confirmed: the research gives 31 Oct, or 30 Nov where transfer pricing applies. Ask your CA.",
    ),
    next: (today) => {
      const year = Number(today.slice(0, 4));
      const days = [year - 1, year, year + 1, year + 2].map((y) =>
        y === 2026 ? "2026-11-21" : `${y}-10-31`,
      );
      return firstFrom(today, days);
    },
    hidden: shown,
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
    ...calendar(GST, "CA"),
    next: fixed("12-31"),
    hidden: noGst,
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
    ...calendar(ROC, "CS"),
    next: fixed("06-30"),
    hidden: shown,
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
    ...calendar(ROC, "CS"),
    next: fixed("04-30"),
    hidden: shown,
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
    ...calendar(ROC, "CS"),
    next: fixed("10-31"),
    hidden: shown,
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
    ...fromRule("dir-3-kyc"),
    next: (today) => {
      const year = Math.max(2028, Number(today.slice(0, 4)));
      for (let y = year; y <= year + 3; y += 1)
        if ((y - 2028) % 3 === 0 && `${y}-06-30` >= today) return `${y}-06-30`;
      return null;
    },
    hidden: (facts) =>
      (facts.directors ?? 0) > 0 ? "Each director has their own row below." : null,
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
    ...fromRule("board-gap-small"),
    next: (today, facts) => boardHalf("first", today, facts),
    hidden: (facts) => (otherCompany(facts) ? "Four board meetings a year apply instead." : null),
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
    ...fromRule("board-gap-small"),
    next: (today, facts) => boardHalf("second", today, facts),
    hidden: (facts) => (otherCompany(facts) ? "Four board meetings a year apply instead." : null),
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
    ...calendar(GST, "CA"),
    next: fixed("03-31"),
    hidden: (facts) => (facts.exports === "no" ? "Exports services is No." : null),
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
    ...renewal,
    next: typed,
    hidden: shown,
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
    ...renewal,
    next: typed,
    hidden: shown,
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
    ...renewal,
    next: typed,
    hidden: shown,
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
    ...renewal,
    next: typed,
    hidden: shown,
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
    ...renewal,
    next: typed,
    hidden: shown,
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
    ...renewal,
    next: typed,
    hidden: (facts) =>
      (facts.directors ?? 0) > 0 ? "Each director has their own row below." : null,
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
    ...renewal,
    next: typed,
    hidden: shown,
  },
];

/**
 * Rows listed only when the facts call for them, so they are not in `CATALOGUE` (whose
 * length the first tests count against a company with no facts): four board meetings a
 * year, for a company that is neither small nor a DPIIT-recognised startup.
 */
export const FACT_ONLY: readonly CatalogueItem[] = [
  {
    key: "board-gap-120",
    title: "Board meeting, four a year",
    kind: "board",
    group: "quarterly",
    rule: "At most 120 days after the last",
    applies: "A company that is neither a small company nor a DPIIT-recognised startup",
    repeats: "quarterly",
    needs_agm: false,
    typed: false,
    remind_days: 14,
    ...fromRule("board-gap-other"),
    next: (_today, facts) =>
      facts.last_board_on ? addDays(facts.last_board_on, amountIn(facts, "board-gap-other")) : null,
    hidden: (facts) =>
      otherCompany(facts)
        ? null
        : "Only when Small company and DPIIT-recognised startup are both No.",
  },
];

/** Every row, the fact-only ones last. */
export const ALL_ITEMS: readonly CatalogueItem[] = [...CATALOGUE, ...FACT_ONLY];

export function catalogueItem(key: string): CatalogueItem | null {
  return ALL_ITEMS.find((item) => item.key === key) ?? null;
}

const agmWords = (facts: Facts): string => `From the AGM held ${dayWords(facts.agm_on)}`;

/** The rule in words with his amount, as the suggestion row shows it. */
function ruleWords(item: CatalogueItem, facts: Facts): string {
  if (item.needs_agm && item.rule_key) return `AGM + ${amountIn(facts, item.rule_key)} days`;
  if (item.key === "inc-20a") return `Incorporation + ${amountIn(facts, "inc-20a")} days`;
  if (item.key === "board-gap-120")
    return `At most ${amountIn(facts, "board-gap-other")} days after the last`;
  if (item.key === "board-first-half" || item.key === "board-second-half")
    return item.rule.replace("90", String(amountIn(facts, "board-gap-small")));
  return item.rule;
}

/** How a catalogue row reads today, with the company's facts. */
export function workOut(item: CatalogueItem, today: string, facts: Facts): Worked {
  const base: Worked = {
    title: item.title,
    rule: ruleWords(item, facts),
    rule_key: item.rule_key,
    next: item.next(today, facts),
    earliest: null,
    from_fact: null,
    needs: null,
    base_on: null,
  };
  switch (item.key) {
    case "agm":
      if (facts.agm_on) return { ...base, from_fact: agmWords(facts) };
      if (facts.first_fy_end)
        return {
          ...base,
          rule: `First AGM: ${amountIn(facts, "first-agm")} months after the first financial year ends`,
          rule_key: "first-agm",
          from_fact: `From the first financial year ending ${dayWords(facts.first_fy_end)}`,
          base_on: facts.first_fy_end,
        };
      return base;
    case "adt-1":
    case "aoc-4":
    case "mgt-7a": {
      const title =
        item.key !== "mgt-7a"
          ? item.title
          : facts.small === "yes"
            ? "MGT-7A (annual return)"
            : facts.small === "no"
              ? "MGT-7 (annual return)"
              : item.title;
      return facts.agm_on
        ? { ...base, title, from_fact: agmWords(facts), base_on: facts.agm_on }
        : { ...base, title };
    }
    case "inc-20a":
      return facts.incorporated_on
        ? {
            ...base,
            from_fact: `From the incorporation day, ${dayWords(facts.incorporated_on)}`,
            base_on: facts.incorporated_on,
          }
        : { ...base, needs: "Needs the incorporation day on Company." };
    case "board-first-half":
    case "board-second-half": {
      const which = item.key === "board-first-half" ? "first" : "second";
      return facts.last_board_on
        ? {
            ...base,
            earliest: boardEarliest(which, today, facts),
            from_fact: `From the last board meeting, ${dayWords(facts.last_board_on)}`,
          }
        : base;
    }
    case "board-gap-120":
      return facts.last_board_on
        ? {
            ...base,
            from_fact: `From the last board meeting, ${dayWords(facts.last_board_on)}`,
            base_on: facts.last_board_on,
          }
        : { ...base, needs: "Record your last board meeting in Meetings to work this out." };
    default:
      return base;
  }
}
