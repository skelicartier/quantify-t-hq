/**
 * Money records, walked against the stand-in (ws-notes/duties/spec.md §8.7, MO1–MO15): the
 * empty Bills page (MO1); the starter categories and the count in words (MO2); one category
 * mapped (MO3); "Walk Legal LLP" added (MO4); §5.4's three professional-fee bills, the third
 * printing both readings and "Nothing is worked out" (MO5); the limit confirmed through the
 * stand-in, "over the ₹50,000 limit with this bill" (MO6); a micro supplier's bill accepted
 * 3 Nov 2026, "pay by 18 Nov 2026", its Due row and Home's "Bill" row, then paid, so Due's 30 rows
 * stay free for the other walks (MO7); the deduction and a payment with
 * `WALK-UTR-0001`, Paid (MO8); three lines of edit history (MO9); October locked through the
 * stand-in, an October bill's callout and refusal (MO10); "Walk Cloud Inc" abroad, the two form
 * names and a decision (MO11); an export invoice, its EDF day and "Not worked out" (MO12); a
 * receipt with a FIRA, "₹88.25 a dollar" (MO13); the bill's PDF in Files' trash refused
 * forever (MO14); every page at 412px in both themes, no "%", the outbox unchanged (MO15).
 * Every vendor, customer and number is invented.
 */

import { request } from "node:http";

import type { Locator, Page } from "playwright";

import { inventedPdf } from "../data/files/walk-seed";
import { WALK_IDS } from "../data/money/limits";
import { WALKER, type Shot, type WalkKit } from "./kit";

