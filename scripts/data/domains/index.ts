/**
 * Domains and certificates (ws-notes/duties/spec.md §6.5): every domain the company owns,
 * each public hostname with its website certificate (its dates read by a TLS handshake on
 * port 443 from this computer, or typed when the name cannot be reached), the signing
 * certificates the app is signed with, and each `security.txt` with its Expires line.
 *
 * Due rows of kind "domain" from each thing's window; the calendar's `agenda:domains`; search
 * (`search:domains`); the `domains` service (`DomainsLookup`: live domains and signing
 * certificates, for the catalogue). Also the Registers Summary (`GET /data/registers`) and
 * the overview's `registers` block, which ask incidents and trademarks for their counts. The
 * handshake is the only network connection in this batch: never under test routes, where a
 * scripted prober answers instead. Never a registrar password, a PIN or a private key.
 */

import { writeFileSync } from "node:fs";

import { Refused } from "../../mail-merge/engine";
import type { DataCore, DueItem } from "../core";
import { addDays } from "../days";
import {
  DUTIES_SERVICES,
  isDutyRuleKey,
  ruleLineOf,
  standInDutyRules,
  type DomainsLookup,
  type DutyRuleKey,
  type DutyRuleState,
  type DutyRulesService,
  type DutyStored,
  type HolidaysService,
  type RuleLine,
} from "../duties-contracts";
import { clean } from "../guard";
import {
  agendaService,
  searchService,
  type AgendaItem,
  type AgendaSource,
  type SearchSource,
} from "../raise-contracts";
import { toCsv } from "../text";
import { findTerms, matchesTerms } from "../../../src/lib/merge/find";
import { dayWords } from "../../../src/lib/data/labels-company";
import { istParts } from "../../../src/lib/data/labels-duties";
import {
  DMARC_STAGES,
  DOMAIN_PURPOSES,
  EXPIRY_STATES,
  PLATFORMS,
} from "../../../src/lib/data/labels-security";
import { DomainsBook } from "./book";
import {
  TLS_RULES,
  domainChecks,
  domainWindow,
  dueFrom,
  expiryOf,
  hostChecks,
  hostExpiryDay,
  hostWindow,
  lifeCheck,
  securityTxtCheck,
  securityTxtWindow,
  signingWindow,
  type Window,
} from "./clocks";
import { LIMIT, PROBE, SAY } from "./limits";
import { failedProbe, probeHost, type Prober } from "./probe";
import type {
  Domain,
  Host,
  Probe,
  RegisterSummary,
  SecurityTxt,
  SigningCertificate,
} from "./types";
import { WALK_PROBES } from "./walk-seed";

const BOM = "﻿";
const PAGE = "/data/registers/domains";
const FLAG_WORDS = { yes: "on", no: "off", "": "not known" } as const;

/** What the Summary asks of incidents and trademarks: each module's own summary. */
type Summarised = { summary(): RegisterSummary; count(): number };

/** One open thing with a day: a Due row from its window, a calendar item with its reminders. */
type Mark = {
  key: string;
  on: string;
  window: Window;
  title: string;
  sub: string;
  href: string;
};

/** A duty-rules stand-in carries this mark, so any of the registers' test routes may replace it. */
const STAND_IN = Symbol.for("hq.duties.duty-rules.stand-in");

function storedOf(raw: unknown): Partial<Record<DutyRuleKey, DutyStored>> {
  const stored: Partial<Record<DutyRuleKey, DutyStored>> = {};
  if (!raw || typeof raw !== "object") return stored;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isDutyRuleKey(key) || !value || typeof value !== "object") continue;
    const record = value as Record<string, unknown>;
    const item: DutyStored = {};
    if (typeof record.amount === "number" && Number.isFinite(record.amount))
      item.amount = record.amount;
    if (typeof record.reading === "number" && Number.isInteger(record.reading))
      item.reading = record.reading;
    const confirmed = record.confirmed as Record<string, unknown> | undefined;
    if (confirmed && typeof confirmed.name === "string" && typeof confirmed.on === "string")
      item.confirmed = { name: confirmed.name, on: confirmed.on };
    stored[key] = item;
  }
  return stored;
}

