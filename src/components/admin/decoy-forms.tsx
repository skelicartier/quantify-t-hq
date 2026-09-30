"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { AttemptField } from "@/components/ui/attempt-field";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Plant a decoy: a company with one contact that nobody has a reason to open, or an
 * intake key to leave where an intruder would look. The key comes back once, here.
 */
export function PlantDecoyForm({
  action,
  suggestions,
  disabled,
}: {
  action: Action;
  suggestions: readonly string[];
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [kind, setKind] = useState<"company" | "api_key">("company");
  const minted = state.status === "sent" && Boolean(state.secret);
  const off = isPending || disabled;
  return (
    <>
      <form className="stack-form stack-form--tight" action={formAction}>
        <AttemptField state={state} />
        <Field id="decoy-kind" label="What to plant">
          <Select
            id="decoy-kind"
            name="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value === "api_key" ? "api_key" : "company")}
            disabled={off}
          >
            <option value="company">A company with one contact</option>
            <option value="api_key">An intake key</option>
          </Select>
        </Field>
        {kind === "company" ? (
          <>
            <Field
              id="decoy-firm"
              label="Firm name"
              hint="Invented — never a real firm. Pick one or type your own."
            >
              <Input
                id="decoy-firm"
                name="firm_name"
                list="decoy-firms"
                defaultValue={suggestions[0] ?? ""}
                maxLength={200}
                required
                disabled={off}
              />
              <datalist id="decoy-firms">
                {suggestions.map((firm) => (
                  <option key={firm} value={firm} />
                ))}
              </datalist>
            </Field>
            <Field id="decoy-contact" label="Contact's name">
              <Input
                id="decoy-contact"
                name="contact_name"
                defaultValue="Ruth Ellery"
                maxLength={160}
                required
                disabled={off}
              />
            </Field>
            <Field
              id="decoy-email"
              label="Contact's email"
              hint="An address you watch, such as yours with +decoy. Mail arriving there means a copied list is in use."
            >
              <Input
                id="decoy-email"
                name="contact_email"
                type="email"
                maxLength={254}
                required
                disabled={off}
              />
            </Field>
          </>
        ) : (
          <Field id="decoy-label" label="Name it as a real key would be named">
            <Input
              id="decoy-label"
              name="label"
              defaultValue="Website intake (legacy)"
              maxLength={120}
              disabled={off}
            />
          </Field>
        )}
        <Button type="submit" disabled={off || minted}>
          {isPending ? "Planting…" : "Plant the decoy"}
        </Button>
        {!minted && <FormFeedback state={state} />}
      </form>
      {minted && (
        <div className="one-time-secret" role="status">
          <p className="one-time-secret__label">{state.message}</p>
          <code className="one-time-secret__value">{state.secret}</code>
          <p className="one-time-secret__hint">
            Put it in an old config file or a wiki page nobody should be reading. Any use of it is
            refused like a bad key, and the owners are told at once.
          </p>
        </div>
      )}
    </>
  );
}
