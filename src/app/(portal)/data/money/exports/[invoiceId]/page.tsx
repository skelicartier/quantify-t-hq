import Link from "next/link";
import { notFound } from "next/navigation";

import { DataUnavailable } from "@/components/data/data-down";
import { RuleLineNote } from "@/components/data/duties/rule-line";
import { CopyFields } from "@/components/data/meetings/copy-fields";
import { ExportFields } from "@/components/data/money/export-fields";
import { EditHistory, MoneyActivity } from "@/components/data/money/history";
import { Money, MoneyBody, RealiseBy } from "@/components/data/money/money-bits";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { StatusPill } from "@/components/ui/status-pill";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readExport, type ExportPage } from "@/lib/data/api/money";
import { dayWords } from "@/lib/data/labels-company";
import { minorInput } from "@/lib/data/labels-duties";
import { TAX_TREATMENTS } from "@/lib/data/labels-money";
import { dataRead } from "@/lib/data/read";
import { requestNow } from "@/lib/request-time";

import {
  cancelExportAction,
  edfAction,
  exportCopyAction,
  receiptAction,
  takeBackReceiptAction,
  updateExportAction,
  updateReceiptAction,
} from "../../actions";
import "../../money.css";

export const metadata = { title: "Export invoice" };
export const dynamic = "force-dynamic";

const BASE = "/data/money/exports";
const INVOICE_ID = /^[A-Za-z0-9-]{1,64}$/;

export default async function ExportRecordPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  const { allowed, context } = await requireData(`${BASE}/${invoiceId}`);
  if (!INVOICE_ID.test(invoiceId)) notFound();
  const owner = context.me.role === "owner";
  const now = requestNow();
  const read = allowed ? await dataRead(() => readExport(invoiceId)) : null;
  if (!allowed || !read || !read.ok)
    return (
      <>
        <PageHeader title="Export invoice" />
        <div className="page-content">
          {!allowed || !read ? (
            <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
          ) : (
            !read.ok && <DataUnavailable failure={read} />
          )}
        </div>
      </>
    );
  return <ExportRecord page={read.data} now={now} owner={owner} />;
}