export const shots: Shot[] = [
  { name: "data-money", path: "/data/money", ready: '[data-section="money-bills"]' },
  {
    name: "data-money-bill",
    path: `/data/money/bills/${WALK_IDS.bill}`,
    ready: '[data-section="bill-pay"]',
  },
  {
    name: "data-money-vendors",
    path: "/data/money/vendors",
    ready: '[data-section="money-vendors"]',
  },
  {
    name: "data-money-vendor",
    path: `/data/money/vendors/${WALK_IDS.vendor}`,
    ready: '[data-section="vendor-years"]',
  },
  { name: "data-money-ledger", path: "/data/money/ledger", ready: '[data-section="money-ledger"]' },
  {
    name: "data-money-exports",
    path: "/data/money/exports",
    ready: '[data-section="money-exports"]',
  },
  {
    name: "data-money-export",
    path: `/data/money/exports/${WALK_IDS.exportInvoice}`,
    ready: '[data-section="export-clocks"]',
  },
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

/** The rule book's stand-in, nothing confirmed, while no real one is here. Safe twice. */
export async function seed(socketPath: string): Promise<void> {
  if ((await ask(socketPath, "GET", "/data/money/ledger")).status !== 200) {
    console.log("[walk] money: the module is not loaded here");
    return;
  }
  const seeded = await ask(socketPath, "POST", "/data/_test/money/seed", { by: WALKER });
  console.log(`[walk] money: rule book ${String(seeded.body.rules ?? "unknown")}`);
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();
/** The professional-fee limit confirmed at its first reading (₹50,000), as MO6 records it. */
const CONFIRMED = {
  "tds-professional-year": { reading: 0, confirmed: { name: "Walk CA", on: "2026-11-14" } },
};
const LOCKED = "October 2026 is locked. Reopen it on Month close, with a reason, to change this.";

async function open(page: Page, kit: WalkKit, path: string, ready: string): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto(`${kit.base}${path}`, { waitUntil: "networkidle" });
    const found = await page
      .waitForSelector(ready, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (found) return flat(await kit.text());
  }
  kit.check(`money: ${path} shows ${ready}`, false, flat(await kit.text()).slice(0, 200));
  return "";
}

/** Opens a popover by its label inside `scope`, fills it, presses its button, and reads what it said. */
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

type Bill = {
  bill_id: string;
  state: string;
  file_id: string | null;
  edits: { verb: string }[];
  payments: unknown[];
};

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/money/ledger")).status !== 200) {
    kit.check("money: not loaded in this service", true);
    return;
  }
  const outboxBefore = kit.outbox().length;
  const post = (path: string, body: Record<string, unknown> = {}) =>
    kit.socket.ask("POST", path, { by: WALKER, ...body });
  const billOf = async (id: string) =>
    (await kit.socket.ask("GET", `/data/money/bills/${id}`)).body.bill as Bill;
  // Another walk restarts the worker on purpose, and a restart drops every stand-in: the rule
  // book's is put back on each pass (unconfirmed before MO6 on the first, confirmed after it).
  await post("/data/_test/money/duty-rules", kit.pass.first ? {} : { stored: CONFIRMED });

  if (kit.pass.first) {
    // ---------------------------------------------------------------- MO1: the empty Bills page
    const before = (await kit.socket.ask("GET", "/data/money?view=all")).body as {
      counts?: { all: number; cancelled: number };
    };
    const empty = (before.counts?.all ?? 0) + (before.counts?.cancelled ?? 0) === 0;
    const bills = await open(page, kit, "/data/money", '[data-section="money-bills"]');
    kit.check(
      "money MO1: the empty Bills page names the first act",
      !empty ||
        bills.includes(
          "No bills yet. Add each bill with its PDF as it arrives: at the month's end they go to your CA in one pack.",
        ),
      bills.slice(0, 200),
    );

    // ---------------------------------------------------------------- MO2, MO3: the ledger map
    await open(page, kit, "/data/money/ledger", '[data-section="money-ledger"]');
    const said = await submit(
      page,
      page.locator(".pagebar__actions"),
      "Add the starter categories",
      "Add them",
      async () => undefined,
    );
    await page.goto(`${kit.base}/data/money/ledger`, { waitUntil: "networkidle" });
    const mappedLine = flat(await page.locator("#ledger-mapped").innerText());
    kit.check(
      'money MO2: "Add the starter categories" gives 24, "0 of 24 categories are mapped."',
      mappedLine === "0 of 24 categories are mapped.",
      { said, mappedLine },
    );
    const fees = page
      .locator("#table-ledger-map tbody tr", { hasText: "Professional fees" })
      .first();
    const mapped = await submit(page, fees, "Map", "Save", async (panel) => {
      await panel.locator('input[name="ledger"]').fill("Legal and professional");
    });
    await page.goto(`${kit.base}/data/money/ledger`, { waitUntil: "networkidle" });
    kit.check(
      'money MO3: "Professional fees" mapped to "Legal and professional": "1 of 24"',
      flat(await page.locator("#ledger-mapped").innerText()) === "1 of 24 categories are mapped." &&
        flat(await page.locator("#table-ledger-map").innerText()).includes(
          "Legal and professional",
        ),
      mapped,
    );
    await kit.audit("money-ledger");

    // ---------------------------------------------------------------- MO4: Walk Legal LLP
    await post("/data/_test/money/pin", { kind: "vendor", id: WALK_IDS.vendor });
    await open(page, kit, "/data/money/vendors", '[data-section="money-vendors"]');
    const added = await submit(
      page,
      page.locator(".pagebar__actions"),
      "Add a vendor",
      "Add the vendor",
      async (panel) => {
        await panel.locator("#vendor-new-name").fill("Walk Legal LLP");
        await panel.locator("#vendor-new-legal-name").fill("Walk Legal LLP");
        await panel.locator("#vendor-new-residency").selectOption("resident");
        await panel.locator("#vendor-new-pan").fill("ZZZPZ0000Z");
        await panel.locator("#vendor-new-gstin").fill("00ZZZPZ0000Z1Z0");
        await panel.locator("#vendor-new-udyam-class").selectOption("not_registered");
        await panel.locator("#vendor-new-tds-kind").selectOption("professional");
      },
    );
    const vendor = (await kit.socket.ask("GET", `/data/money/vendors/${WALK_IDS.vendor}`)).body
      .vendor as { name: string; pan: string; tds_kind: string } | undefined;
    kit.check(
      'money MO4: vendor "Walk Legal LLP", PAN ZZZPZ0000Z, professional fees, in India',
      vendor?.name === "Walk Legal LLP" &&
        vendor.pan === "ZZZPZ0000Z" &&
        vendor.tds_kind === "professional",
      added,
    );

    // ---------------------------------------------------------------- MO5: §5.4's three bills
    for (const [number, on, taxable, gst] of [
      ["WALK-INV-0005", "2026-06-10", "20000", "3600"],
      ["WALK-INV-0006", "2026-09-05", "25000", "4500"],
    ] as const)
      await post("/data/money/bills", {
        vendor_id: WALK_IDS.vendor,
        invoice_number: number,
        invoice_on: on,
        taxable,
        gst,
        attempt: crypto.randomUUID(),
      });
    await post("/data/_test/money/pin", { kind: "bill", id: WALK_IDS.bill });
    await open(page, kit, "/data/money", '[data-section="money-bills"]');
    const pdf = Buffer.from(
      await inventedPdf(["Invented: Walk Legal LLP, WALK-INV-0007, INR 11,800."], "Walk bill"),
    );
    const third = await submit(
      page,
      page.locator(".pagebar__actions"),
      "Add a bill",
      "Add the bill",
      async (panel) => {
        await panel.locator("#bill-new-vendor").selectOption(WALK_IDS.vendor);
        await panel.locator("#bill-new-number").fill("WALK-INV-0007");
        await panel.locator("#bill-new-invoice-on").fill("2026-11-12");
        await panel.locator("#bill-new-description").fill("Walk advice for November");
        await panel.locator("#bill-new-taxable").fill("10,000.00");
        await panel.locator("#bill-new-gst").fill("1,800.00");
        await panel.locator("#bill-new-copy-file").setInputFiles({
          name: "walk-inv-0007.pdf",
          mimeType: "application/pdf",
          buffer: pdf,
        });
      },
    );
    const billPage = await open(
      page,
      kit,
      `/data/money/bills/${WALK_IDS.bill}`,
      '[data-section="bill-tax"]',
    );
    kit.check(
      "money MO5: the third bill prints the sum, both readings and Nothing is worked out",
      billPage.includes("₹55,000 billed in 2026-27.") &&
        billPage.includes("The sources give ₹50,000 and ₹30,000.") &&
        billPage.includes("Nothing is worked out until your CA confirms one."),
      { third, text: billPage.slice(0, 300) },
    );

    // ---------------------------------------------------------------- MO6: the limit confirmed
    const installed = await post("/data/_test/money/duty-rules", { stored: CONFIRMED });
    if (installed.body.real === true)
      kit.check(
        "money MO6: the real rule book is loaded here; the merged walk confirms its rules",
        true,
      );
    else {
      const confirmed = await open(
        page,
        kit,
        `/data/money/bills/${WALK_IDS.bill}`,
        '[data-section="bill-tax"]',
      );
      kit.check(
        'money MO6: confirmed at ₹50,000, the line reads "over the ₹50,000 limit with this bill"',
        confirmed.includes("₹55,000 in 2026-27: over the ₹50,000 limit with this bill.") &&
          confirmed.includes("10 per cent of this bill is ₹1,000") &&
          confirmed.includes("Confirmed by Walk CA, 14 Nov 2026"),
        confirmed.slice(0, 300),
      );
    }

    // ---------------------------------------------------------------- MO7: a micro supplier
    const print = (
      await post("/data/money/vendors", {
        name: "Walk Print Works",
        residency: "resident",
        country: "India",
        udyam_class: "micro",
        udyam_number: "UDYAM-ZZ-00-0000000",
        msme_agreement: "no",
        tds_kind: "none",
        attempt: crypto.randomUUID(),
      })
    ).body.vendor as { vendor_id: string } | undefined;
    await open(page, kit, "/data/money", '[data-section="money-bills"]');
    const printed = await submit(
      page,
      page.locator(".pagebar__actions"),
      "Add a bill",
      "Add the bill",
      async (panel) => {
        await panel.locator("#bill-new-vendor").selectOption(print?.vendor_id ?? "");
        await panel.locator("#bill-new-number").fill("WALK-PW-0001");
        await panel.locator("#bill-new-invoice-on").fill("2026-11-01");
        await panel.locator("#bill-new-accepted-on").fill("2026-11-03");
        await panel.locator("#bill-new-description").fill("Walk brochures");
        await panel.locator("#bill-new-taxable").fill("50,000");
        await panel.locator("#bill-new-gst").fill("9,000");
      },
    );
    const due =
      ((await kit.socket.ask("GET", "/data/overview")).body.due as {
        title: string;
        due_on: string;
      }[]) ?? [];
    kit.check(
      'money MO7: a micro supplier\'s bill accepted 3 Nov 2026 says "pay by 18 Nov 2026" and is in Due',
      printed.includes("Pay by 18 Nov 2026 (15-day limit)") &&
        due.some(
          (row) =>
            row.title === "Pay Walk Print Works: WALK-PW-0001" && row.due_on === "2026-11-18",
        ),
      { printed, due: due.map((row) => row.title) },
    );
    // Home's owed rows take the bill too, as "Bill" (spec §10: the harness's Home run).
    await page.goto(`${kit.base}/home`, { waitUntil: "networkidle" });
    const home = flat(await kit.text());
    kit.check(
      'money MO7: Home lists the overdue bill among what is owed, as a "Bill"',
      home.includes("Pay Walk Print Works: WALK-PW-0001"),
      home.slice(0, 200),
    );
    // Data's Due list holds 30 rows: the bill is paid, so it leaves no row for later walks.
    const printBill = (
      (await kit.socket.ask("GET", "/data/money?view=open")).body.bills as {
        bill_id: string;
        invoice_number: string;
      }[]
    ).find((row) => row.invoice_number === "WALK-PW-0001");
    const today = String((await kit.socket.ask("GET", "/data/_test/day")).body.day ?? "");
    await post(`/data/money/bills/${printBill?.bill_id ?? ""}/payments`, {
      paid_on: today,
      amount: "59,000",
      reference: "WALK-UTR-0002",
      attempt: crypto.randomUUID(),
    });

    // ---------------------------------------------------------------- MO8, MO9: deducted and paid
    await open(page, kit, `/data/money/bills/${WALK_IDS.bill}`, '[data-section="bill-tax"]');
    const deducted = await submit(
      page,
      page.locator('[data-section="bill-tax"]'),
      "Record what was deducted",
      "Record it",
      async (panel) => {
        await panel.locator("#tds-amount").fill("1,000");
        await panel.locator("#tds-on").fill("2026-11-12");
      },
    );
    await open(page, kit, `/data/money/bills/${WALK_IDS.bill}`, '[data-section="bill-pay"]');
    const paid = await submit(
      page,
      page.locator('[data-section="bill-pay"]'),
      "Record a payment",
      "Record it",
      async (panel) => {
        await panel.locator("#pay-on").fill("2026-11-14");
        await panel.locator("#pay-amount").fill("10,800.00");
        await panel.locator("#pay-reference").fill("WALK-UTR-0001");
      },
    );
    const after = await billOf(WALK_IDS.bill);
    const paidPage = await open(
      page,
      kit,
      `/data/money/bills/${WALK_IDS.bill}`,
      '[data-section="bill-pay"]',
    );
    kit.check(
      "money MO8: the deduction and a payment with WALK-UTR-0001 leave the bill Paid",
      after?.state === "paid" &&
        paidPage.includes("WALK-UTR-0001") &&
        paidPage.includes("Deposit by 7 Dec 2026"),
      { deducted, paid, state: after?.state },
    );
    const history = flat(
      await page
        .locator("#table-edit-history")
        .innerText()
        .catch(() => ""),
    );
    kit.check(
      "money MO9: the edit history lists three lines: added, tax deducted, paid",
      after?.edits.map((line) => line.verb).join(",") === "added,tax deducted,paid" &&
        /line 3/i.test(history) &&
        history.includes("WALK-UTR-0001"),
      after?.edits.map((line) => line.verb),
    );

    // ---------------------------------------------------------------- MO10: October locked
    const october = (
      await post("/data/money/bills", {
        vendor_id: WALK_IDS.vendor,
        invoice_number: "WALK-INV-0004",
        invoice_on: "2026-10-12",
        taxable: "5000",
        gst: "900",
        attempt: crypto.randomUUID(),
      })
    ).body.bill as { bill_id: string } | undefined;
    const lock = await post("/data/_test/money/month-lock", { locked: ["2026-10"] });
    if (lock.body.real === true)
      kit.check(
        "money MO10: the real month lock is loaded here; the merged walk locks October",
        true,
      );
    else {
      const lockedPage = await open(
        page,
        kit,
        `/data/money/bills/${october?.bill_id ?? ""}`,
        '[data-section="bill-pay"]',
      );
      const refused = await post(`/data/money/bills/${october?.bill_id ?? ""}/update`, {
        description: "Walk",
      });
      const editButtons = await page.locator(".rhead__actions summary").count();
      kit.check(
        "money MO10: an October bill shows the lock's callout, no edit buttons, and a change is refused",
        lockedPage.includes(LOCKED) &&
          editButtons === 0 &&
          refused.status === 409 &&
          (refused.body.error as { message?: string } | undefined)?.message === LOCKED,
        { editButtons, refused: refused.body },
      );
      await post("/data/_test/money/month-lock", { on: false });
    }

    // ---------------------------------------------------------------- MO11: a vendor abroad
    await post("/data/_test/money/pin", { kind: "vendor", id: WALK_IDS.vendorAbroad });
    await post("/data/money/vendors", {
      name: "Walk Cloud Inc",
      legal_name: "Walk Cloud Inc",
      residency: "non_resident",
      country: "United States",
      tds_kind: "none",
      attempt: crypto.randomUUID(),
    });
    const abroad = await open(
      page,
      kit,
      `/data/money/vendors/${WALK_IDS.vendorAbroad}`,
      '[data-section="vendor-abroad"]',
    );
    const options = await page.locator("#abroad-forms option").allTextContents();
    const decided = await submit(
      page,
      page.locator('[data-section="vendor-abroad"]'),
      "Record your CA's decision",
      "Save",
      async (panel) => {
        await panel.locator("#abroad-bills-from").selectOption("abroad");
        await panel.locator("#abroad-paid-by").selectOption("card");
        await panel.locator("#abroad-gst").selectOption("not_registered_for_gst");
        await panel.locator("#abroad-forex").fill("2.5");
        await panel.locator("#abroad-tds").selectOption("do_not_deduct");
        await panel.locator("#abroad-forms").selectOption("none");
        await panel.locator("#abroad-basis").fill("Walk CA's note: a subscription paid by card.");
        await panel.locator("#abroad-by").fill("Walk CA");
        await panel.locator("#abroad-on").fill("2026-11-14");
      },
    );
    const decidedPage = await open(
      page,
      kit,
      `/data/money/vendors/${WALK_IDS.vendorAbroad}`,
      '[data-section="vendor-abroad"]',
    );
    kit.check(
      "money MO11: a vendor abroad names both forms until the CA confirms, and records the decision",
      abroad.includes(
        "The sources name these forms as 145 and 146, or as 15CA and 15CB. Your CA confirms which.",
      ) &&
        options.includes("The form only") &&
        options.includes("The form and an accountant's certificate") &&
        decidedPage.includes("Decided by Walk CA (CA), 14 Nov 2026.") &&
        decidedPage.includes("2.5 per cent"),
      { decided, options },
    );

    // ---------------------------------------------------------------- MO12, MO13: an export invoice
    await post("/data/_test/money/pin", { kind: "export", id: WALK_IDS.exportInvoice });
    await open(page, kit, "/data/money/exports", '[data-section="money-exports"]');
    const invoiced = await submit(
      page,
      page.locator(".pagebar__actions"),
      "Add an export invoice",
      "Add the invoice",
      async (panel) => {
        await panel.locator("#export-new-customer").fill("Walk Customer Inc");
        await panel.locator("#export-new-country").fill("United States");
        await panel.locator("#export-new-number").fill("WALK-EXP-0001");
        await panel.locator("#export-new-on").fill("2026-10-20");
        await panel.locator("#export-new-currency").selectOption("USD");
        await panel.locator("#export-new-amount").fill("5,000.00");
        await panel.locator("#export-new-tax").selectOption("under_lut");
        await panel.locator("#export-new-purpose").fill("P0802");
      },
    );
    const exportsPage = await open(
      page,
      kit,
      "/data/money/exports",
      '[data-section="money-exports"]',
    );
    kit.check(
      'money MO12: the export invoice of 20 Oct 2026 reads "By 30 Nov 2026" and "Not worked out"',
      exportsPage.includes("By 30 Nov 2026") &&
        exportsPage.includes("Not worked out: the sources give 9 months and 15 months."),
      { invoiced, text: exportsPage.slice(0, 300) },
    );
    await open(
      page,
      kit,
      `/data/money/exports/${WALK_IDS.exportInvoice}`,
      '[data-section="export-receipts"]',
    );
    const fira = Buffer.from(await inventedPdf(["Invented: a FIRA for USD 5,000."], "Walk FIRA"));
    const received = await submit(
      page,
      page.locator('[data-section="export-receipts"]'),
      "Record a receipt",
      "Record it",
      async (panel) => {
        await panel.locator("#receipt-on").fill("2026-11-12");
        await panel.locator("#receipt-amount").fill("5,000.00");
        await panel.locator("#receipt-inr").fill("4,41,250.00");
        await panel.locator("#receipt-fira").fill("WALK-FIRA-0001");
        await panel.locator("#receipt-copy-file").setInputFiles({
          name: "walk-fira-0001.pdf",
          mimeType: "application/pdf",
          buffer: fira,
        });
      },
    );
    const receiptPage = await open(
      page,
      kit,
      `/data/money/exports/${WALK_IDS.exportInvoice}`,
      '[data-section="export-receipts"]',
    );
    kit.check(
      'money MO13: a receipt with a FIRA reads "₹88.25 a dollar"',
      received.includes("₹88.25 a dollar") &&
        receiptPage.includes("₹88.25 a dollar") &&
        receiptPage.includes("WALK-FIRA-0001"),
      received,
    );

    // ---------------------------------------------------------------- MO14: the hold, in Files' trash
    const fileId = (await billOf(WALK_IDS.bill))?.file_id ?? "";
    await post(`/data/files/${fileId}/trash`);
    await page.goto(`${kit.base}/data/files?view=trash`, { waitUntil: "networkidle" });
    const row = page.locator("tr", { hasText: "Walk Legal LLP WALK-INV-0007" }).first();
    const refusedForever = await submit(
      page,
      row,
      "Delete forever",
      "Delete forever",
      async () => undefined,
    );
    const stillThere = (await kit.socket.ask("GET", `/data/files/${fileId}`)).status === 200;
    kit.check(
      "money MO14: the bill's PDF in the trash cannot be deleted forever, and says why",
      refusedForever.includes(
        "A bill from Walk Legal LLP, 12 Nov 2026 is kept until 31 Mar 2035, so it cannot be deleted. It can stay in the trash.",
      ) && stillThere,
      refusedForever,
    );
    await post(`/data/files/${fileId}/restore`);
  }

  // ---------------------------------------------------------------- MO15: every page, every pass
  const pages: [string, string, string][] = [
    ["/data/money", '[data-section="money-bills"]', "money-bills"],
    [`/data/money/bills/${WALK_IDS.bill}`, '[data-section="bill-pay"]', "money-bill"],
    ["/data/money/vendors", '[data-section="money-vendors"]', "money-vendors"],
    [`/data/money/vendors/${WALK_IDS.vendor}`, '[data-section="vendor-years"]', "money-vendor"],
    [
      `/data/money/vendors/${WALK_IDS.vendorAbroad}`,
      '[data-section="vendor-abroad"]',
      "money-vendor-abroad",
    ],
    ["/data/money/ledger", '[data-section="money-ledger"]', "money-ledger"],
    ["/data/money/exports", '[data-section="money-exports"]', "money-exports"],
    [
      `/data/money/exports/${WALK_IDS.exportInvoice}`,
      '[data-section="export-clocks"]',
      "money-export",
    ],
  ];
  const percent: string[] = [];
  for (const [path, ready, name] of pages) {
    const text = await open(page, kit, path, ready);
    if (!text) continue;
    if (text.includes("%")) percent.push(path);
    if (!text.includes("A record and a reminder, not legal, tax or accounting advice."))
      percent.push(`${path}: no About line`);
    await kit.audit(name);
  }
  kit.check(
    `money MO15: every Money page at ${kit.pass.width} in ${kit.pass.theme} carries the About line and no "%"`,
    percent.length === 0,
    percent,
  );
  kit.check(
    "money MO15: nothing was sent",
    kit.outbox().length === outboxBefore,
    kit.outbox().length - outboxBefore,
  );
}
