/**
 * The seams of the company batch (ws-notes/company/spec.md §3): the services one Data module
 * offers another through `core.provide` / `core.need`, by name and type; the statutory clocks
 * every unit works dates out with, each with its sources; the evidence a filing keeps; a
 * stand-in `key-dates` for copies without C1's module; and the pure date helpers more than one
 * unit uses. Every copy holds this file byte for byte. Nothing here touches a file, a socket or
 * the clock. This is a tracker's reading of secondary sources, not legal advice.
 */

import { addDays, daysBetween } from "./days";
import type { Staff } from "./protocol";

// ------------------------------------------------------------------ names

/** The services this batch adds, by the name each is provided under. */
export const COMPANY_SERVICES = {
  /** C1: the company's facts and its directors. */
  company: "company",
  /** C1, in the dates module: the rule book, and Key dates made from records. */
  keyDates: "key-dates",
  /** C2: meetings, resolutions and minutes. */
  meetings: "meetings",
  /** C2: the register of members and its certificates. */
  members: "members",
  /** C2: the legal-document register. */
  agreements: "agreements",
  /** C3: counts of signed letters in the people ledger, never a name. */
  peopleLetters: "people-letters",
  /** C4: each answers `usedFor` at least. */
  pilots: "pilots",
  diligence: "diligence",
  closing: "closing",
} as const;

/** What a file's page asks besides leads and the waitlist. Never the people ledger. */
export const USED_FOR_SOURCES = [
  "key-dates",
  "company",
  "meetings",
  "members",
  "agreements",
  "pilots",
  "diligence",
  "closing",
] as const;

export type UsedFor = { usedFor(fileId: string): { label: string; href: string }[] };

/** The Due kinds this batch adds; core's `DueKind`, the overview's schema and `DUE_KINDS` carry them. */
export const COMPANY_DUE_KINDS = ["meeting", "agreement", "person", "pilot", "diligence"] as const;
export type CompanyDueKind = (typeof COMPANY_DUE_KINDS)[number];

// ------------------------------------------------------------------ the rule book

export type RuleKey =
  | "first-agm"
  | "agm"
  | "agm-gap"
  | "adt-1"
  | "aoc-4"
  | "mgt-7a"
  | "inc-20a"
  | "board-gap-small"
  | "board-gap-other"
  | "dir-3-kyc"
  | "dir-3-kyc-change"
  | "board-notice"
  | "general-notice"
  | "board-quorum"
  | "mgt-14"
  | "minutes-draft"
  | "minutes-comments"
  | "minutes-signed"
  | "allotment"
  | "refund"
  | "pas-3"
  | "register-entry"
  | "share-certificates"
  | "valuation-age"
  | "firms-registration"
  | "advance-receipt"
  | "fc-gpr"
  | "fla"
  | "offer-limit";

export type RuleArea = "company" | "meetings" | "close";
export type ConfirmWith = "CA" | "CS" | "lawyer";

export type Rule = {
  key: RuleKey;
  area: RuleArea;
  /** The form or the duty, as the Rules view titles it. */
  title: string;
  /** What the clock counts from: "the allotment". */
  from: string;
  /**
   * "within": due that long after `from`; "at_least": a gap of at least that long (a notice, a
   * gap between meetings); "at_most": a gap of at most that long; "count": a number of people.
   */
  sense: "within" | "at_least" | "at_most" | "count";
  /** The rule's own amount; his amount replaces it. Null for a fixed day of the year. */
  amount: number | null;
  unit: "days" | "months" | "years" | "people" | null;
  /** "07-15": that day after the end of the financial year `from` falls in. */
  fy_day: string | null;
  sources: readonly { name: string; url: string }[];
  /** The day the sources were last read for this rule. */
  verified_on: string;
  confirm_with: ConfirmWith;
  /** A fixed amount a day once late, in rupees, where the sources give one; `cap` null for none. */
  late: { per_day: number; cap: number | null; words: string } | null;
  /** The sources disagree: it makes no date until his CA or CS confirms it. */
  only_when_confirmed: boolean;
  /** What the sources disagree on, or what else applies; "" for nothing. */
  note: string;
};

const CHECKED = "2026-11-12";

