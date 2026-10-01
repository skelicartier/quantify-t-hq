"use client";

import { startTransition, useActionState, type FormEvent } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import type { CompanyRecord } from "@/lib/api/company";
import { COMPANY_FIELD_LABELS as LABEL } from "@/lib/company-labels";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type CompanyFormProps = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  company: CompanyRecord;
  entityTypes: ReadonlyArray<{ value: string; label: string }>;
  /** A fresh code is needed to save; without one the form reads but cannot send. */
  sudoFresh: boolean;
  today: string;
};

/**
 * The particulars, in the order a registration certificate gives them. The service
 * checks each number's shape and checks them against each other — a CIN's year and
 * class, a PAN's fourth letter, the PAN inside a GSTIN and its check character — and
 * says which field is wrong rather than saving a letterhead that cannot be right.
 */
export function CompanyForm({ action, company, entityTypes, sudoFresh, today }: CompanyFormProps) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  // Sent by hand rather than through the form's action: React resets a form after its
  // action runs, and a refused number must not wipe the eighteen fields typed around it.
  // After a save the fields keep what was typed; "On file" beside them shows it as saved.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  };
  const text = (field: keyof CompanyRecord, props: Record<string, unknown> = {}) => (
    <Field id={`company-${field}`} label={LABEL[field]} hint={props.hint as string | undefined}>
      <Input
        id={`company-${field}`}
        name={field}
        defaultValue={company[field]}
        disabled={!sudoFresh}
        {...Object.fromEntries(Object.entries(props).filter(([key]) => key !== "hint"))}
      />
    </Field>
  );
  return (
    <form className="stack-form company-form" onSubmit={submit}>
      <AttemptField state={state} />
      <fieldset className="company-form__group" disabled={!sudoFresh}>
        <legend>Who the company is in law</legend>
        <div className="form-grid">
          {text("legal_name", {
            maxLength: 200,
            hint: "As on the certificate of incorporation, suffix included.",
            autoComplete: "organization",
          })}
          <Field
            id="company-entity_type"
            label={LABEL.entity_type}
            hint="Sets what the law asks documents to carry."
          >
            <Select id="company-entity_type" name="entity_type" defaultValue={company.entity_type}>
              <option value="">Not chosen yet</option>
              {entityTypes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          {text("incorporated_on", { type: "date", max: today })}
          {text("registration_number", {
            maxLength: 24,
            hint: "CIN for a company (21 characters), LLPIN for an LLP.",
            spellCheck: false,
          })}
          {text("pan", { maxLength: 10, spellCheck: false })}
          {text("gstin", {
            maxLength: 15,
            hint: "Only once registered for GST.",
            spellCheck: false,
          })}
          {text("udyam", { maxLength: 19, hint: "If registered as an MSME.", spellCheck: false })}
          {text("dpiit", { maxLength: 20, hint: "If recognised as a startup.", spellCheck: false })}
        </div>
        <div className="form-grid">
          {text("former_name", {
            maxLength: 200,
            hint: "Printed beside the name for two years after a change.",
          })}
          {text("name_changed_on", { type: "date", max: today })}
        </div>
      </fieldset>

      <fieldset className="company-form__group" disabled={!sudoFresh}>
        <legend>Where it is</legend>
        <div className="form-grid">
          <Field
            id="company-registered_address"
            label={LABEL.registered_address}
            hint="As filed with the registrar."
          >
            <Textarea
              id="company-registered_address"
              name="registered_address"
              rows={3}
              maxLength={400}
              defaultValue={company.registered_address}
              autoComplete="street-address"
            />
          </Field>
          <Field
            id="company-operating_address"
            label={LABEL.operating_address}
            hint="Printed only when there is no registered office yet."
          >
            <Textarea
              id="company-operating_address"
              name="operating_address"
              rows={3}
              maxLength={400}
              defaultValue={company.operating_address}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="company-form__group" disabled={!sudoFresh}>
        <legend>How to reach it</legend>
        <div className="form-grid">
          {text("phone", { type: "tel", maxLength: 40, autoComplete: "tel" })}
          {text("email", { type: "email", maxLength: 254, autoComplete: "email" })}
          {text("website", {
            maxLength: 200,
            hint: "quantifyterminal.com is enough.",
            autoComplete: "url",
          })}
        </div>
      </fieldset>

      <fieldset className="company-form__group" disabled={!sudoFresh}>
        <legend>Documents</legend>
        <div className="form-grid">
          {text("signatory_name", {
            maxLength: 120,
            hint: "Named on order forms for the company.",
          })}
          {text("signatory_title", { maxLength: 120 })}
        </div>
        <Field
          id="company-document_note"
          label={LABEL.document_note}
          hint="Under the letterhead on printed pages and in every PDF's foot, e.g. a confidentiality line."
        >
          <Input
            id="company-document_note"
            name="document_note"
            maxLength={300}
            defaultValue={company.document_note}
          />
        </Field>
      </fieldset>

      <FormFeedback state={state} />
      <div>
        <Button type="submit" variant="primary" disabled={!sudoFresh || isPending}>
          {isPending ? "Saving…" : "Save the particulars"}
        </Button>
      </div>
    </form>
  );
}
