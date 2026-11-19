/**
 * The duties batch's seams in the browser, with every module loaded (duties spec §3.5, §11 step
 * 4, §15). Each unit walked its half against stand-ins; this walk checks the halves meet: the
 * Rules view's count line is the rule book's (M1); an export invoice reads "Not worked out",
 * then a day once the realisation rule is confirmed, and "Not worked out" again once the
 * confirmation is taken back (M2); October's close moving with the company holiday of 4 Nov
 * 2026 (M3); "Accept the sure matches" having paid the real Money bill, its page showing the
 * UTR (M4); the lock's callout on an October bill and October's lines, and a stipend payment
 * dated in October refused with the lock's sentence (M5); the MIS's part 3 equal to the
 * frozen update's cash line (M6); the walk's Admin seeing no Statements tab and the left-out
 * lines on the cash view, the MIS and the pack (M7); a held file refused in Files' trash (M8);
 * the lead's two merge fixes: Due keeping every row owed and saying how many later rows it
 * left out, with a link to all of them (M10), and Home's Data block, whose due chips never sit
 * on a title at either width (M11); and the outbox unchanged (M9).
 *
 * The walks run in the order of their names, so this one runs after close and dates and before
 * holidays, money, numbers, people and statements, which make the records it reads in their
 * first pass (the walk statement, its matches, the October bill, the walk intern) and the close
 * walk locks October in the second. So it starts on the second pass (desktop, light). What it
 * changes it puts back before it ends, once, on that pass: the realisation rule's confirmation
 * is taken back, the holiday it lifts is put back, the file it trashes is restored and its own
 * export invoice is cancelled. Every person, vendor, bank line and number is invented.
 */

import type { Locator, Page } from "playwright";

import { localDay } from "../data/days";
import { WALK_IDS } from "../data/money/limits";
import { WALK_ACCOUNT_ID } from "../data/statements/walk-seed";
import { dayWords } from "../../src/lib/data/labels-company";
import { CASH_LEFT_OUT } from "../../src/lib/data/labels-calendar";
import { minorWords } from "../../src/lib/data/labels-duties";
import {
  ADMIN_PACK_WORDS,
  STATEMENTS_OWNER_LINE,
  lockedWords,
} from "../../src/lib/data/labels-statements";
import { WALKER, type WalkKit } from "./kit";

const OCTOBER = "2026-10";
const LOCKED = lockedWords(OCTOBER);
const LINES_PATH = `/data/money/statements/${WALK_ACCOUNT_ID}?month=${OCTOBER}&view=all`;
const HOLIDAY = "2026-11-04";
const INVOICE = "WALK-EXP-M0930";
const MIS_ADMIN = "The figures are for the Owner only.";

type Body = Record<string, unknown>;
type Due = { key: string; due_on: string };
type Line = {
  line_id: string;
  narration: string;
  match: { kind: string; bill_id?: string } | null;
};
type BillRow = { bill_id: string; invoice_number: string; invoice_on: string; state: string };
type Payment = { reference: string; from_line: string | null; taken_back: unknown };

const flat = (text: string) => text.replace(/\s+/g, " ").trim();
const dueMoreLine = (more: number) =>
  more === 1
    ? "1 more row is due later than these."
    : `${more.toLocaleString("en-GB")} more rows are due later than these.`;
/** "₹1,200,000", as the update's numbers table prints a whole figure (`formatMoney`). */
const wholeMoney = (value: number, currency: string) =>
  new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(value);

async function until(page: Page, test: () => Promise<boolean>, tries = 150): Promise<boolean> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    if (await test()) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

/** A page of this walk, with more time than Playwright's 30 s under a heavy load. */
async function visit(page: Page, url: string, ready: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto(url, { waitUntil: "networkidle", timeout: 90_000 });
    const found = await page
      .waitForSelector(ready, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (found) return true;
  }
  return false;
}

