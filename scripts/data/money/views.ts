/**
 * What Money's pages and services read (ws-notes/duties/spec.md §8.4, §8.5): a bill with what
 * is to be paid and what is open, its state, its checks, the MSME block, the tax-deducted line
 * and the deposit day; a vendor's financial years; the ledger map's counts and checks; an
 * export invoice's clocks and what has been realised. Worked out on every read, from the
 * records and the rule book as they are now, so nothing worked out is ever stored.
 */

import type { DataCore } from "../core";
import {
  DUTY_RULES,
  periodOf,
  ruleLineOf,
  tdsDepositDue,
  type BillView,
  type CategoryView,
  type DutyReading,
  type ExportView,
  type RuleLine,
} from "../duties-contracts";
import { dayWords } from "../../../src/lib/data/labels-company";
import { fyWords, minorWords } from "../../../src/lib/data/labels-duties";
import { MoneyBook } from "./book";
import { exportClocks, live, lutCheck, rateWordsOf, realisedOf } from "./exports";
import { msmePayBy, paidLateWords, type MsmeView } from "./msme";
import { tdsLine, type RuleAsk, type TdsBill, type TdsLine } from "./tds";
import type { Bill, Category, ExportInvoice, Vendor } from "./types";
import { fileLink } from "../meetings/copy";
import type { BillState } from "../../../src/lib/data/labels-money";

export const billHref = (id: string) => `/data/money/bills/${id}`;
export const vendorHref = (id: string) => `/data/money/vendors/${id}`;
export const exportHref = (id: string) => `/data/money/exports/${id}`;

export type Here = { rules: boolean; lock: boolean; holidays: boolean };

export type Worked = {
  payable_minor: number;
  paid_minor: number;
  open_minor: number;
  /** The day the live payments first reached what is to be paid; null until then. */
  full_on: string | null;
  state: BillState;
  msme: MsmeView | null;
  pay_by: string | null;
  /** "(15-day limit)", "(agreed 30 days)", "(your date)"; "" with no pay-by. */
  pay_by_short: string;
  paid_late_words: string;
  tds_line: TdsLine | null;
  deposit: { by: string; rule: RuleLine | null } | null;
  checks: string[];
};

export class MoneyViews {
  readonly #core: DataCore;
  readonly #book: MoneyBook;
  readonly rules: RuleAsk;
  readonly #locked: (period: string) => boolean;

  constructor(
    core: DataCore,
    book: MoneyBook,
    rules: RuleAsk,
    locked: (period: string) => boolean,
  ) {
    this.#core = core;
    this.#book = book;
    this.rules = rules;
    this.#locked = locked;
  }

  locked(day: string): boolean {
    return this.#locked(periodOf(day));
  }

  // ---------------------------------------------------------------- bills

