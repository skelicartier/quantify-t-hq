/**
 * The seams of the duties batch (ws-notes/duties/spec.md §3): the services one Data module
 * offers another, by name and type; the rules every unit works days and comparisons out with,
 * each with its sources and, where the sources disagree, each reading; the stand-ins for
 * copies without the module that provides a service; and the pure helpers more than one unit
 * uses. Every copy holds this file byte for byte. Nothing here touches a file, a socket or
 * the clock. A tracker's reading of secondary sources, not legal, tax or accounting advice.
 */

import { addMonths, fyStartYear, type UsedFor } from "./company-contracts";
import { addDays } from "./days";
import type { Staff } from "./protocol";

// ------------------------------------------------------------------ names

/** The services this batch adds, by the name each is provided under. */
export const DUTIES_SERVICES = {
  /** U2, in the dates module: his amount and confirmation for each duty rule. */
  dutyRules: "duty-rules",
  /** U2: the holiday set and working-day arithmetic. */
  holidays: "holidays",
  /** U2, in the people module: payments and what is owed. For Owner-only answers. */
  peoplePay: "people-pay",
  /** U1: each answers `usedFor` and `count`. */
  incidents: "incidents",
  marks: "marks",
  domains: "domains",
  /** U3: categories, bills, export invoices, the file hold. */
  money: "money",
  /** U4, in the statements module: cash and burn per currency. */
  statements: "statements",
  /** U4, in the close module: which months are locked. */
  monthLock: "month-lock",
  /** U4: `usedFor` for a file the close holds. */
  close: "close",
} as const;

/** What a file's page asks besides the company batch's sources. Never statements or people. */
export const DUTIES_USED_FOR = ["incidents", "marks", "domains", "money", "close"] as const;

/** Files asks each of these before deleting a file forever. */
export const HOLD_SOURCES = ["money", "close"] as const;
export type FileHold = {
  /** The last day it must be kept. */
  until: string;
  /** "A bill from Walk Legal LLP, 12 Nov 2026". */
  why: string;
};
export type HoldsFiles = { heldUntil(fileId: string): FileHold | null };

/** The Due kinds this batch adds; core's `DueKind`, the overview's schema and `DUE_KINDS` carry them. */
export const DUTIES_DUE_KINDS = ["incident", "mark", "domain", "bill", "export", "close"] as const;
export type DutiesDueKind = (typeof DUTIES_DUE_KINDS)[number];

// ------------------------------------------------------------------ the duty rules

export type DutyRuleKey =
  | "cert-in-report"
  | "cert-in-contact"
  | "cert-in-logs"
  | "cert-in-time"
  | "dpdp-board-report"
  | "security-txt-expires"
  | "tm-deficiency"
  | "tm-exam-reply"
  | "tm-opposition"
  | "tm-counter-statement"
  | "tm-term"
  | "tm-renewal-opens"
  | "tm-surcharge"
  | "tm-restoration"
  | "tm-fee-startup"
  | "tls-life-2026"
  | "tls-life-2027"
  | "tls-life-2029"
  | "signing-life"
  | "holidays-national"
  | "holidays-state"
  | "tds-contractor-single"
  | "tds-contractor-year"
  | "tds-technical-year"
  | "tds-professional-year"
  | "tds-rent-month"
  | "tds-rate-contractor-person"
  | "tds-rate-contractor-other"
  | "tds-rate-technical"
  | "tds-rate-professional"
  | "tds-rate-director"
  | "tds-rate-rent-plant"
  | "tds-rate-rent-building"
  | "tds-deposit"
  | "msme-no-agreement"
  | "msme-agreement"
  | "foreign-forms"
  | "foreign-reverse-charge"
  | "export-realisation"
  | "export-edf"
  | "voucher-retention"
  | "close-by"
  | "gst-registration"
  | "pf-headcount"
  | "esi-headcount"
  | "caro-capital";

export type DutyArea =
  | "security"
  | "marks"
  | "certificates"
  | "holidays"
  | "tds"
  | "msme"
  | "foreign"
  | "export"
  | "books"
  | "thresholds";

export type DutyUnit =
  "hours" | "days" | "working_days" | "months" | "years" | "rupees" | "per_cent" | "people";

/** Who confirms it. "agent" is the trademark agent, "bank" the AD bank. */
export type DutyConfirmWith = "CA" | "CS" | "lawyer" | "agent" | "bank";

export type DutySource = { name: string; url: string };

/** One of the amounts, or one of the answers in words, that the sources give for a rule. */
export type DutyReading = {
  /** "15 months", "Forms 145 and 146". */
  label: string;
  /** Null for an answer in words. */
  amount: number | null;
  /** Which sources say so, and anything else to know: one sentence. */
  words: string;
  sources: readonly DutySource[];
};

export type DutyRule = {
  key: DutyRuleKey;
  area: DutyArea;
  /** The duty, as the Rules view titles it. */
  title: string;
  /** What it counts from, or is measured on: "noticing the incident". */
  from: string;
  /**
   * "within": due that long after `from`; "before": that long before `from`; "at_most" and
   * "at_least": a limit on a length; "over": it applies above that amount; "rate": a share of
   * an amount; "words": nothing to work out, the rule is its `note`.
   */
  sense: "within" | "before" | "at_most" | "at_least" | "over" | "rate" | "words";
  /** The rule's own amount; his amount replaces it. Null for "words" and for a rule with readings. */
  amount: number | null;
  unit: DutyUnit | null;
  sources: readonly DutySource[];
  /** The day the sources were last read for this rule. */
  verified_on: string;
  /** Null: an industry rule or his own practice, nobody to confirm it with. */
  confirm_with: DutyConfirmWith | null;
  /** The sources disagree: nothing is worked out from it until he confirms a reading or his own amount. */
  only_when_confirmed: boolean;
  /** Two or more when the sources disagree; the first is the one the confirm form pre-selects. */
  readings: readonly DutyReading[];
  /** Not in force before this day; null for in force. */
  starts_on: string | null;
  /** What else applies, what the sources disagree on; "" for nothing. */
  note: string;
};

