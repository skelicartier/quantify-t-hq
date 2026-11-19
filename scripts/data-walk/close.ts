/**
 * Money › Month close and Numbers › MIS, walked against the stand-in (ws-notes/duties/spec.md
 * §9.12, CL1–CL8): the months with October's close by 6 Nov 2026 (CL1); the seven rows and
 * their facts (CL2); the lock's reasons (CL3); the rows marked, the pack recorded as sent to
 * "Walk CA" and October locked (CL4); the lines page showing the lock (CL5); the MIS's eight
 * headings, frozen (CL6); reopening refused without a reason and accepted with one (CL7); the
 * pack downloaded with the outbox unchanged (CL8). The walk's Admin reads the left-out lines.
 *
 * Walks run in name order within a pass, and the statements walk imports the walk statement
 * on the first pass, after this one: so the lock and what follows it (CL4 to CL8) are walked
 * once, on the second pass (desktop, light), when October has lines. After them the walk's
 * three months are locked, so their close rows leave Due's thirty rows to the other walks. Money, the people
 * ledger and the rule book are stand-ins put back each pass, never over a real one.
 */

import { request } from "node:http";

import type { Page } from "playwright";

import {
  ADMIN_PACK_WORDS,
  CLOSE_ITEMS,
  CLOSE_ITEM_KEYS,
  MIS_PARTS,
  REOPEN_WHY,
  STIPEND_OWNER_FACT,
  lockedWords,
} from "../../src/lib/data/labels-statements";
import { WALK_ACCOUNT_ID } from "../data/statements/walk-seed";
import { WALKER, type Shot, type WalkKit } from "./kit";

const MONTH = "2026-10";
const LINES_PATH = `/data/money/statements/${WALK_ACCOUNT_ID}?month=${MONTH}&view=all`;

export const shots: Shot[] = [
  { name: "data-money-close", path: "/data/money/close", ready: "#table-months" },
  { name: "data-money-close-month", path: `/data/money/close/${MONTH}`, ready: "#table-the-pack" },
  { name: "data-numbers-mis", path: "/data/numbers/mis", ready: "#table-mis-by-month" },
  { name: "data-numbers-mis-month", path: `/data/numbers/mis/${MONTH}`, ready: "#mis-revenue" },
];

function ask(
  socket: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<number> {
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
        response.resume();
        response.on("end", () => resolve(response.statusCode ?? 0));
      },
    );
    outgoing.on("error", reject);
    if (text) outgoing.write(text);
    outgoing.end();
  });
}

