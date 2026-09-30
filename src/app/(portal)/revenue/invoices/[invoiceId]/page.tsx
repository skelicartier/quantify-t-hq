import Link from "next/link";
import { notFound } from "next/navigation";

import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import { workInvoiceAction, writeOffAction } from "@/app/(portal)/revenue/receivables/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
import { CollectionForm, WriteOffForm } from "@/components/revenue/receivable-forms";
import { CollectionPill, InvoiceStatusPill } from "@/components/revenue/receivable-pills";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/shell/page-header";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readInvoice, type InvoiceDetail } from "@/lib/api/receivables";
import { formatAbsolute, formatDate, formatMoney } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Invoice" };
export const dynamic = "force-dynamic";

const EVENT_LABELS: Record<string, string> = {
  recorded: "Recorded",
  send_reminder: "Reminder sent",
  promise: "Promise to pay",
  dispute: "Disputed",
  escalate: "Escalated",
  resume: "Resumed",
  note: "Note",
  void: "Voided",
  payment: "Payment",
  written_off: "Written off",
};

type Params = Promise<{ invoiceId: string }>;

/**
 * One invoice and the work on it: what it owes, the reminder drafted for the step it is
 * at (read, edit, send), a promise or a dispute that pauses reminders, the payments that
 * settled it, and — past hope — a write-off a second person approves.
 */
