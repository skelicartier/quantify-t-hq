import Link from "next/link";
import { notFound } from "next/navigation";

import { DataUnavailable } from "@/components/data/data-down";
import { RuleLineNote } from "@/components/data/duties/rule-line";
import { CopyFields } from "@/components/data/meetings/copy-fields";
import { BILL_FOLDER, BillFields } from "@/components/data/money/bill-fields";
import { EditHistory, MoneyActivity } from "@/components/data/money/history";
import { BillStatePill, Money, MoneyBody } from "@/components/data/money/money-bits";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/field";
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
import { readBill, type BillPage } from "@/lib/data/api/money";
import { dayWords } from "@/lib/data/labels-company";
import { minorInput } from "@/lib/data/labels-duties";
import {
  GST_TREATMENTS,
  PAY_METHODS,
  RESIDENCIES,
  TDS_DECISIONS,
  TDS_GUIDE,
  TDS_KINDS,
} from "@/lib/data/labels-money";
import { dataRead } from "@/lib/data/read";
import { requestNow } from "@/lib/request-time";

import {
  approveBillAction,
  billCopyAction,
  cancelBillAction,
  challanAction,
  deductionAction,
  paymentAction,
  takeBackPaymentAction,
  updateBillAction,
} from "../../actions";
import "../../money.css";

export const metadata = { title: "Bill" };
export const dynamic = "force-dynamic";

const BASE = "/data/money";
const BILL_ID = /^[A-Za-z0-9-]{1,64}$/;

export default async function BillRecordPage({ params }: { params: Promise<{ billId: string }> }) {
  const { billId } = await params;
  const { allowed, context } = await requireData(`${BASE}/bills/${billId}`);
  if (!BILL_ID.test(billId)) notFound();
  const owner = context.me.role === "owner";
  const now = requestNow();
  const read = allowed ? await dataRead(() => readBill(billId)) : null;
  if (!allowed || !read || !read.ok)
    return (
      <>
        <PageHeader title="Bill" />
        <div className="page-content">
          {!allowed || !read ? (
            <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
          ) : (
            !read.ok && <DataUnavailable failure={read} />
          )}
        </div>
      </>
    );
  return <BillRecord page={read.data} now={now} owner={owner} />;
}