const CHECKED = "2026-11-14";

const SRC = {
  certIn: {
    name: "CERT-In: Directions of 28 April 2022",
    url: "https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf",
  },
  dpdpRule7: { name: "DPDPA.com: Rule 7", url: "https://www.dpdpa.com/dpdparules/rule7.html" },
  azb: {
    name: "AZB & Partners: DPDP phased rollout",
    url: "https://www.azbpartners.com/bank/indias-digital-personal-data-protection-act-phased-rollout-and-key-compliance-milestones/",
  },
  rfc9116: { name: "RFC 9116", url: "https://www.rfc-editor.org/rfc/rfc9116.html" },
  tmRules: {
    name: "IP India: Trade Marks Rules 2017",
    url: "https://ipindia.gov.in/tm-rules-2017",
  },
  incorpx: {
    name: "incorpx: trademark registration 2026",
    url: "https://www.incorpx.io/blog/trademark-registration-online-india-2026",
  },
  incorpxFee: {
    name: "incorpx: trademark fee subsidy",
    url: "https://www.incorpx.io/blog/trademark-fee-subsidy-startups-msmes-2026",
  },
  sslStore: {
    name: "The SSL Store: certificate lifetimes",
    url: "https://thesslstore.com/blog/47-day-ssl-certificate-validity-by-2029",
  },
  appViewX: {
    name: "AppViewX: 460-day code-signing certificates",
    url: "https://www.appviewx.com/blogs/460-day-code-signing-certificate-2026/",
  },
  holidays: {
    name: "India Briefing: holiday calendar 2027",
    url: "https://www.india-briefing.com/news/india-holiday-calendar-2027-employer-compliance-47808.html/",
  },
  tdsTaxguru: {
    name: "TaxGuru: TDS rates and thresholds, tax year 2026-27",
    url: "https://taxguru.in/income-tax/income-tax-act-2025-tds-rates-thresholds-compliance-ty-2026-27.html",
  },
  tdsBriefing: {
    name: "India Briefing: section 393",
    url: "https://www.india-briefing.com/news/section-393-income-tax-act-2025-tds-rules-rates-compliance-guide-44450.html",
  },
  msme: {
    name: "TaxGuru: the 45-day MSME payment rule",
    url: "https://taxguru.in/income-tax/finance-ministry-clarifies-section-43bh-45-day-msme-payment-rule.html",
  },
  cashfree: {
    name: "Cashfree: TDS on foreign payments, Form 145",
    url: "https://www.cashfree.com/blog/tds-on-foreign-payments-rates-section-396-form-145-compliance-guide/",
  },
  cleartax: {
    name: "ClearTax: Forms 15CA and 15CB",
    url: "https://cleartax.in/s/filing-e-form-15ca-and-15cb",
  },
  oidar: {
    name: "CBIC: online services flier",
    url: "https://cbic-gst.gov.in/hindi/pdf/e-version-gst-fliers/OIDAR_online%20version_online%20version_20_July_2017.pdf",
  },
  lks: {
    name: "LKS: RBI trade regulations 2026",
    url: "https://www.lkslaw.com/insights/articles/rbi-trade-regulations-2026-key-reforms-in-payment-timelines-realisation-reporting",
  },
  taxguruFema: { name: "TaxGuru: FEMA export regulations", url: "https://taxguru.in/?p=1087667" },
  rodl: {
    name: "Rödl & Partner: India's new FEMA trade regulations",
    url: "https://www.roedl.com/en/insights/indias-new-fema-trade-regulations/",
  },
  taxscan: {
    name: "Taxscan: export proceeds, 15 months",
    url: "https://www.taxscan.in/top-stories/rbi-extends-window-for-realising-export-proceeds-to-15-months-under-fema-export-of-goods-services-regulations-2025-1438182",
  },
  s128: {
    name: "TaxGuru: section 128, books of account",
    url: "https://taxguru.in/company-law/maintenance-books-accounts-section-128-companies-act-2013.html",
  },
  treelifeMis: { name: "Treelife: monthly MIS", url: "https://treelife.in/?p=15179" },
  treelifeGst: {
    name: "Treelife: GST for startups",
    url: "https://treelife.in/compliance/gst-compliance-for-startups/",
  },
  kpmg: {
    name: "KPMG: the Labour Codes",
    url: "https://kpmg.com/in/en/blogs/2025/12/implementation-of-labour-codes-what-changes-and-road-ahead.html",
  },
  caro: {
    name: "TaxGuru: CARO 2020 applicability",
    url: "https://taxguru.in/company-law/applicability-caro-2020-ifc-reporting-internal-audit-cash-flow-ind.html",
  },
} as const;

type Base = Pick<
  DutyRule,
  "verified_on" | "only_when_confirmed" | "readings" | "starts_on" | "note"
>;
const PLAIN: Base = {
  verified_on: CHECKED,
  only_when_confirmed: false,
  readings: [],
  starts_on: null,
  note: "",
};

const TDS_NOTE =
  "Under the Income-tax Act 2025, tax year 2026-27. Whether tax is taken on the whole year once the limit is passed, and on the amount before GST, is your CA's call.";

