import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { BillFields, NEW_BILL } from "@/components/data/money/bill-fields";
import { BillStatePill, Money, MoneyBody, payByWords } from "@/components/data/money/money-bits";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Select } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readBills, type BillRow, type BillsPage } from "@/lib/data/api/money";
import { dayWords } from "@/lib/data/labels-company";
import { fyWords, minorWordsBy } from "@/lib/data/labels-duties";
import { BILL_VIEWS, MONEY_ABOUT, countOf, type BillView } from "@/lib/data/labels-money";
import { dataRead } from "@/lib/data/read";
import { firstSearchValue } from "@/lib/search-params";

import { addBillAction } from "./actions";
import "./money.css";

export const metadata = { title: "Bills" };
export const dynamic = "force-dynamic";

const BASE = "/data/money";
const ABOUT = `Every bill the company owes, with its copy in Files: what it says, the tax deducted and its deposit day, the pay-by day for a micro or small supplier, and each payment with its bank reference. At the month's end the bills go to your CA in one pack. ${MONEY_ABOUT}`;

type Params = Record<string, string | string[] | undefined>;
type Filters = { view: BillView; vendor: string; fy: string };

function listHref(change: Partial<Filters>, current: Filters): string {
  const next = { ...current, ...change };
  const params = new URLSearchParams();
  if (next.view !== "open") params.set("view", next.view);
  if (next.vendor) params.set("vendor", next.vendor);
  if (next.fy) params.set("fy", next.fy);
  const rendered = params.toString();
  return `${BASE}${rendered ? `?${rendered}` : ""}`;
}

export default async function BillsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { allowed, context } = await requireData(BASE);
  const owner = context.me.role === "owner";
  const parameters = await searchParams;
  const asked = firstSearchValue(parameters.view) ?? "";
  const filters: Filters = {
    view: asked in BILL_VIEWS ? (asked as BillView) : "open",
    vendor: (firstSearchValue(parameters.vendor) ?? "").slice(0, 64),
    fy: /^\d{4}-\d{2}$/.test(firstSearchValue(parameters.fy) ?? "")
      ? (firstSearchValue(parameters.fy) ?? "")
      : "",
  };
  const read = allowed ? await dataRead(() => readBills(filters)) : null;
  const data = read?.ok ? read.data : null;
  const csvYear = filters.fy || (data ? fyWords(data.today) : "");
  return (
    <>
      <PageHeader
        title="Bills"
        description={ABOUT}
        meta={data ? <span className="quiet">{countOf(data.counts.all, "bill")}</span> : undefined}
        actions={
          data ? (
            <>
              <Popover label="Add a bill" variant="primary" align="end" width="wide">
                <MailForm
                  action={addBillAction}
                  submitLabel="Add the bill"
                  pendingLabel="Adding…"
                  className="stack-form stack-form--tight hqdata-money-form"
                >
                  <BillFields
                    prefix="bill-new"
                    values={{ ...NEW_BILL, vendor_id: filters.vendor }}
                    vendors={data.vendors
                      .filter((vendor) => !vendor.retired)
                      .map((vendor) => ({ id: vendor.vendor_id, name: vendor.name }))}
                    categories={data.categories.map((category) => ({
                      id: category.category_id,
                      name: category.name,
                    }))}
                    today={data.today}
                    copy={{ files: data.files, filesHere: data.files_here }}
                  />
                </MailForm>
              </Popover>
              <ButtonLink
                href={`${BASE}/bills/export?fy=${encodeURIComponent(csvYear)}`}
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
          <MoneyBody current="bills" owner={owner} rulesHere={read.data.here.rules}>
            <Bills page={read.data} filters={filters} />
          </MoneyBody>
        )}
      </div>
    </>
  );
}

