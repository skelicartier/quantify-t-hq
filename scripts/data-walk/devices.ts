/**
 * Systems › Devices, walked against the stand-in (ws-notes/security/spec.md §7.7): the empty
 * page (DV1); the laptop held by the walk's intern, "Walk Laptop 14", personal, a Mac, its
 * holder typed "Research intern": "Not checked yet" and two Due rows (DV2); a self-check with
 * encryption off and a screenshot made here: the check line (DV3); the acknowledgement on the
 * stand-in personal devices policy: its Due row goes (DV4); as the Owner, the link to "Walk
 * Intern One" once the people walk has put her in the ledger, and as the walk's Admin no
 * ledger column, the left-out line and no ledger name (DV5); the settings' screen-lock limit
 * and its line (DV6); 412px (DV7). Nothing leaves this Mac; the outbox does not grow.
 */

import { request } from "node:http";

import type { Page } from "playwright";

import { WALKER, type Shot, type WalkKit } from "./kit";

export const shots: Shot[] = [
  {
    name: "data-systems-devices",
    path: "/data/systems/devices",
    ready: '[data-section="devices-register"]',
  },
  {
    name: "data-systems-device",
    path: "/data/systems/devices/walk-device",
    ready: '[data-section="device-checks"]',
  },
];

type Body = Record<string, unknown>;

const PAGE = "/data/systems/devices";
const DEVICE = "walk-device";
const RECORD = `${PAGE}/${DEVICE}`;
const INTERN = "Walk Intern One";
const NOT_ADVICE = "A record and a reminder, not legal or certification advice.";
const LEFT_OUT =
  "Who each account and device belongs to in the people ledger, and the days worked out from a last day, are for the Owner only. They are left out here.";
/** A picture made here: the PNG signature and invented bytes. */
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("an invented screenshot of a disk-encryption setting, made by the walk"),
]);

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

