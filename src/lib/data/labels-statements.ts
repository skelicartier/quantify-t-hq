/**
 * The words of bank statements, the month's close, the MIS and the computed cash on Numbers
 * (ws-notes/duties/spec.md §9), shared by the service and the pages so a sentence reads the
 * same wherever it is shown. Pure: no file, no clock. Money is whole minor units; nothing
 * here adds across currencies. Plain words, sentence case, British spelling; no target,
 * bar or per cent sign anywhere.
 */

import { dayWords } from "./labels-company";
import { minorWords, periodWords } from "./labels-duties";

// ------------------------------------------------------------------ who may see them

/** Every Statements page and action says this to anyone who is not the Owner. */
export const STATEMENTS_OWNER_LINE = "This is for the Owner only: it names who was paid what.";
/** The service's 403 `owner_only`. */
export const STATEMENTS_OWNER_REFUSAL =
  "Statements are for the Owner only: they name who was paid what.";
/** §2 rule 3: on Statements, Month close, Numbers and the MIS. */
export const NOT_ADVICE =
  "A record and a reminder, not legal, tax or accounting advice. Your CA keeps the books; nothing is filed from here.";

// ------------------------------------------------------------------ statements

export const STATEMENTS_ABOUT =
  "A statement is the bank's own file: CSV or OFX. It stays in Data's folder on this computer, is never searched, and is in a backup only when you make it.";
export const NO_ACCOUNTS =
  "No accounts yet. Add each bank and card account, then import last month's statement.";
export const ACCOUNT_KINDS = { bank: "Bank account", card: "Card" } as const;
export type AccountKind = keyof typeof ACCOUNT_KINDS;
export const CARD_NOTE =
  "A card counts in neither cash nor burn: the bank line that pays the card's bill is the money leaving.";

export const XLS_WORDS =
  "Save it as CSV from the bank's site or from the spreadsheet, then import that.";
export const PDF_WORDS =
  "A PDF can be kept beside a statement as the bank's own copy; its lines are not read.";
export const DECIMAL_COMMA_WORDS = "Amounts must use a dot for paise.";
export const TOO_LARGE_WORDS = "That file is over 3 MB. Import a month or a quarter at a time.";
export const TOO_MANY_LINES_WORDS =
  "That file has more than 20,000 lines. Import a month or a quarter at a time.";
export const NOT_A_STATEMENT_WORDS =
  "That file was not read as a statement: import the bank's CSV or OFX file.";
export const NO_HEADER_WORDS =
  "No row of column names was found. The file needs a row with a Date column and at least two others.";
export const NO_DATES_WORDS =
  "The dates could not all be read in one format. Choose the date format below.";
export const NO_LINES_WORDS = "No transactions were found in that file.";
export const WIDEN_WORDS =
  "A statement for October covers 1 to 31 October even if the last line is on the 29th.";
export const FORMATS_WORDS =
  "CSV or text separated by commas, semicolons, tabs or bars, and OFX or QFX. Amounts with a dot for paise.";

/** "rupees", "US dollars": a currency as a sentence names it. */
export function currencyName(code: string): string {
  const names: Record<string, string> = {
    INR: "rupees",
    USD: "US dollars",
    EUR: "euros",
    GBP: "pounds",
    SGD: "Singapore dollars",
    AED: "dirhams",
  };
  return names[code] ?? code;
}

/** 41020000, "INR" → "₹4,10,200.00": always to the paisa, for balances the bank prints so. */
export function exactWords(minor: number, currency: string): string {
  const words = minorWords(minor, currency);
  return Math.abs(Math.trunc(minor)) % 100 === 0 ? `${words}.00` : words;
}

/** "Walk Bank current ··0000". */
export const accountLabel = (account: { name: string; last4: string }): string =>
  account.last4 ? `${account.name} ··${account.last4}` : account.name;

const DELIMITERS: Record<string, string> = {
  ",": "comma-separated",
  ";": "semicolon-separated",
  "\t": "tab-separated",
  "|": "separated by bars",
};

