"use client";

import { useActionState, useState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;
type Option = { value: string; label: string };
type Named = { id: string; name: string };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A new request: what they want, in a line, and what it would mean. */
export function NewRequestForm({ action }: { action: Action }) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form" action={formAction}>
      <AttemptField state={state} />
      <Field id="request-title" label="What they want, in a line">
        <Input id="request-title" name="title" maxLength={200} required disabled={isPending} />
      </Field>
      <Field id="request-description" label="What it would mean">
        <Textarea
          id="request-description"
          name="description"
          rows={3}
          maxLength={4000}
          disabled={isPending}
        />
      </Field>
      <Button type="submit" variant="primary" disabled={isPending}>
        {isPending ? "Adding…" : "Add the request"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/** One ask: who, from where, in their words, how much it matters, and the deal it blocks. */
export function AddAskForm({
  action,
  requestId,
  companies,
  people,
  deals,
  sources,
  importance,
}: {
  action: Action;
  requestId: string;
  companies: readonly Named[];
  people: ReadonlyArray<Named & { company_id: string }>;
  deals: readonly Named[];
  sources: readonly string[];
  importance: readonly Option[];
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [company, setCompany] = useState("");
  const theirPeople = company ? people.filter((person) => person.company_id === company) : people;
  return (
    <form className="stack-form" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="request_id" value={requestId} />
      <div className="form-grid">
        <Field id="ask-company" label="Firm">
          <Select
            id="ask-company"
            name="company_id"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            disabled={isPending}
          >
            <option value="">Choose</option>
            {companies.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="ask-person" label="Who asked" hint="They hear when it ships.">
          <Select id="ask-person" name="person_id" defaultValue="" disabled={isPending}>
            <option value="">Nobody named</option>
            {theirPeople.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id="ask-quote" label="What they said, in their words">
        <Textarea id="ask-quote" name="quote" rows={2} maxLength={1000} disabled={isPending} />
      </Field>
      <div className="form-grid form-grid--3">
        <Field id="ask-importance" label="How much it matters">
          <Select
            id="ask-importance"
            name="importance"
            defaultValue="important"
            disabled={isPending}
          >
            {importance.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="ask-source" label="Where">
          <Select id="ask-source" name="source" defaultValue="call" disabled={isPending}>
            {sources.map((source) => (
              <option key={source} value={source}>
                {source.charAt(0).toUpperCase() + source.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="ask-deal" label="Blocks a deal">
          <Select id="ask-deal" name="deal_id" defaultValue="" disabled={isPending}>
            <option value="">No</option>
            {deals.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Adding…" : "Add the ask"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/** Mark it shipped and tell the people who asked: the draft to read and send, or a record. */
export function ShipForm({
  action,
  requestId,
  draft,
  canMail,
  mailNote,
}: {
  action: Action;
  requestId: string;
  draft: { subject: string; body: string };
  canMail: boolean;
  mailNote: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [tell, setTell] = useState(canMail ? "mail" : "recorded");
  return (
    <form className="stack-form" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="request_id" value={requestId} />
      <div className="form-grid">
        <Field id="ship-on" label="Shipped on">
          <Input
            id="ship-on"
            name="shipped_on"
            type="date"
            defaultValue={today()}
            max={today()}
            disabled={isPending}
          />
        </Field>
        <Field id="ship-tell" label="Tell the people who asked">
          <Select
            id="ship-tell"
            name="tell"
            value={tell}
            onChange={(event) => setTell(event.target.value)}
            disabled={isPending}
          >
            {canMail && <option value="mail">Mail each of them now</option>}
            <option value="recorded">I told them myself</option>
            <option value="none">Do not tell them</option>
          </Select>
        </Field>
      </div>
      {mailNote && <p className="field__hint">{mailNote}</p>}
      {tell === "mail" && (
        <>
          <Field id="ship-subject" label="Subject">
            <Input
              id="ship-subject"
              name="subject"
              defaultValue={draft.subject}
              maxLength={200}
              disabled={isPending}
            />
          </Field>
          <Field
            id="ship-body"
            label="Message"
            hint="One mail to each person; nobody sees another's address."
          >
            <Textarea
              id="ship-body"
              name="body"
              rows={7}
              defaultValue={draft.body}
              maxLength={4000}
              disabled={isPending}
            />
          </Field>
        </>
      )}
      <Button type="submit" variant="primary" disabled={isPending}>
        {isPending ? "Saving…" : tell === "mail" ? "Mark shipped and send" : "Mark shipped"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/** Start an onboarding for a new customer. */
export function StartOnboardingForm({
  action,
  companies,
}: {
  action: Action;
  companies: ReadonlyArray<{ id: string; name: string; starts_on: string }>;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form" action={formAction}>
      <AttemptField state={state} />
      <Field id="onboarding-company" label="Customer">
        <Select id="onboarding-company" name="company_id" defaultValue="" disabled={isPending}>
          <option value="">Choose</option>
          {companies.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · started {item.starts_on}
            </option>
          ))}
        </Select>
      </Field>
      <div className="form-grid">
        <Field id="onboarding-kickoff" label="Kickoff on" hint="Empty until it is held.">
          <Input
            id="onboarding-kickoff"
            name="kickoff_on"
            type="date"
            max={today()}
            disabled={isPending}
          />
        </Field>
        <Field id="onboarding-target" label="Live by" hint="Empty: 30 days from the start.">
          <Input id="onboarding-target" name="target_live_on" type="date" disabled={isPending} />
        </Field>
      </div>
      <Button type="submit" variant="primary" disabled={isPending}>
        {isPending ? "Starting…" : "Start the onboarding"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}
