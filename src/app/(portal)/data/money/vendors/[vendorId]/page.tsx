import Link from "next/link";
import { notFound } from "next/navigation";

import { DataUnavailable } from "@/components/data/data-down";
import { RuleLineNote } from "@/components/data/duties/rule-line";
import { CopyFields } from "@/components/data/meetings/copy-fields";
import { EditHistory, MoneyActivity } from "@/components/data/money/history";
import {
  BillStatePill,
  Money,
  MoneyBody,
  Source,
  payByWords,
} from "@/components/data/money/money-bits";
import { VendorFields } from "@/components/data/money/vendor-fields";
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
import { readVendor, type VendorPage } from "@/lib/data/api/money";
import { dayWords } from "@/lib/data/labels-company";
import { minorWords, minorWordsBy, rateWords } from "@/lib/data/labels-duties";
import {
  BILLS_FROM,
  DECIDED_ROLES,
  FLAG_WORDS,
  FOREIGN_GST,
  FORMS_UNCONFIRMED,
  NO_DECISION,
  PAID_BY,
  RESIDENCIES,
  TDS_DECISIONS,
  TDS_KINDS,
  UDYAM_CLASSES,
  formsWords,
} from "@/lib/data/labels-money";
import { dataRead } from "@/lib/data/read";
import { requestNow } from "@/lib/request-time";

import { foreignAction, retireVendorAction, updateVendorAction } from "../../actions";
import "../../money.css";

export const metadata = { title: "Vendor" };
export const dynamic = "force-dynamic";

const BASE = "/data/money/vendors";
const VENDOR_ID = /^[A-Za-z0-9-]{1,64}$/;

export default async function VendorRecordPage({
  params,
}: {
  params: Promise<{ vendorId: string }>;
}) {
  const { vendorId } = await params;
  const { allowed, context } = await requireData(`${BASE}/${vendorId}`);
  if (!VENDOR_ID.test(vendorId)) notFound();
  const owner = context.me.role === "owner";
  const now = requestNow();
  const read = allowed ? await dataRead(() => readVendor(vendorId)) : null;
  if (!allowed || !read || !read.ok)
    return (
      <>
        <PageHeader title="Vendor" />
        <div className="page-content">
          {!allowed || !read ? (
            <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
          ) : (
            !read.ok && <DataUnavailable failure={read} />
          )}
        </div>
      </>
    );
  return <VendorRecord page={read.data} now={now} owner={owner} />;
}

