"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { AttemptField } from "@/components/ui/attempt-field";
import type { Person } from "@/lib/api/crm";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;
type CompanyOption = { company_id: string; name: string };

const ROLE_CATEGORIES: ReadonlyArray<[string, string]> = [
  ["", "Not known yet"],
  ["decision_maker", "Decides"],
  ["champion", "Champions us"],
  ["user", "Uses it day to day"],
  ["gatekeeper", "Gatekeeper"],
  ["other", "Other"],
];

export function PersonCreateForm({
  extra,
  action,
  companies,
  companyId,
}: {
  /** The record's required custom fields. */
  extra?: React.ReactNode;
  action: Action;
  companies: readonly CompanyOption[];
  /** Fixed when adding from a company page. */
  companyId?: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const suffix = companyId ?? "new";
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <AttemptField state={state} />
      <Field id={`person-name-${suffix}`} label="Full name">
        <Input id={`person-name-${suffix}`} name="full_name" maxLength={160} disabled={isPending} />
      </Field>
      <Field
        id={`person-email-${suffix}`}
        label="Email"
        hint="Work address. Each person is one address."
      >
        <Input
          id={`person-email-${suffix}`}
          name="email"
          type="email"
          maxLength={254}
          autoCapitalize="none"
          spellCheck={false}
          disabled={isPending}
        />
      </Field>
      <Field id={`person-title-${suffix}`} label="Title">
        <Input id={`person-title-${suffix}`} name="title" maxLength={120} disabled={isPending} />
      </Field>
      {companyId ? (
        <input type="hidden" name="company_id" value={companyId} />
      ) : (
        <Field id={`person-company-${suffix}`} label="Company">
          <Select id={`person-company-${suffix}`} name="company_id" disabled={isPending}>
            <option value="">No company yet</option>
            {companies.map((company) => (
              <option key={company.company_id} value={company.company_id}>
                {company.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {extra}
      <Button variant="primary" type="submit" disabled={isPending}>
        {isPending ? "Adding…" : "Add person"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

export function PersonEditForm({
  action,
  person,
  companies,
}: {
  action: Action;
  person: Person;
  companies: readonly CompanyOption[];
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="person_id" value={person.person_id} />
      <input type="hidden" name="full_form" value="1" />
      <Field id="edit-person-name" label="Full name">
        <Input
          id="edit-person-name"
          name="full_name"
          defaultValue={person.full_name}
          maxLength={160}
          disabled={isPending}
        />
      </Field>
      <Field id="edit-person-title" label="Title">
        <Input
          id="edit-person-title"
          name="title"
          defaultValue={person.title}
          maxLength={120}
          disabled={isPending}
        />
      </Field>
      <Field id="edit-person-role" label="Part in the decision">
        <Select
          id="edit-person-role"
          name="role_category"
          defaultValue={person.role_category}
          disabled={isPending}
        >
          {ROLE_CATEGORIES.map(([value, label]) => (
            <option key={value || "none"} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="edit-person-company" label="Company">
        <Select
          id="edit-person-company"
          name="company_id"
          defaultValue={person.company_id}
          disabled={isPending}
        >
          <option value="">No company</option>
          {companies.map((company) => (
            <option key={company.company_id} value={company.company_id}>
              {company.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="edit-person-phone" label="Phone">
        <Input
          id="edit-person-phone"
          name="phone"
          type="tel"
          defaultValue={person.phone}
          maxLength={40}
          disabled={isPending}
        />
      </Field>
      <Field id="edit-person-notes" label="Notes">
        <Textarea
          id="edit-person-notes"
          name="notes"
          defaultValue={person.notes}
          rows={3}
          maxLength={2000}
          disabled={isPending}
        />
      </Field>
      <Checkbox
        id="edit-person-dnc"
        name="do_not_contact"
        defaultChecked={person.do_not_contact}
        disabled={isPending}
        label="Do not contact"
      />
      <Button variant="primary" type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Save person"}
      </Button>
      <FormFeedback state={state} sentLabel="Saved." />
    </form>
  );
}