/** "comma-separated". */
export const delimiterWords = (delimiter: string): string =>
  DELIMITERS[delimiter] ?? "separated text";

/** How the dates were read: "day first", "month first", "year first". */
export function dateOrderWords(format: string): string {
  if (format.startsWith("YYYY")) return "year first";
  if (format.startsWith("MM")) return "month first";
  return "day first";
}

/** "1 to 31 Oct 2026", "1 Aug to 31 Oct 2026", "1 Dec 2026 to 31 Jan 2027", "12 Oct 2026". */
export function rangeWords(from: string, to: string): string {
  if (from === to) return dayWords(from);
  const [fromDay, fromMonth, fromYear] = dayWords(from).split(" ");
  if (from.slice(0, 4) === to.slice(0, 4)) {
    if (from.slice(0, 7) === to.slice(0, 7)) return `${fromDay} to ${dayWords(to)}`;
    return `${fromDay} ${fromMonth} to ${dayWords(to)}`;
  }
  return `${fromDay} ${fromMonth} ${fromYear} to ${dayWords(to)}`;
}

export const countOf = (count: number, one: string, many = `${one}s`): string =>
  `${count.toLocaleString("en-GB")} ${count === 1 ? one : many}`;

/**
 * The preview's first sentence: "Read as comma-separated, day first. 42 lines from 1 to 31
 * Oct 2026; 17 are already here and will be skipped; 3 rows were not transactions."
 */
export function previewWords(input: {
  source: "delimited" | "ofx";
  delimiter: string | null;
  date_format: string | null;
  lines: number;
  from: string | null;
  to: string | null;
  already_here: number;
  ignored_rows: number;
}): string {
  const how =
    input.source === "ofx"
      ? "Read as OFX."
      : `Read as ${delimiterWords(input.delimiter ?? ",")}, ${dateOrderWords(input.date_format ?? "")}.`;
  const parts = [
    `${countOf(input.lines, "line")}${input.from && input.to ? ` from ${rangeWords(input.from, input.to)}` : ""}`,
  ];
  if (input.already_here > 0)
    parts.push(
      `${input.already_here.toLocaleString("en-GB")} ${input.already_here === 1 ? "is" : "are"} already here and will be skipped`,
    );
  if (input.ignored_rows > 0)
    parts.push(
      `${countOf(input.ignored_rows, "row")} ${input.ignored_rows === 1 ? "was" : "were"} not transactions`,
    );
  return `${how} ${parts.join("; ")}.`;
}

