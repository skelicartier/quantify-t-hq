/**
 * Money › Statements, walked against the stand-in (ws-notes/duties/spec.md §9.12, ST1–ST8):
 * the Owner's empty page (ST1); the walk's Admin seeing only the Owner line (ST2); the
 * account added on the page (ST3); the walk statement imported in two steps, the preview
 * saying how it read and that the lines add up (ST4); the same file again refused (ST5);
 * October's lines with "Accept the sure matches (1)" against the stand-in Money (ST6); a
 * category on the stipend line (ST7); 412px and no "%" (ST8).
 *
 * The statement is made here from invented lines (`walk-seed.ts`), never a file in the
 * repository: "Walk Bank current ··0000", references starting WALK-, "Walk Intern One".
 * Money, the people ledger and the rule book are the stand-ins of the close's seed, put back
 * at the start of each pass (a worker restart drops them) and never over a real one. With the
 * real Money loaded (the merged copy), the line's bill is recorded there for ST6 and the
 * categories are Money's own (Stipends, Customer receipts).
 */

import { request } from "node:http";

import type { Page } from "playwright";

import {
  NO_ACCOUNTS,
  STATEMENTS_OWNER_LINE,
  acceptSureWords,
} from "../../src/lib/data/labels-statements";
import { WALK_ACCOUNT, WALK_ACCOUNT_ID, walkStatementCsv } from "../data/statements/walk-seed";
import { WALKER, type Shot, type WalkKit } from "./kit";

const LINES_PATH = `/data/money/statements/${WALK_ACCOUNT_ID}?month=2026-10&view=all`;

