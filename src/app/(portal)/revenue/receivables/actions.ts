"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError } from "@/lib/api/core";
import * as rx from "@/lib/api/receivables";
import { fieldValue, refusalMessage } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

const NOT_WRITER: ActionState = {
  status: "error",
  message: "Recording money is for Owners and Admins.",
};

function refusal(error: unknown): ActionState {
  if (error instanceof HqApiRequestError) {
    if (error.details["sudo_required"])
      return { status: "error", message: "Confirm it's you first: enter a fresh code above." };
    const detail = Object.values(error.details).find((value) => typeof value === "string");
    if (error.code === "malformed_request" && typeof detail === "string")
      return { status: "error", message: `${detail.charAt(0).toUpperCase()}${detail.slice(1)}.` };
  }
  return { status: "error", message: refusalMessage(error) };
}

function refresh(invoiceId?: string, companyId?: string) {
  revalidatePath("/revenue/receivables");
  if (invoiceId) revalidatePath(`/revenue/invoices/${invoiceId}`);
  if (companyId) revalidatePath(`/companies/${companyId}`);
}

export async function recordInvoiceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/revenue/receivables");
  if (!hasCapability(context, "revenue:write")) return NOT_WRITER;
  const body: Record<string, string> = {};
  for (const [name, limit] of [
    ["company_id", 64],
    ["contract_id", 64],
    ["number", 40],
    ["issued_on", 10],
    ["period_start", 10],
    ["period_end", 10],
    ["due_on", 10],
    ["currency", 3],
    ["net", 20],
    ["tax", 20],
    ["po_number", 60],
    ["notes", 2000],
  ] as const) {
    const value = fieldValue(formData, name, limit).trim();
    if (value) body[name] = value;
  }
  let invoiceId = "";
  try {
    invoiceId = (await rx.recordInvoice(context.token, body)).invoice.invoice_id;
  } catch (error) {
    return refusal(error);
  }
  refresh(invoiceId, body.company_id);
  redirect(`/revenue/invoices/${invoiceId}`);
}

export async function workInvoiceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const invoiceId = fieldValue(formData, "invoice_id", 64);
  const context = await requireStaff(`/revenue/invoices/${invoiceId}`);
  if (!hasCapability(context, "revenue:write")) return NOT_WRITER;
  const action = fieldValue(formData, "action", 20);
  const body: Record<string, string> = { action };
  for (const [name, limit] of [
    ["subject", 200],
    ["body", 4000],
    ["promised_on", 10],
    ["promised_amount", 20],
    ["reason", 400],
    ["note", 2000],
  ] as const) {
    const value = fieldValue(formData, name, limit);
    if (value.trim()) body[name] = value;
  }
  try {
    await rx.workInvoice(context.token, invoiceId, body);
  } catch (error) {
    return refusal(error);
  }
  refresh(invoiceId, fieldValue(formData, "company_id", 64));
  const said: Record<string, string> = {
    send_reminder: "Sent. The timeline shows exactly what went.",
    promise: "Promise recorded. Reminders pause until then.",
    dispute: "Dispute recorded. Reminders pause until you resume.",
    escalate: "Escalated.",
    resume: "Collection resumed.",
    note: "Note added.",
    void: "Voided.",
  };
  return { status: "sent", message: said[action] ?? "Saved.", sentAt: Date.now() };
}

export async function writeOffAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const invoiceId = fieldValue(formData, "invoice_id", 64);
  const context = await requireStaff(`/revenue/invoices/${invoiceId}`);
  if (!hasCapability(context, "revenue:write")) return NOT_WRITER;
  const reason = fieldValue(formData, "reason", 400).trim();
  if (!reason) return { status: "error", message: "Say why it will not be paid." };
  let done: Awaited<ReturnType<typeof rx.writeOffInvoice>>;
  try {
    done = await rx.writeOffInvoice(context.token, invoiceId, reason);
  } catch (error) {
    return refusal(error);
  }
  refresh(invoiceId);
  revalidatePath("/admin/approvals");
  if ("pending_approval" in done)
    return {
      status: "sent",
      message:
        "Sent for approval: a second Owner or Admin must approve it within 48 hours. You will be mailed either way.",
      sentAt: Date.now(),
    };
  return {
    status: "sent",
    message: done.bad_debt_relief_from
      ? `Written off. UK VAT bad-debt relief can be claimed from ${done.bad_debt_relief_from}.`
      : "Written off.",
    sentAt: Date.now(),
  };
}

export async function recordReceiptAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/revenue/receivables");
  if (!hasCapability(context, "revenue:write")) return NOT_WRITER;
  const companyId = fieldValue(formData, "company_id", 64);
  const allocations: Array<{ invoice_id: string; amount: string }> = [];
  for (const [name, value] of formData.entries()) {
    if (!name.startsWith("allocate:") || typeof value !== "string" || !value.trim()) continue;
    allocations.push({ invoice_id: name.slice("allocate:".length, 100), amount: value.trim() });
  }
  try {
    await rx.recordReceipt(context.token, {
      company_id: companyId,
      received_on: fieldValue(formData, "received_on", 10),
      currency: fieldValue(formData, "currency", 3),
      amount: fieldValue(formData, "amount", 20) || "0",
      bank_charges: fieldValue(formData, "bank_charges", 20) || "0",
      tax_withheld: fieldValue(formData, "tax_withheld", 20) || "0",
      bank_reference: fieldValue(formData, "bank_reference", 80),
      notes: fieldValue(formData, "notes", 400),
      allocations,
    });
  } catch (error) {
    return refusal(error);
  }
  refresh(undefined, companyId);
  for (const allocation of allocations)
    revalidatePath(`/revenue/invoices/${allocation.invoice_id}`);
  return {
    status: "sent",
    message:
      allocations.length === 0
        ? "Recorded. Nothing was allocated, so it shows as unapplied."
        : `Recorded against ${allocations.length} ${allocations.length === 1 ? "invoice" : "invoices"}.`,
    sentAt: Date.now(),
  };
}

export async function certificateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/revenue/receivables");
  if (!hasCapability(context, "revenue:write")) return NOT_WRITER;
  try {
    await rx.recordCertificate(
      context.token,
      fieldValue(formData, "receipt_id", 64),
      fieldValue(formData, "received_on", 10) || new Date().toISOString().slice(0, 10),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh(undefined, fieldValue(formData, "company_id", 64));
  return { status: "sent", message: "Certificate recorded.", sentAt: Date.now() };
}

export async function updateBillingAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const companyId = fieldValue(formData, "company_id", 64);
  const context = await requireStaff(`/companies/${companyId}?tab=billing`);
  if (!hasCapability(context, "revenue:write")) return NOT_WRITER;
  const body: Record<string, unknown> = {};
  for (const [name, limit] of [
    ["legal_name", 200],
    ["billing_address", 400],
    ["country", 60],
    ["state_code", 8],
    ["tax_id", 40],
    ["tax_treatment", 20],
    ["ap_emails", 400],
    ["po_number", 60],
    ["po_amount", 20],
    ["po_expires_on", 10],
    ["portal_instructions", 400],
    ["payment_terms_days", 4],
    ["invoice_currency", 3],
    ["withholding_rate_percent", 6],
  ] as const) {
    body[name] = fieldValue(formData, name, limit).trim();
  }
  body.po_required = formData.get("po_required") === "on";
  body.withholds_tax = formData.get("withholds_tax") === "on";
  try {
    await rx.updateBilling(context.token, companyId, body);
  } catch (error) {
    return refusal(error);
  }
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/revenue/receivables");
  return { status: "sent", message: "Saved.", sentAt: Date.now() };
}
