/**
 * Trademarks, walked against the stand-in (ws-notes/duties/spec.md §6.6): the empty page
 * (MK1); "WALK MARK", class 9, added, its examination report recorded, and the reply's row
 * reading the day a month on (MK2); the fee block with both readings and "Nothing is worked
 * out" (MK3); the reply's Due row on /data (MK4); and nothing sent. Invented marks only.
 */

import { request } from "node:http";

import type { Page } from "playwright";

import { WALKER, type Shot, type WalkKit } from "./kit";

export const shots: Shot[] = [
  { name: "data-registers-marks", path: "/data/registers/marks", ready: ".hqdata-marks" },
  {
    name: "data-registers-mark",
    path: "/data/registers/marks/walk-mark",
    ready: '[data-section="mark-dates"]',
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

/** The rule book's own amounts, and `walk-mark` for the next mark added. */
export async function seed(socketPath: string): Promise<void> {
  if ((await ask(socketPath, "GET", "/data/marks")).status !== 200) {
    console.log("[walk] marks: the module is not loaded here");
    return;
  }
  await ask(socketPath, "POST", "/data/_test/marks/seed", { by: WALKER });
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();
const pad = (value: number) => String(value).padStart(2, "0");
const PAGE = "/data/registers/marks";
const RECORD = `${PAGE}/walk-mark`;

function addDays(day: string, count: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, date + count));
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}

/** The same day a month on, or that month's last day. */
function monthOn(day: string): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const y = year + Math.floor(month / 12);
  const m = (month % 12) + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${pad(m)}-${pad(Math.min(date, last))}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dayWords(day: string): string {
  const [year = "", month = "", date = ""] = day.split("-");
  return `${Number(date)} ${MONTHS[Number(month) - 1] ?? ""} ${year}`;
}

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

async function walkMark(kit: WalkKit): Promise<Body | null> {
  const answer = await kit.socket.ask("GET", "/data/marks/walk-mark");
  return answer.status === 200 ? answer.body : null;
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/marks")).status !== 200) {
    kit.check("marks: not loaded in this service", true);
    return;
  }
  const outbox = kit.outbox().length;
  const today = String((await kit.socket.ask("GET", "/data/_test/day")).body.day ?? "");
  const reportOn = addDays(today, -3);
  const replyBy = monthOn(reportOn);

  if (kit.pass.first) {
    // -------------------------------------------------------------- MK1: nothing recorded
    const text = await open(page, kit, PAGE, ".hqdata-marks");
    kit.check(
      "marks MK1: no marks yet, and why each mark goes in once per class",
      text.includes("No marks recorded. Add each mark once per class"),
      text.slice(0, 200),
    );

    // -------------------------------------------------------------- MK2: a mark, its report
    await page.locator("summary", { hasText: "Add a mark and class" }).click();
    await page.fill("#mark-new-name", "WALK MARK");
    await page.fill("#mark-new-class", "9");
    await page.fill("#mark-new-application", "WALK-0000001");
    await page.fill("#mark-new-applied", addDays(today, -20));
    await page.fill("#mark-new-agent", "Walk Agent");
    await page
      .locator("form", { has: page.locator("#mark-new-name") })
      .locator("button", { hasText: "Add the mark" })
      .click();
    await until(page, async () => (await walkMark(kit)) !== null);
    await open(page, kit, RECORD, '[data-section="mark-dates"]');
    const dates = page.locator('[data-section="mark-dates"]');
    await dates.locator("summary", { hasText: "Record a step" }).click();
    await page.selectOption("#mark-step-step", "exam_report");
    await page.fill("#mark-step-on", reportOn);
    await dates.locator("form button", { hasText: "Record the step" }).click();
    await until(page, async () => {
      const mark = (await walkMark(kit))?.mark as Body | undefined;
      return (mark?.steps as Body | undefined)?.exam_report_on === reportOn;
    });
  }

  const record = await open(page, kit, RECORD, '[data-section="mark-dates"]');
  const reply = flat(
    await page
      .locator("#clock-exam_reply")
      .innerText()
      .catch(() => ""),
  );
  kit.check(
    "marks MK2: WALK MARK, class 9 reads Objected, and the reply is due a month after the report",
    record.includes("WALK MARK, class 9") &&
      record.includes("Objected") &&
      reply.includes("Reply to the examination report") &&
      reply.includes(dayWords(replyBy)) &&
      reply.includes("Confirm with your trademark agent"),
    reply,
  );
  await kit.audit("registers-mark");

  // ---------------------------------------------------------------- MK3: the fee block
  const list = await open(page, kit, PAGE, ".hqdata-marks");
  const fee = flat(await page.locator('[data-section="marks-fee"]').innerText());
  kit.check(
    "marks MK3: the fee block gives both readings and works nothing out",
    fee.includes("The sources give ₹4,500 and ₹9,000.") &&
      fee.includes("Nothing is worked out until your trademark agent confirms one.") &&
      list.includes(`Reply by ${dayWords(replyBy)}`) &&
      !list.includes("%"),
    fee.slice(0, 260),
  );
  await kit.audit("registers-marks");

  // ---------------------------------------------------------------- MK4: the Due row
  if (kit.pass.first) {
    await page.goto(`${kit.base}/data`, { waitUntil: "networkidle" });
    const due = await until(page, async () =>
      flat(await kit.text()).includes("Reply to the examination report: WALK MARK, class 9"),
    );
    kit.check("marks MK4: the reply's Due row is on /data", due);
  }
  kit.check("marks: nothing was sent", kit.outbox().length === outbox);
}
