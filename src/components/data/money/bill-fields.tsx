import { CopyFields, type FileOption } from "@/components/data/meetings/copy-fields";
import { Field, Input, Select } from "@/components/ui/field";
import { DUTY_CURRENCIES } from "@/lib/data/labels-duties";
import { GST_TREATMENTS, TDS_KINDS } from "@/lib/data/labels-money";

/** Where an attached bill goes in Files, as the hint says it. */
export const BILL_FOLDER = "Money › Bills › the bill's financial year";

/** The value of the Vendor list's "Add a vendor" choice. */
export const NEW_VENDOR = "new";

export type BillValues = {
  vendor_id: string;
  invoice_number: string;
  invoice_on: string;
  accepted_on: string;
  description: string;
  currency: string;
  taxable: string;
  gst: string;
  total: string;
  gst_treatment: string;
  category_id: string;
  tds_kind: string;
  pay_by: string;
};

export const NEW_BILL: BillValues = {
  vendor_id: "",
  invoice_number: "",
  invoice_on: "",
  accepted_on: "",
  description: "",
  currency: "INR",
  taxable: "",
  gst: "",
  total: "",
  gst_treatment: "charged_on_the_bill",
  category_id: "",
  tds_kind: "",
  pay_by: "",
};

type Option = { id: string; name: string };

/**
 * The bill's form, in the spec's order (ws-notes/duties/spec.md §8.6): Vendor (or "Add a
 * vendor") · Invoice number · Invoice day · Accepted on · What it is for · Currency · Amount
 * before GST · GST on the bill · Total · GST treatment · Category · Tax deducted: kind · The
 * invoice. Amounts are typed as the bill prints them ("1,180.50") and go to the service as
 * typed. The kind of tax deducted is the vendor's unless another is chosen. Editing adds "Pay
 * by", his own day for a bill no MSME limit covers, and offers no copy (that is its own act).
 */
export function BillFields({
  prefix,
  values,
  vendors,
  categories,
  today,
  copy,
}: {
  prefix: string;
  values: BillValues;
  vendors: readonly Option[];
  categories: readonly Option[];
  today: string;
  /** Offered when adding: the invoice from Files or attached here. */
  copy?: { files: readonly FileOption[]; filesHere: boolean } | undefined;
}) {
  const id = (name: string) => `${prefix}-${name}`;
  const adding = copy !== undefined;
  return (
    <>
      <div className="hqdata-money-form__pair">
        <Field id={id("vendor")} label="Vendor">
          <Select
            id={id("vendor")}
            name="vendor_id"
            defaultValue={values.vendor_id}
            required={!adding}
          >
            {adding && <option value="">Choose a vendor</option>}
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
            {adding && <option value={NEW_VENDOR}>Add a vendor</option>}
          </Select>
        </Field>
        {adding && (
          <Field id={id("new-vendor")} label="New vendor's name" hint="Only when adding a vendor.">
            <Input id={id("new-vendor")} name="new_vendor" maxLength={200} />
          </Field>
        )}
      </div>
      <div className="hqdata-money-form__pair">
        <Field id={id("number")} label="Invoice number">
          <Input
            id={id("number")}
            name="invoice_number"
            required
            maxLength={60}
            defaultValue={values.invoice_number}
          />
        </Field>
        <Field id={id("invoice-on")} label="Invoice day">
          <Input
            id={id("invoice-on")}
            name="invoice_on"
            type="date"
            required
            defaultValue={values.invoice_on || today}
          />
        </Field>
      </div>
      <div className="hqdata-money-form__pair">
        <Field
          id={id("accepted-on")}
          label="Accepted on"
          hint="Optional: the day the goods or the service were accepted, when not the invoice day."
        >
          <Input
            id={id("accepted-on")}
            name="accepted_on"
            type="date"
            defaultValue={values.accepted_on}
          />
        </Field>
        <Field id={id("description")} label="What it is for">
          <Input
            id={id("description")}
            name="description"
            maxLength={300}
            defaultValue={values.description}
          />
        </Field>
      </div>
      <Field id={id("currency")} label="Currency">
        <Select id={id("currency")} name="currency" defaultValue={values.currency}>
          {DUTY_CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </Select>
      </Field>
      <div className="hqdata-money-form__three">
        <Field id={id("taxable")} label="Amount before GST">
          <Input
            id={id("taxable")}
            name="taxable"
            inputMode="decimal"
            autoComplete="off"
            required
            placeholder="10,000.00"
            defaultValue={values.taxable}
          />
        </Field>
        <Field id={id("gst")} label="GST on the bill">
          <Input
            id={id("gst")}
            name="gst"
            inputMode="decimal"
            autoComplete="off"
            placeholder="1,800.00"
            defaultValue={values.gst}
          />
        </Field>
        <Field id={id("total")} label="Total" hint="Left blank, the two parts added.">
          <Input
            id={id("total")}
            name="total"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={values.total}
          />
        </Field>
      </div>
      <div className="hqdata-money-form__pair">
        <Field id={id("gst-treatment")} label="GST treatment">
          <Select id={id("gst-treatment")} name="gst_treatment" defaultValue={values.gst_treatment}>
            {(["charged_on_the_bill", "reverse_charge", "no_gst"] as const).map((key) => (
              <option key={key} value={key}>
                {GST_TREATMENTS[key]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={id("category")} label="Category">
          <Select id={id("category")} name="category_id" defaultValue={values.category_id}>
            <option value="">{adding ? "The vendor's, if it has one" : "None"}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="hqdata-money-form__pair">
        <Field id={id("tds-kind")} label="Tax deducted: kind">
          <Select id={id("tds-kind")} name="tds_kind" defaultValue={values.tds_kind}>
            <option value="">{adding ? "The vendor's" : "Not decided"}</option>
            {(Object.keys(TDS_KINDS) as (keyof typeof TDS_KINDS)[])
              .filter((key) => key !== "")
              .map((key) => (
                <option key={key} value={key}>
                  {TDS_KINDS[key]}
                </option>
              ))}
          </Select>
        </Field>
        {!adding && (
          <Field
            id={id("pay-by")}
            label="Pay by"
            hint="Optional: your own day, used when no MSME limit applies."
          >
            <Input id={id("pay-by")} name="pay_by" type="date" defaultValue={values.pay_by} />
          </Field>
        )}
      </div>
      {copy && (
        <CopyFields
          prefix={id("copy")}
          label="The invoice"
          files={copy.files}
          filesHere={copy.filesHere}
          folder={BILL_FOLDER}
        />
      )}
    </>
  );
}
