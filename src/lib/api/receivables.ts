import "server-only";

import { z } from "zod";

import { pendingApprovalSchema } from "@/lib/api/approval-schema";
import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });
const companyRef = z.object({ company_id: z.string(), name: z.string() });

export const INVOICE_STATUSES = [
  "open",
  "partially_paid",
  "paid",
  "void",
  "uncollectible",
] as const;
export const COLLECTION_STATES = [
  "none",
  "reminded",
  "promised",
  "disputed",
  "escalated",
  "written_off",
] as const;

/** Money travels as exact decimal text ("1250.00"), never a float. */
const amount = z.string();

export const invoiceSchema = z.object({
  invoice_id: z.string(),
  company: companyRef,
  contract_id: z.string(),
  number: z.string(),
  issued_on: z.string().nullable(),
  period_start: z.string().nullable(),
  period_end: z.string().nullable(),
  due_on: z.string().nullable(),
  currency: z.string(),
  net: amount,
  tax: amount,
  gross: amount,
  paid: amount,
  outstanding: amount,
  status: z.enum(INVOICE_STATUSES),
  collection_state: z.enum(COLLECTION_STATES),
  days_past_due: z.number(),
  bucket: z.string(),
  po_number: z.string(),
  reminders_sent: z.number(),
  last_reminder_at: z.string().nullable(),
  next_reminder: z
    .object({
      offset: z.number(),
      on: z.string(),
      due_now: z.boolean(),
      number: z.number(),
      step: z.number(),
    })
    .nullable(),
  promised_on: z.string().nullable(),
  promised_amount: amount.nullable(),
  dispute_reason: z.string(),
  void_reason: z.string(),
  paid_on: z.string().nullable(),
  export_flag: z.string(),
  bad_debt_relief_from: z.string().nullable(),
  notes: z.string(),
});
export type Invoice = z.infer<typeof invoiceSchema>;

const scheduleItem = z.object({
  contract_id: z.string(),
  company_id: z.string(),
  company_name: z.string(),
  plan_name: z.string(),
  period_start: z.string(),
  period_end: z.string(),
  currency: z.string(),
  amount,
  cadence: z.string(),
  days_late: z.number().optional(),
});
export type ScheduleItem = z.infer<typeof scheduleItem>;

const receivablesSchema = okEnvelope.extend({
  as_of: z.string(),
  ageing: z.record(z.string(), z.record(z.string(), amount)),
  buckets: z.array(z.object({ key: z.string(), label: z.string() })),
  worklist: z.array(invoiceSchema),
  reminders_due: z.number(),
  disputed: z.number(),
  promised: z.number(),
  to_bill: z.array(scheduleItem),
  billed_late: z.array(scheduleItem),
  tracked_from: z.string().nullable(),
  withheld_awaiting_certificate: z.record(z.string(), amount),
  invoices: z.number(),
});
export type Receivables = z.infer<typeof receivablesSchema>;

export function readReceivables(token: string) {
  return fetchHqJson("hq/receivables", receivablesSchema, { token });
}

export function readInvoices(token: string, query: { company_id?: string; status?: string } = {}) {
  const filtered: Record<string, string> = {};
  for (const [name, value] of Object.entries(query)) if (value) filtered[name] = value;
  return fetchHqJson("hq/invoices", okEnvelope.extend({ invoices: z.array(invoiceSchema) }), {
    token,
    query: filtered,
  });
}

const invoiceDetailSchema = okEnvelope.extend({
  invoice: invoiceSchema,
  events: z.array(
    z.object({ kind: z.string(), detail: z.string(), by: z.string(), at: z.string().nullable() }),
  ),
  payments: z.array(
    z.object({
      receipt_id: z.string(),
      amount,
      received_on: z.string().nullable(),
      bank_reference: z.string(),
    }),
  ),
  reminder_draft: z.object({ subject: z.string(), body: z.string() }).nullable(),
  send_to: z.array(z.string()),
  profile_gaps: z.array(z.string()),
});
export type InvoiceDetail = z.infer<typeof invoiceDetailSchema>;

