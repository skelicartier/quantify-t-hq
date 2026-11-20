/**
 * Assurance › Pen tests and findings, walked against the stand-in (ws-notes/security/spec.md
 * §8.7): the empty page (FI1); a pen test by "Walk Testers" with a report, and when the next
 * one is due (FI2); a high finding and its fix-by day and Due row (FI3); the walk's invented
 * dependency-alert file, saved by the seed in the stand-in's folder, through the preview: the
 * counts, the refused alert, the new findings (FI4); with the stand-in profiles (Walk
 * Capital's contract) the high alert's shorter day and the line that says why (FI5); and the
 * outbox not growing. Nothing connects to the code host.
 */

import { writeFileSync } from "node:fs";
import { request } from "node:http";
import { dirname, join } from "node:path";

import type { Page } from "playwright";

import { WALK_ALERTS_FILE, WALK_FINDING_ID, walkAlerts } from "../data/findings/walk-seed";
import { WALKER, type Shot, type WalkKit } from "./kit";

export const shots: Shot[] = [
  {
    name: "data-assurance-findings",
    path: "/data/assurance/findings",
    ready: '[data-section="findings-list"]',
  },
  {
    name: "data-assurance-finding",
    path: `/data/assurance/findings/${WALK_FINDING_ID}`,
    ready: '[data-section="finding-fix-by"]',
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

const pad = (value: number) => String(value).padStart(2, "0");
function addDays(day: string, count: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, date + count));
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}
function addMonths(day: string, months: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const index = month - 1 + months;
  const y = year + Math.floor(index / 12);
  const m = (((index % 12) + 12) % 12) + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${pad(m)}-${pad(Math.min(date, last))}`;
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const words = (day: string) => {
  const [year, month, date] = day.split("-");
  return `${Number(date)} ${MONTHS[Number(month) - 1]} ${year}`;
};

/** The stand-in profiles, the pinned finding id, and the invented alert file beside the socket. */
export async function seed(socketPath: string): Promise<void> {
  const page = await ask(socketPath, "GET", "/data/findings");
  if (page.status !== 200) {
    console.log("[walk] findings: the module is not loaded here");
    return;
  }
  await ask(socketPath, "POST", "/data/_test/findings/seed", { by: WALKER });
  writeFileSync(
    join(dirname(socketPath), WALK_ALERTS_FILE),
    JSON.stringify(walkAlerts(String(page.body.today))),
  );
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();
const PAGE = "/data/assurance/findings";
const HIGH_ALERT = "walk-parser: Walk parser reads past the end of a buffer";

async function until(page: Page, test: () => Promise<boolean>, tries = 150): Promise<boolean> {
  for (let count = 0; count < tries; count += 1) {
    if (await test()) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

async function open(
  page: Page,
  kit: WalkKit,
  path = PAGE,
  ready = '[data-section="findings-list"]',
) {
  await page.goto(`${kit.base}${path}`, { waitUntil: "networkidle" });
  await page.waitForSelector(ready, { timeout: 30_000 });
}

async function findings(kit: WalkKit): Promise<Body> {
  return (await kit.socket.ask("GET", "/data/findings?view=all")).body;
}

/** Opens a header action's popover, fills it and submits; waits until the service has it. */
async function act(
  page: Page,
  kit: WalkKit,
  summary: string,
  fill: () => Promise<void>,
  submit: string,
  done: (page: Body) => boolean,
): Promise<boolean> {
  await open(page, kit);
  const popover = page.locator("details.popover", {
    has: page.locator("summary", { hasText: summary }),
  });
  await popover.locator("summary").first().click();
  await fill();
  await popover.locator("form button", { hasText: submit }).first().click();
  return until(page, async () => done(await findings(kit)));
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  const here = await kit.socket.ask("GET", "/data/findings");
  if (here.status !== 200) {
    kit.check("findings: not loaded in this service", true);
    return;
  }
  const today = String(here.body.today);
  const reportOn = addDays(today, -30);
  const foundOn = addDays(today, -25);
  const standIn = Array.isArray(here.body.in_force) && here.body.in_force.length > 0;
  // The firm whose contract shortens the day: the stand-in's "Walk Capital", or in the merged
  // copy the real profiles walk's firm (its in-force duty, from the second pass on).
  const firm = String(
    (standIn
      ? ((here.body.in_force as Body[]).find((duty) => duty.key === "cscrf-patch") ??
        (here.body.in_force as Body[])[0])
      : undefined
    )?.firm ?? "Walk Capital",
  );
  const outbox = kit.outbox().length;

  if (kit.pass.first) {
    // -------------------------------------------------------------- FI1: the empty page
    await open(page, kit);
    const text = flat(await kit.text());
    kit.check(
      "findings FI1: no pen test, no findings, each saying what to add; the windows line",
      text.includes("No penetration test recorded. Buyers expect one at least once a year") &&
        text.includes(
          "No findings. Add what a test, a customer or you found, or import the dependency alerts.",
        ) &&
        text.includes("Fix within 7, 30, 90 and 180 days by severity."),
      text.slice(0, 400),
    );

    // -------------------------------------------------------------- FI2: a pen test
    const tested = await act(
      page,
      kit,
      "Record a pen test",
      async () => {
        await page.fill("#pen-test-new-tester", "Walk Testers");
        await page.selectOption("#pen-test-new-kind", "third_party");
        await page.fill("#pen-test-new-scope", "The walk app and its API");
        await page.fill("#pen-test-new-report", reportOn);
      },
      "Record it",
      (body) => ((body.pen_tests as Body[] | undefined) ?? []).length > 0,
    );

    // -------------------------------------------------------------- FI3: a high finding
    const found = await act(
      page,
      kit,
      "Add a finding",
      async () => {
        await page.fill("#finding-new-title", "Walk admin page has no rate limit");
        await page.selectOption("#finding-new-severity", "high");
        await page.selectOption("#finding-new-source", "self");
        await page.fill("#finding-new-found", foundOn);
      },
      "Add it",
      (body) =>
        ((body.findings as Body[] | undefined) ?? []).some(
          (item) => item.finding_id === WALK_FINDING_ID,
        ),
    );

    // -------------------------------------------------------------- FI4: the dependency alerts
    await open(page, kit);
    const popover = page.locator("details.popover", {
      has: page.locator("summary", { hasText: "Import dependency alerts" }),
    });
    await popover.locator("summary").first().click();
    const command = flat(await popover.innerText());
    kit.check(
      "findings FI4: the import prints the command and says HQ never connects to the code host",
      command.includes("gh api --paginate --slurp") &&
        command.includes("HQ never connects to it.") &&
        !/github/i.test(command.replace(/gh api[^\n]*json/, "")),
      command.slice(0, 300),
    );
    await page.setInputFiles("#alerts-file", join(dirname(kit.socket.path), WALK_ALERTS_FILE));
    await popover.locator("form button", { hasText: "Read the file" }).first().click();
    const previewed = await until(page, async () =>
      flat(await popover.innerText()).includes(
        "3 alerts in walk-org/walk-app: 3 new, 0 changed, 0 unchanged.",
      ),
    );
    const preview = flat(await popover.innerText());
    kit.check(
      "findings FI4: the preview's counts, the first rows and the refused alert with why",
      previewed &&
        preview.includes("Alert 4: no advisory id.") &&
        preview.includes("GHSA-2c3f-4g5h-6j7m") &&
        preview.includes("Import 3 alerts"),
      preview.slice(0, 500),
    );
    await popover.locator("form button", { hasText: "Import 3 alerts" }).first().click();
    const imported = await until(
      page,
      async () =>
        ((await findings(kit)).findings as Body[]).filter((item) => item.source === "dependabot")
          .length === 3,
    );
    kit.check(
      "findings: the pen test, the finding and the alerts went in through the page",
      tested && found && imported,
      {
        tested,
        found,
        imported,
      },
    );
  }

  // ---------------------------------------------------------------- every pass
  await open(page, kit);
  const tests = flat(await page.locator('[data-section="findings-pen-tests"]').innerText());
  kit.check(
    "findings FI2: Walk Testers' report and the next test 12 months after it",
    tests.includes("Walk Testers") &&
      tests.includes(words(reportOn)) &&
      tests.includes(`Next penetration test due ${words(addMonths(reportOn, 12))}.`) &&
      tests.includes("Every year, HQ's default."),
    tests.slice(0, 400),
  );
  const list = flat(await page.locator('[data-section="findings-list"]').innerText());
  kit.check(
    "findings FI3: the high finding, fix by 30 days after it was found",
    list.includes("Walk admin page has no rate limit") &&
      list.includes(`Fix by ${words(addDays(foundOn, 30))}`),
    list.slice(0, 400),
  );
  const due = ((await kit.socket.ask("GET", "/data/overview?due=all")).body.due as Body[]) ?? [];
  kit.check(
    "findings FI3: its Due row, from 7 days before its day",
    due.some(
      (row) =>
        row.key === `finding:${WALK_FINDING_ID}` &&
        row.title === "Fix Walk admin page has no rate limit" &&
        row.due_on === addDays(foundOn, 30),
    ),
    due.filter((row) => row.kind === "finding"),
  );
  kit.check(
    "findings FI4: the three alerts are findings; the overdue critical one says so",
    list.includes(HIGH_ALERT) &&
      list.includes("walk-session: Walk session tokens can be guessed") &&
      list.includes(`Overdue since ${words(addDays(today, -3))}`),
    list.slice(0, 600),
  );
  if (standIn)
    kit.check(
      "findings FI5: Walk Capital's contract makes the high alert 7 days, and says why",
      list.includes(`Fix by ${words(addDays(today, 7))}`) &&
        list.includes(
          `Shorter because of ${firm}'s contract: high-severity missing patches fixed within 1 week.`,
        ) &&
        list.includes(
          `Customers' contracts shorten some of these: ${firm} (high-severity missing patches within 1 week).`,
        ),
      list.slice(0, 700),
    );
  else kit.check("findings FI5: real profiles answer here; the merged walk checks it", true);
  const whole = flat(await kit.text());
  kit.check(
    "findings: not advice; no per cent sign; the code host is never named",
    whole.includes("not legal or certification advice") &&
      !whole.includes("%") &&
      !/github|dependabot/i.test(whole),
  );
  await kit.audit("assurance-findings");

  await open(page, kit, `${PAGE}/${WALK_FINDING_ID}`, '[data-section="finding-fix-by"]');
  const block = flat(await page.locator('[data-section="finding-fix-by"]').innerText());
  kit.check(
    "findings: a finding's page leads with its day and what can be done",
    block.includes(`Fix by ${words(addDays(foundOn, 30))}.`) &&
      block.includes("Within 30 days, HQ's default.") &&
      block.includes("Mark fixed") &&
      block.includes("Accept the risk"),
    block.slice(0, 300),
  );
  await kit.audit("assurance-finding");
  kit.check("findings: the outbox did not grow", kit.outbox().length === outbox, {
    before: outbox,
    after: kit.outbox().length,
  });
}
