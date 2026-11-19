/**
 * Domains and certificates, and the Registers Summary, walked against the stand-in
 * (ws-notes/duties/spec.md §6.6): the empty page (DM1); `walk.example` with auto-renew off
 * and its check line (DM2); `www.walk.example` read by "Check now" with the scripted prober,
 * its expiry and "At the 200-day limit." (DM3); a signing certificate and its "In Due from"
 * (DM4); a security.txt more than a year ahead (DM5); the Summary's four rows (DM6); and the
 * outbox not growing (DM7). Every name is under `.example`; no handshake leaves this Mac.
 */

import { request } from "node:http";

import type { Page } from "playwright";

import { WALKER, type Shot, type WalkKit } from "./kit";

export const shots: Shot[] = [
  { name: "data-registers", path: "/data/registers", ready: "#table-registers" },
  { name: "data-registers-domains", path: "/data/registers/domains", ready: ".hqdata-domains" },
];

type Body = Record<string, unknown>;

function ask(socket: string, method: "GET" | "POST", path: string, body?: unknown) {
  return new Promise<{ status: number; body: Body }>((resolve, reject) => {
    const text = body === undefined ? undefined : JSON.stringify(body);
    const outgoing = request(
      {
        socketPath: socket,
        path,
        method,
        headers: text
          ? { "content-type": "application/json", "content-length": Buffer.byteLength(text) }
          : {},
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          let parsed: Body = {};
          try {
            parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Body;
          } catch {
            parsed = {};
          }
          resolve({ status: response.statusCode ?? 0, body: parsed });
        });
      },
    );
    outgoing.on("error", reject);
    if (text) outgoing.write(text);
    outgoing.end();
  });
}