/** The rule book, the walk's bill and the walk intern's stipend, where no real module gives them. */
export async function seed(socketPath: string): Promise<void> {
  if ((await ask(socketPath, "GET", "/data/close")) !== 200) {
    console.log("[walk] close: the module is not loaded here");
    return;
  }
  await ask(socketPath, "POST", "/data/_test/close/seed", { by: WALKER });
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();

async function until(page: Page, test: () => Promise<boolean>, tries = 150): Promise<boolean> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    if (await test()) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

async function open(page: Page, kit: WalkKit, path: string, ready: string): Promise<void> {
  await page.goto(`${kit.base}${path}`, { waitUntil: "networkidle" });
  await page.waitForSelector(ready, { timeout: 30_000 });
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/close")).status !== 200) {
    kit.check("close: not loaded in this service", true);
    return;
  }
  await kit.socket.ask("POST", "/data/_test/close/seed", { by: WALKER });
  const months = ((await kit.socket.ask("GET", "/data/close")).body.months ?? []) as {
    period: string;
  }[];
  const october = months.some((month) => month.period === MONTH);

  // ---------------------------------------------------------------- CL1: the months
  await open(page, kit, "/data/money/close", "main h1");
  const list = flat(await kit.text());
  if (october) {
    const row = flat(
      await page.locator("#table-months tr", { hasText: "October 2026" }).innerText(),
    );
    // With the real holidays loaded (the merged copy), the holidays walk's company holiday on
    // 4 Nov 2026 moves October's close to 9 Nov 2026 from its first pass on.
    const holidays = await kit.socket.ask("GET", "/data/holidays?year=2026");
    const moved =
      holidays.status === 200 &&
      ((holidays.body.holidays ?? []) as { on: string; kind: string }[]).some(
        (day) => day.on === "2026-11-04" && day.kind !== "optional",
      );
    const by = moved ? "9 Nov 2026" : "6 Nov 2026";
    kit.check(
      `close CL1: Months lists October 2026 with Close by ${by}`,
      row.includes(`Close by ${by}`) && row.includes("of 7 ready"),
      row,
    );
  } else
    kit.check(
      "close CL1: with nothing recorded yet, Months says when the first month appears",
      list.includes("Nothing to close yet."),
      list.slice(0, 160),
    );
  await kit.audit("close");

  // ---------------------------------------------------------------- CL2 and CL3: the rows and the lock's reasons
  await open(page, kit, `/data/money/close/${MONTH}`, "#table-the-pack");
  const pack = flat(await page.locator("#table-the-pack").innerText());
  kit.check(
    "close CL2: the pack's seven rows, each with what is here",
    CLOSE_ITEM_KEYS.every((key) => pack.includes(CLOSE_ITEMS[key])) &&
      /accounts? (is|are) covered for the whole month|No bank or card account is recorded yet|Statements are not loaded here/.test(
        pack,
      ),
    pack.slice(0, 300),
  );
  const status = (await kit.socket.ask("GET", `/data/close/${MONTH}`)).body as {
    close?: { locked: unknown; items: Record<string, { state: string }> };
  };
  if (kit.pass.first && status.close && !status.close.locked) {
    const text = flat(await kit.text());
    await open(page, kit, "/data/money/close/2026-11", "#table-the-pack");
    const november = flat(await kit.text());
    kit.check(
      "close CL3: Lock lists its reasons, one a line",
      (text.includes("Purchase bills is still open.") ||
        status.close.items.bills?.state !== "open") &&
        text.includes("Record that the pack was sent first.") &&
        november.includes("November 2026 is not over yet."),
      text.slice(text.indexOf("Lock"), text.indexOf("Lock") + 300),
    );
  }
  await open(page, kit, `/data/money/close/${MONTH}`, "#table-the-pack");
  await kit.audit("close-month");

  // ---------------------------------------------------------------- the walk's Admin
  if (kit.pass.first) {
    const browser = page.context().browser();
    if (browser) {
      const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      try {
        const admin = await other.newPage();
        await admin.goto(`${kit.base}/dev/signin?as=admin%40hq.test&next=%2Fdata%2Fmoney%2Fclose`, {
          waitUntil: "networkidle",
        });
        await admin.goto(`${kit.base}/data/money/close/${MONTH}`, { waitUntil: "networkidle" });
        const month = flat(await admin.locator("main").first().innerText());
        await admin.goto(`${kit.base}/data/numbers/mis/${MONTH}`, { waitUntil: "networkidle" });
        const mis = flat(await admin.locator("main").first().innerText());
        kit.check(
          "close: the walk's Admin reads the left-out lines on the close, the pack and the MIS",
          month.includes(ADMIN_PACK_WORDS) &&
            month.includes(STIPEND_OWNER_FACT) &&
            !month.includes("15,000") &&
            mis.includes("The figures are for the Owner only.") &&
            !mis.includes("Intern stipends"),
          { month: month.slice(0, 120), mis: mis.slice(0, 120) },
        );
      } finally {
        await other.close();
      }
    }
  }

  // ---------------------------------------------------------------- CL4 to CL8, once, when October has lines
  const lines = (
    await kit.socket.ask(
      "GET",
      `/data/statements/accounts/${WALK_ACCOUNT_ID}/lines?owner=1&month=${MONTH}&view=all`,
    )
  ).body as { lines?: unknown[] };
  const once = !kit.pass.first && kit.pass.width === "desktop" && kit.pass.theme === "light";
  if (once && (lines.lines?.length ?? 0) > 0 && status.close && !status.close.locked) {
    // CL4: every row decided, sent to Walk CA, then Lock.
    for (const key of CLOSE_ITEM_KEYS) {
      if (status.close.items[key]?.state !== "open") continue;
      await open(page, kit, `/data/money/close/${MONTH}`, "#table-the-pack");
      const form = page.locator("form", { has: page.locator(`#state-${key}`) });
      await form
        .locator(`#state-${key}`)
        .selectOption(key === "gst_returns" ? "not_registered" : "ready");
      await form.locator("button", { hasText: "Save" }).click();
      await until(page, async () => (await form.innerText()).includes("Saved."));
    }
    await open(page, kit, `/data/money/close/${MONTH}`, "#table-the-pack");
    await page.locator("summary", { hasText: "Record that it was sent" }).click();
    const sent = page.locator("form", { has: page.locator("#sent-on") });
    await sent.locator("#sent-on").fill("2026-11-06");
    await sent.locator("#sent-to").fill("Walk CA");
    await sent.locator("#sent-how").fill("Email");
    await sent.locator("button", { hasText: "Record it" }).click();
    // The form is redrawn once it is saved: what the service holds is the proof.
    const recorded = await until(page, async () => {
      const close = (await kit.socket.ask("GET", `/data/close/${MONTH}`)).body.close as {
        sent?: { to_name: string } | null;
      };
      return close?.sent?.to_name === "Walk CA";
    });
    await open(page, kit, `/data/money/close/${MONTH}`, "#table-the-pack");
    await page.locator("button", { hasText: "Lock October 2026" }).click();
    const locked = await until(
      page,
      async () => (await kit.socket.ask("GET", `/data/close/${MONTH}`)).body.state === "locked",
    );
    await open(page, kit, `/data/money/close/${MONTH}`, "#table-the-pack");
    const pill = flat(await kit.text());
    const state = (await kit.socket.ask("GET", `/data/close/${MONTH}`)).body as { state?: string };
    kit.check(
      "close CL4: the rows marked, sent to Walk CA recorded, October locked",
      recorded &&
        locked &&
        state.state === "locked" &&
        pill.includes("October 2026 is locked since"),
      { state: state.state, page: pill.slice(0, 160) },
    );

    // CL5: the lines page shows the lock and no controls.
    await open(page, kit, LINES_PATH, "#table-lines");
    const linesText = flat(await kit.text());
    kit.check(
      "close CL5: October's lines show the lock's callout and no controls",
      linesText.includes(lockedWords(MONTH)) &&
        (await page.locator("select[name=category_id]").count()) === 0 &&
        !linesText.includes("Accept the sure matches"),
      linesText.slice(0, 200),
    );

    // CL6: the MIS's eight headings, frozen.
    await open(page, kit, `/data/numbers/mis/${MONTH}`, "#mis-revenue");
    const mis = flat(await kit.text());
    kit.check(
      "close CL6: the MIS has its eight headings and says when it was frozen",
      MIS_PARTS.every((part) => mis.includes(part)) && mis.includes("Frozen on"),
      mis.slice(0, 200),
    );
    await kit.audit("mis-month-frozen");

    // CL8: the pack downloads; nothing is sent.
    const outbox = kit.outbox().length;
    await open(page, kit, `/data/money/close/${MONTH}`, "#table-the-pack");
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      page.locator("button", { hasText: "Download the pack" }).click(),
    ]);
    kit.check(
      "close CL8: the pack downloads as CA pack 2026-10.zip and the outbox did not grow",
      download.suggestedFilename() === "CA pack 2026-10.zip" && kit.outbox().length === outbox,
      download.suggestedFilename(),
    );

    // CL7: reopen without a reason is refused; with one it goes through.
    const bare = await kit.socket.ask("POST", `/data/close/${MONTH}/reopen`, {
      why: "",
      by: WALKER,
    });
    await open(page, kit, `/data/money/close/${MONTH}`, "#table-the-pack");
    const required = await page.locator("#reopen-why").getAttribute("required");
    await page.locator("#reopen-why").fill("Walk: reopened to check that the lock holds.");
    await page.locator("button", { hasText: "Reopen October 2026" }).click();
    const reopened = await until(page, async () => {
      const close = (await kit.socket.ask("GET", `/data/close/${MONTH}`)).body.close as {
        locked: unknown;
        history: { verb: string; why: string }[];
      };
      return (
        close.locked === null &&
        close.history.at(-1)?.why === "Walk: reopened to check that the lock holds."
      );
    });
    kit.check(
      "close CL7: Reopen without a reason is refused; with one it goes through",
      bare.status === 400 &&
        JSON.stringify(bare.body).includes(REOPEN_WHY) &&
        required !== null &&
        reopened,
      bare.body,
    );
  }

  // ---------------------------------------------------------------- the walk's months, closed for good
  // Due shows 30 rows at most, overdue first: three months of the walk statement left open would
  // push later rows of other walks off it. Once CL4 to CL8 are walked, August, September and
  // October are closed and locked through the service, so Due holds none of them.
  if (once && (lines.lines?.length ?? 0) > 0) {
    for (const period of ["2026-08", "2026-09", MONTH]) {
      const now = (await kit.socket.ask("GET", `/data/close/${period}`)).body as {
        close?: { locked: unknown; sent: unknown; items: Record<string, { state: string }> };
      };
      if (!now.close || now.close.locked) continue;
      for (const key of CLOSE_ITEM_KEYS)
        if (now.close.items[key]?.state === "open")
          await kit.socket.ask("POST", `/data/close/${period}/items/${key}`, {
            state: key === "gst_returns" ? "not_registered" : "none_this_month",
            by: WALKER,
          });
      if (!now.close.sent)
        await kit.socket.ask("POST", `/data/close/${period}/sent`, {
          on: "2026-11-06",
          to_name: "Walk CA",
          how: "Email",
          by: WALKER,
        });
      await kit.socket.ask("POST", `/data/close/${period}/lock`, { by: WALKER });
    }
    const due = ((await kit.socket.ask("GET", "/data/overview?owner=1")).body.due ?? []) as {
      kind: string;
      title: string;
    }[];
    kit.check(
      "close: with the walk's three months locked, Due holds none of them",
      !due.some((item) => item.kind === "close" && /August|September|October/.test(item.title)),
      due.filter((item) => item.kind === "close").map((item) => item.title),
    );
  }

  // ---------------------------------------------------------------- the MIS pages, every pass
  await open(page, kit, "/data/numbers/mis", "main h1");
  await kit.audit("mis");
  await open(page, kit, `/data/numbers/mis/${MONTH}`, "#mis-revenue");
  const mis = flat(await kit.text());
  kit.check(
    "close: the MIS for October has its eight parts and no per cent sign",
    MIS_PARTS.every((part) => mis.includes(part)) && !mis.includes("%"),
    mis.slice(0, 120),
  );
  await kit.audit("mis-month");
}