export const DUTY_RULES: readonly DutyRule[] = [
  // ---------------------------------------------------------------- security
  {
    ...PLAIN,
    key: "cert-in-report",
    area: "security",
    title: "Report a listed incident to CERT-In",
    from: "noticing the incident, or being told of it",
    sense: "within",
    amount: 6,
    unit: "hours",
    sources: [SRC.certIn],
    confirm_with: "lawyer",
    note: "By email to incident@cert-in.org.in, by phone on 1800-11-4949 or by fax on 1800-11-6969. Twenty kinds of incident are listed in Annexure I.",
  },
  {
    ...PLAIN,
    key: "cert-in-contact",
    area: "security",
    title: "Keep a point of contact with CERT-In",
    from: "the company",
    sense: "words",
    amount: null,
    unit: null,
    sources: [SRC.certIn],
    confirm_with: "lawyer",
    note: "Name, designation, organisation, office address, email, mobile and office phone, sent to info@cert-in.org.in and kept current.",
  },
  {
    ...PLAIN,
    key: "cert-in-logs",
    area: "security",
    title: "Keep the logs of every system",
    from: "each log line",
    sense: "at_least",
    amount: 180,
    unit: "days",
    sources: [SRC.certIn],
    confirm_with: "lawyer",
    note: "A rolling 180 days, kept in India. Where each system's logs go is not recorded in Data yet.",
  },
  {
    ...PLAIN,
    key: "cert-in-time",
    area: "security",
    title: "Set clocks from the NIC or NPL time servers",
    from: "every system",
    sense: "words",
    amount: null,
    unit: null,
    sources: [SRC.certIn],
    confirm_with: "lawyer",
    note: "Or from a source traceable to them. A company in several countries may use another accurate source that does not deviate from them.",
  },
  {
    ...PLAIN,
    key: "dpdp-board-report",
    area: "security",
    title: "Detailed report of a personal data breach to the Data Protection Board",
    from: "becoming aware of the breach",
    sense: "within",
    amount: 72,
    unit: "hours",
    sources: [SRC.dpdpRule7, SRC.azb],
    confirm_with: "lawyer",
    starts_on: "2027-05-12",
    note: "The Board is also told without delay, and so is each person affected. One source counts the start as 12 May 2027; others say 13 or 14 May.",
  },
  {
    ...PLAIN,
    key: "security-txt-expires",
    area: "security",
    title: "The Expires line of security.txt",
    from: "the day it is published",
    sense: "at_most",
    amount: 12,
    unit: "months",
    sources: [SRC.rfc9116],
    confirm_with: null,
    note: "Recommended, not required: less than a year ahead. Contact and Expires are the two required lines.",
  },
  // ---------------------------------------------------------------- marks
  {
    ...PLAIN,
    key: "tm-deficiency",
    area: "marks",
    title: "Remedy a deficiency in a trademark application",
    from: "the notice of the deficiency",
    sense: "within",
    amount: 1,
    unit: "months",
    sources: [SRC.tmRules],
    confirm_with: "agent",
    note: "Rule 31.",
  },
  {
    ...PLAIN,
    key: "tm-exam-reply",
    area: "marks",
    title: "Reply to the examination report",
    from: "receiving the examination report",
    sense: "within",
    amount: 1,
    unit: "months",
    sources: [SRC.tmRules],
    confirm_with: "agent",
    note: "Rule 33(4). Without a reply the application may be treated as abandoned.",
  },
  {
    ...PLAIN,
    key: "tm-opposition",
    area: "marks",
    title: "Opposition window",
    from: "the Journal date",
    sense: "within",
    amount: 4,
    unit: "months",
    sources: [SRC.tmRules],
    confirm_with: "agent",
    note: "Rule 42(1). Anyone may oppose your mark in this window; the same window applies to you when a similar mark is advertised.",
  },
  {
    ...PLAIN,
    key: "tm-counter-statement",
    area: "marks",
    title: "Counter-statement to an opposition",
    from: "receiving the notice of opposition",
    sense: "within",
    amount: 2,
    unit: "months",
    sources: [SRC.tmRules],
    confirm_with: "agent",
    note: "Rule 44(1).",
  },
  {
    ...PLAIN,
    key: "tm-term",
    area: "marks",
    title: "Term of a registration",
    from: "the application date",
    sense: "within",
    amount: 10,
    unit: "years",
    sources: [SRC.tmRules, SRC.incorpx],
    confirm_with: "agent",
    note: "The term is in section 25 of the Act, which was not read: confirm the expiry day on the certificate.",
  },
  {
    ...PLAIN,
    key: "tm-renewal-opens",
    area: "marks",
    title: "Renewal opens",
    from: "the expiry",
    sense: "before",
    amount: 1,
    unit: "years",
    sources: [SRC.tmRules],
    confirm_with: "agent",
    note: "Rule 57(1).",
  },
  {
    ...PLAIN,
    key: "tm-surcharge",
    area: "marks",
    title: "Late renewal with a surcharge",
    from: "the expiry",
    sense: "within",
    amount: 6,
    unit: "months",
    sources: [SRC.tmRules],
    confirm_with: "agent",
    note: "Rule 59.",
  },
  {
    ...PLAIN,
    key: "tm-restoration",
    area: "marks",
    title: "Restoration of a removed mark",
    from: "the expiry",
    sense: "within",
    amount: 1,
    unit: "years",
    sources: [SRC.tmRules],
    confirm_with: "agent",
    note: "Rule 60.",
  },
  {
    ...PLAIN,
    key: "tm-fee-startup",
    area: "marks",
    title: "Filing fee for a recognised startup, per class, filed online",
    from: "each class",
    sense: "words",
    amount: null,
    unit: "rupees",
    sources: [SRC.incorpx, SRC.incorpxFee],
    confirm_with: "agent",
    only_when_confirmed: true,
    readings: [
      {
        label: "₹4,500",
        amount: 4_500,
        words:
          "Most sources: half the ordinary ₹9,000, for an individual, a startup or a small enterprise.",
        sources: [SRC.incorpx, SRC.incorpxFee],
      },
      {
        label: "₹9,000",
        amount: 9_000,
        words: "One source, not identified in the notes, lists ₹9,000 for startups too.",
        sources: [],
      },
    ],
    note: "The official fee schedule could not be read.",
  },
  // ---------------------------------------------------------------- certificates
  {
    ...PLAIN,
    key: "tls-life-2026",
    area: "certificates",
    title: "Longest life of a website certificate",
    from: "the day it is issued",
    sense: "at_most",
    amount: 200,
    unit: "days",
    sources: [SRC.sslStore],
    confirm_with: null,
    starts_on: "2026-03-15",
    note: "For certificates issued from 15 March 2026.",
  },
  {
    ...PLAIN,
    key: "tls-life-2027",
    area: "certificates",
    title: "Longest life of a website certificate, from 15 March 2027",
    from: "the day it is issued",
    sense: "at_most",
    amount: 100,
    unit: "days",
    sources: [SRC.sslStore],
    confirm_with: null,
    starts_on: "2027-03-15",
  },
  {
    ...PLAIN,
    key: "tls-life-2029",
    area: "certificates",
    title: "Longest life of a website certificate, from 15 March 2029",
    from: "the day it is issued",
    sense: "at_most",
    amount: 47,
    unit: "days",
    sources: [SRC.sslStore],
    confirm_with: null,
    starts_on: "2029-03-15",
  },
  {
    ...PLAIN,
    key: "signing-life",
    area: "certificates",
    title: "Longest life of a code-signing certificate",
    from: "the day it is issued",
    sense: "at_most",
    amount: 460,
    unit: "days",
    sources: [SRC.appViewX],
    confirm_with: null,
    starts_on: "2026-03-01",
    note: "For certificates issued from 1 March 2026.",
  },
  // ---------------------------------------------------------------- holidays
  {
    ...PLAIN,
    key: "holidays-national",
    area: "holidays",
    title: "National holidays",
    from: "every year",
    sense: "words",
    amount: null,
    unit: null,
    sources: [SRC.holidays],
    confirm_with: "CA",
    note: "26 January, 15 August and 2 October are compulsory everywhere.",
  },
  {
    ...PLAIN,
    key: "holidays-state",
    area: "holidays",
    title: "The state's minimum paid holidays",
    from: "the state the office is registered in",
    sense: "words",
    amount: null,
    unit: null,
    sources: [SRC.holidays],
    confirm_with: "CA",
    note: "Each state's Shops and Establishments rules set a minimum (8 to 10 in several states). Which state applies, and its number, is your CA's to confirm; type it on the Holidays page.",
  },
  // ---------------------------------------------------------------- TDS on Indian vendors
  {
    ...PLAIN,
    key: "tds-contractor-single",
    area: "tds",
    title: "Contractors: one bill",
    from: "a single bill",
    sense: "over",
    amount: 30_000,
    unit: "rupees",
    sources: [SRC.tdsTaxguru, SRC.tdsBriefing],
    confirm_with: "CA",
    note: TDS_NOTE,
  },
  {
    ...PLAIN,
    key: "tds-contractor-year",
    area: "tds",
    title: "Contractors: the year's bills together",
    from: "one vendor's bills in the financial year",
    sense: "over",
    amount: 100_000,
    unit: "rupees",
    sources: [SRC.tdsTaxguru, SRC.tdsBriefing],
    confirm_with: "CA",
    note: TDS_NOTE,
  },
  {
    ...PLAIN,
    key: "tds-technical-year",
    area: "tds",
    title: "Technical fees and royalty",
    from: "one vendor's bills in the financial year",
    sense: "over",
    amount: 50_000,
    unit: "rupees",
    sources: [SRC.tdsTaxguru],
    confirm_with: "CA",
    note: TDS_NOTE,
  },
  {
    ...PLAIN,
    key: "tds-professional-year",
    area: "tds",
    title: "Professional fees",
    from: "one vendor's bills in the financial year",
    sense: "over",
    amount: null,
    unit: "rupees",
    sources: [SRC.tdsTaxguru, SRC.tdsBriefing],
    confirm_with: "CA",
    only_when_confirmed: true,
    readings: [
      {
        label: "₹50,000",
        amount: 50_000,
        words: "Most guides, and the table read for tax year 2026-27.",
        sources: [SRC.tdsTaxguru],
      },
      {
        label: "₹30,000",
        amount: 30_000,
        words: "One guide, seen only as a search summary and not linked here, gives ₹30,000.",
        sources: [],
      },
    ],
    note: TDS_NOTE,
  },
  {
    ...PLAIN,
    key: "tds-rent-month",
    area: "tds",
    title: "Rent",
    from: "one month's rent",
    sense: "over",
    amount: 50_000,
    unit: "rupees",
    sources: [SRC.tdsTaxguru],
    confirm_with: "CA",
    note: TDS_NOTE,
  },
  {
    ...PLAIN,
    key: "tds-rate-contractor-person",
    area: "tds",
    title: "Rate: contractor who is an individual or a HUF",
    from: "the amount paid or credited",
    sense: "rate",
    amount: 1,
    unit: "per_cent",
    sources: [SRC.tdsTaxguru],
    confirm_with: "CA",
    note: "Section 393(1), Table 6(i); payment code 1023.",
  },
  {
    ...PLAIN,
    key: "tds-rate-contractor-other",
    area: "tds",
    title: "Rate: any other contractor",
    from: "the amount paid or credited",
    sense: "rate",
    amount: 2,
    unit: "per_cent",
    sources: [SRC.tdsTaxguru],
    confirm_with: "CA",
    note: "Section 393(1), Table 6(i); payment code 1024.",
  },
  {
    ...PLAIN,
    key: "tds-rate-technical",
    area: "tds",
    title: "Rate: technical fees and royalty",
    from: "the amount paid or credited",
    sense: "rate",
    amount: 2,
    unit: "per_cent",
    sources: [SRC.tdsTaxguru],
    confirm_with: "CA",
    note: "Section 393(1), Table 6(iii); payment code 1026.",
  },
  {
    ...PLAIN,
    key: "tds-rate-professional",
    area: "tds",
    title: "Rate: professional fees",
    from: "the amount paid or credited",
    sense: "rate",
    amount: 10,
    unit: "per_cent",
    sources: [SRC.tdsTaxguru],
    confirm_with: "CA",
    note: "Section 393(1), Table 6(iii); payment code 1027.",
  },
  {
    ...PLAIN,
    key: "tds-rate-director",
    area: "tds",
    title: "Rate: a director's fees",
    from: "the amount paid or credited",
    sense: "rate",
    amount: 10,
    unit: "per_cent",
    sources: [SRC.tdsTaxguru],
    confirm_with: "CA",
    note: "Section 393(1), Table 6(iii); payment code 1028. No lower limit.",
  },
  {
    ...PLAIN,
    key: "tds-rate-rent-plant",
    area: "tds",
    title: "Rate: rent of plant and machinery",
    from: "the amount paid or credited",
    sense: "rate",
    amount: 2,
    unit: "per_cent",
    sources: [SRC.tdsTaxguru],
    confirm_with: "CA",
    note: "Section 393(1), Table 2(ii).",
  },
  {
    ...PLAIN,
    key: "tds-rate-rent-building",
    area: "tds",
    title: "Rate: rent of land and building",
    from: "the amount paid or credited",
    sense: "rate",
    amount: 10,
    unit: "per_cent",
    sources: [SRC.tdsTaxguru],
    confirm_with: "CA",
    note: "Section 393(1), Table 2(ii).",
  },
  {
    ...PLAIN,
    key: "tds-deposit",
    area: "tds",
    title: "Deposit the tax deducted",
    from: "the month it was deducted in",
    sense: "words",
    amount: null,
    unit: null,
    sources: [SRC.tdsTaxguru],
    confirm_with: "CA",
    note: "By the 7th of the next month; by 30 April for March. The day is not moved for a holiday here.",
  },
  // ---------------------------------------------------------------- MSME
  {
    ...PLAIN,
    key: "msme-no-agreement",
    area: "msme",
    title: "Pay a micro or small supplier, no written agreement",
    from: "the day the goods or the service were accepted",
    sense: "within",
    amount: 15,
    unit: "days",
    sources: [SRC.msme],
    confirm_with: "CA",
    note: "Udyam-registered micro and small suppliers only. Paid late, the expense counts only in the year it is paid: section 37(2)(g) of the 2025 Act.",
  },
  {
    ...PLAIN,
    key: "msme-agreement",
    area: "msme",
    title: "Pay a micro or small supplier, with a written agreement",
    from: "the day the goods or the service were accepted",
    sense: "at_most",
    amount: 45,
    unit: "days",
    sources: [SRC.msme],
    confirm_with: "CA",
    note: "The agreed days, and never more than this.",
  },
  // ---------------------------------------------------------------- foreign vendors
  {
    ...PLAIN,
    key: "foreign-forms",
    area: "foreign",
    title: "Forms for paying a non-resident",
    from: "each payment abroad",
    sense: "words",
    amount: null,
    unit: null,
    sources: [SRC.cashfree, SRC.cleartax],
    confirm_with: "CA",
    only_when_confirmed: true,
    readings: [
      {
        label: "Forms 145 and 146",
        amount: null,
        words:
          "One source: under the 2025 Act, Form 145 replaces 15CA and Form 146 (the accountant's certificate) replaces 15CB.",
        sources: [SRC.cashfree],
      },
      {
        label: "Forms 15CA and 15CB",
        amount: null,
        words: "Other 2026 pages still describe the old forms as current.",
        sources: [SRC.cleartax],
      },
    ],
    note: "Whether tax is deducted at all on a card-paid subscription is your CA's decision, once for each vendor.",
  },
  {
    ...PLAIN,
    key: "foreign-reverse-charge",
    area: "foreign",
    title: "Reverse-charge GST on online services bought from abroad",
    from: "each foreign bill, once registered for GST",
    sense: "words",
    amount: null,
    unit: null,
    sources: [SRC.oidar, SRC.treelifeGst],
    confirm_with: "CA",
    note: "A GST-registered buyer pays the GST itself, monthly. A vendor that bills from its Indian company charges GST on the bill instead.",
  },
  // ---------------------------------------------------------------- export of services
  {
    ...PLAIN,
    key: "export-realisation",
    area: "export",
    title: "Bring the money home for an export invoice",
    from: "the invoice date",
    sense: "within",
    amount: null,
    unit: "months",
    sources: [SRC.lks, SRC.taxguruFema, SRC.rodl, SRC.taxscan],
    confirm_with: "bank",
    only_when_confirmed: true,
    readings: [
      {
        label: "9 months",
        amount: 9,
        words:
          "Two sources of September and October 2026: a notification of 22 September 2026 cut the period to 9 months (12 if invoiced and settled in rupees).",
        sources: [SRC.lks, SRC.taxguruFema],
      },
      {
        label: "15 months",
        amount: 15,
        words: "Two sources of November 2025 and March 2026: 15 months (18 in rupees).",
        sources: [SRC.rodl, SRC.taxscan],
      },
    ],
    note: "Your AD bank or CA confirms which applies to your invoices.",
  },
  {
    ...PLAIN,
    key: "export-edf",
    area: "export",
    title: "Export Declaration Form for a month's invoices",
    from: "the end of the month the invoice was raised in",
    sense: "within",
    amount: 30,
    unit: "days",
    sources: [SRC.rodl, SRC.lks],
    confirm_with: "bank",
    note: "Since 1 October 2026. One form may cover the month. The sources disagree on where it is filed.",
  },
  // ---------------------------------------------------------------- books
  {
    ...PLAIN,
    key: "voucher-retention",
    area: "books",
    title: "Keep books, vouchers and their edit history",
    from: "the end of the financial year the voucher belongs to",
    sense: "at_least",
    amount: 8,
    unit: "years",
    sources: [SRC.s128],
    confirm_with: "CA",
    note: "Section 128(5). The books themselves are kept by your CA in the books software; Data keeps the vouchers.",
  },
  {
    ...PLAIN,
    key: "close-by",
    area: "books",
    title: "Close the month and send the CA's pack",
    from: "the end of the month",
    sense: "within",
    amount: 5,
    unit: "working_days",
    sources: [SRC.treelifeMis],
    confirm_with: null,
    note: "Practice, not law: three to five working days.",
  },
  // ---------------------------------------------------------------- thresholds
  {
    ...PLAIN,
    key: "gst-registration",
    area: "thresholds",
    title: "GST registration: services turnover in a financial year",
    from: "the year's turnover",
    sense: "over",
    amount: 2_000_000,
    unit: "rupees",
    sources: [SRC.treelifeGst],
    confirm_with: "CA",
    note: "Or at once, on one reading, if reverse charge arises on services bought from abroad: your CA decides when to register.",
  },
  {
    ...PLAIN,
    key: "pf-headcount",
    area: "thresholds",
    title: "Provident fund: employees",
    from: "the number of employees",
    sense: "at_least",
    amount: 20,
    unit: "people",
    sources: [SRC.kpmg],
    confirm_with: "CA",
    note: "Whether paid interns count is your CA's or lawyer's call.",
  },
  {
    ...PLAIN,
    key: "esi-headcount",
    area: "thresholds",
    title: "Employees' state insurance: employees",
    from: "the number of employees",
    sense: "at_least",
    amount: 10,
    unit: "people",
    sources: [SRC.kpmg],
    confirm_with: "CA",
    note: "Voluntary below this number.",
  },
  {
    ...PLAIN,
    key: "caro-capital",
    area: "thresholds",
    title: "CARO exemption: paid-up capital plus reserves",
    from: "the balance-sheet date",
    sense: "over",
    amount: 10_000_000,
    unit: "rupees",
    sources: [SRC.caro],
    confirm_with: "CA",
    note: "Above this the auditor's CARO report applies; the exemption has three other conditions.",
  },
];

