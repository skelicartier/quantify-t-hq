import { CopyFields, type FileOption } from "@/components/data/meetings/copy-fields";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  AGREEMENT_STATUSES,
  AGREEMENT_TYPES,
  FLAG_WORDS,
  PARTY_KINDS,
  SIGNING,
} from "@/lib/data/labels-registers";

/** The most counterparties an agreement holds; the company is the other side. */
export const PARTY_ROWS = 5;

export const END_HINT =
  "Worked out as the day before the same date that many months on. Check it against the agreement.";

type Option = { id: string; name: string };
export type PartyPickers = {
  investor: Option[] | null;
  waitlist: Option[] | null;
  director: Option[] | null;
};

export type AgreementValues = {
  title: string;
  type: string;
  parties: { kind: string; ref_id: string | null; name: string; entity: string; country: string }[];
  status: string;
  effective_on: string | null;
  signed_on: string | null;
  term: { months: number | null; ends_on: string | null };
  renewal: {
    auto: boolean;
    months: number | null;
    renews_on: string | null;
    notice_days: number | null;
  };
  terminate_for_convenience: string;
  governing_law: string;
  forum: string;
  value: { amount: number; currency: "INR" | "USD" } | null;
  signing: string;
  stamp: { state: string; amount: number | null; certificate_no: string } | null;
  related_party: boolean;
  personal_data: boolean;
  ip_clause: string;
  confidentiality_clause: string;
  owner: string;
  review_on: string | null;
  notes: string;
};

export const NEW_AGREEMENT: AgreementValues = {
  title: "",
  type: "nda",
  parties: [],
  status: "draft",
  effective_on: null,
  signed_on: null,
  term: { months: null, ends_on: null },
  renewal: { auto: false, months: null, renews_on: null, notice_days: null },
  terminate_for_convenience: "",
  governing_law: "India",
  forum: "",
  value: null,
  signing: "",
  stamp: null,
  related_party: false,
  personal_data: false,
  ip_clause: "",
  confidentiality_clause: "",
  owner: "",
  review_on: null,
  notes: "",
};

const PICKER_GROUPS = [
  { kind: "director", label: "Directors" },
  { kind: "investor", label: "Investor firms" },
  { kind: "waitlist", label: "Waitlist firms" },
] as const;

