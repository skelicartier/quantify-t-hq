"use client";

import { useSyncExternalStore } from "react";

/**
 * The browser side of a passkey ceremony: base64url in and out of the ArrayBuffers the
 * WebAuthn API speaks, and the shape the service's options take. No secret ever touches
 * this code; it moves bytes between the authenticator and the form that posts them.
 */

export function toBuffer(text: string): ArrayBuffer {
  const padded =
    text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

export function fromBuffer(buffer: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function passkeysSupported(): boolean {
  return (
    typeof window !== "undefined" && "PublicKeyCredential" in window && !!navigator.credentials
  );
}

const subscribeNever = () => () => {};

/**
 * null while the server renders and the client hydrates, then the browser's answer. The
 * server cannot know the browser, and the first client render must match what it sent.
 */
export function usePasskeySupport(): boolean | null {
  return useSyncExternalStore(subscribeNever, passkeysSupported, () => null);
}

export type AssertionOptions = {
  challenge: string;
  rp_id: string;
  allow_credentials: { type: string; id: string; transports: string[] }[];
  user_verification: string;
  timeout_ms: number;
};

export type CreationOptions = {
  challenge: string;
  rp: { id: string; name: string };
  user: { id: string; name: string; display_name: string };
  pub_key_cred_params: { type: string; alg: number }[];
  exclude_credentials: { type: string; id: string }[];
  authenticator_selection: { residentKey: string; userVerification: string };
  attestation: string;
  timeout_ms: number;
};

/** Ask the authenticator to prove a known credential. */
export async function getAssertion(options: AssertionOptions) {
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: toBuffer(options.challenge),
      rpId: options.rp_id,
      allowCredentials: options.allow_credentials.map((entry) => ({
        type: "public-key" as const,
        id: toBuffer(entry.id),
        transports: entry.transports as AuthenticatorTransport[],
      })),
      userVerification: options.user_verification as UserVerificationRequirement,
      timeout: options.timeout_ms,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("No passkey was offered.");
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    credential_id: fromBuffer(credential.rawId),
    client_data_json: fromBuffer(response.clientDataJSON),
    authenticator_data: fromBuffer(response.authenticatorData),
    signature: fromBuffer(response.signature),
  };
}

/** Ask the authenticator to make a new credential for this account. */
export async function createCredential(options: CreationOptions) {
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: toBuffer(options.challenge),
      rp: { id: options.rp.id, name: options.rp.name },
      user: {
        id: toBuffer(options.user.id),
        name: options.user.name,
        displayName: options.user.display_name,
      },
      pubKeyCredParams: options.pub_key_cred_params.map((param) => ({
        type: "public-key" as const,
        alg: param.alg,
      })),
      excludeCredentials: options.exclude_credentials.map((entry) => ({
        type: "public-key" as const,
        id: toBuffer(entry.id),
      })),
      authenticatorSelection: {
        residentKey: options.authenticator_selection.residentKey as ResidentKeyRequirement,
        userVerification: options.authenticator_selection
          .userVerification as UserVerificationRequirement,
      },
      attestation: options.attestation as AttestationConveyancePreference,
      timeout: options.timeout_ms,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("No passkey was made.");
  const response = credential.response as AuthenticatorAttestationResponse;
  const transports = typeof response.getTransports === "function" ? response.getTransports() : [];
  return {
    client_data_json: fromBuffer(response.clientDataJSON),
    attestation_object: fromBuffer(response.attestationObject),
    transports,
  };
}