const SOURCE = {
  clr88: {
    name: "Corporate Law Reporter: section 88",
    url: "https://corporatelawreporter.com/companies_act/section-88-of-companies-act-2013-register-of-members/",
  },
  clr96: {
    name: "Corporate Law Reporter: section 96",
    url: "https://corporatelawreporter.com/companies_act/section-96-of-companies-act-2013-annual-general-meeting/",
  },
  clr139: {
    name: "Corporate Law Reporter: section 139",
    url: "https://corporatelawreporter.com/companies_act/section-139-of-companies-act-2013-appointment-of-auditors/",
  },
  taxguruAoc: {
    name: "TaxGuru: AOC-4 and MGT-7 penalties",
    url: "https://taxguru.in/company-law/penalty-non-filing-aoc-4-mgt-7-due-date.html",
  },
  caclub: {
    name: "CAclub: the additional fee of ₹100 a day",
    url: "https://www.caclub.in/mca-levy-additional-fee-of-rs-100-day-for-late-filing-of-annual-return-financial-statements/",
  },
  calcguru: { name: "calcguru: General Circular 05/2026", url: "https://calcguru.in/?p=9880" },
  legalwizRoc: {
    name: "LegalWiz: ROC calendar FY 2026-27",
    url: "https://www.legalwiz.in/blog/roc-compliance-calendar-for-fy-2026-2027",
  },
  legalwizInc20a: {
    name: "LegalWiz: INC-20A",
    url: "https://www.legalwiz.in/blog/form-inc-20a-declaration-for-commencement-of-business",
  },
  equitylistBoard: {
    name: "EquityList: board meetings",
    url: "https://www.equitylist.co/blog-post/board-meeting-companies-act",
  },
  vinodKothari: {
    name: "Vinod Kothari: private company exemptions",
    url: "https://vinodkothari.com/2017/06/mca-favorably-revisits-exemption-notification-relating-to-private-companies/",
  },
  equitylistKyc: {
    name: "EquityList: DIR-3 KYC",
    url: "https://www.equitylist.co/blog-post/dir-3-kyc",
  },
  indiaBriefingKyc: {
    name: "India Briefing: director KYC rules",
    url: "https://www.india-briefing.com/news/director-kyc-new-rules-india-companies-act-2013-41680.html/",
  },
  treelifeEsop: { name: "Treelife: ESOP approvals", url: "https://treelife.in/?p=16676" },
  equitylistPrivate: {
    name: "EquityList: private placement",
    url: "https://www.equitylist.co/blog-post/private-placement-of-shares",
  },
  taxguruPrivate: {
    name: "TaxGuru: private placement",
    url: "https://taxguru.in/company-law/private-placement-vs-preferential-allotment-head-to-head-comparison.html",
  },
  equitylistPas3: { name: "EquityList: PAS-3", url: "https://www.equitylist.co/blog-post/pas-3" },
  taxmann42: {
    name: "Taxmann: section 42",
    url: "https://www.taxmann.com/post/blog/private-placement-section-42-of-companies-act-2013/",
  },
  treelifeFcgpr: {
    name: "Treelife: FC-GPR",
    url: "https://treelife.in/compliance/fc-gpr-filing-after-foreign-investment/",
  },
  rbiLsf: {
    name: "RBI: late submission fee",
    url: "https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12393",
  },
  equitylistFla: {
    name: "EquityList: FLA return",
    url: "https://www.equitylist.co/blog-post/fla-return-filing-india",
  },
  ipleaders: {
    name: "iPleaders: FEMA for startups",
    url: "https://blog.ipleaders.in/fema-compliance-for-indian-startups-2026/",
  },
  isafe: { name: "100X.VC: iSAFE", url: "https://www.100x.vc/isafe" },
} as const;

const MCA_FEE = (section: string): string =>
  `An additional fee of ₹100 a day with no cap, on top of the penalty under section ${section}.`;

