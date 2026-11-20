/**
 * Systems › Backups, walked against the stand-in (ws-notes/security/spec.md §7.7): the empty
 * inventory with Data's own row (RC1); "Walk product database" added and restored in 75
 * minutes: "1 hour 15 minutes" (RC2); Data's own row, first, with when its zip was last
 * downloaded and "Make one" (RC3); the Due row of a backup never restore-tested, then a restore
 * recorded so the walk leaves nothing owed (RC4); the outbox did not grow (RC5). No target
 * anywhere: a restore records how long it took.
 */

import { request } from "node:http";

import type { Page } from "playwright";

import { WALKER, type Shot, type WalkKit } from "./kit";

export const shots: Shot[] = [
  {
    name: "data-systems-backups",
    path: "/data/systems/backups",
    ready: '[data-section="backups-inventory"]',
  },
];

type Body = Record<string, unknown>;

const PAGE = "/data/systems/backups";
const BACKUP = "walk-backup";
const RECORD = `${PAGE}/${BACKUP}`;
const NAME = "Walk product database";
const NOT_ADVICE = "A record and a reminder, not legal or certification advice.";

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

/** The stand-in tools while Tools is absent (the logs walk's, when it seeded first), and `walk-backup`. */
export async function seed(socketPath: string): Promise<void> {
  if ((await ask(socketPath, "GET", "/data/recovery")).status !== 200) {
    console.log("[walk] recovery: the module is not loaded here");
    return;
  }
  await ask(socketPath, "POST", "/data/_test/recovery/seed", { by: WALKER });
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayWords = (day: string) => {
  const [year, month, date] = day.split("-");
  return `${Number(date)} ${MONTHS[Number(month) - 1]} ${year}`;
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

const inventory = async (kit: WalkKit): Promise<Body> =>
  (await kit.socket.ask("GET", "/data/recovery")).body;
const backups = async (kit: WalkKit): Promise<Body[]> =>
  ((await inventory(kit)).backups as Body[] | undefined) ?? [];

async function addBackup(page: Page, kit: WalkKit, fill: () => Promise<void>) {
  await open(page, kit, PAGE, '[data-section="backups-inventory"]');
  const scope = page.locator(".pagebar__actions");
  await scope.locator("summary", { hasText: "Add a backup" }).click();
  await fill();
  await scope.locator("form button", { hasText: "Add the backup" }).click();
}

async function restore(page: Page, kit: WalkKit, path: string, minutes: string) {
  await open(page, kit, path, '[data-section="backup-tests"]');
  const scope = page.locator('[data-section="backup-tests"]');
  await scope.locator("summary", { hasText: "Record a restore test" }).click();
  await page.fill("#backup-test-by", "Walk Engineer");
  await page.fill("#backup-test-minutes", minutes);
  await page.selectOption("#backup-test-outcome", "complete");
  await page.fill("#backup-test-what", "Every table, into a spare database");
  await scope.locator("form button", { hasText: "Record the restore" }).click();
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/recovery")).status !== 200) {
    kit.check("recovery: not loaded in this service", true);
    return;
  }
  const outbox = kit.outbox().length;
  // The seed again, which is safe twice: a walk before this one may have restarted the worker on
  // purpose, and a restart forgets the stand-ins and the pinned id the first seed installed.
  await kit.socket.ask("POST", "/data/_test/recovery/seed", { by: WALKER });

  if (kit.pass.first) {
    // -------------------------------------------------------------- RC1: the empty inventory
    const before = await backups(kit);
    const text = await open(page, kit, PAGE, '[data-section="backups-inventory"]');
    kit.check(
      "recovery RC1: the empty inventory says what to add, with A.8.13 and the restore interval",
      before.length > 0 ||
        (text.includes("Add each one: the product's database, the code") &&
          text.includes("ISO/IEC 27001:2022 A.8.13 Information backup") &&
          text.includes("Every 3 months, HQ's default.") &&
          text.includes(NOT_ADVICE)),
      text.slice(0, 300),
    );
    await kit.audit("systems-backups-empty");

    // -------------------------------------------------------------- RC2: a restore of 75 minutes
    if (!before.some((row) => row.backup_id === BACKUP)) {
      await addBackup(page, kit, async () => {
        await page.selectOption("#backup-new-kind", "system");
        await page.fill("#backup-new-name", NAME);
        await page.fill("#backup-new-what", "The product's database, every table");
        await page.selectOption("#backup-new-often", "daily");
        await page.fill("#backup-new-where", "Walk Cloud's backup store, another region");
        await page.selectOption("#backup-new-away", "yes");
        await page.selectOption("#backup-new-fixed", "yes");
        await page.fill("#backup-new-owner", "Walk Engineer");
      });
      await until(page, async () => (await backups(kit)).some((row) => row.backup_id === BACKUP));
      await restore(page, kit, RECORD, "75");
      await until(page, async () =>
        (await backups(kit)).some((row) => row.backup_id === BACKUP && row.last_test),
      );
    }

    // -------------------------------------------------------------- RC4: never restore-tested
    if (!(await backups(kit)).some((row) => row.kind === "hq_data")) {
      await addBackup(page, kit, async () => {
        await page.selectOption("#backup-new-kind", "hq_data");
        await page.selectOption("#backup-new-often", "by_hand");
        await page.fill("#backup-new-where", "This Mac's Downloads, then a disk");
      });
      await until(page, async () => (await backups(kit)).some((row) => row.kind === "hq_data"));
    }
    const data = (await backups(kit)).find((row) => row.kind === "hq_data");
    const key = `backup:${String(data?.backup_id ?? "")}`;
    const due = ((await kit.socket.ask("GET", "/data/overview?due=all")).body.due as Body[]) ?? [];
    const row = due.find((item) => item.key === key);
    await open(page, kit, "/data", ".hqdata-due");
    const onData = flat(await page.locator(".hqdata-due").innerText());
    kit.check(
      "recovery RC4: a backup never restore-tested is in Due, on Data's own list",
      row?.title === "Restore test: Data on this Mac" &&
        row.sub === "Never tested" &&
        onData.includes("Restore test: Data on this Mac"),
      { row, data: onData.slice(0, 200) },
    );
    // A restore, so the walk leaves nothing owed for the walks after it.
    if (data && !data.last_test) {
      await restore(page, kit, `${PAGE}/${String(data.backup_id)}`, "10");
      await until(page, async () =>
        (await backups(kit)).some((item) => item.kind === "hq_data" && item.last_test),
      );
    }
  }

  // ---------------------------------------------------------------- RC2, RC3: every pass
  const page1 = await open(page, kit, PAGE, "#table-backups");
  const rows = (await page.locator("#table-backups tbody tr").allInnerTexts()).map(flat);
  const words = String(((await inventory(kit)).data_backup as Body | null)?.words ?? "");
  kit.check(
    "recovery RC3: Data's own row comes first, with when its zip was last downloaded and 'Make one'",
    (rows[0] ?? "").startsWith("Data on this Mac") &&
      (rows[0] ?? "").includes(words) &&
      (await page
        .locator('#table-backups tbody tr:first-child a[href="/data#data-backup"]')
        .count()) === 1,
    { first: rows[0], words },
  );
  const product = rows.find((text) => text.startsWith(NAME)) ?? "";
  const next = String(
    (await backups(kit)).find((item) => item.backup_id === BACKUP)?.next_test ?? "",
  );
  kit.check(
    "recovery RC2: Walk product database restored in 1 hour 15 minutes, complete, and its next test",
    product.includes("1 hour 15 minutes") &&
      product.includes("Complete") &&
      next !== "" &&
      product.includes(dayWords(next)),
    { product, next },
  );
  kit.check(
    "recovery: the page says it is not advice, and no target, per cent sign or bar",
    page1.includes(NOT_ADVICE) && !page1.includes("%") && !/\btarget\b/i.test(page1),
  );
  await kit.audit("systems-backups");
  const record = await open(page, kit, RECORD, '[data-section="backup-tests"]');
  kit.check(
    "recovery RC2: the backup's page lists the restore and how long it took",
    record.includes("1 hour 15 minutes") && record.includes("Restore tests"),
    record.slice(0, 200),
  );
  await kit.audit("systems-backup");

  // ---------------------------------------------------------------- RC5: nothing sent
  kit.check("recovery RC5: the outbox did not grow", kit.outbox().length === outbox, {
    before: outbox,
    after: kit.outbox().length,
  });
}
