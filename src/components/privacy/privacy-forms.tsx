"use client";

import { useActionState, useState } from "react";

import { TzOffsetField } from "@/components/ui/act-form";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;
type Option = { value: string; label: string };
type Company = { id: string; name: string };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Log a rights request or a complaint as it arrived. */
export function LogRequestForm({
  action,
  kinds,
  regimes,
  companies,
}: {
  action: Action;
  kinds: readonly Option[];
  regimes: readonly Option[];
  companies: readonly Company[];
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [kind, setKind] = useState("access");
  return (
    <form className="stack-form" action={formAction}>
      <AttemptField state={state} />
      <div className="form-grid">
        <Field id="request-kind" label="What they asked for">
          <Select
            id="request-kind"
            name="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            disabled={isPending}
          >
            {kinds.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="request-regime" label="Law">
          <Select id="request-regime" name="regime" defaultValue="uk_gdpr" disabled={isPending}>
            {regimes.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="form-grid">
        <Field id="request-name" label="Their name">
          <Input id="request-name" name="requester_name" maxLength={160} disabled={isPending} />
        </Field>
        <Field id="request-email" label="Their email" hint="Matched to a person in the CRM.">
          <Input
            id="request-email"
            name="requester_email"
            type="email"
            maxLength={254}
            disabled={isPending}
          />
        </Field>
      </div>
      <div className="form-grid">
        <Field
          id="request-received"
          label="Received on"
          hint="The day it arrived, whoever it reached first."
        >
          <Input
            id="request-received"
            name="received_on"
            type="date"
            defaultValue={today()}
            max={today()}
            disabled={isPending}
          />
        </Field>
        <Field id="request-channel" label="How it arrived">
          <Select id="request-channel" name="channel" defaultValue="email" disabled={isPending}>
            <option value="email">Email</option>
            <option value="form">Web form</option>
            <option value="in_app">In the app</option>
            <option value="post">Post</option>
            <option value="phone">Phone</option>
            <option value="other">Other</option>
          </Select>
        </Field>
      </div>
      <div className="form-grid">
        <Field id="request-company" label="Their firm" hint="If they are with a customer.">
          <Select id="request-company" name="company_id" defaultValue="" disabled={isPending}>
            <option value="">None</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </Select>
        </Field>
        {kind !== "complaint" && (
          <Field
            id="request-identity"
            label="Proof of identity"
            hint="Ask only when you have real doubt who is asking."
          >
            <Select
              id="request-identity"
              name="identity"
              defaultValue="not_needed"
              disabled={isPending}
            >
              <option value="not_needed">Not needed: we know who this is</option>
              <option value="requested">Asked for: the month waits for it</option>
            </Select>
          </Field>
        )}
      </div>
      <Field id="request-description" label="What they wrote">
        <Textarea
          id="request-description"
          name="description"
          rows={4}
          maxLength={4000}
          disabled={isPending}
        />
      </Field>
      <Button type="submit" variant="primary" disabled={isPending}>
        {isPending ? "Logging…" : "Log the request"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

const SEARCH_STATES: ReadonlyArray<Option> = [
  { value: "pending", label: "To search" },
  { value: "found", label: "Found data" },
  { value: "none", label: "Holds nothing" },
  { value: "not_applicable", label: "Not applicable" },
];

/** One line of the search checklist: where, what was found, and a note. */
export function SearchRowForm({
  action,
  requestId,
  system,
  label,
  state: current,
  note,
  disabled,
}: {
  action: Action;
  requestId: string;
  system: string;
  label: string;
  state: string;
  note: string;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const off = disabled || isPending;
  return (
    <form className="search-row" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="system" value={system} />
      <span className="search-row__label" id={`search-${system}-label`}>
        {label}
      </span>
      <Select
        name="state"
        defaultValue={current}
        aria-labelledby={`search-${system}-label`}
        disabled={off}
      >
        {SEARCH_STATES.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </Select>
      <Input
        name="note"
        defaultValue={note}
        maxLength={1000}
        placeholder="What was found, and what was done with it"
        aria-label={`${label}: note`}
        disabled={off}
      />
      <Button type="submit" disabled={off}>
        {isPending ? "Saving…" : "Save"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/** Erase a person from the CRM: a reason, the word typed, and a fresh code. */
export function EraseForm({
  action,
  requestId,
  disabled,
}: {
  action: Action;
  requestId: string;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const off = disabled || isPending;
  return (
    <form className="stack-form" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="request_id" value={requestId} />
      <Field
        id="erase-reason"
        label="Why erasure applies"
        hint="And that no exemption (a contract, a legal claim, a record we must keep) holds the data."
      >
        <Textarea id="erase-reason" name="reason" rows={2} maxLength={400} disabled={off} />
      </Field>
      <Field id="erase-confirm" label="Type ERASE to confirm">
        <Input id="erase-confirm" name="confirm" autoComplete="off" maxLength={10} disabled={off} />
      </Field>
      <Button type="submit" variant="danger" disabled={off}>
        {isPending ? "Erasing…" : "Erase from the CRM"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/** Log an incident the moment it is known. Awareness anchors the regulator's 72 hours. */
export function LogIncidentForm({ action }: { action: Action }) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [personal, setPersonal] = useState(false);
  return (
    <form className="stack-form" action={formAction}>
      <AttemptField state={state} />
      <TzOffsetField />
      <Field id="incident-title" label="What happened, in a line">
        <Input id="incident-title" name="title" maxLength={200} required disabled={isPending} />
      </Field>
      <div className="form-grid">
        <Field id="incident-kind" label="Kind">
          <Select id="incident-kind" name="kind" defaultValue="security" disabled={isPending}>
            <option value="security">Security</option>
            <option value="misdirected">Sent to the wrong person</option>
            <option value="data_loss">Data lost or destroyed</option>
            <option value="availability">Availability</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field id="incident-severity" label="Severity">
          <Select id="incident-severity" name="severity" defaultValue="medium" disabled={isPending}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </Select>
        </Field>
      </div>
      <Field id="incident-detected" label="Detected at" hint="Your local time. Empty: now.">
        <Input
          id="incident-detected"
          name="detected_at"
          type="datetime-local"
          disabled={isPending}
        />
      </Field>
      <label className="checkbox">
        <input
          type="checkbox"
          name="personal_data"
          checked={personal}
          onChange={(event) => setPersonal(event.target.checked)}
          disabled={isPending}
        />
        <span className="checkbox__label">
          Personal data was (or may have been) lost, altered, disclosed or made unavailable
        </span>
      </label>
      {personal && (
        <div className="form-grid">
          <Field
            id="incident-aware"
            label="Aware at"
            hint="When we were reasonably sure. Empty: the time it was detected."
          >
            <Input id="incident-aware" name="aware_at" type="datetime-local" disabled={isPending} />
          </Field>
          <Field id="incident-categories" label="Whose data, and what kind">
            <Input
              id="incident-categories"
              name="data_categories"
              maxLength={400}
              placeholder="Customer contacts: names, work emails"
              disabled={isPending}
            />
          </Field>
        </div>
      )}
      <Field id="incident-summary" label="What we know so far">
        <Textarea
          id="incident-summary"
          name="summary"
          rows={3}
          maxLength={4000}
          disabled={isPending}
        />
      </Field>
      <Button type="submit" variant="primary" disabled={isPending}>
        {isPending ? "Logging…" : "Log the incident"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

type CommitmentValues = {
  contract_reference: string;
  privacy_contact_email: string;
  incident_notice_hours: number | null;
  subprocessor_notice_days: number | null;
  objection_window_days: number | null;
  audit_rights: string;
  data_locations: string;
  exit_assistance_days: number | null;
  dora_classification: string;
  material_outsourcing: boolean;
  nonstandard_clauses: string;
  reviewed_on: string | null;
};

/** What this customer's contract promises, recorded as the contract says it. */
export function CommitmentsForm({
  action,
  companyId,
  commitments,
  standard,
  disabled,
}: {
  action: Action;
  companyId: string;
  commitments: CommitmentValues;
  standard: {
    incident_notice_hours: number;
    subprocessor_notice_days: number;
    objection_window_days: number;
  };
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const off = disabled || isPending;
  const number = (value: number | null) => (value === null ? "" : String(value));
  return (
    <form className="stack-form" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="company_id" value={companyId} />
      <div className="form-grid">
        <Field
          id="commit-contact"
          label="Privacy contact"
          hint="Where incident and sub-processor notices go."
        >
          <Input
            id="commit-contact"
            name="privacy_contact_email"
            type="email"
            defaultValue={commitments.privacy_contact_email}
            maxLength={254}
            disabled={off}
          />
        </Field>
        <Field id="commit-reference" label="Contract or DPA reference">
          <Input
            id="commit-reference"
            name="contract_reference"
            defaultValue={commitments.contract_reference}
            maxLength={120}
            disabled={off}
          />
        </Field>
      </div>
      <div className="form-grid form-grid--3">
        <Field
          id="commit-incident"
          label="Incident notice (hours)"
          hint={`Standard: ${standard.incident_notice_hours}. Empty: none written.`}
        >
          <Input
            id="commit-incident"
            name="incident_notice_hours"
            inputMode="numeric"
            defaultValue={number(commitments.incident_notice_hours)}
            disabled={off}
          />
        </Field>
        <Field
          id="commit-notice"
          label="Sub-processor notice (days)"
          hint={`Standard: ${standard.subprocessor_notice_days}.`}
        >
          <Input
            id="commit-notice"
            name="subprocessor_notice_days"
            inputMode="numeric"
            defaultValue={number(commitments.subprocessor_notice_days)}
            disabled={off}
          />
        </Field>
        <Field
          id="commit-objection"
          label="Objection window (days)"
          hint={`Standard: ${standard.objection_window_days}.`}
        >
          <Input
            id="commit-objection"
            name="objection_window_days"
            inputMode="numeric"
            defaultValue={number(commitments.objection_window_days)}
            disabled={off}
          />
        </Field>
      </div>
      <div className="form-grid form-grid--3">
        <Field id="commit-audit" label="Audit rights">
          <Select
            id="commit-audit"
            name="audit_rights"
            defaultValue={commitments.audit_rights}
            disabled={off}
          >
            <option value="none">None beyond reports</option>
            <option value="questionnaire">Questionnaire</option>
            <option value="remote">Remote audit</option>
            <option value="onsite">On-site audit</option>
          </Select>
        </Field>
        <Field id="commit-dora" label="How they classify us">
          <Select
            id="commit-dora"
            name="dora_classification"
            defaultValue={commitments.dora_classification}
            disabled={off}
          >
            <option value="none">Not a DORA firm</option>
            <option value="ict_service">ICT service (DORA)</option>
            <option value="critical_important">Critical or important function (DORA)</option>
          </Select>
        </Field>
        <Field id="commit-exit" label="Exit assistance (days)">
          <Input
            id="commit-exit"
            name="exit_assistance_days"
            inputMode="numeric"
            defaultValue={number(commitments.exit_assistance_days)}
            disabled={off}
          />
        </Field>
      </div>
      <div className="form-grid">
        <Field id="commit-locations" label="Where their data may be held">
          <Input
            id="commit-locations"
            name="data_locations"
            defaultValue={commitments.data_locations}
            maxLength={200}
            placeholder="UK and EU only"
            disabled={off}
          />
        </Field>
        <Field id="commit-reviewed" label="Reviewed on">
          <Input
            id="commit-reviewed"
            name="reviewed_on"
            type="date"
            defaultValue={commitments.reviewed_on ?? today()}
            max={today()}
            disabled={off}
          />
        </Field>
      </div>
      <label className="checkbox">
        <input
          type="checkbox"
          name="material_outsourcing"
          defaultChecked={commitments.material_outsourcing}
          disabled={off}
        />
        <span className="checkbox__label">They treat us as a material outsourcing</span>
      </label>
      <Field
        id="commit-clauses"
        label="Anything else non-standard"
        hint="Quote the clause and where it is."
      >
        <Textarea
          id="commit-clauses"
          name="nonstandard_clauses"
          rows={3}
          defaultValue={commitments.nonstandard_clauses}
          maxLength={2000}
          disabled={off}
        />
      </Field>
      <Button type="submit" variant="primary" disabled={off}>
        {isPending ? "Saving…" : "Save the commitments"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/** Add a sub-processor: proposed (customers are told first) or already in use. */
export function AddSubprocessorForm({
  action,
  transfers,
}: {
  action: Action;
  transfers: readonly Option[];
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [existing, setExisting] = useState(false);
  return (
    <form className="stack-form" action={formAction}>
      <AttemptField state={state} />
      <div className="form-grid">
        <Field id="sub-name" label="Legal name">
          <Input id="sub-name" name="legal_name" maxLength={200} required disabled={isPending} />
        </Field>
        <Field id="sub-service" label="Service">
          <Input
            id="sub-service"
            name="service"
            maxLength={200}
            placeholder="Email delivery"
            disabled={isPending}
          />
        </Field>
      </div>
      <Field id="sub-purpose" label="What it does with personal data">
        <Textarea id="sub-purpose" name="purpose" rows={2} maxLength={1000} disabled={isPending} />
      </Field>
      <div className="form-grid">
        <Field id="sub-categories" label="Whose data, and what kind">
          <Input id="sub-categories" name="data_categories" maxLength={400} disabled={isPending} />
        </Field>
        <Field id="sub-locations" label="Where it is processed">
          <Input id="sub-locations" name="locations" maxLength={200} disabled={isPending} />
        </Field>
      </div>
      <div className="form-grid">
        <Field id="sub-transfer" label="Transfer safeguard">
          <Select
            id="sub-transfer"
            name="transfer_mechanism"
            defaultValue="not_needed"
            disabled={isPending}
          >
            {transfers.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="sub-dpa" label="DPA signed on">
          <Input id="sub-dpa" name="dpa_signed_on" type="date" disabled={isPending} />
        </Field>
      </div>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={existing}
          onChange={(event) => setExisting(event.target.checked)}
          disabled={isPending}
        />
        <span className="checkbox__label">Already in use (recording the register as it is)</span>
      </label>
      {existing && (
        <Field id="sub-since" label="In use since">
          <Input
            id="sub-since"
            name="in_use_since"
            type="date"
            max={today()}
            required
            disabled={isPending}
          />
        </Field>
      )}
      <Button type="submit" variant="primary" disabled={isPending}>
        {isPending ? "Adding…" : existing ? "Add to the register" : "Propose it"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}
