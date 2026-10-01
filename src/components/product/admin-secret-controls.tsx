"use client";

import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import {
  INITIAL_ADMIN_SECRET_STATE,
  SECRET_VALUE_MAX_LENGTH,
  type AdminSecretActionState,
} from "@/lib/product/secret-input";
import { pluralize } from "@/lib/format";

type SecretAction = (
  state: AdminSecretActionState,
  formData: FormData,
) => Promise<AdminSecretActionState>;

type AdminSecretControlsProps = {
  slot: string;
  label: string;
  kind: "single" | "multi" | "identifier";
  isSecret: boolean;
  keyCount: number;
  /** The key a replace or clear is about, so the write is a statement about that key. */
  currentFingerprint: string | null;
  /** Set when the controls must be present but unusable; rendered beside them. */
  disabledReason: string | null;
  setAction: SecretAction;
  revokeAction: SecretAction;
  restoreAction: SecretAction;
};

function Outcome({ state, slot }: { state: AdminSecretActionState; slot: string }) {
  if (!state.message || state.slot !== slot) return null;
  const failed = state.status === "error";
  return (
    <Callout tone={failed ? "danger" : "success"} role={failed ? "alert" : "status"} compact>
      {state.message}
      {failed && " What you typed is still in the field."}
    </Callout>
  );
}

/**
 * The write controls for one credential.
 *
 * The field starts empty on every page load and is never filled from a response — there is
 * no response that could fill it. It is uncontrolled and keeps its key across a failed
 * submission, so a rejected save leaves the sixty-four characters the provider showed once
 * exactly where the operator typed them; the browser is already holding that text, and
 * clearing it would put nothing new anywhere while costing a key. A save that succeeds
 * clears the form, because a credential has no business sitting in an input after it has
 * been stored.
 */
export function AdminSecretControls({
  slot,
  label,
  kind,
  isSecret,
  keyCount,
  currentFingerprint,
  disabledReason,
  setAction,
  revokeAction,
  restoreAction,
}: AdminSecretControlsProps) {
  const [setState, submitSet, setPending] = useActionState(setAction, INITIAL_ADMIN_SECRET_STATE);
  const [revokeState, submitRevoke, revokePending] = useActionState(
    revokeAction,
    INITIAL_ADMIN_SECRET_STATE,
  );
  const [restoreState, submitRestore, restorePending] = useActionState(
    restoreAction,
    INITIAL_ADMIN_SECRET_STATE,
  );
  const setForm = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (setState.status === "success" && setState.slot === slot) setForm.current?.reset();
  }, [setState, slot]);

  const multi = kind === "multi";
  const locked = disabledReason !== null;
  const valueId = `secret-value-${slot}`;

  return (
    <div className="stack">
      {locked && <p className="field__error">{disabledReason}</p>}

      <form action={submitSet} ref={setForm} className="form">
        <input type="hidden" name="slot" value={slot} />
        {currentFingerprint && !multi && (
          <input type="hidden" name="expectedFingerprint" value={currentFingerprint} />
        )}
        <fieldset className="fieldset" disabled={locked || setPending}>
          <Field
            id={valueId}
            label={multi ? `Add a key to ${label}` : `New value for ${label}`}
            hint={
              isSecret
                ? "Paste the value from the provider. It is stored, never shown again."
                : "A public registration value. It is stored and shown here in full length."
            }
          >
            <Input
              id={valueId}
              name="value"
              type={isSecret ? "password" : "text"}
              autoComplete="off"
              spellCheck={false}
              maxLength={SECRET_VALUE_MAX_LENGTH}
              required
            />
          </Field>
          {multi ? (
            <Field
              id={`secret-mode-${slot}`}
              label="How to apply it"
              hint="This credential holds several keys and the app rotates across them, so adding is the usual change."
            >
              <Select
                id={`secret-mode-${slot}`}
                name="mode"
                defaultValue="append"
                aria-describedby={`secret-mode-${slot}-hint`}
              >
                <option value="append">Add to the {pluralize(keyCount, "key")} already here</option>
                <option value="replace">Replace all {pluralize(keyCount, "key")}</option>
              </Select>
            </Field>
          ) : (
            <input type="hidden" name="mode" value="replace" />
          )}
          <Checkbox
            id={`secret-confirm-${slot}`}
            name="confirm"
            label="I have this value from the provider and want it used now"
            description="Desktops pick up a change the next time they refresh, within about thirty seconds."
            required
          />
          <div className="form-actions">
            <Button variant="primary" type="submit" disabled={locked || setPending}>
              {setPending ? "Saving…" : multi ? "Save key" : "Save credential"}
            </Button>
          </div>
        </fieldset>
      </form>
      <Outcome state={setState} slot={slot} />

      {keyCount > 0 && (
        <form action={submitRevoke} className="form">
          <input type="hidden" name="slot" value={slot} />
          {currentFingerprint && (
            <input type="hidden" name="expectedFingerprint" value={currentFingerprint} />
          )}
          <fieldset className="fieldset" disabled={locked || revokePending}>
            <Checkbox
              id={`secret-revoke-${slot}`}
              name="confirm"
              tone="danger"
              label={`Clear ${label}`}
              description="Anything already holding a copy keeps working until it refreshes, and a machine with the value in its own environment keeps working indefinitely. Withdraw it at the provider as well."
              required
            />
            <div className="form-actions">
              <Button variant="danger" type="submit" disabled={locked || revokePending}>
                {revokePending ? "Clearing…" : "Clear this credential"}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      <Outcome state={revokeState} slot={slot} />

      <form action={submitRestore} className="form">
        <input type="hidden" name="slot" value={slot} />
        <fieldset className="fieldset" disabled={locked || restorePending}>
          <Checkbox
            id={`secret-restore-${slot}`}
            name="confirm"
            label="Put the previous value back"
            description="Undoes a wrong paste. The value never leaves the service; only its fingerprint is reported back."
            required
          />
          <div className="form-actions">
            <Button type="submit" disabled={locked || restorePending}>
              {restorePending ? "Restoring…" : "Restore previous"}
            </Button>
          </div>
        </fieldset>
      </form>
      <Outcome state={restoreState} slot={slot} />
    </div>
  );
}
