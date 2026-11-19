import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { MarkRow } from "@/lib/data/api/marks";
import { FLAGS } from "@/lib/data/labels-company";
import { MARK_KINDS, MARK_STATUSES, MARK_STEPS } from "@/lib/data/labels-security";

/**
 * The trademark register's forms (ws-notes/duties/spec.md §6.4): a mark and class, a step
 * with its day and number, the status, a renewal. One record per mark and class: the word
 * mark and the logo are separate marks.
 */

export function MarkFields({
  prefix,
  values,
  today,
}: {
  prefix: string;
  values: MarkRow | null;
  today: string;
}) {
  return (
    <>
      <Field id={`${prefix}-name`} label="The mark" hint="The words, or a description of the logo.">
        <Input
          id={`${prefix}-name`}
          name="name"
          required
          maxLength={200}
          defaultValue={values?.name ?? ""}
        />
      </Field>
      <div className="hqdata-registers__pair">
        <Field id={`${prefix}-kind`} label="Kind">
          <Select id={`${prefix}-kind`} name="kind" defaultValue={values?.kind ?? "word"}>
            {Object.entries(MARK_KINDS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`${prefix}-class`} label="Class" hint="1 to 45.">
          <Input
            id={`${prefix}-class`}
            name="class_number"
            inputMode="numeric"
            required
            maxLength={2}
            defaultValue={values ? String(values.class_number) : ""}
          />
        </Field>
      </div>
      <Field id={`${prefix}-goods`} label="Goods and services">
        <Textarea
          id={`${prefix}-goods`}
          name="goods"
          rows={2}
          maxLength={2000}
          defaultValue={values?.goods ?? ""}
        />
      </Field>
      <div className="hqdata-registers__pair">
        <Field id={`${prefix}-application`} label="Application number">
          <Input
            id={`${prefix}-application`}
            name="application_number"
            className="mono"
            maxLength={40}
            defaultValue={values?.application_number ?? ""}
          />
        </Field>
        <Field id={`${prefix}-applied`} label="Applied on">
          <Input
            id={`${prefix}-applied`}
            name="applied_on"
            type="date"
            max={today}
            defaultValue={values?.applied_on ?? ""}
          />
        </Field>
      </div>
      <Field id={`${prefix}-applicant`} label="Applicant">
        <Input
          id={`${prefix}-applicant`}
          name="applicant"
          maxLength={200}
          defaultValue={values?.applicant ?? ""}
        />
      </Field>
      <Field id={`${prefix}-agent`} label="Trademark agent">
        <Input
          id={`${prefix}-agent`}
          name="agent"
          maxLength={200}
          defaultValue={values?.agent ?? ""}
        />
      </Field>
      <div className="hqdata-registers__pair">
        <Field id={`${prefix}-startup`} label="Filed as a recognised startup">
          <Select
            id={`${prefix}-startup`}
            name="filed_as_startup"
            defaultValue={values?.filed_as_startup ?? ""}
          >
            {(["", "yes", "no"] as const).map((key) => (
              <option key={key || "unknown"} value={key}>
                {FLAGS[key]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`${prefix}-fee`} label="Fee paid for this class" hint="Whole rupees.">
          <Input
            id={`${prefix}-fee`}
            name="fee_paid"
            inputMode="numeric"
            maxLength={12}
            defaultValue={values?.fee_paid === null || !values ? "" : String(values.fee_paid)}
          />
        </Field>
      </div>
      <Field
        id={`${prefix}-expires`}
        label="Expires on, as on the certificate"
        hint="Leave it empty to work it out from the application day."
      >
        <Input
          id={`${prefix}-expires`}
          name="expires_on"
          type="date"
          defaultValue={values?.steps.expires_on ?? ""}
        />
      </Field>
      <Field id={`${prefix}-notes`} label="Notes">
        <Textarea
          id={`${prefix}-notes`}
          name="notes"
          rows={2}
          maxLength={2000}
          defaultValue={values?.notes ?? ""}
        />
      </Field>
    </>
  );
}

export function StepFields({ prefix, today }: { prefix: string; today: string }) {
  return (
    <>
      <Field id={`${prefix}-step`} label="Step">
        <Select id={`${prefix}-step`} name="step" defaultValue="exam_report">
          {Object.entries(MARK_STEPS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={`${prefix}-on`} label="Day" hint="A hearing may be ahead of today.">
        <Input id={`${prefix}-on`} name="on" type="date" required defaultValue={today} />
      </Field>
      <Field
        id={`${prefix}-number`}
        label="Number"
        hint="The Journal's number, or the certificate's."
      >
        <Input id={`${prefix}-number`} name="number" className="mono" maxLength={40} />
      </Field>
    </>
  );
}

export function StatusFields({
  prefix,
  values,
  today,
}: {
  prefix: string;
  values: MarkRow;
  today: string;
}) {
  return (
    <>
      <Field id={`${prefix}-status`} label="Status">
        <Select id={`${prefix}-status`} name="status" defaultValue={values.status}>
          {Object.entries(MARK_STATUSES).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={`${prefix}-on`} label="On">
        <Input id={`${prefix}-on`} name="on" type="date" max={today} defaultValue={today} />
      </Field>
    </>
  );
}