/** A popover form: open it, fill it, press its button, read what it says back. */
async function submit(
  page: Page,
  scope: Locator,
  label: string,
  button: string,
  fill: (panel: Locator) => Promise<void>,
): Promise<string> {
  const popover = scope
    .locator("details.popover", { has: page.locator(`summary:text-is("${label}")`) })
    .first();
  await popover.locator("summary.popover__trigger").click();
  const panel = popover.locator(".popover__panel");
  await fill(panel);
  await panel.locator("button[type=submit]", { hasText: button }).click();
  const feedback = panel.locator(".form-sent, [role='alert']");
  await feedback
    .first()
    .waitFor({ timeout: 20_000 })
    .catch(() => undefined);
  return flat((await feedback.allInnerTexts().catch(() => [] as string[])).join(" "));
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if (kit.pass.first) {
    console.log("  · duties-merged: waits for the other walks' first pass");
    return;
  }
  const loaded = await Promise.all(
    ["/data/money/ledger", "/data/statements/summary", "/data/close", "/data/holidays"].map(
      async (path) => (await kit.socket.ask("GET", path)).status === 200,
    ),
  );
  if (!loaded.every(Boolean)) {
    kit.check("duties merged: Money, Statements, Month close and Holidays are loaded", false);
    return;
  }
  const once = kit.pass.width === "desktop" && kit.pass.theme === "light";
  const outboxBefore = kit.outbox().length;
  const get = async (path: string) => (await kit.socket.ask("GET", path)).body;
  const post = (path: string, body: Body = {}) =>
    kit.socket.ask("POST", path, { by: WALKER, ...body });
  const today = String((await get("/data/_test/day")).day ?? localDay());

  // ---------------------------------------------------------------- M1: the Rules view's count line
  const counts = (await get("/data/dates/rules")).counts as {
    confirmed: number;
    confirmable: number;
  };
  await visit(page, `${kit.base}/data/dates?view=rules`, ".hqdata-rules__count");
  const countLine = flat(await page.locator(".hqdata-rules__count").innerText());
  kit.check(
    "duties merged M1: the Rules view's count line is the merged rule book's",
    countLine === `${counts.confirmed} of ${counts.confirmable} rules confirmed`,
    { countLine, counts },
  );

  // ---------------------------------------------------------------- M2: an export invoice's realisation day
  if (once) {
    const found = ((await get("/data/money/exports")).invoices ?? []) as {
      invoice_id: string;
      invoice_number: string;
      cancelled: unknown;
    }[];
    let invoiceId =
      found.find((row) => row.invoice_number === INVOICE && !row.cancelled)?.invoice_id ?? "";
    if (!invoiceId) {
      const made = await post("/data/money/exports", {
        customer: "Walk Merged Customer Inc",
        country: "United States",
        invoice_number: INVOICE,
        invoice_on: "2025-09-30",
        currency: "USD",
        amount: "2000",
        tax_treatment: "under_lut",
        purpose_code: "P0802",
        attempt: crypto.randomUUID(),
      });
      invoiceId = String((made.body.invoice as Body | undefined)?.invoice_id ?? "");
    }
    const clocks = async () => {
      await visit(
        page,
        `${kit.base}/data/money/exports/${invoiceId}`,
        '[data-section="export-clocks"]',
      );
      return flat(await page.locator('[data-section="export-clocks"]').innerText());
    };
    const realiseKey = `export:${invoiceId}:realise`;
    const dueHas = async () =>
      (((await get("/data/overview?owner=1&due=all")).due ?? []) as Due[]).some(
        (row) => row.key === realiseKey,
      );
    const before = await clocks();
    const dueBefore = await dueHas();
    const confirmed = await post("/data/dates/rules/export-realisation/confirm", {
      name: "Walk Bank",
      role: "bank",
      on: today,
      reading: 1,
    });
    const worked = String(
      ((await get(`/data/money/exports/${invoiceId}`)).invoice as Body | undefined)?.realise_by ??
        "",
    );
    const after = await clocks();
    const dueAfter = await dueHas();
    await post("/data/dates/rules/export-realisation/unconfirm");
    const back = await clocks();
    const dueBack = await dueHas();
    await post(`/data/money/exports/${invoiceId}/cancel`, {
      why: "Walk: the merged walk's own invoice, done with.",
    });
    kit.check(
      "duties merged M2: an export invoice reads Not worked out, then 30 Dec 2026 once realisation is confirmed at 15 months, then Not worked out again",
      before.includes("Not worked out: the sources give 9 months and 15 months.") &&
        !dueBefore &&
        confirmed.status === 200 &&
        worked === "2026-12-30" &&
        after.includes("30 Dec 2026") &&
        after.includes(`Confirmed by Walk Bank, ${dayWords(today)}`) &&
        dueAfter &&
        back.includes("Not worked out: the sources give 9 months and 15 months.") &&
        !dueBack,
      { before: before.slice(0, 160), after: after.slice(0, 160), worked, dueAfter, dueBack },
    );
  }

  // ---------------------------------------------------------------- M3: the close's day and a holiday
  const closePage = async () => {
    await visit(page, `${kit.base}/data/money/close/${OCTOBER}`, "#table-the-pack");
    return flat(await kit.text());
  };
  const holidays = async () =>
    ((await get("/data/holidays?year=2026")).holidays ?? []) as {
      holiday_id: string;
      on: string;
      name: string;
      kind: string;
    }[];
  const companyDay = (await holidays()).find((day) => day.on === HOLIDAY);
  const withDay = await closePage();
  const dueOn = String((await get(`/data/close/${OCTOBER}`)).due_on ?? "");
  if (once && companyDay) {
    await post(`/data/holidays/${companyDay.holiday_id}/remove`);
    const without = await closePage();
    const dueWithout = String((await get(`/data/close/${OCTOBER}`)).due_on ?? "");
    await post("/data/holidays", { on: HOLIDAY, name: companyDay.name, kind: companyDay.kind });
    const again = await closePage();
    kit.check(
      "duties merged M3: October's close is due 9 Nov 2026 with the company holiday on 4 Nov 2026, 6 Nov 2026 without it, and 9 Nov again once it is back",
      dueOn === "2026-11-09" &&
        withDay.includes("Close by 9 Nov 2026") &&
        dueWithout === "2026-11-06" &&
        without.includes("Close by 6 Nov 2026") &&
        again.includes("Close by 9 Nov 2026") &&
        (await holidays()).some((day) => day.on === HOLIDAY),
      { dueOn, dueWithout },
    );
  } else
    kit.check(
      "duties merged M3: with the holidays walk's company holiday on 4 Nov 2026, October's close is due 9 Nov 2026",
      Boolean(companyDay) && dueOn === "2026-11-09" && withDay.includes("Close by 9 Nov 2026"),
      { holiday: Boolean(companyDay), dueOn },
    );

  // ---------------------------------------------------------------- M4: the sure match paid a real bill
  const october = ((
    await get(
      `/data/statements/accounts/${WALK_ACCOUNT_ID}/lines?owner=1&month=${OCTOBER}&view=all`,
    )
  ).lines ?? []) as Line[];
  const legal = october.find((line) => line.narration.includes("WALK LEGAL LLP WALK-INV-0007"));
  const billId = legal?.match?.kind === "bill_payment" ? (legal.match.bill_id ?? "") : "";
  const bill = billId
    ? ((await get(`/data/money/bills/${billId}`)).bill as
        { state: string; payments: Payment[] } | undefined)
    : undefined;
  const live = bill?.payments.filter((payment) => payment.taken_back === null) ?? [];
  let billText = "";
  if (
    billId &&
    (await visit(page, `${kit.base}/data/money/bills/${billId}`, '[data-section="bill-pay"]'))
  )
    billText = flat(await page.locator('[data-section="bill-pay"]').innerText());
  kit.check(
    "duties merged M4: Accept the sure matches paid the real Money bill from its line, and the bill's page shows WALK-UTR-0007",
    Boolean(billId) &&
      bill?.state === "paid" &&
      live.some(
        (payment) => payment.reference === "WALK-UTR-0007" && payment.from_line === "statement",
      ) &&
      billText.includes("WALK-UTR-0007"),
    { billId, state: bill?.state, payments: live },
  );

  // ---------------------------------------------------------------- M5: the lock's callout
  const locked = (await get(`/data/close/${OCTOBER}`)).state === "locked";
  const bills = ((await get("/data/money?view=all")).bills ?? []) as BillRow[];
  const octoberBill = bills.find(
    (row) =>
      row.invoice_on.startsWith(OCTOBER) && row.state !== "cancelled" && row.bill_id !== billId,
  );
  let billLock = "";
  let editButtons = -1;
  if (
    octoberBill &&
    (await visit(
      page,
      `${kit.base}/data/money/bills/${octoberBill.bill_id}`,
      '[data-section="bill-pay"]',
    ))
  ) {
    billLock = flat(await kit.text());
    editButtons = await page.locator(".rhead__actions summary").count();
  }
  await visit(page, `${kit.base}${LINES_PATH}`, "#table-lines");
  const linesLock = flat(await kit.text());
  kit.check(
    "duties merged M5: October is locked; an October bill and October's lines show the lock's callout, the bill no edit buttons",
    locked &&
      Boolean(octoberBill) &&
      billLock.includes(LOCKED) &&
      editButtons === 0 &&
      linesLock.includes(LOCKED) &&
      (await page.locator("select[name=category_id]").count()) === 0,
    { locked, bill: octoberBill?.invoice_number, editButtons },
  );
  if (once) {
    const people = ((await get("/data/people")).people ?? []) as {
      person_id: string;
      name: string;
    }[];
    const intern = people.find((person) => person.name === "Walk Intern One");
    const paymentsOf = async () =>
      (((await get(`/data/people/${intern?.person_id ?? ""}`)).person as Body | undefined)
        ?.payments ?? []) as unknown[];
    let said = "";
    let before = -1;
    let after = -2;
    if (
      intern &&
      (await visit(
        page,
        `${kit.base}/data/people/${intern.person_id}`,
        '[data-section="person-stipend"]',
      ))
    ) {
      before = (await paymentsOf()).length;
      await page
        .locator(".rhead")
        .locator("summary", { hasText: "Record a stipend payment" })
        .click();
      await page.fill("#payment-period", "2026-09");
      await page.fill("#payment-paid", "2026-10-30");
      await page.fill("#payment-amount", "15000");
      await page.fill("#payment-reference", "WALK-UTR-M1");
      await page.locator("form button", { hasText: "Record the payment" }).click();
      await until(page, async () => flat(await kit.text()).includes(LOCKED));
      said = flat(await kit.text());
      after = (await paymentsOf()).length;
    }
    kit.check(
      "duties merged M5: a stipend payment dated in October is refused with the lock's sentence, and nothing is recorded",
      locked && said.includes(LOCKED) && before === after,
      { intern: Boolean(intern), before, after },
    );
  }

  // ---------------------------------------------------------------- M6: the MIS's part 3 and the frozen update
  const update = (await get(`/data/numbers/updates/${OCTOBER}`)) as {
    numbers?: {
      cash?: {
        currency: string;
        cash: number;
        burn_per_month: number;
        runway_months: number;
        as_of: string;
        source?: string;
      }[];
    };
  };
  const mis = (await get(`/data/close/${OCTOBER}/mis`)) as {
    frozen?: boolean;
    mis?: {
      burn: {
        currency: string;
        cash_minor: number;
        avg_net_minor: number | null;
        runway_months: number | null;
        as_of: string;
      }[];
    };
  };
  const cash = update.numbers?.cash?.find((row) => row.currency === "INR");
  const burn = mis.mis?.burn.find((row) => row.currency === "INR");
  let misText = "";
  let updateText = "";
  if (await visit(page, `${kit.base}/data/numbers/mis/${OCTOBER}`, "#mis-burn"))
    misText = flat(await page.locator('[data-section="mis-burn"]').innerText());
  if (
    await visit(
      page,
      `${kit.base}/data/numbers/updates/${OCTOBER}`,
      '[data-section="update-numbers"]',
    )
  )
    updateText = flat(await page.locator('[data-section="update-numbers"]').innerText());
  const same =
    mis.frozen === true &&
    cash !== undefined &&
    burn !== undefined &&
    cash.source === "mis" &&
    cash.as_of === burn.as_of &&
    cash.cash * 100 === burn.cash_minor &&
    cash.burn_per_month * 100 === burn.avg_net_minor &&
    cash.runway_months === burn.runway_months &&
    misText.includes(`Cash ${minorWords(burn.cash_minor, "INR")} on ${dayWords(burn.as_of)}`) &&
    updateText.includes(
      `${wholeMoney(cash.cash, "INR")} · burn ${wholeMoney(cash.burn_per_month, "INR")} · ${(Math.round(cash.runway_months * 10) / 10).toFixed(1)} months`,
    );
  kit.check(
    "duties merged M6: October's frozen MIS part 3 and the frozen update's cash line give the same cash, burn and runway",
    same,
    { cash, burn, frozen: mis.frozen },
  );

  // ---------------------------------------------------------------- M7: the walk's Admin
  if (once) {
    const browser = page.context().browser();
    if (!browser) kit.check("duties merged M7: a browser for the Admin", false);
    else {
      const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      try {
        const admin = await other.newPage();
        await admin.goto(`${kit.base}/dev/signin?as=admin%40hq.test&next=%2Fdata%2Fmoney`, {
          waitUntil: "networkidle",
        });
        const seen: Record<string, string> = {};
        for (const [name, path] of [
          ["money", "/data/money"],
          ["cash", "/data/numbers/cash"],
          ["mis", `/data/numbers/mis/${OCTOBER}`],
          ["pack", `/data/money/close/${OCTOBER}`],
          ["statements", "/data/money/statements"],
        ] as const) {
          await admin.goto(`${kit.base}${path}`, { waitUntil: "networkidle", timeout: 90_000 });
          seen[name] = flat(await admin.locator("main").first().innerText());
        }
        await admin.goto(`${kit.base}/data/money`, { waitUntil: "networkidle" });
        const tabs = await admin
          .locator('nav[aria-label="Money"] a[href="/data/money/statements"]')
          .count();
        const all = Object.values(seen).join(" ");
        kit.check(
          "duties merged M7: the walk's Admin has no Statements tab and reads the left-out lines on the cash view, the MIS and the pack",
          tabs === 0 &&
            (seen.cash ?? "").includes(CASH_LEFT_OUT) &&
            (seen.mis ?? "").includes(MIS_ADMIN) &&
            (seen.pack ?? "").includes(ADMIN_PACK_WORDS) &&
            (seen.statements ?? "").includes(STATEMENTS_OWNER_LINE) &&
            !all.includes("Walk Intern One") &&
            !all.includes("NEFT"),
          Object.fromEntries(Object.entries(seen).map(([key, text]) => [key, text.slice(0, 80)])),
        );
      } finally {
        await other.close();
      }
    }
  }

  // ---------------------------------------------------------------- M8: a held file in Files' trash
  if (once) {
    const walkBill = (await get(`/data/money/bills/${WALK_IDS.bill}`)).bill as
      { file_id: string | null } | undefined;
    const fileId = walkBill?.file_id ?? "";
    let refused = "";
    if (fileId) {
      await post(`/data/files/${fileId}/trash`);
      await visit(page, `${kit.base}/data/files?view=trash`, "main h1");
      const row = page.locator("tr", { hasText: "Walk Legal LLP WALK-INV-0007" }).first();
      refused = await submit(page, row, "Delete forever", "Delete forever", async () => undefined);
      await post(`/data/files/${fileId}/restore`);
    }
    const still = fileId ? (await kit.socket.ask("GET", `/data/files/${fileId}`)).status : 0;
    kit.check(
      "duties merged M8: the walk bill's copy in Files' trash is refused forever until 31 Mar 2035, and stays",
      refused.includes(
        "is kept until 31 Mar 2035, so it cannot be deleted. It can stay in the trash.",
      ) && still === 200,
      refused || "no copy",
    );
  }

  // ---------------------------------------------------------------- M10: Due keeps what is owed, and says what it left out
  const overview = await get("/data/overview?owner=1");
  const due = (overview.due ?? []) as Due[];
  const more = Number(overview.due_more ?? 0);
  const all = ((await get("/data/overview?owner=1&due=all")).due ?? []) as Due[];
  await visit(page, `${kit.base}/data`, '[data-section="data-due"]');
  const section = page.locator('[data-section="data-due"]');
  const rows = await section.locator(".hqdata-due__row").count();
  // Count first: a locator that matches nothing would wait out Playwright's timeout.
  const moreLine = section.locator(".hqdata-due__more");
  const moreText = (await moreLine.count()) > 0 ? flat(await moreLine.innerText()) : "";
  const link = moreLine.locator("a");
  const href = (await link.count()) > 0 ? await link.getAttribute("href") : null;
  let allRows = rows;
  if (more > 0) {
    await link.click();
    await page.waitForURL(/due=all/, { timeout: 30_000 }).catch(() => undefined);
    await page.waitForSelector('[data-section="data-due"] .hqdata-due__row', { timeout: 30_000 });
    allRows = await page.locator('[data-section="data-due"] .hqdata-due__row').count();
  }
  const owed = all.filter((row) => row.due_on <= today);
  kit.check(
    "duties merged M10: Due holds every row owed today, and its last line says how many later rows it left out and links to all of them",
    rows === due.length &&
      owed.every((row) => due.some((item) => item.key === row.key)) &&
      all.length === due.length + more &&
      (more === 0
        ? moreText === ""
        : moreText === `${dueMoreLine(more)} Show every row` &&
          href === "/data?due=all#data-due" &&
          allRows === all.length),
    { rows, due: due.length, more, all: all.length, owed: owed.length, moreText, allRows },
  );

  // ---------------------------------------------------------------- M11: Home's due chips never sit on a title
  await visit(page, `${kit.base}/home`, ".hqdata-home");
  // Home is not a Data page (its other blocks are not this batch's), so no kit.audit here:
  // the page's own overflow is measured with the rows.
  const pageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  const geometry = await page.evaluate(() =>
    [...document.querySelectorAll(".hqdata-home .agenda--labelled .agenda__row")].map((row) => {
      const chip = row.querySelector(".agenda__time")?.getBoundingClientRect();
      const title = row.querySelector(".agenda__title")?.getBoundingClientRect();
      if (!chip || !title) return { overlap: -1, stacked: false, off: 0 };
      const across = Math.min(chip.right, title.right) - Math.max(chip.left, title.left);
      const down = Math.min(chip.bottom, title.bottom) - Math.max(chip.top, title.top);
      return {
        overlap: across > 0.5 && down > 0.5 ? Math.round(across * down) : 0,
        stacked: chip.bottom <= title.top + 0.5,
        off: Math.max(0, Math.round(title.right - document.documentElement.clientWidth)),
      };
    }),
  );
  kit.check(
    `duties merged M11: Home's Data block at ${kit.pass.width === "phone" ? "412" : "1440"}px: no due chip overlaps its title${kit.pass.width === "phone" ? ", each chip sits above its title" : ""}`,
    pageOverflow <= 1 &&
      geometry.length > 0 &&
      geometry.every(
        (row) =>
          row.overlap === 0 && row.off === 0 && (kit.pass.width === "desktop" || row.stacked),
      ),
    {
      rows: geometry.length,
      bad: geometry.filter((row) => row.overlap !== 0 || row.off !== 0).length,
    },
  );

  // ---------------------------------------------------------------- M9: nothing was sent
  kit.check(
    "duties merged M9: the outbox did not grow while this walk ran",
    kit.outbox().length === outboxBefore,
    kit.outbox().length - outboxBefore,
  );
}
