/**
 * Money's records, kept whole under `data/money/` (each file rewritten on every change):
 * `categories.json`, `vendors.json`, `bills.json`, `exports.json` and `setup.json`, each
 * `{ format: 1, edit_n, … }`, with `events.jsonl` (what changed, field names only) and
 * `edits.jsonl` (the hash-chained edit log, with the values as printed). Every change asks
 * the month lock first, writes its one edit line, then saves the record's file and its
 * `edit_n` (the number of the last line it holds): a line whose file stops short of it was
 * written by a change that did not finish, and is named at the next load, never repaired.
 * Nothing is deleted: a bill is cancelled, a payment or a receipt taken back, a category or
 * a vendor retired.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import type { DataCore } from "../core";
import { addDays } from "../days";
import { periodOf } from "../duties-contracts";
import { clean, cleanText, isDay, isRouteId } from "../guard";
import type { Staff } from "../protocol";
import { dayWords } from "../../../src/lib/data/labels-company";
import {
  AMOUNT_WORDS,
  isDutyCurrency,
  minorOf,
  minorWords,
  rateWords,
} from "../../../src/lib/data/labels-duties";
import {
  BILLS_FROM,
  CATEGORY_KINDS,
  DECIDED_ROLES,
  FLAG_WORDS,
  FOREIGN_GST,
  GST_TREATMENTS,
  PAID_BY,
  PAY_METHODS,
  RESIDENCIES,
  TAX_TREATMENTS,
  TDS_DECISIONS,
  TDS_KINDS,
  UDYAM_CLASSES,
  formsWords,
} from "../../../src/lib/data/labels-money";
import { EditLog, changesOf, type Change } from "./edits";
import { MONEY_LIMITS as L, MONEY_TOTALS, SAY, SHAPE } from "./limits";
import { STARTER_CATEGORIES } from "./starter";
import { isTdsKind } from "./tds";
import type {
  Bill,
  Category,
  CategoryKind,
  ExportInvoice,
  ForeignDecision,
  Lut,
  MoneyEvent,
  MoneySetup,
  Payment,
  Receipt,
  TdsKind,
  Vendor,
} from "./types";

type Input = Record<string, unknown>;
type FileKey = "categories" | "vendors" | "bills" | "exports" | "setup";

const FILES: Record<FileKey, string> = {
  categories: "money/categories.json",
  vendors: "money/vendors.json",
  bills: "money/bills.json",
  exports: "money/exports.json",
  setup: "money/setup.json",
};
const EVENTS = "money/events.jsonl";

/** Which file holds each record of the edit log. */
const RECORD_FILE: Record<string, FileKey> = {
  category: "categories",
  vendor: "vendors",
  bill: "bills",
  export_invoice: "exports",
  setup: "setup",
};

const has = (input: Input, name: string) => Object.prototype.hasOwnProperty.call(input, name);
const isKey = <T extends object>(table: T, value: unknown): value is keyof T =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(table, value);
const blank = (value: unknown) => value === undefined || value === null || value === "";
const flag = (value: unknown): boolean => value === true || value === "true" || value === "on";
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const refuse = (sentence: string, code = "invalid", status = 400): never => {
  throw new Refused(status, code, sentence);
};

export function dayOf(value: unknown): string | null {
  if (blank(value)) return null;
  if (!isDay(value)) refuse(SAY.notADay);
  return value as string;
}

/** An amount typed as "1,180.50": minor units, or null when left blank. */
export function amountOf(value: unknown, sentence: string = AMOUNT_WORDS): number | null {
  if (blank(value)) return null;
  const minor = minorOf(value);
  if (minor === null) refuse(sentence);
  return minor;
}

/** A note that may attract a PIN, a password or a full account or card number. */
function noteText(value: unknown, limit: number): string {
  const text = cleanText(value, limit);
  if (SHAPE.pin.test(text)) refuse(SAY.pin);
  if (SHAPE.long_number.test(text.replace(/[\s-]/g, ""))) refuse(SAY.longNumber);
  return text;
}

/** A reference, a UTR, an invoice number: `clean`, never `cleanText` (spec §2 rule 10). */
const refOf = (value: unknown, limit: number) => clean(value, limit);

function wordsBetween(value: unknown, min: number, max: number, sentence: string): string {
  const text = cleanText(value, max);
  if (text.length < min) refuse(sentence);
  return text;
}

/** Everything the book asks of the module around it. */
export type Ask = {
  today(): string;
  /** The lock's sentence for a month that is locked; null for an open one or no lock here. */
  locked(period: string): string | null;
  /** A contact's name, null when it is not here, undefined when Contacts is absent. */
  contact(contactId: string): string | null | undefined;
};

export type Printed = Record<string, string>;

export class MoneyBook {
  readonly #core: DataCore;
  readonly #ask: Ask;
  categories: Category[];
  vendors: Vendor[];
  bills: Bill[];
  exports: ExportInvoice[];
  setup: MoneySetup;
  events: MoneyEvent[];
  readonly log: EditLog;
  readonly #editN: Record<FileKey, number>;
  /** Edit lines written by a change whose record file does not hold it: named, never repaired. */
  readonly ahead: number[] = [];
  /** Under test routes, the next record of a kind made takes this id. */
  readonly pinned: Partial<Record<"bill" | "vendor" | "export" | "category", string>> = {};
  /** Called after every save: the file hold's index is rebuilt there. */
  onSave: () => void = () => undefined;

  constructor(core: DataCore, ask: Ask) {
    this.#core = core;
    this.#ask = ask;
    core.store.ensureDir("money");
    const read = <T>(key: FileKey, list: string): { items: T[]; edit_n: number } => {
      const stored = core.store.readJson<Record<string, unknown>>(FILES[key], {});
      const items = Array.isArray(stored[list]) ? (stored[list] as T[]) : [];
      const editN = typeof stored.edit_n === "number" ? stored.edit_n : 0;
      return { items, edit_n: editN };
    };
    const categories = read<Category>("categories", "categories");
    const vendors = read<Vendor>("vendors", "vendors");
    const bills = read<Bill>("bills", "bills");
    const exports = read<ExportInvoice>("exports", "exports");
    const setup = core.store.readJson<Partial<MoneySetup> & { edit_n?: number }>(FILES.setup, {});
    this.categories = categories.items.filter((item) => typeof item?.category_id === "string");
    this.vendors = vendors.items.filter((item) => typeof item?.vendor_id === "string");
    this.bills = bills.items.filter((item) => typeof item?.bill_id === "string");
    this.exports = exports.items.filter((item) => typeof item?.invoice_id === "string");
    this.setup = {
      luts: Array.isArray(setup.luts) ? setup.luts : [],
      map_checked: setup.map_checked ?? null,
    };
    this.#editN = {
      categories: categories.edit_n,
      vendors: vendors.edit_n,
      bills: bills.edit_n,
      exports: exports.edit_n,
      setup: typeof setup.edit_n === "number" ? setup.edit_n : 0,
    };
    this.events = core.store
      .readLines<MoneyEvent>(EVENTS)
      .filter((event) => typeof event?.event_id === "string");
    this.log = new EditLog(core.store, () => core.now());
    for (const line of this.log.lines) {
      const file = RECORD_FILE[line.record];
      if (file && line.n > this.#editN[file]) this.ahead.push(line.n);
    }
    if (this.ahead.length > 0)
      core.log(
        `money: edit line(s) ${this.ahead.join(", ")} were written but their record files do not hold them`,
      );
  }