function VendorRecord({ page, now, owner }: { page: VendorPage; now: number; owner: boolean }) {
  const { vendor } = page;
  const fields = { vendor_id: vendor.vendor_id };
  const abroad = vendor.residency === "non_resident";
  const current = page.years[0];
  return (
    <>
      <RecordHeader
        crumbs={[
          { href: "/data/money", label: "Money" },
          { href: BASE, label: "Vendors" },
        ]}
        title={vendor.name}
        status={
          <>
            <StatusPill
              value={vendor.residency || "unknown"}
              label={RESIDENCIES[vendor.residency]}
              tone="neutral"
            />
            {vendor.retired && <StatusPill value="retired" label="Retired" tone="neutral" />}
          </>
        }
        readouts={[
          { label: "Udyam", value: UDYAM_CLASSES[vendor.udyam.class] },
          { label: "Tax deducted as", value: TDS_KINDS[vendor.tds_kind] },
          {
            label: current ? `Billed in ${current.fy}` : "Billed",
            value: current ? minorWordsBy(current.billed) || "—" : "Nothing yet",
          },
        ]}
        actions={
          !vendor.retired ? (
            <>
              <Popover label="Edit" variant="primary" align="start" width="wide">
                <MailForm
                  action={updateVendorAction}
                  fields={fields}
                  submitLabel="Save"
                  pendingLabel="Saving…"
                  className="stack-form stack-form--tight hqdata-money-form"
                >
                  <VendorFields
                    prefix="vendor-edit"
                    values={{
                      name: vendor.name,
                      legal_name: vendor.legal_name,
                      residency: vendor.residency,
                      country: vendor.country,
                      pan: vendor.pan,
                      gstin: vendor.gstin,
                      udyam_class: vendor.udyam.class,
                      udyam_number: vendor.udyam.number,
                      udyam_checked_on: vendor.udyam.checked_on ?? "",
                      msme_agreement: vendor.msme_agreement.has,
                      msme_days:
                        vendor.msme_agreement.days === null
                          ? ""
                          : String(vendor.msme_agreement.days),
                      tds_kind: vendor.tds_kind,
                      default_category_id: vendor.default_category_id ?? "",
                      notes: vendor.notes,
                    }}
                    categories={page.categories.map((category) => ({
                      id: category.category_id,
                      name: category.name,
                    }))}
                  />
                </MailForm>
              </Popover>
              <Popover label="Retire" align="start">
                <MailForm
                  action={retireVendorAction}
                  fields={fields}
                  submitLabel="Retire the vendor"
                  pendingLabel="Saving…"
                  variant="danger"
                >
                  <p className="field__hint">
                    A retired vendor keeps its bills; no new bill can name it.
                  </p>
                </MailForm>
              </Popover>
            </>
          ) : undefined
        }
      />
      <RecordGrid side={<Side page={page} />}>
        <MoneyBody current="vendors" owner={owner} rulesHere={page.here.rules}>
          {page.checks.length > 0 && (
            <RecordSection id="vendor-checks" title="Checks">
              <ul className="hqdata-money__checks">
                {page.checks.map((check) => (
                  <li key={check}>{check}</li>
                ))}
              </ul>
            </RecordSection>
          )}
          <RecordSection id="vendor-years" title="This year and before">
            <DataTable
              caption="Financial years"
              columns={[
                { key: "fy", label: "Year" },
                { key: "billed", label: "Billed", align: "end" },
                { key: "taxable", label: "Taxable", align: "end" },
                { key: "tds", label: "Tax deducted", align: "end" },
                { key: "line", label: "Against the limit" },
              ]}
              columnMenu={false}
              isEmpty={page.years.length === 0}
              empty={<p className="timeline-empty">No bill from this vendor yet.</p>}
            >
              {page.years.map((year) => (
                <tr key={year.fy}>
                  <td className="nowrap">
                    {year.fy}
                    <span className="table-sub">
                      {year.bills.toLocaleString("en-IN")} {year.bills === 1 ? "bill" : "bills"}
                    </span>
                  </td>
                  <td className="data-table__num">{minorWordsBy(year.billed)}</td>
                  <td className="data-table__num">{minorWords(year.taxable_inr_minor, "INR")}</td>
                  <td className="data-table__num">{minorWords(year.tds_deducted_minor, "INR")}</td>
                  <td className="hqdata-money-wrap">
                    {year.line || (
                      <span className="quiet">No tax is deducted on this vendor&apos;s bills.</span>
                    )}
                    <RuleLineNote line={year.rule} />
                  </td>
                </tr>
              ))}
            </DataTable>
          </RecordSection>
          {abroad && <Abroad page={page} />}
          <RecordSection id="vendor-bills" title="Bills">
            <DataTable
              caption="Bills from this vendor"
              columns={[
                { key: "invoice", label: "Invoice" },
                { key: "day", label: "Day" },
                { key: "total", label: "Total", align: "end" },
                { key: "pay-by", label: "Pay by" },
                { key: "state", label: "State" },
              ]}
              columnMenu={false}
              isEmpty={page.bills.length === 0}
              empty={<p className="timeline-empty">No bill from this vendor yet.</p>}
            >
              {page.bills.map((bill) => (
                <tr key={bill.bill_id}>
                  <td>
                    <Link className="table-title mono" href={`/data/money/bills/${bill.bill_id}`}>
                      {bill.invoice_number}
                    </Link>
                  </td>
                  <td className="nowrap">{dayWords(bill.invoice_on)}</td>
                  <td className="data-table__num">
                    <Money minor={bill.total_minor} currency={bill.currency} />
                  </td>
                  <td className="nowrap">{payByWords(bill.pay_by, bill.pay_by_short)}</td>
                  <td>
                    <BillStatePill state={bill.state} />
                  </td>
                </tr>
              ))}
            </DataTable>
          </RecordSection>
          <RecordSection id="vendor-edits" title="Edit history">
            <EditHistory caption="Edit history" edits={page.edits} now={now} />
          </RecordSection>
          <RecordSection id="vendor-activity" title="Activity">
            <MoneyActivity events={page.events} now={now} />
          </RecordSection>
        </MoneyBody>
      </RecordGrid>
    </>
  );
}

