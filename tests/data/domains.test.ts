// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import {
  TLS_RULES,
  domainWindow,
  dueFrom,
  expiryOf,
  hostWindow,
  lifeCheck,
  securityTxtCheck,
  securityTxtWindow,
  signingWindow,
} from "../../scripts/data/domains/clocks";
import { publicHostname } from "../../scripts/data/domains/limits";
import { standInDutyRules } from "../../scripts/data/duties-contracts";
import { WALKER, codeOf, startStack, type Stack } from "./helpers";

/**
 * Domains and certificates (ws-notes/duties/spec.md §5.2, §6.5, §6.6): every window and
 * reminder of §5.2, the life checks and the security.txt check, the hostname refusals, the
 * scripted prober, three failed handshakes putting a host in Due, and the timer that never
 * starts under test routes. Every name is under `.example` and never resolves; nothing here
 * opens a network connection.
 */

type Body = Record<string, unknown>;
const today = () => localDay(new Date());
const rules = standInDutyRules(() => "2026-11-19");
const stateOf = (key: Parameters<typeof rules.state>[0], on: string) => rules.state(key, on);
const remindDays = (on: string, remind: number[]) => remind.map((days) => addDays(on, -days));

describe("the windows and reminders of §5.2", () => {
  it("a domain: from 60 days before with auto-renew off or not known, 7 with it on", () => {
    expect(dueFrom("2027-03-12", domainWindow({ auto_renew: "no" }))).toBe("2027-01-11");
    expect(dueFrom("2027-03-12", domainWindow({ auto_renew: "" }))).toBe("2027-01-11");
    expect(domainWindow({ auto_renew: "no" }).remind).toEqual([60, 30, 7]);
    expect(dueFrom("2027-03-12", domainWindow({ auto_renew: "yes" }))).toBe("2027-03-05");
    expect(domainWindow({ auto_renew: "yes" }).remind).toEqual([7]);
  });

  it("a website certificate: 31 Jan, 16 Feb, 23 Feb 2027 for 2 Mar 2027; 23 Feb with auto-renew", () => {
    expect(remindDays("2027-03-02", hostWindow({ auto_renew: "no" }).remind)).toEqual([
      "2027-01-31",
      "2027-02-16",
      "2027-02-23",
    ]);
    expect(remindDays("2027-03-02", hostWindow({ auto_renew: "yes" }).remind)).toEqual([
      "2027-02-23",
    ]);
  });

  it("a signing certificate: expires 4 Sep 2027, lead 45: Due from 21 Jul 2027; the calendar's lead capped at 60", () => {
    expect(dueFrom("2027-09-04", signingWindow({ lead_days: 45 }))).toBe("2027-07-21");
    expect(signingWindow({ lead_days: 45 }).remind).toEqual([45, 14, 7]);
    expect(signingWindow({ lead_days: 120 }).remind).toEqual([60, 14, 7]);
    expect(signingWindow({ lead_days: 7 }).remind).toEqual([14, 7]);
  });

  it("security.txt: expires 1 Nov 2027, Due from 2 Oct 2027, reminders 30 and 7", () => {
    expect(dueFrom("2027-11-01", securityTxtWindow())).toBe("2027-10-02");
    expect(securityTxtWindow().remind).toEqual([30, 7]);
  });

  it("an expiry reads ok, soon, overdue or not known", () => {
    const window = domainWindow({ auto_renew: "no" });
    expect(expiryOf("2027-03-12", "typed", "2026-11-19", window).state).toBe("ok");
    expect(expiryOf("2027-03-12", "typed", "2027-01-11", window)).toEqual({
      on: "2027-03-12",
      source: "typed",
      in_days: 60,
      state: "soon",
    });
    expect(expiryOf("2027-03-12", "typed", "2027-03-13", window).state).toBe("overdue");
    expect(expiryOf(null, "typed", "2027-03-13", window).state).toBe("unknown");
  });
});

