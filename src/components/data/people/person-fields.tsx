import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  DOCUMENT_KINDS,
  ENGAGEMENT_KINDS,
  EVALUATIONS,
  EVALUATION_OUTCOMES,
  OUTCOMES_FOR,
  STIPEND_CURRENCIES,
  SYSTEM_SUGGESTIONS,
  ordinal,
} from "@/lib/data/labels-people";

/**
 * The people ledger's form fields (ws-notes/company/spec.md §8.9): a person's own fields for
 * "Add a person" and "Edit", and the record's smaller forms. Plain fields, drawn on the
 * server; each form's ids start with its own prefix so two on one page never clash.
 */

export type PersonValues = {
  name: string;
  email: string;
  kind: string;
  role_title: string;
  starts_on: string;
  ends_on: string;
  mentor: string;
  brief: string;
  stipend_amount: string;
  stipend_currency: string;
  stipend_pays_on: string;
  notes?: string;
};

export const NEW_PERSON: PersonValues = {
  name: "",
  email: "",
  kind: "intern",
  role_title: "",
  starts_on: "",
  ends_on: "",
  mentor: "",
  brief: "",
  stipend_amount: "",
  stipend_currency: "INR",
  stipend_pays_on: "month_end",
};

const PAY_DAYS = Array.from({ length: 28 }, (_, index) => index + 1);

