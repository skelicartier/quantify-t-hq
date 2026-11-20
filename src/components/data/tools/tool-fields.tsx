import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import type { AccountRow, ToolRow } from "@/lib/data/api/tools";
import { DUTY_CURRENCIES, minorInput } from "@/lib/data/labels-duties";
import {
  ACCOUNT_KINDS,
  ACCOUNT_ROLES,
  BILLING,
  COVER_HINT,
  CRITICAL_HINT,
  DATA_CLASSES,
  DATA_CLASS_KEYS,
  KEY_DATE_COVERS,
  KEY_DATE_COVER_KEYS,
  TOOL_CATEGORIES,
  TOOL_STATUSES,
} from "@/lib/data/labels-systems";

/**
 * The forms of Systems › Tools (ws-notes/security/spec.md §6.8): a tool's fields in the
 * spec's order, an account's, and the smaller forms. Plain fields drawn on the server; each
 * form's ids start with its own prefix so two on one page never clash. No field takes a
 * password: the ones that might attract one say where to write it instead.
 */

const SIGN_IN_CHOICES = [
  ["", "Not known"],
  ["sso", "Through the mail suite"],
  ["password", "Its own password"],
  ["passkey", "Passkey"],
  ["mixed", "Mixed"],
] as const;

const TWO_STEP_CHOICES = [
  ["", "Not known"],
  ["enforced", "Enforced"],
  ["optional", "Optional"],
  ["none", "None"],
] as const;

const FLAG_CHOICES = [
  ["", "Not known"],
  ["yes", "Yes"],
  ["no", "No"],
] as const;

const NO_PASSWORD = "Names and where things are kept, never a password.";