describe("the life checks", () => {
  it("issued 14 Aug 2026, not after 2 Mar 2027: 200 days, at the limit", () => {
    expect(lifeCheck("2026-08-14", "2027-03-02", TLS_RULES, stateOf)).toBe("At the 200-day limit.");
  });

  it("issued 20 Mar 2027 with 200 days: longer than the 100-day limit", () => {
    expect(lifeCheck("2027-03-20", addDays("2027-03-20", 200), TLS_RULES, stateOf)).toBe(
      "200 days: longer than the 100-day limit for certificates issued from 15 Mar 2027.",
    );
  });

  it("a signing certificate: 460 days at the limit; issued 1 Feb 2026 is not checked", () => {
    expect(lifeCheck("2026-06-01", "2027-09-04", ["signing-life"], stateOf)).toBe(
      "At the 460-day limit.",
    );
    expect(lifeCheck("2026-02-01", "2027-03-01", ["signing-life"], stateOf)).toBe(
      "Issued before 1 Mar 2026, when the limit began.",
    );
    expect(lifeCheck("2026-06-01", "2027-01-01", ["signing-life"], stateOf)).toBeNull();
    expect(lifeCheck("2026-06-01", "2027-09-04", ["signing-life"], null)).toBeNull();
  });

  it("security.txt published 1 Nov 2026, Expires 15 Nov 2027: more than a year ahead", () => {
    const state = rules.state("security-txt-expires");
    expect(securityTxtCheck({ published_on: "2026-11-01", expires_on: "2027-11-15" }, state)).toBe(
      "More than a year ahead; under a year is recommended.",
    );
    expect(
      securityTxtCheck({ published_on: "2026-11-01", expires_on: "2027-11-01" }, state),
    ).toBeNull();
    expect(
      securityTxtCheck({ published_on: "2026-11-01", expires_on: "2027-11-15" }, null),
    ).toBeNull();
  });
});

describe("the hostname check", () => {
  it("takes public names in lower case and refuses the rest with one sentence", () => {
    expect(publicHostname("WWW.Walk.Example.")).toBe("www.walk.example");
    expect(publicHostname("walk.example")).toBe("walk.example");
    for (const bad of [
      "",
      "localhost",
      "nodot",
      "192.168.1.10",
      "10.0.0.1",
      "nas.local",
      "printer.lan",
      "db.internal",
      "box.home.arpa",
      "site.test",
      "https://www.walk.example",
      "www.walk.example/path",
      "-bad.walk.example",
      "under_score.walk.example",
      `${"a".repeat(64)}.walk.example`,
    ])
      expect(() => publicHostname(bad), bad).toThrow(
        "Type a public hostname, such as www.example.com.",
      );
  });
});

