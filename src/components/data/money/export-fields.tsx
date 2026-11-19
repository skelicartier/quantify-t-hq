import { CopyFields, type FileOption } from "@/components/data/meetings/copy-fields";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { DUTY_CURRENCIES } from "@/lib/data/labels-duties";
import { TAX_TREATMENTS } from "@/lib/data/labels-money";

export type ExportValues = {
  customer: string;
  country: string;
  invoice_number: string;
  invoice_on: string;
  currency: string;
  amount: string;
  tax_treatment: string;
  purpose_code: string;
  rail: string;
  notes: string;
};

export const NEW_EXPORT: ExportValues = {
  customer: "",
  country: "",
  invoice_number: "",
  invoice_on: "",
  currency: "USD",
  amount: "",
  tax_treatment: "under_lut",
  purpose_code: "",
  rail: "",
  notes: "",
};

/**
 * An export invoice's paperwork: the customer, the invoice as the books issued it, its tax
 * treatment, the RBI purpose code the bank used and how the money comes in. HQ issues no
 * invoice; this records one.
 */
export function ExportFields({
  prefix,
  values,
  today,
  copy,
}: {
  prefix: string;
  values: ExportValues;
  today: string;
  copy?: { files: readonly FileOption[]; filesHere: boolean } | undefined;
}) {
  const id = (name: string) => `${prefix}-${name}`;
  return (
    <>
      <div className="hqdata-money-form__pair">
        <Field id={id("customer")} label="Customer">
          <Input
            id={id("customer")}
            name="customer"
            required
            maxLength={200}
            defaultValue={values.customer}
          />
        </Field>
        <Field id={id("country")} label="Country">
          <Input id={id("country")} name="country" maxLength={60} defaultValue={values.country} />
        </Field>
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
        <Field id={id("on")} label="Invoice day">
          <Input
            id={id("on")}
            name="invoice_on"
            type="date"
            required
            defaultValue={values.invoice_on || today}
          />
        </Field>
      </div>
      <div className="hqdata-money-form__pair">
        <Field id={id("currency")} label="Currency">
          <Select id={id("currency")} name="currency" defaultValue={values.currency}>
            {DUTY_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={id("amount")} label="Amount">
          <Input
            id={id("amount")}
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            required
            defaultValue={values.amount}
          />
        </Field>
      </div>
      <div className="hqdata-money-form__pair">
        <Field id={id("tax")} label="Tax treatment">
          <Select id={id("tax")} name="tax_treatment" defaultValue={values.tax_treatment}>
            {Object.entries(TAX_TREATMENTS).map(([key, label]) => (
              <option key={key || "blank"} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          id={id("purpose")}
          label="Purpose code"
          hint="As the bank used it: P and four digits."
        >
          <Input
            id={id("purpose")}
            name="purpose_code"
            maxLength={5}
            autoComplete="off"
            className="mono"
            placeholder="P0802"
            defaultValue={values.purpose_code}
          />
        </Field>
      </div>
      <Field id={id("rail")} label="How it comes in">
        <Input id={id("rail")} name="rail" maxLength={120} defaultValue={values.rail} />
      </Field>
      <Field id={id("notes")} label="Notes">
        <Textarea
          id={id("notes")}
          name="notes"
          rows={2}
          maxLength={4_000}
          defaultValue={values.notes}
        />
      </Field>
      {copy && (
        <CopyFields
          prefix={id("copy")}
          label="The invoice"
          files={copy.files}
          filesHere={copy.filesHere}
          folder="Money › Export invoices"
        />
      )}
    </>
  );
}