export function dutyRuleOf(key: DutyRuleKey): DutyRule {
  const rule = DUTY_RULES.find((item) => item.key === key);
  if (!rule) throw new Error(`No duty rule ${key}`);
  return rule;
}

export function isDutyRuleKey(value: unknown): value is DutyRuleKey {
  return typeof value === "string" && DUTY_RULES.some((rule) => rule.key === value);
}

/** What is kept for a rule in the rule book: his amount, the reading he confirmed, who confirmed. */
export type DutyStored = {
  amount?: number;
  reading?: number;
  confirmed?: { name: string; on: string };
};

export type DutyRuleState = {
  key: DutyRuleKey;
  /**
   * His amount, else the confirmed reading's, else the rule's own. Null for a rule in words,
   * and for a rule with readings that is not confirmed.
   */
  amount: number | null;
  unit: DutyUnit | null;
  confirmed: boolean;
  /** Who confirmed it and the day, as he recorded them; null until confirmed. */
  confirmed_by: string | null;
  confirmed_on: string | null;
  /** The reading he confirmed (its index in `readings`), or null. */
  reading: number | null;
  /** Days and comparisons may be worked out with it: in force, and confirmed if it must be. */
  usable: boolean;
  /** `starts_on` is still ahead of the day asked about. */
  not_yet: boolean;
};

