"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input } from "@/components/ui/field";
import {
  createCredential,
  usePasskeySupport,
  type CreationOptions,
} from "@/lib/auth/webauthn-client";

type OptionsResult =
  { ok: true; options: CreationOptions; challenge_token: string } | { ok: false; message: string };
type SaveResult = { ok: true; label: string } | { ok: false; message: string };

/**
 * Add a passkey: name it, let the browser make it, hand the result to the service. The
 * whole thing happens under a fresh sudo, which the page checks before offering the
 * button.
 */
export function AddPasskeyForm({
  fetchOptions,
  save,
  disabled,
}: {
  fetchOptions: () => Promise<OptionsResult>;
  save: (input: {
    challenge_token: string;
    label: string;
    client_data_json: string;
    attestation_object: string;
    transports: string[];
  }) => Promise<SaveResult>;
  disabled: boolean;
}) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "danger" | "success"; text: string } | null>(null);
  const supported = usePasskeySupport();
  if (supported === false) {
    return <p className="muted">This browser cannot make passkeys.</p>;
  }
  const add = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await fetchOptions();
      if (!result.ok) {
        setMessage({ tone: "danger", text: result.message });
        return;
      }
      const made = await createCredential(result.options);
      const saved = await save({
        challenge_token: result.challenge_token,
        label: label.trim() || "Passkey",
        ...made,
      });
      if (!saved.ok) {
        setMessage({ tone: "danger", text: saved.message });
        return;
      }
      setLabel("");
      setMessage({ tone: "success", text: `Added “${saved.label}”.` });
      // The list above is server-rendered; ask for it again so the new row shows.
      router.refresh();
    } catch (error) {
      setMessage({
        tone: "danger",
        text:
          error instanceof Error && error.name === "InvalidStateError"
            ? "This authenticator already holds a passkey for your account."
            : error instanceof Error && error.name === "NotAllowedError"
              ? "The passkey prompt was dismissed."
              : "The passkey could not be made.",
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack-form stack-form--tight">
      <Field id="passkey-label" label="Name it" hint="e.g. Work laptop, Phone.">
        <Input
          id="passkey-label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          maxLength={80}
          disabled={disabled || busy}
        />
      </Field>
      <Button
        type="button"
        size="small"
        onClick={add}
        disabled={disabled || busy || supported === null}
      >
        {busy ? "Waiting for your device…" : "Add a passkey"}
      </Button>
      {message && (
        <Callout tone={message.tone} role="status" compact>
          {message.text}
        </Callout>
      )}
    </div>
  );
}