  // ---------------------------------------------------------------- saving

  #save(file: FileKey): void {
    const store = this.#core.store;
    const editN = this.#editN[file];
    if (file === "categories")
      store.writeJson(FILES.categories, { format: 1, edit_n: editN, categories: this.categories });
    else if (file === "vendors")
      store.writeJson(FILES.vendors, { format: 1, edit_n: editN, vendors: this.vendors });
    else if (file === "bills")
      store.writeJson(FILES.bills, { format: 1, edit_n: editN, bills: this.bills });
    else if (file === "exports")
      store.writeJson(FILES.exports, { format: 1, edit_n: editN, exports: this.exports });
    else store.writeJson(FILES.setup, { format: 1, edit_n: editN, ...this.setup });
  }

  /**
   * One change: its edit line first (synced), then the record put in place and its file saved,
   * then the event. `apply` puts the changed record in memory; nothing is kept when the
   * change changed nothing.
   */
  #commit(input: {
    record: string;
    id: string;
    verb: string;
    changes: Change[];
    by: Staff;
    apply: () => void;
  }): boolean {
    if (input.changes.length === 0) return false;
    const file = RECORD_FILE[input.record];
    if (!file) throw new Error(`no file for ${input.record}`);
    const line = this.log.append({
      record: input.record,
      id: input.id,
      verb: input.verb,
      changes: input.changes,
      by: input.by,
    });
    input.apply();
    this.#editN[file] = line.n;
    this.#save(file);
    const event: MoneyEvent = {
      event_id: randomUUID(),
      record: input.record,
      id: input.id,
      verb: input.verb,
      fields: input.changes.map((change) => change.field),
      by: input.by,
      at: this.#core.now(),
    };
    this.events.push(event);
    this.#core.store.appendLine(EVENTS, event);
    this.onSave();
    return true;
  }

  eventsOf(record: string, id: string): MoneyEvent[] {
    return this.events
      .filter((event) => event.record === record && event.id === id)
      .reverse()
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  #lock(day: string | null | undefined): void {
    if (!day) return;
    const sentence = this.#ask.locked(periodOf(day));
    if (sentence) refuse(sentence, "month_locked", 409);
  }

  #id(kind: "bill" | "vendor" | "export" | "category"): string {
    const pinned = this.pinned[kind];
    delete this.pinned[kind];
    return pinned ?? randomUUID();
  }

  #stamp(by: Staff) {
    const at = this.#core.now();
    return { created_at: at, created_by: by, updated_at: at, updated_by: by };
  }

  // ---------------------------------------------------------------- lookups

  category(id: string | undefined): Category {
    const found = id ? this.categories.find((item) => item.category_id === id) : undefined;
    if (!found) refuse("That category is not here.", "not_found", 404);
    return found!;
  }

  vendor(id: string | undefined): Vendor {
    const found = id ? this.vendors.find((item) => item.vendor_id === id) : undefined;
    if (!found) refuse("That vendor is not here.", "not_found", 404);
    return found!;
  }

  bill(id: string | undefined): Bill {
    const found = id ? this.bills.find((item) => item.bill_id === id) : undefined;
    if (!found) refuse("That bill is not here.", "not_found", 404);
    return found!;
  }

  exportInvoice(id: string | undefined): ExportInvoice {
    const found = id ? this.exports.find((item) => item.invoice_id === id) : undefined;
    if (!found) refuse("That export invoice is not here.", "not_found", 404);
    return found!;
  }

  vendorName(id: string): string {
    return this.vendors.find((item) => item.vendor_id === id)?.name ?? "A vendor no longer here";
  }

  categoryName(id: string | null): string {
    if (!id) return "";
    return this.categories.find((item) => item.category_id === id)?.name ?? "";
  }

  /** A vendor's usual category, while it is not retired. */
  #liveDefault(vendor: Vendor): string | null {
    const id = vendor.default_category_id;
    return id && this.categories.some((item) => item.category_id === id && !item.retired)
      ? id
      : null;
  }

  #liveCategory(value: unknown, base: string | null): string | null {
    if (blank(value)) return null;
    const id = String(value);
    if (id === base) return id;
    const found = this.categories.find((item) => item.category_id === id);
    if (!found) refuse("That category is not here.", "not_found", 404);
    if (found!.retired) refuse("That category is retired.");
    return id;
  }

  // ---------------------------------------------------------------- printing, for the edit log

  printCategory(category: Category): Printed {
    return {
      Name: category.name,
      Kind: CATEGORY_KINDS[category.kind],
      "Ledger in the books": category.ledger,
      "Schedule III line": category.schedule_line,
      "Names a person's pay": category.people ? "Yes" : "No",
      Note: category.note,
      Retired: category.retired ? "Yes" : "",
    };
  }

  printVendor(vendor: Vendor): Printed {
    const decision = vendor.foreign.decision;
    const forms = formsWords(null);
    return {
      Name: vendor.name,
      "Legal name": vendor.legal_name,
      Where: vendor.residency ? RESIDENCIES[vendor.residency] : "",
      Country: vendor.country,
      PAN: vendor.pan,
      GSTIN: vendor.gstin,
      Udyam: vendor.udyam.class ? UDYAM_CLASSES[vendor.udyam.class] : "",
      "Udyam number": vendor.udyam.number,
      "Udyam checked on": dayWords(vendor.udyam.checked_on),
      "Written agreement": vendor.msme_agreement.has ? FLAG_WORDS[vendor.msme_agreement.has] : "",
      "Agreed days": vendor.msme_agreement.days === null ? "" : String(vendor.msme_agreement.days),
      "Tax deducted as": vendor.tds_kind ? TDS_KINDS[vendor.tds_kind] : "",
      "Default category": this.categoryName(vendor.default_category_id),
      Contact: vendor.contact_id ? (this.#ask.contact(vendor.contact_id) ?? "A contact") : "",
      Notes: vendor.notes,
      "Bills from": vendor.foreign.bills_from ? BILLS_FROM[vendor.foreign.bills_from] : "",
      "Paid by": vendor.foreign.paid_by ? PAID_BY[vendor.foreign.paid_by] : "",
      GST: vendor.foreign.gst ? FOREIGN_GST[vendor.foreign.gst] : "",
      "Exchange cost on the card":
        vendor.foreign.card_forex_rate === null ? "" : rateWords(vendor.foreign.card_forex_rate),
      "Your CA's decision": decision ? TDS_DECISIONS[decision.tds] : "",
      Basis: decision?.basis ?? "",
      "Forms needed": decision ? forms[decision.forms] : "",
      "Decided by": decision
        ? `${decision.decided_by} (${DECIDED_ROLES[decision.decided_role]})`
        : "",
      "Decided on": dayWords(decision?.decided_on),
      "The decision's note": decision?.file_id ? "Attached" : "",
      Retired: vendor.retired ? "Yes" : "",
    };
  }

  printBill(bill: Bill): Printed {
    const money = (minor: number | null) =>
      minor === null ? "" : minorWords(minor, bill.currency);
    return {
      Vendor: this.vendorName(bill.vendor_id),
      "Invoice number": bill.invoice_number,
      "Invoice day": dayWords(bill.invoice_on),
      "Accepted on": dayWords(bill.accepted_on),
      "What it is for": bill.description,
      Currency: bill.currency,
      "Amount before GST": money(bill.taxable_minor),
      "GST on the bill": money(bill.gst_minor),
      Total: money(bill.total_minor),
      "GST treatment": bill.gst_treatment ? GST_TREATMENTS[bill.gst_treatment] : "",
      Category: this.categoryName(bill.category_id),
      "Tax deducted: kind": bill.tds.kind ? TDS_KINDS[bill.tds.kind] : "",
      "Pay by (your date)": dayWords(bill.pay_by_typed),
    };
  }

  printPayment(bill: Bill, payment: Payment): string {
    return [
      `${minorWords(payment.amount_minor, bill.currency)} on ${dayWords(payment.paid_on)}`,
      payment.reference,
      PAY_METHODS[payment.method],
      payment.inr_minor === null ? "" : `${minorWords(payment.inr_minor, "INR")} from the bank`,
      payment.forex_minor === null
        ? ""
        : `of which ${minorWords(payment.forex_minor, "INR")} exchange cost`,
      payment.from_line ? "from a statement line" : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }

  printExport(invoice: ExportInvoice): Printed {
    return {
      Customer: invoice.customer,
      Country: invoice.country,
      "Invoice number": invoice.invoice_number,
      "Invoice day": dayWords(invoice.invoice_on),
      Currency: invoice.currency,
      Amount: minorWords(invoice.amount_minor, invoice.currency),
      "Tax treatment": invoice.tax_treatment ? TAX_TREATMENTS[invoice.tax_treatment] : "",
      "Purpose code": invoice.purpose_code,
      "How it comes in": invoice.rail,
      Notes: invoice.notes,
    };
  }

  printReceipt(invoice: ExportInvoice, receipt: Receipt): string {
    return [
      `${minorWords(receipt.amount_minor, invoice.currency)} on ${dayWords(receipt.received_on)}`,
      receipt.inr_minor === null ? "" : `${minorWords(receipt.inr_minor, "INR")} reached the bank`,
      receipt.fira_number ? `FIRA ${receipt.fira_number}` : "",
      receipt.ebrc_number ? `e-BRC ${receipt.ebrc_number}` : "",
      receipt.from_line ? "from a statement line" : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }

  // ---------------------------------------------------------------- categories

  #categoryFields(input: Input, base: Category | null) {
    const pick = (name: string) => has(input, name) || !base;
    const name = pick("name")
      ? wordsBetween(
          input.name,
          L.category_name.min,
          L.category_name.max,
          "Give the category a name of 2 to 80 characters.",
        )
      : base!.name;
    if (this.categories.some((item) => item !== base && !item.retired && same(item.name, name)))
      refuse(`There is already a category named ${name}.`, "taken", 409);
    const kind = pick("kind") ? input.kind : base!.kind;
    if (!isKey(CATEGORY_KINDS, kind)) refuse(SAY.choose);
    return {
      name,
      kind: kind as CategoryKind,
      ledger: pick("ledger") ? cleanText(input.ledger, L.ledger) : base!.ledger,
      schedule_line: pick("schedule_line")
        ? cleanText(input.schedule_line, L.schedule_line)
        : base!.schedule_line,
      people: pick("people") ? flag(input.people) : base!.people,
      note: pick("note") ? noteText(input.note, L.note) : base!.note,
    };
  }

  addCategory(input: Input, by: Staff): Category {
    if (this.categories.length >= MONEY_TOTALS.categories)
      refuse(`Data holds ${MONEY_TOTALS.categories} categories at most.`, "too_many", 409);
    const category: Category = {
      category_id: this.#id("category"),
      ...this.#categoryFields(input, null),
      retired: false,
      ...this.#stamp(by),
    };
    this.#commit({
      record: "category",
      id: category.category_id,
      verb: "added",
      changes: changesOf({}, this.printCategory(category)),
      by,
      apply: () => this.categories.push(category),
    });
    return category;
  }

  updateCategory(category: Category, input: Input, by: Staff): Category {
    const next: Category = {
      ...category,
      ...this.#categoryFields(input, category),
      updated_at: this.#core.now(),
      updated_by: by,
    };
    this.#commit({
      record: "category",
      id: category.category_id,
      verb: "changed",
      changes: changesOf(this.printCategory(category), this.printCategory(next)),
      by,
      apply: () => Object.assign(category, next),
    });
    return category;
  }

  retireCategory(category: Category, by: Staff): Category {
    const next: Category = {
      ...category,
      retired: true,
      updated_at: this.#core.now(),
      updated_by: by,
    };
    this.#commit({
      record: "category",
      id: category.category_id,
      verb: "retired",
      changes: changesOf(this.printCategory(category), this.printCategory(next)),
      by,
      apply: () => Object.assign(category, next),
    });
    return category;
  }

  /** The starter categories whose names are not here yet: one edit line each. */
  addStarter(by: Staff): { added: number } {
    let added = 0;
    for (const starter of STARTER_CATEGORIES) {
      if (this.categories.some((item) => !item.retired && same(item.name, starter.name))) continue;
      if (this.categories.length >= MONEY_TOTALS.categories) break;
      this.addCategory({ ...starter, ledger: "", schedule_line: "", note: "" }, by);
      added += 1;
    }
    return { added };
  }

  mapChecked(input: Input, by: Staff): MoneySetup {
    const today = this.#ask.today();
    const byName = wordsBetween(input.by_name, 2, L.decided_by, "Say who checked it.");
    const on = dayOf(input.on) ?? today;
    if (on > today) refuse(SAY.future);
    const checked = { by_name: byName, on, note: noteText(input.note, L.note) };
    const words = (value: MoneySetup["map_checked"]) =>
      value ? `${value.by_name}, ${dayWords(value.on)}${value.note ? `: ${value.note}` : ""}` : "";
    this.#commit({
      record: "setup",
      id: "ledger-map",
      verb: "map checked",
      changes: changesOf(
        { "Checked by": words(this.setup.map_checked) },
        { "Checked by": words(checked) },
      ),
      by,
      apply: () => {
        this.setup.map_checked = checked;
      },
    });
    return this.setup;
  }

  // ---------------------------------------------------------------- vendors

  #vendorFields(input: Input, base: Vendor | null) {
    const today = this.#ask.today();
    const pick = (name: string) => has(input, name) || !base;
    const name = pick("name")
      ? wordsBetween(
          input.name,
          L.vendor_name.min,
          L.vendor_name.max,
          "Give the vendor a name of 2 to 200 characters.",
        )
      : base!.name;
    if (this.vendors.some((item) => item !== base && !item.retired && same(item.name, name)))
      refuse(`There is already a vendor named ${name}.`, "taken", 409);
    const residency = pick("residency") ? (input.residency ?? "") : base!.residency;
    if (!isKey(RESIDENCIES, residency)) refuse(SAY.choose);
    const pan = pick("pan") ? clean(input.pan, 10).toUpperCase() : base!.pan;
    if (pan && !SHAPE.pan.test(pan)) refuse(SAY.pan);
    const gstin = pick("gstin") ? clean(input.gstin, 15).toUpperCase() : base!.gstin;
    if (gstin && !SHAPE.gstin.test(gstin)) refuse(SAY.gstin);
    const udyamClass = pick("udyam_class") ? (input.udyam_class ?? "") : base!.udyam.class;
    if (!isKey(UDYAM_CLASSES, udyamClass)) refuse(SAY.choose);
    const udyamNumber = pick("udyam_number")
      ? clean(input.udyam_number, 25).toUpperCase()
      : base!.udyam.number;
    if (udyamNumber && !SHAPE.udyam.test(udyamNumber)) refuse(SAY.udyam);
    const checkedOn = pick("udyam_checked_on")
      ? dayOf(input.udyam_checked_on)
      : base!.udyam.checked_on;
    if (checkedOn && checkedOn > today) refuse(SAY.future);
    const agreementHas = pick("msme_agreement")
      ? (input.msme_agreement ?? "")
      : base!.msme_agreement.has;
    if (!isKey(FLAG_WORDS, agreementHas)) refuse(SAY.choose);
    let days = base?.msme_agreement.days ?? null;
    if (pick("msme_days")) {
      if (blank(input.msme_days)) days = null;
      else {
        const parsed = Number(String(input.msme_days).trim());
        if (
          !Number.isSafeInteger(parsed) ||
          parsed < L.agreed_days.min ||
          parsed > L.agreed_days.max
        )
          refuse("Type the agreed days as a whole number from 1 to 365.");
        days = parsed;
      }
    }
    const tdsKind = pick("tds_kind") ? (input.tds_kind ?? "") : base!.tds_kind;
    if (tdsKind !== "" && !isTdsKind(tdsKind)) refuse(SAY.choose);
    const category = pick("default_category_id")
      ? this.#liveCategory(input.default_category_id, base?.default_category_id ?? null)
      : base!.default_category_id;
    let contact = base?.contact_id ?? null;
    if (pick("contact_id")) {
      if (blank(input.contact_id)) contact = null;
      else {
        const id = String(input.contact_id);
        if (!isRouteId(id)) refuse("That contact is not here.", "not_found", 404);
        const found = this.#ask.contact(id);
        if (found === null) refuse("That contact is not here.", "not_found", 404);
        contact = found === undefined ? (base?.contact_id ?? null) : id;
      }
    }
    return {
      name,
      legal_name: pick("legal_name") ? cleanText(input.legal_name, L.legal_name) : base!.legal_name,
      residency: residency as Vendor["residency"],
      country: pick("country") ? cleanText(input.country, L.country) : base!.country,
      pan,
      gstin,
      udyam: {
        class: udyamClass as Vendor["udyam"]["class"],
        number: udyamNumber,
        checked_on: checkedOn,
        certificate_file_id: base?.udyam.certificate_file_id ?? null,
      },
      msme_agreement: { has: agreementHas as Vendor["msme_agreement"]["has"], days },
      tds_kind: tdsKind as TdsKind | "",
      default_category_id: category,
      contact_id: contact,
      notes: pick("notes") ? noteText(input.notes, L.notes) : base!.notes,
    };
  }

  addVendor(input: Input, by: Staff): Vendor {
    if (this.vendors.length >= MONEY_TOTALS.vendors)
      refuse(
        `Data holds ${MONEY_TOTALS.vendors.toLocaleString("en-IN")} vendors at most.`,
        "too_many",
        409,
      );
    const vendor: Vendor = {
      vendor_id: this.#id("vendor"),
      ...this.#vendorFields(input, null),
      foreign: { bills_from: "", paid_by: "", gst: "", card_forex_rate: null, decision: null },
      retired: false,
      ...this.#stamp(by),
    };
    this.#commit({
      record: "vendor",
      id: vendor.vendor_id,
      verb: "added",
      changes: changesOf({}, this.printVendor(vendor)),
      by,
      apply: () => this.vendors.push(vendor),
    });
    return vendor;
  }

  updateVendor(vendor: Vendor, input: Input, by: Staff): Vendor {
    const next: Vendor = {
      ...vendor,
      ...this.#vendorFields(input, vendor),
      updated_at: this.#core.now(),
      updated_by: by,
    };
    this.#commit({
      record: "vendor",
      id: vendor.vendor_id,
      verb: "changed",
      changes: changesOf(this.printVendor(vendor), this.printVendor(next)),
      by,
      apply: () => Object.assign(vendor, next),
    });
    return vendor;
  }

  /** How a vendor abroad bills, and the CA's one decision (spec §8.2): the vendor as it would be. */
  #foreignNext(vendor: Vendor, input: Input, by: Staff, fileId: string | null): Vendor {
    if (vendor.residency !== "non_resident")
      refuse("Mark the vendor as abroad first.", "not_abroad", 409);
    const today = this.#ask.today();
    const pick = (name: string) => has(input, name);
    const billsFrom = pick("bills_from") ? (input.bills_from ?? "") : vendor.foreign.bills_from;
    const paidBy = pick("paid_by") ? (input.paid_by ?? "") : vendor.foreign.paid_by;
    const gst = pick("gst") ? (input.gst ?? "") : vendor.foreign.gst;
    if (!isKey(BILLS_FROM, billsFrom) || !isKey(PAID_BY, paidBy) || !isKey(FOREIGN_GST, gst))
      refuse(SAY.choose);
    let rate = vendor.foreign.card_forex_rate;
    if (pick("card_forex_rate")) {
      if (blank(input.card_forex_rate)) rate = null;
      else {
        const text = String(input.card_forex_rate).trim();
        const parsed = Number(text);
        if (
          !/^\d{1,2}(\.\d{1,2})?$/.test(text) ||
          !Number.isFinite(parsed) ||
          parsed < 0 ||
          parsed > L.card_forex_max
        )
          refuse("Type the exchange cost as a number from 0 to 10, such as 2.5.");
        rate = parsed;
      }
    }
    let decision: ForeignDecision | null = vendor.foreign.decision;
    if (!blank(input.decision_tds)) {
      if (!isKey(TDS_DECISIONS, input.decision_tds)) refuse(SAY.choose);
      const forms = blank(input.decision_forms) ? "none" : input.decision_forms;
      if (forms !== "none" && forms !== "form_only" && forms !== "form_and_certificate")
        refuse(SAY.choose);
      const decidedBy = cleanText(input.decided_by, L.decided_by);
      if (!decidedBy) refuse("Say who decided.");
      if (!isKey(DECIDED_ROLES, input.decided_role))
        refuse("Say whether the CA or a lawyer decided.");
      const decidedOn = dayOf(input.decided_on);
      if (!decidedOn) refuse("Give the day it was decided.");
      if (decidedOn! > today) refuse(SAY.future);
      decision = {
        tds: input.decision_tds as ForeignDecision["tds"],
        basis: noteText(input.decision_basis, L.basis),
        forms: forms as ForeignDecision["forms"],
        decided_by: decidedBy,
        decided_role: input.decided_role as ForeignDecision["decided_role"],
        decided_on: decidedOn!,
        file_id: fileId ?? decision?.file_id ?? null,
      };
    }
    return {
      ...vendor,
      foreign: {
        bills_from: billsFrom as Vendor["foreign"]["bills_from"],
        paid_by: paidBy as Vendor["foreign"]["paid_by"],
        gst: gst as Vendor["foreign"]["gst"],
        card_forex_rate: rate,
        decision,
      },
      updated_at: this.#core.now(),
      updated_by: by,
    };
  }

  /** Checks the foreign treatment before the CA's note goes into Files: nothing is kept. */
  checkForeign(vendor: Vendor, input: Input, by: Staff): void {
    this.#foreignNext(vendor, input, by, null);
  }

  foreign(vendor: Vendor, input: Input, by: Staff, fileId: string | null): Vendor {
    const next = this.#foreignNext(vendor, input, by, fileId);
    const decided = next.foreign.decision !== vendor.foreign.decision;
    const changes = changesOf(this.printVendor(vendor), this.printVendor(next));
    if (decided && fileId && !changes.some((change) => change.field === "The decision's note"))
      changes.push({ field: "The decision's note", before: "Attached", after: "Attached again" });
    this.#commit({
      record: "vendor",
      id: vendor.vendor_id,
      verb: decided ? "decision recorded" : "changed",
      changes,
      by,
      apply: () => Object.assign(vendor, next),
    });
    return vendor;
  }

  retireVendor(vendor: Vendor, by: Staff): Vendor {
    const next: Vendor = { ...vendor, retired: true, updated_at: this.#core.now(), updated_by: by };
    this.#commit({
      record: "vendor",
      id: vendor.vendor_id,
      verb: "retired",
      changes: changesOf(this.printVendor(vendor), this.printVendor(next)),
      by,
      apply: () => Object.assign(vendor, next),
    });
    return vendor;
  }

  // ---------------------------------------------------------------- bills

  #billFields(input: Input, base: Bill | null) {
    const today = this.#ask.today();
    const pick = (name: string) => has(input, name) || !base;
    let vendorId = base?.vendor_id ?? "";
    if (pick("vendor_id")) {
      const vendor = this.vendor(typeof input.vendor_id === "string" ? input.vendor_id : undefined);
      if (vendor.retired && vendor.vendor_id !== base?.vendor_id) refuse("That vendor is retired.");
      vendorId = vendor.vendor_id;
    }
    const vendor = this.vendor(vendorId);
    const number = pick("invoice_number")
      ? refOf(input.invoice_number, L.invoice_number)
      : base!.invoice_number;
    if (!number) refuse("Give the invoice number, as the bill shows it.");
    if (
      this.bills.some(
        (item) =>
          item !== base &&
          item.bill_id !== base?.bill_id &&
          item.vendor_id === vendorId &&
          item.cancelled === null &&
          same(item.invoice_number, number),
      )
    )
      refuse(`${vendor.name} already has a bill numbered ${number}.`, "taken", 409);
    const invoiceOn = pick("invoice_on") ? dayOf(input.invoice_on) : base!.invoice_on;
    if (!invoiceOn) refuse("Give the invoice day.");
    if (invoiceOn! > addDays(today, L.invoice_ahead_days))
      refuse("The invoice day is more than a week ahead.");
    const currency = pick("currency")
      ? blank(input.currency)
        ? "INR"
        : input.currency
      : base!.currency;
    if (!isDutyCurrency(currency)) refuse(SAY.choose);
    const taxable = pick("taxable") ? amountOf(input.taxable) : base!.taxable_minor;
    if (taxable === null) refuse("Type the amount before GST, such as 1180.50.");
    const gst = pick("gst") ? (amountOf(input.gst) ?? 0) : base!.gst_minor;
    const total = pick("total") ? (amountOf(input.total) ?? taxable! + gst) : base!.total_minor;
    const treatment = pick("gst_treatment") ? (input.gst_treatment ?? "") : base!.gst_treatment;
    if (!isKey(GST_TREATMENTS, treatment)) refuse(SAY.choose);
    const kind = pick("tds_kind")
      ? blank(input.tds_kind)
        ? base
          ? ""
          : vendor.tds_kind
        : input.tds_kind
      : base!.tds.kind;
    if (kind !== "" && !isTdsKind(kind)) refuse(SAY.choose);
    const deducted = base?.tds.deducted_minor ?? null;
    if (deducted !== null && deducted > taxable!)
      refuse(
        `The tax deducted, ${minorWords(deducted, String(currency))}, is more than the amount before GST.`,
      );
    const payBy = pick("pay_by") ? dayOf(input.pay_by) : base!.pay_by_typed;
    return {
      vendor_id: vendorId,
      invoice_number: number,
      invoice_on: invoiceOn!,
      accepted_on: pick("accepted_on") ? dayOf(input.accepted_on) : base!.accepted_on,
      description: pick("description")
        ? noteText(input.description, L.description)
        : base!.description,
      currency: String(currency),
      taxable_minor: taxable!,
      gst_minor: gst,
      total_minor: total,
      gst_treatment: treatment as Bill["gst_treatment"],
      category_id: pick("category_id")
        ? this.#liveCategory(
            blank(input.category_id) && !base ? this.#liveDefault(vendor) : input.category_id,
            base?.category_id ?? null,
          )
        : base!.category_id,
      tds_kind: kind as TdsKind | "",
      pay_by_typed: payBy,
    };
  }

  /** Checks an add without keeping anything, before a copy goes into Files. */
  checkBill(input: Input): void {
    if (this.bills.length >= MONEY_TOTALS.bills)
      refuse(
        `Data holds ${MONEY_TOTALS.bills.toLocaleString("en-IN")} bills at most.`,
        "too_many",
        409,
      );
    const fields = this.#billFields(input, null);
    this.#lock(fields.invoice_on);
  }

  /** A bill, with its copy when one came with it: one change, so one edit line. */
  addBill(input: Input, by: Staff, file: { file_id: string; title: string } | null = null): Bill {
    this.checkBill(input);
    const { tds_kind: kind, ...fields } = this.#billFields(input, null);
    const bill: Bill = {
      bill_id: this.#id("bill"),
      ...fields,
      tds: { kind, deducted_minor: null, deducted_on: null, challan: null },
      approved: null,
      payments: [],
      file_id: file?.file_id ?? null,
      cancelled: null,
      ...this.#stamp(by),
    };
    this.#commit({
      record: "bill",
      id: bill.bill_id,
      verb: "added",
      changes: [
        ...changesOf({}, this.printBill(bill)),
        ...(file ? [{ field: "The invoice", before: "", after: file.title }] : []),
      ],
      by,
      apply: () => this.bills.push(bill),
    });
    return bill;
  }

  #open(bill: Bill): void {
    if (bill.cancelled) refuse("This bill is cancelled.", "cancelled", 409);
  }

  updateBill(bill: Bill, input: Input, by: Staff): Bill {
    this.#open(bill);
    this.#lock(bill.invoice_on);
    const { tds_kind: kind, ...fields } = this.#billFields(input, bill);
    this.#lock(fields.invoice_on);
    const next: Bill = {
      ...bill,
      ...fields,
      tds: { ...bill.tds, kind },
      updated_at: this.#core.now(),
      updated_by: by,
    };
    this.#commit({
      record: "bill",
      id: bill.bill_id,
      verb: "changed",
      changes: changesOf(this.printBill(bill), this.printBill(next)),
      by,
      apply: () => Object.assign(bill, next),
    });
    return bill;
  }

  approve(bill: Bill, by: Staff): Bill {
    this.#open(bill);
    this.#lock(bill.invoice_on);
    const approved = { by_name: by.name, on: this.#ask.today() };
    this.#commit({
      record: "bill",
      id: bill.bill_id,
      verb: "approved",
      changes: [
        {
          field: "Approved",
          before: bill.approved ? `${bill.approved.by_name}, ${dayWords(bill.approved.on)}` : "",
          after: `${approved.by_name}, ${dayWords(approved.on)}`,
        },
      ],
      by,
      apply: () => {
        bill.approved = approved;
        bill.updated_at = this.#core.now();
        bill.updated_by = by;
      },
    });
    return bill;
  }

  /** What was deducted and when (spec §8.3): at most the amount before GST. */
  deduct(bill: Bill, input: Input, by: Staff): Bill {
    this.#open(bill);
    const today = this.#ask.today();
    const amount = amountOf(input.deducted);
    const on = dayOf(input.deducted_on);
    let kind = bill.tds.kind;
    if (has(input, "kind") && !blank(input.kind)) {
      if (!isTdsKind(input.kind)) refuse(SAY.choose);
      kind = input.kind as TdsKind;
    }
    if (amount === null) {
      if (bill.tds.challan)
        refuse("A challan is recorded against this deduction.", "challan_recorded", 409);
    } else {
      if (!on) refuse("Give the day it was deducted.");
      if (on! > today) refuse(SAY.future);
      if (amount > bill.taxable_minor)
        refuse(
          `The tax deducted cannot be more than the amount before GST, ${minorWords(bill.taxable_minor, bill.currency)}.`,
        );
    }
    this.#lock(bill.tds.deducted_on);
    this.#lock(amount === null ? null : on);
    const printed = (minor: number | null, day: string | null, kindNow: TdsKind | "") => ({
      "Tax deducted: kind": kindNow ? TDS_KINDS[kindNow] : "",
      "Tax deducted": minor === null ? "" : minorWords(minor, bill.currency),
      "Deducted on": dayWords(day),
    });
    this.#commit({
      record: "bill",
      id: bill.bill_id,
      verb: "tax deducted",
      changes: changesOf(
        printed(bill.tds.deducted_minor, bill.tds.deducted_on, bill.tds.kind),
        printed(amount, amount === null ? null : on, kind),
      ),
      by,
      apply: () => {
        bill.tds.kind = kind;
        bill.tds.deducted_minor = amount;
        bill.tds.deducted_on = amount === null ? null : on;
        bill.updated_at = this.#core.now();
        bill.updated_by = by;
      },
    });
    return bill;
  }

  /** Checks a challan before its copy goes into Files. */
  checkChallan(bill: Bill, input: Input): void {
    this.#open(bill);
    if (bill.tds.deducted_minor === null)
      refuse("Record what was deducted first.", "no_deduction", 409);
    const number = refOf(input.number, L.challan_number);
    if (!number) refuse("Give the challan number.");
    const bsr = refOf(input.bsr, L.bsr);
    if (bsr && !/^\d{7}$/.test(bsr)) refuse("A BSR code is seven digits.");
    const on = dayOf(input.deposited_on);
    if (!on) refuse("Give the day it was deposited.");
    if (on! > this.#ask.today()) refuse(SAY.future);
    this.#lock(bill.tds.challan?.deposited_on);
    this.#lock(on);
  }

  challan(
    bill: Bill,
    input: Input,
    by: Staff,
    file: { file_id: string; title: string } | null,
  ): Bill {
    this.checkChallan(bill, input);
    const challan = {
      number: refOf(input.number, L.challan_number),
      bsr: refOf(input.bsr, L.bsr),
      deposited_on: dayOf(input.deposited_on)!,
      file_id: file?.file_id ?? bill.tds.challan?.file_id ?? null,
    };
    const printed = (value: Bill["tds"]["challan"], title: string) => ({
      "Challan number": value?.number ?? "",
      "BSR code": value?.bsr ?? "",
      "Deposited on": dayWords(value?.deposited_on),
      "The challan": value?.file_id ? title : "",
    });
    this.#commit({
      record: "bill",
      id: bill.bill_id,
      verb: "challan recorded",
      changes: changesOf(
        printed(bill.tds.challan, bill.tds.challan?.file_id ?? ""),
        printed(challan, file?.title ?? challan.file_id ?? ""),
      ),
      by,
      apply: () => {
        bill.tds.challan = challan;
        bill.updated_at = this.#core.now();
        bill.updated_by = by;
      },
    });
    return bill;
  }

  /** What the bill asks to be paid: the total less tax deducted. */
  static payable(bill: Bill): number {
    return bill.total_minor - (bill.tds.deducted_minor ?? 0);
  }

  static paid(bill: Bill): number {
    return bill.payments
      .filter((payment) => payment.taken_back === null)
      .reduce((sum, payment) => sum + payment.amount_minor, 0);
  }

  pay(
    bill: Bill,
    input: Input,
    by: Staff,
    fromLine: string | null = null,
  ): { bill: Bill; payment: Payment } {
    this.#open(bill);
    const today = this.#ask.today();
    const on = dayOf(input.paid_on);
    if (!on) refuse("Give the day it was paid.");
    if (on! > today) refuse(SAY.future);
    const amount = amountOf(input.amount);
    if (amount === null || amount < 1) refuse("Type the amount paid, such as 1180.50.");
    const method = blank(input.method) ? "bank" : input.method;
    if (!isKey(PAY_METHODS, method)) refuse(SAY.choose);
    let inr: number | null = null;
    let forex: number | null = null;
    if (bill.currency !== "INR") {
      inr = amountOf(input.inr);
      if (inr === null) refuse("Type the rupees that left the bank for this payment.");
      forex = amountOf(input.forex);
      if (forex !== null && forex > inr!)
        refuse("The exchange cost is more than the rupees that left the bank.");
    }
    this.#lock(on);
    const payment: Payment = {
      payment_id: randomUUID(),
      paid_on: on!,
      amount_minor: amount!,
      reference: refOf(input.reference, L.reference),
      method: method as Payment["method"],
      inr_minor: inr,
      forex_minor: forex,
      from_line: fromLine,
      taken_back: null,
      at: this.#core.now(),
      by,
    };
    this.#commit({
      record: "bill",
      id: bill.bill_id,
      verb: "paid",
      changes: [{ field: "Payment", before: "", after: this.printPayment(bill, payment) }],
      by,
      apply: () => {
        bill.payments.push(payment);
        bill.updated_at = this.#core.now();
        bill.updated_by = by;
      },
    });
    return { bill, payment };
  }

  takeBack(bill: Bill, paymentId: string | undefined, input: Input, by: Staff): Bill {
    const payment = bill.payments.find((item) => item.payment_id === paymentId);
    if (!payment) refuse("That payment is not here.", "not_found", 404);
    if (payment!.taken_back) refuse("That payment was taken back already.", "taken_back", 409);
    const why = wordsBetween(
      input.why,
      L.why.min,
      L.why.max,
      "Say why, in at least five characters.",
    );
    this.#lock(payment!.paid_on);
    const printed = this.printPayment(bill, payment!);
    this.#commit({
      record: "bill",
      id: bill.bill_id,
      verb: "payment taken back",
      changes: [{ field: "Payment", before: printed, after: `Taken back: ${why}` }],
      by,
      apply: () => {
        payment!.taken_back = { at: this.#core.now(), by, why };
        bill.updated_at = this.#core.now();
        bill.updated_by = by;
      },
    });
    return bill;
  }

  cancel(bill: Bill, input: Input, by: Staff): Bill {
    this.#open(bill);
    const why = wordsBetween(
      input.why,
      L.why.min,
      L.why.max,
      "Say why, in at least five characters.",
    );
    if (bill.payments.some((payment) => payment.taken_back === null))
      refuse("Take the payments back first.", "has_payments", 409);
    this.#lock(bill.invoice_on);
    const on = this.#ask.today();
    this.#commit({
      record: "bill",
      id: bill.bill_id,
      verb: "cancelled",
      changes: [{ field: "Cancelled", before: "", after: `${dayWords(on)}: ${why}` }],
      by,
      apply: () => {
        bill.cancelled = { on, why, at: this.#core.now(), by };
        bill.updated_at = this.#core.now();
        bill.updated_by = by;
      },
    });
    return bill;
  }

  checkBillFile(bill: Bill): void {
    this.#lock(bill.invoice_on);
  }

  attachBillFile(bill: Bill, file: { file_id: string; title: string }, by: Staff): Bill {
    this.checkBillFile(bill);
    const before = bill.file_id
      ? `${bill.file_id === file.file_id ? file.title : "Another file"}`
      : "";
    this.#commit({
      record: "bill",
      id: bill.bill_id,
      verb: "copy attached",
      changes:
        bill.file_id === file.file_id ? [] : [{ field: "The invoice", before, after: file.title }],
      by,
      apply: () => {
        bill.file_id = file.file_id;
        bill.updated_at = this.#core.now();
        bill.updated_by = by;
      },
    });
    return bill;
  }

  // ---------------------------------------------------------------- export invoices

  #exportFields(input: Input, base: ExportInvoice | null) {
    const today = this.#ask.today();
    const pick = (name: string) => has(input, name) || !base;
    const customer = pick("customer")
      ? wordsBetween(
          input.customer,
          L.customer.min,
          L.customer.max,
          "Give the customer's name, 2 to 200 characters.",
        )
      : base!.customer;
    const number = pick("invoice_number")
      ? refOf(input.invoice_number, L.invoice_number)
      : base!.invoice_number;
    if (!number) refuse("Give the invoice number, as the invoice shows it.");
    if (
      this.exports.some(
        (item) => item !== base && item.cancelled === null && same(item.invoice_number, number),
      )
    )
      refuse(`An export invoice numbered ${number} is already here.`, "taken", 409);
    const invoiceOn = pick("invoice_on") ? dayOf(input.invoice_on) : base!.invoice_on;
    if (!invoiceOn) refuse("Give the invoice day.");
    if (invoiceOn! > addDays(today, L.invoice_ahead_days))
      refuse("The invoice day is more than a week ahead.");
    const currency = pick("currency")
      ? blank(input.currency)
        ? "USD"
        : input.currency
      : base!.currency;
    if (!isDutyCurrency(currency)) refuse(SAY.choose);
    const amount = pick("amount") ? amountOf(input.amount) : base!.amount_minor;
    if (amount === null || amount < 1) refuse("Type the invoice's amount, such as 5000.");
    const treatment = pick("tax_treatment") ? (input.tax_treatment ?? "") : base!.tax_treatment;
    if (!isKey(TAX_TREATMENTS, treatment)) refuse(SAY.choose);
    const purpose = pick("purpose_code")
      ? clean(input.purpose_code, L.purpose_code).toUpperCase()
      : base!.purpose_code;
    if (purpose && !SHAPE.purpose.test(purpose)) refuse(SAY.purpose);
    const entry = pick("waitlist_entry_id")
      ? blank(input.waitlist_entry_id)
        ? null
        : isRouteId(input.waitlist_entry_id)
          ? input.waitlist_entry_id
          : refuse("That firm is not here.", "not_found", 404)
      : base!.waitlist_entry_id;
    return {
      customer,
      country: pick("country") ? cleanText(input.country, L.country) : base!.country,
      waitlist_entry_id: entry,
      invoice_number: number,
      invoice_on: invoiceOn!,
      currency: String(currency),
      amount_minor: amount!,
      tax_treatment: treatment as ExportInvoice["tax_treatment"],
      purpose_code: purpose,
      rail: pick("rail") ? cleanText(input.rail, L.rail) : base!.rail,
      notes: pick("notes") ? noteText(input.notes, L.notes) : base!.notes,
    };
  }

  checkExport(input: Input): void {
    if (this.exports.length >= MONEY_TOTALS.exports)
      refuse(
        `Data holds ${MONEY_TOTALS.exports.toLocaleString("en-IN")} export invoices at most.`,
        "too_many",
        409,
      );
    this.#lock(this.#exportFields(input, null).invoice_on);
  }

  /** An export invoice, with its copy when one came with it: one change, so one edit line. */
  addExport(
    input: Input,
    by: Staff,
    file: { file_id: string; title: string } | null = null,
  ): ExportInvoice {
    this.checkExport(input);
    const invoice: ExportInvoice = {
      invoice_id: this.#id("export"),
      ...this.#exportFields(input, null),
      edf: null,
      receipts: [],
      file_id: file?.file_id ?? null,
      cancelled: null,
      ...this.#stamp(by),
    };
    this.#commit({
      record: "export_invoice",
      id: invoice.invoice_id,
      verb: "added",
      changes: [
        ...changesOf({}, this.printExport(invoice)),
        ...(file ? [{ field: "The invoice", before: "", after: file.title }] : []),
      ],
      by,
      apply: () => this.exports.push(invoice),
    });
    return invoice;
  }

  #openExport(invoice: ExportInvoice): void {
    if (invoice.cancelled) refuse("This export invoice is cancelled.", "cancelled", 409);
  }

  updateExport(invoice: ExportInvoice, input: Input, by: Staff): ExportInvoice {
    this.#openExport(invoice);
    this.#lock(invoice.invoice_on);
    const fields = this.#exportFields(input, invoice);
    this.#lock(fields.invoice_on);
    if (
      fields.currency !== invoice.currency &&
      invoice.receipts.some((item) => item.taken_back === null)
    )
      refuse("Take the receipts back before changing the currency.", "has_receipts", 409);
    const next: ExportInvoice = {
      ...invoice,
      ...fields,
      updated_at: this.#core.now(),
      updated_by: by,
    };
    this.#commit({
      record: "export_invoice",
      id: invoice.invoice_id,
      verb: "changed",
      changes: changesOf(this.printExport(invoice), this.printExport(next)),
      by,
      apply: () => Object.assign(invoice, next),
    });
    return invoice;
  }

  edf(invoice: ExportInvoice, input: Input, by: Staff): ExportInvoice {
    this.#openExport(invoice);
    const on = dayOf(input.filed_on);
    if (!on) refuse("Give the day the EDF was filed.");
    if (on! > this.#ask.today()) refuse(SAY.future);
    this.#lock(invoice.invoice_on);
    const edf = { filed_on: on!, reference: refOf(input.reference, L.reference) };
    const words = (value: ExportInvoice["edf"]) =>
      value ? [dayWords(value.filed_on), value.reference].filter(Boolean).join(" · ") : "";
    this.#commit({
      record: "export_invoice",
      id: invoice.invoice_id,
      verb: "EDF recorded",
      changes: changesOf({ EDF: words(invoice.edf) }, { EDF: words(edf) }),
      by,
      apply: () => {
        invoice.edf = edf;
        invoice.updated_at = this.#core.now();
        invoice.updated_by = by;
      },
    });
    return invoice;
  }

  checkReceipt(invoice: ExportInvoice, input: Input): void {
    this.#openExport(invoice);
    const on = dayOf(input.received_on);
    if (!on) refuse("Give the day it reached the bank.");
    if (on! > this.#ask.today()) refuse(SAY.future);
    const amount = amountOf(input.amount);
    if (amount === null || amount < 1)
      refuse("Type the amount received, in the invoice's currency.");
    amountOf(input.inr);
    this.#lock(on);
  }

  receive(
    invoice: ExportInvoice,
    input: Input,
    by: Staff,
    file: { file_id: string; title: string } | null,
    fromLine: string | null = null,
  ): { invoice: ExportInvoice; receipt: Receipt } {
    this.checkReceipt(invoice, input);
    const amount = amountOf(input.amount)!;
    const receipt: Receipt = {
      receipt_id: randomUUID(),
      received_on: dayOf(input.received_on)!,
      amount_minor: amount,
      inr_minor: invoice.currency === "INR" ? amount : amountOf(input.inr),
      fira_number: refOf(input.fira_number, L.fira_number),
      fira_file_id: file?.file_id ?? null,
      ebrc_number: refOf(input.ebrc_number, L.ebrc_number),
      from_line: fromLine,
      taken_back: null,
      at: this.#core.now(),
      by,
    };
    this.#commit({
      record: "export_invoice",
      id: invoice.invoice_id,
      verb: "received",
      changes: [
        {
          field: "Receipt",
          before: "",
          after: `${this.printReceipt(invoice, receipt)}${file ? ` · FIRA copy ${file.title}` : ""}`,
        },
      ],
      by,
      apply: () => {
        invoice.receipts.push(receipt);
        invoice.updated_at = this.#core.now();
        invoice.updated_by = by;
      },
    });
    return { invoice, receipt };
  }

  receiptOf(invoice: ExportInvoice, receiptId: string | undefined): Receipt {
    const receipt = invoice.receipts.find((item) => item.receipt_id === receiptId);
    if (!receipt) refuse("That receipt is not here.", "not_found", 404);
    return receipt!;
  }

  checkReceiptUpdate(invoice: ExportInvoice, receipt: Receipt, input: Input): void {
    this.#openExport(invoice);
    if (receipt.taken_back) refuse("That receipt was taken back.", "taken_back", 409);
    if (has(input, "inr")) amountOf(input.inr);
    this.#lock(receipt.received_on);
  }

  updateReceipt(
    invoice: ExportInvoice,
    receipt: Receipt,
    input: Input,
    by: Staff,
    file: { file_id: string; title: string } | null,
  ): ExportInvoice {
    this.checkReceiptUpdate(invoice, receipt, input);
    const next: Receipt = {
      ...receipt,
      inr_minor:
        invoice.currency === "INR"
          ? receipt.amount_minor
          : has(input, "inr")
            ? amountOf(input.inr)
            : receipt.inr_minor,
      fira_number: has(input, "fira_number")
        ? refOf(input.fira_number, L.fira_number)
        : receipt.fira_number,
      ebrc_number: has(input, "ebrc_number")
        ? refOf(input.ebrc_number, L.ebrc_number)
        : receipt.ebrc_number,
      fira_file_id: file?.file_id ?? receipt.fira_file_id,
    };
    const before =
      this.printReceipt(invoice, receipt) + (receipt.fira_file_id ? " · FIRA copy" : "");
    const after = this.printReceipt(invoice, next) + (next.fira_file_id ? " · FIRA copy" : "");
    this.#commit({
      record: "export_invoice",
      id: invoice.invoice_id,
      verb: "receipt changed",
      changes: before === after ? [] : [{ field: "Receipt", before, after }],
      by,
      apply: () => {
        Object.assign(receipt, next);
        invoice.updated_at = this.#core.now();
        invoice.updated_by = by;
      },
    });
    return invoice;
  }

  takeBackReceipt(
    invoice: ExportInvoice,
    receiptId: string | undefined,
    input: Input,
    by: Staff,
  ): ExportInvoice {
    const receipt = this.receiptOf(invoice, receiptId);
    if (receipt.taken_back) refuse("That receipt was taken back already.", "taken_back", 409);
    const why = wordsBetween(
      input.why,
      L.why.min,
      L.why.max,
      "Say why, in at least five characters.",
    );
    this.#lock(receipt.received_on);
    this.#commit({
      record: "export_invoice",
      id: invoice.invoice_id,
      verb: "receipt taken back",
      changes: [
        {
          field: "Receipt",
          before: this.printReceipt(invoice, receipt),
          after: `Taken back: ${why}`,
        },
      ],
      by,
      apply: () => {
        receipt.taken_back = { at: this.#core.now(), by, why };
        invoice.updated_at = this.#core.now();
        invoice.updated_by = by;
      },
    });
    return invoice;
  }

  cancelExport(invoice: ExportInvoice, input: Input, by: Staff): ExportInvoice {
    this.#openExport(invoice);
    const why = wordsBetween(
      input.why,
      L.why.min,
      L.why.max,
      "Say why, in at least five characters.",
    );
    if (invoice.receipts.some((receipt) => receipt.taken_back === null))
      refuse("Take the receipts back first.", "has_receipts", 409);
    this.#lock(invoice.invoice_on);
    const on = this.#ask.today();
    this.#commit({
      record: "export_invoice",
      id: invoice.invoice_id,
      verb: "cancelled",
      changes: [{ field: "Cancelled", before: "", after: `${dayWords(on)}: ${why}` }],
      by,
      apply: () => {
        invoice.cancelled = { on, why, at: this.#core.now(), by };
        invoice.updated_at = this.#core.now();
        invoice.updated_by = by;
      },
    });
    return invoice;
  }

  checkExportFile(invoice: ExportInvoice): void {
    this.#lock(invoice.invoice_on);
  }

  attachExportFile(
    invoice: ExportInvoice,
    file: { file_id: string; title: string },
    by: Staff,
  ): ExportInvoice {
    this.checkExportFile(invoice);
    this.#commit({
      record: "export_invoice",
      id: invoice.invoice_id,
      verb: "copy attached",
      changes:
        invoice.file_id === file.file_id
          ? []
          : [
              {
                field: "The invoice",
                before: invoice.file_id ? "Another file" : "",
                after: file.title,
              },
            ],
      by,
      apply: () => {
        invoice.file_id = file.file_id;
        invoice.updated_at = this.#core.now();
        invoice.updated_by = by;
      },
    });
    return invoice;
  }

  // ---------------------------------------------------------------- LUTs

  checkLut(input: Input): void {
    const fy = clean(input.fy, 7);
    if (!SHAPE.fy.test(fy) || (Number(fy.slice(0, 4)) + 1) % 100 !== Number(fy.slice(5, 7)))
      refuse("Type the financial year as 2026-27.");
    if (this.setup.luts.some((lut) => lut.fy === fy))
      refuse(`An LUT for ${fy} is already recorded.`, "taken", 409);
    if (!refOf(input.arn, L.arn)) refuse("Give the LUT's ARN.");
    const on = dayOf(input.filed_on);
    if (!on) refuse("Give the day it was filed.");
    if (on! > this.#ask.today()) refuse(SAY.future);
  }

  addLut(input: Input, by: Staff, file: { file_id: string; title: string } | null): Lut {
    this.checkLut(input);
    const lut: Lut = {
      fy: clean(input.fy, 7),
      arn: refOf(input.arn, L.arn),
      filed_on: dayOf(input.filed_on)!,
      file_id: file?.file_id ?? null,
    };
    this.#commit({
      record: "setup",
      id: `lut-${lut.fy}`,
      verb: "LUT recorded",
      changes: [
        {
          field: `LUT ${lut.fy}`,
          before: "",
          after: [lut.arn, `filed ${dayWords(lut.filed_on)}`, file ? `copy ${file.title}` : ""]
            .filter(Boolean)
            .join(" · "),
        },
      ],
      by,
      apply: () => {
        this.setup.luts.push(lut);
        this.setup.luts.sort((a, b) => a.fy.localeCompare(b.fy));
      },
    });
    return lut;
  }
}
