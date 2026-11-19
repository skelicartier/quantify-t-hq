/**
 * The domains book (ws-notes/duties/spec.md §6.5): `domains/domains.json` (domains, hosts,
 * signing certificates, `security.txt` records), `domains/events.jsonl` (one line per change,
 * field names and never values) and `domains/probes.jsonl` (one line per handshake: host,
 * instant, outcome, the dates read; the last 50 per host kept at load). Nothing is deleted:
 * a domain is released, a host and a `security.txt` retired, a certificate replaced.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import type { Flag } from "../company-contracts";
import type { DataCore } from "../core";
import { clean, cleanText, isDay } from "../guard";
import type { Staff } from "../protocol";
import { httpsLinkOf } from "../raise-contracts";
import { LIMIT, PIN, SAY, publicHostname, tooMany } from "./limits";
import type {
  Domain,
  DomainsEvent,
  Host,
  Probe,
  ProbeLine,
  SecurityTxt,
  SigningCertificate,
  Stamp,
} from "./types";

const DOMAINS = "domains/domains.json";
const EVENTS = "domains/events.jsonl";
const PROBES = "domains/probes.jsonl";

type Input = Record<string, unknown>;

const FLAGS = new Set<string>(["yes", "no", ""]);
const PURPOSES = new Set<string>(["main", "product", "mail", "defensive", "other"]);
const DMARC = new Set<string>(["", "none", "quarantine", "reject"]);
const PLATFORMS = new Set<string>(["mac", "windows", "other"]);

const has = (input: Input, name: string) => Object.prototype.hasOwnProperty.call(input, name);
const listOf = <T>(value: unknown, keep: (item: T) => boolean): T[] =>
  Array.isArray(value) ? (value as T[]).filter((item) => item && keep(item)) : [];

const WORDS: Record<string, string> = {
  name: "Name",
  purpose: "What it is for",
  registrar: "Registrar",
  account_holder: "Login held by",
  expires_on: "Expires",
  auto_renew: "Auto-renew",
  locked: "Registrar lock",
  dns_host: "DNS",
  mx: "Mail",
  sends_as: "Sends as",
  dmarc: "DMARC",
  notes: "Notes",
  hostname: "Hostname",
  what: "What it is",
  typed_not_after: "Expiry typed",
  platform: "Platform",
  issuer: "Issuer",
  issued_on: "Issued",
  kept: "Where it is kept",
  lead_days: "Days into Due",
  published_on: "Published",
  contact: "Contact",
  policy_url: "Policy",
};

/** Names the fields that differ, in words; never their values. */
function changed(before: object, after: object): string {
  const a = before as Record<string, unknown>;
  const b = after as Record<string, unknown>;
  const keys = Object.keys(WORDS).filter(
    (key) => key in b && JSON.stringify(a[key]) !== JSON.stringify(b[key]),
  );
  return keys.length ? keys.map((key) => WORDS[key] ?? key).join(", ") : "Nothing";
}

export class DomainsBook {
  readonly #core: DataCore;
  domains: Domain[];
  hosts: Host[];
  signing: SigningCertificate[];
  securityTxt: SecurityTxt[];
  /** The last handshakes per host, oldest first. */
  probes = new Map<string, ProbeLine[]>();

