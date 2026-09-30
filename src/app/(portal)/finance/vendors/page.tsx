import Link from "next/link";

import { createVendorAction } from "@/app/(portal)/finance/actions";
import { FinanceTabs, VendorStatePill } from "@/components/finance/finance-parts";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readVendors, type VendorBoard } from "@/lib/api/finance";
import { formatDate, formatMoneyExact } from "@/lib/format";

export const metadata = { title: "Vendors" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "vendor", label: "Vendor" },
  { key: "category", label: "Kind" },
  { key: "cost", label: "Cost", align: "end" as const },
  { key: "monthly", label: "A month", align: "end" as const },
  { key: "renews", label: "Next renewal" },
  { key: "cancel", label: "Cancel by" },
  { key: "state", label: "State" },
  { key: "owner", label: "Owner" },
];

/**
 * What we pay for, what it costs a month, and when an annual term must be cancelled by —
 * the date that matters, since after it the next year is already bought.
 */
export default async function VendorsPage() {
  const context = await requireStaff("/finance/vendors");
  if (!hasCapability(context, "revenue:write")) {
    return (
      <>
        <PageHeader eyebrow="Business" title="Vendors" />
        <Callout tone="neutral">Vendors are kept by Owners and Admins.</Callout>
      </>
    );
  }
  let board: VendorBoard | null = null;
  try {
    board = await readVendors(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const totals = Object.entries(board?.monthly_by_currency ?? {});

  return (
    <>
      <PageHeader
        eyebrow="Business"
        title="Vendors"
        description="Subscriptions and services with their renewal dates and the notice each needs. An annual term shows when it must be kept or cancelled; after that date the next year is bought."
        actions={
          <>
            <FinanceTabs current="/finance/vendors" />
            {board && (
              <Popover label="Add a vendor" variant="primary" width="wide">
                <ActForm
                  action={createVendorAction}
                  hidden={{}}
                  act="create"
                  label="Add the vendor"
                  primary
                  tight={false}
                >
                  <input type="hidden" name="auto_renews:present" value="1" />
                  <Field id="vendor-name" label="Vendor">
                    <Input id="vendor-name" name="name" maxLength={160} required />
                  </Field>
                  <div className="form-grid">
                    <Field id="vendor-category" label="Kind">
                      <Select id="vendor-category" name="category" defaultValue="software">
                        {board.categories.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field id="vendor-billing" label="Billed">
                      <Select id="vendor-billing" name="billing" defaultValue="annual">
                        {board.billing.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <div className="form-grid">
                    <Field id="vendor-amount" label="Cost each time">
                      <Input
                        id="vendor-amount"
                        name="amount"
                        inputMode="decimal"
                        maxLength={24}
                        placeholder="1200.00"
                      />
                    </Field>
                    <Field id="vendor-currency" label="Currency">
                      <Input
                        id="vendor-currency"
                        name="currency"
                        maxLength={3}
                        defaultValue="USD"
                      />
                    </Field>
                  </div>
                  <div className="form-grid">
                    <Field id="vendor-renews" label="Renews on">
                      <Input id="vendor-renews" name="renews_on" type="date" />
                    </Field>
                    <Field id="vendor-notice" label="Notice (days)">
                      <Input
                        id="vendor-notice"
                        name="notice_days"
                        type="number"
                        min={0}
                        max={365}
                        defaultValue={30}
                      />
                    </Field>
                  </div>
                  <label className="checkbox">
                    <input type="checkbox" name="auto_renews" defaultChecked />
                    <span className="checkbox__label">Renews by itself unless cancelled</span>
                  </label>
                  <Field id="vendor-owner" label="Owner">
                    <Select id="vendor-owner" name="owner_staff_id" defaultValue="">
                      <option value="">Nobody yet</option>
                      {board.staff.map((person) => (
                        <option key={person.staff_id} value={person.staff_id}>
                          {person.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </ActForm>
              </Popover>
            )}
          </>
        }
      />
      {board === null ? (
        <Callout tone="danger" role="alert">
          The vendors could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          {board.decide > 0 && (
            <Callout tone="attention" compact>
              {board.decide} annual term{board.decide === 1 ? "" : "s"} to keep or cancel in the
              next 30 days.
            </Callout>
          )}
          <Section
            id="vendors"
            title="The register"
            description={
              totals.length
                ? `Running cost a month: ${totals.map(([currency, amount]) => formatMoneyExact(amount, currency)).join(" · ")} (annual terms spread over twelve; usage and one-off costs not counted).`
                : "Nothing running yet."
            }
          >
            <DataTable
              caption="Vendors, decisions first"
              columns={COLUMNS}
              isEmpty={board.vendors.length === 0}
              empty={<p className="muted">No vendors yet.</p>}
            >
              {board.vendors.map((vendor) => (
                <tr key={vendor.vendor_id}>
                  <td>
                    <Link href={`/finance/vendors/${vendor.vendor_id}`}>{vendor.name}</Link>
                  </td>
                  <td>{vendor.category_label}</td>
                  <td className="data-table__num">
                    {formatMoneyExact(vendor.amount, vendor.currency)}{" "}
                    {vendor.billing_label.toLowerCase()}
                  </td>
                  <td className="data-table__num">
                    {vendor.monthly_equivalent === null
                      ? "—"
                      : formatMoneyExact(vendor.monthly_equivalent, vendor.currency)}
                  </td>
                  <td>{formatDate(vendor.next_renewal, "—")}</td>
                  <td>{formatDate(vendor.cancel_by, "—")}</td>
                  <td>
                    <VendorStatePill state={vendor.state} status={vendor.status} />
                  </td>
                  <td>{vendor.owner_name || "Nobody"}</td>
                </tr>
              ))}
            </DataTable>
          </Section>
        </div>
      )}
    </>
  );
}
