"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import type { Company } from "@/lib/api/crm";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";
import { FIRM_TYPES, LIFECYCLES, LIFECYCLE_LABELS, TEAM_SIZE_BANDS } from "@/lib/crm/vocabulary";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

function FirmTypeOptions() {
  return (
    <>
      <option value="">Not known yet</option>
      {FIRM_TYPES.map((type) => (
        <option key={type} value={type}>
          {type}
        </option>
      ))}
    </>
  );
}

function TeamSizeOptions() {
  return (
    <>
      <option value="">Not known yet</option>
      {TEAM_SIZE_BANDS.map((band) => (
        <option key={band} value={band}>
          {band === "1" ? "Just one person" : `${band} people`}
        </option>
      ))}
    </>
  );
}

export function CompanyCreateForm({ action }: { action: Action }) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <Field id="company-name" label="Firm name">
        <Input id="company-name" name="name" maxLength={200} required disabled={isPending} />
      </Field>
      <Field
        id="company-domain"
        label="Web domain"
        hint="The firm's own domain, e.g. meridiancap.com. It's how colleagues' leads find this company."
      >
        <Input
          id="company-domain"
          name="domain"
          maxLength={255}
          placeholder="firm.com"
          autoCapitalize="none"
          spellCheck={false}
          disabled={isPending}
        />
      </Field>
      <div className="form-row">
        <Field id="company-type" label="Type">
          <Select id="company-type" name="firm_type" disabled={isPending}>
            <FirmTypeOptions />
          </Select>
        </Field>
        <Field id="company-size" label="Team size">
          <Select id="company-size" name="team_size_band" disabled={isPending}>
            <TeamSizeOptions />
          </Select>
        </Field>
      </div>
      <Field id="company-country" label="Country">
        <Input id="company-country" name="country" maxLength={60} disabled={isPending} />
      </Field>
      <Button variant="primary" type="submit" disabled={isPending}>
        {isPending ? "Creating…" : "Create company"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

export function CompanyEditForm({ action, company }: { action: Action; company: Company }) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <input type="hidden" name="company_id" value={company.company_id} />
      <Field id="edit-company-name" label="Firm name">
        <Input
          id="edit-company-name"
          name="name"
          defaultValue={company.name}
          maxLength={200}
          required
          disabled={isPending}
        />
      </Field>
      <Field id="edit-company-domain" label="Web domain">
        <Input
          id="edit-company-domain"
          name="domain"
          defaultValue={company.domain}
          maxLength={255}
          autoCapitalize="none"
          spellCheck={false}
          disabled={isPending}
        />
      </Field>
      <Field id="edit-company-lifecycle" label="Lifecycle">
        <Select
          id="edit-company-lifecycle"
          name="lifecycle"
          defaultValue={company.lifecycle}
          disabled={isPending}
        >
          {LIFECYCLES.map((lifecycle) => (
            <option key={lifecycle} value={lifecycle}>
              {LIFECYCLE_LABELS[lifecycle]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="form-row">
        <Field id="edit-company-type" label="Type">
          <Select
            id="edit-company-type"
            name="firm_type"
            defaultValue={company.firm_type}
            disabled={isPending}
          >
            <FirmTypeOptions />
            {company.firm_type &&
              !(FIRM_TYPES as readonly string[]).includes(company.firm_type) && (
                <option value={company.firm_type}>{company.firm_type}</option>
              )}
          </Select>
        </Field>
        <Field id="edit-company-size" label="Team size">
          <Select
            id="edit-company-size"
            name="team_size_band"
            defaultValue={company.team_size_band}
            disabled={isPending}
          >
            <TeamSizeOptions />
          </Select>
        </Field>
      </div>
      <Field id="edit-company-country" label="Country">
        <Input
          id="edit-company-country"
          name="country"
          defaultValue={company.country}
          maxLength={60}
          disabled={isPending}
        />
      </Field>
      <Field
        id="edit-company-notes"
        label="Notes"
        hint="Standing context, not a log — log calls and emails on the timeline."
      >
        <Textarea
          id="edit-company-notes"
          name="notes"
          defaultValue={company.notes}
          rows={4}
          maxLength={2000}
          disabled={isPending}
        />
      </Field>
      <Button variant="primary" type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Save details"}
      </Button>
      <FormFeedback state={state} sentLabel="Saved." />
    </form>
  );
}