export default async function InvoicePage({ params }: { params: Params }) {
  const { invoiceId } = await params;
  const context = await requireStaff(`/revenue/invoices/${invoiceId}`);
  if (!hasCapability(context, "revenue:read")) {
    return (
      <>
        <PageHeader eyebrow="Business" title="Invoice" />
        <Callout tone="neutral">Receivables are visible to Sales, Admins and Owners.</Callout>
      </>
    );
  }
  let detail: InvoiceDetail | null = null;
  try {
    detail = await readInvoice(context.token, invoiceId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (detail === null) {
    return (
      <>
        <PageHeader eyebrow="Receivables" title="Invoice" />
        <Callout tone="danger" role="alert">
          This invoice could not be read just now.
        </Callout>
      </>
    );
  }
  const now = requestNow();
  const { invoice } = detail;
  const canWrite = hasCapability(context, "revenue:write");
  const open = invoice.status === "open" || invoice.status === "partially_paid";
  const money = (value: string | null) =>
    value === null ? "—" : formatMoney(Number(value), invoice.currency);
  const fresh = context.me.sudo_fresh;
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  const tomorrow = new Date(now + 86_400_000).toISOString().slice(0, 10);

  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/revenue/receivables", label: "Receivables" }]}
        title={`Invoice ${invoice.number}`}
        status={
          <>
            <InvoiceStatusPill status={invoice.status} />
            {open && <CollectionPill state={invoice.collection_state} />}
          </>
        }
        readouts={[
          { label: "Total", value: money(invoice.gross) },
          { label: "Outstanding", value: money(invoice.outstanding) },
          { label: "Due", value: formatDate(invoice.due_on) },
          {
            label: "Days late",
            value: invoice.days_past_due > 0 ? invoice.days_past_due : "—",
          },
        ]}
      />
      {invoice.export_flag && (
        <Callout tone="attention" compact>
          {invoice.export_flag}
        </Callout>
      )}
      {invoice.status === "uncollectible" && invoice.bad_debt_relief_from && (
        <Callout tone="neutral" compact>
          Written off. UK VAT bad-debt relief can be claimed from{" "}
          {formatDate(invoice.bad_debt_relief_from)} if this was a UK VAT supply.
        </Callout>
      )}
      <RecordGrid
        side={
          <>
            <Properties title="Invoice">
              <Property label="Customer">
                <Link href={`/companies/${invoice.company.company_id}?tab=billing`}>
                  {invoice.company.name}
                </Link>
              </Property>
              <Property label="Issued">{formatDate(invoice.issued_on)}</Property>
              <Property label="Service">
                {invoice.period_start
                  ? `${formatDate(invoice.period_start)} – ${formatDate(invoice.period_end)}`
                  : "—"}
              </Property>
              <Property label="Net">{money(invoice.net)}</Property>
              <Property label="Tax">{money(invoice.tax)}</Property>
              <Property label="Paid">{money(invoice.paid)}</Property>
              <Property label="PO">{invoice.po_number || "—"}</Property>
              {invoice.promised_on && (
                <Property label="Promised">
                  {money(invoice.promised_amount)} by {formatDate(invoice.promised_on)}
                </Property>
              )}
              {invoice.dispute_reason && (
                <Property label="Disputed">{invoice.dispute_reason}</Property>
              )}
              {invoice.void_reason && <Property label="Void">{invoice.void_reason}</Property>}
              <Property label="Reminders">{invoice.reminders_sent} sent</Property>
            </Properties>
            <Properties title="Payments">
              {detail.payments.length === 0 ? (
                <Property label="Received">Nothing yet</Property>
              ) : (
                detail.payments.map((payment) => (
                  <Property key={payment.receipt_id} label={formatDate(payment.received_on)}>
                    {money(payment.amount)}
                    {payment.bank_reference && (
                      <span className="quiet"> · {payment.bank_reference}</span>
                    )}
                  </Property>
                ))
              )}
            </Properties>
          </>
        }
      >
        {canWrite && open && (
          <RecordSection id="collect" title="Collect">
            {detail.profile_gaps.length > 0 && (
              <Callout tone="attention" compact>
                Before this invoice is chased:{" "}
                {detail.profile_gaps.map((gap) => gap.replace(/\.$/, "")).join("; ")}.{" "}
                <Link href={`/companies/${invoice.company.company_id}?tab=billing`}>
                  Complete the billing profile
                </Link>
                .
              </Callout>
            )}
            {detail.reminder_draft && invoice.next_reminder ? (
              <Card
                title={
                  invoice.next_reminder.due_now
                    ? `Reminder ${invoice.next_reminder.number} is due`
                    : `Reminder ${invoice.next_reminder.number} is due on ${formatDate(invoice.next_reminder.on)}`
                }
                titleAs="h3"
                description={
                  detail.send_to.length
                    ? `Goes to ${detail.send_to.join(", ")} when you press send — read it and change anything first.`
                    : "Add the accounts payable address to the billing profile to send it."
                }
              >
                <CollectionForm
                  action={workInvoiceAction}
                  invoiceId={invoice.invoice_id}
                  companyId={invoice.company.company_id}
                  act="send_reminder"
                  label="Send the reminder"
                  disabled={detail.send_to.length === 0}
                >
                  <Field id="reminder-subject" label="Subject">
                    <Input
                      id="reminder-subject"
                      name="subject"
                      defaultValue={detail.reminder_draft.subject}
                      maxLength={200}
                    />
                  </Field>
                  <Field id="reminder-body" label="Message">
                    <Textarea
                      id="reminder-body"
                      name="body"
                      rows={9}
                      defaultValue={detail.reminder_draft.body}
                      maxLength={4000}
                    />
                  </Field>
                </CollectionForm>
              </Card>
            ) : (
              <p className="page-note">
                {invoice.collection_state === "promised"
                  ? "Reminders are paused until the promised date."
                  : invoice.collection_state === "disputed"
                    ? "Reminders are paused while the dispute stands."
                    : "No reminder is waiting."}
              </p>
            )}
            <div className="form-grid">
              <Card title="They promised to pay" titleAs="h3">
                <CollectionForm
                  action={workInvoiceAction}
                  invoiceId={invoice.invoice_id}
                  companyId={invoice.company.company_id}
                  act="promise"
                  label="Record the promise"
                >
                  <Field id="promise-date" label="By">
                    <Input
                      id="promise-date"
                      name="promised_on"
                      type="date"
                      defaultValue={tomorrow}
                    />
                  </Field>
                  <Field id="promise-amount" label="Amount" hint="Empty: all that is owed.">
                    <Input id="promise-amount" name="promised_amount" inputMode="decimal" />
                  </Field>
                </CollectionForm>
              </Card>
              <Card title="They dispute it" titleAs="h3">
                <CollectionForm
                  action={workInvoiceAction}
                  invoiceId={invoice.invoice_id}
                  companyId={invoice.company.company_id}
                  act="dispute"
                  label="Record the dispute"
                >
                  <Field id="dispute-reason" label="What they dispute">
                    <Input id="dispute-reason" name="reason" maxLength={400} />
                  </Field>
                </CollectionForm>
              </Card>
            </div>
            <div className="form-grid">
              <Card title="A note on the timeline" titleAs="h3">
                <CollectionForm
                  action={workInvoiceAction}
                  invoiceId={invoice.invoice_id}
                  companyId={invoice.company.company_id}
                  act="note"
                  label="Add the note"
                >
                  <Field id="invoice-note" label="Note">
                    <Textarea id="invoice-note" name="note" rows={2} maxLength={2000} />
                  </Field>
                </CollectionForm>
              </Card>
              <Card
                title="Chasing"
                titleAs="h3"
                description="Escalate for a call, or resume reminders after a promise or a dispute."
              >
                <div className="inline-actions">
                  <CollectionForm
                    action={workInvoiceAction}
                    invoiceId={invoice.invoice_id}
                    companyId={invoice.company.company_id}
                    act="escalate"
                    label="Escalate"
                  />
                  <CollectionForm
                    action={workInvoiceAction}
                    invoiceId={invoice.invoice_id}
                    companyId={invoice.company.company_id}
                    act="resume"
                    label="Resume reminders"
                  />
                </div>
              </Card>
            </div>
          </RecordSection>
        )}
        {canWrite && open && (
          <RecordSection id="end" title="If it will not be paid">
            <SudoGate
              action={confirmSudoAction}
              fresh={fresh}
              untilLabel={untilLabel}
              returnPath={`/revenue/invoices/${invoice.invoice_id}`}
              purpose="A write-off needs a fresh code from your authenticator app, and a second Owner or Admin approves it."
            />
            <div className="form-grid">
              <Card
                title="Write it off"
                titleAs="h3"
                description="Money given up on. A second Owner or Admin approves it once one exists."
              >
                <WriteOffForm
                  action={writeOffAction}
                  invoiceId={invoice.invoice_id}
                  disabled={!fresh}
                />
              </Card>
              {invoice.paid === "0.00" && (
                <Card
                  title="Void it"
                  titleAs="h3"
                  description="Only as the accounting system voided it; an invoice is never deleted."
                >
                  <CollectionForm
                    action={workInvoiceAction}
                    invoiceId={invoice.invoice_id}
                    companyId={invoice.company.company_id}
                    act="void"
                    label="Void the invoice"
                    danger
                  >
                    <Field id="void-reason" label="Why it is void">
                      <Input id="void-reason" name="reason" maxLength={400} />
                    </Field>
                  </CollectionForm>
                </Card>
              )}
            </div>
          </RecordSection>
        )}
        <RecordSection id="timeline" title="Timeline">
          <ol className="invoice-timeline">
            {detail.events.map((event, index) => (
              <li key={`${event.at}-${index}`} className="invoice-timeline__row">
                <span className="invoice-timeline__kind">
                  {EVENT_LABELS[event.kind] ?? event.kind}
                </span>
                <span className="invoice-timeline__detail">
                  {event.detail}
                  <span className="quiet">
                    {" "}
                    · {event.by || "HQ"} · <Timestamp value={event.at} now={now} mode="relative" />
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </RecordSection>
      </RecordGrid>
    </>
  );
}
