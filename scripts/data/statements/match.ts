/**
 * Matching a statement line to what it pays or brings in (ws-notes/duties/spec.md §9.4).
 * Suggestions are worked out each time the lines are read, never stored. A match either
 * links a payment or receipt Money already holds, or records one in Money from the line
 * (paid on the line's day, with its reference, `made_here: true`); taking that match back
 * takes the payment back in Money too. A stipend match only links: nothing is written to
 * the people ledger, and a stipend is only ever suggested in an Owner's answer.
 */

import { Refused } from "../../mail-merge/engine";
import { periodWords } from "../../../src/lib/data/labels-duties";
import { MATCH_WHY } from "../../../src/lib/data/labels-statements";
import { daysBetween } from "../days";
import type { BillView, ExportView, MoneyLookup, PayLine } from "../duties-contracts";
import type { Staff } from "../protocol";
import { INVOICE_MATCH_MIN, REFERENCE_MATCH_MIN, STIPEND_DAYS } from "./limits";
import type { Account, Line, LineMatch } from "./types";

export type SuggestionKind = "bill_payment" | "bill" | "stipend" | "export_receipt" | "export";

export type Suggestion = {
  kind: SuggestionKind;
  /** "bill:<bill_id>", "bill_payment:<bill_id>:<payment_id>", … : what `…/match` is given. */
  ref: string;
  title: string;
  strength: "sure" | "likely";
  why: string;
  /** An open export invoice's own currency: matching asks for the amount in it. */
  currency: string | null;
  href: string | null;
};

export type MatchSources = {
  account: Account;
  bills: readonly BillView[];
  exports: readonly ExportView[];
  /** Stipend payments near the line's day; null unless the answer is the Owner's. */
  stipends: readonly PayLine[] | null;
  /** What live lines already link: payment, receipt and stipend payment ids. */
  linked: ReadonlySet<string>;
};

const billTitle = (bill: BillView) => `${bill.vendor_name} ${bill.invoice_number}`.trim();
const exportTitle = (invoice: ExportView) => `${invoice.customer} ${invoice.invoice_number}`.trim();
export const stipendTitle = (pay: Pick<PayLine, "name" | "period">) =>
  `Stipend: ${pay.name}, ${periodWords(pay.period)}`;

const contains = (haystack: string, needle: string, least: number) =>
  needle.trim().length >= least && haystack.toLowerCase().includes(needle.trim().toLowerCase());

/** Every candidate for one line, sure ones first; none for a matched or withdrawn line. */
export function suggestionsFor(line: Line, sources: MatchSources): Suggestion[] {
  if (line.match !== null || line.withdrawn) return [];
  const { account } = sources;
  const text = `${line.narration} ${line.reference}`;
  const found: Suggestion[] = [];
  if (line.direction === "debit") {
    for (const bill of sources.bills) {
      if (bill.cancelled || bill.currency !== account.currency) continue;
      const payment = bill.payments.find(
        (item) =>
          !sources.linked.has(item.payment_id) &&
          item.amount_minor === line.amount_minor &&
          contains(text, item.reference, REFERENCE_MATCH_MIN),
      );
      if (payment) {
        found.push({
          kind: "bill_payment",
          ref: `bill_payment:${bill.bill_id}:${payment.payment_id}`,
          title: billTitle(bill),
          strength: "sure",
          why: MATCH_WHY.reference,
          currency: null,
          href: bill.href,
        });
        continue;
      }
      if (bill.open_minor <= 0) continue;
      if (
        contains(line.narration, bill.invoice_number, INVOICE_MATCH_MIN) &&
        line.amount_minor <= bill.open_minor
      )
        found.push({
          kind: "bill",
          ref: `bill:${bill.bill_id}`,
          title: billTitle(bill),
          strength: "sure",
          why: MATCH_WHY.invoice,
          currency: null,
          href: bill.href,
        });
      else if (bill.open_minor === line.amount_minor)
        found.push({
          kind: "bill",
          ref: `bill:${bill.bill_id}`,
          title: billTitle(bill),
          strength: "likely",
          why: MATCH_WHY.amount,
          currency: null,
          href: bill.href,
        });
    }
    if (sources.stipends && account.currency === "INR")
      for (const pay of sources.stipends) {
        if (pay.currency !== "INR" || pay.amount_minor !== line.amount_minor) continue;
        if (sources.linked.has(pay.payment_id)) continue;
        if (Math.abs(daysBetween(pay.paid_on, line.posted_on)) > STIPEND_DAYS) continue;
        const sure = contains(text, pay.reference, REFERENCE_MATCH_MIN);
        found.push({
          kind: "stipend",
          ref: `stipend:${pay.person_id}:${pay.payment_id}`,
          title: stipendTitle(pay),
          strength: sure ? "sure" : "likely",
          why: sure ? MATCH_WHY.reference : MATCH_WHY.stipend,
          currency: null,
          href: null,
        });
      }
  } else if (account.currency === "INR") {
    for (const invoice of sources.exports) {
      const receipt = invoice.receipts.find(
        (item) => item.inr_minor === line.amount_minor && !sources.linked.has(item.receipt_id),
      );
      if (receipt) {
        found.push({
          kind: "export_receipt",
          ref: `export_receipt:${invoice.invoice_id}:${receipt.receipt_id}`,
          title: exportTitle(invoice),
          strength: "sure",
          why: MATCH_WHY.receipt,
          currency: null,
          href: invoice.href,
        });
        continue;
      }
      const received = invoice.receipts.reduce((sum, item) => sum + item.amount_minor, 0);
      if (received < invoice.amount_minor)
        found.push({
          kind: "export",
          ref: `export:${invoice.invoice_id}`,
          title: exportTitle(invoice),
          strength: "likely",
          why: MATCH_WHY.export,
          currency: invoice.currency,
          href: invoice.href,
        });
    }
  }
  return found
    .sort((a, b) => (a.strength === b.strength ? 0 : a.strength === "sure" ? -1 : 1))
    .slice(0, 6);
}