function Abroad({ page }: { page: VendorPage }) {
  const { vendor, forms } = page;
  const foreign = vendor.foreign;
  const decision = foreign.decision;
  const names = formsWords(forms.reading);
  const fields = { vendor_id: vendor.vendor_id };
  return (
    <RecordSection
      id="vendor-abroad"
      title="Paying this vendor"
      actions={
        !vendor.retired ? (
          <Popover
            label={decision ? "Change" : "Record your CA's decision"}
            align="end"
            width="wide"
          >
            <MailForm
              action={foreignAction}
              fields={fields}
              submitLabel="Save"
              pendingLabel="Saving…"
              className="stack-form stack-form--tight hqdata-money-form"
            >
              <div className="hqdata-money-form__pair">
                <Field id="abroad-bills-from" label="Bills from">
                  <Select
                    id="abroad-bills-from"
                    name="bills_from"
                    defaultValue={foreign.bills_from}
                  >
                    {Object.entries(BILLS_FROM).map(([key, label]) => (
                      <option key={key || "blank"} value={key}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field id="abroad-paid-by" label="Paid by">
                  <Select id="abroad-paid-by" name="paid_by" defaultValue={foreign.paid_by}>
                    {Object.entries(PAID_BY).map(([key, label]) => (
                      <option key={key || "blank"} value={key}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="hqdata-money-form__pair">
                <Field id="abroad-gst" label="GST">
                  <Select id="abroad-gst" name="gst" defaultValue={foreign.gst}>
                    {Object.entries(FOREIGN_GST).map(([key, label]) => (
                      <option key={key || "blank"} value={key}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  id="abroad-forex"
                  label="Exchange cost on the card"
                  hint="As the card's terms give it, in per cent: 2.5."
                >
                  <Input
                    id="abroad-forex"
                    name="card_forex_rate"
                    inputMode="decimal"
                    maxLength={5}
                    defaultValue={
                      foreign.card_forex_rate === null ? "" : String(foreign.card_forex_rate)
                    }
                  />
                </Field>
              </div>
              <fieldset className="hqdata-radios">
                <legend>Your CA&apos;s decision</legend>
                <div className="hqdata-money-form__pair">
                  <Field id="abroad-tds" label="Tax">
                    <Select id="abroad-tds" name="decision_tds" defaultValue={decision?.tds ?? ""}>
                      <option value="">Not decided yet</option>
                      {Object.entries(TDS_DECISIONS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field id="abroad-forms" label="Forms needed">
                    <Select
                      id="abroad-forms"
                      name="decision_forms"
                      defaultValue={decision?.forms ?? "none"}
                    >
                      {(["none", "form_only", "form_and_certificate"] as const).map((key) => (
                        <option key={key} value={key}>
                          {names[key]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field id="abroad-basis" label="The basis, in your CA's words">
                  <Input
                    id="abroad-basis"
                    name="decision_basis"
                    maxLength={300}
                    defaultValue={decision?.basis ?? ""}
                  />
                </Field>
                <div className="hqdata-money-form__three">
                  <Field id="abroad-by" label="Decided by">
                    <Input
                      id="abroad-by"
                      name="decided_by"
                      maxLength={120}
                      defaultValue={decision?.decided_by ?? ""}
                    />
                  </Field>
                  <Field id="abroad-role" label="Role">
                    <Select
                      id="abroad-role"
                      name="decided_role"
                      defaultValue={decision?.decided_role ?? "CA"}
                    >
                      {Object.entries(DECIDED_ROLES).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field id="abroad-on" label="Decided on">
                    <Input
                      id="abroad-on"
                      name="decided_on"
                      type="date"
                      max={page.today}
                      defaultValue={decision?.decided_on ?? ""}
                    />
                  </Field>
                </div>
                <CopyFields
                  prefix="abroad-note"
                  label="The note"
                  files={page.files}
                  filesHere={page.files_here}
                  folder="Money › Vendors"
                />
              </fieldset>
            </MailForm>
          </Popover>
        ) : undefined
      }
    >
      <dl className="hqdata-money-terms">
        <dt>Bills from</dt>
        <dd>{BILLS_FROM[foreign.bills_from]}</dd>
        <dt>Paid by</dt>
        <dd>{PAID_BY[foreign.paid_by]}</dd>
        <dt>GST</dt>
        <dd>{FOREIGN_GST[foreign.gst]}</dd>
        <dt>Exchange cost on the card</dt>
        <dd>
          {foreign.card_forex_rate === null ? (
            <span className="quiet">Not given</span>
          ) : (
            rateWords(foreign.card_forex_rate)
          )}
        </dd>
        <dt>The forms</dt>
        <dd>
          {forms.confirmed_label
            ? `${forms.confirmed_label}, as your CA confirmed.`
            : FORMS_UNCONFIRMED}
          <RuleLineNote line={forms.rule} />
          {forms.readings.map((reading) => (
            <span key={reading.label} className="hqdata-money-terms__line quiet">
              {reading.label}: {reading.words}{" "}
              {reading.sources.map((source) => (
                <Source key={source.url} url={source.url} />
              ))}
            </span>
          ))}
        </dd>
        <dt>Your CA&apos;s decision</dt>
        <dd>
          {decision ? (
            <>
              {TDS_DECISIONS[decision.tds]}. Forms needed: {names[decision.forms]}.
              {decision.basis && <span className="hqdata-money-terms__line">{decision.basis}</span>}
              <span className="hqdata-money-terms__line">
                Decided by {decision.decided_by} ({DECIDED_ROLES[decision.decided_role]}),{" "}
                {dayWords(decision.decided_on)}.
                {page.decision_file && (
                  <>
                    {" "}
                    <Link className="text-link" href={`/data/files/${page.decision_file.file_id}`}>
                      {page.decision_file.title}
                    </Link>
                  </>
                )}
              </span>
            </>
          ) : (
            <span className="hqdata-money-attention">{NO_DECISION}</span>
          )}
        </dd>
      </dl>
    </RecordSection>
  );
}

function Side({ page }: { page: VendorPage }) {
  const { vendor } = page;
  return (
    <Properties title="The vendor">
      <Property label="Legal name">
        {vendor.legal_name || <span className="quiet">Not given</span>}
      </Property>
      <Property label="Where">
        {RESIDENCIES[vendor.residency]}
        {vendor.country && <span className="quiet"> · {vendor.country}</span>}
      </Property>
      <Property label="PAN" mono>
        {vendor.pan || "—"}
      </Property>
      <Property label="GSTIN" mono>
        {vendor.gstin || "—"}
      </Property>
      <Property label="Udyam">
        {UDYAM_CLASSES[vendor.udyam.class]}
        {vendor.udyam.number && <span className="table-sub mono">{vendor.udyam.number}</span>}
        {vendor.udyam.checked_on && (
          <span className="table-sub">Checked {dayWords(vendor.udyam.checked_on)}</span>
        )}
      </Property>
      <Property label="Written agreement on payment days">
        {FLAG_WORDS[vendor.msme_agreement.has]}
        {vendor.msme_agreement.days !== null && `, ${vendor.msme_agreement.days} days`}
      </Property>
      <Property label="Usual category">
        {page.category_name || <span className="quiet">None</span>}
      </Property>
      {page.contact && (
        <Property label="Contact">
          <Link className="text-link" href="/data/contacts">
            {page.contact.name}
          </Link>
        </Property>
      )}
      <Property label="Notes">
        <span className="hqdata-money-wrap">
          {vendor.notes || <span className="quiet">None</span>}
        </span>
      </Property>
    </Properties>
  );
}
