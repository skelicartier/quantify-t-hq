"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { getAssertion, usePasskeySupport, type AssertionOptions } from "@/lib/auth/webauthn-client";

type OptionsResult =
  { ok: true; options: AssertionOptions; challenge_token: string } | { ok: false; message: string };

/**
 * "Use a passkey" on the code step. The click asks the service for its challenge, asks
 * the authenticator to answer it, and hands the answer to the server action that opens
 * the session — the same action shape as the code form, so the cookie work stays in one
 * place.
 */
export function PasskeyButton({
  fetchOptions,
  action,
  nextPath,
}: {
  fetchOptions: () => Promise<OptionsResult>;
  action: (formData: FormData) => Promise<void>;
  nextPath: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const supported = usePasskeySupport();
  if (!supported) return null;

  const start = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await fetchOptions();
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      const assertion = await getAssertion(result.options);
      const data = new FormData();
      data.set("next", nextPath);
      data.set("challenge_token", result.challenge_token);
      for (const [name, value] of Object.entries(assertion)) data.set(name, value);
      // The action opens the session and redirects; Next follows that redirect here.
      await action(data);
    } catch (error) {
      setMessage(
        error instanceof Error && error.name === "NotAllowedError"
          ? "The passkey prompt was dismissed."
          : "The passkey could not be used here. Enter your code instead.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth__passkey">
      <Button type="button" block onClick={start} disabled={busy}>
        {busy ? "Waiting for your passkey…" : "Use your passkey"}
      </Button>
      {message && (
        <Callout tone="danger" role="alert" compact className="auth__note">
          {message}
        </Callout>
      )}
      <p className="auth__passkey-or" aria-hidden="true">
        or enter the code
      </p>
    </div>
  );
}