  constructor(core: DataCore) {
    this.#core = core;
    core.store.ensureDir("domains");
    const stored = core.store.readJson<Record<string, unknown>>(DOMAINS, {});
    this.domains = listOf<Domain>(stored.domains, (item) => typeof item.domain_id === "string");
    this.hosts = listOf<Host>(stored.hosts, (item) => typeof item.host_id === "string");
    this.signing = listOf<SigningCertificate>(
      stored.signing,
      (item) => typeof item.cert_id === "string" && isDay(item.expires_on),
    );
    this.securityTxt = listOf<SecurityTxt>(
      stored.security_txt,
      (item) => typeof item.txt_id === "string" && isDay(item.expires_on),
    );
    const lines = core.store
      .readLines<ProbeLine>(PROBES)
      .filter((line) => typeof line?.host_id === "string" && line.probe);
    for (const line of lines) {
      const list = this.probes.get(line.host_id) ?? [];
      list.push(line);
      this.probes.set(line.host_id, list);
    }
    let trimmed = false;
    for (const [hostId, list] of this.probes)
      if (list.length > LIMIT.probes_kept) {
        this.probes.set(hostId, list.slice(-LIMIT.probes_kept));
        trimmed = true;
      }
    if (trimmed)
      core.store.writeText(
        PROBES,
        [...this.probes.values()]
          .flat()
          .sort((a, b) => a.at.localeCompare(b.at))
          .map((line) => `${JSON.stringify(line)}\n`)
          .join(""),
      );
  }

  // ---------------------------------------------------------------- storing

