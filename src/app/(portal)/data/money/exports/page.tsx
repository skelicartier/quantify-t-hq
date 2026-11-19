import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { RuleLineNote } from "@/components/data/duties/rule-line";
import { CopyFields } from "@/components/data/meetings/copy-fields";
import { ExportFields, NEW_EXPORT } from "@/components/data/money/export-fields";
import { Money, MoneyBody, RealiseBy } from "@/components/data/money/money-bits";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { StatusPill } from "@/components/ui/status-pill";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readExports, type ExportRow, type ExportsPage } from "@/lib/data/api/money";
import { dayWords } from "@/lib/data/labels-company";
import { fyWords, minorWordsBy } from "@/lib/data/labels-duties";
import { MONEY_ABOUT, countOf } from "@/lib/data/labels-money";
import { dataRead } from "@/lib/data/read";

import { addExportAction, lutAction } from "../actions";
import "../money.css";

export const metadata = { title: "Export invoices" };
export const dynamic = "force-dynamic";

const BASE = "/data/money/exports";
const ABOUT =
  "The paperwork of an invoice to a customer abroad: the LUT, the purpose code, the EDF, each receipt and its FIRA. The invoice itself is issued from the books.";

export default async function ExportInvoicesPage() {
  const { allowed, context } = await requireData(BASE);
  const owner = context.me.role === "owner";
  const read = allowed ? await dataRead(() => readExports()) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Export invoices"
        description={`${ABOUT} ${MONEY_ABOUT}`}
        meta={
          data ? (
            <span className="quiet">
              {countOf(data.invoices.filter((invoice) => !invoice.cancelled).length, "invoice")}
            </span>
          ) : undefined
        }
        actions={
          data ? (
            <>
              <Popover label="Add an export invoice" variant="primary" align="end" width="wide">
                <MailForm
                  action={addExportAction}
                  submitLabel="Add the invoice"
                  pendingLabel="Adding…"
                  className="stack-form stack-form--tight hqdata-money-form"
                >
                  <ExportFields
                    prefix="export-new"
                    values={NEW_EXPORT}
                    today={data.today}
                    copy={{ files: data.files, filesHere: data.files_here }}
                  />
                </MailForm>
              </Popover>
              <ButtonLink
                href={`${BASE}/export?fy=${encodeURIComponent(fyWords(data.today))}`}
                size="small"
                variant="ghost"
              >
                Download for the CA
              </ButtonLink>
            </>
          ) : undefined
        }
      />
      <div className="page-content">
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <MoneyBody current="exports" owner={owner} rulesHere={read.data.here.rules}>
            <Invoices page={read.data} />
            <Luts page={read.data} />
          </MoneyBody>
        )}
      </div>
    </>
  );
}

function Invoices({ page }: { page: ExportsPage }) {
  return (
    <section className="hqdata-money__block" data-section="money-exports">
      {page.invoices.length > 0 && (
        <p className="hqdata-money__line">
          Invoiced: {minorWordsBy(page.totals.invoiced) || "nothing"}.{" "}
          {Object.keys(page.totals.to_realise).length > 0
            ? `Still to come in: ${minorWordsBy(page.totals.to_realise)}.`
            : "Everything invoiced has come in."}
        </p>
      )}
      <DataTable
        caption="Export invoices"
        columns={[
          { key: "customer", label: "Customer" },
          { key: "invoice", label: "Invoice" },
          { key: "day", label: "Day" },
          { key: "amount", label: "Amount", align: "end" },
          { key: "edf", label: "EDF" },
          { key: "realised", label: "Realised", align: "end" },
          { key: "realise-by", label: "Realise by" },
        ]}
        columnMenu={false}
        isEmpty={page.invoices.length === 0}
        empty={
          <EmptyState
            compact
            title="No export invoices yet"
            description="No export invoices yet. Add each invoice to a customer abroad as the books issue it, then each receipt with its FIRA."
          />
        }
      >
        {page.invoices.map((invoice) => (
          <InvoiceLine key={invoice.invoice_id} invoice={invoice} />
        ))}
      </DataTable>
    </section>
  );
}