describe("domains through the service", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack({ modules: ["domains"] });
  }, 60_000);
  afterAll(() => stack.stop());

  const post = (path: string, body: Body = {}) => stack.ask("POST", path, { by: WALKER, ...body });
  const message = (answer: { json?: Body | null }) =>
    ((answer.json?.error ?? {}) as { message?: string }).message ?? "";
  const due = async () =>
    ((await stack.ask("GET", "/data/overview")).json!.due as Body[]).filter(
      (item) => item.kind === "domain",
    );
  const page = async () => (await stack.ask("GET", "/data/domains")).json!;

  it("starts empty, with the timer off under test routes and no prober", async () => {
    expect((await stack.ask("GET", "/data/_test/domains/prober")).json).toMatchObject({
      timer: false,
      installed: false,
    });
    const empty = await page();
    expect(empty).toMatchObject({
      domains: [],
      hosts: [],
      signing: [],
      security_txt: [],
      prober: false,
      checking: null,
      rules: { tls: null, signing: null, security_txt: null },
    });
  });

  it("a domain: its checks, the refusals, the Due row from its window, release", async () => {
    const refused = await post("/data/domains", { name: "nas.local" });
    expect(message(refused)).toBe("Type a public hostname, such as www.example.com.");
    const pin = await post("/data/domains", {
      name: "walk.example",
      account_holder: "Walk Owner, password: walk-1",
    });
    expect(message(pin)).toBe("Write where it is kept, never its PIN or password.");
    const made = await post("/data/domains", {
      name: "Walk.Example",
      purpose: "main",
      registrar: "Walk Registrar",
      account_holder: "Walk Owner",
      expires_on: addDays(today(), 30),
      auto_renew: "no",
      locked: "no",
      dmarc: "none",
      sends_as: "Walk Mailer, Walk Helpdesk",
    });
    expect(made.status, message(made)).toBe(200);
    const domain = made.json!.domain as Body & { domain_id: string; checks: string[] };
    expect(domain.name).toBe("walk.example");
    expect(domain.sends_as).toEqual(["Walk Mailer", "Walk Helpdesk"]);
    expect(domain.checks).toEqual([
      "Auto-renew is off.",
      "The registrar lock is off.",
      "DMARC is at ‘none’.",
    ]);
    expect(domain.expiry).toMatchObject({ state: "soon", in_days: 30, source: "typed" });
    const again = await post("/data/domains", { name: "walk.example" });
    expect(message(again)).toBe("That domain is already here.");
    expect(await due()).toContainEqual({
      key: `domain:domain:${domain.domain_id}`,
      kind: "domain",
      title: "Renew walk.example",
      sub: "Walk Registrar · auto-renew off",
      due_on: addDays(today(), 30),
      href: `/data/registers/domains#domain-${domain.domain_id}`,
    });
    await post(`/data/domains/${domain.domain_id}/update`, { auto_renew: "yes" });
    expect((await due()).some((row) => row.key === `domain:domain:${domain.domain_id}`)).toBe(
      false,
    );
    const quiet = await post("/data/domains", {
      name: "walk-defence.example",
      purpose: "defensive",
    });
    const quietId = (quiet.json!.domain as { domain_id: string }).domain_id;
    expect((quiet.json!.domain as { checks: string[] }).checks).toEqual(["No expiry day typed."]);
    const released = await post(`/data/domains/${quietId}/release`, { why: "Let go on purpose" });
    expect((released.json!.domain as Body).released).toMatchObject({ why: "Let go on purpose" });
    const agenda = (await stack.ask("GET", "/data/_test/domains/agenda")).json!;
    expect(agenda.items).toEqual([
      expect.objectContaining({
        kind: "domain",
        title: "Renew walk.example",
        plain: "Domain or certificate renewal",
        remind_days: [7],
      }),
    ]);
  });

  it("a host: checking is off until the scripted prober is installed, then it reads the dates", async () => {
    const made = await post("/data/domains/hosts", {
      hostname: "www.walk.example",
      what: "The website",
      auto_renew: "no",
    });
    const host = made.json!.host as Body & { host_id: string };
    const off = await post(`/data/domains/hosts/${host.host_id}/check`);
    expect(off.status).toBe(409);
    expect(codeOf(off)).toBe("no_prober");
    expect(message(off)).toBe("Checking is off in this copy.");
    await post("/data/_test/domains/seed");
    const checked = await post(`/data/domains/hosts/${host.host_id}/check`);
    expect(checked.status, message(checked)).toBe(200);
    const row = checked.json!.host as Body & { checks: string[]; expiry: Body };
    expect(row.expiry).toMatchObject({ on: "2027-03-02", source: "handshake" });
    expect(row.issued_on).toBe("2026-08-14");
    expect(row.checks).toEqual(["At the 200-day limit."]);
    const list = await page();
    expect(list.prober).toBe(true);
    expect((list.rules as Body).tls).toMatchObject({ key: "tls-life-2026" });
  });

  it("three failed handshakes in a row put the host in Due for today", async () => {
    const made = await post("/data/domains/hosts", { hostname: "down.walk.example" });
    const host = made.json!.host as { host_id: string };
    for (let count = 1; count <= 3; count += 1) {
      const answer = await post(`/data/domains/hosts/${host.host_id}/check`);
      const row = answer.json!.host as { failed_in_a_row: number; checks: string[] };
      expect(row.failed_in_a_row).toBe(count);
      if (count === 2)
        expect((await due()).some((item) => String(item.key).endsWith(":unread"))).toBe(false);
    }
    const row = ((await page()).hosts as Body[]).find((item) => item.host_id === host.host_id)!;
    expect((row.checks as string[])[0]).toMatch(
      /^Could not be read on \d{1,2} [A-Z][a-z]{2} \d{4}: Could not connect\. Type its expiry by hand if it cannot be reached from here\.$/,
    );
    expect(await due()).toContainEqual(
      expect.objectContaining({
        key: `domain:host:${host.host_id}:unread`,
        title: "Check down.walk.example: its certificate could not be read",
        due_on: today(),
      }),
    );
    const typed = await post(`/data/domains/hosts/${host.host_id}/update`, {
      typed_not_after: addDays(today(), 10),
    });
    expect((typed.json!.host as { expiry: Body }).expiry).toMatchObject({
      source: "typed",
      state: "soon",
    });
  });

  it("checks every host as a job, one at a time", async () => {
    const started = await post("/data/domains/hosts/check-all");
    expect(started.status, message(started)).toBe(200);
    for (let tries = 0; tries < 100 && (await page()).checking !== null; tries += 1)
      await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await page()).checking).toBeNull();
  });

  it("a signing certificate: lead days, the 460-day check, the PIN refused, replaced", async () => {
    const lead = await post("/data/domains/signing", {
      name: "Walk Mac signing",
      platform: "mac",
      expires_on: "2027-09-04",
      lead_days: "200",
    });
    expect(message(lead)).toBe("Type the days before expiry as a whole number from 7 to 180.");
    const kept = await post("/data/domains/signing", {
      name: "Walk Mac signing",
      platform: "mac",
      expires_on: "2027-09-04",
      kept: "The safe, PIN 1234",
    });
    expect(message(kept)).toBe("Write where it is kept, never its PIN or password.");
    const made = await post("/data/domains/signing", {
      name: "Walk Mac signing",
      platform: "mac",
      issuer: "Walk Test Authority",
      issued_on: "2026-06-01",
      expires_on: "2027-09-04",
      kept: "A token in the office safe",
    });
    const cert = made.json!.signing as Body & { cert_id: string };
    expect(cert).toMatchObject({
      lead_days: 45,
      due_from: "2027-07-21",
      checks: ["At the 460-day limit."],
    });
    const replaced = await post(`/data/domains/signing/${cert.cert_id}/replaced`);
    expect((replaced.json!.signing as Body).replaced).toBe(true);
  });

  it("security.txt: more than a year ahead, the policy link, retire", async () => {
    const policy = await post("/data/domains/security-txt", {
      hostname: "walk.example",
      expires_on: "2027-11-15",
      policy_url: "http://walk.example/policy",
    });
    expect(message(policy)).toBe("Paste the policy's https link, or leave it empty.");
    const made = await post("/data/domains/security-txt", {
      hostname: "walk.example",
      published_on: "2026-11-01",
      expires_on: "2027-11-15",
      contact: "mailto:security@walk.example",
      policy_url: "https://walk.example/security",
    });
    const txt = made.json!.security_txt as Body & { txt_id: string };
    expect(txt.checks).toEqual(["More than a year ahead; under a year is recommended."]);
    await post(`/data/domains/security-txt/${txt.txt_id}/retire`);
  });

  it("search, the Summary, the overview's block, and nothing was sent", async () => {
    const found = (await stack.ask("GET", "/data/_test/domains/search?q=walk")).json!;
    expect((found.groups as Body[])[0]).toMatchObject({ kind: "domain" });
    const summary = (await stack.ask("GET", "/data/registers")).json!;
    expect(summary.rows).toEqual([
      { key: "incidents", records: null, next: null, href: "/data/registers/incidents" },
      { key: "marks", records: null, next: null, href: "/data/registers/marks" },
      expect.objectContaining({ key: "domains", href: "/data/registers/domains" }),
      { key: "holidays", records: null, next: null, href: "/data/registers/holidays" },
    ]);
    const overview = (await stack.ask("GET", "/data/overview")).json!;
    expect(overview.registers).toMatchObject({ incidents_open: 0, marks: 0, domains: 1 });
    expect(stack.engine.status().sent_today).toBe(0);
  });
});