/** "Opening balance ₹4,10,000.00 · closing ₹12,00,000.00 · the lines add up." */
export function balancesWords(input: {
  currency: string;
  opening_minor: number | null;
  closing_minor: number | null;
  adds_up: { ok: true } | { ok: false; words: string } | { ok: null };
}): string {
  const parts: string[] = [];
  if (input.opening_minor !== null)
    parts.push(`Opening balance ${exactWords(input.opening_minor, input.currency)}`);
  if (input.closing_minor !== null)
    parts.push(
      `${parts.length ? "closing" : "Closing balance"} ${exactWords(input.closing_minor, input.currency)}`,
    );
  if (input.adds_up.ok === true) parts.push("the lines add up");
  else if (input.adds_up.ok === false) parts.push(input.adds_up.words.replace(/\.$/, ""));
  else parts.push("the file gives no balances to check");
  const text = parts.join(" · ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/** "Does not add up at line 12: the bank's balance is ₹4,10,200.00, the lines give ₹4,10,000.00." */
export const addsUpWords = (line: number, bank: number, lines: number, currency: string) =>
  `Does not add up at line ${line.toLocaleString("en-GB")}: the bank's balance is ${exactWords(bank, currency)}, the lines give ${exactWords(lines, currency)}.`;

/** "Nothing covers 1 to 14 Sep 2026 for this account." */
export const gapWords = (from: string, to: string) =>
  `Nothing covers ${rangeWords(from, to)} for this account.`;

export const alreadyImportedWords = (day: string) =>
  `This file is already here, imported on ${dayWords(day)}.`;

export const takeBackFirstWords = (count: number) =>
  `Take back the ${count === 1 ? "match" : `${count.toLocaleString("en-GB")} matches`} made from this statement first.`;

export const LINE_VIEWS = { to_sort: "To sort", matched: "Matched", all: "All" } as const;
export type LineView = keyof typeof LINE_VIEWS;

export const STRENGTHS = { sure: "Sure", likely: "Likely" } as const;
export const MATCH_WHY = {
  reference: "The bank reference matches.",
  invoice: "The invoice number is in the bank's line.",
  amount: "The same amount.",
  stipend: "The same amount, within five days.",
  receipt: "The rupees match the receipt.",
  export: "An export invoice is open.",
} as const;

/** "Accept the sure matches (3)". */
export const acceptSureWords = (count: number) =>
  `Accept the sure matches (${count.toLocaleString("en-GB")})`;
export const acceptedWords = (count: number) =>
  count === 0
    ? "No sure match was left to accept."
    : `${countOf(count, "match", "matches")} accepted.`;

export const MONEY_MISSING = "Money is not loaded here.";
export const PEOPLE_MISSING = "The people ledger is not loaded here.";
export const RULES_MISSING = "The rule book is not loaded here.";
export const NO_HOLIDAYS = "No holidays are recorded, so working days are Monday to Friday.";

// ------------------------------------------------------------------ cash and burn on Numbers

export const NUMBERS_ABOUT =
  "Counted from Data's own records each time you open it: replies, the waitlist and the investors. Cash and burn come from the bank statements once they are imported; until then they are what you type, with the day they are true on. There are no targets here.";
export const TYPE_CASH = "Type cash and burn";
export const TYPE_OVER = "Type over the statements";
export const TYPE_OVER_NOTE = "Why you are typing over the statements";
export const OVERRIDE_NEEDS_NOTE =
  "The statements already give this figure. Say why you are typing over it.";
export const NO_RUNWAY =
  "More came in from customers than went out over these months, so there is no runway to count.";
export const NO_WHOLE_MONTH = "Needs one whole month of statements.";

export const SOURCE_WORDS = {
  statements: "From the statements",
  typed: "Typed",
  mis: "From the frozen MIS",
} as const;
export type CashSource = keyof typeof SOURCE_WORDS;

/** "on 3 months", "on 1 month". */
export const monthsWords = (months: number) => `on ${countOf(months, "month")}`;

/** "From the statements, on 3 months"; "From the statements" with no whole month. */
export const fromStatementsWords = (months: number) =>
  months > 0 ? `${SOURCE_WORDS.statements}, ${monthsWords(months)}` : SOURCE_WORDS.statements;

/** "The statements stop at 31 Aug 2026, more than 35 days ago. Import the newer ones." */
export const staleStatementsWords = (asOf: string) =>
  `The statements stop at ${dayWords(asOf)}, more than 35 days ago. Import the newer ones.`;

/** "4 lines have no category yet; money out without one is still counted as burn." */
export const unsortedWords = (count: number) =>
  `${countOf(count, "line")} ${count === 1 ? "has" : "have"} no category yet; money out without one is still counted as burn.`;

/** "October" of "2026-10". */
export const monthOnly = (period: string) => periodWords(period).split(" ")[0] ?? "";

// ------------------------------------------------------------------ the month's close

export const CLOSE_ITEM_KEYS = [
  "statements",
  "sales_invoices",
  "bills",
  "stipend_sheet",
  "tds_challans",
  "gst_returns",
  "firas",
] as const;
export type CloseItemKey = (typeof CLOSE_ITEM_KEYS)[number];
export const CLOSE_ITEMS: Record<CloseItemKey, string> = {
  statements: "Statements for every bank and card account",
  sales_invoices: "Sales invoices",
  bills: "Purchase bills",
  stipend_sheet: "Stipend sheet",
  tds_challans: "TDS challans",
  gst_returns: "GST returns",
  firas: "FIRAs",
};
/** The rows a file can be attached to by hand. */
export const ATTACHABLE: readonly CloseItemKey[] = ["sales_invoices", "gst_returns"];

export const CLOSE_ITEM_STATES = {
  open: "Open",
  ready: "Ready",
  none_this_month: "None this month",
  not_registered: "Not registered",
} as const;
export type CloseItemState = keyof typeof CLOSE_ITEM_STATES;

export const CLOSE_STATES = {
  open: { label: "Open", tone: "attention" },
  sent: { label: "Sent", tone: "neutral" },
  locked: { label: "Locked", tone: "live" },
} as const;
export type CloseState = keyof typeof CLOSE_STATES;

export const CLOSE_ABOUT =
  "One record a month: the seven things the CA needs, the day the pack was sent and to whom, the CA's acknowledgement, then the lock.";
export const NOTHING_TO_CLOSE =
  "Nothing to close yet. The first month appears once a statement or a bill is recorded.";
export const LOCK_WORDS =
  "Locking freezes the month's MIS and refuses changes to its bills, payments and lines until it is reopened with a reason.";
export const ADMIN_PACK_WORDS =
  "Your pack leaves out the bank statements and the stipend sheet. The Owner's holds them.";
export const STIPEND_OWNER_FACT = "In the people ledger, which is for the Owner only.";
export const SEND_FIRST = "Record that the pack was sent first.";
export const SENT_BEFORE_ACK = "Record that the pack was sent before its acknowledgement.";
export const REOPEN_WHY = "Say why it is reopened, in 10 to 500 characters.";

/** "3 of 7 ready". */
export const readyWords = (ready: number) => `${ready} of 7 ready`;
/** "Purchase bills is still open." */
export const stillOpenWords = (key: CloseItemKey) => `${CLOSE_ITEMS[key]} is still open.`;
/** "November 2026 is not over yet." */
export const notOverWords = (period: string) => `${periodWords(period)} is not over yet.`;
/** "Close October 2026 and send the CA's pack". */
export const closeTitleWords = (period: string) =>
  `Close ${periodWords(period)} and send the CA's pack`;
/** "October 2026 is locked. Reopen it on Month close, with a reason, to change this." */
export const lockedWords = (period: string) =>
  `${periodWords(period)} is locked. Reopen it on Month close, with a reason, to change this.`;

// ------------------------------------------------------------------ the MIS

export const MIS_PARTS = [
  "1. Revenue",
  "2. Expenses by head",
  "3. Burn and runway",
  "4. Cash flow",
  "5. The month's numbers",
  "6. Against last month",
  "7. People cost",
  "8. Compliance",
] as const;
export const MIS_ABOUT =
  "Each month's figures from its statements, Money's categories and Data's own counts. Locking a month on Month close freezes them; investors' updates for a frozen month read them.";
export const NO_MIS =
  "No month has figures yet. Import a statement on Money › Statements, then close the month on Money › Month close.";
export const NOT_FROZEN = "Not frozen: these figures move until the month is locked.";
export const PEOPLE_HEAD = "People cost: shown to the Owner";

/** "Frozen on 7 Nov 2026 by Walk Owner". */
export const frozenWords = (day: string, name: string) => `Frozen on ${dayWords(day)} by ${name}`;

/** "₹12,000 more than October", "₹3,500 less than October", "The same as October". */
export function againstWords(change: number | null, currency: string, lastPeriod: string): string {
  if (change === null) return "New this month";
  const month = monthOnly(lastPeriod);
  if (change === 0) return `The same as ${month}`;
  return `${minorWords(Math.abs(change), currency)} ${change > 0 ? "more" : "less"} than ${month}`;
}

/** "0 employees, 2 interns, 0 contractors. The figures are for the Owner only." */
export function headcountWords(count: {
  employees: number;
  interns: number;
  contractors: number;
}): string {
  return `${countOf(count.employees, "employee")}, ${countOf(count.interns, "intern")}, ${countOf(count.contractors, "contractor")}.`;
}
