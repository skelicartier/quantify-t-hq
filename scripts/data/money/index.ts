/**
 * Money records (ws-notes/duties/spec.md §8): the ledger map (categories), vendors with the
 * foreign-vendor treatment, bills with tax deducted and the MSME pay-by day, export invoices
 * with the LUT, the EDF, each receipt and its FIRA, the hash-chained edit log and the file
 * hold. HQ is not the books: it records what a bill says, what was deducted and what was
 * paid; it works out a pay-by day and a year-to-date sentence; it prints what a rate comes to
 * as a hint beside "Your CA decides". It never posts a ledger entry, never files and never
 * pays: no route here calls the engine or sends anything.
 *
 * Provides `money` (the contract's `MoneyLookup`: Files' "Used for" and the hold, the
 * statements' matching and the month's pack, the cash view), `agenda:money`, `search:money`,
 * Due rows of kinds "bill" and "export", the overview block `money` and four CSVs for the CA
 * as builds. Needs `duty-rules`, `month-lock`, `files` and `contacts`, each optional.
 */

import { writeFileSync } from "node:fs";

import { Refused } from "../../mail-merge/engine";
import type { Answer, DataCore, DueItem } from "../core";
import { addDays } from "../days";
import {
  DUTIES_SERVICES,
  dutyRuleOf,
  periodOf,
  standInDutyRules,
  standInMonthLock,
  type DutyRuleKey,
  type DutyRulesService,
  type DutyStored,
  type FileHold,
  type MoneyLookup,
  type MonthLock,
  type PackFile,
} from "../duties-contracts";
import { clean, cleanText, isRouteId } from "../guard";
import type { Staff } from "../protocol";
import {
  RAISE_SERVICES,
  agendaService,
  searchService,
  type AgendaItem,
  type AgendaSource,
  type ContactsLookup,
  type SearchSource,
} from "../raise-contracts";
import { toCsv } from "../text";
import { findTerms, matchesTerms } from "../../../src/lib/merge/find";
import { dayWords } from "../../../src/lib/data/labels-company";
import { fyWords, minorInput, minorWords, periodWords } from "../../../src/lib/data/labels-duties";
import {
  BILL_VIEWS,
  CATEGORY_KINDS,
  RESIDENCIES,
  TDS_KINDS,
  UDYAM_CLASSES,
  formsWords,
  type BillView as BillViewKey,
} from "../../../src/lib/data/labels-money";
import { checkCopy, copyGiven, fileChoices, fileLink, keepCopy } from "../meetings/copy";
import { MoneyBook } from "./book";
import { live } from "./exports";
import { holdIndex, holdOf, type Held } from "./holds";
import { AHEAD, MONEY_LIMITS, WALK_IDS } from "./limits";
import { TDS_TABLE } from "./tds";
import type { Bill, ExportInvoice } from "./types";
import { MoneyViews, billHref, exportHref, vendorHref, type Here } from "./views";
import { walkRules } from "./walk-seed";

const BOM = "﻿";
type Body = Record<string, unknown>;

const sum = (into: Record<string, number>, currency: string, minor: number) => {
  into[currency] = (into[currency] ?? 0) + minor;
};

