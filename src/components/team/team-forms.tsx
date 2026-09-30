"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { AttemptField } from "@/components/ui/attempt-field";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";
import { DOCUMENT_LABELS } from "@/lib/team/vocabulary";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

export function DocumentForm({
  action,
  staffId,
  existing,
}: {
  action: Action;
  staffId: string;
  /** Updating a document already on file; absent to record a new one. */
  existing?: {
    document_id: string;
    kind: string;
    status: string;
    signed_on: string | null;
    reference: string;
  };
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [status, setStatus] = useState(
    existing?.status === "requested" ? "signed" : (existing?.status ?? "signed"),
  );
  const id = existing?.document_id ?? "new";
  return (
    <form
      className="stack-form stack-form--tight"
      action={formAction}
      key={existing ? id : (state.sentAt ?? "new")}
    >
      <AttemptField state={state} />
      <input type="hidden" name="staff_id" value={staffId} />
      {existing ? (
        <input type="hidden" name="document_id" value={existing.document_id} />
      ) : (
        <Field id={`doc-kind-${id}`} label="Document">
          <Select id={`doc-kind-${id}`} name="kind" defaultValue="nda" disabled={isPending}>
            {Object.entries(DOCUMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field id={`doc-status-${id}`} label="Status">
        <Select
          id={`doc-status-${id}`}
          name="status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          disabled={isPending}
        >
          <option value="requested">Requested</option>
          <option value="signed">Signed</option>
          <option value="waived">Waived</option>
        </Select>
      </Field>
      {status === "signed" && (
        <Field id={`doc-signed-${id}`} label="Signed on">
          <Input
            id={`doc-signed-${id}`}
            name="signed_on"
            type="date"
            defaultValue={existing?.signed_on?.slice(0, 10)}
            required
            disabled={isPending}
          />
        </Field>
      )}
      <Field
        id={`doc-ref-${id}`}
        label={status === "waived" ? "Why it is waived" : "Where the signed copy is"}
        hint={
          status === "waived"
            ? "Kept in the record and the audit log."
            : "HQ records the signature, not the file."
        }
      >
        <Input
          id={`doc-ref-${id}`}
          name="reference"
          maxLength={400}
          defaultValue={existing?.reference}
          required={status === "waived"}
          disabled={isPending}
        />
      </Field>
      <Button type="submit" size="small" disabled={isPending}>
        {isPending ? "Saving…" : existing ? "Update" : "Record document"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

export function GrantAccessForm({
  action,
  staffId,
  documentsOk,
}: {
  action: Action;
  staffId: string;
  documentsOk: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form
      className="stack-form stack-form--tight"
      action={formAction}
      key={state.sentAt ?? "grant"}
    >
      <AttemptField state={state} />
      <input type="hidden" name="staff_id" value={staffId} />
      <div className="form-row">
        <Field id="grant-system" label="System">
          <Input
            id="grant-system"
            name="system"
            maxLength={60}
            required
            placeholder="e.g. Source control"
            disabled={isPending}
          />
        </Field>
        <Field id="grant-level" label="Level">
          <Input
            id="grant-level"
            name="level"
            maxLength={40}
            placeholder="e.g. Read"
            disabled={isPending}
          />
        </Field>
      </div>
      <Field
        id="grant-expires"
        label="Expires"
        hint="Leave empty for no end date. Interns: their last day."
      >
        <Input id="grant-expires" name="expires_on" type="date" disabled={isPending} />
      </Field>
      <Field id="grant-notes" label="Notes">
        <Input id="grant-notes" name="notes" maxLength={400} disabled={isPending} />
      </Field>
      {!documentsOk && (
        <Field
          id="grant-override"
          label="Grant before documents are in"
          hint="Their NDA and IP assignment are not both signed or waived. Only with a reason, kept in the audit log."
        >
          <Input id="grant-override" name="override_reason" maxLength={400} disabled={isPending} />
        </Field>
      )}
      <Button type="submit" size="small" disabled={isPending}>
        {isPending ? "Recording…" : "Record access"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

export function RevokeAccessForm({
  action,
  staffId,
  accessId,
  system,
}: {
  action: Action;
  staffId: string;
  accessId: string;
  system: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="inline-form" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="staff_id" value={staffId} />
      <input type="hidden" name="access_id" value={accessId} />
      <label className="sr-only" htmlFor={`revoke-${accessId}`}>
        Reason for revoking {system}
      </label>
      <input
        id={`revoke-${accessId}`}
        className="input input--small"
        name="reason"
        maxLength={400}
        placeholder="Reason"
        disabled={isPending}
      />
      <Button type="submit" size="small" variant="danger" disabled={isPending}>
        {isPending ? "Revoking…" : "Revoke"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

export function StartChecklistForm({
  action,
  staffId,
  kinds,
}: {
  action: Action;
  staffId: string;
  kinds: readonly string[];
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  if (kinds.length === 0) return null;
  return (
    <form className="inline-form" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="staff_id" value={staffId} />
      {kinds.map((kind) => (
        <Button
          key={kind}
          type="submit"
          size="small"
          name="kind"
          value={kind}
          variant={kind === "offboarding" ? "danger" : "default"}
          disabled={isPending}
        >
          Start {kind}
        </Button>
      ))}
      <FormFeedback state={state} />
    </form>
  );
}

const MOODS: ReadonlyArray<[number, string]> = [
  [1, "Rough"],
  [2, "Meh"],
  [3, "Steady"],
  [4, "Good"],
  [5, "Great"],
];

export function CheckinForm({
  action,
  weeks,
  initial,
}: {
  action: Action;
  weeks: readonly { value: string; label: string }[];
  initial: { wins: string; priorities: string; blockers: string; mood: number } | null;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [mood, setMood] = useState(initial?.mood ?? 3);
  return (
    <form className="stack-form checkin-form" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="mood" value={mood} />
      <Field id="checkin-week" label="Week">
        <Select id="checkin-week" name="week" defaultValue={weeks[0]?.value} disabled={isPending}>
          {weeks.map((week) => (
            <option key={week.value} value={week.value}>
              {week.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="checkin-wins" label="What went well">
        <Textarea
          id="checkin-wins"
          name="wins"
          rows={3}
          maxLength={2000}
          defaultValue={initial?.wins}
          disabled={isPending}
        />
      </Field>
      <Field id="checkin-priorities" label="What you will do next">
        <Textarea
          id="checkin-priorities"
          name="priorities"
          rows={3}
          maxLength={2000}
          defaultValue={initial?.priorities}
          disabled={isPending}
        />
      </Field>
      <Field
        id="checkin-blockers"
        label="What is in the way"
        hint="Anything a colleague could unblock."
      >
        <Textarea
          id="checkin-blockers"
          name="blockers"
          rows={2}
          maxLength={2000}
          defaultValue={initial?.blockers}
          disabled={isPending}
        />
      </Field>
      <fieldset className="choice-row choice-row--5">
        <legend className="field__label checkin-form__legend">How the week felt</legend>
        {MOODS.map(([value, label]) => (
          <label key={value} className="choice">
            <input
              type="radio"
              name="mood-choice"
              value={value}
              checked={mood === value}
              onChange={() => setMood(value)}
              disabled={isPending}
            />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      <Button variant="primary" type="submit" disabled={isPending}>
        {isPending ? "Saving…" : initial ? "Update check-in" : "Submit check-in"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

export function TimeOffRequestForm({ action, today }: { action: Action; today: string }) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form
      className="stack-form stack-form--tight"
      action={formAction}
      key={state.sentAt ?? "leave"}
    >
      <AttemptField state={state} />
      <Field id="leave-kind" label="Kind">
        <Select id="leave-kind" name="kind" defaultValue="vacation" disabled={isPending}>
          <option value="vacation">Vacation</option>
          <option value="sick">Sick</option>
          <option value="personal">Personal</option>
          <option value="other">Other</option>
        </Select>
      </Field>
      <div className="form-row">
        <Field id="leave-from" label="From">
          <Input
            id="leave-from"
            name="starts_on"
            type="date"
            defaultValue={today}
            required
            disabled={isPending}
          />
        </Field>
        <Field id="leave-to" label="To">
          <Input
            id="leave-to"
            name="ends_on"
            type="date"
            defaultValue={today}
            required
            disabled={isPending}
          />
        </Field>
      </div>
      <Field id="leave-note" label="Note">
        <Input id="leave-note" name="note" maxLength={400} disabled={isPending} />
      </Field>
      <Button variant="primary" type="submit" disabled={isPending}>
        {isPending ? "Requesting…" : "Request time off"}
      </Button>
      <FormFeedback state={state} sentLabel="Requested." />
    </form>
  );
}

export function IssueCertificateForm({
  action,
  people,
  today,
  disabled,
}: {
  action: Action;
  people: readonly { staff_id: string; name: string; starts_on: string; ends_on: string }[];
  today: string;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [personId, setPersonId] = useState("");
  const person = people.find((candidate) => candidate.staff_id === personId);
  const off = isPending || disabled;
  return (
    <>
      <form
        className="stack-form stack-form--tight"
        action={formAction}
        key={`${state.sentAt ?? "cert"}-${personId}`}
      >
        <AttemptField state={state} />
        <Field
          id="cert-person"
          label="For"
          hint="Choosing a colleague fills in their name and dates."
        >
          <Select
            id="cert-person"
            name="staff_id"
            value={personId}
            onChange={(event) => setPersonId(event.target.value)}
            disabled={off}
          >
            <option value="">Someone not in HQ</option>
            {people.map((candidate) => (
              <option key={candidate.staff_id} value={candidate.staff_id}>
                {candidate.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="cert-name" label="Name as printed">
          <Input
            id="cert-name"
            name="recipient_name"
            maxLength={120}
            defaultValue={person?.name}
            required
            disabled={off}
          />
        </Field>
        <Field id="cert-title" label="Title">
          <Input
            id="cert-title"
            name="title"
            maxLength={120}
            required
            placeholder="e.g. Equity Research Intern"
            disabled={off}
          />
        </Field>
        <div className="form-row">
          <Field id="cert-from" label="From">
            <Input
              id="cert-from"
              name="starts_on"
              type="date"
              defaultValue={person?.starts_on}
              required
              disabled={off}
            />
          </Field>
          <Field id="cert-to" label="To">
            <Input
              id="cert-to"
              name="ends_on"
              type="date"
              defaultValue={person?.ends_on || today}
              max={today}
              required
              disabled={off}
            />
          </Field>
        </div>
        <Field
          id="cert-summary"
          label="What they did"
          hint="One or two sentences, shown on the public check."
        >
          <Textarea id="cert-summary" name="summary" rows={3} maxLength={600} disabled={off} />
        </Field>
        <Button variant="primary" type="submit" disabled={off}>
          {isPending ? "Issuing…" : "Issue certificate"}
        </Button>
        {state.status !== "sent" && <FormFeedback state={state} />}
      </form>
      {state.status === "sent" && state.secret && (
        <div className="one-time-secret" role="status">
          <p className="one-time-secret__label">Issued</p>
          <code className="one-time-secret__value">{state.secret}</code>
          <p className="one-time-secret__hint">
            Anyone can check it at /verify/{state.secret}. The serial is on the page they are given.
          </p>
        </div>
      )}
    </>
  );
}

export function RevokeCertificateForm({
  action,
  serial,
  disabled,
}: {
  action: Action;
  serial: string;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="inline-form" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="serial" value={serial} />
      <label className="sr-only" htmlFor={`cert-revoke-${serial}`}>
        Reason for revoking {serial}
      </label>
      <input
        id={`cert-revoke-${serial}`}
        className="input input--small"
        name="reason"
        maxLength={400}
        placeholder="Reason"
        required
        disabled={isPending || disabled}
      />
      <Button type="submit" size="small" variant="danger" disabled={isPending || disabled}>
        {isPending ? "Revoking…" : "Revoke"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

export function ReviewItemForm({
  action,
  reviewId,
  accessId,
  label,
}: {
  action: Action;
  reviewId: string;
  accessId: string;
  label: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="inline-form review-item-form" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="review_id" value={reviewId} />
      <input type="hidden" name="access_id" value={accessId} />
      <label className="sr-only" htmlFor={`evidence-${accessId}`}>
        Evidence for {label}
      </label>
      <input
        id={`evidence-${accessId}`}
        className="input input--small"
        name="evidence"
        maxLength={400}
        required
        minLength={4}
        placeholder="What the decision rests on"
        disabled={isPending}
      />
      <Button type="submit" size="small" name="decision" value="keep" disabled={isPending}>
        Keep
      </Button>
      <Button
        type="submit"
        size="small"
        variant="danger"
        name="decision"
        value="revoke"
        disabled={isPending}
      >
        Revoke
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

export function StartReviewForm({
  action,
  disabled,
}: {
  action: () => Promise<ActionState>;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="inline-form" action={formAction}>
      <AttemptField state={state} />
      <Button type="submit" variant="primary" size="small" disabled={isPending || disabled}>
        {isPending ? "Starting…" : "Start this quarter's review"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

export function CompleteReviewForm({
  action,
  reviewId,
  ready,
}: {
  action: Action;
  reviewId: string;
  ready: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="review_id" value={reviewId} />
      <Field id="review-notes" label="Notes for the record">
        <Textarea
          id="review-notes"
          name="notes"
          rows={2}
          maxLength={1000}
          disabled={isPending || !ready}
        />
      </Field>
      <Button type="submit" variant="primary" disabled={isPending || !ready}>
        {isPending ? "Completing…" : "Complete the review"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

// --- people ops -----------------------------------------------------------------------

/** Manager, probation end and emergency contact: HR fields on the person's record. */
export function ProfileForm({
  action,
  staffId,
  person,
  colleagues,
}: {
  action: Action;
  staffId: string;
  person: {
    manager_id: string;
    probation_ends_on: string | null;
    emergency_contact: { name: string; phone: string; relation: string };
    /** Fields that arrived masked; a mask left as it is changes nothing. */
    masked?: readonly string[];
  };
  /** Active colleagues who could be the manager (the person themself excluded). */
  colleagues: readonly { staff_id: string; display_name: string }[];
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form stack-form--tight" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="staff_id" value={staffId} />
      <Field id="profile-manager" label="Reports to">
        <Select
          id="profile-manager"
          name="manager_id"
          defaultValue={person.manager_id}
          disabled={isPending}
        >
          <option value="">Nobody recorded</option>
          {colleagues.map((member) => (
            <option key={member.staff_id} value={member.staff_id}>
              {member.display_name}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        id="profile-probation"
        label="Probation ends"
        hint="A reminder appears sixty days before. Clear it once confirmed."
      >
        <Input
          id="profile-probation"
          name="probation_ends_on"
          type="date"
          defaultValue={person.probation_ends_on?.slice(0, 10) ?? ""}
          disabled={isPending}
        />
      </Field>
      <Field
        id="profile-ec-name"
        label="Emergency contact"
        hint={
          person.masked?.some((name) => name.startsWith("emergency_contact"))
            ? "Hidden values stay as they are unless you type over them."
            : undefined
        }
      >
        <Input
          id="profile-ec-name"
          name="emergency_contact_name"
          placeholder="Name"
          maxLength={120}
          defaultValue={person.emergency_contact.name}
          disabled={isPending}
        />
      </Field>
      <div className="form-row">
        <Field id="profile-ec-phone" label="Phone">
          <Input
            id="profile-ec-phone"
            name="emergency_contact_phone"
            type="tel"
            maxLength={40}
            defaultValue={person.emergency_contact.phone}
            disabled={isPending}
          />
        </Field>
        <Field id="profile-ec-relation" label="Relation">
          <Input
            id="profile-ec-relation"
            name="emergency_contact_relation"
            maxLength={60}
            placeholder="e.g. Parent"
            defaultValue={person.emergency_contact.relation}
            disabled={isPending}
          />
        </Field>
      </div>
      <Button type="submit" size="small" disabled={isPending}>
        {isPending ? "Saving…" : "Save"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

const ASSET_KIND_LABELS: Record<string, string> = {
  laptop: "Laptop",
  phone: "Phone",
  monitor: "Monitor",
  badge: "Badge",
  key: "Key",
  token: "Security token",
  other: "Other",
};

/** Issue something to a person. Returns are recorded per row (ReturnAssetForm). */
export function IssueAssetForm({
  action,
  staffId,
  today,
}: {
  action: Action;
  staffId: string;
  today: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form stack-form--tight" action={formAction} key={state.sentAt ?? "new"}>
      <AttemptField state={state} />
      <input type="hidden" name="staff_id" value={staffId} />
      <Field id="asset-kind" label="What">
        <Select id="asset-kind" name="kind" defaultValue="laptop" disabled={isPending}>
          {Object.entries(ASSET_KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="asset-label" label="Label" hint="As it is known: model, or what it opens.">
        <Input id="asset-label" name="label" maxLength={120} required disabled={isPending} />
      </Field>
      <Field id="asset-serial" label="Serial or tag">
        <Input id="asset-serial" name="serial" maxLength={80} disabled={isPending} />
      </Field>
      <Field id="asset-issued" label="Issued on">
        <Input
          id="asset-issued"
          name="issued_on"
          type="date"
          defaultValue={today}
          required
          disabled={isPending}
        />
      </Field>
      <Button type="submit" size="small" disabled={isPending}>
        {isPending ? "Recording…" : "Record as issued"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/** The return of one issued thing: a date, and where it is now. */
export function ReturnAssetForm({
  action,
  staffId,
  asset,
  today,
}: {
  action: Action;
  staffId: string;
  asset: { asset_id: string; label: string };
  today: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="inline-form" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="staff_id" value={staffId} />
      <input type="hidden" name="asset_id" value={asset.asset_id} />
      <label className="sr-only" htmlFor={`return-on-${asset.asset_id}`}>
        Returned on, {asset.label}
      </label>
      <input
        id={`return-on-${asset.asset_id}`}
        className="input input--small"
        name="returned_on"
        type="date"
        defaultValue={today}
        max={today}
        required
        disabled={isPending}
      />
      <Button type="submit" size="small" variant="ghost" disabled={isPending}>
        {isPending ? "Recording…" : "Returned"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

export function TrainingForm({ action, staffId }: { action: Action; staffId: string }) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form stack-form--tight" action={formAction} key={state.sentAt ?? "new"}>
      <AttemptField state={state} />
      <input type="hidden" name="staff_id" value={staffId} />
      <Field id="training-title" label="Training">
        <Input id="training-title" name="title" maxLength={160} required disabled={isPending} />
      </Field>
      <Field id="training-provider" label="Provider">
        <Input id="training-provider" name="provider" maxLength={120} disabled={isPending} />
      </Field>
      <div className="form-row">
        <Field id="training-completed" label="Completed on">
          <Input
            id="training-completed"
            name="completed_on"
            type="date"
            required
            disabled={isPending}
          />
        </Field>
        <Field id="training-expires" label="Expires" hint="Leave empty if it does not.">
          <Input id="training-expires" name="expires_on" type="date" disabled={isPending} />
        </Field>
      </div>
      <Field id="training-ref" label="Certificate or reference">
        <Input id="training-ref" name="reference" maxLength={400} disabled={isPending} />
      </Field>
      <Button type="submit" size="small" disabled={isPending}>
        {isPending ? "Recording…" : "Record training"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/** A one-to-one and up to four actions, each owned by the person or by the writer. */
export function OneOnOneForm({
  action,
  staffId,
  personName,
  today,
}: {
  action: Action;
  staffId: string;
  personName: string;
  today: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form stack-form--tight" action={formAction} key={state.sentAt ?? "new"}>
      <AttemptField state={state} />
      <input type="hidden" name="staff_id" value={staffId} />
      <Field id="oo-held" label="Held on">
        <Input
          id="oo-held"
          name="held_on"
          type="date"
          defaultValue={today}
          max={today}
          required
          disabled={isPending}
        />
      </Field>
      <Field id="oo-notes" label="Notes" hint="What was said; the person can read this.">
        <Textarea id="oo-notes" name="notes" rows={4} maxLength={2000} disabled={isPending} />
      </Field>
      <fieldset className="checkbox-group" disabled={isPending}>
        <legend className="field__label">Actions</legend>
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="oo-action-row">
            <label className="sr-only" htmlFor={`oo-action-${index}`}>
              Action {index + 1}
            </label>
            <input
              id={`oo-action-${index}`}
              className="input input--small"
              name={`action_title_${index}`}
              maxLength={200}
              placeholder={index === 0 ? "What was agreed" : ""}
            />
            <label className="sr-only" htmlFor={`oo-owner-${index}`}>
              Owner
            </label>
            <select
              id={`oo-owner-${index}`}
              className="select select--small"
              name={`action_owner_${index}`}
              defaultValue="them"
            >
              <option value="them">{personName || "Them"}</option>
              <option value="me">Me</option>
            </select>
            <label className="sr-only" htmlFor={`oo-due-${index}`}>
              Due
            </label>
            <input
              id={`oo-due-${index}`}
              className="input input--small"
              name={`action_due_${index}`}
              type="date"
              min={today}
            />
          </div>
        ))}
      </fieldset>
      <Button type="submit" size="small" disabled={isPending}>
        {isPending ? "Recording…" : "Record one-to-one"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}
