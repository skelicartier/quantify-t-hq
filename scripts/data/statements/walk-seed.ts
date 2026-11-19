/**
 * The walk's statement and the stand-ins the statements and close modules install under
 * test routes only (ws-notes/duties/spec.md §3.3, §9.12). Every line, name and figure is
 * invented: "Walk Bank current ··0000", references starting WALK-, "Walk Intern One". The
 * statement is made here from invented lines, never kept as a file in the repository.
 *
 * Its three months are §5.5's table: out ₹1,50,000, ₹1,55,000 and ₹1,75,000; collected
 * ₹10,000, nothing and ₹20,000; ₹16,50,000 at the start of 1 Aug 2026 and ₹12,00,000 at the
 * end of 31 Oct 2026.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import type {
  BillView,
  CategoryView,
  ExportView,
  MoneyLookup,
  PayLine,
  PayOwed,
  PeoplePay,
} from "../duties-contracts";
import { clean, isDay } from "../guard";

export const WALK_ACCOUNT = {
  name: "Walk Bank current",
  kind: "bank",
  bank: "Walk Bank",
  last4: "0000",
  currency: "INR",
} as const;
/** The id the walk pins its account to, so the harness can open its lines. */
export const WALK_ACCOUNT_ID = "walk-account";
export const WALK_OPENING_MINOR = 165_000_000;
export const WALK_FILE_NAME = "walk-bank-current-2026-08-to-10.csv";

type WalkLine = [day: string, narration: string, reference: string, out: number, into: number];

/** The walk statement's lines, in rupees (whole), oldest first. */
export const WALK_LINES: readonly WalkLine[] = [
  ["01/08/2026", "NEFT WALK CLOUD HOSTING AUG", "WALK-REF-0801", 40_000, 0],
  ["05/08/2026", "WALK CUSTOMER ONE SUBSCRIPTION", "WALK-REF-0802", 0, 10_000],
  ["10/08/2026", "NEFT WALK DATA LICENCE AUG", "WALK-REF-0803", 60_000, 0],
  ["25/08/2026", "NEFT WALK OFFICE RENT AUG", "WALK-REF-0804", 50_000, 0],
  ["01/09/2026", "NEFT WALK CLOUD HOSTING SEP", "WALK-REF-0901", 40_000, 0],
  ["10/09/2026", "NEFT WALK DATA LICENCE SEP", "WALK-REF-0902", 60_000, 0],
  ["25/09/2026", "NEFT WALK OFFICE RENT SEP", "WALK-REF-0903", 55_000, 0],
  ["01/10/2026", "NEFT WALK CLOUD HOSTING OCT", "WALK-REF-1001", 40_000, 0],
  ["06/10/2026", "NEFT WALK LEGAL LLP WALK-INV-0007", "WALK-UTR-0007", 11_800, 0],
  ["10/10/2026", "NEFT WALK DATA LICENCE OCT", "WALK-REF-1003", 60_000, 0],
  ["15/10/2026", "WALK FUND SUBSCRIPTION", "WALK-REF-1004", 0, 20_000],
  ["25/10/2026", "NEFT WALK OFFICE RENT OCT", "WALK-REF-1005", 48_200, 0],
  ["31/10/2026", "NEFT WALK INTERN ONE STIPEND", "WALK-UTR-0015", 15_000, 0],
];

const INDIAN = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const cell = (rupees: number) => (rupees === 0 ? "" : `"${INDIAN.format(rupees)}"`);

/** The walk statement as the bank's CSV would give it: a line of preamble, then the table. */
export function walkStatementCsv(
  lines: readonly WalkLine[] = WALK_LINES,
  opening = WALK_OPENING_MINOR / 100,
): string {
  let balance = opening;
  const rows = [
    "Walk Bank account statement for Walk Bank current ··0000",
    "Txn Date,Narration,Chq./Ref.No.,Withdrawal Amt.,Deposit Amt.,Closing Balance",
  ];
  for (const [day, narration, reference, out, into] of lines) {
    balance = balance - out + into;
    rows.push(
      [day, narration, reference, cell(out), cell(into), `"${INDIAN.format(balance)}"`].join(","),
    );
  }
  return `${rows.join("\r\n")}\r\n`;
}

// ------------------------------------------------------------------ Money, as a stand-in

export const WALK_CATEGORIES: CategoryView[] = [
  ["walk-cat-hosting", "Cloud hosting", "expense", "Cloud hosting charges", false],
  ["walk-cat-data", "Market-data licences", "expense", "Data licence fees", false],
  ["walk-cat-rent", "Office rent", "expense", "Rent", false],
  [
    "walk-cat-legal",
    "Legal and professional fees",
    "expense",
    "Legal and professional charges",
    false,
  ],
  ["walk-cat-stipends", "Intern stipends", "expense", "Stipend to interns", true],
  [
    "walk-cat-subscriptions",
    "Subscriptions from customers",
    "income",
    "Sales: subscriptions",
    false,
  ],
  ["walk-cat-transfer", "Between own accounts", "transfer", "", false],
].map(([category_id, name, kind, ledger, people]) => ({
  category_id: category_id as string,
  name: name as string,
  kind: kind as CategoryView["kind"],
  ledger: ledger as string,
  schedule_line: "",
  people: people as boolean,
  retired: false,
}));