/** A rule's state on a day, from what the rule book holds for it. Pure. */
export function dutyStateOf(rule: DutyRule, stored: DutyStored, on: string): DutyRuleState {
  const confirmed = stored.confirmed !== undefined;
  const reading =
    confirmed && stored.reading !== undefined && rule.readings[stored.reading]
      ? stored.reading
      : null;
  const fromReading = reading === null ? null : (rule.readings[reading]?.amount ?? null);
  const amount =
    rule.sense === "words" && rule.readings.length === 0
      ? null
      : rule.only_when_confirmed && !confirmed
        ? null
        : (stored.amount ?? fromReading ?? rule.amount);
  const notYet = rule.starts_on !== null && on < rule.starts_on;
  return {
    key: rule.key,
    amount,
    unit: rule.unit,
    confirmed,
    confirmed_by: stored.confirmed?.name ?? null,
    confirmed_on: stored.confirmed?.on ?? null,
    reading,
    usable: !notYet && (!rule.only_when_confirmed || confirmed),
    not_yet: notYet,
  };
}

/**
 * What an answer carries beside every day or comparison worked out from a rule, so the page
 * can print "Confirm with your CA" or "Confirmed by …" and link to the rule.
 */
export type RuleLine = {
  key: DutyRuleKey;
  title: string;
  confirm_with: DutyConfirmWith | null;
  confirmed_by: string | null;
  confirmed_on: string | null;
  /** False: nothing was worked out; `readings` says what the sources give. */
  usable: boolean;
  /** The day it comes into force, while that is still ahead; else null. */
  starts_on: string | null;
  /** The labels of the readings, when the sources disagree and nothing is confirmed; else []. */
  readings: string[];
};

