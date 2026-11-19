"use server";

import { attemptOf, idOf } from "@/components/data/meetings/form-values";
import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/domains";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * The writes of Domains and certificates (ws-notes/duties/spec.md §6.5): add or edit a
 * domain, a hostname, a signing certificate or a security.txt record; release, retire or
 * replace one (each stays listed); read a certificate by its handshake, one or all. Each:
 * the gate, one call to the service, the page refreshed, and a sentence.
 */

const BASE = "/data/registers/domains";
const NOT_HERE: ActionState = { status: "error", message: "That is not here." };

const FIELDS = {
  domain: [
    "name",
    "purpose",
    "registrar",
    "account_holder",
    "expires_on",
    "auto_renew",
    "locked",
    "dns_host",
    "mx",
    "sends_as",
    "dmarc",
    "notes",
  ],
  host: ["hostname", "what", "auto_renew", "typed_not_after"],
  signing: ["name", "platform", "issuer", "issued_on", "expires_on", "kept", "lead_days", "notes"],
  txt: ["hostname", "published_on", "expires_on", "contact", "policy_url"],
} as const;

function fieldsOf(formData: FormData, kind: keyof typeof FIELDS): Record<string, string> {
  const input: Record<string, string> = {};
  for (const name of FIELDS[kind])
    if (formData.has(name)) input[name] = fieldValue(formData, name, 2000);
  return input;
}

function refresh(): void {
  refreshData("/data/registers", BASE);
}

/** The gate, one call, a refresh and a sentence: every write here has that shape. */
async function act(
  formData: FormData,
  call: (by: ReturnType<typeof staffOf>) => Promise<unknown>,
  said: string,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  try {
    await call(staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refresh();
  return sent(said);
}

export async function addDomainAction(_previous: ActionState, formData: FormData) {
  return act(
    formData,
    (by) => api.addDomain(fieldsOf(formData, "domain"), by, attemptOf(formData)),
    "Added.",
  );
}

export async function updateDomainAction(_previous: ActionState, formData: FormData) {
  const domainId = idOf(formData, "domain_id");
  if (!domainId) return NOT_HERE;
  return act(
    formData,
    (by) => api.updateDomain(domainId, fieldsOf(formData, "domain"), by),
    "Saved.",
  );
}

export async function releaseDomainAction(_previous: ActionState, formData: FormData) {
  const domainId = idOf(formData, "domain_id");
  if (!domainId) return NOT_HERE;
  return act(
    formData,
    (by) =>
      api.releaseDomain(
        domainId,
        { on: fieldValue(formData, "on", 10), why: fieldValue(formData, "why", 300) },
        by,
      ),
    "Released. It stays listed.",
  );
}

export async function addHostAction(_previous: ActionState, formData: FormData) {
  return act(
    formData,
    (by) => api.addHost(fieldsOf(formData, "host"), by, attemptOf(formData)),
    "Added. Press Check now to read its certificate.",
  );
}

export async function updateHostAction(_previous: ActionState, formData: FormData) {
  const hostId = idOf(formData, "host_id");
  if (!hostId) return NOT_HERE;
  return act(formData, (by) => api.updateHost(hostId, fieldsOf(formData, "host"), by), "Saved.");
}

export async function checkHostAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const hostId = idOf(formData, "host_id");
  if (!hostId) return NOT_HERE;
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  let said = "Read.";
  try {
    const { host } = await api.checkHost(hostId, staffOf(context));
    said = host.probe?.ok ? "Read." : `Could not be read: ${host.probe?.error ?? "no answer"}.`;
  } catch (error) {
    return refusal(error);
  }
  refresh();
  return sent(said);
}

export async function checkAllAction(_previous: ActionState, formData: FormData) {
  return act(
    formData,
    (by) => api.checkAllHosts(by),
    "Checking each hostname, one at a time. Reload to see them.",
  );
}

export async function retireHostAction(_previous: ActionState, formData: FormData) {
  const hostId = idOf(formData, "host_id");
  if (!hostId) return NOT_HERE;
  return act(formData, (by) => api.retireHost(hostId, by), "Retired. It stays listed.");
}

export async function addSigningAction(_previous: ActionState, formData: FormData) {
  return act(
    formData,
    (by) => api.addSigning(fieldsOf(formData, "signing"), by, attemptOf(formData)),
    "Added.",
  );
}

export async function updateSigningAction(_previous: ActionState, formData: FormData) {
  const certId = idOf(formData, "cert_id");
  if (!certId) return NOT_HERE;
  return act(
    formData,
    (by) => api.updateSigning(certId, fieldsOf(formData, "signing"), by),
    "Saved.",
  );
}

export async function signingReplacedAction(_previous: ActionState, formData: FormData) {
  const certId = idOf(formData, "cert_id");
  if (!certId) return NOT_HERE;
  return act(formData, (by) => api.signingReplaced(certId, by), "Marked as replaced.");
}

export async function addTxtAction(_previous: ActionState, formData: FormData) {
  return act(
    formData,
    (by) => api.addSecurityTxt(fieldsOf(formData, "txt"), by, attemptOf(formData)),
    "Added.",
  );
}

export async function updateTxtAction(_previous: ActionState, formData: FormData) {
  const txtId = idOf(formData, "txt_id");
  if (!txtId) return NOT_HERE;
  return act(
    formData,
    (by) => api.updateSecurityTxt(txtId, fieldsOf(formData, "txt"), by),
    "Saved.",
  );
}

export async function retireTxtAction(_previous: ActionState, formData: FormData) {
  const txtId = idOf(formData, "txt_id");
  if (!txtId) return NOT_HERE;
  return act(formData, (by) => api.retireSecurityTxt(txtId, by), "Retired. It stays listed.");
}