function InvoiceLine({ invoice }: { invoice: ExportRow }) {
  return (
    <tr id={`export-${invoice.invoice_id}`}>
      <td>
        <span className="table-title">{invoice.customer}</span>
        {(invoice.country || invoice.cancelled) && (
          <span className="table-sub">
            {[invoice.country, invoice.cancelled ? "Cancelled" : ""].filter(Boolean).join(" · ")}
          </span>
        )}
      </td>
      <td>
        <Link className="table-title mono" href={`${BASE}/${invoice.invoice_id}`}>
          {invoice.invoice_number}
        </Link>
      </td>
      <td className="nowrap">{dayWords(invoice.invoice_on)}</td>
      <td className="data-table__num">
        <Money minor={invoice.amount_minor} currency={invoice.currency} />
      </td>
      <td>
        {invoice.edf ? (
          `Filed ${dayWords(invoice.edf.filed_on)}`
        ) : invoice.edf_by ? (
          <>
            By {dayWords(invoice.edf_by)}
            <RuleLineNote line={invoice.rules.edf} />
          </>
        ) : (
          <span className="quiet">Not worked out</span>
        )}
      </td>
      <td className="data-table__num">
        <Money minor={invoice.realised.minor} currency={invoice.currency} />
        {invoice.realised.in_full_on && (
          <span className="table-sub">In full {dayWords(invoice.realised.in_full_on)}</span>
        )}
      </td>
      <td className="hqdata-money-wrap">
        {invoice.cancelled ? (
          <StatusPill value="cancelled" label="Cancelled" tone="neutral" />
        ) : invoice.realised.in_full_on ? (
          <span className="quiet">Realised in full</span>
        ) : (
          <RealiseBy row={invoice} />
        )}
      </td>
    </tr>
  );
}

function Luts({ page }: { page: ExportsPage }) {
  return (
    <section className="hqdata-money__block" data-section="money-luts">
      <div className="hqdata-money__tools">
        <h2 className="hqdata-money__heading">LUT by year</h2>
        <Popover label="Record an LUT" align="start" width="wide">
          <MailForm
            action={lutAction}
            submitLabel="Record it"
            pendingLabel="Saving…"
            className="stack-form stack-form--tight hqdata-money-form"
          >
            <div className="hqdata-money-form__three">
              <Field id="lut-fy" label="Financial year">
                <Input
                  id="lut-fy"
                  name="fy"
                  required
                  maxLength={7}
                  defaultValue={fyWords(page.today)}
                />
              </Field>
              <Field id="lut-arn" label="ARN">
                <Input id="lut-arn" name="arn" required maxLength={40} autoComplete="off" />
              </Field>
              <Field id="lut-on" label="Filed on">
                <Input id="lut-on" name="filed_on" type="date" max={page.today} required />
              </Field>
            </div>
            <CopyFields
              prefix="lut-copy"
              label="The LUT"
              files={page.files}
              filesHere={page.files_here}
              folder="Money › LUTs"
            />
          </MailForm>
        </Popover>
      </div>
      <DataTable
        caption="LUT by year"
        columns={[
          { key: "fy", label: "Year" },
          { key: "arn", label: "ARN" },
          { key: "filed", label: "Filed" },
          { key: "copy", label: "Copy" },
        ]}
        columnMenu={false}
        isEmpty={page.luts.length === 0}
        empty={
          <p className="timeline-empty">
            No LUT is recorded. It is filed before the year&apos;s first zero-rated invoice.
          </p>
        }
      >
        {page.luts.map((lut) => (
          <tr key={lut.fy}>
            <td>{lut.fy}</td>
            <td className="mono">{lut.arn}</td>
            <td className="nowrap">{dayWords(lut.filed_on)}</td>
            <td>
              {lut.file ? (
                <Link className="text-link" href={`/data/files/${lut.file.file_id}`}>
                  {lut.file.title}
                </Link>
              ) : (
                <span className="quiet">None</span>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
    </section>
  );
}