export function PersonFields({ prefix, values }: { prefix: string; values: PersonValues }) {
  return (
    <>
      <div className="hqdata-person-form__pair">
        <Field id={`${prefix}-name`} label="Name">
          <Input
            id={`${prefix}-name`}
            name="name"
            maxLength={120}
            required
            defaultValue={values.name}
            autoComplete="off"
          />
        </Field>
        <Field id={`${prefix}-email`} label="Email">
          <Input
            id={`${prefix}-email`}
            name="email"
            type="email"
            maxLength={254}
            defaultValue={values.email}
            autoComplete="off"
          />
        </Field>
      </div>
      <div className="hqdata-person-form__pair">
        <Field id={`${prefix}-kind`} label="Kind">
          <Select id={`${prefix}-kind`} name="kind" defaultValue={values.kind} required>
            {Object.entries(ENGAGEMENT_KINDS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`${prefix}-role`} label="Role">
          <Input
            id={`${prefix}-role`}
            name="role_title"
            maxLength={120}
            defaultValue={values.role_title}
          />
        </Field>
      </div>
      <div className="hqdata-person-form__pair">
        <Field id={`${prefix}-starts`} label="First day">
          <Input
            id={`${prefix}-starts`}
            name="starts_on"
            type="date"
            required
            defaultValue={values.starts_on}
          />
        </Field>
        <Field
          id={`${prefix}-ends`}
          label="Last day"
          hint="The planned end. Leave it empty for an open-ended employee."
        >
          <Input
            id={`${prefix}-ends`}
            name="ends_on"
            type="date"
            defaultValue={values.ends_on}
            aria-describedby={`${prefix}-ends-hint`}
          />
        </Field>
      </div>
      <Field id={`${prefix}-mentor`} label="Mentor">
        <Input id={`${prefix}-mentor`} name="mentor" maxLength={120} defaultValue={values.mentor} />
      </Field>
      <Field
        id={`${prefix}-brief`}
        label="Brief"
        hint="One project they can own from start to finish, with what they will deliver."
      >
        <Textarea
          id={`${prefix}-brief`}
          name="brief"
          rows={4}
          maxLength={4_000}
          defaultValue={values.brief}
          aria-describedby={`${prefix}-brief-hint`}
        />
      </Field>
      <div className="hqdata-person-form__triple">
        <Field id={`${prefix}-stipend`} label="Stipend a month">
          <Input
            id={`${prefix}-stipend`}
            name="stipend_amount"
            inputMode="numeric"
            maxLength={20}
            defaultValue={values.stipend_amount}
          />
        </Field>
        <Field id={`${prefix}-currency`} label="Currency">
          <Select
            id={`${prefix}-currency`}
            name="stipend_currency"
            defaultValue={values.stipend_currency}
          >
            {Object.entries(STIPEND_CURRENCIES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`${prefix}-pays`} label="Paid">
          <Select
            id={`${prefix}-pays`}
            name="stipend_pays_on"
            defaultValue={values.stipend_pays_on}
          >
            <option value="month_end">On the month&apos;s last day</option>
            {PAY_DAYS.map((day) => (
              <option key={day} value={String(day)}>
                {day === 1 ? "By the 1st of the next month" : `By the ${ordinal(day)}`}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {values.notes !== undefined && (
        <Field id={`${prefix}-notes`} label="Notes">
          <Textarea
            id={`${prefix}-notes`}
            name="notes"
            rows={3}
            maxLength={4_000}
            defaultValue={values.notes}
          />
        </Field>
      )}
    </>
  );
}

export function DocumentFields({ prefix, today }: { prefix: string; today: string }) {
  return (
    <>
      <div className="hqdata-person-form__pair">
        <Field id={`${prefix}-kind`} label="Kind">
          <Select id={`${prefix}-kind`} name="kind" defaultValue="internship" required>
            {Object.entries(DOCUMENT_KINDS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`${prefix}-signed`} label="Signed on">
          <Input id={`${prefix}-signed`} name="signed_on" type="date" max={today} />
        </Field>
      </div>
      <Field id={`${prefix}-title`} label="Title">
        <Input id={`${prefix}-title`} name="title" maxLength={200} required />
      </Field>
      <Checkbox
        id={`${prefix}-ip`}
        name="includes_ip"
        value="1"
        label="It assigns IP"
        description="The document's own text assigns the work's IP to the company."
      />
      <Checkbox
        id={`${prefix}-confidential`}
        name="includes_confidentiality"
        value="1"
        label="It keeps work confidential"
      />
      <Field
        id={`${prefix}-file`}
        label="Signed copy"
        hint="A PDF or a scan, at most 3 MB. It is kept with the people ledger on this computer, for the Owner only, and never in Files."
      >
        <Input
          id={`${prefix}-file`}
          name="file"
          type="file"
          accept=".pdf,image/*"
          aria-describedby={`${prefix}-file-hint`}
        />
      </Field>
    </>
  );
}

export function EvaluationFields({
  prefix,
  today,
  mentor,
  which,
}: {
  prefix: string;
  today: string;
  mentor: string;
  which: "midpoint" | "final";
}) {
  return (
    <>
      <div className="hqdata-person-form__pair">
        <Field id={`${prefix}-which`} label="Which">
          <Select id={`${prefix}-which`} name="which" defaultValue={which} required>
            {Object.entries(EVALUATIONS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`${prefix}-outcome`} label="How it went">
          <Select id={`${prefix}-outcome`} name="outcome" defaultValue="">
            <option value="">Not held yet</option>
            {(["midpoint", "final"] as const).map((key) => (
              <optgroup key={key} label={EVALUATIONS[key]}>
                {OUTCOMES_FOR[key].map((outcome) => (
                  <option key={outcome} value={outcome}>
                    {EVALUATION_OUTCOMES[outcome]}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
      </div>
      <div className="hqdata-person-form__pair">
        <Field id={`${prefix}-held`} label="Held on">
          <Input
            id={`${prefix}-held`}
            name="held_on"
            type="date"
            max={today}
            defaultValue={today}
          />
        </Field>
        <Field id={`${prefix}-by`} label="By">
          <Input id={`${prefix}-by`} name="by_name" maxLength={120} defaultValue={mentor} />
        </Field>
      </div>
      <Field id={`${prefix}-summary`} label="Summary">
        <Textarea id={`${prefix}-summary`} name="summary" rows={3} maxLength={4_000} />
      </Field>
      <Field
        id={`${prefix}-due`}
        label="Move its day to"
        hint="Only to move the day. Leave “How it went” as not held yet to move it without recording."
      >
        <Input
          id={`${prefix}-due`}
          name="due_on"
          type="date"
          aria-describedby={`${prefix}-due-hint`}
        />
      </Field>
    </>
  );
}

export function AccessFields({ prefix, today }: { prefix: string; today: string }) {
  return (
    <>
      <div className="hqdata-person-form__pair">
        <Field id={`${prefix}-system`} label="System">
          <Input
            id={`${prefix}-system`}
            name="system"
            maxLength={80}
            required
            list={`${prefix}-systems`}
            autoComplete="off"
          />
          <datalist id={`${prefix}-systems`}>
            {SYSTEM_SUGGESTIONS.map((system) => (
              <option key={system} value={system} />
            ))}
          </datalist>
        </Field>
        <Field id={`${prefix}-level`} label="Level">
          <Input id={`${prefix}-level`} name="level" maxLength={80} />
        </Field>
      </div>
      <Checkbox
        id={`${prefix}-critical`}
        name="critical"
        value="1"
        label="Critical (email, sign-in, passwords, code, the cloud account, HQ)"
      />
      <Field id={`${prefix}-granted`} label="Granted on">
        <Input
          id={`${prefix}-granted`}
          name="granted_on"
          type="date"
          max={today}
          defaultValue={today}
        />
      </Field>
      <Field id={`${prefix}-notes`} label="Notes">
        <Input id={`${prefix}-notes`} name="notes" maxLength={500} />
      </Field>
    </>
  );
}