export function ruleLineOf(state: DutyRuleState): RuleLine {
  const rule = dutyRuleOf(state.key);
  return {
    key: rule.key,
    title: rule.title,
    confirm_with: rule.confirm_with,
    confirmed_by: state.confirmed_by,
    confirmed_on: state.confirmed_on,
    usable: state.usable,
    starts_on: state.not_yet ? rule.starts_on : null,
    readings:
      rule.only_when_confirmed && !state.confirmed
        ? rule.readings.map((reading) => reading.label)
        : [],
  };
}

export type DutyRulesService = {
  /** One rule's state today, or on the day given. */
  state(key: DutyRuleKey, on?: string): DutyRuleState;
};

/**
 * A `duty-rules` for a copy where U2's dates module provides none: each rule's own amount,
 * nothing confirmed unless named. Installed only under a test route and only while
 * `core.need("duty-rules")` is null.
 */
export function standInDutyRules(
  today: () => string,
  stored: Partial<Record<DutyRuleKey, DutyStored>> = {},
): DutyRulesService {
  return { state: (key, on) => dutyStateOf(dutyRuleOf(key), stored[key] ?? {}, on ?? today()) };
}

/** The day a "within" rule falls due from a base day, for days, months and years; null otherwise. */
export function dutyDue(state: DutyRuleState, baseOn: string): string | null {
  if (!state.usable || state.amount === null) return null;
  if (state.unit === "days") return addDays(baseOn, state.amount);
  if (state.unit === "months") return addMonths(baseOn, state.amount);
  if (state.unit === "years") return addMonths(baseOn, state.amount * 12);
  return null;
}