/** The open bill of §3.5 case 4: Walk Legal LLP WALK-INV-0007, ₹10,000 and ₹1,800 GST. */
export const WALK_BILL: BillView = {
  bill_id: "walk-bill-0007",
  vendor_id: "walk-vendor-legal",
  vendor_name: "Walk Legal LLP",
  invoice_number: "WALK-INV-0007",
  invoice_on: "2026-10-02",
  currency: "INR",
  total_minor: 1_180_000,
  payable_minor: 1_180_000,
  open_minor: 1_180_000,
  category_id: "walk-cat-legal",
  pay_by: "2026-10-17",
  payments: [],
  cancelled: false,
  href: "/data/money/bills/walk-bill-0007",
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const list = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.map(record) : [];
const whole = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isSafeInteger(value) ? value : fallback;

/**
 * A `money` from the body (`categories`, `bills`, `export_invoices`), for copies without
 * U3's module. Its payments, receipts and take-backs change only itself; `packFiles` answers
 * empty lists with the bills counted; `heldUntil` is null.
 */
export function fakeMoney(body: Record<string, unknown>): MoneyLookup {
  const categories: CategoryView[] = (
    body.categories === undefined
      ? WALK_CATEGORIES
      : list(body.categories).map((item) => ({
          category_id: clean(item.category_id, 64),
          name: clean(item.name, 120),
          kind: (["expense", "income", "tax", "funding", "transfer", "other"].includes(
            String(item.kind),
          )
            ? item.kind
            : "expense") as CategoryView["kind"],
          ledger: clean(item.ledger, 120),
          schedule_line: clean(item.schedule_line, 120),
          people: item.people === true,
          retired: item.retired === true,
        }))
  ).filter((item) => item.category_id !== "");
  const bills: BillView[] = (
    body.bills === undefined
      ? [WALK_BILL]
      : list(body.bills).map((item) => {
          const total = whole(item.total_minor);
          const payable = whole(item.payable_minor, total);
          const id = clean(item.bill_id, 64) || randomUUID();
          const payments = list(item.payments).map((payment) => ({
            payment_id: clean(payment.payment_id, 64) || randomUUID(),
            paid_on: isDay(payment.paid_on) ? payment.paid_on : "2026-10-01",
            amount_minor: whole(payment.amount_minor),
            reference: clean(payment.reference, 120),
          }));
          const paid = payments.reduce((sum, payment) => sum + payment.amount_minor, 0);
          return {
            bill_id: id,
            vendor_id: clean(item.vendor_id, 64) || "walk-vendor",
            vendor_name: clean(item.vendor_name, 120),
            invoice_number: clean(item.invoice_number, 60),
            invoice_on: isDay(item.invoice_on) ? item.invoice_on : "2026-10-01",
            currency: clean(item.currency, 3) || "INR",
            total_minor: total,
            payable_minor: payable,
            open_minor: payable - paid,
            category_id: clean(item.category_id, 64) || null,
            pay_by: isDay(item.pay_by) ? item.pay_by : null,
            payments,
            cancelled: item.cancelled === true,
            href: `/data/money/bills/${id}`,
          };
        })
  ).map((bill) => ({ ...bill, payments: [...bill.payments] }));
  const exports: ExportView[] = list(body.export_invoices).map((item) => {
    const id = clean(item.invoice_id, 64) || randomUUID();
    return {
      invoice_id: id,
      customer: clean(item.customer, 120),
      invoice_number: clean(item.invoice_number, 60),
      invoice_on: isDay(item.invoice_on) ? item.invoice_on : "2026-10-01",
      currency: clean(item.currency, 3) || "USD",
      amount_minor: whole(item.amount_minor),
      receipts: list(item.receipts).map((receipt) => ({
        receipt_id: clean(receipt.receipt_id, 64) || randomUUID(),
        received_on: isDay(receipt.received_on) ? receipt.received_on : "2026-10-01",
        amount_minor: whole(receipt.amount_minor),
        inr_minor: typeof receipt.inr_minor === "number" ? receipt.inr_minor : null,
        fira_number: clean(receipt.fira_number, 60),
      })),
      href: `/data/money/exports/${id}`,
    };
  });
  const bill = (id: string) => {
    const found = bills.find((item) => item.bill_id === id);
    if (!found) throw new Refused(404, "not_found", "That bill is not in Money.");
    return found;
  };
  const invoice = (id: string) => {
    const found = exports.find((item) => item.invoice_id === id);
    if (!found) throw new Refused(404, "not_found", "That export invoice is not in Money.");
    return found;
  };
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const inRange = (day: string, filter: { from?: string; to?: string } | undefined) =>
    (!filter?.from || day >= filter.from) && (!filter?.to || day <= filter.to);
  return {
    usedFor: () => [],
    heldUntil: () => null,
    categories: () => copy(categories),
    bills: (filter) =>
      copy(
        bills.filter(
          (item) =>
            inRange(item.invoice_on, filter) &&
            (filter?.cancelled === true || !item.cancelled) &&
            (filter?.open === undefined || item.open_minor > 0 === filter.open),
        ),
      ),
    exportInvoices: (filter) => copy(exports.filter((item) => inRange(item.invoice_on, filter))),
    recordPayment: (input) => {
      const found = bill(input.bill_id);
      if (input.amount_minor > found.open_minor)
        throw new Refused(400, "invalid", "That is more than is open on the bill.");
      found.payments.push({
        payment_id: randomUUID(),
        paid_on: input.paid_on,
        amount_minor: input.amount_minor,
        reference: input.reference,
      });
      found.open_minor -= input.amount_minor;
      return copy(found);
    },
    recordReceipt: (input) => {
      const found = invoice(input.invoice_id);
      found.receipts.push({
        receipt_id: randomUUID(),
        received_on: input.received_on,
        amount_minor: input.amount_minor,
        inr_minor: input.inr_minor,
        fira_number: "",
      });
      return copy(found);
    },
    takeBackPayment: (input) => {
      const found = bill(input.bill_id);
      const payment = found.payments.find((item) => item.payment_id === input.payment_id);
      if (!payment) throw new Refused(404, "not_found", "That payment is not on the bill.");
      found.payments = found.payments.filter((item) => item !== payment);
      found.open_minor += payment.amount_minor;
      return copy(found);
    },
    takeBackReceipt: (input) => {
      const found = invoice(input.invoice_id);
      found.receipts = found.receipts.filter((item) => item.receipt_id !== input.receipt_id);
      return copy(found);
    },
    packFiles: (period) => {
      const month = bills.filter((item) => item.invoice_on.startsWith(period) && !item.cancelled);
      return {
        bills: [],
        challans: [],
        export_invoices: [],
        firas: [],
        bills_without_copy: month.length,
        bills_count: month.length,
        challans_count: 0,
        export_count: exports.filter((item) => item.invoice_on.startsWith(period)).length,
        firas_count: 0,
      };
    },
  };
}

// ------------------------------------------------------------------ the people ledger, as a stand-in

/** The walk intern's October stipend, paid on the day the walk statement's line is. */
export const WALK_STIPEND: PayLine = {
  payment_id: "walk-pay-0015",
  person_id: "walk-intern-one",
  name: "Walk Intern One",
  kind: "intern",
  period: "2026-10",
  amount_minor: 1_500_000,
  currency: "INR",
  paid_on: "2026-10-31",
  reference: "WALK-UTR-0015",
  tds_deducted_minor: null,
};

/** A `people-pay` from `body.paid` and `body.owed` (and `body.headcount`), Owner-only like the real one. */
export function fakePeoplePay(body: Record<string, unknown>): PeoplePay {
  const paid: PayLine[] =
    body.paid === undefined
      ? [WALK_STIPEND]
      : list(body.paid).map((item) => ({
          payment_id: clean(item.payment_id, 64) || randomUUID(),
          person_id: clean(item.person_id, 64) || "walk-person",
          name: clean(item.name, 120),
          kind: (["intern", "employee", "contractor"].includes(String(item.kind))
            ? item.kind
            : "intern") as PayLine["kind"],
          period: clean(item.period, 7),
          amount_minor: whole(item.amount_minor),
          currency: item.currency === "USD" ? "USD" : "INR",
          paid_on: isDay(item.paid_on) ? item.paid_on : "2026-10-31",
          reference: clean(item.reference, 120),
          tds_deducted_minor:
            typeof item.tds_deducted_minor === "number" ? item.tds_deducted_minor : null,
        }));
  const owed: PayOwed[] = list(body.owed).map((item) => ({
    person_id: clean(item.person_id, 64) || "walk-person",
    name: clean(item.name, 120),
    period: clean(item.period, 7),
    due_on: isDay(item.due_on) ? item.due_on : "2026-11-30",
    amount_minor: whole(item.amount_minor),
    currency: item.currency === "USD" ? "USD" : "INR",
  }));
  const counted = record(body.headcount);
  const headcount = {
    employees: whole(counted.employees),
    interns: whole(counted.interns, body.headcount === undefined ? 1 : 0),
    contractors: whole(counted.contractors),
  };
  return {
    paid: (from, to) =>
      paid
        .filter((item) => item.paid_on >= from && item.paid_on <= to)
        .sort((a, b) => a.paid_on.localeCompare(b.paid_on))
        .map((item) => ({ ...item })),
    owed: (from, to) =>
      owed.filter((item) => item.due_on >= from && item.due_on <= to).map((item) => ({ ...item })),
    headcount: () => ({ ...headcount }),
  };
}