export function readInvoice(token: string, invoiceId: string) {
  return fetchHqJson(`hq/invoices/${invoiceId}`, invoiceDetailSchema, { token });
}

export function recordInvoice(token: string, body: Record<string, string>) {
  return postHqJson("hq/invoices/create", okEnvelope.extend({ invoice: invoiceSchema }), {
    token,
    body,
  });
}

export function workInvoice(token: string, invoiceId: string, body: Record<string, string>) {
  return postHqJson(
    `hq/invoices/${invoiceId}/collection`,
    okEnvelope.extend({ invoice: invoiceSchema }),
    { token, body },
  );
}

export function writeOffInvoice(token: string, invoiceId: string, reason: string) {
  return postHqJson(
    `hq/invoices/${invoiceId}/write-off`,
    z.union([
      pendingApprovalSchema,
      okEnvelope.extend({
        written_off: z.literal(true),
        bad_debt_relief_from: z.string().nullable(),
      }),
    ]),
    { token, body: { reason } },
  );
}

export const receiptSchema = z.object({
  receipt_id: z.string(),
  company: companyRef,
  received_on: z.string().nullable(),
  currency: z.string(),
  amount,
  bank_charges: amount,
  tax_withheld: amount,
  certificate_received_on: z.string().nullable(),
  bank_reference: z.string(),
  notes: z.string(),
  allocations: z.array(z.object({ invoice_id: z.string(), number: z.string(), amount })),
  unapplied: amount,
});
export type Receipt = z.infer<typeof receiptSchema>;

export function readReceipts(token: string, companyId = "") {
  return fetchHqJson("hq/receipts", okEnvelope.extend({ receipts: z.array(receiptSchema) }), {
    token,
    query: companyId ? { company_id: companyId } : {},
  });
}

export function recordReceipt(
  token: string,
  body: {
    company_id: string;
    received_on: string;
    currency: string;
    amount: string;
    bank_charges: string;
    tax_withheld: string;
    bank_reference: string;
    notes: string;
    allocations: Array<{ invoice_id: string; amount: string }>;
  },
) {
  return postHqJson("hq/receipts/create", okEnvelope.extend({ receipt: receiptSchema }), {
    token,
    body,
  });
}

export function recordCertificate(token: string, receiptId: string, receivedOn: string) {
  return postHqJson(
    `hq/receipts/${receiptId}/certificate`,
    okEnvelope.extend({ certificate_received_on: z.string().nullable() }),
    { token, body: { received_on: receivedOn } },
  );
}

export const billingProfileSchema = z.object({
  company_id: z.string(),
  exists: z.boolean(),
  legal_name: z.string(),
  billing_address: z.string(),
  country: z.string(),
  state_code: z.string(),
  tax_id: z.string(),
  tax_treatment: z.string(),
  ap_emails: z.string(),
  po_required: z.boolean(),
  po_number: z.string(),
  po_amount: amount.nullable(),
  po_expires_on: z.string().nullable(),
  portal_instructions: z.string(),
  payment_terms_days: z.number(),
  invoice_currency: z.string(),
  withholds_tax: z.boolean(),
  withholding_rate_percent: z.number().nullable(),
  updated_at: z.string().nullable(),
  gaps: z.array(z.string()),
});
export type BillingProfile = z.infer<typeof billingProfileSchema>;

const billingSchema = okEnvelope.extend({
  profile: billingProfileSchema,
  treatments: z.array(z.object({ value: z.string(), label: z.string() })),
});
export type Billing = z.infer<typeof billingSchema>;

export function readBilling(token: string, companyId: string) {
  return fetchHqJson(`hq/companies/${companyId}/billing`, billingSchema, { token });
}

export function updateBilling(token: string, companyId: string, body: Record<string, unknown>) {
  return postHqJson(
    `hq/companies/${companyId}/billing/update`,
    okEnvelope.extend({ profile: billingProfileSchema }),
    { token, body },
  );
}