export const RULES: readonly Rule[] = [
  {
    key: "first-agm",
    area: "company",
    title: "First annual general meeting",
    from: "the end of the first financial year",
    sense: "within",
    amount: 9,
    unit: "months",
    fy_day: null,
    sources: [SOURCE.clr96],
    verified_on: CHECKED,
    confirm_with: "CS",
    late: null,
    only_when_confirmed: false,
    note: "No AGM is needed in the year of incorporation if the first one is held on time. The ROC cannot extend the first AGM.",
  },
  {
    key: "agm",
    area: "company",
    title: "Annual general meeting",
    from: "the end of the financial year",
    sense: "within",
    amount: 6,
    unit: "months",
    fy_day: null,
    sources: [SOURCE.clr96, SOURCE.legalwizRoc],
    verified_on: CHECKED,
    confirm_with: "CS",
    late: null,
    only_when_confirmed: false,
    note: "And at most 15 months after the last AGM, whichever is earlier.",
  },
  {
    key: "agm-gap",
    area: "company",
    title: "Time between annual general meetings",
    from: "the last AGM",
    sense: "at_most",
    amount: 15,
    unit: "months",
    fy_day: null,
    sources: [SOURCE.clr96],
    verified_on: CHECKED,
    confirm_with: "CS",
    late: null,
    only_when_confirmed: false,
    note: "",
  },
  {
    key: "adt-1",
    area: "company",
    title: "ADT-1 (auditor appointment)",
    from: "the AGM that appointed the auditor",
    sense: "within",
    amount: 15,
    unit: "days",
    fy_day: null,
    sources: [SOURCE.clr139],
    verified_on: CHECKED,
    confirm_with: "CS",
    late: null,
    only_when_confirmed: false,
    note: "The first AGM appoints the auditor until the sixth AGM. Whether ADT-1 is filed for a first auditor the board appointed is for your CS.",
  },
  {
    key: "aoc-4",
    area: "company",
    title: "AOC-4 (financial statements)",
    from: "the AGM",
    sense: "within",
    amount: 30,
    unit: "days",
    fy_day: null,
    sources: [SOURCE.taxguruAoc, SOURCE.caclub, SOURCE.calcguru],
    verified_on: CHECKED,
    confirm_with: "CA",
    late: { per_day: 100, cap: null, words: MCA_FEE("137") },
    only_when_confirmed: false,
    note: "A waiver of the additional fee for FY 2025-26 filings made by 31 Dec 2026 was reported (General Circular 05/2026); it was not checked against the MCA's own site.",
  },
  {
    key: "mgt-7a",
    area: "company",
    title: "MGT-7A or MGT-7 (annual return)",
    from: "the AGM",
    sense: "within",
    amount: 60,
    unit: "days",
    fy_day: null,
    sources: [SOURCE.legalwizRoc, SOURCE.caclub, SOURCE.calcguru],
    verified_on: CHECKED,
    confirm_with: "CS",
    late: { per_day: 100, cap: null, words: MCA_FEE("92") },
    only_when_confirmed: false,
    note: "MGT-7A is the shorter form for a small company. A waiver of the additional fee for FY 2025-26 filings made by 31 Jan 2027 was reported (General Circular 05/2026); it was not checked against the MCA's own site.",
  },
  {
    key: "inc-20a",
    area: "company",
    title: "INC-20A (commencement of business)",
    from: "incorporation",
    sense: "within",
    amount: 180,
    unit: "days",
    fy_day: null,
    sources: [SOURCE.legalwizInc20a],
    verified_on: CHECKED,
    confirm_with: "CS",
    late: {
      per_day: 1_000,
      cap: 100_000,
      words: "₹50,000 on the company, and ₹1,000 a day on each director up to ₹1,00,000.",
    },
    only_when_confirmed: false,
    note: "For a company with share capital incorporated on or after 2 Nov 2018. Until it is filed the company may not start business or borrow.",
  },
  {
    key: "board-gap-small",
    area: "company",
    title: "Board meetings: small company or startup",
    from: "the last board meeting",
    sense: "at_least",
    amount: 90,
    unit: "days",
    fy_day: null,
    sources: [SOURCE.equitylistBoard, SOURCE.vinodKothari],
    verified_on: CHECKED,
    confirm_with: "CS",
    late: null,
    only_when_confirmed: false,
    note: "At least one meeting in each half of the calendar year, at least 90 days apart.",
  },
  {
    key: "board-gap-other",
    area: "company",
    title: "Board meetings: other companies",
    from: "the last board meeting",
    sense: "at_most",
    amount: 120,
    unit: "days",
    fy_day: null,
    sources: [SOURCE.equitylistBoard],
    verified_on: CHECKED,
    confirm_with: "CS",
    late: null,
    only_when_confirmed: false,
    note: "At least four meetings a year.",
  },
  {
    key: "dir-3-kyc",
    area: "company",
    title: "DIR-3 KYC, once every three years",
    from: "the financial year of the director's last KYC",
    sense: "within",
    amount: 3,
    unit: "years",
    fy_day: null,
    sources: [SOURCE.equitylistKyc, SOURCE.indiaBriefingKyc],
    verified_on: CHECKED,
    confirm_with: "CS",
    late: null,
    only_when_confirmed: false,
    note: "Due by 30 June. One calendar still shows 30 September; the later sources say 30 June. A late filing costs ₹5,000, and the DIN is deactivated until it is made.",
  },
  {
    key: "dir-3-kyc-change",
    area: "company",
    title: "DIR-3 KYC-Web after a change of email, mobile or address",
    from: "the change",
    sense: "within",
    amount: 30,
    unit: "days",
    fy_day: null,
    sources: [SOURCE.equitylistKyc],
    verified_on: CHECKED,
    confirm_with: "CS",
    late: null,
    only_when_confirmed: false,
    note: "₹500 within the 30 days; ₹5,000 after them.",
  },
  {
    key: "board-notice",
    area: "meetings",
    title: "Notice of a board meeting",
    from: "the day the notice goes",
    sense: "at_least",
    amount: 7,
    unit: "days",
    fy_day: null,
    sources: [SOURCE.equitylistBoard],
    verified_on: CHECKED,
    confirm_with: "CS",
    late: null,
    only_when_confirmed: false,
    note: "Shorter notice is allowed only on the conditions in section 173(3); record why when you use it.",
  },
  {
    key: "general-notice",
    area: "meetings",
    title: "Notice of a general meeting",
    from: "the day the notice goes",
    sense: "at_least",
    amount: 21,
    unit: "days",
    fy_day: null,
    sources: [SOURCE.treelifeEsop, SOURCE.equitylistBoard],
    verified_on: CHECKED,
    confirm_with: "CS",
    late: null,
    only_when_confirmed: false,
    note: "Clear days: the day the notice goes and the day of the meeting are not counted. Shorter notice needs the members' consent.",
  },
  {
    key: "board-quorum",
    area: "meetings",
    title: "Quorum of a board meeting",
    from: "the directors in office on the day",
    sense: "count",
    amount: 2,
    unit: "people",
    fy_day: null,
    sources: [SOURCE.equitylistBoard],
    verified_on: CHECKED,
    confirm_with: "CS",
    late: null,
    only_when_confirmed: false,
    note: "Two directors, or a third of the board rounded up, whichever is more. Directors present by video count.",
  },
  {
    key: "mgt-14",
    area: "meetings",
    title: "MGT-14 (resolutions filed with the ROC)",
    from: "the resolution",
    sense: "within",
    amount: 30,
    unit: "days",
    fy_day: null,
    sources: [SOURCE.legalwizRoc, SOURCE.equitylistPrivate],
    verified_on: CHECKED,
    confirm_with: "CS",
    late: null,
    only_when_confirmed: false,
    note: "Special resolutions are filed. Whether a private company files MGT-14 for board resolutions under section 179(3) is for your CS: the sources differ.",
  },
  {
    key: "minutes-draft",
    area: "meetings",
    title: "Draft minutes sent to the directors",
    from: "the meeting",
    sense: "within",
    amount: 15,
    unit: "days",
    fy_day: null,
    sources: [SOURCE.equitylistBoard],
    verified_on: CHECKED,
    confirm_with: "CS",
    late: null,
    only_when_confirmed: false,
    note: "Secretarial Standard 1.",
  },
  {
    key: "minutes-comments",
    area: "meetings",
    title: "Comments on the draft minutes",
    from: "the draft going out",
    sense: "within",
    amount: 7,
    unit: "days",
    fy_day: null,
    sources: [SOURCE.equitylistBoard],
    verified_on: CHECKED,
    confirm_with: "CS",
    late: null,
    only_when_confirmed: false,
    note: "Secretarial Standard 1.",
  },
  {
    key: "minutes-signed",
    area: "meetings",
    title: "Minutes entered in the minute book and signed",
    from: "the meeting",
    sense: "within",
    amount: 30,
    unit: "days",
    fy_day: null,
    sources: [SOURCE.equitylistBoard],
    verified_on: CHECKED,
    confirm_with: "CS",
    late: null,
    only_when_confirmed: false,
    note: "Missing or defective minutes carry ₹25,000 on the company and ₹5,000 on each officer (section 118(11)).",
  },
  {
    key: "allotment",
    area: "close",
    title: "Allotment after the money arrives",
    from: "the money arriving",
    sense: "within",
    amount: 60,
    unit: "days",
    fy_day: null,
    sources: [SOURCE.equitylistPrivate, SOURCE.taxguruPrivate],
    verified_on: CHECKED,
    confirm_with: "CS",
    late: null,
    only_when_confirmed: false,
    note: "If shares are not allotted in time, the money is refunded within the next 15 days, with interest at 12 per cent a year from day 60 if that is late too.",
  },
  {
    key: "refund",
    area: "close",
    title: "Refund when shares were not allotted",
    from: "the end of the 60 days",
    sense: "within",
    amount: 15,
    unit: "days",
    fy_day: null,
    sources: [SOURCE.equitylistPrivate, SOURCE.taxguruPrivate],
    verified_on: CHECKED,
    confirm_with: "CS",
    late: null,
    only_when_confirmed: false,
    note: "Interest at 12 per cent a year runs from day 60 on a refund made late.",
  },
  {
    key: "pas-3",
    area: "close",
    title: "PAS-3 (return of allotment)",
    from: "the allotment",
    sense: "within",
    amount: 15,
    unit: "days",
    fy_day: null,
    sources: [SOURCE.equitylistPas3, SOURCE.taxmann42],
    verified_on: CHECKED,
    confirm_with: "CS",
    late: {
      per_day: 1_000,
      cap: 2_500_000,
      words:
        "A penalty of ₹1,000 a day, up to ₹25,00,000, on the company, its promoters and directors (section 42(9)).",
    },
    only_when_confirmed: false,
    note: "Some sources say 30 days. The reading most consistent across them is 15 days for a private placement and 30 for other allotments. The money cannot be used until PAS-3 is filed.",
  },
  {
    key: "register-entry",
    area: "close",
    title: "Register of members updated",
    from: "the allotment",
    sense: "within",
    amount: 7,
    unit: "days",
    fy_day: null,
    sources: [SOURCE.clr88, SOURCE.equitylistPrivate],
    verified_on: CHECKED,
    confirm_with: "CS",
    late: null,
    only_when_confirmed: false,
    note: "",
  },
  {
    key: "share-certificates",
    area: "close",
    title: "Share certificates issued",
    from: "the allotment",
    sense: "within",
    amount: 2,
    unit: "months",
    fy_day: null,
    sources: [SOURCE.equitylistPrivate],
    verified_on: CHECKED,
    confirm_with: "CS",
    late: null,
    only_when_confirmed: false,
    note: "Stamp duty on share certificates is set by the state; ask your CS.",
  },
  {
    key: "valuation-age",
    area: "close",
    title: "Valuation no older than 90 days at allotment",
    from: "the valuation report",
    sense: "at_most",
    amount: 90,
    unit: "days",
    fy_day: null,
    sources: [SOURCE.treelifeFcgpr, SOURCE.ipleaders],
    verified_on: CHECKED,
    confirm_with: "CA",
    late: null,
    only_when_confirmed: false,
    note: "For a non-resident the fair value comes from a SEBI-registered merchant banker or a CA; a stale valuation is a common reason FC-GPR is sent back.",
  },
  {
    key: "firms-registration",
    area: "close",
    title: "Register the company on FIRMS",
    from: "the money arriving from a non-resident",
    sense: "within",
    amount: 7,
    unit: "days",
    fy_day: null,
    sources: [SOURCE.treelifeFcgpr],
    verified_on: CHECKED,
    confirm_with: "CS",
    late: null,
    only_when_confirmed: false,
    note: "Not a date in the law: HQ suggests a week because registering takes two to three working days and FC-GPR follows the allotment.",
  },
  {
    key: "advance-receipt",
    area: "close",
    title: "Report money received from a non-resident",
    from: "the money arriving",
    sense: "within",
    amount: 30,
    unit: "days",
    fy_day: null,
    sources: [SOURCE.treelifeFcgpr, SOURCE.ipleaders],
    verified_on: CHECKED,
    confirm_with: "CS",
    late: null,
    only_when_confirmed: true,
    note: "One source asks for this report within 30 days and another does not list it, so it makes no date until your CS confirms it.",
  },
  {
    key: "fc-gpr",
    area: "close",
    title: "FC-GPR (foreign investment reported)",
    from: "the allotment",
    sense: "within",
    amount: 30,
    unit: "days",
    fy_day: null,
    sources: [SOURCE.treelifeFcgpr, SOURCE.rbiLsf],
    verified_on: CHECKED,
    confirm_with: "CS",
    late: null,
    only_when_confirmed: false,
    note: "Each allotment starts its own clock. Late reporting can be put right for up to three years with a late submission fee of ₹7,500 plus 0.025 per cent of the amount for each year late.",
  },
  {
    key: "fla",
    area: "close",
    title: "FLA return",
    from: "the end of the financial year of the allotment",
    sense: "within",
    amount: null,
    unit: null,
    fy_day: "07-15",
    sources: [SOURCE.equitylistFla],
    verified_on: CHECKED,
    confirm_with: "CS",
    late: null,
    only_when_confirmed: false,
    note: "Every year while there is foreign investment. If the accounts are not audited by then, file provisional figures and revise them by 30 September.",
  },
  {
    key: "offer-limit",
    area: "close",
    title: "Offers of shares in a financial year",
    from: "the financial year",
    sense: "count",
    amount: 200,
    unit: "people",
    fy_day: null,
    sources: [SOURCE.equitylistPrivate],
    verified_on: CHECKED,
    confirm_with: "CS",
    late: null,
    only_when_confirmed: false,
    note: "Per class of security. Qualified institutional buyers and employees under an ESOP are not counted; a syndicate or fund that invests as one holder counts once.",
  },
];