export function ToolFields({ prefix, values }: { prefix: string; values: ToolRow | null }) {
  const field = (name: string) => `${prefix}-${name}`;
  return (
    <>
      <input type="hidden" name="holds_given" value="1" />
      <input type="hidden" name="critical_given" value="1" />
      <Field id={field("name")} label="Name">
        <Input
          id={field("name")}
          name="name"
          maxLength={120}
          required
          defaultValue={values?.name ?? ""}
          autoComplete="off"
        />
      </Field>
      <Field id={field("what")} label="What it is for">
        <Input id={field("what")} name="what" maxLength={300} defaultValue={values?.what ?? ""} />
      </Field>
      <div className="hqdata-systems__pair">
        <Field id={field("category")} label="Category">
          <Select id={field("category")} name="category" defaultValue={values?.category ?? "other"}>
            {Object.entries(TOOL_CATEGORIES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={field("status")} label="Status">
          <Select id={field("status")} name="status" defaultValue={values?.status ?? "in_use"}>
            {Object.entries(TOOL_STATUSES)
              .filter(([key]) => key !== "retired")
              .map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
          </Select>
        </Field>
      </div>
      <div className="hqdata-systems__pair">
        <Field id={field("owner")} label="Business owner">
          <Input
            id={field("owner")}
            name="business_owner"
            maxLength={200}
            defaultValue={values?.business_owner ?? ""}
          />
        </Field>
        <Field id={field("admins")} label="Who administers it" hint={NO_PASSWORD}>
          <Input
            id={field("admins")}
            name="admins"
            maxLength={200}
            defaultValue={values?.admins ?? ""}
          />
        </Field>
      </div>
      <div className="hqdata-systems__pair">
        <Field id={field("plan")} label="Plan">
          <Input id={field("plan")} name="plan" maxLength={120} defaultValue={values?.plan ?? ""} />
        </Field>
        <Field id={field("seats")} label="Seats">
          <Input
            id={field("seats")}
            name="seats"
            inputMode="numeric"
            maxLength={7}
            defaultValue={values?.seats === null || !values ? "" : String(values.seats)}
          />
        </Field>
      </div>
      <div className="hqdata-systems__pair">
        <Field id={field("amount")} label="Cost">
          <Input
            id={field("amount")}
            name="amount"
            inputMode="decimal"
            maxLength={20}
            defaultValue={
              values?.amount_minor === null || !values ? "" : minorInput(values.amount_minor)
            }
          />
        </Field>
        <Field id={field("currency")} label="Currency">
          <Select id={field("currency")} name="currency" defaultValue={values?.currency ?? "INR"}>
            {DUTY_CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="hqdata-systems__pair">
        <Field id={field("billing")} label="Billing">
          <Select id={field("billing")} name="billing" defaultValue={values?.billing ?? ""}>
            {Object.entries(BILLING).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={field("renews")} label="Renews on">
          <Input
            id={field("renews")}
            name="renews_on"
            type="date"
            defaultValue={values?.renews_on ?? ""}
          />
        </Field>
      </div>
      <div className="hqdata-systems__pair">
        <Field id={field("notice")} label="Notice in days">
          <Input
            id={field("notice")}
            name="notice_days"
            inputMode="numeric"
            maxLength={3}
            defaultValue={values?.notice_days === null || !values ? "" : String(values.notice_days)}
          />
        </Field>
        <Field id={field("auto")} label="Renews by itself">
          <Select id={field("auto")} name="auto_renews" defaultValue={values?.auto_renews ?? ""}>
            {FLAG_CHOICES.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id={field("cover")} label="Stands for in Key dates" hint={COVER_HINT}>
        <Select id={field("cover")} name="key_date" defaultValue={values?.key_date ?? ""}>
          <option value="">None</option>
          {KEY_DATE_COVER_KEYS.map((key) => (
            <option key={key} value={key}>
              {KEY_DATE_COVERS[key]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="hqdata-systems__pair">
        <Field id={field("sign-in")} label="Sign-in">
          <Select id={field("sign-in")} name="sign_in" defaultValue={values?.sign_in ?? ""}>
            {SIGN_IN_CHOICES.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={field("through")} label="Through what">
          <Input
            id={field("through")}
            name="sso_with"
            maxLength={120}
            defaultValue={values?.sso_with ?? ""}
          />
        </Field>
      </div>
      <Field id={field("mfa")} label="Two-step sign-in">
        <Select id={field("mfa")} name="mfa" defaultValue={values?.mfa ?? ""}>
          {TWO_STEP_CHOICES.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Checkbox
        id={field("critical")}
        name="critical"
        value="1"
        defaultChecked={values?.critical ?? false}
        label="Critical"
        description={CRITICAL_HINT}
      />
      <fieldset className="hqdata-systems__holds">
        <legend>Holds</legend>
        {DATA_CLASS_KEYS.map((key) => (
          <Checkbox
            key={key}
            id={field(`holds-${key}`)}
            name="holds"
            value={key}
            defaultChecked={values?.holds.includes(key) ?? false}
            label={DATA_CLASSES[key]}
          />
        ))}
      </fieldset>
      <Field id={field("where")} label="Where its data is">
        <Input
          id={field("where")}
          name="data_location"
          maxLength={200}
          defaultValue={values?.data_location ?? ""}
        />
      </Field>
      <Field id={field("exit")} label="How to export and leave">
        <Textarea
          id={field("exit")}
          name="exit"
          rows={3}
          maxLength={1000}
          defaultValue={values?.exit ?? ""}
        />
      </Field>
      <Field id={field("notes")} label="Notes" hint={NO_PASSWORD}>
        <Textarea
          id={field("notes")}
          name="notes"
          rows={3}
          maxLength={2000}
          defaultValue={values?.notes ?? ""}
        />
      </Field>
    </>
  );
}

export function AccountFields({
  prefix,
  values,
  today,
}: {
  prefix: string;
  values: AccountRow | null;
  today: string;
}) {
  const field = (name: string) => `${prefix}-${name}`;
  return (
    <>
      <Field id={field("holder")} label="Holder" hint="As the tool shows it: a name or an address.">
        <Input
          id={field("holder")}
          name="holder"
          maxLength={200}
          required
          defaultValue={values?.holder ?? ""}
          autoComplete="off"
        />
      </Field>
      <div className="hqdata-systems__pair">
        <Field id={field("kind")} label="Kind">
          <Select id={field("kind")} name="kind" defaultValue={values?.kind ?? "person"}>
            {Object.entries(ACCOUNT_KINDS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={field("role")} label="Role">
          <Select id={field("role")} name="role" defaultValue={values?.role ?? ""}>
            {Object.entries(ACCOUNT_ROLES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="hqdata-systems__pair">
        <Field id={field("mfa")} label="Two-step sign-in">
          <Select id={field("mfa")} name="mfa" defaultValue={values?.mfa ?? ""}>
            {FLAG_CHOICES.map(([key, label]) => (
              <option key={key} value={key}>
                {key === "yes" ? "On" : key === "no" ? "Off" : label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={field("critical")} label="Critical">
          <Select
            id={field("critical")}
            name="critical"
            defaultValue={
              values?.critical === null || !values ? "" : values.critical ? "yes" : "no"
            }
          >
            <option value="">As the tool</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </Select>
        </Field>
      </div>
      <Field id={field("opened")} label="Opened on">
        <Input
          id={field("opened")}
          name="opened_on"
          type="date"
          max={today}
          defaultValue={values?.opened_on ?? ""}
        />
      </Field>
      <Field id={field("notes")} label="Notes" hint={NO_PASSWORD}>
        <Input
          id={field("notes")}
          name="notes"
          maxLength={2000}
          defaultValue={values?.notes ?? ""}
        />
      </Field>
    </>
  );
}
