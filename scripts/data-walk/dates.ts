/**
 * Key dates and the backup, walked against the stand-in: every suggestion shown with its
 * rule, who it applies to and "check with your CA", none added until "Add it" is pressed
 * (K2); a date added through "Add a date" landing in the overview's Due inside its
 * reminder window (K4); "Done" moving a monthly date on; the AGM date working out the
 * AGM-based ones; the CSV; and, from the overview, "Download a backup": a zip `unzip -t`
 * accepts, with Mail merge's files and never the key, after which "Last backup
 * downloaded" says so (B3). Every person and date is invented.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Page } from "playwright";

import { WALKER, type Shot, type WalkKit } from "./kit";

export const shots: Shot[] = [{ name: "data-dates", path: "/data/dates", ready: ".hqdata-dates" }];

type Answer = { status: number; body: Record<string, unknown> };

function ask(
  socket: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<Answer> {
  return new Promise((resolve, reject) => {
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
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
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

/** A calendar date plus whole days, with no zone involved. */
function addDays(day: string, count: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, date + count));
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "29 Nov 2026", as the page prints a calendar date. */
function dayWords(day: string): string {
  const [year = "", month = "", date = ""] = day.split("-");
  return `${Number(date)} ${MONTHS[Number(month) - 1] ?? ""} ${year}`;
}

