import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  CERT_STANDARDS,
  CERT_STATUSES,
  CERT_STATUS_KEYS,
  INSURANCE_KINDS,
  INSURANCE_KIND_KEYS,
  REVIEW_INPUTS,
  REVIEW_INPUT_KEYS,
  SOC2_REPORTS,
} from "@/lib/data/labels-assurance";
import { DUTY_CURRENCIES, minorInput } from "@/lib/data/labels-duties";

/**
 * The forms of Certification, Insurance and Management review (ws-notes/security/spec.md
 * §8.2): every name as he types it (a certification body, an insurer, a broker), numbers
 * starting with anything, amounts as numbers, and clause 9.3.2's seven inputs in the house's
 * words.
 */

export type CertificationValues = {
  standard: string;
  name: string;
  status: string;
  body: string;
  accredited_by: string;
  accreditation_checked_on: string | null;
  consultant: string;
  scope: string;
  stage1_on: string | null;
  stage2_on: string | null;
  certificate_number: string;
  issued_on: string | null;
  expires_on: string | null;
  report: { kind: string; from: string | null; to: string | null } | null;
  notes: string;
};

export function CertificationFields({
  prefix,
  values,
  today,
}: {
  prefix: string;
  values: CertificationValues;
  today: string;
}) {
  return (
    <>
      <div className="hqdata-assurance__pair">
        <Field id={`${prefix}-standard`} label="Standard">
          <Select
            id={`${prefix}-standard`}
            name="standard"
            defaultValue={values.standard || "iso27001"}
          >
            {Object.entries(CERT_STANDARDS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`${prefix}-name`} label="Its name, for something else">
          <Input id={`${prefix}-name`} name="name" defaultValue={values.name} maxLength={120} />
        </Field>
      </div>
      <div className="hqdata-assurance__pair">
        <Field id={`${prefix}-status`} label="Where it stands">
          <Select id={`${prefix}-status`} name="status" defaultValue={values.status || "planning"}>
            {CERT_STATUS_KEYS.map((key) => (
              <option key={key} value={key}>
                {CERT_STATUSES[key].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`${prefix}-consultant`} label="Consultant">
          <Input
            id={`${prefix}-consultant`}
            name="consultant"
            defaultValue={values.consultant}
            maxLength={120}
          />
        </Field>
      </div>
      <div className="hqdata-assurance__pair">
        <Field id={`${prefix}-body`} label="Certification body or auditor">
          <Input id={`${prefix}-body`} name="body" defaultValue={values.body} maxLength={120} />
        </Field>
        <Field
          id={`${prefix}-accredited`}
          label="Accredited by"
          hint="NABCB, UKAS, as the body says."
        >
          <Input
            id={`${prefix}-accredited`}
            name="accredited_by"
            defaultValue={values.accredited_by}
            maxLength={120}
          />
        </Field>
      </div>
      <Field id={`${prefix}-checked`} label="Accreditation checked on">
        <Input
          id={`${prefix}-checked`}
          name="accreditation_checked_on"
          type="date"
          max={today}
          defaultValue={values.accreditation_checked_on ?? ""}
        />
      </Field>
      <Field id={`${prefix}-scope`} label="Scope">
        <Textarea
          id={`${prefix}-scope`}
          name="scope"
          rows={2}
          defaultValue={values.scope}
          maxLength={1000}
        />
      </Field>
      <div className="hqdata-assurance__pair">
        <Field id={`${prefix}-stage1`} label="Stage 1 audit">
          <Input
            id={`${prefix}-stage1`}
            name="stage1_on"
            type="date"
            defaultValue={values.stage1_on ?? ""}
          />
        </Field>
        <Field id={`${prefix}-stage2`} label="Stage 2 audit">
          <Input
            id={`${prefix}-stage2`}
            name="stage2_on"
            type="date"
            defaultValue={values.stage2_on ?? ""}
          />
        </Field>
      </div>
      <Field id={`${prefix}-number`} label="Certificate number">
        <Input
          id={`${prefix}-number`}
          name="certificate_number"
          className="mono"
          defaultValue={values.certificate_number}
          maxLength={80}
        />
      </Field>
      <div className="hqdata-assurance__pair">
        <Field id={`${prefix}-issued`} label="Issued on">
          <Input
            id={`${prefix}-issued`}
            name="issued_on"
            type="date"
            max={today}
            defaultValue={values.issued_on ?? ""}
          />
        </Field>
        <Field
          id={`${prefix}-expires`}
          label="Expires on"
          hint="As the certificate says. Left empty, 36 months after issue."
        >
          <Input
            id={`${prefix}-expires`}
            name="expires_on"
            type="date"
            defaultValue={values.expires_on ?? ""}
          />
        </Field>
      </div>
      <fieldset className="hqdata-assurance__inputs">
        <legend>A SOC 2 report</legend>
        <Field id={`${prefix}-report-kind`} label="Report">
          <Select
            id={`${prefix}-report-kind`}
            name="report_kind"
            defaultValue={values.report?.kind ?? ""}
          >
            <option value="">None</option>
            {Object.entries(SOC2_REPORTS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="hqdata-assurance__pair">
          <Field id={`${prefix}-report-from`} label="Period from">
            <Input
              id={`${prefix}-report-from`}
              name="report_from"
              type="date"
              defaultValue={values.report?.from ?? ""}
            />
          </Field>
          <Field id={`${prefix}-report-to`} label="Period to">
            <Input
              id={`${prefix}-report-to`}
              name="report_to"
              type="date"
              defaultValue={values.report?.to ?? ""}
            />
          </Field>
        </div>
      </fieldset>
      <Field id={`${prefix}-notes`} label="Notes">
        <Textarea
          id={`${prefix}-notes`}
          name="notes"
          rows={2}
          defaultValue={values.notes}
          maxLength={4000}
        />
      </Field>
    </>
  );
}

export type InsuranceValues = {
  kind: string;
  name: string;
  insurer: string;
  policy_number: string;
  cover_minor: number | null;
  currency: string;
  premium_minor: number | null;
  starts_on: string | null;
  ends_on: string | null;
  broker: string;
  notes: string;
};

export function InsuranceFields({ prefix, values }: { prefix: string; values: InsuranceValues }) {
  return (
    <>
      <div className="hqdata-assurance__pair">
        <Field id={`${prefix}-kind`} label="Cover">
          <Select id={`${prefix}-kind`} name="kind" defaultValue={values.kind || "cyber"}>
            {INSURANCE_KIND_KEYS.map((key) => (
              <option key={key} value={key}>
                {INSURANCE_KINDS[key]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`${prefix}-name`} label="Its name, for something else">
          <Input id={`${prefix}-name`} name="name" defaultValue={values.name} maxLength={120} />
        </Field>
      </div>
      <div className="hqdata-assurance__pair">
        <Field id={`${prefix}-insurer`} label="Insurer">
          <Input
            id={`${prefix}-insurer`}
            name="insurer"
            defaultValue={values.insurer}
            maxLength={120}
            required
          />
        </Field>
        <Field id={`${prefix}-number`} label="Policy number">
          <Input
            id={`${prefix}-number`}
            name="policy_number"
            className="mono"
            defaultValue={values.policy_number}
            maxLength={80}
          />
        </Field>
      </div>
      <div className="hqdata-assurance__pair">
        <Field id={`${prefix}-cover`} label="Amount covered" hint="A number, such as 5000000.">
          <Input
            id={`${prefix}-cover`}
            name="cover"
            inputMode="decimal"
            defaultValue={values.cover_minor === null ? "" : minorInput(values.cover_minor)}
            maxLength={40}
          />
        </Field>
        <Field id={`${prefix}-currency`} label="Currency">
          <Select id={`${prefix}-currency`} name="currency" defaultValue={values.currency || "INR"}>
            {DUTY_CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id={`${prefix}-premium`} label="Premium">
        <Input
          id={`${prefix}-premium`}
          name="premium"
          inputMode="decimal"
          defaultValue={values.premium_minor === null ? "" : minorInput(values.premium_minor)}
          maxLength={40}
        />
      </Field>
      <div className="hqdata-assurance__pair">
        <Field id={`${prefix}-from`} label="From">
          <Input
            id={`${prefix}-from`}
            name="starts_on"
            type="date"
            defaultValue={values.starts_on ?? ""}
          />
        </Field>
        <Field id={`${prefix}-to`} label="To">
          <Input
            id={`${prefix}-to`}
            name="ends_on"
            type="date"
            defaultValue={values.ends_on ?? ""}
          />
        </Field>
      </div>
      <Field id={`${prefix}-broker`} label="Broker">
        <Input id={`${prefix}-broker`} name="broker" defaultValue={values.broker} maxLength={120} />
      </Field>
      <Field id={`${prefix}-notes`} label="Notes">
        <Textarea
          id={`${prefix}-notes`}
          name="notes"
          rows={2}
          defaultValue={values.notes}
          maxLength={4000}
        />
      </Field>
    </>
  );
}

export type ReviewValues = {
  held_on: string;
  attendees: string;
  inputs: Partial<Record<(typeof REVIEW_INPUT_KEYS)[number], string>>;
  decisions: string;
};

/** A review: when, who, a note on each of the seven inputs, the decisions; and, new, its actions. */
export function ReviewFields({
  prefix,
  values,
  today,
  actionRows = 0,
}: {
  prefix: string;
  values: ReviewValues;
  today: string;
  actionRows?: number;
}) {
  return (
    <>
      <div className="hqdata-assurance__pair">
        <Field id={`${prefix}-held`} label="Held on">
          <Input
            id={`${prefix}-held`}
            name="held_on"
            type="date"
            max={today}
            defaultValue={values.held_on || today}
            required
          />
        </Field>
        <Field id={`${prefix}-attendees`} label="Who attended">
          <Input
            id={`${prefix}-attendees`}
            name="attendees"
            defaultValue={values.attendees}
            maxLength={500}
          />
        </Field>
      </div>
      <fieldset className="hqdata-assurance__inputs">
        <legend>What the review looked at</legend>
        {REVIEW_INPUT_KEYS.map((key) => (
          <Field key={key} id={`${prefix}-input-${key}`} label={REVIEW_INPUTS[key]}>
            <Textarea
              id={`${prefix}-input-${key}`}
              name={`input_${key}`}
              rows={2}
              defaultValue={values.inputs[key] ?? ""}
              maxLength={4000}
            />
          </Field>
        ))}
      </fieldset>
      <Field id={`${prefix}-decisions`} label="What was decided">
        <Textarea
          id={`${prefix}-decisions`}
          name="decisions"
          rows={3}
          defaultValue={values.decisions}
          maxLength={4000}
        />
      </Field>
      {actionRows > 0 && (
        <fieldset className="hqdata-assurance__inputs">
          <legend>Its actions</legend>
          {Array.from({ length: actionRows }, (_, index) => index + 1).map((n) => (
            <div key={n} className="hqdata-assurance__pair">
              <Field id={`${prefix}-action-${n}-what`} label={`Action ${n}`}>
                <Input
                  id={`${prefix}-action-${n}-what`}
                  name={`action_${n}_what`}
                  maxLength={300}
                />
              </Field>
              <div className="hqdata-assurance__pair">
                <Field id={`${prefix}-action-${n}-owner`} label="Owner">
                  <Input
                    id={`${prefix}-action-${n}-owner`}
                    name={`action_${n}_owner`}
                    maxLength={120}
                  />
                </Field>
                <Field id={`${prefix}-action-${n}-due`} label="By">
                  <Input id={`${prefix}-action-${n}-due`} name={`action_${n}_due_on`} type="date" />
                </Field>
              </div>
            </div>
          ))}
        </fieldset>
      )}
    </>
  );
}
