/**
 * The Data overview and the download page, walked: the honest counts from the stand-in's
 * live mailing, the empty states for modules not yet built, a download prepared and
 * fetched, and, on the first pass only, Data crashed five times and restarted (G6) and
 * the whole service taken offline and back (G5).
 */

import { request } from "node:http";

import type { Page } from "playwright";

import { PINNED, WALKER, type Shot, type WalkKit } from "./kit";

export const shots: Shot[] = [
  { name: "data-overview", path: "/data", ready: ".hqdata-due" },
  {
    name: "data-download-preparing",
    path: `/data/downloads/${PINNED.preparingBuild}`,
    ready: ".hqdata-download",
  },
];

function ask(
  socket: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
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

/** A download that never finishes, so the "preparing" page has something to show. */
export async function seed(socketPath: string): Promise<void> {
  await ask(socketPath, "POST", "/data/builds", {
    kind: "test_zip",
    build_id: PINNED.preparingBuild,
    files: 3,
    delay_ms: 86_400_000,
    by: WALKER,
  });
}

const flat = (text: string) => text.replace(/\s+/g, " ");

/**
 * "Sent today" as the written log has it now: the stand-in's live mailing's 290, plus any
 * live send a later walk made (All leads sends to two invented people to watch a row turn
 * Sent). The tile's label is set in capitals by CSS, so innerText reads "SENT TODAY 290".
 */
async function sentToday(kit: WalkKit): Promise<{ count: number; tile: RegExp }> {
  const count = Number((await kit.socket.ask("GET", "/data/overview")).body.sent_today ?? 0);
  return {
    count,
    tile: new RegExp(`Sent today ${count.toLocaleString("en-GB")} by Mail merge`, "i"),
  };
}

/** The modules this service loaded: a block or tile is there exactly when its module is. */
async function loadedModules(kit: WalkKit): Promise<Set<string>> {
  const status = (await kit.socket.ask("GET", "/data/status")).body.data as
    { modules?: { name: string; state: string }[] } | undefined;
  return new Set(
    (status?.modules ?? []).filter((item) => item.state === "ready").map((item) => item.name),
  );
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  // Builds live in the worker's memory: after the first pass crashed it, the pinned one is gone.
  if ((await kit.socket.ask("GET", `/data/builds/${PINNED.preparingBuild}`)).status !== 200)
    await seed(kit.socket.path);
  const sent = await sentToday(kit);
  const modules = await loadedModules(kit);
  const replies = modules.has("replies");
  await page.goto(`${kit.base}/data`, { waitUntil: "networkidle" });
  await page.waitForSelector(".hqdata-due", { timeout: 30_000 });
  let text = flat(await kit.text());
  kit.check("overview: the page is titled Data", /^Data\b/.test(text.trim()), text.slice(0, 80));
  kit.check(
    `overview: Sent today is the written log's ${sent.count} (the live mailing's 290 and any send since)`,
    sent.count >= 290 && sent.tile.test(text),
    text.slice(0, 200),
  );
  kit.check(
    "overview: nothing is sending once the mailing finished",
    text.includes("Nothing is sending."),
  );
  kit.check(
    replies
      ? "overview: the replies module's tiles are there"
      : "overview: tiles for modules not loaded are absent, not zero",
    replies
      ? /Replies today/i.test(text) && /Yes today/i.test(text) && /Follow-ups due/i.test(text)
      : !text.includes("Replies today") &&
          !text.includes("Yes today") &&
          !text.includes("Follow-ups due"),
  );
  const due = ((await kit.socket.ask("GET", "/data/overview")).body.due as unknown[]) ?? [];
  kit.check(
    due.length ? "overview: Due lists what is owed" : "overview: Due is empty with its sentence",
    due.length
      ? (await page.locator(".hqdata-due__row").count()) === due.length
      : text.includes("Nothing is due."),
    due.length,
  );
  kit.check(
    "overview: a block is there exactly when its module is",
    text.includes("Latest replies") === replies &&
      text.includes("Recent files") === modules.has("files") &&
      text.includes("Backup") === modules.has("backup"),
  );
  if (modules.has("files")) {
    // O5: the 8 most recently added or changed files, newest first.
    const recent = (await kit.socket.ask("GET", "/data/files?view=recent")).body.files as {
      title: string;
    }[];
    const shown = await page.locator("#table-recent-files tbody tr .table-title").allInnerTexts();
    kit.check(
      "overview: Recent files shows the 8 newest, newest first (O5)",
      shown.length === Math.min(8, recent.length) &&
        shown.every((title, index) => title === recent[index]?.title),
      shown.join(" | ").slice(0, 200),
    );
  }
  const weekRows = await page.locator("#table-this-week tbody tr").count();
  kit.check("overview: This week has seven days", weekRows === 7, weekRows);
  const weekTotal = (
    await page.locator("#table-this-week tbody tr td.data-table__num").allInnerTexts()
  ).reduce((sum, cell) => sum + Number(cell.replace(/,/g, "")), 0);
  kit.check("overview: the week's sends add up to today's", weekTotal === sent.count, weekTotal);
  kit.check(
    "overview: the actions are there",
    (await page.locator("a", { hasText: "Record a reply" }).count()) === 1 &&
      (await page.locator("a", { hasText: "Add files" }).count()) === 1,
  );
  await kit.audit("overview");

  // The download that is still being made.
  await page.goto(`${kit.base}/data/downloads/${PINNED.preparingBuild}`, {
    waitUntil: "networkidle",
  });
  text = flat(await kit.text());
  kit.check(
    "download: a build still being made says how far it has got",
    text.includes("Preparing your download") && text.includes("Walk files.zip · 0 of 3 files"),
    text.slice(0, 160),
  );
  kit.check(
    "download: no download link until it is ready",
    (await page.locator("a", { hasText: "Download Walk files.zip" }).count()) === 0,
  );
  await kit.audit("download-preparing");

  // A download made now, fetched through the portal.
  const made = await kit.socket.ask("POST", "/data/builds", {
    kind: "test_zip",
    files: 2,
    by: WALKER,
  });
  const buildId = String((made.body.build as { build_id?: string } | undefined)?.build_id ?? "");
  kit.check(
    "download: a build starts from the service",
    made.status === 200 && buildId !== "",
    made.body,
  );
  for (let tries = 0; tries < 50; tries += 1) {
    const state = (await kit.socket.ask("GET", `/data/builds/${buildId}`)).body.build as
      { state?: string } | undefined;
    if (state?.state === "ready") break;
    await page.waitForTimeout(100);
  }
  await page.goto(`${kit.base}/data/downloads/${buildId}`, { waitUntil: "networkidle" });
  text = flat(await kit.text());
  kit.check(
    "download: a ready build offers the file with its size",
    /Download Walk files\.zip \(\d+ B\)/.test(text) && text.includes("2 of 2 files"),
    text.slice(0, 200),
  );
  await kit.audit("download-ready");
  const file = await page.request.get(`${kit.base}/data/downloads/${buildId}/file`);
  const disposition = file.headers()["content-disposition"] ?? "";
  const body = await file.body();
  kit.check(
    "download: the file streams through the portal as a zip attachment",
    file.status() === 200 &&
      file.headers()["content-type"] === "application/zip" &&
      disposition.startsWith("attachment;") &&
      disposition.includes("Walk files.zip") &&
      body.length === Number(file.headers()["content-length"]) &&
      body.subarray(0, 4).toString("hex") === "504b0304",
    `${file.status()} ${file.headers()["content-type"]} ${disposition} ${body.length}`,
  );
  // A plain request, not a navigation: the browser logs a 404 page load as a console error.
  const missing = await page.request.get(`${kit.base}/data/downloads/not-a-build`);
  kit.check("download: an unknown build is not found", missing.status() === 404, missing.status());

  if (!kit.pass.first) return;

  // G6: five crashes leave Data off; Mail merge still lists its lists; Restart Data brings it back.
  for (let crash = 1; crash <= 5; crash += 1) {
    const answer = await kit.socket.ask("POST", "/data/_test/crash", { by: WALKER });
    kit.check(
      `crash ${crash}: the request in flight hears data_restarting`,
      answer.status === 503 &&
        (answer.body.error as { code?: string } | undefined)?.code === "data_restarting",
      answer.body,
    );
    if (crash < 5) await kit.socket.waitReady(30_000);
  }
  for (let tries = 0; tries < 40; tries += 1) {
    const status = (await kit.socket.ask("GET", "/data/status")).body.data as
      { state?: string } | undefined;
    if (status?.state === "stopped") break;
    await page.waitForTimeout(100);
  }
  await page.goto(`${kit.base}/data`, { waitUntil: "networkidle" });
  text = flat(await kit.text());
  kit.check(
    "stopped: every Data page says Data stopped after an error",
    text.includes("Data stopped after an error") && text.includes("Mail merge is still sending"),
    text.slice(0, 200),
  );
  await kit.audit("overview-stopped");
  await page.goto(`${kit.base}/mail/merge`, { waitUntil: "networkidle" });
  const mergeText = flat(await kit.text());
  kit.check(
    "stopped: Mail merge still lists its lists",
    mergeText.includes("Walk 01 - India named 1 of 20") && mergeText.includes("Mailings"),
    mergeText.slice(0, 200),
  );
  await page.goto(`${kit.base}/data`, { waitUntil: "networkidle" });
  await page.locator("button", { hasText: "Restart Data" }).click();
  await page.waitForSelector(".hqdata-due", { timeout: 45_000 });
  text = flat(await kit.text());
  kit.check(
    "restart: Restart Data brings the overview back",
    sent.tile.test(text),
    text.slice(0, 120),
  );

  // G5: the whole service away: every Data page says so, with the command, and comes back.
  const offline = await kit.socket.ask("POST", "/data/_test/offline", { seconds: 8 });
  kit.check(
    "offline: the stand-in agrees to go away for a moment",
    offline.status === 200,
    offline.body,
  );
  await page.waitForTimeout(800);
  await page.goto(`${kit.base}/data`, { waitUntil: "networkidle" });
  text = flat(await kit.text());
  kit.check(
    "down: the page says the service is not running and how to start it",
    text.includes("The service on this computer is not running") &&
      text.includes("npm run mail-merge"),
    text.slice(0, 200),
  );
  await kit.audit("overview-down");
  await kit.socket.waitReady(30_000);
  await page.goto(`${kit.base}/data`, { waitUntil: "networkidle" });
  text = flat(await kit.text());
  kit.check("back: the overview answers again once the service is back", sent.tile.test(text));
}