/** The one sure candidate that links or pays a bill, or null (none, or more than one). */
export function sureBillOf(suggestions: readonly Suggestion[]): Suggestion | null {
  const sure = suggestions.filter(
    (item) => item.strength === "sure" && (item.kind === "bill" || item.kind === "bill_payment"),
  );
  return sure.length === 1 ? sure[0]! : null;
}

/**
 * What a candidate becomes on the line: a link, or a payment or receipt recorded in Money
 * now. `amount_minor` is the receipt in the invoice's own currency, for an open export.
 */
export function applyMatch(input: {
  line: Line;
  suggestion: Suggestion;
  money: MoneyLookup | null;
  by: Staff;
  amount_minor: number | null;
}): { match: LineMatch; category_id: string | null } {
  const { line, suggestion, money, by } = input;
  const [kind, first = "", second = ""] = suggestion.ref.split(":");
  const needMoney = (): MoneyLookup => {
    if (!money) throw new Refused(409, "money_missing", "Money is not loaded here.");
    return money;
  };
  const billCategory = (billId: string) =>
    needMoney()
      .bills({ cancelled: true })
      .find((bill) => bill.bill_id === billId)?.category_id ?? null;
  if (kind === "bill_payment")
    return {
      match: { kind: "bill_payment", bill_id: first, payment_id: second, made_here: false },
      category_id: billCategory(first),
    };
  if (kind === "bill") {
    const lookup = needMoney();
    const before = new Set(
      lookup
        .bills({ cancelled: true })
        .find((bill) => bill.bill_id === first)
        ?.payments.map((payment) => payment.payment_id) ?? [],
    );
    const view = lookup.recordPayment({
      bill_id: first,
      paid_on: line.posted_on,
      amount_minor: line.amount_minor,
      reference: line.reference || line.narration.slice(0, 120),
      by,
    });
    const made = view.payments.find((payment) => !before.has(payment.payment_id));
    if (!made) throw new Refused(409, "not_recorded", "Money did not record the payment.");
    return {
      match: { kind: "bill_payment", bill_id: first, payment_id: made.payment_id, made_here: true },
      category_id: view.category_id,
    };
  }
  if (kind === "stipend")
    return { match: { kind: "stipend", person_id: first, payment_id: second }, category_id: null };
  if (kind === "export_receipt")
    return {
      match: { kind: "export_receipt", invoice_id: first, receipt_id: second, made_here: false },
      category_id: null,
    };
  if (kind === "export") {
    const lookup = needMoney();
    if (input.amount_minor === null || input.amount_minor <= 0)
      throw new Refused(
        400,
        "invalid",
        `Type what was received in ${suggestion.currency ?? "the invoice's currency"}, such as 1180.50.`,
      );
    const before = new Set(
      lookup
        .exportInvoices()
        .find((invoice) => invoice.invoice_id === first)
        ?.receipts.map((receipt) => receipt.receipt_id) ?? [],
    );
    const view = lookup.recordReceipt({
      invoice_id: first,
      received_on: line.posted_on,
      amount_minor: input.amount_minor,
      inr_minor: line.amount_minor,
      by,
    });
    const made = view.receipts.find((receipt) => !before.has(receipt.receipt_id));
    if (!made) throw new Refused(409, "not_recorded", "Money did not record the receipt.");
    return {
      match: {
        kind: "export_receipt",
        invoice_id: first,
        receipt_id: made.receipt_id,
        made_here: true,
      },
      category_id: null,
    };
  }
  throw new Refused(400, "invalid", "That is not one of this line's matches.");
}

/** Taking a match back: when it was made here, Money takes the payment or receipt back too. */
export function takeBack(input: {
  match: LineMatch;
  money: MoneyLookup | null;
  why: string;
  by: Staff;
}): void {
  const { match, money, why, by } = input;
  if (match.kind === "bill_payment" && match.made_here) {
    if (!money) throw new Refused(409, "money_missing", "Money is not loaded here.");
    money.takeBackPayment({ bill_id: match.bill_id, payment_id: match.payment_id, why, by });
  }
  if (match.kind === "export_receipt" && match.made_here) {
    if (!money) throw new Refused(409, "money_missing", "Money is not loaded here.");
    money.takeBackReceipt({ invoice_id: match.invoice_id, receipt_id: match.receipt_id, why, by });
  }
}

/** The ids a line's match holds, so no second line is offered the same payment. */
export const linkedIdOf = (match: LineMatch): string =>
  match.kind === "bill_payment"
    ? match.payment_id
    : match.kind === "export_receipt"
      ? match.receipt_id
      : match.payment_id;