/** The stand-in personal devices policy in Files, and `walk-device` for the first device added. */
export async function seed(socketPath: string): Promise<void> {
  if ((await ask(socketPath, "GET", "/data/devices")).status !== 200) {
    console.log("[walk] devices: the module is not loaded here");
    return;
  }
  await ask(socketPath, "POST", "/data/_test/devices/seed", { by: WALKER });
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();

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

const device = async (kit: WalkKit, owner = false): Promise<Body | null> => {
  const answer = await kit.socket.ask("GET", `/data/devices/${DEVICE}${owner ? "?owner=1" : ""}`);
  return answer.status === 200 ? answer.body : null;
};
const row = async (kit: WalkKit): Promise<Body | null> =>
  ((await device(kit))?.device as Body | undefined) ?? null;
const dueKeys = async (kit: WalkKit): Promise<string[]> =>
  (((await kit.socket.ask("GET", "/data/overview?due=all")).body.due as Body[] | undefined) ?? [])
    .map((item) => String(item.key))
    .filter((key) => key.startsWith(`device:${DEVICE}:`));

/** Opens a popover by its summary inside a part of the page, fills it and submits. */
async function submit(
  page: Page,
  part: string,
  summary: string,
  fill: () => Promise<void>,
  button: string,
): Promise<void> {
  const scope = page.locator(part);
  await scope.locator("summary", { hasText: summary }).first().click();
  await fill();
  await scope.locator("form button", { hasText: button }).first().click();
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/devices")).status !== 200) {
    kit.check("devices: not loaded in this service", true);
    return;
  }
  const outbox = kit.outbox().length;
  // The seed again, which is safe twice: a walk before this one may have restarted the worker on
  // purpose, and a restart forgets the stand-ins and the pinned id the first seed installed.
  const seeded = await kit.socket.ask("POST", "/data/_test/devices/seed", { by: WALKER });
  // In the merged copy the real Policies refuses the seed's stand-in (`real: true`), so the
  // walk's personal devices policy is linked through Policies' own route instead; safe twice.
  const standIn = seeded.body.policies as { real?: boolean } | false | undefined;
  const policyFile = typeof seeded.body.file_id === "string" ? seeded.body.file_id : "";
  if (standIn && standIn.real === true && policyFile) {
    const linked = (
      ((await kit.socket.ask("GET", "/data/policies")).body.policies as Body[] | undefined) ?? []
    ).find((item) => item.key === "personal_devices");
    if (linked?.file_id !== policyFile)
      await kit.socket.ask("POST", "/data/policies/personal_devices/link", {
        file_id: policyFile,
        by: WALKER,
      });
  }

  if (kit.pass.first) {
    // -------------------------------------------------------------- DV1: nothing recorded
    const empty =
      ((await kit.socket.ask("GET", "/data/devices?view=all")).body.devices as
        Body[] | undefined) ?? [];
    const text = await open(page, kit, PAGE, '[data-section="devices-register"]');
    kit.check(
      "devices DV1: the empty page says what to add, its control references and the monthly check",
      empty.length > 0 ||
        (text.includes("No devices recorded. Add every laptop and phone used for work") &&
          text.includes("ISO/IEC 27001:2022 A.8.1 User endpoint devices") &&
          text.includes("A.6.7 Remote working") &&
          text.includes("Every month, HQ's default.") &&
          text.includes(NOT_ADVICE)),
      text.slice(0, 300),
    );
    await kit.audit("systems-devices-empty");

    // -------------------------------------------------------------- DV2: the laptop
    if (!(await row(kit))) {
      await open(page, kit, PAGE, '[data-section="devices-register"]');
      await submit(
        page,
        ".pagebar__actions",
        "Add a device",
        async () => {
          await page.fill("#device-new-holder", "Research intern");
          await page.selectOption("#device-new-kind", "laptop");
          await page.selectOption("#device-new-ownership", "personal");
          await page.fill("#device-new-model", "Walk Laptop 14");
          await page.fill("#device-new-serial", "WALK-SERIAL-0001");
          await page.selectOption("#device-new-platform", "mac");
        },
        "Add the device",
      );
      await until(page, async () => (await row(kit)) !== null);
    }
    const added = await row(kit);
    const keys = await dueKeys(kit);
    const record = await open(page, kit, RECORD, '[data-section="device-checks"]');
    kit.check(
      "devices DV2: Walk Laptop 14, personal: 'Not checked yet' and two Due rows",
      added !== null &&
        record.includes("Walk Laptop 14") &&
        record.includes("Not checked yet") &&
        keys.includes(`device:${DEVICE}:check`) &&
        keys.includes(`device:${DEVICE}:ack`),
      { keys, text: record.slice(0, 200) },
    );

    // -------------------------------------------------------------- DV3: a self-check
    await submit(
      page,
      '[data-section="device-checks"]',
      "Record a self-check",
      async () => {
        await page.fill("#device-check-by", "Research intern");
        await page.selectOption("#device-check-encryption", "no");
        await page.fill("#device-check-lock", "30");
        await page.fill("#device-check-os", "26.1");
        await page.selectOption("#device-check-updates", "yes");
        await page.selectOption("#device-check-passwords", "yes");
        await page.selectOption("#device-check-malware", "not_applicable");
        await page.selectOption("#device-check-firewall", "yes");
        await page.selectOption("#device-check-local", "no");
        await page.setInputFiles("#device-check-shots", {
          name: "encryption.png",
          mimeType: "image/png",
          buffer: PNG,
        });
      },
      "Record the check",
    );
    const checked = await until(page, async () => Number((await row(kit))?.checks_count ?? 0) > 0);
    const shot = (((await row(kit))?.last_check as Body | undefined)?.evidence_file_ids ??
      []) as string[];
    kit.check(
      "devices DV3: the self-check was recorded with its screenshot in Files",
      checked && shot.length === 1,
      shot,
    );

    // -------------------------------------------------------------- DV4: the acknowledgement
    await open(page, kit, RECORD, '[data-section="device-acknowledgement"]');
    await submit(
      page,
      '[data-section="device-acknowledgement"]',
      "Record an acknowledgement",
      async () => {
        await page.fill("#device-ack-by", "Research intern");
        await page.selectOption("#device-ack-how", "signed");
      },
      "Record it",
    );
    await until(page, async () => (await row(kit))?.ack_state === "current");
    const after = await dueKeys(kit);
    kit.check(
      "devices DV4: the acknowledgement on the personal devices policy takes its Due row away",
      (await row(kit))?.ack_state === "current" && !after.includes(`device:${DEVICE}:ack`),
      { after, state: (await row(kit))?.ack_state },
    );

    // -------------------------------------------------------------- DV6: the screen-lock limit
    await open(page, kit, PAGE, '[data-section="devices-register"]');
    await submit(
      page,
      ".pagebar__actions",
      "Settings",
      async () => {
        await page.fill("#devices-setup-lock", "15");
      },
      "Save",
    );
    await until(
      page,
      async () =>
        ((await kit.socket.ask("GET", "/data/devices")).body.setup as Body | undefined)
          ?.screen_lock_max === 15,
    );
  }

  // ---------------------------------------------------------------- DV2–DV4, DV6: every pass
  const record = await open(page, kit, RECORD, '[data-section="device-checks"]');
  const checks = flat(await page.locator('[data-section="device-checks"]').innerText());
  kit.check(
    "devices DV3: the latest check says disk encryption is off, with its screenshot",
    checks.includes("Disk encryption is off.") &&
      checks.includes("Screenshots:") &&
      (await page.locator('[data-part="latest-check"] a[href^="/data/files/"]').count()) === 1,
    checks.slice(0, 300),
  );
  kit.check(
    "devices DV6: the screen lock is read against his limit",
    checks.includes("Locks after 30 minutes; your personal devices policy says 15."),
    checks.slice(0, 300),
  );
  const ack = flat(await page.locator('[data-section="device-acknowledgement"]').innerText());
  kit.check(
    "devices DV4: the acknowledgement is listed on version 1 of the walk's policy",
    ack.includes("Walk personal devices policy") && ack.includes("Version 1"),
    ack.slice(0, 200),
  );
  kit.check(
    "devices: the page says it is not advice, its references and its interval, and no per cent sign",
    record.includes(NOT_ADVICE) &&
      record.includes("ISO/IEC 27001:2022 A.8.1") &&
      record.includes("Every month, HQ's default.") &&
      !record.includes("%"),
  );
  await kit.audit("systems-device");

  const list = await open(page, kit, PAGE, '[data-section="devices-register"]');
  // `textContent`, not `innerText`: the table's heads are set in capitals by the style sheet.
  const table = flat((await page.locator("#table-devices").textContent()) ?? "");
  kit.check(
    "devices: the register lists the laptop with its holder, last check and next check",
    table.includes("Walk Laptop 14") &&
      table.includes("Research intern") &&
      table.includes("Personal") &&
      table.includes("Version 1") &&
      table.includes("In the people ledger") &&
      !list.includes("%"),
    table.slice(0, 300),
  );
  await kit.audit("systems-devices");

  // ---------------------------------------------------------------- DV5: the Owner's link
  const people =
    ((await kit.socket.ask("GET", "/data/people")).body.people as Body[] | undefined) ?? [];
  const intern = people.find((person) => person.name === INTERN);
  const ownerPart = ((await device(kit, true))?.owner as Body | undefined) ?? null;
  const linked = (ownerPart?.person as Body | null | undefined)?.name === INTERN;
  if (intern && !linked) {
    await open(page, kit, RECORD, '[data-section="device-ledger"]');
    await page.selectOption("#device-person", String(intern.person_id));
    await page
      .locator('[data-section="device-ledger"] form button', { hasText: "Save the link" })
      .click();
    const done = await until(
      page,
      async () =>
        ((((await device(kit, true))?.owner as Body | undefined)?.person as Body | null)?.name ??
          "") === INTERN,
    );
    const ownerTable = flat(
      await (async () => {
        await open(page, kit, PAGE, "#table-devices");
        return (await page.locator("#table-devices").textContent()) ?? "";
      })(),
    );
    kit.check(
      "devices DV5: as the Owner the laptop is linked to Walk Intern One in the people ledger",
      done && ownerTable.includes(INTERN),
      ownerTable.slice(0, 300),
    );
    await asAdmin(page, kit);
  } else if (!intern && kit.pass.width === "phone" && kit.pass.theme === "light") {
    kit.check("devices DV5: Walk Intern One is in the people ledger by the last pass", false);
  } else if (linked && kit.pass.width === "phone" && kit.pass.theme === "light") {
    kit.check("devices DV5: the laptop stays linked for the Owner", true);
  }

  // ---------------------------------------------------------------- DV7: 412px
  if (kit.pass.width === "phone") {
    await open(page, kit, PAGE, "#table-devices");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    kit.check(
      "devices DV7: at 412px the register does not run off the page",
      overflow <= 1,
      overflow,
    );
  }

  kit.check("devices: the outbox did not grow", kit.outbox().length === outbox, {
    before: outbox,
    after: kit.outbox().length,
  });
}

