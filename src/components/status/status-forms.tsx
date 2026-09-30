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
type Named = { id: string; name: string };

/** Each component with how badly it is hit: unaffected, or degraded, partial or major. */
function ImpactPicker({
  components,
  impacts,
  current = {},
  disabled,
}: {
  components: readonly Named[];
  impacts: readonly Option[];
  current?: Record<string, string>;
  disabled: boolean;
}) {
  return (
    <fieldset className="impact-list">
      <legend className="field__label">What it affects</legend>
      {components.map((component) => (
        <label key={component.id} className="impact-list__row">
          <span>{component.name}</span>
          <Select
            name={`impact:${component.id}`}
            defaultValue={current[component.id] ?? ""}
            disabled={disabled}
          >
            <option value="">Not affected</option>
            {impacts.map((impact) => (
              <option key={impact.value} value={impact.value}>
                {impact.label}
              </option>
            ))}
          </Select>
        </label>
      ))}
    </fieldset>
  );
}

function NotifyBox({ mailReady, disabled }: { mailReady: boolean; disabled: boolean }) {
  return (
    <label className="checkbox">
      <input
        type="checkbox"
        name="notify"
        defaultChecked={mailReady}
        disabled={disabled || !mailReady}
      />
      <span className="checkbox__label">
        {mailReady
          ? "Mail this update to everyone who subscribed"
          : "Mail is not set up: the update goes on the page only"}
      </span>
    </label>
  );
}

/** Report an incident: what customers see, what it affects, and the first update. */
export function OpenIncidentForm({
  action,
  components,
  impacts,
  statuses,
  mailReady,
}: {
  action: Action;
  components: readonly Named[];
  impacts: readonly Option[];
  statuses: readonly Option[];
  mailReady: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form" action={formAction}>
      <AttemptField state={state} />
      <TzOffsetField />
      <Field id="status-title" label="What customers see, in a line">
        <Input id="status-title" name="title" maxLength={200} required disabled={isPending} />
      </Field>
      <ImpactPicker components={components} impacts={impacts} disabled={isPending} />
      <Field id="status-state" label="Where we are">
        <Select id="status-state" name="status" defaultValue="investigating" disabled={isPending}>
          {statuses
            .filter((item) => item.value !== "resolved")
            .map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
        </Select>
      </Field>
      <Field
        id="status-body"
        label="The first update"
        hint="Plain words: what is affected, and that we are on it."
      >
        <Textarea id="status-body" name="body" rows={3} maxLength={2000} disabled={isPending} />
      </Field>
      <NotifyBox mailReady={mailReady} disabled={isPending} />
      <Button type="submit" variant="primary" disabled={isPending}>
        {isPending ? "Posting…" : "Post the incident"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/** A new update on an open incident: where it stands now, in words, and any change in what it affects. */
export function PostUpdateForm({
  action,
  incidentId,
  components,
  impacts,
  statuses,
  current,
  currentStatus,
  mailReady,
}: {
  action: Action;
  incidentId: string;
  components: readonly Named[];
  impacts: readonly Option[];
  statuses: readonly Option[];
  current: Record<string, string>;
  currentStatus: string;
  mailReady: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [status, setStatus] = useState(currentStatus);
  return (
    <form className="stack-form" action={formAction}>
      <AttemptField state={state} />
      <input type="hidden" name="incident_id" value={incidentId} />
      <Field id="update-status" label="Where we are now">
        <Select
          id="update-status"
          name="status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          disabled={isPending}
        >
          {statuses.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="update-body" label="The update">
        <Textarea id="update-body" name="body" rows={3} maxLength={2000} disabled={isPending} />
      </Field>
      {status !== "resolved" && (
        <ImpactPicker
          components={components}
          impacts={impacts}
          current={current}
          disabled={isPending}
        />
      )}
      <NotifyBox mailReady={mailReady} disabled={isPending} />
      <Button type="submit" variant="primary" disabled={isPending}>
        {isPending ? "Posting…" : status === "resolved" ? "Post and resolve" : "Post the update"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/** Schedule a maintenance window: it starts and ends itself. */
export function MaintenanceForm({
  action,
  components,
  mailReady,
}: {
  action: Action;
  components: readonly Named[];
  mailReady: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form" action={formAction}>
      <AttemptField state={state} />
      <TzOffsetField />
      <Field id="maintenance-title" label="What is being done">
        <Input id="maintenance-title" name="title" maxLength={200} required disabled={isPending} />
      </Field>
      <div className="form-grid">
        <Field id="maintenance-starts" label="Starts" hint="Your local time.">
          <Input
            id="maintenance-starts"
            name="starts_at"
            type="datetime-local"
            required
            disabled={isPending}
          />
        </Field>
        <Field id="maintenance-ends" label="Ends" hint="Your local time.">
          <Input
            id="maintenance-ends"
            name="ends_at"
            type="datetime-local"
            required
            disabled={isPending}
          />
        </Field>
      </div>
      <fieldset className="pick-list">
        <legend className="field__label">What it touches</legend>
        <div className="pick-list__options">
          {components.map((component) => (
            <label key={component.id} className="checkbox">
              <input
                type="checkbox"
                name="component_ids"
                value={component.id}
                disabled={isPending}
              />
              <span className="checkbox__label">{component.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field id="maintenance-body" label="What customers should expect">
        <Textarea
          id="maintenance-body"
          name="body"
          rows={2}
          maxLength={2000}
          disabled={isPending}
        />
      </Field>
      <NotifyBox mailReady={mailReady} disabled={isPending} />
      <Button type="submit" variant="primary" disabled={isPending}>
        {isPending ? "Scheduling…" : "Schedule it"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/** Add a component: a part of the service a customer would name. */
export function ComponentForm({ action }: { action: Action }) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="stack-form" action={formAction}>
      <AttemptField state={state} />
      <Field
        id="component-name"
        label="Name"
        hint="As a customer would call it: the desktop app, sign-in, market data."
      >
        <Input id="component-name" name="name" maxLength={80} required disabled={isPending} />
      </Field>
      <Field id="component-description" label="What it covers">
        <Input id="component-description" name="description" maxLength={400} disabled={isPending} />
      </Field>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Adding…" : "Add the component"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/** The public subscribe form: an address, and a confirmation link sent to it. */
export function SubscribeForm({ action }: { action: Action }) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form className="subscribe-form" action={formAction}>
      <AttemptField state={state} />
      <label className="field__label" htmlFor="subscribe-email">
        Get updates by email
      </label>
      <div className="subscribe-form__row">
        <Input
          id="subscribe-email"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
          disabled={isPending}
        />
        {/* A field people never see; a bot that fills it is thanked and ignored. */}
        <div className="honeypot" aria-hidden="true">
          <label htmlFor="subscribe-website">Leave this empty</label>
          <input
            id="subscribe-website"
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Sending…" : "Subscribe"}
        </Button>
      </div>
      <FormFeedback state={state} />
    </form>
  );
}
