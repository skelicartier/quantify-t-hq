import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { MoneyBody } from "@/components/data/money/money-bits";
import { NEW_VENDOR_VALUES, VendorFields } from "@/components/data/money/vendor-fields";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Popover } from "@/components/ui/popover";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readVendors, type VendorRow, type VendorsPage } from "@/lib/data/api/money";
import { minorWordsBy } from "@/lib/data/labels-duties";
import {
  MONEY_ABOUT,
  RESIDENCIES,
  TDS_KINDS,
  UDYAM_CLASSES,
  countOf,
} from "@/lib/data/labels-money";
import { dataRead } from "@/lib/data/read";

import { addVendorAction } from "../actions";
import "../money.css";

export const metadata = { title: "Vendors" };
export const dynamic = "force-dynamic";

const BASE = "/data/money/vendors";
const ABOUT = `Who the company buys from: where each vendor is, its PAN and GSTIN as on its invoices, its Udyam class (a micro or small supplier has a pay-by limit), the tax usually deducted, and for a vendor abroad, how it bills and your CA's decision. ${MONEY_ABOUT}`;

export default async function VendorsPage() {
  const { allowed, context } = await requireData(BASE);
  const owner = context.me.role === "owner";
  const read = allowed ? await dataRead(() => readVendors()) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Vendors"
        description={ABOUT}
        meta={
          data ? (
            <span className="quiet">
              {countOf(data.vendors.filter((vendor) => !vendor.retired).length, "vendor")}
            </span>
          ) : undefined
        }
        actions={
          data ? (
            <>
              <Popover label="Add a vendor" variant="primary" align="end" width="wide">
                <MailForm
                  action={addVendorAction}
                  submitLabel="Add the vendor"
                  pendingLabel="Adding…"
                  className="stack-form stack-form--tight hqdata-money-form"
                >
                  <VendorFields
                    prefix="vendor-new"
                    values={NEW_VENDOR_VALUES}
                    categories={data.categories.map((category) => ({
                      id: category.category_id,
                      name: category.name,
                    }))}
                  />
                </MailForm>
              </Popover>
              <ButtonLink href={`${BASE}/export`} size="small" variant="ghost">
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
          <MoneyBody current="vendors" owner={owner} rulesHere={read.data.here.rules}>
            <Vendors page={read.data} />
          </MoneyBody>
        )}
      </div>
    </>
  );
}

function Vendors({ page }: { page: VendorsPage }) {
  return (
    <section className="hqdata-money__block" data-section="money-vendors">
      <DataTable
        caption="Vendors"
        columns={[
          { key: "vendor", label: "Vendor" },
          { key: "where", label: "Where" },
          { key: "pan", label: "PAN" },
          { key: "gstin", label: "GSTIN" },
          { key: "udyam", label: "Udyam" },
          { key: "tds", label: "Tax deducted as" },
          { key: "billed", label: "Billed this year", align: "end" },
        ]}
        columnMenu={false}
        isEmpty={page.vendors.length === 0}
        empty={
          <EmptyState
            compact
            title="No vendors yet"
            description="No vendors yet. Add each one as its first bill arrives, with its PAN, GSTIN and Udyam class from the invoice."
          />
        }
      >
        {page.vendors.map((vendor) => (
          <VendorLine key={vendor.vendor_id} vendor={vendor} />
        ))}
      </DataTable>
    </section>
  );
}

function VendorLine({ vendor }: { vendor: VendorRow }) {
  const billed = minorWordsBy(vendor.billed_this_year);
  return (
    <tr id={`vendor-${vendor.vendor_id}`}>
      <td>
        <Link className="table-title" href={`${BASE}/${vendor.vendor_id}`}>
          {vendor.name}
        </Link>
        <span className="table-sub">
          {[
            vendor.retired ? "Retired" : "",
            vendor.legal_name !== vendor.name ? vendor.legal_name : "",
            countOf(vendor.bills, "bill"),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </td>
      <td>
        {RESIDENCIES[vendor.residency]}
        {vendor.country && <span className="table-sub">{vendor.country}</span>}
      </td>
      <td className="mono">{vendor.pan || <span className="quiet">—</span>}</td>
      <td className="mono">{vendor.gstin || <span className="quiet">—</span>}</td>
      <td>
        {UDYAM_CLASSES[vendor.udyam_class]}
        {vendor.udyam_number && <span className="table-sub mono">{vendor.udyam_number}</span>}
      </td>
      <td>{TDS_KINDS[vendor.tds_kind]}</td>
      <td className="data-table__num">{billed || <span className="quiet">—</span>}</td>
    </tr>
  );
}