  #save(): void {
    this.#core.store.writeJson(DOMAINS, {
      format: 1,
      domains: this.domains,
      hosts: this.hosts,
      signing: this.signing,
      security_txt: this.securityTxt,
    });
  }

  log(target: DomainsEvent["target"], id: string, verb: string, detail: string, by: Staff): void {
    const line: DomainsEvent = {
      event_id: randomUUID(),
      target,
      id,
      verb,
      detail,
      by,
      at: this.#core.now(),
    };
    this.#core.store.appendLine(EVENTS, line);
  }

  events(limit = 50): DomainsEvent[] {
    return this.#core.store
      .readLines<DomainsEvent>(EVENTS)
      .filter((event) => typeof event?.event_id === "string")
      .reverse()
      .slice(0, limit);
  }

  #stamp(by: Staff): Stamp {
    const now = this.#core.now();
    return { created_at: now, created_by: by, updated_at: now, updated_by: by };
  }

  #touch(record: Stamp, by: Staff): void {
    record.updated_at = this.#core.now();
    record.updated_by = by;
    this.#save();
  }

  // ---------------------------------------------------------------- reading inputs

  #text(value: unknown, limit: number = LIMIT.text): string {
    return cleanText(value, limit);
  }

  /** A field that might attract a password: refused when it holds one. */
  #guarded(value: unknown, limit: number): string {
    const text = cleanText(value, limit);
    if (PIN.test(text)) throw new Refused(400, "invalid", SAY.pin);
    return text;
  }

  #flag(value: unknown): Flag {
    const flag = clean(value, 4);
    if (!FLAGS.has(flag)) throw new Refused(400, "invalid", SAY.flag);
    return flag as Flag;
  }

  #day(value: unknown, { past = false, required = false } = {}): string | null {
    const day = clean(value, 10);
    if (!day) {
      if (required) throw new Refused(400, "invalid", SAY.expires);
      return null;
    }
    if (!isDay(day)) throw new Refused(400, "invalid", SAY.notADay);
    if (past && day > this.#core.day()) throw new Refused(400, "invalid", SAY.future);
    return day;
  }

  #sendsAs(value: unknown): string[] {
    const items = (Array.isArray(value) ? value : String(value ?? "").split(/[,\n]/))
      .map((item) => cleanText(item, 200))
      .filter(Boolean);
    if (items.length > LIMIT.sends_as || items.some((item) => item.length > LIMIT.sends_as_item))
      throw new Refused(400, "invalid", SAY.sendsAs);
    return items;
  }

  #leadDays(value: unknown): number {
    const text = clean(value, 6);
    if (!text) return LIMIT.lead_default;
    const days = /^\d+$/.test(text) ? Number(text) : NaN;
    if (!Number.isInteger(days) || days < LIMIT.lead_min || days > LIMIT.lead_max)
      throw new Refused(400, "invalid", SAY.lead);
    return days;
  }

  // ---------------------------------------------------------------- domains

  domain(id: string | undefined): Domain {
    const found = id ? this.domains.find((item) => item.domain_id === id) : undefined;
    if (!found) throw new Refused(404, "not_found", SAY.domain);
    return found;
  }

  #domainFields(input: Input, base: Domain | null) {
    const pick = <K extends keyof Domain>(key: K, read: (value: unknown) => Domain[K]) =>
      has(input, key) ? read(input[key]) : base ? base[key] : read(undefined);
    const name = pick("name", (value) => publicHostname(value));
    if (this.domains.some((item) => item.name === name && item.domain_id !== base?.domain_id))
      throw new Refused(409, "name_taken", SAY.domainTaken);
    const purpose = pick("purpose", (value) => {
      const text = clean(value, 12) || "main";
      if (!PURPOSES.has(text)) throw new Refused(400, "invalid", SAY.purpose);
      return text as Domain["purpose"];
    });
    const dmarc = pick("dmarc", (value) => {
      const text = clean(value, 12);
      if (!DMARC.has(text)) throw new Refused(400, "invalid", SAY.dmarc);
      return text as Domain["dmarc"];
    });
    return {
      name,
      purpose,
      registrar: pick("registrar", (value) => this.#text(value)),
      account_holder: pick("account_holder", (value) => this.#guarded(value, LIMIT.text)),
      expires_on: pick("expires_on", (value) => this.#day(value)),
      auto_renew: pick("auto_renew", (value) => this.#flag(value)),
      locked: pick("locked", (value) => this.#flag(value)),
      dns_host: pick("dns_host", (value) => this.#text(value)),
      mx: pick("mx", (value) => this.#text(value)),
      sends_as: pick("sends_as", (value) => this.#sendsAs(value)),
      dmarc,
      notes: pick("notes", (value) => this.#guarded(value, LIMIT.notes)),
    };
  }

  addDomain(input: Input, by: Staff): Domain {
    if (this.domains.length >= LIMIT.domains)
      throw new Refused(409, "too_many", tooMany(LIMIT.domains));
    const domain: Domain = {
      domain_id: randomUUID(),
      ...this.#domainFields(input, null),
      released: null,
      ...this.#stamp(by),
    };
    this.domains.push(domain);
    this.#save();
    this.log("domain", domain.domain_id, "added", "", by);
    return domain;
  }

  updateDomain(domain: Domain, input: Input, by: Staff): Domain {
    const fields = this.#domainFields(input, domain);
    const detail = changed(domain, fields);
    Object.assign(domain, fields);
    this.#touch(domain, by);
    this.log("domain", domain.domain_id, "changed", detail, by);
    return domain;
  }

  releaseDomain(domain: Domain, input: Input, by: Staff): Domain {
    if (domain.released) throw new Refused(409, "invalid", SAY.released);
    const on = this.#day(input.on, { past: true }) ?? this.#core.day();
    const why = cleanText(input.why, LIMIT.why);
    if (why.length < 2) throw new Refused(400, "invalid", SAY.why);
    domain.released = { on, why };
    this.#touch(domain, by);
    this.log("domain", domain.domain_id, "released", "", by);
    return domain;
  }

  // ---------------------------------------------------------------- hosts

  host(id: string | undefined): Host {
    const found = id ? this.hosts.find((item) => item.host_id === id) : undefined;
    if (!found) throw new Refused(404, "not_found", SAY.host);
    return found;
  }

  #hostFields(input: Input, base: Host | null) {
    const hostname = has(input, "hostname")
      ? publicHostname(input.hostname)
      : (base?.hostname ?? publicHostname(""));
    if (
      this.hosts.some(
        (item) => !item.retired && item.hostname === hostname && item.host_id !== base?.host_id,
      )
    )
      throw new Refused(409, "name_taken", SAY.hostTaken);
    return {
      hostname,
      what: has(input, "what") ? this.#text(input.what) : (base?.what ?? ""),
      auto_renew: has(input, "auto_renew")
        ? this.#flag(input.auto_renew)
        : (base?.auto_renew ?? ""),
      typed_not_after: has(input, "typed_not_after")
        ? this.#day(input.typed_not_after)
        : (base?.typed_not_after ?? null),
    };
  }

  addHost(input: Input, by: Staff): Host {
    if (this.hosts.length >= LIMIT.hosts) throw new Refused(409, "too_many", tooMany(LIMIT.hosts));
    const host: Host = {
      host_id: randomUUID(),
      ...this.#hostFields(input, null),
      probe: null,
      retired: false,
      ...this.#stamp(by),
    };
    this.hosts.push(host);
    this.#save();
    this.log("host", host.host_id, "added", "", by);
    return host;
  }

  updateHost(host: Host, input: Input, by: Staff): Host {
    const fields = this.#hostFields(input, host);
    const detail = changed(host, fields);
    Object.assign(host, fields);
    this.#touch(host, by);
    this.log("host", host.host_id, "changed", detail, by);
    return host;
  }

  retireHost(host: Host, by: Staff): Host {
    if (host.retired) throw new Refused(409, "invalid", SAY.retired);
    host.retired = true;
    this.#touch(host, by);
    this.log("host", host.host_id, "retired", "", by);
    return host;
  }

  /** Keeps a handshake's outcome: on the host, and as one line of the probe log. */
  recordProbe(host: Host, probe: Probe): Host {
    host.probe = probe;
    this.#save();
    const line: ProbeLine = { host_id: host.host_id, at: probe.checked_at, probe };
    this.#core.store.appendLine(PROBES, line);
    const list = [...(this.probes.get(host.host_id) ?? []), line].slice(-LIMIT.probes_kept);
    this.probes.set(host.host_id, list);
    return host;
  }

  /** How many handshakes in a row, the latest first, could not read the certificate. */
  failedInARow(hostId: string): number {
    const list = this.probes.get(hostId) ?? [];
    let count = 0;
    for (let index = list.length - 1; index >= 0; index -= 1) {
      if (list[index]?.probe.ok) break;
      count += 1;
    }
    return count;
  }

  // ---------------------------------------------------------------- signing certificates

  cert(id: string | undefined): SigningCertificate {
    const found = id ? this.signing.find((item) => item.cert_id === id) : undefined;
    if (!found) throw new Refused(404, "not_found", SAY.signing);
    return found;
  }

  #signingFields(input: Input, base: SigningCertificate | null) {
    const name = has(input, "name") ? this.#text(input.name) : (base?.name ?? "");
    if (!name) throw new Refused(400, "invalid", SAY.name);
    const platform = has(input, "platform") ? clean(input.platform, 10) : (base?.platform ?? "");
    if (!PLATFORMS.has(platform)) throw new Refused(400, "invalid", SAY.platform);
    const issuedOn = has(input, "issued_on")
      ? this.#day(input.issued_on, { past: true })
      : (base?.issued_on ?? null);
    const expiresOn = has(input, "expires_on")
      ? this.#day(input.expires_on, { required: true })!
      : (base?.expires_on ?? this.#day("", { required: true })!);
    if (issuedOn && expiresOn < issuedOn) throw new Refused(400, "invalid", SAY.issuedAfter);
    return {
      name,
      platform: platform as SigningCertificate["platform"],
      issuer: has(input, "issuer") ? this.#text(input.issuer) : (base?.issuer ?? ""),
      issued_on: issuedOn,
      expires_on: expiresOn,
      kept: has(input, "kept") ? this.#guarded(input.kept, LIMIT.text) : (base?.kept ?? ""),
      lead_days: has(input, "lead_days")
        ? this.#leadDays(input.lead_days)
        : (base?.lead_days ?? LIMIT.lead_default),
      notes: has(input, "notes") ? this.#guarded(input.notes, LIMIT.notes) : (base?.notes ?? ""),
    };
  }

  addSigning(input: Input, by: Staff): SigningCertificate {
    if (this.signing.length >= LIMIT.signing)
      throw new Refused(409, "too_many", tooMany(LIMIT.signing));
    const cert: SigningCertificate = {
      cert_id: randomUUID(),
      ...this.#signingFields(input, null),
      replaced: false,
      ...this.#stamp(by),
    };
    this.signing.push(cert);
    this.#save();
    this.log("signing", cert.cert_id, "added", "", by);
    return cert;
  }

  updateSigning(cert: SigningCertificate, input: Input, by: Staff): SigningCertificate {
    const fields = this.#signingFields(input, cert);
    const detail = changed(cert, fields);
    Object.assign(cert, fields);
    this.#touch(cert, by);
    this.log("signing", cert.cert_id, "changed", detail, by);
    return cert;
  }

  replaced(cert: SigningCertificate, by: Staff): SigningCertificate {
    if (cert.replaced) throw new Refused(409, "invalid", SAY.replaced);
    cert.replaced = true;
    this.#touch(cert, by);
    this.log("signing", cert.cert_id, "replaced", "", by);
    return cert;
  }

  // ---------------------------------------------------------------- security.txt

  txt(id: string | undefined): SecurityTxt {
    const found = id ? this.securityTxt.find((item) => item.txt_id === id) : undefined;
    if (!found) throw new Refused(404, "not_found", SAY.txt);
    return found;
  }

  #txtFields(input: Input, base: SecurityTxt | null) {
    const hostname = has(input, "hostname")
      ? publicHostname(input.hostname)
      : (base?.hostname ?? publicHostname(""));
    const publishedOn = has(input, "published_on")
      ? this.#day(input.published_on, { past: true })
      : (base?.published_on ?? null);
    const expiresOn = has(input, "expires_on")
      ? this.#day(input.expires_on, { required: true })!
      : (base?.expires_on ?? this.#day("", { required: true })!);
    if (publishedOn && expiresOn < publishedOn)
      throw new Refused(400, "invalid", SAY.publishedAfter);
    let policy = base?.policy_url ?? "";
    if (has(input, "policy_url")) {
      const text = clean(input.policy_url, 600);
      if (!text) policy = "";
      else {
        const link = httpsLinkOf(text);
        if (!link) throw new Refused(400, "invalid", SAY.policy);
        policy = link;
      }
    }
    return {
      hostname,
      published_on: publishedOn,
      expires_on: expiresOn,
      contact: has(input, "contact")
        ? this.#guarded(input.contact, LIMIT.contact)
        : (base?.contact ?? ""),
      policy_url: policy,
    };
  }

  addTxt(input: Input, by: Staff): SecurityTxt {
    if (this.securityTxt.length >= LIMIT.security_txt)
      throw new Refused(409, "too_many", tooMany(LIMIT.security_txt));
    const txt: SecurityTxt = {
      txt_id: randomUUID(),
      ...this.#txtFields(input, null),
      retired: false,
      ...this.#stamp(by),
    };
    this.securityTxt.push(txt);
    this.#save();
    this.log("security_txt", txt.txt_id, "added", "", by);
    return txt;
  }

  updateTxt(txt: SecurityTxt, input: Input, by: Staff): SecurityTxt {
    const fields = this.#txtFields(input, txt);
    const detail = changed(txt, fields);
    Object.assign(txt, fields);
    this.#touch(txt, by);
    this.log("security_txt", txt.txt_id, "changed", detail, by);
    return txt;
  }

  retireTxt(txt: SecurityTxt, by: Staff): SecurityTxt {
    if (txt.retired) throw new Refused(409, "invalid", SAY.retired);
    txt.retired = true;
    this.#touch(txt, by);
    this.log("security_txt", txt.txt_id, "retired", "", by);
    return txt;
  }
}