export async function register(core: DataCore): Promise<void> {
  const rulesService = () => core.need<DutyRulesService>(DUTIES_SERVICES.dutyRules);
  const lockService = () => core.need<MonthLock>(DUTIES_SERVICES.monthLock);

  /** Another module asked, never trusted to be there or to answer. */
  function safely<T>(ask: () => T): T | null {
    try {
      return ask();
    } catch (error) {
      core.log(`money: a lookup failed: ${error instanceof Error ? error.name : "error"}`);
      return null;
    }
  }

  const rules = (key: DutyRuleKey) => {
    const service = rulesService();
    return service ? safely(() => service.state(key)) : null;
  };
  const isLocked = (period: string) => {
    const lock = lockService();
    return lock ? (safely(() => lock.isLocked(period)) ?? false) : false;
  };

  const book = new MoneyBook(core, {
    today: () => core.day(),
    locked: (period) => {
      const lock = lockService();
      if (!lock || !isLocked(period)) return null;
      return safely(() => lock.refusal(period)) ?? `${periodWords(period)} is locked.`;
    },
    contact: (contactId) => {
      const contacts = core.need<ContactsLookup>(RAISE_SERVICES.contacts);
      if (!contacts) return undefined;
      return safely(() => contacts.get(contactId)?.name ?? null) ?? null;
    },
  });
  const views = new MoneyViews(core, book, rules, isLocked);

  // ---------------------------------------------------------------- the file hold

  let held = new Map<string, Held>();
  const rebuild = () => {
    held = holdIndex({
      bills: book.bills,
      exports: book.exports,
      vendorName: (id) => book.vendorName(id),
    });
  };
  rebuild();
  book.onSave = rebuild;
  /** His amount when the rule book is here; the rule's own (8) otherwise: a hold never lapses because a module is absent. */
  const keepYears = () =>
    rules("voucher-retention")?.amount ?? dutyRuleOf("voucher-retention").amount ?? 8;
  const heldUntil = (fileId: string): FileHold | null => holdOf(held, fileId, keepYears());

  const here = (): Here => ({
    rules: rulesService() !== null,
    lock: lockService() !== null,
    holidays: core.need(DUTIES_SERVICES.holidays) !== null,
  });
  const filesHere = () => core.need("files") !== null;

  // ---------------------------------------------------------------- copies in Files

  const folderFor = (
    kind: "bills" | "challans" | "exports" | "firas" | "vendors" | "luts",
    day?: string,
  ) => {
    const fy = day ? fyWords(day) : "";
    if (kind === "bills") return ["Money", "Bills", fy];
    if (kind === "challans") return ["Money", "TDS challans", fy];
    if (kind === "exports") return ["Money", "Export invoices", fy];
    if (kind === "firas") return ["Money", "FIRAs", fy];
    if (kind === "luts") return ["Money", "LUTs"];
    return ["Money", "Vendors"];
  };

  async function copyOf(
    body: Body,
    place: { folder: string[]; title: string; note: string },
    by: Staff,
  ): Promise<{ file_id: string; title: string } | null> {
    if (!copyGiven(body)) return null;
    const file = await keepCopy(core, body, place, by);
    return { file_id: file.file_id, title: file.title };
  }

  // ---------------------------------------------------------------- reading

  const billDetail = (bill: Bill): Answer => {
    const worked = views.worked(bill);
    const vendor = book.vendors.find((item) => item.vendor_id === bill.vendor_id) ?? null;
    return {
      bill: {
        ...bill,
        vendor_name: book.vendorName(bill.vendor_id),
        category_name: book.categoryName(bill.category_id),
        ...worked,
        held_until: bill.file_id ? (heldUntil(bill.file_id)?.until ?? null) : null,
        locked: views.locked(bill.invoice_on),
        file: fileLink(core, bill.file_id),
        challan_file: fileLink(core, bill.tds.challan?.file_id ?? null),
        edits: book.log.of("bill", bill.bill_id),
      },
      vendor: vendor
        ? {
            vendor_id: vendor.vendor_id,
            name: vendor.name,
            residency: vendor.residency,
            udyam_class: vendor.udyam.class,
            tds_kind: vendor.tds_kind,
            retired: vendor.retired,
            decision: vendor.foreign.decision,
          }
        : null,
      lock_words: views.locked(bill.invoice_on)
        ? (lockService()?.refusal(periodOf(bill.invoice_on)) ?? "")
        : "",
      vendors: vendorOptions(),
      categories: categoryOptions(bill.category_id),
      files: fileChoices(core),
      files_here: filesHere(),
      here: here(),
      events: book.eventsOf("bill", bill.bill_id),
      today: core.day(),
    };
  };

  const vendorOptions = () =>
    book.vendors
      .map((vendor) => ({
        vendor_id: vendor.vendor_id,
        name: vendor.name,
        tds_kind: vendor.tds_kind,
        residency: vendor.residency,
        retired: vendor.retired,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

  const categoryOptions = (keep: string | null = null) =>
    book.categories
      .filter((item) => !item.retired || item.category_id === keep)
      .map((item) => ({ category_id: item.category_id, name: item.name, kind: item.kind }))
      .sort((a, b) => a.name.localeCompare(b.name));

  const yearsOf = (days: readonly string[], today: string) =>
    [...new Set([fyWords(today), ...days.map(fyWords)])].sort((a, b) => b.localeCompare(a));

  const billsShown = (query: URLSearchParams) => {
    const askedView = clean(query.get("view"), 12);
    const view: BillViewKey = askedView in BILL_VIEWS ? (askedView as BillViewKey) : "open";
    const vendorId = clean(query.get("vendor"), 64);
    const fy = clean(query.get("fy"), 7);
    const filtered = book.bills.filter(
      (bill) =>
        (!vendorId || bill.vendor_id === vendorId) && (!fy || fyWords(bill.invoice_on) === fy),
    );
    const rows = filtered.map((bill) => views.billRow(bill));
    const counts = { open: 0, paid: 0, all: 0, cancelled: 0 };
    const open: Record<string, number> = {};
    let openBills = 0;
    for (const row of rows) {
      if (row.state === "cancelled") {
        counts.cancelled += 1;
        continue;
      }
      counts.all += 1;
      if (row.state === "paid" || row.state === "paid_late") counts.paid += 1;
      else counts.open += 1;
      if (row.open_minor > 0) {
        sum(open, row.currency, row.open_minor);
        openBills += 1;
      }
    }
    const shown = rows
      .filter((row) =>
        view === "all"
          ? row.state !== "cancelled"
          : view === "cancelled"
            ? row.state === "cancelled"
            : view === "paid"
              ? row.state === "paid" || row.state === "paid_late"
              : row.state === "open" || row.state === "part_paid",
      )
      .sort((a, b) =>
        view === "open"
          ? (a.pay_by ?? "9999").localeCompare(b.pay_by ?? "9999") ||
            a.invoice_on.localeCompare(b.invoice_on)
          : b.invoice_on.localeCompare(a.invoice_on) || a.vendor_name.localeCompare(b.vendor_name),
      );
    const shownTotals: Record<string, number> = {};
    for (const row of shown) sum(shownTotals, row.currency, row.total_minor);
    return { view, vendorId, fy, shown, counts, open, openBills, shownTotals };
  };

  // ---------------------------------------------------------------- routes: bills

  core.route("GET", "/data/money", (ctx) => {
    const today = core.day();
    const asked = billsShown(ctx.query);
    return {
      bills: asked.shown,
      totals: { open: asked.open, shown: asked.shownTotals },
      open_bills: asked.openBills,
      counts: asked.counts,
      view: asked.view,
      vendor: asked.vendorId,
      fy: asked.fy,
      years: yearsOf(
        book.bills.map((bill) => bill.invoice_on),
        today,
      ),
      vendors: vendorOptions(),
      categories: categoryOptions(),
      files: fileChoices(core),
      files_here: filesHere(),
      here: here(),
      today,
    };
  });

  core.route("POST", "/data/money/bills", async (ctx) => {
    const by = ctx.staff();
    // Everything is checked before the copy goes into Files; the bill and its copy are one change.
    let file: { file_id: string; title: string } | null = null;
    if (copyGiven(ctx.body)) {
      book.checkBill(ctx.body);
      checkCopy(core, ctx.body);
      file = await copyOf(
        ctx.body,
        {
          folder: folderFor("bills", String(ctx.body.invoice_on)),
          title: `${book.vendorName(String(ctx.body.vendor_id))} ${clean(ctx.body.invoice_number, MONEY_LIMITS.invoice_number)}`,
          note: "The invoice for a bill, in Money",
        },
        by,
      );
    }
    return billDetail(book.addBill(ctx.body, by, file));
  });

  core.route("GET", "/data/money/bills/:id", (ctx) => billDetail(book.bill(ctx.params[0])));

  core.route("POST", "/data/money/bills/:id/update", (ctx) => {
    const by = ctx.staff();
    return billDetail(book.updateBill(book.bill(ctx.params[0]), ctx.body, by));
  });

  core.route("POST", "/data/money/bills/:id/approve", (ctx) => {
    const by = ctx.staff();
    return billDetail(book.approve(book.bill(ctx.params[0]), by));
  });

  core.route("POST", "/data/money/bills/:id/tds", (ctx) => {
    const by = ctx.staff();
    return billDetail(book.deduct(book.bill(ctx.params[0]), ctx.body, by));
  });

  core.route("POST", "/data/money/bills/:id/challan", async (ctx) => {
    const by = ctx.staff();
    const bill = book.bill(ctx.params[0]);
    book.checkChallan(bill, ctx.body);
    if (copyGiven(ctx.body)) checkCopy(core, ctx.body);
    const file = await copyOf(
      ctx.body,
      {
        folder: folderFor("challans", String(ctx.body.deposited_on)),
        title: `TDS challan ${clean(ctx.body.number, MONEY_LIMITS.challan_number)} – ${book.vendorName(bill.vendor_id)}`,
        note: "A TDS challan, in Money",
      },
      by,
    );
    return billDetail(book.challan(bill, ctx.body, by, file));
  });

  core.route("POST", "/data/money/bills/:id/payments", (ctx) => {
    const by = ctx.staff();
    return billDetail(book.pay(book.bill(ctx.params[0]), ctx.body, by).bill);
  });

  core.route("POST", "/data/money/bills/:id/payments/:paymentId/take-back", (ctx) => {
    const by = ctx.staff();
    return billDetail(book.takeBack(book.bill(ctx.params[0]), ctx.params[1], ctx.body, by));
  });

  core.route("POST", "/data/money/bills/:id/cancel", (ctx) => {
    const by = ctx.staff();
    return billDetail(book.cancel(book.bill(ctx.params[0]), ctx.body, by));
  });

  core.route("POST", "/data/money/bills/:id/file", async (ctx) => {
    const by = ctx.staff();
    const bill = book.bill(ctx.params[0]);
    book.checkBillFile(bill);
    checkCopy(core, ctx.body);
    const file = await copyOf(
      ctx.body,
      {
        folder: folderFor("bills", bill.invoice_on),
        title: `${book.vendorName(bill.vendor_id)} ${bill.invoice_number}`,
        note: "The invoice for a bill, in Money",
      },
      by,
    );
    if (!file) throw new Refused(400, "empty", "Choose the copy first.");
    return billDetail(book.attachBillFile(bill, file, by));
  });

  // ---------------------------------------------------------------- routes: vendors

  core.route("GET", "/data/money/vendors", () => {
    const today = core.day();
    return {
      vendors: [...book.vendors]
        .sort((a, b) => Number(a.retired) - Number(b.retired) || a.name.localeCompare(b.name))
        .map((vendor) => views.vendorRow(vendor, today)),
      fy: fyWords(today),
      categories: categoryOptions(),
      here: here(),
      today,
    };
  });

  const vendorDetail = (vendorId: string | undefined): Answer => {
    const vendor = book.vendor(vendorId);
    const today = core.day();
    const contacts = core.need<ContactsLookup>(RAISE_SERVICES.contacts);
    const contact =
      vendor.contact_id && contacts ? safely(() => contacts.get(vendor.contact_id!)) : null;
    return {
      vendor,
      years: views.vendorYears(vendor),
      forms: views.forms(),
      checks: views.vendorChecks(vendor),
      bills: book.bills
        .filter((bill) => bill.vendor_id === vendor.vendor_id)
        .sort((a, b) => b.invoice_on.localeCompare(a.invoice_on))
        .map((bill) => views.billRow(bill)),
      decision_file: fileLink(core, vendor.foreign.decision?.file_id ?? null),
      contact: contact ? { contact_id: contact.contact_id, name: contact.name } : null,
      categories: categoryOptions(vendor.default_category_id),
      category_name: book.categoryName(vendor.default_category_id),
      files: fileChoices(core),
      files_here: filesHere(),
      here: here(),
      events: book.eventsOf("vendor", vendor.vendor_id),
      edits: book.log.of("vendor", vendor.vendor_id),
      today,
    };
  };

  core.route("POST", "/data/money/vendors", (ctx) => {
    const by = ctx.staff();
    return vendorDetail(book.addVendor(ctx.body, by).vendor_id);
  });
  core.route("GET", "/data/money/vendors/:id", (ctx) => vendorDetail(ctx.params[0]));
  core.route("POST", "/data/money/vendors/:id/update", (ctx) => {
    const by = ctx.staff();
    return vendorDetail(book.updateVendor(book.vendor(ctx.params[0]), ctx.body, by).vendor_id);
  });
  core.route("POST", "/data/money/vendors/:id/foreign", async (ctx) => {
    const by = ctx.staff();
    const vendor = book.vendor(ctx.params[0]);
    if (copyGiven(ctx.body)) checkCopy(core, ctx.body);
    // The fields are checked before the note goes into Files: a refused decision keeps nothing.
    book.checkForeign(vendor, ctx.body, by);
    const file = await copyOf(
      ctx.body,
      {
        folder: folderFor("vendors"),
        title: `${vendor.name} – the CA's decision`,
        note: "The CA's decision on paying a vendor abroad, in Money",
      },
      by,
    );
    return vendorDetail(book.foreign(vendor, ctx.body, by, file?.file_id ?? null).vendor_id);
  });
  core.route("POST", "/data/money/vendors/:id/retire", (ctx) => {
    const by = ctx.staff();
    return vendorDetail(book.retireVendor(book.vendor(ctx.params[0]), by).vendor_id);
  });

  // ---------------------------------------------------------------- routes: the ledger map

  const ledger = (): Answer => {
    const counts = views.ledgerChecks();
    return {
      categories: [...book.categories]
        .sort(
          (a, b) =>
            Number(a.retired) - Number(b.retired) ||
            Object.keys(CATEGORY_KINDS).indexOf(a.kind) -
              Object.keys(CATEGORY_KINDS).indexOf(b.kind) ||
            a.name.localeCompare(b.name),
        )
        .map((category) => ({
          ...views.categoryView(category),
          note: category.note,
          in_use: views.inUse(category),
        })),
      line: counts.line,
      mapped: counts.mapped,
      live: counts.live,
      checks: counts.checks,
      map_checked: book.setup.map_checked,
      here: here(),
      today: core.day(),
    };
  };

  core.route("GET", "/data/money/ledger", () => ledger());
  core.route("POST", "/data/money/categories/starter", (ctx) => {
    const by = ctx.staff();
    const { added } = book.addStarter(by);
    return { ...ledger(), added };
  });
  core.route("POST", "/data/money/categories", (ctx) => {
    const by = ctx.staff();
    const category = book.addCategory(ctx.body, by);
    return { ...ledger(), category: views.categoryView(category) };
  });
  core.route("POST", "/data/money/categories/:id/update", (ctx) => {
    const by = ctx.staff();
    book.updateCategory(book.category(ctx.params[0]), ctx.body, by);
    return ledger();
  });
  core.route("POST", "/data/money/categories/:id/retire", (ctx) => {
    const by = ctx.staff();
    book.retireCategory(book.category(ctx.params[0]), by);
    return ledger();
  });
  core.route("POST", "/data/money/ledger/checked", (ctx) => {
    const by = ctx.staff();
    book.mapChecked(ctx.body, by);
    return ledger();
  });

  // ---------------------------------------------------------------- routes: export invoices

  const exportDetail = (invoice: ExportInvoice): Answer => {
    const worked = views.exportWorked(invoice, book.setup.luts);
    return {
      invoice: {
        ...invoice,
        ...worked,
        receipts: views.receiptRows(invoice),
        held_until: invoice.file_id ? (heldUntil(invoice.file_id)?.until ?? null) : null,
        locked: views.locked(invoice.invoice_on),
        file: fileLink(core, invoice.file_id),
        edits: book.log.of("export_invoice", invoice.invoice_id),
      },
      lock_words: views.locked(invoice.invoice_on)
        ? (lockService()?.refusal(periodOf(invoice.invoice_on)) ?? "")
        : "",
      lut: book.setup.luts.find((lut) => lut.fy === fyWords(invoice.invoice_on)) ?? null,
      files: fileChoices(core),
      files_here: filesHere(),
      here: here(),
      events: book.eventsOf("export_invoice", invoice.invoice_id),
      today: core.day(),
    };
  };

  core.route("GET", "/data/money/exports", () => {
    const today = core.day();
    const rows = [...book.exports]
      .sort(
        (a, b) =>
          Number(a.cancelled !== null) - Number(b.cancelled !== null) ||
          b.invoice_on.localeCompare(a.invoice_on),
      )
      .map((invoice) => views.exportRow(invoice));
    const invoiced: Record<string, number> = {};
    const toRealise: Record<string, number> = {};
    for (const row of rows) {
      if (row.cancelled) continue;
      sum(invoiced, row.currency, row.amount_minor);
      const left = row.amount_minor - row.realised.minor;
      if (left > 0) sum(toRealise, row.currency, left);
    }
    return {
      invoices: rows,
      totals: { invoiced, to_realise: toRealise },
      luts: book.setup.luts.map((lut) => ({ ...lut, file: fileLink(core, lut.file_id) })),
      years: yearsOf(
        book.exports.map((invoice) => invoice.invoice_on),
        today,
      ),
      files: fileChoices(core),
      files_here: filesHere(),
      here: here(),
      today,
    };
  });

  core.route("POST", "/data/money/luts", async (ctx) => {
    const by = ctx.staff();
    book.checkLut(ctx.body);
    if (copyGiven(ctx.body)) checkCopy(core, ctx.body);
    const file = await copyOf(
      ctx.body,
      {
        folder: folderFor("luts"),
        title: `LUT ${clean(ctx.body.fy, 7)}`,
        note: "A letter of undertaking, in Money",
      },
      by,
    );
    const lut = book.addLut(ctx.body, by, file);
    return { lut: { ...lut, file: fileLink(core, lut.file_id) } };
  });

  core.route("POST", "/data/money/exports", async (ctx) => {
    const by = ctx.staff();
    let file: { file_id: string; title: string } | null = null;
    if (copyGiven(ctx.body)) {
      book.checkExport(ctx.body);
      checkCopy(core, ctx.body);
      file = await copyOf(
        ctx.body,
        {
          folder: folderFor("exports", String(ctx.body.invoice_on)),
          title: `${cleanText(ctx.body.customer, 200)} ${clean(ctx.body.invoice_number, MONEY_LIMITS.invoice_number)}`,
          note: "An export invoice, in Money",
        },
        by,
      );
    }
    return exportDetail(book.addExport(ctx.body, by, file));
  });

  core.route("GET", "/data/money/exports/:id", (ctx) =>
    exportDetail(book.exportInvoice(ctx.params[0])),
  );
  core.route("POST", "/data/money/exports/:id/update", (ctx) => {
    const by = ctx.staff();
    return exportDetail(book.updateExport(book.exportInvoice(ctx.params[0]), ctx.body, by));
  });
  core.route("POST", "/data/money/exports/:id/edf", (ctx) => {
    const by = ctx.staff();
    return exportDetail(book.edf(book.exportInvoice(ctx.params[0]), ctx.body, by));
  });
  const firaFolder = (invoice: ExportInvoice, day: unknown) => ({
    folder: folderFor("firas", typeof day === "string" && day ? day : invoice.invoice_on),
    title: `FIRA ${clean(day, 10)} – ${invoice.customer}`,
    note: "A FIRA for an export invoice, in Money",
  });
  core.route("POST", "/data/money/exports/:id/receipts", async (ctx) => {
    const by = ctx.staff();
    const invoice = book.exportInvoice(ctx.params[0]);
    book.checkReceipt(invoice, ctx.body);
    if (copyGiven(ctx.body)) checkCopy(core, ctx.body);
    const file = await copyOf(ctx.body, firaFolder(invoice, ctx.body.received_on), by);
    return exportDetail(book.receive(invoice, ctx.body, by, file).invoice);
  });
  core.route("POST", "/data/money/exports/:id/receipts/:receiptId/update", async (ctx) => {
    const by = ctx.staff();
    const invoice = book.exportInvoice(ctx.params[0]);
    const receipt = book.receiptOf(invoice, ctx.params[1]);
    book.checkReceiptUpdate(invoice, receipt, ctx.body);
    if (copyGiven(ctx.body)) checkCopy(core, ctx.body);
    const file = await copyOf(ctx.body, firaFolder(invoice, receipt.received_on), by);
    return exportDetail(book.updateReceipt(invoice, receipt, ctx.body, by, file));
  });
  core.route("POST", "/data/money/exports/:id/receipts/:receiptId/take-back", (ctx) => {
    const by = ctx.staff();
    return exportDetail(
      book.takeBackReceipt(book.exportInvoice(ctx.params[0]), ctx.params[1], ctx.body, by),
    );
  });
  core.route("POST", "/data/money/exports/:id/cancel", (ctx) => {
    const by = ctx.staff();
    return exportDetail(book.cancelExport(book.exportInvoice(ctx.params[0]), ctx.body, by));
  });
  core.route("POST", "/data/money/exports/:id/file", async (ctx) => {
    const by = ctx.staff();
    const invoice = book.exportInvoice(ctx.params[0]);
    book.checkExportFile(invoice);
    checkCopy(core, ctx.body);
    const file = await copyOf(
      ctx.body,
      {
        folder: folderFor("exports", invoice.invoice_on),
        title: `${invoice.customer} ${invoice.invoice_number}`,
        note: "An export invoice, in Money",
      },
      by,
    );
    if (!file) throw new Refused(400, "empty", "Choose the copy first.");
    return exportDetail(book.attachExportFile(invoice, file, by));
  });

  // ---------------------------------------------------------------- routes: the edit log

  // `ok` is the envelope's word (every answer is `{ ok: true, … }`), so the chain's own is `intact`.
  core.route("GET", "/data/money/edits/verify", () => {
    const verified = book.log.verify();
    return {
      intact: verified.ok,
      lines: verified.lines,
      broken_at: verified.broken_at,
      ahead: book.ahead,
    };
  });
  core.route("GET", "/data/money/edits", (ctx) => {
    const record = clean(ctx.query.get("record"), 20);
    const id = clean(ctx.query.get("id"), 64);
    const lines = book.log.lines.filter(
      (line) => (!record || line.record === record) && (!id || line.id === id),
    );
    return { edits: lines.slice(-2_000), total: lines.length, ahead: book.ahead };
  });

  // ---------------------------------------------------------------- Due, the agenda, search

  type Mark = {
    key: string;
    kind: "bill" | "export";
    title: string;
    sub: string;
    on: string;
    ahead: number;
    href: string;
    plain: string | null;
    remind: number[];
  };

  function marks(): Mark[] {
    const out: Mark[] = [];
    for (const bill of book.bills) {
      if (bill.cancelled) continue;
      const worked = views.worked(bill);
      const vendor = book.vendorName(bill.vendor_id);
      if (worked.pay_by && worked.open_minor > 0) {
        const msme = worked.msme?.pay_by ? worked.msme : null;
        const how = msme
          ? `${book.vendors.find((item) => item.vendor_id === bill.vendor_id)?.udyam.class === "small" ? "small" : "micro"} supplier, ${msme.short.replace(/[()]/g, "")}`
          : "pay-by you set";
        out.push({
          key: `bill:${bill.bill_id}:pay`,
          kind: "bill",
          title: `Pay ${vendor}: ${bill.invoice_number}`,
          sub: `${minorWords(worked.open_minor, bill.currency)} · ${how}`,
          on: worked.pay_by,
          ahead: AHEAD.pay,
          href: billHref(bill.bill_id),
          plain: "Bill to pay",
          remind: [3, 0],
        });
      }
      if (worked.deposit && !bill.tds.challan && bill.tds.deducted_minor && bill.tds.deducted_on)
        out.push({
          key: `bill:${bill.bill_id}:deposit`,
          kind: "bill",
          title: `Deposit the tax deducted from ${vendor}'s bill`,
          sub: `${minorWords(bill.tds.deducted_minor, bill.currency)} · deducted ${dayWords(bill.tds.deducted_on)}`,
          on: worked.deposit.by,
          ahead: AHEAD.deposit,
          href: billHref(bill.bill_id),
          plain: null,
          remind: [],
        });
    }
    const edfMonths = new Map<string, string>();
    for (const invoice of book.exports) {
      if (invoice.cancelled) continue;
      const worked = views.exportWorked(invoice, book.setup.luts);
      if (!invoice.edf && worked.edf_by) {
        const period = periodOf(invoice.invoice_on);
        if (!edfMonths.has(period)) edfMonths.set(period, worked.edf_by);
      }
      if (worked.realise_by && worked.realised.in_full_on === null) {
        const left = invoice.amount_minor - worked.realised.minor;
        out.push({
          key: `export:${invoice.invoice_id}:realise`,
          kind: "export",
          title: `Bring home ${minorWords(left, invoice.currency)} from ${invoice.customer}`,
          sub: `${invoice.invoice_number} · invoiced ${dayWords(invoice.invoice_on)}`,
          on: worked.realise_by,
          ahead: AHEAD.realise,
          href: exportHref(invoice.invoice_id),
          plain: "Export paperwork",
          remind: [7, 0],
        });
      }
      for (const receipt of live(invoice.receipts))
        if (!receipt.fira_number)
          out.push({
            key: `export:${invoice.invoice_id}:fira:${receipt.receipt_id}`,
            kind: "export",
            title: `Get the FIRA for ${invoice.customer}'s receipt of ${dayWords(receipt.received_on)}`,
            sub: `${minorWords(receipt.amount_minor, invoice.currency)} · ${invoice.invoice_number}`,
            on: addDays(receipt.received_on, AHEAD.fira_after),
            // Shown from the day the money came in: the FIRA is asked for at once.
            ahead: AHEAD.fira_after,
            href: exportHref(invoice.invoice_id),
            plain: null,
            remind: [],
          });
    }
    for (const [period, on] of edfMonths)
      out.push({
        key: `export:edf:${period}`,
        kind: "export",
        title: `File the EDF for ${periodWords(period)}'s export invoices`,
        sub: "One form may cover the month",
        on,
        ahead: AHEAD.edf,
        href: `/data/money/exports`,
        plain: "Export paperwork",
        remind: [7, 0],
      });
    return out;
  }

  core.provideDue((): DueItem[] => {
    const today = core.day();
    return marks()
      .filter((mark) => mark.on <= addDays(today, mark.ahead))
      .map((mark) => ({
        key: mark.key,
        kind: mark.kind,
        title: mark.title,
        sub: mark.sub,
        due_on: mark.on,
        href: mark.href,
      }));
  });

  const agenda: AgendaSource = {
    agenda: () =>
      marks()
        .filter((mark) => mark.plain !== null)
        .map((mark): AgendaItem => ({
          key: mark.key,
          kind: mark.kind,
          title: mark.title,
          plain: mark.plain!,
          sub: mark.sub,
          on: mark.on,
          remind_days: mark.remind,
          href: mark.href,
        }))
        .sort((a, b) => a.on.localeCompare(b.on) || a.title.localeCompare(b.title)),
  };
  core.provide(agendaService("money"), agenda);

  const search: SearchSource = {
    search: ({ terms, kind, limit }) => {
      if (terms.length === 0) return [];
      const groups: ReturnType<SearchSource["search"]> = [];
      if (kind === null || kind === "vendor") {
        const found = book.vendors
          .filter((vendor) => matchesTerms([vendor.name, vendor.legal_name, vendor.gstin], terms))
          .sort((a, b) => Number(a.retired) - Number(b.retired) || a.name.localeCompare(b.name));
        if (found.length > 0)
          groups.push({
            kind: "vendor",
            count: found.length,
            hits: found.slice(0, Math.max(0, limit)).map((vendor) => ({
              kind: "vendor",
              id: vendor.vendor_id,
              title: vendor.name,
              subtitle: `${RESIDENCIES[vendor.residency]} · ${UDYAM_CLASSES[vendor.udyam.class]}`,
              snippet: "",
              href: vendorHref(vendor.vendor_id),
            })),
          });
      }
      if (kind === null || kind === "bill") {
        const found = book.bills
          .filter((bill) =>
            matchesTerms(
              [bill.invoice_number, book.vendorName(bill.vendor_id), bill.description],
              terms,
            ),
          )
          .sort((a, b) => b.invoice_on.localeCompare(a.invoice_on));
        if (found.length > 0)
          groups.push({
            kind: "bill",
            count: found.length,
            hits: found.slice(0, Math.max(0, limit)).map((bill) => ({
              kind: "bill",
              id: bill.bill_id,
              title: `${bill.invoice_number}${bill.cancelled ? " (cancelled)" : ""}`,
              subtitle: `${book.vendorName(bill.vendor_id)} · ${dayWords(bill.invoice_on)} · ${minorWords(bill.total_minor, bill.currency)}`,
              snippet: bill.description.slice(0, 160),
              href: billHref(bill.bill_id),
            })),
          });
      }
      return groups;
    },
  };
  core.provide(searchService("money"), search);

  // ---------------------------------------------------------------- the service

  const packName = (day: string, who: string, number: string, fileId: string) => {
    const row = core.need<{ fileRow(id: string): { original_name: string } | null }>("files");
    const original = row ? (safely(() => row.fileRow(fileId))?.original_name ?? "") : "";
    const ext = /\.([A-Za-z0-9]{1,8})$/.exec(original)?.[1]?.toLowerCase() ?? "pdf";
    return `${day} ${who} ${number}.${ext}`.replace(/[\\/:*?"<>|]/g, "_");
  };

  const service: MoneyLookup = {
    usedFor: (fileId) => {
      const used: { label: string; href: string }[] = [];
      for (const bill of book.bills) {
        const name = `${book.vendorName(bill.vendor_id)} ${bill.invoice_number}`;
        if (bill.file_id === fileId)
          used.push({ label: `The bill ${name}, in Money`, href: billHref(bill.bill_id) });
        if (bill.tds.challan?.file_id === fileId)
          used.push({
            label: `The TDS challan for the bill ${name}, in Money`,
            href: billHref(bill.bill_id),
          });
      }
      for (const vendor of book.vendors) {
        if (vendor.foreign.decision?.file_id === fileId)
          used.push({
            label: `The CA's decision on ${vendor.name}, in Money`,
            href: vendorHref(vendor.vendor_id),
          });
        if (vendor.udyam.certificate_file_id === fileId)
          used.push({
            label: `${vendor.name}'s Udyam certificate, in Money`,
            href: vendorHref(vendor.vendor_id),
          });
      }
      for (const invoice of book.exports) {
        const name = `${invoice.customer} ${invoice.invoice_number}`;
        if (invoice.file_id === fileId)
          used.push({
            label: `The export invoice ${name}, in Money`,
            href: exportHref(invoice.invoice_id),
          });
        for (const receipt of invoice.receipts)
          if (receipt.fira_file_id === fileId)
            used.push({
              label: `The FIRA for ${name}, received ${dayWords(receipt.received_on)}, in Money`,
              href: exportHref(invoice.invoice_id),
            });
      }
      for (const lut of book.setup.luts)
        if (lut.file_id === fileId)
          used.push({ label: `The LUT for ${lut.fy}, in Money`, href: "/data/money/exports" });
      return used;
    },
    heldUntil,
    categories: () => book.categories.map((category) => views.categoryView(category)),
    bills: (filter = {}) =>
      book.bills
        .filter(
          (bill) =>
            (filter.cancelled === true || bill.cancelled === null) &&
            (!filter.from || bill.invoice_on >= filter.from) &&
            (!filter.to || bill.invoice_on <= filter.to),
        )
        .map((bill) => views.billView(bill))
        .filter((view) => filter.open !== true || (!view.cancelled && view.open_minor > 0))
        .sort(
          (a, b) => a.invoice_on.localeCompare(b.invoice_on) || a.bill_id.localeCompare(b.bill_id),
        ),
    exportInvoices: (filter = {}) =>
      book.exports
        .filter(
          (invoice) =>
            invoice.cancelled === null &&
            (!filter.from || invoice.invoice_on >= filter.from) &&
            (!filter.to || invoice.invoice_on <= filter.to),
        )
        .sort((a, b) => a.invoice_on.localeCompare(b.invoice_on))
        .map((invoice) => views.exportView(invoice)),
    recordPayment: (input) => {
      const bill = book.bill(input.bill_id);
      const line = (input as { from_line?: unknown }).from_line;
      book.pay(
        bill,
        {
          paid_on: input.paid_on,
          amount: minorInput(input.amount_minor),
          reference: input.reference,
          method: "bank",
        },
        input.by,
        typeof line === "string" && line ? line.slice(0, 64) : "statement",
      );
      return views.billView(bill);
    },
    recordReceipt: (input) => {
      const invoice = book.exportInvoice(input.invoice_id);
      const line = (input as { from_line?: unknown }).from_line;
      book.receive(
        invoice,
        {
          received_on: input.received_on,
          amount: minorInput(input.amount_minor),
          inr: input.inr_minor === null ? undefined : minorInput(input.inr_minor),
        },
        input.by,
        null,
        typeof line === "string" && line ? line.slice(0, 64) : "statement",
      );
      return views.exportView(invoice);
    },
    takeBackPayment: (input) => {
      const bill = book.bill(input.bill_id);
      book.takeBack(bill, input.payment_id, { why: input.why }, input.by);
      return views.billView(bill);
    },
    takeBackReceipt: (input) => {
      const invoice = book.exportInvoice(input.invoice_id);
      book.takeBackReceipt(invoice, input.receipt_id, { why: input.why }, input.by);
      return views.exportView(invoice);
    },
    packFiles: (period) => {
      const inMonth = (day: string | null | undefined) => !!day && periodOf(day) === period;
      const bills: PackFile[] = [];
      const challans: PackFile[] = [];
      const exportFiles: PackFile[] = [];
      const firas: PackFile[] = [];
      let billsCount = 0;
      let withoutCopy = 0;
      let challansCount = 0;
      let exportCount = 0;
      let firasCount = 0;
      for (const bill of book.bills) {
        const vendor = book.vendorName(bill.vendor_id);
        if (!bill.cancelled && inMonth(bill.invoice_on)) {
          billsCount += 1;
          if (bill.file_id)
            bills.push({
              folder: "Purchase bills",
              name: packName(bill.invoice_on, vendor, bill.invoice_number, bill.file_id),
              file_id: bill.file_id,
            });
          else withoutCopy += 1;
        }
        const challan = bill.tds.challan;
        if (challan && inMonth(challan.deposited_on)) {
          challansCount += 1;
          if (challan.file_id)
            challans.push({
              folder: "TDS challans",
              name: packName(
                challan.deposited_on,
                vendor,
                challan.number || bill.invoice_number,
                challan.file_id,
              ),
              file_id: challan.file_id,
            });
        }
      }
      for (const invoice of book.exports) {
        if (!invoice.cancelled && inMonth(invoice.invoice_on)) {
          exportCount += 1;
          if (invoice.file_id)
            exportFiles.push({
              folder: "Sales invoices",
              name: packName(
                invoice.invoice_on,
                invoice.customer,
                invoice.invoice_number,
                invoice.file_id,
              ),
              file_id: invoice.file_id,
            });
        }
        for (const receipt of live(invoice.receipts))
          if (inMonth(receipt.received_on) && (receipt.fira_number || receipt.fira_file_id)) {
            firasCount += 1;
            if (receipt.fira_file_id)
              firas.push({
                folder: "FIRAs",
                name: packName(
                  receipt.received_on,
                  invoice.customer,
                  receipt.fira_number || invoice.invoice_number,
                  receipt.fira_file_id,
                ),
                file_id: receipt.fira_file_id,
              });
          }
      }
      return {
        bills,
        challans,
        export_invoices: exportFiles,
        firas,
        bills_without_copy: withoutCopy,
        bills_count: billsCount,
        challans_count: challansCount,
        export_count: exportCount,
        firas_count: firasCount,
      };
    },
  };
  core.provide(DUTIES_SERVICES.money, service);

  // ---------------------------------------------------------------- the overview block

  core.provideOverview("money", () => {
    const today = core.day();
    const open: Record<string, number> = {};
    let overdue = 0;
    for (const bill of book.bills) {
      if (bill.cancelled) continue;
      const worked = views.worked(bill);
      if (worked.open_minor > 0) sum(open, bill.currency, worked.open_minor);
      if (worked.open_minor > 0 && worked.pay_by && worked.pay_by < today) overdue += 1;
    }
    const next =
      marks()
        .filter((mark) => mark.on >= today)
        .sort((a, b) => a.on.localeCompare(b.on))
        .map((mark) => ({ title: mark.plain ?? mark.title, on: mark.on }))[0] ?? null;
    return { open, overdue, next };
  });

  // ---------------------------------------------------------------- CSVs for the CA (builds)

  const sourcesOf = (keys: readonly (DutyRuleKey | null)[]) =>
    [
      ...new Set(
        keys
          .filter((key): key is DutyRuleKey => key !== null)
          .flatMap((key) => dutyRuleOf(key).sources.map((source) => source.url)),
      ),
    ].join(" ");

  const writeCsv = async (
    path: string,
    header: string[],
    rows: (string | number)[][],
    by: Staff,
    kind: string,
  ) => {
    writeFileSync(path, BOM + toCsv(header, rows), { mode: 0o600 });
    core.store.appendLine("money/downloads.jsonl", { at: core.now(), by, kind, rows: rows.length });
  };

  const fyAsked = (body: Body) => {
    const fy = clean(body.fy, 7);
    return /^\d{4}-\d{2}$/.test(fy) ? fy : "";
  };

  core.builds.provide("money_bills_csv", async (handle, input) => {
    const fy = fyAsked(input.body);
    const bills = book.bills
      .filter((bill) => !fy || fyWords(bill.invoice_on) === fy)
      .sort((a, b) => a.invoice_on.localeCompare(b.invoice_on));
    handle.setProgress(0, bills.length);
    await core.yield();
    const rows = bills.map((bill) => {
      const vendor = book.vendors.find((item) => item.vendor_id === bill.vendor_id);
      const worked = views.worked(bill);
      const table = bill.tds.kind ? TDS_TABLE[bill.tds.kind] : null;
      const category = book.categories.find((item) => item.category_id === bill.category_id);
      const payments = live(bill.payments);
      const challan = bill.tds.challan;
      const msmeKey: DutyRuleKey | null = worked.msme?.pay_by
        ? vendor?.msme_agreement.has === "yes" && vendor.msme_agreement.days !== null
          ? "msme-agreement"
          : "msme-no-agreement"
        : null;
      return [
        vendor?.name ?? "",
        vendor?.pan ?? "",
        vendor?.gstin ?? "",
        bill.invoice_number,
        bill.invoice_on,
        bill.currency,
        minorInput(bill.taxable_minor),
        minorInput(bill.gst_minor),
        minorInput(bill.total_minor),
        bill.gst_treatment,
        category?.name ?? "",
        category?.ledger ?? "",
        bill.tds.kind ? TDS_KINDS[bill.tds.kind] : "",
        table?.section ?? "",
        table?.code ?? "",
        bill.tds.deducted_minor === null ? "" : minorInput(bill.tds.deducted_minor),
        bill.tds.deducted_on ?? "",
        challan ? [challan.number, challan.bsr].filter(Boolean).join(" ") : "",
        challan?.deposited_on ?? "",
        payments.map((payment) => payment.paid_on).join("; "),
        payments.map((payment) => payment.reference).join("; "),
        worked.msme?.pay_by ?? "",
        worked.state,
        sourcesOf([
          table?.rate ?? null,
          table?.single ?? null,
          table?.year ?? null,
          table?.month ?? null,
          msmeKey,
        ]),
      ];
    });
    await writeCsv(
      handle.path,
      [
        "vendor",
        "pan",
        "gstin",
        "invoice_number",
        "invoice_on",
        "currency",
        "taxable",
        "gst",
        "total",
        "gst_treatment",
        "category",
        "ledger",
        "tds_kind",
        "section",
        "payment_code",
        "tds_deducted",
        "deducted_on",
        "challan",
        "challan_deposited_on",
        "paid_on",
        "utr",
        "msme_pay_by",
        "state",
        "rule_sources",
      ],
      rows,
      input.by,
      "bills",
    );
    handle.setProgress(bills.length, bills.length);
    return {
      name: `Purchase register${fy ? ` ${fy}` : ""} ${core.day()}.csv`,
      type: "text/csv; charset=utf-8",
    };
  });

  core.builds.provide("money_vendors_csv", async (handle, input) => {
    const forms = formsWords(views.forms().reading);
    const rows = [...book.vendors]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((vendor) => {
        const decision = vendor.foreign.decision;
        return [
          vendor.name,
          vendor.legal_name,
          RESIDENCIES[vendor.residency],
          vendor.country,
          vendor.pan,
          vendor.gstin,
          UDYAM_CLASSES[vendor.udyam.class],
          vendor.udyam.number,
          vendor.udyam.checked_on ?? "",
          vendor.msme_agreement.has,
          vendor.msme_agreement.days ?? "",
          vendor.tds_kind ? TDS_KINDS[vendor.tds_kind] : "",
          book.categoryName(vendor.default_category_id),
          vendor.foreign.bills_from,
          vendor.foreign.paid_by,
          vendor.foreign.gst,
          vendor.foreign.card_forex_rate ?? "",
          decision?.tds ?? "",
          decision?.basis ?? "",
          decision ? forms[decision.forms] : "",
          decision?.decided_by ?? "",
          decision?.decided_role ?? "",
          decision?.decided_on ?? "",
          vendor.retired ? "yes" : "",
        ];
      });
    await core.yield();
    await writeCsv(
      handle.path,
      [
        "name",
        "legal_name",
        "where",
        "country",
        "pan",
        "gstin",
        "udyam_class",
        "udyam_number",
        "udyam_checked_on",
        "msme_agreement",
        "agreed_days",
        "tds_kind",
        "default_category",
        "bills_from",
        "paid_by",
        "gst",
        "card_forex_per_cent",
        "ca_decision",
        "basis",
        "forms",
        "decided_by",
        "decided_role",
        "decided_on",
        "retired",
      ],
      rows,
      input.by,
      "vendors",
    );
    handle.setProgress(rows.length, rows.length);
    return { name: `Vendors ${core.day()}.csv`, type: "text/csv; charset=utf-8" };
  });

  core.builds.provide("money_ledger_csv", async (handle, input) => {
    const rows = book.categories.map((category) => [
      category.name,
      CATEGORY_KINDS[category.kind],
      category.ledger,
      category.schedule_line,
      category.people ? "yes" : "",
      category.note,
      category.retired ? "yes" : "",
      views.inUse(category),
    ]);
    await core.yield();
    await writeCsv(
      handle.path,
      ["category", "kind", "ledger", "schedule_iii_line", "names_pay", "note", "retired", "in_use"],
      rows,
      input.by,
      "ledger",
    );
    handle.setProgress(rows.length, rows.length);
    return { name: `Ledger map ${core.day()}.csv`, type: "text/csv; charset=utf-8" };
  });

  core.builds.provide("money_exports_csv", async (handle, input) => {
    const fy = fyAsked(input.body);
    const invoices = book.exports
      .filter((invoice) => !fy || fyWords(invoice.invoice_on) === fy)
      .sort((a, b) => a.invoice_on.localeCompare(b.invoice_on));
    const rows = invoices.map((invoice) => {
      const worked = views.exportWorked(invoice, book.setup.luts);
      const lut = book.setup.luts.find((item) => item.fy === fyWords(invoice.invoice_on));
      return [
        invoice.customer,
        invoice.country,
        invoice.invoice_number,
        invoice.invoice_on,
        invoice.currency,
        minorInput(invoice.amount_minor),
        invoice.tax_treatment,
        invoice.purpose_code,
        invoice.rail,
        worked.edf_by ?? "",
        invoice.edf?.filed_on ?? "",
        invoice.edf?.reference ?? "",
        worked.realise_by ?? "",
        minorInput(worked.realised.minor),
        worked.realised.in_full_on ?? "",
        worked.realised.inr_minor === null ? "" : minorInput(worked.realised.inr_minor),
        live(invoice.receipts)
          .map((receipt) =>
            [receipt.received_on, minorInput(receipt.amount_minor), receipt.fira_number]
              .filter(Boolean)
              .join(" "),
          )
          .join("; "),
        lut ? `${lut.arn} ${lut.filed_on}` : "",
        invoice.cancelled ? "cancelled" : "",
        sourcesOf(["export-edf", "export-realisation"]),
      ];
    });
    await core.yield();
    await writeCsv(
      handle.path,
      [
        "customer",
        "country",
        "invoice_number",
        "invoice_on",
        "currency",
        "amount",
        "tax_treatment",
        "purpose_code",
        "how_it_comes_in",
        "edf_by",
        "edf_filed_on",
        "edf_reference",
        "realise_by",
        "realised",
        "realised_in_full_on",
        "rupees_realised",
        "receipts",
        "lut",
        "state",
        "rule_sources",
      ],
      rows,
      input.by,
      "exports",
    );
    handle.setProgress(rows.length, rows.length);
    return {
      name: `Export invoices${fy ? ` ${fy}` : ""} ${core.day()}.csv`,
      type: "text/csv; charset=utf-8",
    };
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    /** Installs a stand-in only while no real one is here; removes only its own. */
    const installed = new Map<string, unknown>();
    function standIn(name: string, body: Body, make: () => unknown): Answer {
      const current = core.need<unknown>(name);
      const mine = installed.get(name);
      if (body.on === false) {
        if (mine !== undefined && current === mine) core.provide(name, null);
        installed.delete(name);
        return { installed: false };
      }
      if (current && current !== mine) return { installed: false, real: true };
      const fake = make();
      installed.set(name, fake);
      core.provide(name, fake);
      return { installed: true };
    }

    core.route("POST", "/data/_test/money/duty-rules", (ctx) => {
      ctx.staff();
      const stored =
        ctx.body.stored && typeof ctx.body.stored === "object"
          ? (ctx.body.stored as Partial<Record<DutyRuleKey, DutyStored>>)
          : {};
      return standIn(DUTIES_SERVICES.dutyRules, ctx.body, () =>
        standInDutyRules(() => core.day(), stored),
      );
    });

    core.route("POST", "/data/_test/money/month-lock", (ctx) => {
      ctx.staff();
      const locked = Array.isArray(ctx.body.locked)
        ? ctx.body.locked.filter(
            (item): item is string => typeof item === "string" && /^\d{4}-\d{2}$/.test(item),
          )
        : [];
      return standIn(DUTIES_SERVICES.monthLock, ctx.body, () => standInMonthLock(locked));
    });

    /** What the walk and the harness start from: the rule book's stand-in (nothing confirmed) while none is here. Safe twice. */
    core.route("POST", "/data/_test/money/seed", (ctx) => {
      ctx.staff();
      const rulesNow = core.need(DUTIES_SERVICES.dutyRules);
      if (rulesNow && rulesNow !== installed.get(DUTIES_SERVICES.dutyRules))
        return { rules: "real", ids: WALK_IDS };
      standIn(DUTIES_SERVICES.dutyRules, {}, () => standInDutyRules(() => core.day(), walkRules()));
      return { rules: "stand-in", ids: WALK_IDS };
    });

    core.route("POST", "/data/_test/money/pin", (ctx) => {
      ctx.staff();
      const kind = ctx.body.kind;
      const id = ctx.body.id;
      if (kind !== "bill" && kind !== "vendor" && kind !== "export" && kind !== "category")
        throw new Refused(400, "invalid", "Choose from the list.");
      if (!isRouteId(id)) throw new Refused(400, "invalid", "That is not an id.");
      const exists =
        kind === "bill"
          ? book.bills.some((item) => item.bill_id === id)
          : kind === "vendor"
            ? book.vendors.some((item) => item.vendor_id === id)
            : kind === "export"
              ? book.exports.some((item) => item.invoice_id === id)
              : book.categories.some((item) => item.category_id === id);
      if (exists) delete book.pinned[kind];
      else book.pinned[kind] = id;
      return { pinned: exists ? null : id, exists };
    });

    // The service as the statements module and the cash view call it, reached through the socket.
    core.route("POST", "/data/_test/money/record-payment", (ctx) => {
      const by = ctx.staff();
      return {
        bill: service.recordPayment({
          bill_id: clean(ctx.body.bill_id, 64),
          paid_on: clean(ctx.body.paid_on, 10),
          amount_minor: Number(ctx.body.amount_minor),
          reference: clean(ctx.body.reference, MONEY_LIMITS.reference),
          by,
        }),
      };
    });
    core.route("POST", "/data/_test/money/record-receipt", (ctx) => {
      const by = ctx.staff();
      return {
        invoice: service.recordReceipt({
          invoice_id: clean(ctx.body.invoice_id, 64),
          received_on: clean(ctx.body.received_on, 10),
          amount_minor: Number(ctx.body.amount_minor),
          inr_minor:
            ctx.body.inr_minor === null || ctx.body.inr_minor === undefined
              ? null
              : Number(ctx.body.inr_minor),
          by,
        }),
      };
    });
    core.route("POST", "/data/_test/money/take-back-payment", (ctx) => {
      const by = ctx.staff();
      return {
        bill: service.takeBackPayment({
          bill_id: clean(ctx.body.bill_id, 64),
          payment_id: clean(ctx.body.payment_id, 64),
          why: clean(ctx.body.why, 300),
          by,
        }),
      };
    });
    core.route("POST", "/data/_test/money/take-back-receipt", (ctx) => {
      const by = ctx.staff();
      return {
        invoice: service.takeBackReceipt({
          invoice_id: clean(ctx.body.invoice_id, 64),
          receipt_id: clean(ctx.body.receipt_id, 64),
          why: clean(ctx.body.why, 300),
          by,
        }),
      };
    });
    core.route("GET", "/data/_test/money/service", (ctx) => {
      const from = clean(ctx.query.get("from"), 10);
      const to = clean(ctx.query.get("to"), 10);
      const open = ctx.query.get("open") === "1";
      const cancelled = ctx.query.get("cancelled") === "1";
      const fileId = clean(ctx.query.get("file_id"), 64);
      const period = clean(ctx.query.get("period"), 7);
      return {
        categories: service.categories(),
        bills: service.bills({
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
          ...(open ? { open } : {}),
          ...(cancelled ? { cancelled } : {}),
        }),
        export_invoices: service.exportInvoices({
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        }),
        held: fileId ? service.heldUntil(fileId) : null,
        used_for: fileId ? service.usedFor(fileId) : [],
        pack: period ? service.packFiles(period) : null,
      };
    });
    core.route("GET", "/data/_test/money/agenda", () => ({
      items: core.need<AgendaSource>(agendaService("money"))?.agenda(core.day()) ?? [],
      today: core.day(),
    }));
    core.route("GET", "/data/_test/money/search", (ctx) => {
      const query = clean(ctx.query.get("q"), MONEY_LIMITS.search);
      return {
        groups:
          core.need<SearchSource>(searchService("money"))?.search({
            query,
            terms: findTerms(query),
            kind: null,
            limit: 5,
          }) ?? [],
      };
    });
  }
}
