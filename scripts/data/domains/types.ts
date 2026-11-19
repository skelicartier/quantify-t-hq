/**
 * Domains and certificates (ws-notes/duties/spec.md §6.5): the company's domains, the public
 * hostnames whose website certificates are read by a handshake, the signing certificates
 * the app is signed with, and each `security.txt` with its Expires line. On disk under
 * `data/domains/`. Never a registrar password, a PIN or a private key.
 */

import type { Flag } from "../company-contracts";
import type { Staff } from "../protocol";

export type Stamp = {
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
};

export type Domain = Stamp & {
  domain_id: string;
  /** "walk.example": lower case, no scheme, no path. */
  name: string;
  purpose: "main" | "product" | "mail" | "defensive" | "other";
  registrar: string;
  /** Who holds the registrar login: a name. Never a password. */
  account_holder: string;
  expires_on: string | null;
  auto_renew: Flag;
  locked: Flag;
  dns_host: string;
  /** Who handles its mail, as he types it; "" for none. */
  mx: string;
  /** Which services send mail as it, as he types them. */
  sends_as: string[];
  dmarc: "" | "none" | "quarantine" | "reject";
  notes: string;
  /** Let go, sold or lapsed on purpose: it stays listed. */
  released: { on: string; why: string } | null;
};

/** What one handshake read. */
export type Probe = {
  checked_at: string;
  ok: boolean;
  /** Instants, from the certificate; null when it could not be read. */
  not_before: string | null;
  not_after: string | null;
  issuer: string;
  subject: string;
  /** The chain verified against this Mac's roots. */
  verified: boolean;
  /** "Could not connect", "No certificate was offered", "Timed out after 8 seconds". */
  error: string;
};

export type Host = Stamp & {
  host_id: string;
  /** "www.walk.example": the name the certificate is read from, on port 443. */
  hostname: string;
  what: string;
  auto_renew: Flag;
  /** The last handshake. */
  probe: Probe | null;
  /** The expiry he types when the name cannot be reached from this Mac: a calendar day. */
  typed_not_after: string | null;
  retired: boolean;
};

export type SigningCertificate = Stamp & {
  cert_id: string;
  /** As he names it: "Mac developer ID", "Windows signing certificate". */
  name: string;
  platform: "mac" | "windows" | "other";
  issuer: string;
  issued_on: string | null;
  expires_on: string;
  /** Where it is kept (a token in the safe): never its PIN or password. */
  kept: string;
  /** Days before expiry it enters Due: 7 to 180, 45 by default. */
  lead_days: number;
  notes: string;
  replaced: boolean;
};

export type SecurityTxt = Stamp & {
  txt_id: string;
  hostname: string;
  published_on: string | null;
  expires_on: string;
  contact: string;
  policy_url: string;
  retired: boolean;
};

/** One line of `probes.jsonl`: which host, when, what came back. */
export type ProbeLine = { host_id: string; at: string; probe: Probe };

export type DomainsEvent = {
  event_id: string;
  target: "domain" | "host" | "signing" | "security_txt";
  id: string;
  verb: string;
  /** Field names in words, never their values. */
  detail: string;
  by: Staff;
  at: string;
};

/** A thing's expiry as a row carries it. */
export type Expiry = {
  on: string | null;
  source: "handshake" | "typed";
  in_days: number | null;
  state: "ok" | "soon" | "overdue" | "unknown";
};

/** What the Registers Summary and the overview's block ask of each register. */
export type RegisterSummary = {
  records: number;
  open: number;
  report_due: number;
  next: { title: string; on: string } | null;
};