export type GuardrailKey =
  "note" | "safe-non-resident" | "own-account" | "receiving-bank" | "residency-unknown";

/** Warnings on the close, never blocks; each says who to confirm it with. */
export const GUARDRAILS: readonly {
  key: GuardrailKey;
  words: string;
  sources: readonly { name: string; url: string }[];
  verified_on: string;
  confirm_with: ConfirmWith;
}[] = [
  {
    key: "note",
    words:
      "A convertible note into an Indian company needs DPIIT recognition and at least ₹25 lakh from each investor.",
    sources: [SOURCE.ipleaders],
    verified_on: CHECKED,
    confirm_with: "lawyer",
  },
  {
    key: "safe-non-resident",
    words:
      "Most practitioners treat a US-style SAFE from a non-resident into an Indian company as foreign borrowing, not as shares. iSAFE, which takes the form of CCPS, or CCPS itself is the usual route.",
    sources: [SOURCE.ipleaders, SOURCE.isafe],
    verified_on: CHECKED,
    confirm_with: "lawyer",
  },
  {
    key: "own-account",
    words:
      "Money for shares comes only from the investor's own bank account, by a banking channel.",
    sources: [SOURCE.equitylistPrivate],
    verified_on: CHECKED,
    confirm_with: "CS",
  },
  {
    key: "receiving-bank",
    words:
      "For a non-resident, the FIRC and the investor's KYC come from the bank that received the money.",
    sources: [SOURCE.treelifeFcgpr],
    verified_on: CHECKED,
    confirm_with: "CS",
  },
  {
    key: "residency-unknown",
    words: "Whether the foreign-investment steps apply depends on the investor's residency.",
    sources: [SOURCE.ipleaders],
    verified_on: CHECKED,
    confirm_with: "CA",
  },
];