/** Two dates he keeps, typed by hand, so the page has rows from the start (none suggested). */
export async function seed(socketPath: string): Promise<void> {
  const day = String((await ask(socketPath, "GET", "/data/_test/day")).body.day ?? "");
  if (!day || (await ask(socketPath, "GET", "/data/dates")).status !== 200) {
    console.log("[walk] dates: the module is not loaded here");
    return;
  }
  for (const date of [
    {
      title: "Invented: renew the walk domain",
      kind: "renewal",
      due_on: addDays(day, 40),
      repeats: "yearly",
      entity: "The Indian company",
      handled_by: "Walk Owner",
      remind_days: 14,
      notes: "Registrar account: the founders@ address.",
    },
    {
      title: "Invented: quarterly board pack",
      kind: "board",
      due_on: addDays(day, 75),
      repeats: "quarterly",
      entity: "The Indian company",
      handled_by: "Walk Owner",
      remind_days: 7,
      notes: "",
    },
  ])
    await ask(socketPath, "POST", "/data/dates", { ...date, by: WALKER });
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();

function passIndex(kit: WalkKit): number {
  return (kit.pass.width === "phone" ? 2 : 0) + (kit.pass.theme === "light" ? 1 : 0);
}

type Row = {
  date_id: string;
  title: string;
  due_on: string;
  from_suggestion: string | null;
  history: unknown[];
};
type Suggestion = { key: string; title: string; next: string | null };

async function dates(kit: WalkKit): Promise<{ dates: Row[]; suggestions: Suggestion[] }> {
  const body = (await kit.socket.ask("GET", "/data/dates?view=all")).body;
  return {
    dates: (body.dates as Row[] | undefined) ?? [],
    suggestions: (body.suggestions as Suggestion[] | undefined) ?? [],
  };
}

async function until(page: Page, test: () => Promise<boolean>): Promise<boolean> {
  for (let tries = 0; tries < 100; tries += 1) {
    if (await test()) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/dates")).status !== 200) {
    kit.check("dates: not loaded in this service", true);
    return;
  }
  const pass = passIndex(kit);
  const today = String((await kit.socket.ask("GET", "/data/_test/day")).body.day ?? "");

  // ---------------------------------------------------------------- K2: suggestions, never added alone
  let book = await dates(kit);
  await page.goto(`${kit.base}/data/dates`, { waitUntil: "networkidle" });
  await page.waitForSelector(".hqdata-dates", { timeout: 30_000 });
  let text = flat(await kit.text());
  if (kit.pass.first)
    kit.check(
      "dates K2: no suggested date is in the list until Add it is pressed",
      book.dates.every((date) => date.from_suggestion === null) &&
        book.suggestions.some((item) => item.key === "gstr-1"),
      book.dates.map((date) => date.from_suggestion),
    );
  kit.check(
    "dates: each suggestion shows its rule, who it applies to, and check with your CA",
    /suggested for an indian private company/i.test(text) &&
      text.includes("Applies when:") &&
      text.includes("Checked on 10 Nov 2026 · check with your CA") &&
      text.includes("AGM + 60 days"),
    text.slice(0, 200),
  );
  await kit.audit("dates");

  if (kit.pass.first) {
    const gstr = book.suggestions.find((item) => item.key === "gstr-1");
    await page.locator('button[aria-label="Add it: GSTR-1 (monthly filers)"]').click();
    const added = await until(page, async () =>
      (await dates(kit)).dates.some((date) => date.from_suggestion === "gstr-1"),
    );
    book = await dates(kit);
    const row = book.dates.find((date) => date.from_suggestion === "gstr-1");
    kit.check(
      "dates K2: Add it adds that one date, on the day its rule works out, and it leaves the suggestions",
      added &&
        row?.due_on === gstr?.next &&
        !book.suggestions.some((item) => item.key === "gstr-1") &&
        book.dates.filter((date) => date.from_suggestion !== null).length === 1,
      row,
    );

    // The AGM date works out the AGM-based ones (MGT-7A is AGM + 60 days).
    const agm = addDays(today, -41);
    await page.goto(`${kit.base}/data/dates`, { waitUntil: "networkidle" });
    await page.fill("#dates-agm", agm);
    await page.locator("button", { hasText: "Work the dates out" }).click();
    const worked = await until(page, async () =>
      (await dates(kit)).suggestions.some((item) => item.key === "mgt-7a" && item.next !== null),
    );
    await page.goto(`${kit.base}/data/dates`, { waitUntil: "networkidle" });
    text = flat(await kit.text());
    kit.check(
      "dates: the AGM date works out MGT-7A as AGM + 60 days",
      worked && text.includes(dayWords(addDays(agm, 60))),
      dayWords(addDays(agm, 60)),
    );
  }

  // ---------------------------------------------------------------- K4: one added by hand, in Due
  const title = `Invented monthly filing ${pass + 1}`;
  const due = addDays(today, 2);
  await page.goto(`${kit.base}/data/dates`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Add a date" }).click();
  const form = page.locator("form", { has: page.locator("#date-new-title") });
  await form.locator("#date-new-title").fill(title);
  await form.locator("#date-new-kind").selectOption("filing");
  await form.locator("#date-new-due").fill(due);
  await form.locator("#date-new-repeats").selectOption("monthly");
  await form.locator("#date-new-who").fill("The CA");
  await form.locator("#date-new-remind").selectOption("7");
  await form.locator("button", { hasText: "Add the date" }).click();
  const made = await until(page, async () =>
    (await dates(kit)).dates.some((date) => date.title === title),
  );
  kit.check("dates: Add a date adds it", made, title);
  await page.goto(`${kit.base}/data`, { waitUntil: "networkidle" });
  await page.waitForSelector(".hqdata-due", { timeout: 30_000 });
  const rows = await page.locator(".hqdata-due__row", { hasText: title }).allInnerTexts();
  kit.check(
    "dates K4: a date inside its reminder window is in Data › Due, as a key date",
    rows.length === 1 && /key date/i.test(rows[0] ?? ""),
    rows,
  );

  // ---------------------------------------------------------------- Done moves a monthly date on
  const mine = (await dates(kit)).dates.find((date) => date.title === title)!;
  await page.goto(`${kit.base}/data/dates`, { waitUntil: "networkidle" });
  const row = page.locator(`#date-${mine.date_id}`);
  await row.locator("summary", { hasText: "Done" }).click();
  await row.locator("textarea[name=note]").fill("Filed by the CA, invented SRN.");
  await row.locator("button", { hasText: "Mark it done" }).click();
  const rolled = await until(page, async () => {
    const now = (await dates(kit)).dates.find((date) => date.date_id === mine.date_id);
    return (now?.history.length ?? 0) === 1;
  });
  const after = (await dates(kit)).dates.find((date) => date.date_id === mine.date_id);
  kit.check(
    "dates K3: Done moves a monthly date to next month and keeps its history",
    rolled &&
      after !== undefined &&
      after.due_on > due &&
      after.due_on.slice(5, 7) !== due.slice(5, 7),
    after,
  );

  // ---------------------------------------------------------------- the CSV, the sheet for the CA
  const csv = await page.request.get(`${kit.base}/data/dates/export`);
  const body = await csv.text();
  kit.check(
    "dates: Download (CSV) gives every date",
    csv.status() === 200 &&
      body.startsWith("﻿due_on,what,kind") &&
      body.includes(title) &&
      body.includes("Invented: renew the walk domain"),
    `${csv.status()} ${body.slice(0, 80)}`,
  );

  // ---------------------------------------------------------------- B3: the backup, from the overview
  await page.goto(`${kit.base}/data`, { waitUntil: "networkidle" });
  await page.waitForSelector(".hqdata-due", { timeout: 30_000 });
  text = flat(await kit.text());
  if (!kit.pass.first) {
    kit.check(
      "backup B3: the overview says when the last backup was downloaded",
      text.includes("Last backup downloaded"),
      text.slice(-200),
    );
    return;
  }
  kit.check(
    "backup: no backup yet, and a button to download one",
    text.includes("No backup downloaded yet.") &&
      (await page.locator("button", { hasText: "Download a backup" }).count()) === 1,
    text.slice(-200),
  );
  const folder = mkdtempSync(join(tmpdir(), "hqwb-"));
  try {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000 }),
      page.locator("button", { hasText: "Download a backup" }).click(),
    ]);
    const path = join(folder, "backup.zip");
    await download.saveAs(path);
    let tested = false;
    try {
      execFileSync("unzip", ["-tq", path]);
      tested = true;
    } catch {
      tested = false;
    }
    const names = execFileSync("unzip", ["-Z1", path], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    // Mail merge writes its stop list only once something is on it.
    const stops =
      ((await kit.socket.ask("GET", "/stops")).body.stops as unknown[] | undefined) ?? [];
    const wanted = [
      "README.txt",
      "manifest-sha256.txt",
      "mail-merge/written.jsonl",
      "mail-merge/settings.json",
      "mail-merge/tests.jsonl",
      ...(stops.length ? ["mail-merge/stop-list.json"] : []),
      "data/data.json",
      "data/files/index.json",
      "data/dates/dates.json",
      "data/investors/firms.json",
      "data/leads/sources.json",
    ];
    const missing = wanted.filter((name) => !names.includes(name));
    kit.check(
      "backup B1: the zip unzips, with every Data record and Mail merge's files, and never the key",
      tested &&
        /^HQ Data backup \d{4}-\d{2}-\d{2}\.zip$/.test(download.suggestedFilename()) &&
        missing.length === 0 &&
        names.some((name) => name.startsWith("files/")) &&
        names.some((name) => name.startsWith("mail-merge/lists/")) &&
        names.some((name) => name.startsWith("mail-merge/mailings/")) &&
        !names.some((name) => /provider\.key|provider-status\.json|\.sock$/.test(name)),
      `${download.suggestedFilename()} · ${names.length} files · missing ${missing.join(", ") || "none"}`,
    );
    const readme = execFileSync("unzip", ["-p", path, "README.txt"], { encoding: "utf8" });
    kit.check(
      "backup: its README says who made it, and that it is not encrypted",
      /^Made on \d{1,2} [A-Z][a-z]{2} \d{4} by .+\. Not encrypted: keep it on an encrypted disk\./.test(
        readme,
      ),
      readme.slice(0, 120),
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
  await page.goto(`${kit.base}/data`, { waitUntil: "networkidle" });
  text = flat(await kit.text());
  kit.check(
    "backup B3: Last backup downloaded updates once it is downloaded",
    text.includes("Last backup downloaded") && !text.includes("No backup downloaded yet."),
    text.slice(-200),
  );
}