/** DV5 as the walk's Admin: no ledger column, the left-out line, and no name from the ledger. */
async function asAdmin(page: Page, kit: WalkKit): Promise<void> {
  const browser = page.context().browser();
  if (!browser) {
    kit.check("devices DV5: a browser for the Admin", false);
    return;
  }
  const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const admin = await other.newPage();
    await admin.goto(`${kit.base}/dev/signin?as=admin%40hq.test&next=%2Fdata%2Fsystems%2Fdevices`, {
      waitUntil: "networkidle",
    });
    await admin.goto(`${kit.base}${PAGE}`, { waitUntil: "networkidle" });
    const listText = flat(await admin.locator("main").first().innerText());
    const heads = (await admin.locator("#table-devices th").allTextContents()).map(flat);
    await admin.goto(`${kit.base}${RECORD}`, { waitUntil: "networkidle" });
    const recordText = flat(await admin.locator("main").first().innerText());
    const picker = await admin.locator("#device-person").count();
    const seen = [listText, recordText];
    const csv = await admin.request.get(`${kit.base}${PAGE}/export`);
    const csvText = await csv.text();
    kit.check(
      "devices DV5: as the walk's Admin the ledger columns are absent, the left-out line shows, and no ledger name",
      seen.every((text) => text.includes(LEFT_OUT) && !text.includes(INTERN)) &&
        !heads.includes("In the people ledger") &&
        !heads.includes("Owed by") &&
        picker === 0 &&
        csv.status() === 200 &&
        !csvText.includes(INTERN) &&
        !csvText.includes("in_the_people_ledger"),
      { heads, csv: csv.status(), seen: seen.map((text) => text.slice(0, 120)) },
    );
  } finally {
    await other.close();
  }
}