  #vendorOf(bill: Bill): Vendor | null {
    return this.#book.vendors.find((item) => item.vendor_id === bill.vendor_id) ?? null;
  }

  static tdsBill(bill: Bill): TdsBill {
    return {
      bill_id: bill.bill_id,
      invoice_on: bill.invoice_on,
      created_at: bill.created_at,
      taxable_minor: bill.taxable_minor,
      currency: bill.currency,
      cancelled: bill.cancelled !== null,
      kind: bill.tds.kind,
    };
  }

  worked(bill: Bill): Worked {
    const vendor = this.#vendorOf(bill);
    const payable = MoneyBook.payable(bill);
    const payments = live(bill.payments).sort(
      (a, b) => a.paid_on.localeCompare(b.paid_on) || a.at.localeCompare(b.at),
    );
    let running = 0;
    let fullOn: string | null = null;
    for (const payment of payments) {
      running += payment.amount_minor;
      if (fullOn === null && running >= payable) fullOn = payment.paid_on;
    }
    if (payable <= 0 && fullOn === null) fullOn = payments[0]?.paid_on ?? bill.invoice_on;
    const paid = running;
    const open = bill.cancelled ? 0 : Math.max(0, payable - paid);
    const msme = vendor
      ? msmePayBy({
          udyam: vendor.udyam.class,
          agreement: vendor.msme_agreement,
          base: bill.accepted_on ?? bill.invoice_on,
          rules: this.rules,
        })
      : null;
    const payBy = msme?.pay_by ?? bill.pay_by_typed;
    const short = msme?.pay_by ? msme.short : bill.pay_by_typed ? "(your date)" : "";
    const late = fullOn !== null && payBy !== null && fullOn > payBy && payable > 0;
    const state: BillState = bill.cancelled
      ? "cancelled"
      : fullOn !== null
        ? late
          ? "paid_late"
          : "paid"
        : paid > 0
          ? "part_paid"
          : "open";
    const paidLate =
      late && fullOn
        ? msme?.pay_by
          ? paidLateWords(msme.pay_by, fullOn)
          : `Paid ${dayWords(fullOn)}, after the pay-by day you set.`
        : "";
    const bills = this.#book.bills
      .filter((item) => item.vendor_id === bill.vendor_id)
      .map(MoneyViews.tdsBill);
    const line = tdsLine({
      bill: MoneyViews.tdsBill(bill),
      bills,
      kind: bill.tds.kind,
      resident: vendor?.residency !== "non_resident",
      rules: this.rules,
      deducted_on: bill.tds.deducted_minor === null ? null : bill.tds.deducted_on,
    });
    const depositState = this.rules("tds-deposit");
    const deposit =
      bill.tds.deducted_minor !== null && bill.tds.deducted_on && depositState
        ? { by: tdsDepositDue(bill.tds.deducted_on), rule: ruleLineOf(depositState) }
        : null;
    const checks: string[] = [];
    if (bill.taxable_minor + bill.gst_minor !== bill.total_minor)
      checks.push(
        `The parts add up to ${minorWords(bill.taxable_minor + bill.gst_minor, bill.currency)}, not the total ${minorWords(bill.total_minor, bill.currency)}.`,
      );
    if (paid > payable && payable >= 0)
      checks.push(`Paid ${minorWords(paid - payable, bill.currency)} more than the bill.`);
    if (!bill.file_id && !bill.cancelled) checks.push("No copy of the bill is attached.");
    if (vendor?.retired) checks.push("This bill's vendor is retired.");
    for (const n of this.#book.ahead)
      if (
        this.#book.log.lines.some(
          (item) => item.n === n && item.record === "bill" && item.id === bill.bill_id,
        )
      )
        checks.push(`Edit line ${n} was written, but this bill's record does not hold its change.`);
    return {
      payable_minor: payable,
      paid_minor: paid,
      open_minor: open,
      full_on: fullOn,
      state,
      msme,
      pay_by: bill.cancelled ? null : payBy,
      pay_by_short: bill.cancelled ? "" : short,
      paid_late_words: paidLate,
      tds_line: line,
      deposit,
      checks,
    };
  }

  billRow(bill: Bill) {
    const worked = this.worked(bill);
    return {
      bill_id: bill.bill_id,
      vendor_id: bill.vendor_id,
      vendor_name: this.#book.vendorName(bill.vendor_id),
      invoice_number: bill.invoice_number,
      invoice_on: bill.invoice_on,
      description: bill.description,
      currency: bill.currency,
      total_minor: bill.total_minor,
      deducted_minor: bill.tds.deducted_minor,
      payable_minor: worked.payable_minor,
      paid_minor: worked.paid_minor,
      open_minor: worked.open_minor,
      pay_by: worked.pay_by,
      pay_by_short: worked.pay_by_short,
      state: worked.state,
      category_name: this.#book.categoryName(bill.category_id),
      has_copy: bill.file_id !== null,
      locked: this.locked(bill.invoice_on),
    };
  }

  billView(bill: Bill): BillView {
    const worked = this.worked(bill);
    return {
      bill_id: bill.bill_id,
      vendor_id: bill.vendor_id,
      vendor_name: this.#book.vendorName(bill.vendor_id),
      invoice_number: bill.invoice_number,
      invoice_on: bill.invoice_on,
      currency: bill.currency,
      total_minor: bill.total_minor,
      payable_minor: worked.payable_minor,
      open_minor: worked.open_minor,
      category_id: bill.category_id,
      pay_by: worked.pay_by,
      payments: live(bill.payments).map((payment) => ({
        payment_id: payment.payment_id,
        paid_on: payment.paid_on,
        amount_minor: payment.amount_minor,
        reference: payment.reference,
      })),
      cancelled: bill.cancelled !== null,
      href: billHref(bill.bill_id),
    };
  }

  // ---------------------------------------------------------------- vendors

  vendorRow(vendor: Vendor, today: string) {
    const fy = fyWords(today);
    const billed: Record<string, number> = {};
    let count = 0;
    for (const bill of this.#book.bills) {
      if (bill.vendor_id !== vendor.vendor_id || bill.cancelled) continue;
      count += 1;
      if (fyWords(bill.invoice_on) === fy)
        billed[bill.currency] = (billed[bill.currency] ?? 0) + bill.total_minor;
    }
    return {
      vendor_id: vendor.vendor_id,
      name: vendor.name,
      legal_name: vendor.legal_name,
      residency: vendor.residency,
      country: vendor.country,
      pan: vendor.pan,
      gstin: vendor.gstin,
      udyam_class: vendor.udyam.class,
      udyam_number: vendor.udyam.number,
      tds_kind: vendor.tds_kind,
      retired: vendor.retired,
      bills: count,
      billed_this_year: billed,
      fy,
    };
  }

  vendorChecks(vendor: Vendor): string[] {
    const checks: string[] = [];
    if (vendor.pan && vendor.gstin && vendor.gstin.slice(2, 12) !== vendor.pan)
      checks.push("The GSTIN's PAN part is not this PAN.");
    if (vendor.residency === "non_resident" && !vendor.foreign.decision)
      checks.push("No decision on tax for this vendor abroad is recorded yet.");
    return checks;
  }

  vendorYears(vendor: Vendor) {
    const bills = this.#book.bills.filter((bill) => bill.vendor_id === vendor.vendor_id);
    const years = new Map<string, Bill[]>();
    for (const bill of bills) {
      if (bill.cancelled) continue;
      const fy = fyWords(bill.invoice_on);
      years.set(fy, [...(years.get(fy) ?? []), bill]);
    }
    const all = bills.map(MoneyViews.tdsBill);
    return [...years.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([fy, items]) => {
        const billed: Record<string, number> = {};
        let taxable = 0;
        let deducted = 0;
        for (const bill of items) {
          billed[bill.currency] = (billed[bill.currency] ?? 0) + bill.total_minor;
          if (bill.currency === "INR") {
            taxable += bill.taxable_minor;
            deducted += bill.tds.deducted_minor ?? 0;
          }
        }
        const last = [...items].sort(
          (a, b) =>
            a.invoice_on.localeCompare(b.invoice_on) || a.created_at.localeCompare(b.created_at),
        )[items.length - 1]!;
        const kind = vendor.tds_kind || last.tds.kind;
        const line = tdsLine({
          bill: MoneyViews.tdsBill(last),
          bills: all,
          kind,
          resident: vendor.residency !== "non_resident",
          rules: this.rules,
          as: "year",
        });
        return {
          fy,
          billed,
          taxable_inr_minor: taxable,
          tds_deducted_minor: deducted,
          bills: items.length,
          line: line ? [line.words, line.hint_words].filter(Boolean).join(" ") : "",
          rule: line?.rule ?? null,
        };
      });
  }

  forms(): {
    rule: RuleLine | null;
    readings: DutyReading[];
    confirmed_label: string | null;
    reading: number | null;
  } {
    const rule = DUTY_RULES.find((item) => item.key === "foreign-forms")!;
    const state = this.rules("foreign-forms");
    const reading = state?.confirmed ? state.reading : null;
    return {
      rule: state ? ruleLineOf(state) : null,
      readings: rule.readings.map((item) => ({ ...item, sources: [...item.sources] })),
      confirmed_label: reading === null ? null : (rule.readings[reading]?.label ?? null),
      reading,
    };
  }

  // ---------------------------------------------------------------- categories

  categoryView(category: Category): CategoryView {
    return {
      category_id: category.category_id,
      name: category.name,
      kind: category.kind,
      ledger: category.ledger,
      schedule_line: category.schedule_line,
      people: category.people,
      retired: category.retired,
    };
  }

  inUse(category: Category): number {
    return (
      this.#book.bills.filter((bill) => bill.category_id === category.category_id).length +
      this.#book.vendors.filter((vendor) => vendor.default_category_id === category.category_id)
        .length
    );
  }

  ledgerChecks(): { line: string; checks: string[]; mapped: number; live: number } {
    const liveOnes = this.#book.categories.filter((item) => !item.retired);
    const mapped = liveOnes.filter((item) => item.ledger !== "").length;
    const line = `${mapped.toLocaleString("en-IN")} of ${liveOnes.length.toLocaleString("en-IN")} ${liveOnes.length === 1 ? "category is" : "categories are"} mapped.`;
    const checks: string[] = [];
    const byLedger = new Map<string, string[]>();
    for (const item of liveOnes) {
      if (!item.ledger) continue;
      const key = item.ledger.trim().toLowerCase();
      byLedger.set(key, [...(byLedger.get(key) ?? []), item.name]);
    }
    for (const [ledger, names] of byLedger)
      if (names.length > 1) {
        const shown =
          liveOnes.find((item) => item.ledger.trim().toLowerCase() === ledger)?.ledger ?? ledger;
        const list =
          names.length === 2
            ? `${names[0]} and ${names[1]}`
            : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
        checks.push(
          `${list} point at the one ledger “${shown}”. Confirm with your CA that they should.`,
        );
      }
    return { line, checks, mapped, live: liveOnes.length };
  }

  // ---------------------------------------------------------------- export invoices

  exportWorked(invoice: ExportInvoice, luts: readonly { fy: string }[]) {
    const clocks = exportClocks(invoice.invoice_on, this.rules);
    const realised = realisedOf(invoice.amount_minor, invoice.receipts);
    const checks: string[] = [];
    const lut = lutCheck(invoice.invoice_on, invoice.tax_treatment, luts as never);
    if (lut) checks.push(lut);
    if (realised.minor > invoice.amount_minor)
      checks.push(
        `Received ${minorWords(realised.minor - invoice.amount_minor, invoice.currency)} more than the invoice.`,
      );
    if (!invoice.file_id && !invoice.cancelled) checks.push("No copy of the invoice is attached.");
    return { ...clocks, realised, checks };
  }

  exportRow(invoice: ExportInvoice) {
    const worked = this.exportWorked(invoice, this.#book.setup.luts);
    return {
      invoice_id: invoice.invoice_id,
      customer: invoice.customer,
      country: invoice.country,
      invoice_number: invoice.invoice_number,
      invoice_on: invoice.invoice_on,
      currency: invoice.currency,
      amount_minor: invoice.amount_minor,
      tax_treatment: invoice.tax_treatment,
      edf: invoice.edf,
      edf_by: worked.edf_by,
      realise_by: worked.realise_by,
      rules: worked.rules,
      readings: worked.readings,
      realised: worked.realised,
      cancelled: invoice.cancelled !== null,
      has_copy: invoice.file_id !== null,
      locked: this.locked(invoice.invoice_on),
    };
  }

  exportView(invoice: ExportInvoice): ExportView {
    return {
      invoice_id: invoice.invoice_id,
      customer: invoice.customer,
      invoice_number: invoice.invoice_number,
      invoice_on: invoice.invoice_on,
      currency: invoice.currency,
      amount_minor: invoice.amount_minor,
      receipts: live(invoice.receipts).map((receipt) => ({
        receipt_id: receipt.receipt_id,
        received_on: receipt.received_on,
        amount_minor: receipt.amount_minor,
        inr_minor: receipt.inr_minor,
        fira_number: receipt.fira_number,
      })),
      href: exportHref(invoice.invoice_id),
    };
  }

  receiptRows(invoice: ExportInvoice) {
    return invoice.receipts.map((receipt) => ({
      ...receipt,
      rate_words: rateWordsOf(invoice.currency, receipt.amount_minor, receipt.inr_minor),
      fira_file: fileLink(this.#core, receipt.fira_file_id),
    }));
  }
}
