/**
 * Systems › Logs and time, walked against the stand-in (ws-notes/security/spec.md §7.7): the
 * empty page and "What CERT-In asks" with the rule book's two lines, the time servers and both
 * readings (LG1); "Walk Cloud", picked from the stand-in tools, kept 30 days outside India: the
 * retention line with the `cert-in-logs` rule line, both readings and "Confirm with your
 * lawyer" (LG2); a look recorded: the next look three months on (LG3). Nothing asks a time
 * server; the outbox does not grow.
 */

import { request } from "node:http";

import type { Page } from "playwright";

import { WALKER, type Shot, type WalkKit } from "./kit";

export const shots: Shot[] = [
  {
    name: "data-systems-logs",
    path: "/data/systems/logs",
    ready: '[data-section="logs-cert-in"]',
  },
];

type Body = Record<string, unknown>;

const PAGE = "/data/systems/logs";
const SYSTEM = "walk-log";
const RECORD = `${PAGE}/${SYSTEM}`;
const NOT_ADVICE = "A record and a reminder, not legal or certification advice.";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

/** The stand-in tools ("Walk Cloud", "Walk Code") while Tools is absent, and `walk-log`. */
export async function seed(socketPath: string): Promise<void> {
  if ((await ask(socketPath, "GET", "/data/logs")).status !== 200) {
    console.log("[walk] logs: the module is not loaded here");
    return;
  }
  await ask(socketPath, "POST", "/data/_test/logs/seed", { by: WALKER });
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();
const dayWords = (day: string) => {
  const [year, month, date] = day.split("-");
  return `${Number(date)} ${MONTHS[Number(month) - 1]} ${year}`;
};
/** The same date three months on, or that month's last day (as `addMonths`). */
const threeMonthsOn = (day: string) => {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const index = month - 1 + 3;
  const y = year + Math.floor(index / 12);
  const m = (index % 12) + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(date, last)).padStart(2, "0")}`;
};

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

const system = async (kit: WalkKit): Promise<Body | null> => {
  const answer = await kit.socket.ask("GET", `/data/logs/${SYSTEM}`);
  return answer.status === 200 ? (answer.body.system as Body) : null;
};

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/logs")).status !== 200) {
    kit.check("logs: not loaded in this service", true);
    return;
  }
  const outbox = kit.outbox().length;
  // The seed again, which is safe twice: a walk before this one may have restarted the worker on
  // purpose, and a restart forgets the stand-ins and the pinned id the first seed installed.
  await kit.socket.ask("POST", "/data/_test/logs/seed", { by: WALKER });
  const today = String((await kit.socket.ask("GET", "/data/_test/day")).body.day ?? "");

  // ---------------------------------------------------------------- LG1: what CERT-In asks
  const before =
    ((await kit.socket.ask("GET", "/data/logs")).body.systems as Body[] | undefined) ?? [];
  const text = await open(page, kit, PAGE, '[data-section="logs-cert-in"]');
  const asks = flat(await page.locator('[data-section="logs-cert-in"]').innerText());
  kit.check(
    "logs LG1: 'What CERT-In asks' gives both rule lines, the time servers and both readings",
    asks.includes("Keep the logs of every system") &&
      asks.includes("Set clocks from the NIC or NPL time servers") &&
      asks.includes("Confirm with your lawyer") &&
      asks.includes("samay1.nic.in, samay2.nic.in") &&
      asks.includes("time.nplindia.org") &&
      asks.includes("Within India.") &&
      asks.includes("Outside India, if produced in time.") &&
      asks.includes("CERT-In direction (iv) Logs kept for a rolling 180 days") &&
      asks.includes("CERT-In FAQ 35 Logs stored outside India"),
    asks.slice(0, 400),
  );
  if (kit.pass.first)
    kit.check(
      "logs LG1: with no system, the page says what to add",
      before.length > 0 ||
        (text.includes("No systems recorded. Add each system that keeps logs") &&
          text.includes(NOT_ADVICE)),
      text.slice(0, 200),
    );

  // ---------------------------------------------------------------- LG2: Walk Cloud
  if (kit.pass.first && !(await system(kit))) {
    const scope = page.locator(".pagebar__actions");
    await scope.locator("summary", { hasText: "Add a system" }).click();
    // The stand-in tools offer "walk-cloud"; in the merged copy the real Tools answers instead (the
    // tools walk runs after this one), so the system is typed as "something else" by its name.
    if ((await page.locator('#log-new-tool option[value="walk-cloud"]').count()) > 0)
      await page.selectOption("#log-new-tool", "walk-cloud");
    else {
      await page.selectOption("#log-new-tool", "");
      await page.fill("#log-new-name", "Walk Cloud");
    }
    await page.check("#log-new-kind-cloud");
    await page.check("#log-new-kind-sign_in");
    await page.fill("#log-new-where", "The cloud's log store");
    await page.fill("#log-new-kept", "30");
    await page.selectOption("#log-new-place", "outside");
    await page.fill("#log-new-region", "Walk Region 1");
    await page.selectOption("#log-new-time", "cloud");
    await page.selectOption("#log-new-zone", "yes");
    await scope.locator("form button", { hasText: "Add the system" }).click();
    await until(page, async () => (await system(kit)) !== null);
  }
  await open(page, kit, PAGE, "#table-logs-and-time");
  const row = flat(
    await page
      .locator(`#log-${SYSTEM}`)
      .innerText()
      .catch(() => ""),
  );
  kit.check(
    "logs LG2: Walk Cloud kept 30 days outside India: the retention line and its rule, both readings, the lawyer, the cloud's clock",
    row.includes("Walk Cloud") &&
      row.includes("Kept 30 days; direction (iv) says a rolling 180 days.") &&
      row.includes("Confirm with your lawyer") &&
      row.includes("Within India.") &&
      row.includes("Outside India, if produced in time.") &&
      row.includes("The sources disagree. Confirm with your lawyer.") &&
      row.includes("Uses its cloud's own time service, which CERT-In's FAQ 42 allows."),
    row.slice(0, 500),
  );
  const whole = flat(await kit.text());
  kit.check(
    "logs: the page says it is not advice, its quarterly interval, and no per cent sign",
    whole.includes(NOT_ADVICE) &&
      whole.includes("Every 3 months, HQ's default.") &&
      !whole.includes("%"),
  );
  await kit.audit("systems-logs");

  // ---------------------------------------------------------------- LG3: a look
  if (kit.pass.first && Number((await system(kit))?.looks ?? 0) === 0) {
    await open(page, kit, RECORD, '[data-section="log-looks"]');
    const scope = page.locator('[data-section="log-looks"]');
    await scope.locator("summary", { hasText: "Record a look" }).click();
    await page.fill("#log-look-by", "Walk Owner");
    await page.fill("#log-look-note", "The sign-in log arrives each day; the clock matches.");
    await scope.locator("form button", { hasText: "Record the look" }).click();
    await until(page, async () => Number((await system(kit))?.looks ?? 0) > 0);
  }
  const looked = await system(kit);
  const lastOn = String(((looked?.last_look as Body | null | undefined)?.on as string) ?? today);
  const record = await open(page, kit, RECORD, '[data-section="log-looks"]');
  kit.check(
    "logs LG3: after a look the next one is three months on",
    Number(looked?.looks ?? 0) > 0 &&
      looked?.next_look === threeMonthsOn(lastOn) &&
      record.includes(`Next look by ${dayWords(threeMonthsOn(lastOn))}.`),
    { next: looked?.next_look, text: record.slice(0, 200) },
  );
  await kit.audit("systems-log");

  kit.check("logs: the outbox did not grow", kit.outbox().length === outbox, {
    before: outbox,
    after: kit.outbox().length,
  });
}
