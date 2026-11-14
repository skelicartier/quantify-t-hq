import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import type { Director } from "@/lib/data/api/company";
import { DESIGNATIONS } from "@/lib/data/labels-company";

export type DirectorValues = Pick<
  Director,
  | "name"
  | "din"
  | "din_allotted_on"
  | "designation"
  | "appointed_on"
  | "is_founder"
  | "dsc"
  | "kyc"
  | "mca"
>;

export const NEW_DIRECTOR: DirectorValues = {
  name: "",
  din: "",
  din_allotted_on: null,
  designation: "director",
  appointed_on: null,
  is_founder: false,
  dsc: { expires_on: null, kept: "" },
  kyc: { last_filed_on: null, srn: "" },
  mca: { email: "", mobile: "", address: "" },
};

/**
 * A director's fields (company spec §6.7.3): for "Add a director", and for editing one,
 * where the email, mobile and address on the MCA record are left out because they change
 * only through "Record a contact change" (its 30-day filing is a Key date).
 */
export function DirectorFields({
  prefix,
  values,
  today,
  adding,
}: {
  prefix: string;
  values: DirectorValues;
  today: string;
  adding: boolean;
}) {
  const id = (name: string) => `${prefix}-${name}`;
  return (
    <>
      <Field id={id("name")} label="Name">
        <Input id={id("name")} name="name" required maxLength={120} defaultValue={values.name} />
      </Field>
      <Field
        id={id("din")}
        label="DIN"
        hint="Eight digits. Leave it empty if none is allotted yet."
      >
        <Input
          id={id("din")}
          name="din"
          className="mono"
          inputMode="numeric"
          maxLength={8}
          defaultValue={values.din}
        />
      </Field>
      <Field id={id("din-on")} label="DIN allotted on">
        <Input
          id={id("din-on")}
          name="din_allotted_on"
          type="date"
          max={today}
          defaultValue={values.din_allotted_on ?? ""}
        />
      </Field>
      <Field id={id("designation")} label="Designation">
        <Select id={id("designation")} name="designation" defaultValue={values.designation}>
          {Object.entries(DESIGNATIONS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={id("appointed")} label="Appointed on">
        <Input
          id={id("appointed")}
          name="appointed_on"
          type="date"
          defaultValue={values.appointed_on ?? ""}
        />
      </Field>
      <Checkbox
        id={id("founder")}
        name="is_founder"
        label="A founder"
        defaultChecked={values.is_founder}
      />
      <Field id={id("dsc")} label="DSC expires on">
        <Input
          id={id("dsc")}
          name="dsc_expires_on"
          type="date"
          defaultValue={values.dsc.expires_on ?? ""}
        />
      </Field>
      <Field id={id("dsc-kept")} label="Where the DSC is kept" hint="The place, never the PIN.">
        <Input id={id("dsc-kept")} name="dsc_kept" maxLength={200} defaultValue={values.dsc.kept} />
      </Field>
      <Field id={id("kyc")} label="Last DIR-3 KYC filed on">
        <Input
          id={id("kyc")}
          name="kyc_filed_on"
          type="date"
          max={today}
          defaultValue={values.kyc.last_filed_on ?? ""}
        />
      </Field>
      {adding && (
        <>
          <Field id={id("email")} label="Email on the MCA record">
            <Input
              id={id("email")}
              name="mca_email"
              type="email"
              maxLength={254}
              defaultValue={values.mca.email}
            />
          </Field>
          <Field id={id("mobile")} label="Mobile on the MCA record">
            <Input
              id={id("mobile")}
              name="mca_mobile"
              type="tel"
              maxLength={40}
              defaultValue={values.mca.mobile}
            />
          </Field>
          <Field id={id("address")} label="Address on the MCA record">
            <Textarea
              id={id("address")}
              name="mca_address"
              rows={3}
              maxLength={400}
              defaultValue={values.mca.address}
            />
          </Field>
        </>
      )}
    </>
  );
}
