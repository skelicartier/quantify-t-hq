import { notFound } from "next/navigation";

import { updateVendorAction } from "@/app/(portal)/finance/actions";
import { VendorStatePill } from "@/components/finance/finance-parts";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readVendors, type Vendor, type VendorBoard } from "@/lib/api/finance";
import { formatDate, formatMoneyExact } from "@/lib/format";

export const metadata = { title: "Vendor" };
export const dynamic = "force-dynamic";

type Params = Promise<{ vendorId: string }>;

/** One vendor: its terms, the dates they set, and what to do about it. */
export default async function VendorPage({ params }: { params: Params }) {
  const { vendorId } = await params;
  const context = await requireStaff(`/finance/vendors/${vendorId}`);
  if (!hasCapability(context, "revenue:write")) {
    return (
      <>
        <PageHeader eyebrow="Business" title="Vendor" />
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
  if (board === null) {
    return (
      <>
        <PageHeader eyebrow="Business" title="Vendor" />
        <Callout tone="danger" role="alert">
          This vendor could not be read just now.
        </Callout>
      </>
    );
  }
  const vendor: Vendor | undefined = board.vendors.find((item) => item.vendor_id === vendorId);
  if (!vendor) notFound();
  const hidden = { vendor_id: vendor.vendor_id };

  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/finance/vendors", label: "Vendors" }]}
        title={vendor.name}
        status={<VendorStatePill state={vendor.state} status={vendor.status} />}
        readouts={[
          {
            label: "Cost",
            value: `${formatMoneyExact(vendor.amount, vendor.currency)} ${vendor.billing_label.toLowerCase()}`,
          },
          { label: "Next renewal", value: formatDate(vendor.next_renewal, "—") },
          { label: "Cancel by", value: formatDate(vendor.cancel_by, "—") },
        ]}
      />
      {vendor.reason && (
        <Callout tone={vendor.state === "locked" ? "danger" : "attention"} compact>
          {vendor.reason}.
        </Callout>
      )}
      <RecordGrid
        side={
          <Properties title="Terms">
            <Property label="Kind">{vendor.category_label}</Property>
            <Property label="A month">
              {vendor.monthly_equivalent === null
                ? "—"
                : formatMoneyExact(vendor.monthly_equivalent, vendor.currency)}
            </Property>
            <Property label="Notice">{vendor.notice_days} days</Property>
            <Property label="Renews by itself">{vendor.auto_renews ? "Yes" : "No"}</Property>
            <Property label="Owner">{vendor.owner_name || "Nobody"}</Property>
            <Property label="Contract">{vendor.contract_ref || "—"}</Property>
            {vendor.cancelled_on && (
              <Property label="Cancelled">{formatDate(vendor.cancelled_on)}</Property>
            )}
          </Properties>
        }
      >
        <RecordSection id="notes" title="Notes">
          <p className="prewrap">{vendor.notes || "None."}</p>
        </RecordSection>
        <RecordSection id="work" title="Work it">
          <div className="form-grid">
            {vendor.status === "active" && (
              <Card
                title="Give notice"
                titleAs="h3"
                description="It runs to the end of the term, then stops."
              >
                <ActForm
                  action={updateVendorAction}
                  hidden={{ ...hidden, status: "cancelling" }}
                  act="notice"
                  label="Notice given"
                />
              </Card>
            )}
            {vendor.status !== "cancelled" && (
              <Card
                title="It has ended"
                titleAs="h3"
                description="Kept on the register as cancelled."
              >
                <ActForm
                  action={updateVendorAction}
                  hidden={{ ...hidden, status: "cancelled" }}
                  act="cancel"
                  label="Mark cancelled"
                  danger
                />
              </Card>
            )}
            {vendor.status !== "active" && (
              <Card title="Keep it after all" titleAs="h3">
                <ActForm
                  action={updateVendorAction}
                  hidden={{ ...hidden, status: "active" }}
                  act="keep"
                  label="Back to active"
                />
              </Card>
            )}
          </div>
          <details className="disclosure">
            <summary>Change the terms</summary>
            <ActForm
              action={updateVendorAction}
              hidden={hidden}
              act="edit"
              label="Save"
              tight={false}
            >
              <input type="hidden" name="auto_renews:present" value="1" />
              <Field id="edit-name" label="Vendor">
                <Input id="edit-name" name="name" maxLength={160} defaultValue={vendor.name} />
              </Field>
              <div className="form-grid">
                <Field id="edit-amount" label="Cost each time">
                  <Input
                    id="edit-amount"
                    name="amount"
                    inputMode="decimal"
                    maxLength={24}
                    defaultValue={String(vendor.amount)}
                  />
                </Field>
                <Field id="edit-billing" label="Billed">
                  <Select id="edit-billing" name="billing" defaultValue={vendor.billing}>
                    {board.billing.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="form-grid">
                <Field id="edit-renews" label="Renews on">
                  <Input
                    id="edit-renews"
                    name="renews_on"
                    type="date"
                    defaultValue={vendor.renews_on ?? ""}
                  />
                </Field>
                <Field id="edit-notice" label="Notice (days)">
                  <Input
                    id="edit-notice"
                    name="notice_days"
                    type="number"
                    min={0}
                    max={365}
                    defaultValue={vendor.notice_days}
                  />
                </Field>
              </div>
              <label className="checkbox">
                <input type="checkbox" name="auto_renews" defaultChecked={vendor.auto_renews} />
                <span className="checkbox__label">Renews by itself unless cancelled</span>
              </label>
              <Field id="edit-owner" label="Owner">
                <Select
                  id="edit-owner"
                  name="owner_staff_id"
                  defaultValue={vendor.owner_staff_id ?? ""}
                >
                  <option value="">Nobody</option>
                  {board.staff.map((person) => (
                    <option key={person.staff_id} value={person.staff_id}>
                      {person.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="edit-contract" label="Contract reference">
                <Input
                  id="edit-contract"
                  name="contract_ref"
                  maxLength={120}
                  defaultValue={vendor.contract_ref}
                />
              </Field>
              <Field id="edit-notes" label="Notes">
                <Textarea
                  id="edit-notes"
                  name="notes"
                  rows={3}
                  maxLength={2000}
                  defaultValue={vendor.notes}
                />
              </Field>
            </ActForm>
          </details>
        </RecordSection>
      </RecordGrid>
    </>
  );
}