const text = (value: number | string | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

function PartyRow({
  prefix,
  index,
  pickers,
  value,
}: {
  prefix: string;
  index: number;
  pickers: PartyPickers;
  value: AgreementValues["parties"][number] | undefined;
}) {
  const id = (name: string) => `${prefix}-party-${index}-${name}`;
  const anyPicker = PICKER_GROUPS.some((group) => (pickers[group.kind]?.length ?? 0) > 0);
  const picked = value?.ref_id ? `${value.kind}:${value.ref_id}` : "";
  return (
    <div className="hqdata-party">
      <div className="hqdata-agreement-form__pair">
        <Field id={id("kind")} label="Who">
          <Select
            id={id("kind")}
            name={`party_kind_${index}`}
            defaultValue={value?.kind ?? "other"}
          >
            {Object.entries(PARTY_KINDS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        {anyPicker ? (
          <Field id={id("ref")} label="From the records">
            <Select id={id("ref")} name={`party_ref_${index}`} defaultValue={picked}>
              <option value="">Typed below</option>
              {PICKER_GROUPS.map((group) => {
                const options = pickers[group.kind];
                if (!options || options.length === 0) return null;
                return (
                  <optgroup key={group.kind} label={group.label}>
                    {options.map((option) => (
                      <option key={option.id} value={`${group.kind}:${option.id}`}>
                        {option.name}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </Select>
          </Field>
        ) : (
          <Field id={id("name")} label="Name">
            <Input
              id={id("name")}
              name={`party_name_${index}`}
              maxLength={200}
              defaultValue={value?.name ?? ""}
            />
          </Field>
        )}
      </div>
      {anyPicker && (
        <Field id={id("name")} label="Name" hint="Or type the name when it is not in the records.">
          <Input
            id={id("name")}
            name={`party_name_${index}`}
            maxLength={200}
            defaultValue={value?.ref_id ? "" : (value?.name ?? "")}
          />
        </Field>
      )}
      <div className="hqdata-agreement-form__pair">
        <Field id={id("entity")} label="Legal entity">
          <Input
            id={id("entity")}
            name={`party_entity_${index}`}
            maxLength={200}
            defaultValue={value?.entity ?? ""}
          />
        </Field>
        <Field id={id("country")} label="Country">
          <Input
            id={id("country")}
            name={`party_country_${index}`}
            maxLength={60}
            defaultValue={value?.country ?? ""}
          />
        </Field>
      </div>
    </div>
  );
}

/**
 * "Add an agreement" and "Edit" (ws-notes/company/spec.md §7.7.5): the title and type, one
 * to five other parties (a record picked where its module is here, or a typed name), the
 * status and days, the term or the end day, renewal and notice, terms, law, value, signing
 * and stamp duty, the flags and clauses, owner, review day, notes and, when adding, the
 * signed copy.
 */
export function AgreementFields({
  prefix,
  values,
  pickers,
  today,
  copy,
}: {
  prefix: string;
  values: AgreementValues;
  pickers: PartyPickers;
  today: string;
  copy?: { files: readonly FileOption[]; filesHere: boolean; folder: string } | undefined;
}) {
  const id = (name: string) => `${prefix}-${name}`;
  const radios = (name: "ip_clause" | "confidentiality_clause", legend: string) => (
    <fieldset className="hqdata-radios">
      <legend>{legend}</legend>
      {Object.entries(FLAG_WORDS).map(([key, label]) => (
        <label key={key || "unknown"} className="hqdata-radios__item">
          <input type="radio" name={name} value={key} defaultChecked={values[name] === key} />{" "}
          {label}
        </label>
      ))}
    </fieldset>
  );
  return (
    <>
      <Field id={id("title")} label="Title">
        <Input id={id("title")} name="title" required maxLength={200} defaultValue={values.title} />
      </Field>
      <div className="hqdata-agreement-form__pair">
        <Field id={id("type")} label="Type">
          <Select id={id("type")} name="type" defaultValue={values.type}>
            {Object.entries(AGREEMENT_TYPES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={id("status")} label="Status">
          <Select id={id("status")} name="status" defaultValue={values.status}>
            {Object.entries(AGREEMENT_STATUSES).map(([key, item]) => (
              <option key={key} value={key}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <fieldset className="hqdata-parties">
        <legend>The other party</legend>
        <PartyRow prefix={prefix} index={0} pickers={pickers} value={values.parties[0]} />
        <details className="hqdata-parties__more" open={values.parties.length > 1 || undefined}>
          <summary>Add another party</summary>
          {Array.from({ length: PARTY_ROWS - 1 }, (_, index) => (
            <PartyRow
              key={index + 1}
              prefix={prefix}
              index={index + 1}
              pickers={pickers}
              value={values.parties[index + 1]}
            />
          ))}
        </details>
      </fieldset>
      <div className="hqdata-agreement-form__pair">
        <Field id={id("effective")} label="Effective on">
          <Input
            id={id("effective")}
            name="effective_on"
            type="date"
            defaultValue={values.effective_on ?? ""}
          />
        </Field>
        <Field id={id("signed")} label="Signed on">
          <Input
            id={id("signed")}
            name="signed_on"
            type="date"
            max={today}
            defaultValue={values.signed_on ?? ""}
          />
        </Field>
      </div>
      <div className="hqdata-agreement-form__pair">
        <Field id={id("months")} label="Term (months)">
          <Input
            id={id("months")}
            name="term_months"
            type="number"
            min={1}
            max={600}
            step={1}
            defaultValue={text(values.term.months)}
          />
        </Field>
        <Field id={id("ends")} label="Or the end day" hint={END_HINT}>
          <Input
            id={id("ends")}
            name="ends_on"
            type="date"
            defaultValue={values.term.ends_on ?? ""}
          />
        </Field>
      </div>
      <Checkbox
        id={id("auto")}
        name="auto_renews"
        label="Renews on its own"
        defaultChecked={values.renewal.auto}
      />
      <div className="hqdata-agreement-form__three">
        <Field id={id("renews")} label="Renews on">
          <Input
            id={id("renews")}
            name="renews_on"
            type="date"
            defaultValue={values.renewal.renews_on ?? ""}
          />
        </Field>
        <Field id={id("renewal-months")} label="Renewal term (months)">
          <Input
            id={id("renewal-months")}
            name="renewal_months"
            type="number"
            min={1}
            max={600}
            step={1}
            defaultValue={text(values.renewal.months)}
          />
        </Field>
        <Field id={id("notice-days")} label="Notice before renewal (days)">
          <Input
            id={id("notice-days")}
            name="notice_days"
            type="number"
            min={1}
            max={365}
            step={1}
            defaultValue={text(values.renewal.notice_days)}
          />
        </Field>
      </div>
      <Field id={id("early")} label="Ending it early">
        <Input
          id={id("early")}
          name="terminate_for_convenience"
          maxLength={300}
          defaultValue={values.terminate_for_convenience}
        />
      </Field>
      <div className="hqdata-agreement-form__pair">
        <Field id={id("law")} label="Governing law">
          <Input
            id={id("law")}
            name="governing_law"
            maxLength={120}
            defaultValue={values.governing_law}
          />
        </Field>
        <Field id={id("forum")} label="Courts or arbitration">
          <Input id={id("forum")} name="forum" maxLength={120} defaultValue={values.forum} />
        </Field>
      </div>
      <div className="hqdata-agreement-form__pair">
        <Field id={id("value")} label="Value">
          <Input
            id={id("value")}
            name="value_amount"
            type="number"
            min={0}
            step={1}
            defaultValue={text(values.value?.amount)}
          />
        </Field>
        <Field id={id("currency")} label="Currency">
          <Select
            id={id("currency")}
            name="value_currency"
            defaultValue={values.value?.currency ?? "INR"}
          >
            <option value="INR">Rupees</option>
            <option value="USD">US dollars</option>
          </Select>
        </Field>
      </div>
      <Field id={id("signing")} label="How it was signed">
        <Select id={id("signing")} name="signing" defaultValue={values.signing}>
          {Object.entries(SIGNING).map(([key, label]) => (
            <option key={key || "none"} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="hqdata-agreement-form__three">
        <Field id={id("stamp-state")} label="Stamp duty: state">
          <Input
            id={id("stamp-state")}
            name="stamp_state"
            maxLength={120}
            defaultValue={values.stamp?.state ?? ""}
          />
        </Field>
        <Field id={id("stamp-amount")} label="amount (₹)">
          <Input
            id={id("stamp-amount")}
            name="stamp_amount"
            type="number"
            min={0}
            step={1}
            defaultValue={text(values.stamp?.amount)}
          />
        </Field>
        <Field id={id("stamp-number")} label="certificate number">
          <Input
            id={id("stamp-number")}
            name="stamp_certificate_no"
            maxLength={80}
            defaultValue={values.stamp?.certificate_no ?? ""}
          />
        </Field>
      </div>
      <Checkbox
        id={id("related")}
        name="related_party"
        label="With a related party or a director's interest"
        defaultChecked={values.related_party}
      />
      <Checkbox
        id={id("personal")}
        name="personal_data"
        label="It covers personal data"
        defaultChecked={values.personal_data}
      />
      <div className="hqdata-agreement-form__pair">
        {radios("ip_clause", "IP clause")}
        {radios("confidentiality_clause", "Confidentiality clause")}
      </div>
      <div className="hqdata-agreement-form__pair">
        <Field id={id("owner")} label="Owner">
          <Input id={id("owner")} name="owner" maxLength={120} defaultValue={values.owner} />
        </Field>
        <Field id={id("review")} label="Review on">
          <Input
            id={id("review")}
            name="review_on"
            type="date"
            defaultValue={values.review_on ?? ""}
          />
        </Field>
      </div>
      <Field id={id("notes")} label="Notes">
        <Textarea
          id={id("notes")}
          name="notes"
          rows={3}
          maxLength={4_000}
          defaultValue={values.notes}
        />
      </Field>
      {copy && (
        <CopyFields
          prefix={id("copy")}
          label="Signed copy"
          files={copy.files}
          filesHere={copy.filesHere}
          folder={copy.folder}
        />
      )}
    </>
  );
}