function Bills({ page, filters }: { page: BillsPage; filters: Filters }) {
  const any = page.counts.all + page.counts.cancelled > 0 || Boolean(filters.vendor || filters.fy);
  const vendorName = page.vendors.find((vendor) => vendor.vendor_id === filters.vendor)?.name;
  return (
    <section className="hqdata-money__block" data-section="money-bills">
      <p className="hqdata-money__line" id="money-open">
        {page.open_bills === 0
          ? "Nothing is open."
          : `Open: ${minorWordsBy(page.totals.open)} across ${countOf(page.open_bills, "bill")}.`}
      </p>
      <div className="hqdata-money__tools">
        <SegmentedLinks
          label="Bills"
          items={(Object.keys(BILL_VIEWS) as BillView[]).map((key) => ({
            href: listHref({ view: key }, filters),
            label: `${BILL_VIEWS[key]} ${page.counts[key].toLocaleString("en-IN")}`,
            current: filters.view === key,
          }))}
        />
        <form className="hqdata-money__filters" action={BASE} role="search">
          {filters.view !== "open" && <input type="hidden" name="view" value={filters.view} />}
          <Field id="bills-vendor" label="Vendor">
            <Select id="bills-vendor" name="vendor" defaultValue={filters.vendor}>
              <option value="">Every vendor</option>
              {page.vendors.map((vendor) => (
                <option key={vendor.vendor_id} value={vendor.vendor_id}>
                  {vendor.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="bills-fy" label="Financial year">
            <Select id="bills-fy" name="fy" defaultValue={filters.fy}>
              <option value="">Every year</option>
              {page.years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </Select>
          </Field>
          <button className="btn btn--small" type="submit">
            Show
          </button>
        </form>
      </div>
      <p className="hqdata-print-only">
        {BILL_VIEWS[filters.view]}
        {vendorName ? ` · ${vendorName}` : ""}
        {filters.fy ? ` · ${filters.fy}` : ""}
      </p>
      <DataTable
        caption="Bills"
        columns={[
          { key: "vendor", label: "Vendor" },
          { key: "invoice", label: "Invoice" },
          { key: "day", label: "Day" },
          { key: "total", label: "Total", align: "end" },
          { key: "tds", label: "Tax deducted", align: "end" },
          { key: "pay", label: "To pay", align: "end" },
          { key: "pay-by", label: "Pay by" },
          { key: "state", label: "State" },
        ]}
        columnMenu={false}
        isEmpty={page.bills.length === 0}
        empty={
          any ? (
            <EmptyState
              compact
              title="No bill here"
              description="Try All, another vendor or another year."
            />
          ) : (
            <EmptyState
              compact
              title="No bills yet"
              description="No bills yet. Add each bill with its PDF as it arrives: at the month's end they go to your CA in one pack."
            />
          )
        }
      >
        {page.bills.map((bill) => (
          <BillLine key={bill.bill_id} bill={bill} today={page.today} />
        ))}
      </DataTable>
      {page.bills.length > 0 && (
        <p className="hqdata-money__line quiet">Shown: {minorWordsBy(page.totals.shown)} in all.</p>
      )}
    </section>
  );
}

function BillLine({ bill, today }: { bill: BillRow; today: string }) {
  const overdue = bill.pay_by !== null && bill.pay_by < today && bill.open_minor > 0;
  return (
    <tr id={`bill-${bill.bill_id}`}>
      <td>
        <Link className="table-title" href={`/data/money/vendors/${bill.vendor_id}`}>
          {bill.vendor_name}
        </Link>
        {bill.category_name && <span className="table-sub">{bill.category_name}</span>}
      </td>
      <td>
        <Link className="table-title mono" href={`${BASE}/bills/${bill.bill_id}`}>
          {bill.invoice_number}
        </Link>
        {bill.description && <span className="table-sub">{bill.description}</span>}
      </td>
      <td className="nowrap">{dayWords(bill.invoice_on)}</td>
      <td className="data-table__num">
        <Money minor={bill.total_minor} currency={bill.currency} />
      </td>
      <td className="data-table__num">
        <Money minor={bill.deducted_minor} currency={bill.currency} />
      </td>
      <td className="data-table__num">
        <Money minor={bill.payable_minor} currency={bill.currency} />
        {bill.state === "part_paid" && (
          <span className="table-sub">
            <Money minor={bill.open_minor} currency={bill.currency} /> open
          </span>
        )}
      </td>
      <td className={overdue ? "nowrap hqdata-money-danger" : "nowrap"}>
        {payByWords(bill.pay_by, bill.pay_by_short)}
      </td>
      <td>
        <BillStatePill state={bill.state} />
      </td>
    </tr>
  );
}
