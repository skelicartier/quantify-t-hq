import { Field, Input, Select, Textarea, describedBy } from "@/components/ui/field";
import { CONTACT_ROLES, CONTACT_ROLE_ORDER } from "@/lib/data/labels";

/** The fields of a contact: "Name", "Role", "Firm", "Email", "Phone" and "Notes". */

export type ContactValues = {
  name: string;
  role: string;
  firm: string;
  email: string;
  phone: string;
  notes: string;
};

export const NEW_CONTACT: ContactValues = {
  name: "",
  role: "ca",
  firm: "",
  email: "",
  phone: "",
  notes: "",
};

const NOTES_HINT = "What they handle, and how they like to be reached. Never a password or a PIN.";

export function ContactFields({ prefix, values }: { prefix: string; values: ContactValues }) {
  const notes = `${prefix}-notes`;
  return (
    <>
      <Field id={`${prefix}-name`} label="Name">
        <Input
          id={`${prefix}-name`}
          name="name"
          maxLength={120}
          required
          defaultValue={values.name}
        />
      </Field>
      <div className="hqdata-note-form__pair">
        <Field id={`${prefix}-role`} label="Role">
          <Select id={`${prefix}-role`} name="role" defaultValue={values.role}>
            {CONTACT_ROLE_ORDER.map((key) => (
              <option key={key} value={key}>
                {CONTACT_ROLES[key]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`${prefix}-firm`} label="Firm">
          <Input id={`${prefix}-firm`} name="firm" maxLength={200} defaultValue={values.firm} />
        </Field>
      </div>
      <div className="hqdata-note-form__pair">
        <Field id={`${prefix}-email`} label="Email">
          <Input
            id={`${prefix}-email`}
            name="email"
            type="email"
            maxLength={254}
            autoComplete="off"
            defaultValue={values.email}
          />
        </Field>
        <Field id={`${prefix}-phone`} label="Phone">
          <Input
            id={`${prefix}-phone`}
            name="phone"
            type="tel"
            maxLength={40}
            autoComplete="off"
            defaultValue={values.phone}
          />
        </Field>
      </div>
      <Field id={notes} label="Notes" hint={NOTES_HINT}>
        <Textarea
          id={notes}
          name="notes"
          rows={3}
          maxLength={4_000}
          aria-describedby={describedBy(notes, { hint: NOTES_HINT })}
          defaultValue={values.notes}
        />
      </Field>
    </>
  );
}