export function ruleOf(key: RuleKey): Rule {
  const rule = RULES.find((item) => item.key === key);
  if (!rule) throw new Error(`No rule ${key}`);
  return rule;
}

export function isRuleKey(value: unknown): value is RuleKey {
  return typeof value === "string" && RULES.some((rule) => rule.key === value);
}

// ------------------------------------------------------------------ days

const pad = (value: number): string => String(value).padStart(2, "0");

/** A calendar day plus whole months: the same day of the month, or that month's last day. */
export function addMonths(day: string, months: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const index = month - 1 + months;
  const y = year + Math.floor(index / 12);
  const m = (((index % 12) + 12) % 12) + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${pad(m)}-${pad(Math.min(date, last))}`;
}

/** The year the Indian financial year of a day starts in (1 April to 31 March). */
export function fyStartYear(day: string): number {
  const year = Number(day.slice(0, 4));
  return Number(day.slice(5, 7)) >= 4 ? year : year - 1;
}

/** "2026-27" for any day from 1 Apr 2026 to 31 Mar 2027. */
export function fyLabel(day: string): string {
  const start = fyStartYear(day);
  return `${start}-${pad((start + 1) % 100)}`;
}

/** The last day of the financial year a day falls in. */
export function fyEndOf(day: string): string {
  return `${fyStartYear(day) + 1}-03-31`;
}

/**
 * The day a "within" or "at_most" rule falls due from a base day, or the earliest day for an
 * "at_least" one, with his amount or the rule's own. Null for a count, for a rule counted in
 * years (its unit works that out), and when there is no amount.
 */
export function dueFrom(
  rule: Rule,
  baseOn: string,
  amount: number | null = rule.amount,
): string | null {
  if (rule.fy_day) return `${fyStartYear(baseOn) + 1}-${rule.fy_day}`;
  if (amount === null) return null;
  if (rule.unit === "days") return addDays(baseOn, amount);
  if (rule.unit === "months") return addMonths(baseOn, amount);
  return null;
}

/** Whole days late on a day; 0 when it is not late. */
export function lateDays(dueOn: string, on: string): number {
  return Math.max(0, daysBetween(dueOn, on));
}

/** What a fixed daily amount comes to after that many days, capped; null when the rule has none. */
export function lateAmount(rule: Rule, days: number): number | null {
  if (!rule.late || days <= 0) return null;
  const owed = rule.late.per_day * days;
  return rule.late.cap === null ? owed : Math.min(owed, rule.late.cap);
}

// ------------------------------------------------------------------ evidence

export type Evidence = {
  /** The MCA SRN, or the portal's acknowledgement number. */
  srn: string;
  /** The challan or payment reference. */
  challan: string;
  filed_on: string | null;
  /** In rupees. */
  fee_paid: number | null;
  /** The filed copy, in Files. */
  filed_file_id: string | null;
  note: string;
};

export const NO_EVIDENCE: Evidence = {
  srn: "",
  challan: "",
  filed_on: null,
  fee_paid: null,
  filed_file_id: null,
  note: "",
};

/** A stored value read back as evidence: whatever is missing or of the wrong type is empty. */
export function evidenceOf(value: unknown): Evidence {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const text = (key: string): string => {
    const found = record[key];
    return typeof found === "string" ? found : "";
  };
  const filed = text("filed_on");
  const fee = record.fee_paid;
  return {
    srn: text("srn"),
    challan: text("challan"),
    filed_on: /^\d{4}-\d{2}-\d{2}$/.test(filed) ? filed : null,
    fee_paid: typeof fee === "number" && Number.isFinite(fee) && fee >= 0 ? fee : null,
    filed_file_id: text("filed_file_id") || null,
    note: text("note"),
  };
}

/** Whether anything at all was kept. */
export function hasEvidence(evidence: Evidence): boolean {
  return Boolean(
    evidence.srn ||
    evidence.challan ||
    evidence.filed_on ||
    evidence.fee_paid !== null ||
    evidence.filed_file_id,
  );
}

// ------------------------------------------------------------------ what C1 gives

export type Flag = "yes" | "no" | "";

export type CompanyLookup = UsedFor & {
  facts(): {
    legal_name: string;
    incorporated_on: string | null;
    first_fy_end: string | null;
    small: Flag;
    startup: Flag;
    subsidiary: Flag;
    foreign_investment: Flag;
    dpiit_number: string;
    firms_registered_on: string | null;
  };
  /** Directors in office on a day (appointed on or before it, not ceased by it), by name. */
  directorsOn(day: string): { director_id: string; name: string; is_founder: boolean }[];
};

export type OwnerRole = "founder" | "ca" | "cs" | "lawyer" | "other" | "";

export type KeyDateState = "coming_up" | "in_progress" | "done" | "not_for_us" | "taken_back";

export type KeyDateLink = {
  date_id: string;
  rule_key: RuleKey;
  origin_key: string;
  title: string;
  due_on: string;
  state: KeyDateState;
  /** Coming up or in progress, and past its day. */
  overdue: boolean;
  evidence: Evidence;
  /** "/data/dates#date-{id}". */
  href: string;
};

/** A dated duty a record starts: one Key date per origin and rule. */
export type FromRecord = {
  origin: {
    /** Stable: "<module>:<record id>", plus ":<part>" when one record starts more than one clock. */
    key: string;
    /** "Allotment to Walk Fund 281": the Key date's "From" line. */
    label: string;
    /** The record's page. */
    href: string;
  };
  rule_key: RuleKey;
  /** The day the rule counts from. */
  base_on: string;
  /** "PAS-3: allotment to Walk Fund 281". */
  title: string;
  kind?: "filing" | "board" | "other";
  repeats?: "never" | "yearly";
  handled_by?: string;
  owner_role?: OwnerRole;
  notes?: string;
};

export type KeyDatesService = UsedFor & {
  /** His amount for a rule (the rule's own until he changes it), and whether it is confirmed. */
  rule(key: RuleKey): { amount: number | null; confirmed: boolean };
  /** The due day on a rule from a base day, with his amount; null where the rule is not a clock. */
  dueOn(key: RuleKey, baseOn: string): string | null;
  /**
   * Adds one date per origin and rule not there yet; a rule waiting for confirmation adds none.
   * Every date of the origins given comes back, earliest first.
   */
  add(items: readonly FromRecord[], by: Staff): KeyDateLink[];
  /** Every date of one origin, earliest first; [] for none. */
  linksFor(originKey: string): KeyDateLink[];
  /** The event moved: the origin's open dates are worked out again from the new day. */
  rebase(originKey: string, baseOn: string, by: Staff): KeyDateLink[];
  /** The step was recorded on its record: that date is done with this evidence; null for none. */
  done(originKey: string, ruleKey: RuleKey, evidence: Evidence, by: Staff): KeyDateLink | null;
  /** The event was taken back: the origin's open dates read "Taken back"; done ones stay. */
  takeBack(originKey: string, why: string, by: Staff): KeyDateLink[];
};

// ------------------------------------------------------------------ what C2 gives

export type MeetingKind = "board" | "agm" | "egm" | "circular";
export type ResolutionKind = "ordinary" | "special" | "board";

export type ResolutionView = {
  resolution_id: string;
  meeting_id: string;
  meeting_kind: MeetingKind;
  /** The meeting's day, or the day a resolution by circulation was passed. */
  passed_on: string;
  /** "Board meeting 3, 12 Dec 2026". */
  meeting_title: string;
  title: string;
  kind: ResolutionKind;
  href: string;
};

export type MeetingsLookup = UsedFor & {
  /** Meetings held (never planned or cancelled ones), newest first; one kind when given. */
  held(kind?: MeetingKind): {
    meeting_id: string;
    kind: MeetingKind;
    held_on: string;
    title: string;
    href: string;
  }[];
  /** Resolutions passed, newest first; one kind when given. */
  passed(kind?: ResolutionKind): ResolutionView[];
  resolution(resolutionId: string): ResolutionView | null;
};

export type HolderKind = "person" | "company" | "llp" | "trust" | "fund" | "other";

export type RegisterLink = {
  entry_id: string;
  member_id: string;
  folio: string;
  shares: number;
  class_name: string;
  allotted_on: string;
  entered_on: string;
  certificate: { number: string; issued_on: string } | null;
  reversed: boolean;
  href: string;
};

export type MembersRegister = UsedFor & {
  classes(): { class_id: string; name: string; kind: "equity" | "preference" }[];
  /** An allotment from a closing checklist: one entry per closing key; asked again, the same comes back. */
  allot(input: {
    closing_key: string;
    holder: {
      name: string;
      kind: HolderKind;
      residency: "resident" | "non_resident" | "";
      email: string;
      address: string;
      investor_id: string | null;
    };
    class_id: string;
    shares: number;
    price_per_share: number;
    allotted_on: string;
    entered_on: string;
    by: Staff;
  }): RegisterLink;
  forClosing(closingKey: string): RegisterLink | null;
  /** The allotment was undone (a refund): the entry is reversed with why, never deleted. */
  reverse(closingKey: string, why: string, by: Staff): RegisterLink | null;
};

export type PartyKind = "person" | "investor" | "waitlist" | "director" | "other";

export type AgreementView = {
  agreement_id: string;
  title: string;
  /** The type's label, as the register prints it. */
  type: string;
  status: "draft" | "out_for_signature" | "signed" | "expired" | "terminated";
  signed_on: string | null;
  ends_on: string | null;
  href: string;
};

export type AgreementsLookup = UsedFor & {
  forParty(kind: PartyKind, refId: string): AgreementView[];
};

// ------------------------------------------------------------------ what C3 gives

/** Counts over the people engaged on a day; never a name, an amount or an id. */
export type PeopleLetters = {
  counts(today: string): {
    engaged: number;
    with_letter: number;
    interns_and_contractors: number;
    with_ip: number;
  };
};

// ------------------------------------------------------------------ a stand-in for copies without C1

/**
 * A `key-dates` that keeps its dates in memory, for a copy where C1's dates module provides
 * none; installed only under test routes and only while `core.need("key-dates")` is null. It
 * uses each rule's own amount and never his.
 */
export function standInKeyDates(): KeyDatesService & { readonly dates: KeyDateLink[] } {
  const dates: KeyDateLink[] = [];
  let next = 1;
  const linksFor = (originKey: string): KeyDateLink[] =>
    dates
      .filter((date) => date.origin_key === originKey)
      .sort((a, b) => a.due_on.localeCompare(b.due_on) || a.rule_key.localeCompare(b.rule_key));
  const open = (date: KeyDateLink): boolean =>
    date.state === "coming_up" || date.state === "in_progress";
  return {
    dates,
    usedFor: () => [],
    rule: (key) => ({ amount: ruleOf(key).amount, confirmed: false }),
    dueOn: (key, baseOn) => dueFrom(ruleOf(key), baseOn),
    add(items) {
      for (const item of items) {
        const rule = ruleOf(item.rule_key);
        const due = dueFrom(rule, item.base_on);
        if (rule.only_when_confirmed || !due) continue;
        if (dates.some((d) => d.origin_key === item.origin.key && d.rule_key === item.rule_key))
          continue;
        dates.push({
          date_id: `stand-in-${next}`,
          rule_key: item.rule_key,
          origin_key: item.origin.key,
          title: item.title,
          due_on: due,
          state: "coming_up",
          overdue: false,
          evidence: { ...NO_EVIDENCE },
          href: `/data/dates#date-stand-in-${next}`,
        });
        next += 1;
      }
      return [...new Set(items.map((item) => item.origin.key))].flatMap(linksFor);
    },
    linksFor,
    rebase(originKey, baseOn) {
      for (const date of dates)
        if (date.origin_key === originKey && open(date)) {
          const due = dueFrom(ruleOf(date.rule_key), baseOn);
          if (due) date.due_on = due;
        }
      return linksFor(originKey);
    },
    done(originKey, ruleKey, evidence) {
      const date = dates.find((d) => d.origin_key === originKey && d.rule_key === ruleKey);
      if (!date) return null;
      date.state = "done";
      date.evidence = { ...evidence };
      return date;
    },
    takeBack(originKey) {
      for (const date of dates)
        if (date.origin_key === originKey && open(date)) date.state = "taken_back";
      return linksFor(originKey);
    },
  };
}