function ExportRecord({ page, now, owner }: { page: ExportPage; now: number; owner: boolean }) {
  const { invoice, today } = page;
  const fields = { invoice_id: invoice.invoice_id };
  const editable = !invoice.locked && !invoice.cancelled;
  const rupees = invoice.currency === "INR";
  return (
    <>
      <RecordHeader
        crumbs={[
          { href: "/data/money", label: "Money" },
          { href: BASE, label: "Export invoices" },
        ]}
        title={invoice.customer}
        status={
          <>
            <StatusPill value="invoice" label={invoice.invoice_number} tone="neutral" />
            {invoice.cancelled ? (
              <StatusPill value="cancelled" label="Cancelled" tone="neutral" />
            ) : invoice.realised.in_full_on ? (
              <StatusPill value="realised" label="Realised" tone="live" />
            ) : (
              <StatusPill value="open" label="Open" tone="attention" />
            )}
          </>
        }
        readouts={[
          { label: "Invoice day", value: dayWords(invoice.invoice_on) },
          {
            label: "Amount",
            value: <Money minor={invoice.amount_minor} currency={invoice.currency} />,
          },
          {
            label: "Realised",
            value: <Money minor={invoice.realised.minor} currency={invoice.currency} />,
          },
        ]}
        actions={
          editable ? (
            <>
              <Popover label="Edit" variant="primary" align="start" width="wide">
                <MailForm
                  action={updateExportAction}
                  fields={fields}
                  submitLabel="Save"
                  pendingLabel="Saving…"
                  className="stack-form stack-form--tight hqdata-money-form"
                >
                  <ExportFields
                    prefix="export-edit"
                    values={{
                      customer: invoice.customer,
                      country: invoice.country,
                      invoice_number: invoice.invoice_number,
                      invoice_on: invoice.invoice_on,
                      currency: invoice.currency,
                      amount: minorInput(invoice.amount_minor),
                      tax_treatment: invoice.tax_treatment,
                      purpose_code: invoice.purpose_code,
                      rail: invoice.rail,
                      notes: invoice.notes,
                    }}
                    today={today}
                  />
                </MailForm>
              </Popover>
              <Popover
                label={invoice.file ? "Attach another copy" : "Attach the invoice"}
                align="start"
                width="wide"
              >
                <MailForm
                  action={exportCopyAction}
                  fields={fields}
                  submitLabel="Attach it"
                  pendingLabel="Attaching…"
                  className="stack-form stack-form--tight hqdata-money-form"
                >
                  <CopyFields
                    prefix="export-copy"
                    label="The invoice"
                    files={page.files}
                    filesHere={page.files_here}
                    folder="Money › Export invoices"
                  />
                </MailForm>
              </Popover>
              <Popover label="Cancel the invoice" align="start">
                <MailForm
                  action={cancelExportAction}
                  fields={fields}
                  submitLabel="Cancel it"
                  pendingLabel="Cancelling…"
                  variant="danger"
                >
                  <Field
                    id="export-cancel-why"
                    label="Why"
                    hint="A cancelled invoice stays here with its copy."
                  >
                    <Input
                      id="export-cancel-why"
                      name="why"
                      required
                      minLength={5}
                      maxLength={300}
                    />
                  </Field>
                </MailForm>
              </Popover>
            </>
          ) : undefined
        }
      />
      <RecordGrid side={<Side page={page} />}>
        <MoneyBody current="exports" owner={owner} rulesHere={page.here.rules}>
          {invoice.locked && (
            <Callout tone="attention" title="This month is locked">
              {page.lock_words}
            </Callout>
          )}
          {invoice.cancelled && (
            <Callout tone="neutral" title="Cancelled">
              Cancelled on {dayWords(invoice.cancelled.on)} by {invoice.cancelled.by.name}:{" "}
              {invoice.cancelled.why}
            </Callout>
          )}
          <RecordSection id="export-clocks" title="Clocks">
            <dl className="hqdata-money-terms">
              <dt>EDF by</dt>
              <dd>
                {invoice.edf ? (
                  `Filed ${dayWords(invoice.edf.filed_on)}${invoice.edf.reference ? ` · ${invoice.edf.reference}` : ""}`
                ) : invoice.edf_by ? (
                  dayWords(invoice.edf_by)
                ) : (
                  <span className="quiet">Not worked out</span>
                )}
                <RuleLineNote line={invoice.rules.edf} />
              </dd>
              <dt>Realise by</dt>
              <dd>
                {invoice.realised.in_full_on ? (
                  `Realised in full on ${dayWords(invoice.realised.in_full_on)}.`
                ) : (
                  <RealiseBy row={invoice} />
                )}
              </dd>
            </dl>
          </RecordSection>

          <RecordSection
            id="export-receipts"
            title="Receipts"
            actions={
              editable ? (
                <Popover label="Record a receipt" align="end" width="wide">
                  <MailForm
                    action={receiptAction}
                    fields={fields}
                    submitLabel="Record it"
                    pendingLabel="Saving…"
                    className="stack-form stack-form--tight hqdata-money-form"
                  >
                    <div className="hqdata-money-form__three">
                      <Field id="receipt-on" label="Received">
                        <Input
                          id="receipt-on"
                          name="received_on"
                          type="date"
                          max={today}
                          defaultValue={today}
                          required
                        />
                      </Field>
                      <Field id="receipt-amount" label="Amount" hint={`In ${invoice.currency}.`}>
                        <Input
                          id="receipt-amount"
                          name="amount"
                          inputMode="decimal"
                          autoComplete="off"
                          required
                        />
                      </Field>
                      {!rupees && (
                        <Field
                          id="receipt-inr"
                          label="Rupees"
                          hint="What reached the bank, once known."
                        >
                          <Input
                            id="receipt-inr"
                            name="inr"
                            inputMode="decimal"
                            autoComplete="off"
                          />
                        </Field>
                      )}
                    </div>
                    <div className="hqdata-money-form__pair">
                      <Field id="receipt-fira" label="FIRA number">
                        <Input
                          id="receipt-fira"
                          name="fira_number"
                          maxLength={80}
                          autoComplete="off"
                        />
                      </Field>
                      <Field id="receipt-ebrc" label="e-BRC number">
                        <Input
                          id="receipt-ebrc"
                          name="ebrc_number"
                          maxLength={80}
                          autoComplete="off"
                        />
                      </Field>
                    </div>
                    <CopyFields
                      prefix="receipt-copy"
                      label="The FIRA"
                      files={page.files}
                      filesHere={page.files_here}
                      folder="Money › FIRAs"
                    />
                  </MailForm>
                </Popover>
              ) : undefined
            }
          >
            <DataTable
              caption="Receipts"
              columns={[
                { key: "on", label: "Received" },
                { key: "amount", label: "Amount", align: "end" },
                { key: "inr", label: "Rupees", align: "end" },
                { key: "rate", label: "Rate" },
                { key: "fira", label: "FIRA" },
                { key: "ebrc", label: "e-BRC" },
                { key: "act", label: "" },
              ]}
              columnMenu={false}
              isEmpty={invoice.receipts.length === 0}
              empty={<p className="timeline-empty">No money has come in for this invoice yet.</p>}
            >
              {invoice.receipts.map((receipt) => (
                <tr key={receipt.receipt_id}>
                  <td className="nowrap">
                    {dayWords(receipt.received_on)}
                    {receipt.taken_back && (
                      <span className="table-sub">Taken back: {receipt.taken_back.why}</span>
                    )}
                  </td>
                  <td className="data-table__num">
                    <Money minor={receipt.amount_minor} currency={invoice.currency} />
                  </td>
                  <td className="data-table__num">
                    <Money minor={receipt.inr_minor} currency="INR" />
                  </td>
                  <td className="nowrap">
                    {receipt.rate_words || <span className="quiet">—</span>}
                  </td>
                  <td className="mono hqdata-money-wrap">
                    {receipt.fira_number || (
                      <span className="hqdata-money-attention">None yet</span>
                    )}
                    {receipt.fira_file && (
                      <span className="table-sub">
                        <Link
                          className="text-link"
                          href={`/data/files/${receipt.fira_file.file_id}`}
                        >
                          {receipt.fira_file.title}
                        </Link>
                      </span>
                    )}
                  </td>
                  <td className="mono hqdata-money-wrap">
                    {receipt.ebrc_number || <span className="quiet">—</span>}
                  </td>
                  <td className="data-table__actions">
                    {!receipt.taken_back && editable && (
                      <div className="hqdata-money-actions">
                        <Popover label="Update" align="end" width="wide">
                          <MailForm
                            action={updateReceiptAction}
                            fields={{ ...fields, receipt_id: receipt.receipt_id }}
                            submitLabel="Save"
                            pendingLabel="Saving…"
                            className="stack-form stack-form--tight hqdata-money-form"
                          >
                            {!rupees && (
                              <Field id={`inr-${receipt.receipt_id}`} label="Rupees">
                                <Input
                                  id={`inr-${receipt.receipt_id}`}
                                  name="inr"
                                  inputMode="decimal"
                                  defaultValue={
                                    receipt.inr_minor === null ? "" : minorInput(receipt.inr_minor)
                                  }
                                />
                              </Field>
                            )}
                            <Field id={`fira-${receipt.receipt_id}`} label="FIRA number">
                              <Input
                                id={`fira-${receipt.receipt_id}`}
                                name="fira_number"
                                maxLength={80}
                                defaultValue={receipt.fira_number}
                              />
                            </Field>
                            <Field id={`ebrc-${receipt.receipt_id}`} label="e-BRC number">
                              <Input
                                id={`ebrc-${receipt.receipt_id}`}
                                name="ebrc_number"
                                maxLength={80}
                                defaultValue={receipt.ebrc_number}
                              />
                            </Field>
                            <CopyFields
                              prefix={`fira-copy-${receipt.receipt_id}`}
                              label="The FIRA"
                              files={page.files}
                              filesHere={page.files_here}
                              folder="Money › FIRAs"
                            />
                          </MailForm>
                        </Popover>
                        <Popover label="Take back" align="end">
                          <MailForm
                            action={takeBackReceiptAction}
                            fields={{ ...fields, receipt_id: receipt.receipt_id }}
                            submitLabel="Take it back"
                            pendingLabel="Saving…"
                          >
                            <Field id={`receipt-back-${receipt.receipt_id}`} label="Why">
                              <Input
                                id={`receipt-back-${receipt.receipt_id}`}
                                name="why"
                                required
                                minLength={5}
                                maxLength={300}
                              />
                            </Field>
                          </MailForm>
                        </Popover>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </DataTable>
            {invoice.realised.in_full_on && (
              <p className="hqdata-money__line">
                Realised in full on {dayWords(invoice.realised.in_full_on)}.
              </p>
            )}
          </RecordSection>

          <RecordSection
            id="export-edf"
            title="EDF"
            actions={
              editable ? (
                <Popover label="Record the EDF" align="end">
                  <MailForm
                    action={edfAction}
                    fields={fields}
                    submitLabel="Record it"
                    pendingLabel="Saving…"
                  >
                    <Field id="edf-on" label="Filed on">
                      <Input
                        id="edf-on"
                        name="filed_on"
                        type="date"
                        max={today}
                        required
                        defaultValue={invoice.edf?.filed_on ?? today}
                      />
                    </Field>
                    <Field id="edf-reference" label="Reference">
                      <Input
                        id="edf-reference"
                        name="reference"
                        maxLength={80}
                        autoComplete="off"
                        defaultValue={invoice.edf?.reference ?? ""}
                      />
                    </Field>
                  </MailForm>
                </Popover>
              ) : undefined
            }
          >
            <p className="hqdata-money__line">
              {invoice.edf
                ? `Filed on ${dayWords(invoice.edf.filed_on)}${invoice.edf.reference ? `, reference ${invoice.edf.reference}` : ""}. One form may cover the month.`
                : "Not recorded yet. One form may cover the month's invoices."}
            </p>
          </RecordSection>

          <RecordSection id="export-checks" title="Checks">
            {invoice.checks.length === 0 ? (
              <p className="timeline-empty">Nothing to check.</p>
            ) : (
              <ul className="hqdata-money__checks">
                {invoice.checks.map((check) => (
                  <li key={check}>{check}</li>
                ))}
              </ul>
            )}
          </RecordSection>

          <RecordSection id="export-edits" title="Edit history">
            <EditHistory caption="Edit history" edits={invoice.edits} now={now} />
          </RecordSection>

          <RecordSection id="export-activity" title="Activity">
            <MoneyActivity events={page.events} now={now} />
          </RecordSection>
        </MoneyBody>
      </RecordGrid>
    </>
  );
}

function Side({ page }: { page: ExportPage }) {
  const { invoice } = page;
  const lutLine = invoice.checks.find((check) => check.startsWith("No LUT"));
  return (
    <Properties title="The invoice">
      <Property label="Invoice number" mono>
        {invoice.invoice_number}
      </Property>
      <Property label="Country">
        {invoice.country || <span className="quiet">Not given</span>}
      </Property>
      <Property label="Tax treatment">
        {TAX_TREATMENTS[invoice.tax_treatment]}
        {invoice.tax_treatment === "under_lut" &&
          (page.lut ? (
            <span className="table-sub">
              LUT {page.lut.arn}, filed {dayWords(page.lut.filed_on)}
            </span>
          ) : (
            lutLine && <span className="table-sub hqdata-money-attention">{lutLine}</span>
          ))}
      </Property>
      <Property label="Purpose code" mono>
        {invoice.purpose_code || "—"}
      </Property>
      <Property label="How it comes in">
        {invoice.rail || <span className="quiet">Not given</span>}
      </Property>
      <Property label="The invoice">
        {invoice.file ? (
          <>
            <Link className="text-link" href={`/data/files/${invoice.file.file_id}`}>
              {invoice.file.title}
            </Link>
            {invoice.held_until && (
              <span className="table-sub">Kept until {dayWords(invoice.held_until)}</span>
            )}
          </>
        ) : (
          <span className="hqdata-money-attention">None attached</span>
        )}
      </Property>
      {invoice.notes && (
        <Property label="Notes">
          <span className="hqdata-money-wrap">{invoice.notes}</span>
        </Property>
      )}
    </Properties>
  );
}
