import { Checkbox, Field, Input, Select } from "@/components/ui/field";

/**
 * The "Plan a pilot" and "Edit" form's fields (ws-notes/company/spec.md §9.7.3): the term,
 * four criterion rows with their targets, the three owners at the firm, the price or
 * "Free", what it converts to and when, and the go/no-go day. The form around it is the
 * page's; the service checks every value again.
 */

export type PilotFieldValues = {
  starts_on: string;
  ends_on: string;
  criteria: { what: string; target: string }[];
  owners: { sponsor: string; technical: string; user: string };
  free: boolean;
  price: string;
  currency: string;
  price_note: string;
  converts_on: string;
  conversion_amount: string;
  per: string;
  go_no_go_on: string;
};

export const EMPTY_PILOT: PilotFieldValues = {
  starts_on: "",
  ends_on: "",
  criteria: [],
  owners: { sponsor: "", technical: "", user: "" },
  free: false,
  price: "",
  currency: "INR",
  price_note: "",
  converts_on: "",
  conversion_amount: "",
  per: "month",
  go_no_go_on: "",
};

const ROWS = [0, 1, 2, 3] as const;

export function PilotFields({ prefix, values }: { prefix: string; values: PilotFieldValues }) {
  const at = (name: string) => `${prefix}-${name}`;
  return (
    <>
      <div className="hqdata-pilot-form__pair">
        <Field id={at("starts")} label="First day">
          <Input
            id={at("starts")}
            name="starts_on"
            type="date"
            required
            defaultValue={values.starts_on}
          />
        </Field>
        <Field id={at("ends")} label="Last day">
          <Input
            id={at("ends")}
            name="ends_on"
            type="date"
            required
            defaultValue={values.ends_on}
          />
        </Field>
      </div>
      <fieldset className="hqdata-pilot-form__criteria">
        <legend>Success criteria</legend>
        {ROWS.map((index) => (
          <div key={index} className="hqdata-pilot-form__pair">
            <Field id={at(`criterion-${index}`)} label="Criterion">
              <Input
                id={at(`criterion-${index}`)}
                name={`criterion_${index}`}
                maxLength={200}
                required={index === 0}
                defaultValue={values.criteria[index]?.what ?? ""}
              />
            </Field>
            <Field
              id={at(`target-${index}`)}
              label="Target"
              hint={
                index === 0
                  ? "What success looks like, measurably, agreed with them before it starts."
                  : undefined
              }
            >
              <Input
                id={at(`target-${index}`)}
                name={`target_${index}`}
                maxLength={200}
                defaultValue={values.criteria[index]?.target ?? ""}
              />
            </Field>
          </div>
        ))}
      </fieldset>
      <div className="hqdata-pilot-form__three">
        <Field id={at("sponsor")} label="Sponsor">
          <Input
            id={at("sponsor")}
            name="sponsor"
            maxLength={120}
            defaultValue={values.owners.sponsor}
          />
        </Field>
        <Field id={at("technical")} label="Technical owner">
          <Input
            id={at("technical")}
            name="technical"
            maxLength={120}
            defaultValue={values.owners.technical}
          />
        </Field>
        <Field id={at("user")} label="Daily user">
          <Input id={at("user")} name="user" maxLength={120} defaultValue={values.owners.user} />
        </Field>
      </div>
      <div className="hqdata-pilot-form__pair">
        <Field id={at("price")} label="Price">
          <Input
            id={at("price")}
            name="price"
            inputMode="numeric"
            maxLength={20}
            placeholder="50000"
            defaultValue={values.price}
          />
        </Field>
        <Field id={at("currency")} label="Currency">
          <Select id={at("currency")} name="currency" defaultValue={values.currency}>
            <option value="INR">INR</option>
            <option value="USD">USD</option>
          </Select>
        </Field>
      </div>
      <Checkbox
        id={at("free")}
        name="free"
        label="Free"
        description="A pilot for a reference: no price."
        defaultChecked={values.free}
      />
      <Field id={at("price-note")} label="Price note">
        <Input
          id={at("price-note")}
          name="price_note"
          maxLength={200}
          placeholder="20 per cent upfront"
          defaultValue={values.price_note}
        />
      </Field>
      <div className="hqdata-pilot-form__three">
        <Field id={at("converts-on")} label="Converts on">
          <Input
            id={at("converts-on")}
            name="converts_on"
            type="date"
            defaultValue={values.converts_on}
          />
        </Field>
        <Field id={at("conversion-amount")} label="At">
          <Input
            id={at("conversion-amount")}
            name="conversion_amount"
            inputMode="numeric"
            maxLength={20}
            defaultValue={values.conversion_amount}
          />
        </Field>
        <Field id={at("per")} label="Per">
          <Select id={at("per")} name="per" defaultValue={values.per}>
            <option value="month">a month</option>
            <option value="year">a year</option>
          </Select>
        </Field>
      </div>
      <Field id={at("go-no-go")} label="Go/no-go day">
        <Input
          id={at("go-no-go")}
          name="go_no_go_on"
          type="date"
          defaultValue={values.go_no_go_on}
        />
      </Field>
    </>
  );
}
