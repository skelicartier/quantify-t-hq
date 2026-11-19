import { CopyFields, type FileOption } from "@/components/data/meetings/copy-fields";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { CompanyFacts } from "@/lib/data/api/company";
import {
  BOOKS_ACCESS,
  DPIIT_STATUSES,
  FLAGS,
  FLAG_FACTS,
  FLAG_ORDER,
  STATES,
} from "@/lib/data/labels-company";

/**
 * The Facts page's forms, one per group (company spec §6.7.2): Identity, how the company is
 * classed, and its auditor, bank and registrations. Each form sends only its own group, so
 * saving one never touches the others. The dates group is `DatesFields` (it works out the
 * first financial year's possible ends as the day is typed).
 */

export type ContactOption = { contact_id: string; label: string };

export function IdentityFields({ facts }: { facts: CompanyFacts }) {
  return (
    <>
      <input type="hidden" name="group" value="identity" />
      <Field id="company-legal-name" label="Legal name">
        <Input
          id="company-legal-name"
          name="legal_name"
          maxLength={200}
          defaultValue={facts.legal_name}
          placeholder="Walk Company Private Limited"
        />
      </Field>
      <Field id="company-cin" label="CIN" hint="On the certificate of incorporation.">
        <Input
          id="company-cin"
          name="cin"
          className="mono"
          maxLength={21}
          autoCapitalize="characters"
          spellCheck={false}
          defaultValue={facts.cin}
        />
      </Field>
      <Field id="company-pan" label="PAN">
        <Input
          id="company-pan"
          name="pan"
          className="mono"
          maxLength={10}
          autoCapitalize="characters"
          spellCheck={false}
          defaultValue={facts.pan}
        />
      </Field>
      <Field id="company-tan" label="TAN">
        <Input
          id="company-tan"
          name="tan"
          className="mono"
          maxLength={10}
          autoCapitalize="characters"
          spellCheck={false}
          defaultValue={facts.tan}
        />
      </Field>
      <Field
        id="company-gstin"
        label="GSTIN"
        hint="Leave it empty if the company is not registered."
      >
        <Input
          id="company-gstin"
          name="gstin"
          className="mono"
          maxLength={15}
          autoCapitalize="characters"
          spellCheck={false}
          defaultValue={facts.gstin}
        />
      </Field>
      <Field id="company-state" label="Registered in">
        <Select id="company-state" name="registered_state" defaultValue={facts.registered_state}>
          <option value="">Not known</option>
          {Object.entries(STATES).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="company-office" label="Registered office">
        <Textarea
          id="company-office"
          name="registered_office"
          rows={3}
          maxLength={400}
          defaultValue={facts.registered_office}
        />
      </Field>
    </>
  );
}

export function ClassFields({ facts, prefix = "class" }: { facts: CompanyFacts; prefix?: string }) {
  return (
    <>
      <input type="hidden" name="group" value="class" />
      {FLAG_ORDER.map((flag) => (
        <div key={flag} className="hqdata-company__flag">
          <fieldset className="choice-row" aria-describedby={`${prefix}-${flag}-hint`}>
            <legend className="field__label">{FLAG_FACTS[flag].label}</legend>
            {(["yes", "no", ""] as const).map((value) => (
              <label key={value || "unknown"} className="choice">
                <input
                  type="radio"
                  name={flag}
                  value={value}
                  defaultChecked={facts.flags[flag] === value}
                />
                <span>{FLAGS[value]}</span>
              </label>
            ))}
          </fieldset>
          <p className="field__hint" id={`${prefix}-${flag}-hint`}>
            {FLAG_FACTS[flag].hint}
          </p>
        </div>
      ))}
    </>
  );
}

function ContactPicker({
  id,
  name,
  label,
  value,
  contacts,
}: {
  id: string;
  name: string;
  label: string;
  value: string | null;
  contacts: readonly ContactOption[] | null;
}) {
  if (!contacts) return null;
  return (
    <Field id={id} label={label}>
      <Select id={id} name={name} defaultValue={value ?? ""}>
        <option value="">None chosen</option>
        {contacts.map((contact) => (
          <option key={contact.contact_id} value={contact.contact_id}>
            {contact.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function RegistrationsFields({
  facts,
  today,
  contacts,
  files = [],
  filesHere = false,
}: {
  facts: CompanyFacts;
  today: string;
  /** Contacts to choose from, or null when Contacts is not here. */
  contacts: readonly ContactOption[] | null;
  /** Files to choose the DPIIT certificate from. */
  files?: readonly FileOption[];
  filesHere?: boolean;
}) {
  return (
    <>
      <input type="hidden" name="group" value="registrations" />
      <Field id="company-auditor" label="Auditor">
        <Input
          id="company-auditor"
          name="auditor_name"
          maxLength={120}
          defaultValue={facts.auditor.name}
        />
      </Field>
      <Field id="company-auditor-firm" label="Auditor's firm number">
        <Input
          id="company-auditor-firm"
          name="auditor_firm_number"
          className="mono"
          maxLength={20}
          defaultValue={facts.auditor.firm_number}
        />
      </Field>
      <Field id="company-auditor-on" label="Auditor appointed on">
        <Input
          id="company-auditor-on"
          name="auditor_appointed_on"
          type="date"
          max={today}
          defaultValue={facts.auditor.appointed_on ?? ""}
        />
      </Field>
      <Field id="company-auditor-by" label="Appointed by">
        <Select
          id="company-auditor-by"
          name="auditor_appointed_by"
          defaultValue={facts.auditor.appointed_by}
        >
          <option value="">Not known</option>
          <option value="board">The board</option>
          <option value="agm">An AGM</option>
        </Select>
      </Field>
      <ContactPicker
        id="company-auditor-contact"
        name="auditor_contact_id"
        label="The auditor, from Contacts"
        value={facts.auditor.contact_id}
        contacts={contacts}
      />
      <Field id="company-bank" label="Authorised dealer bank">
        <Input id="company-bank" name="bank_name" maxLength={120} defaultValue={facts.bank.name} />
      </Field>
      <Field id="company-bank-branch" label="Branch">
        <Input
          id="company-bank-branch"
          name="bank_branch"
          maxLength={120}
          defaultValue={facts.bank.branch}
        />
      </Field>
      <ContactPicker
        id="company-bank-contact"
        name="bank_contact_id"
        label="The bank, from Contacts"
        value={facts.bank.contact_id}
        contacts={contacts}
      />
      <Field id="company-firms-on" label="Registered on FIRMS on">
        <Input
          id="company-firms-on"
          name="firms_registered_on"
          type="date"
          max={today}
          defaultValue={facts.firms.registered_on ?? ""}
        />
      </Field>
      <Field
        id="company-firms-note"
        label="FIRMS user"
        hint="Where the user id is kept, never its password."
      >
        <Input
          id="company-firms-note"
          name="firms_user_note"
          maxLength={200}
          defaultValue={facts.firms.user_note}
        />
      </Field>
      <Field id="company-dpiit" label="DPIIT certificate number">
        <Input
          id="company-dpiit"
          name="dpiit_number"
          className="mono"
          maxLength={40}
          defaultValue={facts.dpiit.number}
        />
      </Field>
      <Field id="company-dpiit-on" label="DPIIT recognised on">
        <Input
          id="company-dpiit-on"
          name="dpiit_recognised_on"
          type="date"
          max={today}
          defaultValue={facts.dpiit.recognised_on ?? ""}
        />
      </Field>
      <Field id="company-dpiit-status" label="DPIIT status">
        <Select id="company-dpiit-status" name="dpiit_status" defaultValue={facts.dpiit.status}>
          {(["", "not_applied", "applied", "recognised"] as const).map((key) => (
            <option key={key || "unknown"} value={key}>
              {DPIIT_STATUSES[key]}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="company-dpiit-applied" label="DPIIT applied on">
        <Input
          id="company-dpiit-applied"
          name="dpiit_applied_on"
          type="date"
          max={today}
          defaultValue={facts.dpiit.applied_on ?? ""}
        />
      </Field>
      <Field id="company-dpiit-valid" label="DPIIT valid until">
        <Input
          id="company-dpiit-valid"
          name="dpiit_valid_until"
          type="date"
          defaultValue={facts.dpiit.valid_until ?? ""}
        />
      </Field>
      <CopyFields
        prefix="company-dpiit-copy"
        label="DPIIT certificate"
        files={files}
        filesHere={filesHere}
        folder="Company › DPIIT"
      />
    </>
  );
}

/** The CERT-In point of contact (ws-notes/duties/spec.md §6.2), with the message as sent. */
export function CertInFields({
  facts,
  today,
  files,
  filesHere,
}: {
  facts: CompanyFacts;
  today: string;
  files: readonly FileOption[];
  filesHere: boolean;
}) {
  const contact = facts.cert_in;
  return (
    <>
      <input type="hidden" name="group" value="cert_in" />
      <Field id="cert-in-name" label="Name">
        <Input id="cert-in-name" name="cert_in_name" maxLength={120} defaultValue={contact.name} />
      </Field>
      <Field id="cert-in-designation" label="Designation">
        <Input
          id="cert-in-designation"
          name="cert_in_designation"
          maxLength={120}
          defaultValue={contact.designation}
        />
      </Field>
      <Field id="cert-in-email" label="Email">
        <Input
          id="cert-in-email"
          name="cert_in_email"
          type="email"
          maxLength={254}
          defaultValue={contact.email}
        />
      </Field>
      <Field id="cert-in-mobile" label="Mobile">
        <Input
          id="cert-in-mobile"
          name="cert_in_mobile"
          type="tel"
          maxLength={40}
          defaultValue={contact.mobile}
        />
      </Field>
      <Field id="cert-in-phone" label="Office phone">
        <Input
          id="cert-in-phone"
          name="cert_in_office_phone"
          type="tel"
          maxLength={40}
          defaultValue={contact.office_phone}
        />
      </Field>
      <Field
        id="cert-in-address"
        label="Office address"
        hint="Leave it empty for the registered office."
      >
        <Textarea
          id="cert-in-address"
          name="cert_in_address"
          rows={3}
          maxLength={400}
          defaultValue={contact.address}
        />
      </Field>
      <Field id="cert-in-sent" label="Sent to CERT-In on">
        <Input
          id="cert-in-sent"
          name="cert_in_sent_on"
          type="date"
          max={today}
          defaultValue={contact.sent_on ?? ""}
        />
      </Field>
      <CopyFields
        prefix="cert-in-copy"
        label="The message as sent"
        files={files}
        filesHere={filesHere}
        folder="Security › CERT-In"
      />
    </>
  );
}

/** Which software keeps the books and who keeps them (ws-notes/duties/spec.md §6.2). */
export function BooksFields({
  facts,
  today,
  contacts,
}: {
  facts: CompanyFacts;
  today: string;
  contacts: readonly ContactOption[] | null;
}) {
  const books = facts.books;
  return (
    <>
      <input type="hidden" name="group" value="books" />
      <Field id="books-software" label="Books software">
        <Input
          id="books-software"
          name="books_software"
          maxLength={120}
          defaultValue={books.software}
        />
      </Field>
      <Field id="books-kept-by" label="Kept by" hint="The firm that keeps the books.">
        <Input
          id="books-kept-by"
          name="books_kept_by"
          maxLength={120}
          defaultValue={books.kept_by}
        />
      </Field>
      <ContactPicker
        id="books-contact"
        name="books_contact_id"
        label="The firm, from Contacts"
        value={books.contact_id}
        contacts={contacts}
      />
      <Field id="books-access" label="The CA's access">
        <Select id="books-access" name="books_access" defaultValue={books.access}>
          {(["", "owner", "accountant", "view", "none"] as const).map((key) => (
            <option key={key || "unknown"} value={key}>
              {BOOKS_ACCESS[key]}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="books-started" label="Books start on">
        <Input
          id="books-started"
          name="books_started_on"
          type="date"
          max={today}
          defaultValue={books.started_on ?? ""}
        />
      </Field>
      <fieldset className="choice-row">
        <legend className="field__label">Provider disclosed to the ROC</legend>
        {(["yes", "no", ""] as const).map((value) => (
          <label key={value || "unknown"} className="choice">
            <input
              type="radio"
              name="books_provider_disclosed"
              value={value}
              defaultChecked={books.provider_disclosed === value}
            />
            <span>{FLAGS[value]}</span>
          </label>
        ))}
      </fieldset>
      <Field id="books-disclosed-note" label="Where it is disclosed">
        <Input
          id="books-disclosed-note"
          name="books_disclosed_note"
          maxLength={200}
          defaultValue={books.disclosed_note}
        />
      </Field>
      <Field
        id="books-revenue-limit"
        label="Free plan: revenue up to"
        hint="Whole rupees, from the provider's own page. Leave it empty for none."
      >
        <Input
          id="books-revenue-limit"
          name="books_free_revenue_limit"
          inputMode="numeric"
          maxLength={16}
          defaultValue={books.free_revenue_limit === null ? "" : String(books.free_revenue_limit)}
        />
      </Field>
      <Field id="books-invoice-limit" label="Free plan: invoices a year">
        <Input
          id="books-invoice-limit"
          name="books_free_invoice_limit"
          inputMode="numeric"
          maxLength={16}
          defaultValue={books.free_invoice_limit === null ? "" : String(books.free_invoice_limit)}
        />
      </Field>
    </>
  );
}