export async function register(core: DataCore): Promise<void> {
  const book = new DomainsBook(core);

  function safely<T>(ask: () => T): T | null {
    try {
      return ask();
    } catch (error) {
      core.log(`domains: a lookup failed: ${error instanceof Error ? error.name : "error"}`);
      return null;
    }
  }

  const rules = () => core.need<DutyRulesService>(DUTIES_SERVICES.dutyRules);
  const stateOf = (key: DutyRuleKey, on?: string): DutyRuleState | null =>
    safely(() => rules()?.state(key, on) ?? null);
  const lineOf = (key: DutyRuleKey): RuleLine | null => {
    const state = stateOf(key);
    return state ? ruleLineOf(state) : null;
  };
  const askRule = () => {
    const service = rules();
    return service ? (key: DutyRuleKey, on: string) => service.state(key, on) : null;
  };

  // ---------------------------------------------------------------- the prober

  /** Under test routes the real prober is never called: a scripted one, when installed. */
  let scripted: Record<string, Omit<Probe, "checked_at">> | null = null;
  const prober = (): Prober | null => {
    if (!core.testRoutes) return probeHost;
    if (!scripted) return null;
    const answers = scripted;
    return async (hostname) => {
      const answer = answers[hostname];
      return answer
        ? { ...answer, checked_at: core.now() }
        : failedProbe("Could not connect", core.now());
    };
  };

  const checkOne = async (host: Host, probe: Prober): Promise<Host> =>
    book.recordProbe(host, await probe(host.hostname));

  /** One host at a time, as a job the page shows; eight seconds each at most. */
  const checkAll = (hosts: Host[], probe: Prober) => {
    const job = core.startJob("host_check", hosts.length, "Reading the certificates");
    void (async () => {
      try {
        for (const host of hosts) {
          try {
            await checkOne(host, probe);
          } catch (error) {
            core.log(`domains: a check failed: ${error instanceof Error ? error.name : "error"}`);
          }
          job.advance();
          await core.yield();
        }
        job.finish();
      } catch {
        job.fail("The check stopped.");
      }
    })();
    return job;
  };

  /** Once a day by itself, for a host last read over 24 hours ago. Never under test routes. */
  let timerStarted = false;
  if (!core.testRoutes) {
    const daily = () => {
      if (core.state === "stopped" || core.jobs("host_check").length > 0) return;
      const cutoff = Date.now() - PROBE.stale_ms;
      const stale = book.hosts.filter(
        (host) => !host.retired && (!host.probe || Date.parse(host.probe.checked_at) < cutoff),
      );
      if (stale.length > 0) checkAll(stale, probeHost);
    };
    const first = setTimeout(daily, PROBE.first_after_ms);
    first.unref();
    const every = setInterval(daily, PROBE.every_ms);
    every.unref();
    timerStarted = true;
  }

  // ---------------------------------------------------------------- rows

  const today = () => core.day();

  const domainRow = (domain: Domain, on: string) => ({
    ...domain,
    expiry: expiryOf(domain.expires_on, "typed", on, domainWindow(domain)),
    due_from: domain.expires_on ? dueFrom(domain.expires_on, domainWindow(domain)) : null,
    checks: domainChecks(domain),
  });

  const hostRow = (host: Host, on: string) => {
    const expiry = hostExpiryDay(host);
    const issuedOn =
      host.probe?.ok && host.probe.not_before ? istParts(host.probe.not_before).day : null;
    const life =
      expiry.source === "handshake" ? lifeCheck(issuedOn, expiry.on, TLS_RULES, askRule()) : null;
    return {
      ...host,
      expiry: expiryOf(expiry.on, expiry.source, on, hostWindow(host)),
      issued_on: issuedOn,
      read_on: host.probe ? istParts(host.probe.checked_at).day : null,
      failed_in_a_row: book.failedInARow(host.host_id),
      checks: hostChecks(host, life),
    };
  };

  const signingRow = (cert: SigningCertificate, on: string) => {
    const life = lifeCheck(cert.issued_on, cert.expires_on, ["signing-life"], askRule());
    return {
      ...cert,
      expiry: expiryOf(cert.expires_on, "typed", on, signingWindow(cert)),
      due_from: dueFrom(cert.expires_on, signingWindow(cert)),
      checks: life ? [life] : [],
    };
  };

  const txtRow = (txt: SecurityTxt, on: string) => {
    const check = securityTxtCheck(txt, stateOf("security-txt-expires", txt.published_on ?? on));
    return {
      ...txt,
      expiry: expiryOf(txt.expires_on, "typed", on, securityTxtWindow()),
      checks: check ? [check] : [],
    };
  };

  // ---------------------------------------------------------------- Due and the agenda

  const marks = (): Mark[] => {
    const list: Mark[] = [];
    for (const domain of book.domains) {
      if (domain.released || !domain.expires_on) continue;
      list.push({
        key: `domain:domain:${domain.domain_id}`,
        on: domain.expires_on,
        window: domainWindow(domain),
        title: `Renew ${domain.name}`,
        sub: `${domain.registrar || "Registrar not recorded"} · auto-renew ${FLAG_WORDS[domain.auto_renew]}`,
        href: `${PAGE}#domain-${domain.domain_id}`,
      });
    }
    for (const host of book.hosts) {
      if (host.retired) continue;
      const expiry = hostExpiryDay(host);
      if (!expiry.on) continue;
      list.push({
        key: `domain:host:${host.host_id}`,
        on: expiry.on,
        window: hostWindow(host),
        title: `Renew the certificate for ${host.hostname}`,
        sub:
          expiry.source === "handshake" && host.probe
            ? `${host.probe.issuer || "Issuer not read"} · read ${dayWords(istParts(host.probe.checked_at).day)}`
            : "typed",
        href: `${PAGE}#host-${host.host_id}`,
      });
    }
    for (const cert of book.signing) {
      if (cert.replaced) continue;
      list.push({
        key: `domain:signing:${cert.cert_id}`,
        on: cert.expires_on,
        window: signingWindow(cert),
        title: `Renew ${cert.name}`,
        sub: `${PLATFORMS[cert.platform]} · kept ${cert.kept || "where, not recorded"}`,
        href: `${PAGE}#signing-${cert.cert_id}`,
      });
    }
    for (const txt of book.securityTxt) {
      if (txt.retired) continue;
      list.push({
        key: `domain:txt:${txt.txt_id}`,
        on: txt.expires_on,
        window: securityTxtWindow(),
        title: `Renew security.txt on ${txt.hostname}`,
        sub: "The Expires line",
        href: `${PAGE}#txt-${txt.txt_id}`,
      });
    }
    return list;
  };

  const dueItems = (): DueItem[] => {
    const on = today();
    const items: DueItem[] = marks()
      .filter((mark) => on >= dueFrom(mark.on, mark.window))
      .map((mark) => ({
        key: mark.key,
        kind: "domain" as const,
        title: mark.title,
        sub: mark.sub,
        due_on: mark.on,
        href: mark.href,
      }));
    for (const host of book.hosts)
      if (!host.retired && book.failedInARow(host.host_id) >= LIMIT.failed_in_a_row)
        items.push({
          key: `domain:host:${host.host_id}:unread`,
          kind: "domain",
          title: `Check ${host.hostname}: its certificate could not be read`,
          sub: host.probe?.error || "Could not connect",
          due_on: on,
          href: `${PAGE}#host-${host.host_id}`,
        });
    return items;
  };
  core.provideDue(dueItems);

  const agenda: AgendaSource = {
    agenda: () =>
      marks()
        .map((mark): AgendaItem => ({
          key: mark.key,
          kind: "domain",
          title: mark.title,
          plain: "Domain or certificate renewal",
          sub: mark.sub,
          on: mark.on,
          remind_days: mark.window.remind,
          href: mark.href,
        }))
        .sort((a, b) => a.on.localeCompare(b.on) || a.title.localeCompare(b.title)),
  };
  core.provide(agendaService("domains"), agenda);

  // ---------------------------------------------------------------- search

  type Found = { id: string; title: string; subtitle: string; href: string; text: string[] };
  const expiryWords = (on: string | null) => (on ? `expires ${dayWords(on)}` : "no expiry day");
  const searchable = (): Found[] => [
    ...book.domains.map((domain) => ({
      id: domain.domain_id,
      title: domain.name,
      subtitle: `Domain · ${domain.released ? "released" : expiryWords(domain.expires_on)}`,
      href: `${PAGE}#domain-${domain.domain_id}`,
      text: [domain.name],
    })),
    ...book.hosts.map((host) => ({
      id: host.host_id,
      title: host.hostname,
      subtitle: `Website certificate · ${host.retired ? "retired" : expiryWords(hostExpiryDay(host).on)}`,
      href: `${PAGE}#host-${host.host_id}`,
      text: [host.hostname],
    })),
    ...book.signing.map((cert) => ({
      id: cert.cert_id,
      title: cert.name,
      subtitle: `Signing certificate · ${cert.replaced ? "replaced" : expiryWords(cert.expires_on)}`,
      href: `${PAGE}#signing-${cert.cert_id}`,
      text: [cert.name],
    })),
  ];
  const search: SearchSource = {
    search: ({ terms, kind, limit }) => {
      if (terms.length === 0 || (kind !== null && kind !== "domain")) return [];
      const found = searchable().filter((item) => matchesTerms(item.text, terms));
      if (found.length === 0) return [];
      return [
        {
          kind: "domain",
          count: found.length,
          hits: found.slice(0, Math.max(0, limit)).map((item) => ({
            kind: "domain" as const,
            id: item.id,
            title: item.title,
            subtitle: item.subtitle,
            snippet: "",
            href: item.href,
          })),
        },
      ];
    },
  };
  core.provide(searchService("domains"), search);

  // ---------------------------------------------------------------- the service

  const summary = (): RegisterSummary => {
    const next = marks()
      .map((mark) => ({ title: mark.title, on: mark.on }))
      .sort((a, b) => a.on.localeCompare(b.on) || a.title.localeCompare(b.title))[0];
    const live =
      book.domains.filter((item) => !item.released).length +
      book.hosts.filter((item) => !item.retired).length +
      book.signing.filter((item) => !item.replaced).length +
      book.securityTxt.filter((item) => !item.retired).length;
    return {
      records:
        book.domains.length + book.hosts.length + book.signing.length + book.securityTxt.length,
      open: live,
      report_due: 0,
      next: next ?? null,
    };
  };

  const service: DomainsLookup & { summary(): RegisterSummary } = {
    usedFor: () => [],
    count: () => book.domains.filter((domain) => !domain.released).length,
    signingCount: () => book.signing.filter((cert) => !cert.replaced).length,
    summary,
  };
  core.provide(DUTIES_SERVICES.domains, service);

  // ---------------------------------------------------------------- the Registers Summary

  const summaryOf = (name: string): RegisterSummary | null => {
    const other = core.need<Summarised>(name);
    return other ? safely(() => other.summary()) : null;
  };

  core.route("GET", "/data/registers", () => {
    const on = today();
    const incidents = summaryOf(DUTIES_SERVICES.incidents);
    const trademarks = summaryOf(DUTIES_SERVICES.marks);
    const holidays = core.need<HolidaysService>(DUTIES_SERVICES.holidays);
    const coming = holidays ? safely(() => holidays.between(on, addDays(on, 365))) : null;
    const nextHoliday = coming?.find((day) => day.kind !== "optional") ?? coming?.[0] ?? null;
    const own = summary();
    return {
      rows: [
        {
          key: "incidents",
          records: incidents?.records ?? null,
          next: incidents?.next ?? null,
          href: "/data/registers/incidents",
        },
        {
          key: "marks",
          records: trademarks?.records ?? null,
          next: trademarks?.next ?? null,
          href: "/data/registers/marks",
        },
        { key: "domains", records: own.records, next: own.next, href: PAGE },
        {
          key: "holidays",
          records: coming ? coming.length : null,
          next: nextHoliday ? { title: nextHoliday.name, on: nextHoliday.on } : null,
          href: "/data/registers/holidays",
        },
      ],
      today: on,
    };
  });

  core.provideOverview("registers", () => {
    const incidents = summaryOf(DUTIES_SERVICES.incidents);
    const trademarks = core.need<Summarised>(DUTIES_SERVICES.marks);
    const nexts = [incidents?.next, summaryOf(DUTIES_SERVICES.marks)?.next, summary().next]
      .filter((item): item is { title: string; on: string } => Boolean(item))
      .sort((a, b) => a.on.localeCompare(b.on));
    return {
      incidents_open: incidents?.open ?? 0,
      report_due: incidents?.report_due ?? 0,
      marks: trademarks ? (safely(() => trademarks.count()) ?? 0) : 0,
      domains: service.count(),
      next: nexts[0] ?? null,
    };
  });

  // ---------------------------------------------------------------- routes (fixed paths first)

  core.route("GET", "/data/domains", () => {
    const on = today();
    const tls = TLS_RULES.map((key) => ({ key, state: stateOf(key) })).find(
      (item) => item.state && !item.state.not_yet,
    );
    return {
      domains: book.domains
        .map((domain) => domainRow(domain, on))
        .sort(
          (a, b) =>
            Number(Boolean(a.released)) - Number(Boolean(b.released)) ||
            a.name.localeCompare(b.name),
        ),
      hosts: book.hosts
        .map((host) => hostRow(host, on))
        .sort(
          (a, b) => Number(a.retired) - Number(b.retired) || a.hostname.localeCompare(b.hostname),
        ),
      signing: book.signing
        .map((cert) => signingRow(cert, on))
        .sort(
          (a, b) =>
            Number(a.replaced) - Number(b.replaced) || a.expires_on.localeCompare(b.expires_on),
        ),
      security_txt: book.securityTxt
        .map((txt) => txtRow(txt, on))
        .sort(
          (a, b) => Number(a.retired) - Number(b.retired) || a.hostname.localeCompare(b.hostname),
        ),
      rules: {
        tls: tls?.state ? ruleLineOf(tls.state) : null,
        signing: lineOf("signing-life"),
        security_txt: lineOf("security-txt-expires"),
      },
      checking: core.jobs("host_check")[0] ?? null,
      prober: prober() !== null,
      today: on,
    };
  });

  core.route("POST", "/data/domains", (ctx) => {
    const by = ctx.staff();
    return { domain: domainRow(book.addDomain(ctx.body, by), today()) };
  });

  core.route("POST", "/data/domains/hosts", (ctx) => {
    const by = ctx.staff();
    return { host: hostRow(book.addHost(ctx.body, by), today()) };
  });

  core.route("POST", "/data/domains/hosts/check-all", (ctx) => {
    ctx.staff();
    const probe = prober();
    if (!probe) throw new Refused(409, "no_prober", SAY.noProber);
    if (core.jobs("host_check").length > 0) throw new Refused(409, "checking", SAY.checking);
    const hosts = book.hosts.filter((host) => !host.retired);
    if (hosts.length === 0) throw new Refused(409, "invalid", SAY.nothingToCheck);
    checkAll(hosts, probe);
    return { checking: core.jobs("host_check")[0] ?? null };
  });

  core.route("POST", "/data/domains/hosts/:id/update", (ctx) => {
    const by = ctx.staff();
    return { host: hostRow(book.updateHost(book.host(ctx.params[0]), ctx.body, by), today()) };
  });

  core.route("POST", "/data/domains/hosts/:id/check", async (ctx) => {
    ctx.staff();
    const host = book.host(ctx.params[0]);
    const probe = prober();
    if (!probe) throw new Refused(409, "no_prober", SAY.noProber);
    if (host.retired) throw new Refused(409, "invalid", SAY.retired);
    return { host: hostRow(await checkOne(host, probe), today()) };
  });

  core.route("POST", "/data/domains/hosts/:id/retire", (ctx) => {
    const by = ctx.staff();
    return { host: hostRow(book.retireHost(book.host(ctx.params[0]), by), today()) };
  });

  core.route("POST", "/data/domains/signing", (ctx) => {
    const by = ctx.staff();
    return { signing: signingRow(book.addSigning(ctx.body, by), today()) };
  });

  core.route("POST", "/data/domains/signing/:id/update", (ctx) => {
    const by = ctx.staff();
    const cert = book.updateSigning(book.cert(ctx.params[0]), ctx.body, by);
    return { signing: signingRow(cert, today()) };
  });

  core.route("POST", "/data/domains/signing/:id/replaced", (ctx) => {
    const by = ctx.staff();
    return { signing: signingRow(book.replaced(book.cert(ctx.params[0]), by), today()) };
  });

  core.route("POST", "/data/domains/security-txt", (ctx) => {
    const by = ctx.staff();
    return { security_txt: txtRow(book.addTxt(ctx.body, by), today()) };
  });

  core.route("POST", "/data/domains/security-txt/:id/update", (ctx) => {
    const by = ctx.staff();
    const txt = book.updateTxt(book.txt(ctx.params[0]), ctx.body, by);
    return { security_txt: txtRow(txt, today()) };
  });

  core.route("POST", "/data/domains/security-txt/:id/retire", (ctx) => {
    const by = ctx.staff();
    return { security_txt: txtRow(book.retireTxt(book.txt(ctx.params[0]), by), today()) };
  });

  core.route("POST", "/data/domains/:id/update", (ctx) => {
    const by = ctx.staff();
    return {
      domain: domainRow(book.updateDomain(book.domain(ctx.params[0]), ctx.body, by), today()),
    };
  });

  core.route("POST", "/data/domains/:id/release", (ctx) => {
    const by = ctx.staff();
    return {
      domain: domainRow(book.releaseDomain(book.domain(ctx.params[0]), ctx.body, by), today()),
    };
  });

  // ---------------------------------------------------------------- the register as a CSV

  core.builds.provide("domains_csv", async (handle, input) => {
    const on = today();
    handle.setProgress(0, 1);
    await core.yield();
    const rows: (string | number)[][] = [
      ...book.domains.map((item) => {
        const row = domainRow(item, on);
        return [
          "Domain",
          item.name,
          DOMAIN_PURPOSES[item.purpose],
          item.registrar,
          item.expires_on ?? "",
          "typed",
          FLAG_WORDS[item.auto_renew],
          FLAG_WORDS[item.locked],
          DMARC_STAGES[item.dmarc],
          item.released ? `Released ${item.released.on}` : EXPIRY_STATES[row.expiry.state].label,
          row.checks.join(" "),
        ];
      }),
      ...book.hosts.map((item) => {
        const row = hostRow(item, on);
        return [
          "Website certificate",
          item.hostname,
          item.what,
          item.probe?.issuer ?? "",
          row.expiry.on ?? "",
          row.expiry.source,
          FLAG_WORDS[item.auto_renew],
          "",
          "",
          item.retired ? "Retired" : EXPIRY_STATES[row.expiry.state].label,
          row.checks.join(" "),
        ];
      }),
      ...book.signing.map((item) => {
        const row = signingRow(item, on);
        return [
          "Signing certificate",
          item.name,
          PLATFORMS[item.platform],
          item.issuer,
          item.expires_on,
          "typed",
          "",
          "",
          "",
          item.replaced ? "Replaced" : EXPIRY_STATES[row.expiry.state].label,
          row.checks.join(" "),
        ];
      }),
      ...book.securityTxt.map((item) => {
        const row = txtRow(item, on);
        return [
          "security.txt",
          item.hostname,
          item.policy_url,
          item.contact,
          item.expires_on,
          "typed",
          "",
          "",
          "",
          item.retired ? "Retired" : EXPIRY_STATES[row.expiry.state].label,
          row.checks.join(" "),
        ];
      }),
    ];
    const text =
      BOM +
      toCsv(
        [
          "kind",
          "name",
          "for",
          "registrar_or_issuer",
          "expires_on",
          "expiry_from",
          "auto_renew",
          "registrar_lock",
          "dmarc",
          "state",
          "checks",
        ],
        rows,
      );
    writeFileSync(handle.path, text, { mode: 0o600 });
    handle.setProgress(1, 1);
    core.store.appendLine("domains/exports.jsonl", {
      at: core.now(),
      by: input.by,
      kind: "domains",
      rows: rows.length,
    });
    return { name: `Domains and certificates ${on}.csv`, type: "text/csv; charset=utf-8" };
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    const installRules = (body: Record<string, unknown>) => {
      const current = core.need<DutyRulesService & { [STAND_IN]?: true }>(
        DUTIES_SERVICES.dutyRules,
      );
      const isStandIn = current !== null && current[STAND_IN] === true;
      if (body.on === false) {
        if (isStandIn) core.provide(DUTIES_SERVICES.dutyRules, null);
        return { installed: false };
      }
      if (current && !isStandIn) return { installed: false, real: true };
      const fake = Object.assign(
        standInDutyRules(() => core.day(), storedOf(body.stored)),
        {
          [STAND_IN]: true as const,
        },
      );
      core.provide(DUTIES_SERVICES.dutyRules, fake);
      return { installed: true };
    };

    const readResults = (raw: unknown): Record<string, Omit<Probe, "checked_at">> => {
      const results: Record<string, Omit<Probe, "checked_at">> = {};
      if (!raw || typeof raw !== "object") return results;
      for (const [hostname, value] of Object.entries(raw as Record<string, unknown>)) {
        const record = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
        const text = (key: string) => (typeof record[key] === "string" ? String(record[key]) : "");
        const instant = (key: string) =>
          typeof record[key] === "string" && !Number.isNaN(Date.parse(String(record[key])))
            ? new Date(String(record[key])).toISOString()
            : null;
        results[hostname.toLowerCase()] = {
          ok: record.ok === true,
          not_before: instant("not_before"),
          not_after: instant("not_after"),
          issuer: text("issuer"),
          subject: text("subject"),
          verified: record.verified === true,
          error: text("error"),
        };
      }
      return results;
    };

    core.route("GET", "/data/_test/domains/prober", () => ({
      timer: timerStarted,
      installed: scripted !== null,
    }));

    core.route("POST", "/data/_test/domains/prober", (ctx) => {
      ctx.staff();
      if (ctx.body.on === false) {
        scripted = null;
        return { installed: false };
      }
      scripted = readResults(ctx.body.results);
      return { installed: true, hosts: Object.keys(scripted).length };
    });

    core.route("POST", "/data/_test/domains/duty-rules", (ctx) => {
      ctx.staff();
      return installRules(ctx.body);
    });

    /** The walk's stand-ins: the scripted prober's answers and the rule book's own amounts. */
    core.route("POST", "/data/_test/domains/seed", (ctx) => {
      ctx.staff();
      scripted = { ...(scripted ?? {}), ...WALK_PROBES };
      return { prober: true, rules: installRules({}) };
    });

    core.route("GET", "/data/_test/domains/agenda", () => ({
      items: core.need<AgendaSource>(agendaService("domains"))?.agenda(today()) ?? [],
      today: today(),
    }));

    core.route("GET", "/data/_test/domains/search", (ctx) => {
      const query = clean(ctx.query.get("q"), LIMIT.search);
      return {
        groups:
          core.need<SearchSource>(searchService("domains"))?.search({
            query,
            terms: findTerms(query),
            kind: null,
            limit: 5,
          }) ?? [],
      };
    });
  }
}
