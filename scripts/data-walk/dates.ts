/**
 * Key dates and the backup, walked against the stand-in: every suggestion shown with its
 * rule, who it applies to and "check with your CA", none added until "Add it" is pressed
 * (K2); a date added through "Add a date" landing in the overview's Due inside its
 * reminder window (K4); "Done" moving a monthly date on; the AGM date working out the
 * AGM-based ones; the CSV; and, from the overview, "Download a backup": a zip `unzip -t`
 * accepts, with Mail merge's files and never the key, after which "Last backup
 * downloaded" says so (B3). Every person and date is invented.
 *
 * The company batch (company spec §6.11): the first AGM worked out from the company record
 * with its source (KD1); the generic director rows hidden for each director's own (KD2);
 * "Not for us" on a statutory date only with the professional's sign-off (KD3), on a typed
 * one with a note as before (KD4); the late fee and the evidence of a filing, its copy kept
 * in Files (KD5); "In progress" still in Due (KD6); the rule book's amounts and
 * confirmations (KD7, KD8), printed with its sources (KD9), and the intern (KD10).
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Page } from "playwright";

import { WALKER, type Shot, type WalkKit } from "./kit";

export const shots: Shot[] = [
  { name: "data-dates", path: "/data/dates", ready: ".hqdata-dates" },
  { name: "data-dates-rules", path: "/data/dates?view=rules", ready: "#table-rules-the-company" },
];

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

    // KD1–KD3 run before the AGM date is typed: until then the AGM is the first AGM.
    await companyRows(page, kit, today);

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

  // ---------------------------------------------------------------- KD4–KD10: the company batch
  await evidenceAndRules(page, kit, today);

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

// ------------------------------------------------------------------ the company batch (KD1–KD10)

type DateRow = {
  date_id: string;
  title: string;
  state: string;
  from_suggestion: string | null;
  evidence: { srn: string; filed_file_id: string | null };
};

async function rows(kit: WalkKit): Promise<DateRow[]> {
  return ((await kit.socket.ask("GET", "/data/dates?view=all")).body.dates as DateRow[]) ?? [];
}

async function csvRow(page: Page, kit: WalkKit, title: string): Promise<Record<string, string>> {
  const body = (await (await page.request.get(`${kit.base}/data/dates/export`)).text()).replace(
    /^\ufeff/,
    "",
  );
  const lines = body.split("\r\n").filter(Boolean);
  const split = (line: string): string[] => {
    const cells: string[] = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index]!;
      if (quoted) {
        if (char === '"' && line[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else if (char === '"') quoted = false;
        else cell += char;
      } else if (char === '"') quoted = true;
      else if (char === ",") {
        cells.push(cell);
        cell = "";
      } else cell += char;
    }
    cells.push(cell);
    return cells;
  };
  const header = split(lines[0] ?? "");
  const found =
    lines
      .slice(1)
      .map(split)
      .find((cells) => cells[1] === title) ?? [];
  return Object.fromEntries(header.map((name, index) => [name, found[index] ?? ""]));
}

/** KD1–KD3, first pass, while the AGM is still the first AGM. */
async function companyRows(page: Page, kit: WalkKit, today: string): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/company")).status !== 200) {
    kit.check("dates KD1–KD3: the company module is not loaded here", true);
    return;
  }
  await page.goto(`${kit.base}/data/dates`, { waitUntil: "networkidle" });
  await page.waitForSelector(".hqdata-dates", { timeout: 30_000 });
  const agm = page.locator("#suggested-agm");
  const agmText = flat(await agm.innerText());
  const source = agm.locator("a.hqdata-source").first();
  kit.check(
    "dates KD1: the record's AGM is due 31 Dec 2026, from the first year, with its source and Confirm with your CS",
    (await page.getByText("Worked out from the company record").count()) > 0 &&
      agmText.includes("Annual general meeting") &&
      agmText.includes("Due 31 Dec 2026") &&
      agmText.includes("From the first financial year ending 31 Mar 2026") &&
      agmText.includes("Confirm with your CS") &&
      /^https:\/\//.test((await source.getAttribute("href")) ?? "") &&
      (await source.getAttribute("target")) === "_blank" &&
      ((await source.getAttribute("rel")) ?? "").includes("noopener"),
    agmText,
  );
  const hidden = flat((await page.locator(".hqdata-dates__hidden").textContent()) ?? "");
  const text = flat(await kit.text());
  kit.check(
    "dates KD2: the generic DIR-3 KYC and DSC rows are not shown, and Walk Director's own KYC is offered",
    hidden.includes("DIR-3 KYC, each director: Each director has their own row below.") &&
      hidden.includes("Director's DSC (Class 3): Each director has their own row below.") &&
      text.includes("DIR-3 KYC: Walk Director"),
    hidden,
  );

  // KD3: added, then "Not for us" refused without the sign-off and taken with it.
  await page.locator('button[aria-label="Add it: Annual general meeting"]').click();
  await until(page, async () => (await rows(kit)).some((date) => date.from_suggestion === "agm"));
  const added = (await rows(kit)).find((date) => date.from_suggestion === "agm");
  await page.goto(`${kit.base}/data/dates`, { waitUntil: "networkidle" });
  const row = page.locator(`#date-${added?.date_id ?? "none"}`);
  await row.locator("summary", { hasText: "Not for us" }).click();
  const form = row.locator("form", { has: page.locator('input[name="sign_off_name"]') });
  await form.locator('input[name="note"]').fill("Held already, invented.");
  await form.locator("button", { hasText: "Mark it not for us" }).click();
  const refused = await until(page, async () =>
    (await form.innerText()).includes(
      "Say which professional confirmed it does not apply, their role and the day.",
    ),
  );
  await form.locator('input[name="sign_off_name"]').fill("Walk CS");
  await form.locator('select[name="sign_off_role"]').selectOption("CS");
  await form.locator("button", { hasText: "Mark it not for us" }).click();
  const signed = await until(page, async () =>
    (await rows(kit)).some(
      (date) => date.date_id === added?.date_id && date.state === "not_for_us",
    ),
  );
  const csv = await csvRow(page, kit, "Annual general meeting");
  kit.check(
    "dates KD3: Not for us on the AGM is refused without the sign-off, then kept with Walk CS (CS) in the CSV",
    Boolean(added) && refused && signed && csv.not_for_us_signed_off_by === "Walk CS (CS)",
    { refused, signed, csv: csv.not_for_us_signed_off_by },
  );
  void today;
}

