/**
 * Incidents, walked against the stand-in (ws-notes/duties/spec.md §6.6): the empty page and
 * its "If something is wrong now" block (IN1); "Walk phishing message" logged at 21:40 on
 * the pinned day, the clock reading "Report to CERT-In by 03:40 IST" (IN2); its Due row on
 * /data (IN3); the report recorded by email with WALK-CERT-0001, the clock reading
 * "Reported" (IN4); a second incident of kind "Something else" with no clock (IN5); a
 * customer with 24 hours (IN6); the runbook table (IN7); 412px, no overflow, no "%" (IN8);
 * and nothing sent. The module's clock is pinned by the seed at 23:00 IST, 13 Nov 2026.
 */

import { request } from "node:http";

import type { Page } from "playwright";

import { WALKER, type Shot, type WalkKit } from "./kit";

export const shots: Shot[] = [
  {
    name: "data-registers-incidents",
    path: "/data/registers/incidents",
    ready: ".hqdata-incidents",
  },
  {
    name: "data-registers-incident",
    path: "/data/registers/incidents/walk-incident",
    ready: '[data-section="incident-clocks"]',
  },
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

/** The module's clock pinned, the rule book's own amounts, `walk-incident` for the next log. */
export async function seed(socketPath: string): Promise<void> {
  if ((await ask(socketPath, "GET", "/data/incidents")).status !== 200) {
    console.log("[walk] incidents: the module is not loaded here");
    return;
  }
  await ask(socketPath, "POST", "/data/_test/incidents/seed", { by: WALKER });
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();
const PAGE = "/data/registers/incidents";
const RECORD = `${PAGE}/walk-incident`;

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

async function incidents(kit: WalkKit): Promise<Body[]> {
  return ((await kit.socket.ask("GET", "/data/incidents?view=all")).body.incidents ?? []) as Body[];
}

async function log(page: Page, kit: WalkKit, title: string, kind: string): Promise<boolean> {
  await open(page, kit, PAGE, ".hqdata-incidents");
  await page.locator("summary", { hasText: "Log an incident" }).click();
  await page.fill("#incident-new-title", title);
  await page.selectOption("#incident-new-kind", kind);
  await page.fill("#incident-new-aware-day", "2026-11-13");
  await page.fill("#incident-new-aware-time", "21:40");
  await page
    .locator("form", { has: page.locator("#incident-new-title") })
    .locator("button", { hasText: "Log it" })
    .click();
  return until(page, async () => (await incidents(kit)).some((item) => item.title === title));
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/incidents")).status !== 200) {
    kit.check("incidents: not loaded in this service", true);
    return;
  }
  const outbox = kit.outbox().length;

  // ---------------------------------------------------------------- IN1: the empty page
  if (kit.pass.first) {
    const text = await open(page, kit, PAGE, ".hqdata-incidents");
    const block = flat(await page.locator('[data-section="incidents-now"]').innerText());
    kit.check(
      "incidents IN1: no incidents yet, and what to do if something is wrong now",
      text.includes("No incidents logged. Log one the moment something looks wrong") &&
        block.includes("If something is wrong now") &&
        block.includes("incident@cert-in.org.in · 1800-11-4949 · fax 1800-11-6969") &&
        block.includes("Confirm with your lawyer"),
      block.slice(0, 260),
    );

    // -------------------------------------------------------------- IN2: logged, the clock runs
    const logged = await log(page, kit, "Walk phishing message", "phishing");
    await open(page, kit, RECORD, '[data-section="incident-clocks"]');
    const clocks = flat(await page.locator('[data-section="incident-clocks"]').innerText());
    kit.check(
      "incidents IN2: noticed 21:40 on the pinned day, report to CERT-In by 03:40 IST with 4 hours 40 minutes left",
      logged &&
        clocks.includes("Report to CERT-In by 03:40 IST, 14 Nov 2026.") &&
        clocks.includes("4 hours 40 minutes left"),
      clocks.slice(0, 260),
    );

    // -------------------------------------------------------------- IN3: the Due row on /data
    await page.goto(`${kit.base}/data`, { waitUntil: "networkidle" });
    const due = await until(page, async () =>
      flat(await kit.text()).includes("Report INC-2026-001 to CERT-In by 03:40 IST"),
    );
    kit.check("incidents IN3: the Due row on /data names the deadline", due);

    // -------------------------------------------------------------- IN6: a customer with 24 hours
    await open(page, kit, RECORD, '[data-section="incident-clocks"]');
    const customers = page.locator('[data-part="customers"]');
    await customers.locator("summary", { hasText: "Add a customer" }).click();
    await page.fill("#customer-name", "Walk Customer Ltd");
    await page.fill("#customer-hours", "24");
    await customers.locator("form button", { hasText: "Add the customer" }).click();
    await until(page, async () => {
      const record = (await kit.socket.ask("GET", "/data/incidents/walk-incident")).body
        .incident as Body | undefined;
      return ((record?.customers as Body[] | undefined) ?? []).length > 0;
    });

    // -------------------------------------------------------------- IN4: the report recorded
    await open(page, kit, RECORD, '[data-section="incident-clocks"]');
    const certIn = page.locator('[data-part="cert-in"]');
    await certIn.locator("summary", { hasText: "Record the report" }).click();
    await page.fill("#cert-in-report-sent-day", "2026-11-13");
    await page.fill("#cert-in-report-sent-time", "23:00");
    await page.selectOption("#cert-in-report-channel", "email");
    await page.fill("#cert-in-report-reference", "WALK-CERT-0001");
    await certIn.locator("form button", { hasText: "Record the report" }).click();
    await until(page, async () => {
      const record = (await kit.socket.ask("GET", "/data/incidents/walk-incident")).body
        .incident as Body | undefined;
      return ((record?.cert_in as Body | undefined)?.report ?? null) !== null;
    });

    // -------------------------------------------------------------- IN5: a kind not on the list
    await log(page, kit, "Walk printer jam", "other");
    const other = (await incidents(kit)).find((item) => item.title === "Walk printer jam");
    if (other) {
      await open(
        page,
        kit,
        `${PAGE}/${String(other.incident_id)}`,
        '[data-section="incident-clocks"]',
      );
      const words = flat(await page.locator('[data-part="cert-in"]').innerText());
      kit.check(
        "incidents IN5: a kind not on CERT-In's list runs no clock",
        words.includes("This kind is not on CERT-In’s list, so the 6-hour clock does not run."),
        words.slice(0, 200),
      );
    } else kit.check("incidents IN5: the second incident was logged", false);
  }

  // ---------------------------------------------------------------- IN4 and IN6, every pass
  await open(page, kit, RECORD, '[data-section="incident-clocks"]');
  const certIn = flat(await page.locator('[data-part="cert-in"]').innerText());
  const customers = flat(await page.locator('[data-part="customers"]').innerText());
  kit.check(
    "incidents IN4: reported by email with WALK-CERT-0001 and 4 hours 40 minutes to spare",
    certIn.includes("Reported to CERT-In at 23:00 IST, 13 Nov 2026 by email") &&
      certIn.includes("WALK-CERT-0001") &&
      certIn.includes("with 4 hours 40 minutes to spare"),
    certIn.slice(0, 260),
  );
  kit.check(
    "incidents IN6: the customer's 24 hours: tell them by 21:40 IST, 14 Nov 2026",
    customers.includes("Walk Customer Ltd") && customers.includes("21:40 IST, 14 Nov 2026"),
    customers.slice(0, 200),
  );
  const record = flat(await kit.text());
  kit.check(
    "incidents IN8: the record says it is not advice, and no per cent sign",
    record.includes("not legal, tax or accounting advice") && !record.includes("%"),
  );
  await kit.audit("registers-incident");

  // ---------------------------------------------------------------- IN7: the runbooks
  const books = await open(page, kit, `${PAGE}?runbooks=1`, "#table-runbooks");
  const rows = await page.locator("#table-runbooks tbody tr").count();
  kit.check(
    "incidents IN7: a runbook row per kind, with the line on who calls whom",
    rows === 21 &&
      books.includes("A runbook names who calls CERT-In, the Board and customers") &&
      books.includes("Identity theft, spoofing or phishing"),
    { rows },
  );

  // ---------------------------------------------------------------- IN8: the list at every width
  const list = await open(page, kit, `${PAGE}?view=all`, "#table-incidents");
  kit.check(
    "incidents IN8: the list reads Reported for INC-2026-001 and Not on the list for the other, no per cent sign",
    list.includes("INC-2026-001") &&
      list.includes("Reported 23:00 IST, 13 Nov 2026") &&
      list.includes("Not on the list") &&
      !list.includes("%"),
    list.slice(0, 300),
  );
  await kit.audit("registers-incidents");
  kit.check("incidents: nothing was sent", kit.outbox().length === outbox, {
    before: outbox,
    after: kit.outbox().length,
  });
}
