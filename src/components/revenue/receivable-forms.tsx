"use client";

import { useActionState, useMemo, useState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;
type Option = { id: string; name: string };
type ContractOption = { contract_id: string; company_id: string; label: string; currency: string };
type OpenInvoice = {
  invoice_id: string;
  company_id: string;
  number: string;
  currency: string;
  outstanding: string;
  due_on: string | null;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Record an invoice the accounting system issued: its number, dates and amounts as that
 * system has them. HQ never mints a number; the due date follows the customer's terms
 * unless given.
 */
export function RecordInvoiceForm({
  action,
  companies,
  contracts,
}: {
  action: Action;
  companies: readonly Option[];
  contracts: readonly ContractOption[];
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [company, setCompany] = useState("");
  const [net, setNet] = useState("");
  const [tax, setTax] = useState("0");
  const theirs = contracts.filter((contract) => contract.company_id === company);
  const gross = (() => {
    const total = Number(net || 0) + Number(tax || 0);
    return Number.isFinite(total) ? total.toFixed(2) : "";
  })();
  return (
    <form className="stack-form" action={formAction}>
      <AttemptField state={state} />
      <Field id="invoice-company" label="Customer">
        <Select
          id="invoice-company"
          name="company_id"
          value={company}
          onChange={(event) => setCompany(event.target.value)}
          required
          disabled={isPending}
        >
          <option value="">Choose the customer</option>
          {companies.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </Select>
      </Field>
      {theirs.length > 0 && (
        <Field
          id="invoice-contract"
          label="Contract"
          hint="Ties the invoice to its billing period."
        >
          <Select id="invoice-contract" name="contract_id" disabled={isPending} defaultValue="">
            <option value="">Not tied to a contract</option>
            {theirs.map((contract) => (
              <option key={contract.contract_id} value={contract.contract_id}>
                {contract.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="form-grid">
        <Field
          id="invoice-number"
          label="Invoice number"
          hint="As the accounting system issued it."
        >
          <Input id="invoice-number" name="number" maxLength={40} required disabled={isPending} />
        </Field>
        <Field id="invoice-po" label="PO number">
          <Input id="invoice-po" name="po_number" maxLength={60} disabled={isPending} />
        </Field>
        <Field id="invoice-issued" label="Issued on">
          <Input
            id="invoice-issued"
            name="issued_on"
            type="date"
            defaultValue={today()}
            required
            disabled={isPending}
          />
        </Field>
        <Field id="invoice-due" label="Due on" hint="Empty: the customer's payment terms.">
          <Input id="invoice-due" name="due_on" type="date" disabled={isPending} />
        </Field>
        <Field id="invoice-period-start" label="Service from">
          <Input id="invoice-period-start" name="period_start" type="date" disabled={isPending} />
        </Field>
        <Field id="invoice-period-end" label="Service until">
          <Input id="invoice-period-end" name="period_end" type="date" disabled={isPending} />
        </Field>
        <Field id="invoice-currency" label="Currency">
          <Select id="invoice-currency" name="currency" defaultValue="USD" disabled={isPending}>
            {["USD", "GBP", "EUR", "CHF", "INR", "SGD"].map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="invoice-net" label="Net amount">
          <Input
            id="invoice-net"
            name="net"
            inputMode="decimal"
            placeholder="1250.00"
            value={net}
            onChange={(event) => setNet(event.target.value)}
            required
            disabled={isPending}
          />
        </Field>
        <Field id="invoice-tax" label="Tax" hint={gross ? `Total ${gross}` : undefined}>
          <Input
            id="invoice-tax"
            name="tax"
            inputMode="decimal"
            value={tax}
            onChange={(event) => setTax(event.target.value)}
            disabled={isPending}
          />
        </Field>
      </div>
      <Field id="invoice-notes" label="Notes">
        <Textarea id="invoice-notes" name="notes" rows={2} maxLength={2000} disabled={isPending} />
      </Field>
      <Button type="submit" variant="primary" disabled={isPending}>
        {isPending ? "Recording…" : "Record the invoice"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/**
 * Money in: what reached the bank, what the bank kept, and what the customer withheld as
 * tax, allocated across that customer's open invoices in the same currency. Whatever is
 * not allocated stays visible as unapplied.
 */
export function RecordReceiptForm({
  action,
  companies,
  openInvoices,
  fixedCompany,
}: {
  action: Action;
  companies: readonly Option[];
  openInvoices: readonly OpenInvoice[];
  fixedCompany?: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [company, setCompany] = useState(fixedCompany ?? "");
  const theirs = useMemo(
    () => openInvoices.filter((invoice) => invoice.company_id === company),
    [openInvoices, company],
  );
  const [currency, setCurrency] = useState(theirs[0]?.currency ?? "USD");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const shown = theirs.filter((invoice) => invoice.currency === currency);
  const applied = shown.reduce(
    (total, invoice) => total + Number(allocations[invoice.invoice_id] || 0),
    0,
  );
  return (
    <form className="stack-form" action={formAction} key={state.sentAt ?? "receipt"}>
      <AttemptField state={state} />
      {fixedCompany ? (
        <input type="hidden" name="company_id" value={fixedCompany} />
      ) : (
        <Field id="receipt-company" label="From">
          <Select
            id="receipt-company"
            name="company_id"
            value={company}
            onChange={(event) => {
              setCompany(event.target.value);
              const first = openInvoices.find(
                (invoice) => invoice.company_id === event.target.value,
              );
              if (first) setCurrency(first.currency);
              setAllocations({});
            }}
            required
            disabled={isPending}
          >
            <option value="">Choose the customer</option>
            {companies.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="form-grid">
        <Field id="receipt-date" label="Received on">
          <Input
            id="receipt-date"
            name="received_on"
            type="date"
            defaultValue={today()}
            required
            disabled={isPending}
          />
        </Field>
        <Field id="receipt-currency" label="Currency">
          <Select
            id="receipt-currency"
            name="currency"
            value={currency}
            onChange={(event) => {
              setCurrency(event.target.value);
              setAllocations({});
            }}
            disabled={isPending}
          >
            {["USD", "GBP", "EUR", "CHF", "INR", "SGD"].map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="receipt-amount" label="Reached the bank">
          <Input
            id="receipt-amount"
            name="amount"
            inputMode="decimal"
            required
            disabled={isPending}
          />
        </Field>
        <Field id="receipt-charges" label="Bank charges" hint="Kept by the banks on the way.">
          <Input
            id="receipt-charges"
            name="bank_charges"
            inputMode="decimal"
            defaultValue="0"
            disabled={isPending}
          />
        </Field>
        <Field id="receipt-withheld" label="Tax withheld" hint="By the customer, e.g. India's TDS.">
          <Input
            id="receipt-withheld"
            name="tax_withheld"
            inputMode="decimal"
            defaultValue="0"
            disabled={isPending}
          />
        </Field>
        <Field id="receipt-reference" label="Bank reference">
          <Input id="receipt-reference" name="bank_reference" maxLength={80} disabled={isPending} />
        </Field>
      </div>
      {company && (
        <fieldset className="receipt-allocations">
          <legend className="field__label">Settles</legend>
          {shown.length === 0 ? (
            <p className="muted">
              No open {currency} invoice for this customer. It will show as unapplied.
            </p>
          ) : (
            shown.map((invoice) => (
              <div key={invoice.invoice_id} className="receipt-allocation">
                <label htmlFor={`allocate-${invoice.invoice_id}`}>
                  <strong>{invoice.number}</strong>
                  <span className="quiet">
                    {" "}
                    · owes {invoice.currency} {invoice.outstanding}
                    {invoice.due_on ? ` · due ${invoice.due_on}` : ""}
                  </span>
                </label>
                <div className="receipt-allocation__input">
                  <Input
                    id={`allocate-${invoice.invoice_id}`}
                    name={`allocate:${invoice.invoice_id}`}
                    inputMode="decimal"
                    placeholder="0.00"
                    value={allocations[invoice.invoice_id] ?? ""}
                    onChange={(event) =>
                      setAllocations({ ...allocations, [invoice.invoice_id]: event.target.value })
                    }
                    disabled={isPending}
                  />
                  <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    onClick={() =>
                      setAllocations({ ...allocations, [invoice.invoice_id]: invoice.outstanding })
                    }
                    disabled={isPending}
                  >
                    All of it
                  </button>
                </div>
              </div>
            ))
          )}
          {applied > 0 && (
            <p className="page-note">
              Allocating {currency} {applied.toFixed(2)}.
            </p>
          )}
        </fieldset>
      )}
      <Field id="receipt-notes" label="Notes">
        <Input id="receipt-notes" name="notes" maxLength={400} disabled={isPending} />
      </Field>
      <Button type="submit" variant="primary" disabled={isPending || !company}>
        {isPending ? "Recording…" : "Record the receipt"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/** One collection act on one invoice: fixed fields for it, and a button that names it. */
export function CollectionForm({
  action,
  invoiceId,
  companyId,
  act,
  label,
  children,
  danger = false,
  disabled = false,
}: {
  action: Action;
  invoiceId: string;
  companyId: string;
  act: string;
  label: string;
  children?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="action" value={act} />
      {children}
      <Button
        type="submit"
        variant={danger ? "danger" : "default"}
        disabled={isPending || disabled}
      >
        {isPending ? "Saving…" : label}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/** Where a customer's invoices go and what they must carry. */
export function BillingProfileForm({
  action,
  companyId,
  profile,
  treatments,
  disabled,
}: {
  action: Action;
  companyId: string;
  profile: {
    legal_name: string;
    billing_address: string;
    country: string;
    state_code: string;
    tax_id: string;
    tax_treatment: string;
    ap_emails: string;
    po_required: boolean;
    po_number: string;
    po_amount: string | null;
    po_expires_on: string | null;
    portal_instructions: string;
    payment_terms_days: number;
    invoice_currency: string;
    withholds_tax: boolean;
    withholding_rate_percent: number | null;
  };
  treatments: ReadonlyArray<{ value: string; label: string }>;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [treatment, setTreatment] = useState(profile.tax_treatment);
  const [withholds, setWithholds] = useState(profile.withholds_tax);
  const off = isPending || disabled;
  return (
    <form className="stack-form" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="company_id" value={companyId} />
      <div className="form-grid">
        <Field id="billing-legal" label="Legal entity" hint="The name the invoice must carry.">
          <Input
            id="billing-legal"
            name="legal_name"
            defaultValue={profile.legal_name}
            maxLength={200}
            disabled={off}
          />
        </Field>
        <Field id="billing-country" label="Country">
          <Input
            id="billing-country"
            name="country"
            defaultValue={profile.country}
            maxLength={60}
            disabled={off}
          />
        </Field>
      </div>
      <Field id="billing-address" label="Billing address">
        <Textarea
          id="billing-address"
          name="billing_address"
          rows={2}
          defaultValue={profile.billing_address}
          maxLength={400}
          disabled={off}
        />
      </Field>
      <div className="form-grid">
        <Field id="billing-treatment" label="How invoices are taxed">
          <Select
            id="billing-treatment"
            name="tax_treatment"
            value={treatment}
            onChange={(event) => setTreatment(event.target.value)}
            disabled={off}
          >
            <option value="">Not set</option>
            {treatments.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="billing-tax-id" label="Their tax number" hint="VAT number, or GSTIN for India.">
          <Input
            id="billing-tax-id"
            name="tax_id"
            defaultValue={profile.tax_id}
            maxLength={40}
            disabled={off}
          />
        </Field>
        {(treatment === "gst_intra" || treatment === "gst_inter") && (
          <Field id="billing-state" label="State code" hint="The place of supply.">
            <Input
              id="billing-state"
              name="state_code"
              defaultValue={profile.state_code}
              maxLength={8}
              disabled={off}
            />
          </Field>
        )}
        <Field id="billing-currency" label="Invoice currency">
          <Select
            id="billing-currency"
            name="invoice_currency"
            defaultValue={profile.invoice_currency}
            disabled={off}
          >
            {["USD", "GBP", "EUR", "CHF", "INR", "SGD"].map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="billing-terms" label="Payment terms (days)">
          <Input
            id="billing-terms"
            name="payment_terms_days"
            inputMode="numeric"
            defaultValue={String(profile.payment_terms_days)}
            disabled={off}
          />
        </Field>
      </div>
      <Field
        id="billing-ap"
        label="Accounts payable address"
        hint="Where invoices and reminders go; separate several with commas."
      >
        <Input
          id="billing-ap"
          name="ap_emails"
          defaultValue={profile.ap_emails}
          maxLength={400}
          disabled={off}
        />
      </Field>
      <label className="checkbox">
        <input
          type="checkbox"
          name="po_required"
          defaultChecked={profile.po_required}
          disabled={off}
        />
        <span className="checkbox__label">
          Their accounts team rejects an invoice without a purchase order number
        </span>
      </label>
      <div className="form-grid">
        <Field id="billing-po" label="Current PO number">
          <Input
            id="billing-po"
            name="po_number"
            defaultValue={profile.po_number}
            maxLength={60}
            disabled={off}
          />
        </Field>
        <Field id="billing-po-amount" label="PO value">
          <Input
            id="billing-po-amount"
            name="po_amount"
            inputMode="decimal"
            defaultValue={profile.po_amount ?? ""}
            disabled={off}
          />
        </Field>
        <Field id="billing-po-expires" label="PO expires on">
          <Input
            id="billing-po-expires"
            name="po_expires_on"
            type="date"
            defaultValue={profile.po_expires_on ?? ""}
            disabled={off}
          />
        </Field>
      </div>
      <Field
        id="billing-portal"
        label="Supplier portal instructions"
        hint="If invoices must be uploaded to their portal, say how."
      >
        <Input
          id="billing-portal"
          name="portal_instructions"
          defaultValue={profile.portal_instructions}
          maxLength={400}
          disabled={off}
        />
      </Field>
      <label className="checkbox">
        <input
          type="checkbox"
          name="withholds_tax"
          checked={withholds}
          onChange={(event) => setWithholds(event.target.checked)}
          disabled={off}
        />
        <span className="checkbox__label">They withhold tax from payments (India&apos;s TDS)</span>
      </label>
      {withholds && (
        <Field id="billing-rate" label="Withholding rate (%)">
          <Input
            id="billing-rate"
            name="withholding_rate_percent"
            inputMode="decimal"
            defaultValue={
              profile.withholding_rate_percent === null
                ? ""
                : String(profile.withholding_rate_percent)
            }
            disabled={off}
          />
        </Field>
      )}
      <Button type="submit" variant="primary" disabled={off}>
        {isPending ? "Saving…" : "Save the billing profile"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/** Money given up on: a reason, under the fresh code, and a second person's approval. */
export function WriteOffForm({
  action,
  invoiceId,
  disabled,
}: {
  action: Action;
  invoiceId: string;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const off = isPending || disabled;
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <Field id="write-off-reason" label="Why it will not be paid" hint="Kept in the audit log.">
        <Input id="write-off-reason" name="reason" maxLength={400} required disabled={off} />
      </Field>
      <Button type="submit" variant="danger" disabled={off}>
        {isPending ? "Sending…" : "Write it off"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}