export const shots: Shot[] = [
  { name: "data-money-statements", path: "/data/money/statements", ready: "#table-accounts" },
  { name: "data-money-statement-lines", path: LINES_PATH, ready: "#table-lines" },
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

/** The stand-ins the Statements and Month close pages need, where no real module gives them. */
export async function seed(socketPath: string): Promise<void> {
  if ((await ask(socketPath, "GET", "/data/statements/summary")) !== 200) {
    console.log("[walk] statements: the module is not loaded here");
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

type Summary = { accounts: { account_id: string; name: string }[] };

/** The vendor of the line's bill in the real Money (merged copy only); invented. */
const REAL_LEGAL_VENDOR = "Walk Legal Services LLP";

/** §3.5 case 4's open bill, in the real Money: made once, before the first pass's matching. */
async function realLegalBill(kit: WalkKit): Promise<void> {
  const vendors = ((await kit.socket.ask("GET", "/data/money/vendors")).body.vendors ?? []) as {
    vendor_id: string;
    name: string;
  }[];
  let vendorId = vendors.find((vendor) => vendor.name === REAL_LEGAL_VENDOR)?.vendor_id ?? "";
  if (!vendorId) {
    const added = await kit.socket.ask("POST", "/data/money/vendors", {
      name: REAL_LEGAL_VENDOR,
      residency: "resident",
      tds_kind: "professional",
      by: WALKER,
    });
    vendorId = String((added.body.vendor as { vendor_id?: string } | undefined)?.vendor_id ?? "");
  }
  const page = (await kit.socket.ask("GET", `/data/money/vendors/${vendorId}`)).body as {
    bills?: { invoice_number: string }[];
  };
  if (!vendorId || page.bills?.some((bill) => bill.invoice_number === "WALK-INV-0007")) return;
  await kit.socket.ask("POST", "/data/money/bills", {
    vendor_id: vendorId,
    invoice_number: "WALK-INV-0007",
    invoice_on: "2026-10-02",
    taxable: "10000",
    gst: "1800",
    attempt: crypto.randomUUID(),
    by: WALKER,
  });
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  const summary = await kit.socket.ask("GET", "/data/statements/summary");
  if (summary.status !== 200) {
    kit.check("statements: not loaded in this service", true);
    return;
  }
  await kit.socket.ask("POST", "/data/_test/close/seed", { by: WALKER });
  const accounts = (summary.body as unknown as Summary).accounts;
  const walkAccount = () =>
    accounts.find((item) => item.account_id === WALK_ACCOUNT_ID || item.name === WALK_ACCOUNT.name);

  // ---------------------------------------------------------------- ST1: the Owner's empty page
  if (kit.pass.first) {
    await open(page, kit, "/data/money/statements", "main h1");
    const text = flat(await kit.text());
    kit.check(
      "statements ST1: with no account, the Owner reads the first act",
      accounts.length > 0 || text.includes(NO_ACCOUNTS),
      accounts.length > 0 ? "an account was already here" : text.slice(0, 200),
    );
    await kit.audit("statements-empty");
  }

  // ---------------------------------------------------------------- ST2: the walk's Admin
  if (kit.pass.first) {
    const browser = page.context().browser();
    if (browser) {
      const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      try {
        const admin = await other.newPage();
        await admin.goto(
          `${kit.base}/dev/signin?as=admin%40hq.test&next=%2Fdata%2Fmoney%2Fstatements`,
          { waitUntil: "networkidle" },
        );
        const seen: string[] = [];
        for (const path of ["/data/money/statements", LINES_PATH, "/data/money/close"]) {
          await admin.goto(`${kit.base}${path}`, { waitUntil: "networkidle" });
          seen.push(flat(await admin.locator("main").first().innerText()));
        }
        const tabs = await admin
          .locator('nav[aria-label="Money"] a[href="/data/money/statements"]')
          .count();
        kit.check(
          "statements ST2: the walk's Admin sees only the Owner line, and no Statements tab",
          seen[0]!.includes(STATEMENTS_OWNER_LINE) &&
            seen[1]!.includes(STATEMENTS_OWNER_LINE) &&
            !seen[0]!.includes("Walk Bank") &&
            !seen[1]!.includes("NEFT") &&
            tabs === 0,
          seen.map((text) => text.slice(0, 100)),
        );
      } finally {
        await other.close();
      }
    }
  }

  // ---------------------------------------------------------------- ST3: add the account
  if (kit.pass.first && !walkAccount()) {
    await open(page, kit, "/data/money/statements", "main h1");
    await page.locator("summary", { hasText: "Add an account" }).click();
    const form = page.locator("form", { has: page.locator("#account-name") });
    await form.locator("#account-name").fill(WALK_ACCOUNT.name);
    await form.locator("#account-bank").fill(WALK_ACCOUNT.bank);
    await form.locator("#account-last4").fill(WALK_ACCOUNT.last4);
    await form.locator("#account-currency").selectOption("INR");
    await form.locator("button", { hasText: "Add the account" }).click();
    const added = await until(page, async () =>
      (await form.innerText()).includes("Added the account. Import its statements next."),
    );
    const pinned = await kit.socket.ask("POST", "/data/_test/statements/pin", {
      name: WALK_ACCOUNT.name,
      by: WALKER,
    });
    kit.check(
      "statements ST3: Add an account keeps the name and the last four digits only",
      added && pinned.status === 200,
      pinned.body,
    );
  }

  // ---------------------------------------------------------------- ST4 and ST5: import, then the same file again
  if (kit.pass.first) {
    const file = {
      name: "walk-bank-current-2026-08-to-10.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(walkStatementCsv(), "utf8"),
    };
    const listed = (await kit.socket.ask("GET", "/data/statements?owner=1")).body as {
      accounts?: { account_id: string; statements: unknown[] }[];
    };
    const already =
      (listed.accounts ?? []).find((item) => item.account_id === WALK_ACCOUNT_ID)?.statements
        .length ?? 0;
    for (const round of already > 0 ? (["again"] as const) : (["first", "again"] as const)) {
      await open(page, kit, "/data/money/statements", "main h1");
      await page.locator("summary", { hasText: "Import a statement" }).click();
      const read = page.locator("form", { has: page.locator("#import-file") });
      await read.locator("#import-account").selectOption(WALK_ACCOUNT_ID);
      await read.locator("#import-file").setInputFiles(file);
      await read.locator("button", { hasText: "Read the file" }).click();
      const shown = await until(page, async () =>
        flat(await page.locator(".hqdata-import").innerText()).includes(
          "Read as comma-separated, day first.",
        ),
      );
      const said = flat(await page.locator(".hqdata-import").innerText());
      if (round === "first") {
        kit.check(
          "statements ST4: the preview says how it read and that the lines add up",
          shown &&
            said.includes(
              "Read as comma-separated, day first. 13 lines from 1 Aug to 31 Oct 2026.",
            ) &&
            said.includes(
              "Opening balance ₹16,50,000.00 · closing ₹12,00,000.00 · the lines add up.",
            ),
          said.slice(0, 300),
        );
        await kit.audit("statements-preview");
        await page.locator(".hqdata-import button", { hasText: /^Import$/ }).click();
        const done = await until(page, async () =>
          flat(await page.locator(".hqdata-import").innerText()).includes("Imported 13 lines."),
        );
        kit.check("statements ST4: Import keeps the 13 lines", done);
      } else {
        await page.locator(".hqdata-import button", { hasText: /^Import$/ }).click();
        const refused = await until(page, async () =>
          /This file is already here, imported on \d+ \w{3} \d{4}\./.test(
            flat(await page.locator(".hqdata-import").innerText()),
          ),
        );
        kit.check(
          "statements ST5: the same file again is refused, with the day it was imported",
          shown && said.includes("This file is already here") && refused,
          said.slice(0, 200),
        );
      }
    }
  }

  // ---------------------------------------------------------------- ST6 and ST7: October's lines
  // With the real Money loaded (the merged copy), its own bill WALK-INV-0007 is the money walk's
  // November bill, already paid there with tax deducted, so no line can pay it. The line's bill
  // of §3.5 case 4 is then recorded in the real Money (an invented vendor of its own, dated
  // 2 Oct 2026, ₹10,000 and ₹1,800 GST), and the categories are Money's own starter ones.
  const realMoney = (await kit.socket.ask("GET", "/data/money/ledger")).status === 200;
  const category = async (name: string, fallback: string): Promise<string> => {
    if (!realMoney) return fallback;
    const ledger = (await kit.socket.ask("GET", "/data/money/ledger")).body as {
      categories?: { category_id: string; name: string }[];
    };
    return ledger.categories?.find((item) => item.name === name)?.category_id ?? fallback;
  };
  if (kit.pass.first && realMoney) await realLegalBill(kit);
  await open(page, kit, LINES_PATH, "#table-lines");
  if (kit.pass.first) {
    const text = flat(await kit.text());
    const offered = text.includes(acceptSureWords(1));
    if (offered) {
      await page.locator("button", { hasText: acceptSureWords(1) }).click();
      await until(page, async () => flat(await kit.text()).includes("1 match accepted."));
    }
    await open(page, kit, LINES_PATH, "#table-lines");
    const legal = flat(
      await page.locator("#table-lines tr", { hasText: "WALK LEGAL LLP" }).first().innerText(),
    );
    kit.check(
      "statements ST6: Accept the sure matches (1) pays Walk Legal LLP WALK-INV-0007 from its line",
      offered &&
        legal.includes(`${realMoney ? REAL_LEGAL_VENDOR : "Walk Legal LLP"} WALK-INV-0007`),
      legal.slice(0, 200),
    );
    const stipends = realMoney ? "Stipends" : "Intern stipends";
    const row = page.locator("#table-lines tr", { hasText: "INTERN ONE STIPEND" }).first();
    await row
      .locator("select[name=category_id]")
      .selectOption(await category("Stipends", "walk-cat-stipends"));
    await row.locator(".hqdata-statements__category button", { hasText: "Save" }).click();
    const sorted = await until(page, async () => (await row.innerText()).includes("Saved."));
    await open(page, kit, LINES_PATH, "#table-lines");
    const after = flat(
      await page.locator("#table-lines tr", { hasText: "INTERN ONE STIPEND" }).first().innerText(),
    );
    kit.check(
      `statements ST7: the stipend line takes the category ${stipends}`,
      sorted && after.includes(stipends),
      after.slice(0, 200),
    );
    // The two customer receipts are income, so October's net burn is §5.5's for the Numbers walk.
    const lines = (
      await kit.socket.ask(
        "GET",
        `/data/statements/accounts/${WALK_ACCOUNT_ID}/lines?owner=1&month=2026-10&view=all`,
      )
    ).body as { lines?: { line_id: string; narration: string }[] };
    const august = (
      await kit.socket.ask(
        "GET",
        `/data/statements/accounts/${WALK_ACCOUNT_ID}/lines?owner=1&month=2026-08&view=all`,
      )
    ).body as { lines?: { line_id: string; narration: string }[] };
    const receipts = await category("Customer receipts", "walk-cat-subscriptions");
    for (const line of [...(lines.lines ?? []), ...(august.lines ?? [])])
      if (line.narration.includes("SUBSCRIPTION"))
        await kit.socket.ask("POST", `/data/statements/lines/${line.line_id}/category`, {
          category_id: receipts,
          owner: true,
          by: WALKER,
        });
  }
  await kit.audit("statement-lines");

  // ---------------------------------------------------------------- ST8: 412px, no per cent sign
  await open(page, kit, "/data/money/statements", "#table-accounts");
  const text = flat(await kit.text());
  await kit.audit("statements");
  if (kit.pass.width === "phone") {
    const lines = flat(
      await (async () => {
        await open(page, kit, LINES_PATH, "#table-lines");
        return kit.text();
      })(),
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    kit.check(
      "statements ST8: at 412px the lines fit and no page says “%”",
      overflow <= 1 && !text.includes("%") && !lines.includes("%"),
      `${overflow}px`,
    );
  }
}
