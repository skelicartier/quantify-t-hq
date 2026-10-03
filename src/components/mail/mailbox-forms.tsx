import { MailForm } from "@/components/mail/mail-form";
import { Field, Input, Select } from "@/components/ui/field";
import type { Mailbox } from "@/lib/api/mail-schema";
import type { ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

export type AddMailboxDefaults = {
  address: string;
  display_name: string;
  smtp_host: string;
  smtp_port: number;
  imap_host: string;
};

/**
 * A mailbox at a host without its own consent screen: its servers and an app password.
 * The service signs in before it keeps anything, so a typo is refused, not stored.
 */
export function AddMailboxForm({
  action,
  disabled,
  defaults,
}: {
  action: Action;
  disabled: boolean;
  defaults: AddMailboxDefaults;
}) {
  return (
    <MailForm
      action={action}
      submitLabel="Sign in and add"
      pendingLabel="Signing in…"
      disabled={disabled}
    >
      <Field id="add-address" label="Address">
        <Input
          id="add-address"
          name="address"
          type="email"
          defaultValue={defaults.address}
          maxLength={254}
          required
          autoComplete="off"
        />
      </Field>
      <Field
        id="add-name"
        label="Name recipients see"
        hint="Your own name: a first email comes from a person."
      >
        <Input
          id="add-name"
          name="display_name"
          defaultValue={defaults.display_name}
          maxLength={120}
        />
      </Field>
      <div className="form-row">
        <Field id="add-smtp" label="Outgoing server">
          <Input
            id="add-smtp"
            name="smtp_host"
            defaultValue={defaults.smtp_host}
            placeholder="smtp.example.com"
            maxLength={253}
            required
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Field
          id="add-smtp-port"
          label="Its port"
          hint="465 for most hosts; 587 where the host says so."
        >
          <Select id="add-smtp-port" name="smtp_port" defaultValue={String(defaults.smtp_port)}>
            {[465, 587, 2525, 25].map((port) => (
              <option key={port} value={port}>
                {port}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="form-row">
        <Field
          id="add-imap"
          label="Incoming server"
          note="optional"
          hint="Kept for reading replies; nothing reads the inbox yet."
        >
          <Input
            id="add-imap"
            name="imap_host"
            defaultValue={defaults.imap_host}
            placeholder="imap.example.com"
            maxLength={253}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Field id="add-imap-port" label="Its port">
          <Select id="add-imap-port" name="imap_port" defaultValue="993">
            <option value="993">993</option>
            <option value="143">143</option>
          </Select>
        </Field>
      </div>
      <Field
        id="add-username"
        label="Sign-in name"
        note="optional"
        hint="Only when it is not the address itself."
      >
        <Input id="add-username" name="username" maxLength={254} autoComplete="off" />
      </Field>
      <Field
        id="add-password"
        label="App password"
        hint="Made in the mailbox's own security settings for this one use, never your everyday password. It is sealed on arrival and never shown again."
      >
        <Input
          id="add-password"
          name="password"
          type="password"
          maxLength={256}
          required
          autoComplete="new-password"
        />
      </Field>
    </MailForm>
  );
}

/** How fast one mailbox climbs and how far apart its sends are. */
export function MailboxPaceForm({
  action,
  mailbox,
  maxCap,
}: {
  action: Action;
  mailbox: Mailbox;
  maxCap: number;
}) {
  const id = mailbox.mailbox_id;
  return (
    <MailForm action={action} fields={{ mailbox_id: id }} submitLabel="Save the pace">
      <Field id={`pace-name-${id}`} label="Name recipients see">
        <Input
          id={`pace-name-${id}`}
          name="display_name"
          defaultValue={mailbox.display_name}
          maxLength={120}
          required
        />
      </Field>
      <div className="form-row">
        <Field id={`pace-cap-${id}`} label="A day, at most" hint={`Up to ${maxCap}.`}>
          <Input
            id={`pace-cap-${id}`}
            name="daily_cap"
            type="number"
            inputMode="numeric"
            min={1}
            max={maxCap}
            defaultValue={mailbox.daily_cap}
            required
          />
        </Field>
        <Field id={`pace-from-${id}`} label="On its first day">
          <Input
            id={`pace-from-${id}`}
            name="ramp_from"
            type="number"
            inputMode="numeric"
            min={1}
            max={maxCap}
            defaultValue={mailbox.ramp_from}
            required
          />
        </Field>
      </div>
      <div className="form-row">
        <Field id={`pace-step-${id}`} label="More each day after">
          <Input
            id={`pace-step-${id}`}
            name="ramp_step"
            type="number"
            inputMode="numeric"
            min={0}
            max={20}
            defaultValue={mailbox.ramp_step}
            required
          />
        </Field>
        <Field id={`pace-gap-${id}`} label="Minutes apart, at least">
          <Input
            id={`pace-gap-${id}`}
            name="gap_minutes"
            type="number"
            inputMode="numeric"
            min={2}
            max={240}
            defaultValue={mailbox.gap_minutes}
            required
          />
        </Field>
      </div>
      <Field
        id={`pace-jitter-${id}`}
        label="Plus up to this many more, at random"
        hint="So the sends never fall on a clock's beat."
      >
        <Input
          id={`pace-jitter-${id}`}
          name="gap_jitter_minutes"
          type="number"
          inputMode="numeric"
          min={0}
          max={120}
          defaultValue={mailbox.gap_jitter_minutes}
          required
        />
      </Field>
    </MailForm>
  );
}