// ------------------------------------------------------------------ holidays and working days

export type HolidayKind = "national" | "state" | "company" | "optional";
export type HolidayView = { on: string; name: string; kind: HolidayKind };
/** 0 is Sunday, 6 Saturday. */
export type WeekOff = readonly number[];
export const WEEK_OFF_DEFAULT: WeekOff = [0, 6];

function weekdayOf(day: string): number {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date)).getUTCDay();
}

/** Not a weekly off day and not a day off. Optional holidays are not days off. */
export function isWorkingDayWith(
  day: string,
  off: ReadonlySet<string>,
  weekOff: WeekOff = WEEK_OFF_DEFAULT,
): boolean {
  return !weekOff.includes(weekdayOf(day)) && !off.has(day);
}

/** The `count`th working day after `day` (count 1 is the next working day); `day` itself for 0. */
export function addWorkingDaysWith(
  day: string,
  count: number,
  off: ReadonlySet<string>,
  weekOff: WeekOff = WEEK_OFF_DEFAULT,
): string {
  let current = day;
  let left = Math.max(0, Math.floor(count));
  // A week with no working day would never end: seven weekly off days is refused upstream.
  let guard = 0;
  while (left > 0 && guard < 4_000) {
    current = addDays(current, 1);
    guard += 1;
    if (isWorkingDayWith(current, off, weekOff)) left -= 1;
  }
  return current;
}

export type HolidaysService = {
  /** Days off for everyone (national, state, company), and the optional days, from..to inclusive. */
  between(from: string, to: string): HolidayView[];
  isWorkingDay(day: string): boolean;
  addWorkingDays(day: string, count: number): string;
  /** Any holiday at all is recorded for that calendar year. */
  hasYear(year: number): boolean;
};

/** A `holidays` over a fixed list, for copies without U2's module and for tests. */
export function standInHolidays(
  days: readonly HolidayView[] = [],
  weekOff: WeekOff = WEEK_OFF_DEFAULT,
): HolidaysService {
  const off = new Set(days.filter((day) => day.kind !== "optional").map((day) => day.on));
  return {
    between: (from, to) =>
      days.filter((day) => day.on >= from && day.on <= to).sort((a, b) => a.on.localeCompare(b.on)),
    isWorkingDay: (day) => isWorkingDayWith(day, off, weekOff),
    addWorkingDays: (day, count) => addWorkingDaysWith(day, count, off, weekOff),
    hasYear: (year) => days.some((day) => Number(day.on.slice(0, 4)) === year),
  };
}

// ------------------------------------------------------------------ months, years, retention

/** "2026-11" of a day. */
export const periodOf = (day: string): string => day.slice(0, 7);