function BillRecord({ page, now, owner }: { page: BillPage; now: number; owner: boolean }) {
  const { bill, today } = page;
  const fields = { bill_id: bill.bill_id };
  const editable = !bill.locked && !bill.cancelled;
  const foreign = bill.currency !== "INR";
  const live = bill.payments.filter((payment) => payment.taken_back === null);
  return (
    <>
      <RecordHeader
        crumbs={[
          { href: BASE, label: "Money" },
          { href: `${BASE}?view=all`, label: "Bills" },
        ]}
        title={bill.vendor_name}
        status={
          <>
            <StatusPill value="invoice" label={bill.invoice_number} tone="neutral" />
            <BillStatePill state={bill.state} />
          </>
        }
        readouts={[
          { label: "Invoice day", value: dayWords(bill.invoice_on) },
          { label: "Total", value: <Money minor={bill.total_minor} currency={bill.currency} /> },
          { label: "Open", value: <Money minor={bill.open_minor} currency={bill.currency} /> },
        ]}
        actions={
          editable ? (
            <>
              <Popover label="Edit" variant="primary" align="start" width="wide">
                <MailForm
                  action={updateBillAction}
                  fields={fields}
                  submitLabel="Save"
                  pendingLabel="Saving…"
                  className="stack-form stack-form--tight hqdata-money-form"
                >
                  <BillFields
                    prefix="bill-edit"
                    values={{
                      vendor_id: bill.vendor_id,
                      invoice_number: bill.invoice_number,
                      invoice_on: bill.invoice_on,
                      accepted_on: bill.accepted_on ?? "",
                      description: bill.description,
                      currency: bill.currency,
                      taxable: minorInput(bill.taxable_minor),
                      gst: minorInput(bill.gst_minor),
                      total: minorInput(bill.total_minor),
                      gst_treatment: bill.gst_treatment || "charged_on_the_bill",
                      category_id: bill.category_id ?? "",
                      tds_kind: bill.tds.kind,
                      pay_by: bill.pay_by_typed ?? "",
                    }}
                    vendors={page.vendors
                      .filter((vendor) => !vendor.retired || vendor.vendor_id === bill.vendor_id)
                      .map((vendor) => ({ id: vendor.vendor_id, name: vendor.name }))}
                    categories={page.categories.map((category) => ({
                      id: category.category_id,
                      name: category.name,
                    }))}
                    today={today}
                  />
                </MailForm>
              </Popover>
              <Popover
                label={bill.file ? "Attach another copy" : "Attach the invoice"}
                align="start"
                width="wide"
              >
                <MailForm
                  action={billCopyAction}
                  fields={fields}
                  submitLabel="Attach it"
                  pendingLabel="Attaching…"
                  className="stack-form stack-form--tight hqdata-money-form"
                >
                  <CopyFields
                    prefix="bill-copy"
                    label="The invoice"
                    files={page.files}
                    filesHere={page.files_here}
                    folder={BILL_FOLDER}
                  />
                </MailForm>
              </Popover>
              {!bill.approved && (
                <Popover label="Approve" align="start">
                  <MailForm
                    action={approveBillAction}
                    fields={fields}
                    submitLabel="Approve it"
                    pendingLabel="Saving…"
                  >
                    <p className="field__hint">Recorded with your name and today&apos;s day.</p>
                  </MailForm>
                </Popover>
              )}
              <Popover label="Cancel the bill" align="start">
                <MailForm
                  action={cancelBillAction}
                  fields={fields}
                  submitLabel="Cancel it"
                  pendingLabel="Cancelling…"
                  variant="danger"
                >
                  <Field
                    id="cancel-why"
                    label="Why"
                    hint="A cancelled bill stays here with its copy."
                  >
                    <Input id="cancel-why" name="why" required minLength={5} maxLength={300} />
                  </Field>
                </MailForm>
              </Popover>
            </>
          ) : undefined
        }
      />
      <RecordGrid side={<Side page={page} />}>
        <MoneyBody current="bills" owner={owner} rulesHere={page.here.rules}>
          {bill.locked && (
            <Callout tone="attention" title="This month is locked">
              {page.lock_words}
            </Callout>
          )}
          {bill.cancelled && (
            <Callout tone="neutral" title="Cancelled">
              Cancelled on {dayWords(bill.cancelled.on)} by {bill.cancelled.by.name}:{" "}
              {bill.cancelled.why}
            </Callout>
          )}
          <RecordSection
            id="bill-pay"
            title="To pay"
            actions={
              editable ? (
                <Popover label="Record a payment" align="end" width="wide">
                  <MailForm
                    action={paymentAction}
                    fields={fields}
                    submitLabel="Record it"
                    pendingLabel="Saving…"
                    className="stack-form stack-form--tight hqdata-money-form"
                  >
                    <div className="hqdata-money-form__pair">
                      <Field id="pay-on" label="Paid on">
                        <Input
                          id="pay-on"
                          name="paid_on"
                          type="date"
                          max={today}
                          defaultValue={today}
                          required
                        />
                      </Field>
                      <Field
                        id="pay-amount"
                        label="Amount"
                        hint={`In ${bill.currency}, as on the bill.`}
                      >
                        <Input
                          id="pay-amount"
                          name="amount"
                          inputMode="decimal"
                          autoComplete="off"
                          required
                          defaultValue={bill.open_minor > 0 ? minorInput(bill.open_minor) : ""}
                        />
                      </Field>
                    </div>
                    <div className="hqdata-money-form__pair">
                      <Field id="pay-reference" label="Bank reference (UTR)">
                        <Input
                          id="pay-reference"
                          name="reference"
                          maxLength={80}
                          autoComplete="off"
                        />
                      </Field>
                      <Field id="pay-method" label="How">
                        <Select
                          id="pay-method"
                          name="method"
                          defaultValue={foreign ? "card" : "bank"}
                        >
                          {Object.entries(PAY_METHODS).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    {foreign && (
                      <div className="hqdata-money-form__pair">
                        <Field id="pay-inr" label="Rupees that left the bank">
                          <Input
                            id="pay-inr"
                            name="inr"
                            inputMode="decimal"
                            autoComplete="off"
                            required
                          />
                        </Field>
                        <Field id="pay-forex" label="of which exchange cost">
                          <Input
                            id="pay-forex"
                            name="forex"
                            inputMode="decimal"
                            autoComplete="off"
                          />
                        </Field>
                      </div>
                    )}
                  </MailForm>
                </Popover>
              ) : undefined
            }
          >
            <dl className="hqdata-money-terms">
              <dt>Total</dt>
              <dd className="hqdata-money-terms__figure">
                <Money minor={bill.total_minor} currency={bill.currency} />
              </dd>
              <dt>Tax deducted</dt>
              <dd className="hqdata-money-terms__figure">
                <Money minor={bill.tds.deducted_minor} currency={bill.currency} />
              </dd>
              <dt>To pay</dt>
              <dd className="hqdata-money-terms__figure">
                <Money minor={bill.payable_minor} currency={bill.currency} />
              </dd>
              <dt>Paid</dt>
              <dd className="hqdata-money-terms__figure">
                <Money minor={bill.paid_minor} currency={bill.currency} />
              </dd>
              <dt>Open</dt>
              <dd className="hqdata-money-terms__figure">
                <Money minor={bill.open_minor} currency={bill.currency} />
              </dd>
              <dt>Pay by</dt>
              <dd>
                {bill.msme ? (
                  <>
                    {bill.msme.words}
                    {bill.msme.note && ` ${bill.msme.note}`}
                    <RuleLineNote line={bill.msme.rule} />
                  </>
                ) : bill.pay_by ? (
                  `${dayWords(bill.pay_by)}, the day you set.`
                ) : (
                  <span className="quiet">None set</span>
                )}
                {bill.paid_late_words && (
                  <span className="hqdata-money-terms__line hqdata-money-danger">
                    {" "}
                    {bill.paid_late_words}
                  </span>
                )}
              </dd>
            </dl>
            <DataTable
              caption="Payments"
              columns={[
                { key: "on", label: "Paid on" },
                { key: "amount", label: "Amount", align: "end" },
                { key: "reference", label: "Bank reference" },
                { key: "how", label: "How" },
                ...(foreign ? [{ key: "inr", label: "Rupees", align: "end" as const }] : []),
                { key: "state", label: "" },
              ]}
              columnMenu={false}
              isEmpty={bill.payments.length === 0}
              empty={<p className="timeline-empty">No payment is recorded yet.</p>}
            >
              {bill.payments.map((payment) => (
                <tr key={payment.payment_id}>
                  <td className="nowrap">{dayWords(payment.paid_on)}</td>
                  <td className="data-table__num">
                    <Money minor={payment.amount_minor} currency={bill.currency} />
                  </td>
                  <td className="mono hqdata-money-wrap">
                    {payment.reference || <span className="quiet">—</span>}
                    {payment.from_line && <span className="table-sub">From a statement line</span>}
                  </td>
                  <td>{PAY_METHODS[payment.method]}</td>
                  {foreign && (
                    <td className="data-table__num">
                      <Money minor={payment.inr_minor} currency="INR" />
                      {payment.forex_minor !== null && (
                        <span className="table-sub">
                          <Money minor={payment.forex_minor} currency="INR" /> exchange cost
                        </span>
                      )}
                    </td>
                  )}
                  <td>
                    {payment.taken_back ? (
                      <span className="quiet">Taken back: {payment.taken_back.why}</span>
                    ) : !bill.locked ? (
                      <Popover label="Take back" align="end">
                        <MailForm
                          action={takeBackPaymentAction}
                          fields={{ ...fields, payment_id: payment.payment_id }}
                          submitLabel="Take it back"
                          pendingLabel="Saving…"
                        >
                          <Field id={`back-${payment.payment_id}`} label="Why">
                            <Input
                              id={`back-${payment.payment_id}`}
                              name="why"
                              required
                              minLength={5}
                              maxLength={300}
                            />
                          </Field>
                        </MailForm>
                      </Popover>
                    ) : null}
                  </td>
                </tr>
              ))}
            </DataTable>
            {live.length > 0 && bill.full_on && (
              <p className="hqdata-money__line">Paid in full on {dayWords(bill.full_on)}.</p>
            )}
          </RecordSection>

          <TaxSection page={page} editable={editable} />

          <RecordSection id="bill-checks" title="Checks">
            {bill.checks.length === 0 ? (
              <p className="timeline-empty">Nothing to check.</p>
            ) : (
              <ul className="hqdata-money__checks">
                {bill.checks.map((check) => (
                  <li key={check}>{check}</li>
                ))}
              </ul>
            )}
          </RecordSection>

          <RecordSection id="bill-edits" title="Edit history">
            <EditHistory caption="Edit history" edits={bill.edits} now={now} />
          </RecordSection>

          <RecordSection id="bill-activity" title="Activity">
            <MoneyActivity events={page.events} now={now} />
          </RecordSection>
        </MoneyBody>
      </RecordGrid>
    </>
  );
}

function TaxSection({ page, editable }: { page: BillPage; editable: boolean }) {
  const { bill, today } = page;
  const fields = { bill_id: bill.bill_id };
  const line = bill.tds_line;
  const abroad = page.vendor?.residency === "non_resident";
  const decision = page.vendor?.decision ?? null;
  return (
    <RecordSection
      id="bill-tax"
      title="Tax deducted"
      actions={
        editable ? (
          <div className="hqdata-money-actions">
            <Popover label="Record what was deducted" align="end">
              <MailForm
                action={deductionAction}
                fields={fields}
                submitLabel="Record it"
                pendingLabel="Saving…"
                className="stack-form stack-form--tight hqdata-money-form"
              >
                <Field id="tds-kind" label="Kind">
                  <Select id="tds-kind" name="kind" defaultValue={bill.tds.kind}>
                    {(Object.keys(TDS_KINDS) as (keyof typeof TDS_KINDS)[]).map((key) => (
                      <option key={key || "blank"} value={key}>
                        {TDS_KINDS[key]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="hqdata-money-form__pair">
                  <Field
                    id="tds-amount"
                    label="Amount"
                    hint="Left blank, nothing is recorded as deducted."
                  >
                    <Input
                      id="tds-amount"
                      name="deducted"
                      inputMode="decimal"
                      autoComplete="off"
                      defaultValue={
                        bill.tds.deducted_minor === null ? "" : minorInput(bill.tds.deducted_minor)
                      }
                    />
                  </Field>
                  <Field id="tds-on" label="On">
                    <Input
                      id="tds-on"
                      name="deducted_on"
                      type="date"
                      max={today}
                      defaultValue={bill.tds.deducted_on ?? today}
                    />
                  </Field>
                </div>
                <p className="field__hint">{TDS_GUIDE}</p>
              </MailForm>
            </Popover>
            {bill.tds.deducted_minor !== null && (
              <Popover label="Record the challan" align="end" width="wide">
                <MailForm
                  action={challanAction}
                  fields={fields}
                  submitLabel="Record it"
                  pendingLabel="Saving…"
                  className="stack-form stack-form--tight hqdata-money-form"
                >
                  <div className="hqdata-money-form__three">
                    <Field id="challan-number" label="Challan number">
                      <Input
                        id="challan-number"
                        name="number"
                        required
                        maxLength={40}
                        defaultValue={bill.tds.challan?.number ?? ""}
                      />
                    </Field>
                    <Field id="challan-bsr" label="BSR code">
                      <Input
                        id="challan-bsr"
                        name="bsr"
                        inputMode="numeric"
                        maxLength={7}
                        defaultValue={bill.tds.challan?.bsr ?? ""}
                      />
                    </Field>
                    <Field id="challan-on" label="Deposited on">
                      <Input
                        id="challan-on"
                        name="deposited_on"
                        type="date"
                        max={today}
                        required
                        defaultValue={bill.tds.challan?.deposited_on ?? today}
                      />
                    </Field>
                  </div>
                  <CopyFields
                    prefix="challan-copy"
                    label="The challan"
                    files={page.files}
                    filesHere={page.files_here}
                    folder="Money › TDS challans"
                  />
                </MailForm>
              </Popover>
            )}
          </div>
        ) : undefined
      }
    >
      <dl className="hqdata-money-terms">
        <dt>Kind</dt>
        <dd>
          {bill.tds.kind ? TDS_KINDS[bill.tds.kind] : TDS_KINDS[""]}
          {line && (line.section || line.code) && (
            <span className="table-sub">
              {[
                line.section ? `Section ${line.section}` : "",
                line.code ? `payment code ${line.code}` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
        </dd>
        {abroad && (
          <>
            <dt>Vendor abroad</dt>
            <dd>
              {decision
                ? `Your CA's decision: ${TDS_DECISIONS[decision.tds]}, ${decision.decided_by}, ${dayWords(decision.decided_on)}.`
                : "No decision on tax for this vendor is recorded."}{" "}
              <Link className="text-link" href={`${BASE}/vendors/${bill.vendor_id}`}>
                Paying this vendor
              </Link>
            </dd>
          </>
        )}
        {line && (
          <>
            <dt>This year</dt>
            <dd>
              {line.words}
              <RuleLineNote line={line.rule} />
            </dd>
            {line.hint_words && (
              <>
                <dt>As a guide</dt>
                <dd>
                  {line.hint_words}
                  <RuleLineNote line={line.rate_rule} />
                </dd>
              </>
            )}
          </>
        )}
        <dt>Deducted</dt>
        <dd>
          {bill.tds.deducted_minor === null ? (
            <span className="quiet">Nothing recorded</span>
          ) : (
            <>
              <Money minor={bill.tds.deducted_minor} currency={bill.currency} /> on{" "}
              {dayWords(bill.tds.deducted_on)}
            </>
          )}
        </dd>
        {bill.deposit && (
          <>
            <dt>Deposit by</dt>
            <dd>
              {bill.tds.challan ? "Deposited" : `Deposit by ${dayWords(bill.deposit.by)}`}
              <RuleLineNote line={bill.deposit.rule} />
            </dd>
          </>
        )}
        <dt>Challan</dt>
        <dd>
          {bill.tds.challan ? (
            <>
              {[
                bill.tds.challan.number,
                bill.tds.challan.bsr ? `BSR ${bill.tds.challan.bsr}` : "",
                `deposited ${dayWords(bill.tds.challan.deposited_on)}`,
              ]
                .filter(Boolean)
                .join(" · ")}
              {page.bill.challan_file && (
                <>
                  {" · "}
                  <Link
                    className="text-link"
                    href={`/data/files/${page.bill.challan_file.file_id}`}
                  >
                    {page.bill.challan_file.title}
                  </Link>
                </>
              )}
            </>
          ) : (
            <span className="quiet">None recorded</span>
          )}
        </dd>
      </dl>
      <p className="hqdata-money__line quiet">{TDS_GUIDE}</p>
    </RecordSection>
  );
}

function Side({ page }: { page: BillPage }) {
  const { bill } = page;
  return (
    <Properties title="The bill">
      <Property label="Vendor">
        <Link className="text-link" href={`${BASE}/vendors/${bill.vendor_id}`}>
          {bill.vendor_name}
        </Link>
        {page.vendor && <span className="quiet"> · {RESIDENCIES[page.vendor.residency]}</span>}
      </Property>
      <Property label="Invoice number" mono>
        {bill.invoice_number}
      </Property>
      <Property label="Invoice day">{dayWords(bill.invoice_on)}</Property>
      <Property label="Accepted on">
        {bill.accepted_on ? (
          dayWords(bill.accepted_on)
        ) : (
          <span className="quiet">The invoice day</span>
        )}
      </Property>
      <Property label="What it is for">
        {bill.description || <span className="quiet">Not given</span>}
      </Property>
      <Property label="Amount before GST">
        <Money minor={bill.taxable_minor} currency={bill.currency} />
      </Property>
      <Property label="GST on the bill">
        <Money minor={bill.gst_minor} currency={bill.currency} />
      </Property>
      <Property label="GST treatment">{GST_TREATMENTS[bill.gst_treatment]}</Property>
      <Property label="Category">
        {bill.category_name || <span className="quiet">None</span>}
      </Property>
      <Property label="Approved">
        {bill.approved ? (
          `${bill.approved.by_name}, ${dayWords(bill.approved.on)}`
        ) : (
          <span className="quiet">Not yet</span>
        )}
      </Property>
      <Property label="The invoice">
        {bill.file ? (
          <>
            <Link className="text-link" href={`/data/files/${bill.file.file_id}`}>
              {bill.file.title}
            </Link>
            {bill.held_until && (
              <span className="table-sub">Kept until {dayWords(bill.held_until)}</span>
            )}
          </>
        ) : (
          <span className="hqdata-money-attention">None attached</span>
        )}
      </Property>
    </Properties>
  );
}
