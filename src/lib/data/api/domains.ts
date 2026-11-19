import "server-only";

import { z } from "zod";

import { flagSchema } from "@/lib/data/api/company";
import { staffSchema } from "@/lib/data/api/replies";
import { ruleLineSchema } from "@/lib/data/api/registers";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * Domains and certificates (ws-notes/duties/spec.md §6.5, §6.6): every row with its expiry
 * (read by the handshake or typed) and its check lines; the rules for certificate lives and
 * security.txt; whether a check is running and whether checking is possible here.
 */

const stamp = {
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
};

export const expirySchema = z.object({
  on: z.string().nullable(),
  source: z.enum(["handshake", "typed"]),
  in_days: z.number().nullable(),
  state: z.enum(["ok", "soon", "overdue", "unknown"]),
});
export type Expiry = z.infer<typeof expirySchema>;

export const domainRowSchema = z.object({
  domain_id: z.string(),
  name: z.string(),
  purpose: z.enum(["main", "product", "mail", "defensive", "other"]),
  registrar: z.string(),
  account_holder: z.string(),
  expires_on: z.string().nullable(),
  auto_renew: flagSchema,
  locked: flagSchema,
  dns_host: z.string(),
  mx: z.string(),
  sends_as: z.array(z.string()),
  dmarc: z.enum(["", "none", "quarantine", "reject"]),
  notes: z.string(),
  released: z.object({ on: z.string(), why: z.string() }).nullable(),
  ...stamp,
  expiry: expirySchema,
  due_from: z.string().nullable(),
  checks: z.array(z.string()),
});
export type DomainRow = z.infer<typeof domainRowSchema>;

export const probeSchema = z.object({
  checked_at: z.string(),
  ok: z.boolean(),
  not_before: z.string().nullable(),
  not_after: z.string().nullable(),
  issuer: z.string(),
  subject: z.string(),
  verified: z.boolean(),
  error: z.string(),
});

export const hostRowSchema = z.object({
  host_id: z.string(),
  hostname: z.string(),
  what: z.string(),
  auto_renew: flagSchema,
  probe: probeSchema.nullable(),
  typed_not_after: z.string().nullable(),
  retired: z.boolean(),
  ...stamp,
  expiry: expirySchema,
  issued_on: z.string().nullable(),
  read_on: z.string().nullable(),
  failed_in_a_row: z.number(),
  checks: z.array(z.string()),
});
export type HostRow = z.infer<typeof hostRowSchema>;

export const signingRowSchema = z.object({
  cert_id: z.string(),
  name: z.string(),
  platform: z.enum(["mac", "windows", "other"]),
  issuer: z.string(),
  issued_on: z.string().nullable(),
  expires_on: z.string(),
  kept: z.string(),
  lead_days: z.number(),
  notes: z.string(),
  replaced: z.boolean(),
  ...stamp,
  expiry: expirySchema,
  due_from: z.string(),
  checks: z.array(z.string()),
});
export type SigningRow = z.infer<typeof signingRowSchema>;

export const securityTxtRowSchema = z.object({
  txt_id: z.string(),
  hostname: z.string(),
  published_on: z.string().nullable(),
  expires_on: z.string(),
  contact: z.string(),
  policy_url: z.string(),
  retired: z.boolean(),
  ...stamp,
  expiry: expirySchema,
  checks: z.array(z.string()),
});
export type SecurityTxtRow = z.infer<typeof securityTxtRowSchema>;

export const jobSchema = z.object({
  job_id: z.string(),
  kind: z.string(),
  detail: z.string(),
  done: z.number(),
  total: z.number(),
  state: z.string(),
});

export const domainsPageSchema = ok.extend({
  domains: z.array(domainRowSchema),
  hosts: z.array(hostRowSchema),
  signing: z.array(signingRowSchema),
  security_txt: z.array(securityTxtRowSchema),
  rules: z.object({
    tls: ruleLineSchema.nullable(),
    signing: ruleLineSchema.nullable(),
    security_txt: ruleLineSchema.nullable(),
  }),
  checking: jobSchema.nullable(),
  prober: z.boolean(),
  today: z.string(),
});
export type DomainsPage = z.infer<typeof domainsPageSchema>;

export const readDomains = () => dataAsk(domainsPageSchema, "GET", "/data/domains");

type Fields = Record<string, string>;

export const addDomain = (input: Fields, by: Staff, attempt: string) =>
  dataAsk(ok.extend({ domain: domainRowSchema }), "POST", "/data/domains", {
    ...input,
    by,
    attempt,
  });

export const updateDomain = (domainId: string, input: Fields, by: Staff) =>
  dataAsk(ok.extend({ domain: domainRowSchema }), "POST", `/data/domains/${id(domainId)}/update`, {
    ...input,
    by,
  });

export const releaseDomain = (domainId: string, input: { on: string; why: string }, by: Staff) =>
  dataAsk(ok.extend({ domain: domainRowSchema }), "POST", `/data/domains/${id(domainId)}/release`, {
    ...input,
    by,
  });

export const addHost = (input: Fields, by: Staff, attempt: string) =>
  dataAsk(ok.extend({ host: hostRowSchema }), "POST", "/data/domains/hosts", {
    ...input,
    by,
    attempt,
  });

export const updateHost = (hostId: string, input: Fields, by: Staff) =>
  dataAsk(ok.extend({ host: hostRowSchema }), "POST", `/data/domains/hosts/${id(hostId)}/update`, {
    ...input,
    by,
  });

export const checkHost = (hostId: string, by: Staff) =>
  dataAsk(ok.extend({ host: hostRowSchema }), "POST", `/data/domains/hosts/${id(hostId)}/check`, {
    by,
  });

export const checkAllHosts = (by: Staff) =>
  dataAsk(ok.extend({ checking: jobSchema.nullable() }), "POST", "/data/domains/hosts/check-all", {
    by,
  });

export const retireHost = (hostId: string, by: Staff) =>
  dataAsk(ok.extend({ host: hostRowSchema }), "POST", `/data/domains/hosts/${id(hostId)}/retire`, {
    by,
  });

export const addSigning = (input: Fields, by: Staff, attempt: string) =>
  dataAsk(ok.extend({ signing: signingRowSchema }), "POST", "/data/domains/signing", {
    ...input,
    by,
    attempt,
  });

export const updateSigning = (certId: string, input: Fields, by: Staff) =>
  dataAsk(
    ok.extend({ signing: signingRowSchema }),
    "POST",
    `/data/domains/signing/${id(certId)}/update`,
    { ...input, by },
  );

export const signingReplaced = (certId: string, by: Staff) =>
  dataAsk(
    ok.extend({ signing: signingRowSchema }),
    "POST",
    `/data/domains/signing/${id(certId)}/replaced`,
    { by },
  );

export const addSecurityTxt = (input: Fields, by: Staff, attempt: string) =>
  dataAsk(ok.extend({ security_txt: securityTxtRowSchema }), "POST", "/data/domains/security-txt", {
    ...input,
    by,
    attempt,
  });

export const updateSecurityTxt = (txtId: string, input: Fields, by: Staff) =>
  dataAsk(
    ok.extend({ security_txt: securityTxtRowSchema }),
    "POST",
    `/data/domains/security-txt/${id(txtId)}/update`,
    { ...input, by },
  );

export const retireSecurityTxt = (txtId: string, by: Staff) =>
  dataAsk(
    ok.extend({ security_txt: securityTxtRowSchema }),
    "POST",
    `/data/domains/security-txt/${id(txtId)}/retire`,
    { by },
  );