/** The last calendar day of a "YYYY-MM". */
export function periodEnd(period: string): string {
  const [year = 0, month = 1] = period.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${period}-${String(last).padStart(2, "0")}`;
}

/** A "YYYY-MM" moved by whole months: ("2026-01", -2) → "2025-11". */
export function addPeriods(period: string, count: number): string {
  const [year = 0, month = 1] = period.split("-").map(Number);
  const index = year * 12 + (month - 1) + count;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/**
 * The last day a voucher of that day must be kept: the end of the financial year that is
 * `years` after its own. 12 Nov 2026 (FY 2026-27), 8 years → 31 Mar 2035.
 */
export function retentionUntil(day: string, years: number): string {
  return `${fyStartYear(day) + 1 + years}-03-31`;
}

/**
 * The day tax deducted on a day is to be deposited by (rule `tds-deposit`): the 7th of the
 * next month, and 30 April when it was deducted in March. Not moved for a holiday.
 */
export function tdsDepositDue(deductedOn: string): string {
  const period = periodOf(deductedOn);
  if (period.endsWith("-03")) return `${period.slice(0, 4)}-04-30`;
  return `${addPeriods(period, 1)}-07`;
}

// ------------------------------------------------------------------ the edit log

/** One line of a finance record's edit log. `hash` chains each line to the one before it. */
export type EditLine = {
  n: number;
  /** "bill", "vendor", "category", "export_invoice", "statement", "line", "close". */
  record: string;
  id: string;
  /** "added", "changed", "cancelled", "paid", "payment taken back", "matched", "locked" … */
  verb: string;
  /** Each field that changed, with the value before and after, as printed. */
  changes: { field: string; before: string; after: string }[];
  by: Staff;
  at: string;
  /** SHA-256, in hex, of the previous line's `hash` followed by this line's JSON without `hash`. */
  hash: string;
};

/** The text a line's hash is taken over: the previous hash, a newline, the line without its hash. */
export function editLineText(previousHash: string, line: Omit<EditLine, "hash">): string {
  return `${previousHash}\n${JSON.stringify({
    n: line.n,
    record: line.record,
    id: line.id,
    verb: line.verb,
    changes: line.changes,
    by: line.by,
    at: line.at,
  })}`;
}

// ------------------------------------------------------------------ what U1 gives

export type RegisterLookup = UsedFor & {
  /** Records not closed, withdrawn or removed: what a catalogue row asks before hiding. */
  count(): number;
};
/** `domains` also says whether a signing certificate is recorded. */
export type DomainsLookup = RegisterLookup & { signingCount(): number };

// ------------------------------------------------------------------ what U2 gives (people-pay)

/** One live stipend or pay line. Owner-only: a caller passes it on only in an Owner's answer. */
export type PayLine = {
  payment_id: string;
  person_id: string;
  name: string;
  kind: "intern" | "employee" | "contractor";
  /** "2026-11": the month it pays for. */
  period: string;
  amount_minor: number;
  currency: "INR" | "USD";
  paid_on: string;
  reference: string;
  tds_deducted_minor: number | null;
};
export type PayOwed = {
  person_id: string;
  name: string;
  period: string;
  due_on: string;
  amount_minor: number;
  currency: "INR" | "USD";
};
export type PeoplePay = {
  /** Live payments (never withdrawn ones) paid from..to inclusive, oldest first. Owner-only. */
  paid(from: string, to: string): PayLine[];
  /** Stipend months not paid yet whose due day is from..to inclusive. Owner-only. */
  owed(from: string, to: string): PayOwed[];
  /** People engaged on a day, by kind: counts only, so not Owner-only. */
  headcount(day: string): { employees: number; interns: number; contractors: number };
};

// ------------------------------------------------------------------ what U3 gives (money)

export type CategoryKind = "expense" | "income" | "tax" | "funding" | "transfer" | "other";
export type CategoryView = {
  category_id: string;
  /** "Cloud hosting". */
  name: string;
  kind: CategoryKind;
  /** The CA's ledger, as typed; "" until mapped. */
  ledger: string;
  /** The Schedule III line, as typed; "" until mapped. */
  schedule_line: string;
  /** Stipends, salaries: its lines name a person's pay. */
  people: boolean;
  retired: boolean;
};

export type BillPayment = {
  payment_id: string;
  paid_on: string;
  amount_minor: number;
  /** The bank's reference (UTR). */
  reference: string;
};
export type BillView = {
  bill_id: string;
  vendor_id: string;
  vendor_name: string;
  invoice_number: string;
  invoice_on: string;
  currency: string;
  /** What the invoice says in all, tax included. */
  total_minor: number;
  /** What is to be paid to the vendor: the total less tax deducted. */
  payable_minor: number;
  /** Not paid yet, of `payable_minor`. */
  open_minor: number;
  category_id: string | null;
  /** The MSME pay-by day, else the day he typed, else null. */
  pay_by: string | null;
  payments: BillPayment[];
  cancelled: boolean;
  /** "/data/money/bills/{id}". */
  href: string;
};

export type ExportReceipt = {
  receipt_id: string;
  received_on: string;
  /** In the invoice's currency. */
  amount_minor: number;
  /** What reached the bank, in paise; null until known. */
  inr_minor: number | null;
  fira_number: string;
};
export type ExportView = {
  invoice_id: string;
  customer: string;
  invoice_number: string;
  invoice_on: string;
  currency: string;
  amount_minor: number;
  receipts: ExportReceipt[];
  href: string;
};

/** A file for the CA's pack: where it goes in the zip, and which file in Files. */
export type PackFile = { folder: string; name: string; file_id: string };

export type MoneyLookup = UsedFor &
  HoldsFiles & {
    categories(): CategoryView[];
    /** Bills by invoice day (from..to inclusive when given), cancelled ones left out unless asked. */
    bills(filter?: { from?: string; to?: string; open?: boolean; cancelled?: boolean }): BillView[];
    exportInvoices(filter?: { from?: string; to?: string }): ExportView[];
    /** A payment made from a matched statement line. Refused as the bill's own page would refuse it. */
    recordPayment(input: {
      bill_id: string;
      paid_on: string;
      amount_minor: number;
      reference: string;
      by: Staff;
    }): BillView;
    /** A receipt on an export invoice from a matched statement line. */
    recordReceipt(input: {
      invoice_id: string;
      received_on: string;
      amount_minor: number;
      inr_minor: number | null;
      by: Staff;
    }): ExportView;
    /** Take back a payment or a receipt that was recorded from a statement line (its `from_line`). */
    takeBackPayment(input: {
      bill_id: string;
      payment_id: string;
      why: string;
      by: Staff;
    }): BillView;
    takeBackReceipt(input: {
      invoice_id: string;
      receipt_id: string;
      why: string;
      by: Staff;
    }): ExportView;
    /** What the month's pack takes from Money: bills by invoice day, challans by deposit day, the rest by their own day. */
    packFiles(period: string): {
      bills: PackFile[];
      challans: PackFile[];
      export_invoices: PackFile[];
      firas: PackFile[];
      /** Bills of the month with no copy attached. */
      bills_without_copy: number;
      bills_count: number;
      challans_count: number;
      export_count: number;
      firas_count: number;
    };
  };

// ------------------------------------------------------------------ what U4 gives

export type CashNow = {
  currency: string;
  /** The last day every open account in this currency is covered to. */
  as_of: string;
  cash_minor: number;
  /** The last whole month's money out, transfers between own accounts left out; null with no whole month. */
  gross_burn_minor: number | null;
  /** The average net burn of the last one to three whole months, rounded up to a paisa; null with none. */
  avg_net_burn_minor: number | null;
  /** How many whole months the average is over: 0 to 3. */
  months: number;
  /** The last whole month's money collected from customers. */
  collected_minor: number | null;
  /** Lines with no category yet, to the `as_of` day. */
  uncategorised: number;
};
export type StatementsFeed = {
  /** One per currency with an imported statement, sorted by code; [] for none. Totals only: not Owner-only. */
  cash(): CashNow[];
};

export type MonthLock = {
  isLocked(period: string): boolean;
  /** The sentence a refused change shows: "October 2026 is locked. Reopen it on Month close, with a reason, to change this." */
  refusal(period: string): string;
};

/** A `month-lock` over a fixed list of months, for copies without U4's module and for tests. */
export function standInMonthLock(locked: readonly string[] = []): MonthLock {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return {
    isLocked: (period) => locked.includes(period),
    refusal: (period) => {
      const [year = "", month = "1"] = period.split("-");
      return `${months[Number(month) - 1] ?? ""} ${year} is locked. Reopen it on Month close, with a reason, to change this.`;
    },
  };
}
