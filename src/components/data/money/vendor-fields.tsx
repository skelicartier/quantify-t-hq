import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FLAG_WORDS, RESIDENCIES, TDS_KINDS, UDYAM_CLASSES } from "@/lib/data/labels-money";

export type VendorValues = {
  name: string;
  legal_name: string;
  residency: string;
  country: string;
  pan: string;
  gstin: string;
  udyam_class: string;
  udyam_number: string;
  udyam_checked_on: string;
  msme_agreement: string;
  msme_days: string;
  tds_kind: string;
  default_category_id: string;
  notes: string;
};

export const NEW_VENDOR_VALUES: VendorValues = {
  name: "",
  legal_name: "",
  residency: "resident",
  country: "India",
  pan: "",
  gstin: "",
  udyam_class: "",
  udyam_number: "",
  udyam_checked_on: "",
  msme_agreement: "",
  msme_days: "",
  tds_kind: "",
  default_category_id: "",
  notes: "",
};

const options = <T extends Record<string, string>>(table: T) =>
  (Object.keys(table) as (keyof T & string)[]).map((key) => (
    <option key={key || "blank"} value={key}>
      {table[key]}
    </option>
  ));

/**
 * A vendor's form: who it is, where, its PAN and GSTIN as on its invoices, its Udyam class
 * (micro and small suppliers have a pay-by limit), a written agreement on payment days, the
 * kind of tax usually deducted, its usual category. Never a bank account number: the notes
 * refuse one.
 */
export function VendorFields({
  prefix,
  values,
  categories,
}: {
  prefix: string;
  values: VendorValues;
  categories: readonly { id: string; name: string }[];
}) {
  const id = (name: string) => `${prefix}-${name}`;
  return (
    <>
      <div className="hqdata-money-form__pair">
        <Field id={id("name")} label="Name">
          <Input id={id("name")} name="name" required maxLength={200} defaultValue={values.name} />
        </Field>
        <Field id={id("legal-name")} label="Legal name">
          <Input
            id={id("legal-name")}
            name="legal_name"
            maxLength={200}
            defaultValue={values.legal_name}
          />
        </Field>
      </div>
      <div className="hqdata-money-form__pair">
        <Field id={id("residency")} label="Where">
          <Select id={id("residency")} name="residency" defaultValue={values.residency}>
            {options(RESIDENCIES)}
          </Select>
        </Field>
        <Field id={id("country")} label="Country">
          <Input id={id("country")} name="country" maxLength={60} defaultValue={values.country} />
        </Field>
      </div>
      <div className="hqdata-money-form__pair">
        <Field id={id("pan")} label="PAN">
          <Input
            id={id("pan")}
            name="pan"
            maxLength={10}
            autoComplete="off"
            className="mono"
            defaultValue={values.pan}
          />
        </Field>
        <Field id={id("gstin")} label="GSTIN">
          <Input
            id={id("gstin")}
            name="gstin"
            maxLength={15}
            autoComplete="off"
            className="mono"
            defaultValue={values.gstin}
          />
        </Field>
      </div>
      <div className="hqdata-money-form__three">
        <Field id={id("udyam-class")} label="Udyam class">
          <Select id={id("udyam-class")} name="udyam_class" defaultValue={values.udyam_class}>
            {options(UDYAM_CLASSES)}
          </Select>
        </Field>
        <Field id={id("udyam-number")} label="Udyam number">
          <Input
            id={id("udyam-number")}
            name="udyam_number"
            maxLength={25}
            autoComplete="off"
            className="mono"
            placeholder="UDYAM-XX-00-0000000"
            defaultValue={values.udyam_number}
          />
        </Field>
        <Field id={id("udyam-checked")} label="Udyam checked on">
          <Input
            id={id("udyam-checked")}
            name="udyam_checked_on"
            type="date"
            defaultValue={values.udyam_checked_on}
          />
        </Field>
      </div>
      <div className="hqdata-money-form__pair">
        <Field id={id("agreement")} label="Written agreement on payment days">
          <Select id={id("agreement")} name="msme_agreement" defaultValue={values.msme_agreement}>
            {options(FLAG_WORDS)}
          </Select>
        </Field>
        <Field
          id={id("days")}
          label="Agreed days"
          hint="1 to 365; the limit applied is 45 at most."
        >
          <Input
            id={id("days")}
            name="msme_days"
            inputMode="numeric"
            maxLength={3}
            defaultValue={values.msme_days}
          />
        </Field>
      </div>
      <div className="hqdata-money-form__pair">
        <Field id={id("tds-kind")} label="Tax deducted as">
          <Select id={id("tds-kind")} name="tds_kind" defaultValue={values.tds_kind}>
            {options(TDS_KINDS)}
          </Select>
        </Field>
        <Field id={id("category")} label="Usual category">
          <Select
            id={id("category")}
            name="default_category_id"
            defaultValue={values.default_category_id}
          >
            <option value="">None</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field
        id={id("notes")}
        label="Notes"
        hint="Never a bank account or card number: the last four digits are enough."
      >
        <Textarea
          id={id("notes")}
          name="notes"
          rows={3}
          maxLength={4_000}
          defaultValue={values.notes}
        />
      </Field>
    </>
  );
}
