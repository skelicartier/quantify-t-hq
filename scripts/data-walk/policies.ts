/**
 * Assurance › Policies, walked against the stand-in (ws-notes/security/spec.md §8.7): the
 * empty page, the eleven with no document (PO1); the walk's access control policy, a Files
 * document seeded with a review date ahead, linked through the page's picker and reading
 * "Current" (PO2); the walk's backup policy, its review date passed, reading "Review lapsed"
 * (PO3). Both documents are invented; nothing is sent.
 */

import { request } from "node:http";

import type { Page } from "playwright";

import { WALKER, type Shot, type WalkKit } from "./kit";

export const shots: Shot[] = [
  { name: "data-assurance-policies", path: "/data/assurance/policies", ready: "#table-policies" },
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
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const words = (day: string) => {
  const [year, month, date] = day.split("-");
  return `${Number(date)} ${MONTHS[Number(month) - 1]} ${year}`;
};

/** Two invented documents in Files: the access control policy (review ahead), the backup policy (review passed). */
export async function seed(socketPath: string): Promise<void> {
  const page = await ask(socketPath, "GET", "/data/policies");
  if (page.status !== 200) {
    console.log("[walk] policies: the module is not loaded here");
    return;
  }
  const today = String(page.body.today);
  const made = await ask(socketPath, "POST", "/data/_test/policies/seed", { by: WALKER });
  for (const file of (made.body.files as { key: string; file_id: string }[] | undefined) ?? [])
    await ask(socketPath, "POST", `/data/files/${file.file_id}/update`, {
      by: WALKER,
      review_by: file.key === "access_control" ? addDays(today, 90) : addDays(today, -1),
    });
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();
const PAGE = "/data/assurance/policies";

async function until(page: Page, test: () => Promise<boolean>, tries = 100): Promise<boolean> {
  for (let count = 0; count < tries; count += 1) {
    if (await test()) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

async function open(page: Page, kit: WalkKit): Promise<void> {
  await page.goto(`${kit.base}${PAGE}`, { waitUntil: "networkidle" });
  await page.waitForSelector("#table-policies", { timeout: 30_000 });
}

/** Links a policy to the walk's document through its row's picker; waits until the service has it. */
async function link(page: Page, kit: WalkKit, key: string, title: string): Promise<boolean> {
  const listed = (await kit.socket.ask("GET", "/data/policies")).body;
  const file = ((listed.files as { file_id: string; title: string }[] | undefined) ?? []).find(
    (item) => item.title === title,
  );
  if (!file) return false;
  await open(page, kit);
  const row = page.locator(`#policy-${key}`);
  await row.locator("summary", { hasText: "Link a document" }).first().click();
  await page.selectOption(`#policy-${key}-file`, file.file_id);
  await row.locator("form button", { hasText: "Link it" }).first().click();
  return until(page, async () => {
    const policies = ((await kit.socket.ask("GET", "/data/policies")).body.policies ??
      []) as Body[];
    return policies.some((item) => item.key === key && item.file_id === file.file_id);
  });
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  const here = await kit.socket.ask("GET", "/data/policies");
  if (here.status !== 200) {
    kit.check("policies: not loaded in this service", true);
    return;
  }
  const today = String(here.body.today);
  const outbox = kit.outbox().length;

  if (kit.pass.first) {
    // -------------------------------------------------------------- PO1: the empty page
    await open(page, kit);
    const rows = await page
      .locator("#table-policies tbody tr")
      .evaluateAll((items) =>
        items.map((item) => ({ id: item.id, text: (item as HTMLElement).innerText })),
      );
    // In the merged copy the devices walk, before this one, links its personal devices policy
    // through Policies (the real module refuses its stand-in), so that row is left out here.
    const devicesHere = (await kit.socket.ask("GET", "/data/devices")).status === 200;
    const others = rows.filter((row) => !(devicesHere && row.id === "policy-personal_devices"));
    kit.check(
      "policies PO1: the eleven a buyer asks for, none with a document, and his own empty",
      rows.length === 11 &&
        others.length >= 10 &&
        others.every(
          (row) => flat(row.text).includes("No document") && flat(row.text).includes("None linked"),
        ) &&
        flat(await kit.text()).includes("None of your own yet"),
      others.slice(0, 2).map((row) => flat(row.text)),
    );

    // -------------------------------------------------------------- PO2, PO3: link both
    const access = await link(page, kit, "access_control", "Walk access control policy");
    const backup = await link(page, kit, "backup", "Walk backup policy");
    kit.check("policies: both linked through the picker", access && backup, { access, backup });
  }

  // ---------------------------------------------------------------- every pass
  await open(page, kit);
  const access = flat(await page.locator("#policy-access_control").innerText());
  kit.check(
    "policies PO2: the access control policy is current, version 1, next review in 90 days",
    access.includes("Walk access control policy") &&
      access.includes("Current") &&
      access.includes(`Current; next review ${words(addDays(today, 90))}.`) &&
      access.includes("ISO/IEC 27001:2022 A.5.15 Access control") &&
      access.includes("In a trust pack as ‘Access control policy’."),
    access.slice(0, 400),
  );
  const backup = flat(await page.locator("#policy-backup").innerText());
  kit.check(
    "policies PO3: the backup policy's review has lapsed",
    backup.includes("Walk backup policy") &&
      backup.includes(`Review lapsed on ${words(addDays(today, -1))}.`),
    backup.slice(0, 300),
  );
  const whole = flat(await kit.text());
  kit.check(
    "policies: the page says it is not advice and writes no policy; no per cent sign",
    whole.includes("not legal or certification advice") && !whole.includes("%"),
  );
  await kit.audit("assurance-policies");
  kit.check("policies: the outbox did not grow", kit.outbox().length === outbox, {
    before: outbox,
    after: kit.outbox().length,
  });
}