/** The scripted prober's answers for the walk's names, and the rule book's own amounts. */
export async function seed(socketPath: string): Promise<void> {
  if ((await ask(socketPath, "GET", "/data/domains")).status !== 200) {
    console.log("[walk] domains: the module is not loaded here");
    return;
  }
  await ask(socketPath, "POST", "/data/_test/domains/seed", { by: WALKER });
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();
const PAGE = "/data/registers/domains";

async function until(page: Page, test: () => Promise<boolean>, tries = 100): Promise<boolean> {
  for (let count = 0; count < tries; count += 1) {
    if (await test()) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

async function open(page: Page, kit: WalkKit, path: string, ready: string): Promise<string> {
  await page.goto(`${kit.base}${path}`, { waitUntil: "networkidle" });
  await page.waitForSelector(ready, { timeout: 30_000 });
  return flat(await kit.text());
}

async function domains(kit: WalkKit): Promise<Body> {
  return (await kit.socket.ask("GET", "/data/domains")).body;
}

/** Opens a section's "Add" popover, fills it and submits; waits until the service has it. */
async function add(
  page: Page,
  kit: WalkKit,
  section: string,
  summary: string,
  fill: () => Promise<void>,
  submit: string,
  done: (page: Body) => boolean,
): Promise<boolean> {
  await open(page, kit, PAGE, ".hqdata-domains");
  const part = page.locator(`[data-section="${section}"]`);
  await part.locator("summary", { hasText: summary }).first().click();
  await fill();
  await part.locator("form button", { hasText: submit }).first().click();
  return until(page, async () => done(await domains(kit)));
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/domains")).status !== 200) {
    kit.check("domains: not loaded in this service", true);
    return;
  }
  const outbox = kit.outbox().length;

  if (kit.pass.first) {
    // -------------------------------------------------------------- DM1: nothing recorded
    const text = await open(page, kit, PAGE, ".hqdata-domains");
    kit.check(
      "domains DM1: four empty sections, each saying what to add, and what the handshake sends",
      text.includes("No domains recorded. Add every domain the company owns") &&
        text.includes("No hostnames recorded.") &&
        text.includes("No signing certificates recorded.") &&
        text.includes("A security.txt file tells a researcher where to report a problem") &&
        text.includes("on port 443 from this computer. Nothing else is sent."),
      text.slice(0, 300),
    );

    // -------------------------------------------------------------- DM2: a domain, auto-renew off
    const domain = await add(
      page,
      kit,
      "domains-domains",
      "Add a domain",
      async () => {
        await page.fill("#domain-new-name", "walk.example");
        await page.fill("#domain-new-registrar", "Walk Registrar");
        await page.selectOption("#domain-new-renew", "no");
      },
      "Add the domain",
      (body) => ((body.domains as Body[] | undefined) ?? []).length > 0,
    );

    // -------------------------------------------------------------- DM3: a hostname, read
    const host = await add(
      page,
      kit,
      "domains-hosts",
      "Add a hostname",
      async () => {
        await page.fill("#host-new-hostname", "www.walk.example");
        await page.fill("#host-new-what", "The website");
      },
      "Add the hostname",
      (body) => ((body.hosts as Body[] | undefined) ?? []).length > 0,
    );
    await open(page, kit, PAGE, ".hqdata-domains");
    await page
      .locator('[data-section="domains-hosts"] button', { hasText: "Check now" })
      .first()
      .click();
    const read = await until(
      page,
      async () =>
        ((((await domains(kit)).hosts as Body[] | undefined) ?? [])[0]?.probe ?? null) !== null,
    );

    // -------------------------------------------------------------- DM4: a signing certificate
    const signing = await add(
      page,
      kit,
      "domains-signing",
      "Add a signing certificate",
      async () => {
        await page.fill("#signing-new-name", "Walk Mac signing");
        await page.fill("#signing-new-issued", "2026-06-01");
        await page.fill("#signing-new-expires", "2027-09-04");
        await page.fill("#signing-new-kept", "A token in the office safe");
      },
      "Add the certificate",
      (body) => ((body.signing as Body[] | undefined) ?? []).length > 0,
    );

    // -------------------------------------------------------------- DM5: security.txt
    const txt = await add(
      page,
      kit,
      "domains-security-txt",
      "Add a security.txt",
      async () => {
        await page.fill("#txt-new-hostname", "walk.example");
        await page.fill("#txt-new-published", "2026-11-01");
        await page.fill("#txt-new-expires", "2027-11-15");
      },
      "Add it",
      (body) => ((body.security_txt as Body[] | undefined) ?? []).length > 0,
    );
    kit.check(
      "domains: each of the four was added through its form",
      domain && host && read && signing && txt,
      {
        domain,
        host,
        read,
        signing,
        txt,
      },
    );
  }

  // ---------------------------------------------------------------- DM2–DM5, every pass
  await open(page, kit, PAGE, ".hqdata-domains");
  const section = async (name: string) =>
    flat(await page.locator(`[data-section="${name}"]`).innerText());
  const domainsText = await section("domains-domains");
  kit.check(
    "domains DM2: walk.example with auto-renew off, and its check line",
    domainsText.includes("walk.example") && domainsText.includes("Auto-renew is off."),
    domainsText.slice(0, 240),
  );
  const hostsText = await section("domains-hosts");
  kit.check(
    "domains DM3: www.walk.example read by the handshake: 2 Mar 2027, at the 200-day limit",
    hostsText.includes("www.walk.example") &&
      hostsText.includes("2 Mar 2027") &&
      hostsText.includes("Read by the handshake") &&
      hostsText.includes("At the 200-day limit."),
    hostsText.slice(0, 300),
  );
  const signingText = await section("domains-signing");
  kit.check(
    "domains DM4: the signing certificate enters Due from 21 Jul 2027, at the 460-day limit",
    signingText.includes("Walk Mac signing") &&
      signingText.includes("21 Jul 2027") &&
      signingText.includes("At the 460-day limit."),
    signingText.slice(0, 260),
  );
  const txtText = await section("domains-security-txt");
  kit.check(
    "domains DM5: security.txt more than a year ahead",
    txtText.includes("More than a year ahead; under a year is recommended."),
    txtText.slice(0, 200),
  );
  const whole = flat(await kit.text());
  kit.check(
    "domains: the page says it is not advice, and no per cent sign",
    whole.includes("not legal, tax or accounting advice") && !whole.includes("%"),
  );
  await kit.audit("registers-domains");

  // ---------------------------------------------------------------- DM6: the Summary
  await open(page, kit, "/data/registers", "#table-registers");
  const rows = await page.locator("#table-registers tbody tr").allInnerTexts();
  const summary = rows.map(flat);
  kit.check(
    "domains DM6: the Summary's four rows, in order, each linking to its view",
    summary.length === 4 &&
      (summary[0] ?? "").startsWith("Incidents") &&
      (summary[1] ?? "").startsWith("Trademarks") &&
      (summary[2] ?? "").startsWith("Domains and certificates") &&
      (summary[3] ?? "").startsWith("Holidays") &&
      (await page.locator('#table-registers a[href="/data/registers/domains"]').count()) === 1,
    summary,
  );
  await kit.audit("registers");

  // ---------------------------------------------------------------- DM7: nothing sent
  kit.check("domains DM7: the outbox did not grow", kit.outbox().length === outbox, {
    before: outbox,
    after: kit.outbox().length,
  });
}