/** KD4–KD10: a typed date set aside, the late fee and evidence, in progress, the rule book. */
async function evidenceAndRules(page: Page, kit: WalkKit, today: string): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/dates/rules")).status !== 200) {
    kit.check("dates KD4–KD10: the rule book is not loaded here", true);
    return;
  }
  if (kit.pass.first) {
    // KD4: a date he typed, set aside with a note only, as before.
    const typed = (
      await kit.socket.ask("POST", "/data/dates", {
        title: "Walk renewal",
        kind: "renewal",
        due_on: addDays(today, 120),
        repeats: "never",
        remind_days: 14,
        by: WALKER,
      })
    ).body.date as DateRow | undefined;
    await page.goto(`${kit.base}/data/dates`, { waitUntil: "networkidle" });
    const row = page.locator(`#date-${typed?.date_id ?? "none"}`);
    await row.locator("summary", { hasText: "Not for us" }).click();
    const asked = await row.locator('input[name="sign_off_name"]').count();
    await row.locator('input[name="note"]').fill("We let it lapse, invented.");
    await row.locator("button", { hasText: "Mark it not for us" }).click();
    const set = await until(page, async () =>
      (await rows(kit)).some(
        (date) => date.date_id === typed?.date_id && date.state === "not_for_us",
      ),
    );
    kit.check("dates KD4: a typed date is not for us with only a note", asked === 0 && set, {
      asked,
      set,
    });

    // KD5: an AOC-4 a day late, then done with its evidence and a filed copy.
    const result = (
      await kit.socket.ask("POST", "/data/_test/key-dates", {
        call: "add",
        args: [
          [
            {
              origin: { key: "walk:kd5", label: "Invented AGM", href: "/data/company" },
              rule_key: "aoc-4",
              base_on: addDays(today, -31),
              title: "Walk filing: AOC-4",
            },
          ],
        ],
        by: WALKER,
      })
    ).body.result as { date_id: string }[] | undefined;
    const lateId = result?.[0]?.date_id ?? "none";
    await page.goto(`${kit.base}/data/dates`, { waitUntil: "networkidle" });
    const late = page.locator(`#date-${lateId}`);
    const lateText = flat(await late.innerText());
    await late.locator("summary", { hasText: "Done" }).click();
    await late.locator('input[name="srn"]').fill("WALK-SRN-2");
    await late.locator('input[name="fee_paid"]').fill("300");
    await late.locator('input[name="file"]').setInputFiles({
      name: "walk-aoc-4.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n% an invented filed copy for the walk\n%%EOF\n"),
    });
    await late.locator("button", { hasText: "Mark it done" }).click();
    const done = await until(page, async () =>
      (await rows(kit)).some((date) => date.date_id === lateId && date.state === "done"),
    );
    const kept = (await rows(kit)).find((date) => date.date_id === lateId);
    const file = kept?.evidence.filed_file_id
      ? (await kit.socket.ask("GET", `/data/files/${kept.evidence.filed_file_id}`)).body
      : {};
    await page.goto(`${kit.base}/data/dates?view=done`, { waitUntil: "networkidle" });
    const evidence = flat(await page.locator(`#date-${lateId}`).innerText());
    kit.check(
      "dates KD5: a day late reads ₹100 so far; done, the evidence shows the SRN, the fee and the copy, kept in 09 MCA filings",
      lateText.includes("1 day late: ₹100 so far") &&
        done &&
        evidence.includes("SRN WALK-SRN-2") &&
        evidence.includes("₹300") &&
        evidence.includes("Filed copy") &&
        JSON.stringify(file).includes("09 MCA filings and compliance"),
      { lateText: lateText.slice(0, 160), evidence: evidence.slice(0, 200) },
    );

    // KD6: in progress, and still in Due.
    const soon = (
      await kit.socket.ask("POST", "/data/dates", {
        title: "Walk filing in progress",
        kind: "filing",
        due_on: addDays(today, 3),
        repeats: "never",
        remind_days: 7,
        by: WALKER,
      })
    ).body.date as DateRow | undefined;
    await page.goto(`${kit.base}/data/dates`, { waitUntil: "networkidle" });
    await page.locator('button[aria-label="In progress: Walk filing in progress"]').click();
    await until(page, async () =>
      (await rows(kit)).some(
        (date) => date.date_id === soon?.date_id && date.state === "in_progress",
      ),
    );
  }
  await page.goto(`${kit.base}/data/dates`, { waitUntil: "networkidle" });
  const progress = page.locator("tr", { hasText: "Walk filing in progress" });
  const pill = (await progress.count()) > 0 ? flat(await progress.first().innerText()) : "";
  await page.goto(`${kit.base}/data`, { waitUntil: "networkidle" });
  await page.waitForSelector(".hqdata-due", { timeout: 30_000 });
  const owed = await page
    .locator(".hqdata-due__row", { hasText: "Walk filing in progress" })
    .count();
  kit.check(
    "dates KD6: an in-progress date reads In progress and is still in Due",
    pill.includes("In progress") && owed === 1,
    {
      pill: pill.slice(0, 120),
      owed,
    },
  );

  // KD7: the rule book's amount and confirmation.
  const rulesPath = `${kit.base}/data/dates?view=rules`;
  const rule = async (key: string) => {
    await page.goto(rulesPath, { waitUntil: "networkidle" });
    await page.waitForSelector("#table-rules-the-company", { timeout: 30_000 });
    return flat(await page.locator(`#rule-${key}`).innerText());
  };
  const ruleBody = async (key: string) =>
    (
      ((await kit.socket.ask("GET", "/data/dates/rules")).body.rules as Record<
        string,
        unknown
      >[]) ?? []
    ).find((item) => item.key === key) ?? {};
  if (kit.pass.first) {
    const before = await rule("pas-3");
    const setAmount = async (amount: string) => {
      const row = page.locator("#rule-pas-3");
      await row.locator("summary", { hasText: "Change the amount" }).click();
      await row.locator('input[name="amount"]').fill(amount);
      await row.locator("form button", { hasText: "Save" }).click();
      await until(page, async () => (await ruleBody("pas-3")).amount === Number(amount));
    };
    await setAmount("30");
    const changed = await rule("pas-3");
    const row = page.locator("#rule-pas-3");
    await row.locator("summary", { hasText: "Record a confirmation" }).click();
    await row.locator('input[name="name"]').fill("Walk CS");
    await row.locator('select[name="role"]').selectOption("CS");
    await row.locator("form button", { hasText: "Record it" }).click();
    await until(page, async () => (await ruleBody("pas-3")).confirmed !== null);
    const confirmed = await rule("pas-3");
    await setAmount("15");
    const dropped = await rule("pas-3");
    kit.check(
      "dates KD7: PAS-3 reads 15 days and Confirm with your CS; 30 reads Changed from 15; confirmed by Walk CS; back to 15 drops it",
      before.includes("15 days after the allotment") &&
        before.includes("Confirm with your CS") &&
        changed.includes("30 days after the allotment") &&
        changed.includes("Changed from 15") &&
        confirmed.includes("Confirmed by Walk CS, CS") &&
        dropped.includes("15 days after the allotment") &&
        !dropped.includes("Confirmed by") &&
        dropped.includes("Confirm with your CS"),
      { before, changed, confirmed, dropped },
    );
  }

  // KD8: a rule the sources disagree on.
  const advance = await rule("advance-receipt");
  kit.check(
    "dates KD8: the advance-receipt report reads Only once confirmed",
    advance.includes("Only once confirmed"),
    advance,
  );
  await kit.audit("dates-rules");

  // KD9: printed, the sources' addresses and no buttons.
  await page.emulateMedia({ media: "print" });
  const printed = {
    url: flat(await page.locator("#rule-pas-3").innerText()).includes("(https://"),
    buttons: await page.locator("main button:visible").count(),
    summaries: await page.locator("main .hqdata-rules summary:visible").count(),
  };
  await page.emulateMedia({ media: "screen" });
  kit.check(
    "dates KD9: printed, the Rules view writes each source's address and shows no button",
    printed.url && printed.buttons === 0 && printed.summaries === 0,
    printed,
  );

  // KD10: the intern.
  if (kit.pass.first) {
    const browser = page.context().browser();
    if (browser) {
      const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const intern = await other.newPage();
      await intern.goto(
        `${kit.base}/dev/signin?as=intern%40hq.test&next=${encodeURIComponent("/data/dates?view=rules")}`,
        { waitUntil: "networkidle" },
      );
      await intern.goto(rulesPath, { waitUntil: "networkidle" });
      const body = await intern.locator("main").first().innerText();
      kit.check(
        "dates KD10: as the intern the Rules view says the role line",
        body.includes("Data is for Owners and Admins.") && !body.includes("Confirm with your"),
        body.slice(0, 120),
      );
      await other.close();
    }
  }
}
