/**
 * The close, walked against the stand-in (ws-notes/company/spec.md §9.11 CL1–CL12). In this
 * copy C1's `key-dates` and C2's `members` and `meetings` are not here, so the walk installs
 * the closing's stand-ins first (after the merge they decline and the real ones answer).
 *
 * The walks run in the order of their names, so this one runs before the investors walk,
 * whose first pass starts its firms again from the list: the walk qualifies Walk Fund 281,
 * records its amount and moves it to Soft commit itself (CL2) rather than leaning on that
 * walk's amounts. The closing it starts stays across the passes; later passes check the
 * pages against the service. Every firm and person is invented, on `.example`.
 */

import { createHash } from "node:crypto";

import type { Page } from "playwright";

import { WALKER, type Shot, type WalkKit } from "./kit";

export const shots: Shot[] = [
  { name: "data-closing", path: "/data/investors/closing", ready: "#table-closings" },
];

const investorIdOf = (firmKey: string): string =>
  createHash("sha256").update(`investor:${firmKey}`).digest("hex").slice(0, 32);
const FIRM_ID = investorIdOf("fund281.example");

const flat = (text: string) => text.replace(/\s+/g, " ").trim();
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const words = (day: string) =>
  `${Number(day.slice(8))} ${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;
const short = (day: string) => `${Number(day.slice(8))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;

function plus(day: string, count: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + count)).toISOString().slice(0, 10);
}

/** The contract file's month arithmetic: the same day, or that month's last. */
function addMonths(day: string, months: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const index = month - 1 + months;
  const y = year + Math.floor(index / 12);
  const m = (((index % 12) + 12) % 12) + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(date, last)).padStart(2, "0")}`;
}

function fyLabel(day: string): string {
  const year = Number(day.slice(0, 4));
  const start = Number(day.slice(5, 7)) >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

const OFFERS = (n: number, fy: string) =>
  `${n} offered in ${fy}. The law allows 200 a year per class of shares; a syndicate or fund counts once.`;

async function until(page: Page, test: () => Promise<boolean>): Promise<boolean> {
  for (let tries = 0; tries < 100; tries += 1) {
    if (await test()) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

async function shown(page: Page, kit: WalkKit, selector: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const found = await page
      .waitForSelector(selector, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (found) return true;
    if (attempt === 0) await page.reload({ waitUntil: "networkidle" });
  }
  kit.check(`closing: ${selector} is on the page`, false, flat(await kit.text()).slice(0, 200));
  return false;
}

type Closing = {
  instrument: string;
  money_received: { on: string } | null;
  allotment: { on: string; shares: number } | null;
  register: { folio: string } | null;
  bank_kyc: unknown;
  valuation: unknown;
  offer_letter: unknown;
};
type Link = { rule_key: string; title: string; due_on: string; state: string };
type Detail = {
  closing: Closing | null;
  guardrails: { key: string; words: string }[];
  deadlines: { rule_key: string; on: string; done_on: string | null }[];
  key_dates: Link[] | null;
};

async function detailOf(kit: WalkKit): Promise<Detail> {
  return (await kit.socket.ask("GET", `/data/closing/${FIRM_ID}`)).body as unknown as Detail;
}

async function standIns(kit: WalkKit): Promise<Link[]> {
  return (
    ((await kit.socket.ask("GET", "/data/_test/closing/key-dates")).body.dates as Link[]) ?? []
  );
}

/** The closing's Key dates: the stand-in's, or the real ones the closing links to. */
async function keyDatesOf(kit: WalkKit, real: boolean): Promise<Link[]> {
  return real ? ((await detailOf(kit)).key_dates ?? []) : standIns(kit);
}

/**
 * A class of shares for the terms: the stand-in's, or, with the real register, one of the
 * closing's own, added once. Not the members walk's equity class, whose holdings that walk
 * counts.
 */
const CLOSING_CLASS = "Series Walk equity shares of ₹10 each";
async function classFor(kit: WalkKit, real: boolean): Promise<string> {
  if (!real) return "stand-in-equity";
  type Classes = { classes?: { class_id: string; name: string }[] };
  const known = ((await kit.socket.ask("GET", "/data/members")).body as Classes).classes ?? [];
  const found = known.find((item) => item.name === CLOSING_CLASS);
  if (found) return found.class_id;
  const made = await kit.socket.ask("POST", "/data/members/classes", {
    name: CLOSING_CLASS,
    kind: "equity",
    nominal: 10,
    by: WALKER,
  });
  return String((made.body.class as { class_id?: string } | undefined)?.class_id ?? "");
}

const section = (page: Page) => page.locator('[data-section="investor-closing"]');

/** Open a checklist row's "Record it" (or "Change"), fill it, and send it. */
async function record(
  page: Page,
  slug: string,
  fill: (form: ReturnType<Page["locator"]>) => Promise<void>,
): Promise<string> {
  const row = section(page).locator(`tr[data-step="${slug}"]`);
  await row.locator("summary").first().click();
  const form = row.locator("form").first();
  await fill(form);
  await form.locator('button[type="submit"]').click();
  const line = form.locator(".form-sent, .callout--danger").first();
  return line
    .waitFor({ timeout: 20_000 })
    .then(async () => flat(await line.innerText()))
    .catch(() => "");
}

async function openFirm(page: Page, kit: WalkKit): Promise<boolean> {
  await page.goto(`${kit.base}/data/investors/${FIRM_ID}`, { waitUntil: "networkidle" });
  return shown(page, kit, '[data-section="investor-closing"]');
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/closing")).status !== 200) {
    kit.check("closing: not loaded in this service", true);
    return;
  }
  if ((await kit.socket.ask("GET", `/data/investors/${FIRM_ID}`)).status !== 200) {
    kit.check("closing: Walk Fund 281 is not an investor firm here", false);
    return;
  }
  const today = String((await kit.socket.ask("GET", "/data/_test/day")).body.day ?? "");
  // C1's and C2's services are not in this copy: the closing's stand-ins (they decline after the
  // merge, answering `real: true`, and the walk then reads the real Key dates and register).
  const real = { "key-dates": false, members: false };
  for (const name of ["key-dates", "members"] as const)
    real[name] =
      (await kit.socket.ask("POST", `/data/_test/closing/${name}`, { by: WALKER })).body.real ===
      true;
  // Before any page is drawn, so the terms form lists it.
  const classId = await classFor(kit, real.members);
  await kit.socket.ask("POST", "/data/_test/closing/meetings", {
    by: WALKER,
    resolutions: [
      {
        resolution_id: "walk-board-allotment",
        title: "Approve the allotment to Walk Fund 281",
        kind: "board",
        passed_on: plus(today, -3),
        meeting_title: "Walk board meeting, invented",
      },
    ],
  });

  const fresh = kit.pass.first && (await detailOf(kit)).closing === null;
  if (fresh) {
    // ---------------------------------------------------------------- CL1: the empty view
    await page.goto(`${kit.base}/data/investors/closing`, { waitUntil: "networkidle" });
    if (!(await shown(page, kit, ".hqdata-closing"))) return;
    const text = flat(await kit.text());
    kit.check(
      "closing CL1: the Closing view says how a checklist starts, and 0 offered this year",
      text.includes(
        "No closing started yet. A firm's closing checklist starts from its page once it reaches Soft commit.",
      ) && text.includes(OFFERS(0, fyLabel(today))),
      text.slice(0, 240),
    );
    await kit.audit("closing-empty");

    // ---------------------------------------------------------------- CL2: the SAFE guardrail
    await kit.socket.ask("POST", `/data/investors/${FIRM_ID}/profile`, {
      residency: "non_resident",
      by: WALKER,
    });
    await page.goto(`${kit.base}/data/investors/${FIRM_ID}`, { waitUntil: "networkidle" });
    await page.locator("summary", { hasText: "Record an amount" }).click();
    const amount = page.locator("form", { has: page.locator("#amount-value") });
    await amount.locator("#amount-state").selectOption("soft");
    await amount.locator("#amount-value").fill("25000");
    await amount.locator("#amount-currency").selectOption("USD");
    await amount.locator("#amount-instrument").selectOption("SAFE");
    await amount.locator("button", { hasText: "Record it" }).click();
    await until(page, async () => (await detailOf(kit)).guardrails.length > 0);
    await kit.socket.ask("POST", `/data/investors/${FIRM_ID}/stage`, {
      stage: "soft",
      next_step: "Send the closing papers",
      next_step_on: today,
      by: WALKER,
    });
    if (!(await openFirm(page, kit))) return;
    const safe = section(page).locator('[data-guardrail="safe-non-resident"]');
    const safeText = (await safe.count()) ? flat(await safe.innerText()) : "";
    kit.check(
      "closing CL2: a SAFE from a non-resident shows its guardrail with its Source and Confirm with your lawyer",
      safeText.includes("treat a US-style SAFE from a non-resident") &&
        safeText.includes("Confirm with your lawyer.") &&
        (await safe.locator("a", { hasText: "Source" }).count()) === 1,
      safeText.slice(0, 200),
    );

    // ---------------------------------------------------------------- CL3: start, the terms
    await section(page).locator("button", { hasText: "Start the closing checklist" }).click();
    await until(page, async () => (await detailOf(kit)).closing !== null);
    await page.reload({ waitUntil: "networkidle" });
    await section(page)
      .locator("summary", { hasText: /^Terms$/ })
      .click();
    const terms = section(page).locator("form.hqdata-terms-form");
    await terms.locator('select[name="instrument"]').selectOption("iSAFE");
    await terms.locator('select[name="class_id"]').selectOption(classId);
    await terms.locator('input[name="shares"]').fill("1250");
    await terms.locator('input[name="price_per_share"]').fill("1000");
    await terms.locator('input[name="holder_name"]').fill("Walk Fund 281");
    await terms.locator('select[name="holder_kind"]').selectOption("fund");
    await terms.locator("button", { hasText: "Save the terms" }).click();
    await until(page, async () => (await detailOf(kit)).closing?.instrument === "iSAFE");
    await page.reload({ waitUntil: "networkidle" });
    const termsText = flat(await section(page).innerText());
    kit.check(
      "closing CL3: the checklist starts; iSAFE under Terms takes the SAFE warning away",
      (await section(page).locator('[data-guardrail="safe-non-resident"]').count()) === 0 &&
        termsText.includes("Walk Fund 281, a fund") &&
        termsText.includes("1,250 shares at ₹1,000"),
      termsText.slice(0, 240),
    );

    // ---------------------------------------------------------------- CL4: the offer letter
    await record(page, "offer-letter", async (form) => {
      await form.locator('input[name="on"]').fill(plus(today, -40));
      await form.locator('input[name="serial"]').fill("PAS-4/001");
    });
    await until(page, async () => Boolean((await detailOf(kit)).closing?.offer_letter));
    const offers = (await kit.socket.ask("GET", "/data/closing")).body.offers as {
      count: number;
      fy: string;
    };
    await page.goto(`${kit.base}/data/investors/closing`, { waitUntil: "networkidle" });
    const offerLine = flat(await page.locator("[data-offers]").innerText());
    kit.check(
      "closing CL4: the offers line counts the offer letter in this financial year",
      offerLine.includes(OFFERS(offers.count, offers.fy)) &&
        (fyLabel(plus(today, -40)) !== fyLabel(today) || offers.count === 1),
      offerLine,
    );

    // ---------------------------------------------------------------- CL5: the money
    if (!(await openFirm(page, kit))) return;
    await record(page, "money-received", async (form) => {
      await form.locator('input[name="on"]').fill(plus(today, -30));
      await form.locator('input[name="amount"]').fill("2500000");
      await form.locator('select[name="currency"]').selectOption("INR");
      await form.locator('input[name="own_account"]').check();
      await form.locator('input[name="reference"]').fill("WALK-FIRC-1");
    });
    await until(page, async () => Boolean((await detailOf(kit)).closing?.money_received));
    await page.reload({ waitUntil: "networkidle" });
    const line = flat(await section(page).locator("[data-deadlines]").innerText());
    const dates = await keyDatesOf(kit, real["key-dates"]);
    kit.check(
      "closing CL5: Allot by today + 30 and Refund by today + 45; Key dates holds the allotment and FIRMS, not the report",
      line.includes(`Allot by ${words(plus(today, 30))}`) &&
        line.includes(`Refund by ${words(plus(today, 45))}`) &&
        dates.some((date) => date.title === "Allot shares to Walk Fund 281, or refund") &&
        dates.some((date) => date.title === "Register the company on FIRMS") &&
        !dates.some((date) => date.rule_key === "advance-receipt"),
      `${line} · ${dates.map((date) => date.title).join(" | ")}`,
    );

    // ---------------------------------------------------------------- CL6, CL7: the allotment
    const refused = await record(page, "allotment", async (form) => {
      await form.locator('input[name="on"]').fill(plus(today, -31));
      await form.locator('input[name="shares"]').fill("1250");
      await form.locator('input[name="price_per_share"]').fill("1000");
    });
    kit.check(
      "closing CL6: an allotment dated before the money arrived is refused with its sentence",
      refused ===
        `Shares are allotted after the money arrives: that day is before ${words(plus(today, -30))}.` &&
        !(await detailOf(kit)).closing?.allotment,
      refused,
    );
    await page.reload({ waitUntil: "networkidle" });
    await record(page, "allotment", async (form) => {
      await form.locator('input[name="on"]').fill(plus(today, -2));
      await form.locator('input[name="shares"]').fill("1250");
      await form.locator('input[name="price_per_share"]').fill("1000");
    });
    await until(page, async () => Boolean((await detailOf(kit)).closing?.allotment));
    const after = await keyDatesOf(kit, real["key-dates"]);
    const due = (rule: string) => after.find((date) => date.rule_key === rule)?.due_on;
    kit.check(
      "closing CL7: PAS-3, the register, the certificates, FC-GPR and the FLA return are in Key dates; the allotment date is Done",
      due("pas-3") === plus(today, 13) &&
        due("register-entry") === plus(today, 5) &&
        due("share-certificates") === addMonths(plus(today, -2), 2) &&
        due("fc-gpr") === plus(today, 28) &&
        after.some((date) => date.title === "FLA return") &&
        after.find((date) => date.rule_key === "allotment")?.state === "done",
      after.map((date) => `${date.rule_key} ${date.due_on} ${date.state}`).join(" | "),
    );

    // ---------------------------------------------------------------- CL8: into the register
    await page.reload({ waitUntil: "networkidle" });
    const entered = await record(page, "register", async () => undefined);
    const registered = (await keyDatesOf(kit, real["key-dates"])).find(
      (date) => date.rule_key === "register-entry",
    );
    // The stand-in's folio, or the one the real register gave.
    const folio = real.members
      ? ((await detailOf(kit)).closing?.register?.folio ?? "none")
      : "F-STAND-IN";
    kit.check(
      "closing CL8: Enter it in the register says the folio, and the register's Key date is Done",
      entered === `Entered in folio ${folio}.` && registered?.state === "done",
      `${entered} · ${registered?.state}`,
    );

    // ---------------------------------------------------------------- CL9: KYC from another bank
    await page.reload({ waitUntil: "networkidle" });
    await record(page, "bank-kyc", async (form) => {
      await form.locator('input[name="on"]').fill(plus(today, -29));
    });
    await until(page, async () => Boolean((await detailOf(kit)).closing?.bank_kyc));
    await page.reload({ waitUntil: "networkidle" });
    kit.check(
      "closing CL9: KYC not from the bank that received the money shows its warning",
      (await section(page).locator('[data-guardrail="receiving-bank"]').count()) === 1,
    );

    // ---------------------------------------------------------------- CL10: an old valuation
    await record(page, "valuation", async (form) => {
      await form.locator('input[name="on"]').fill(plus(today, -100));
      await form.locator('input[name="by_name"]').fill("Walk Valuer");
    });
    await until(page, async () => Boolean((await detailOf(kit)).closing?.valuation));
    await page.reload({ waitUntil: "networkidle" });
    const valuation = section(page).locator('[data-guardrail="valuation-age"]');
    const valuationText = (await valuation.count()) ? flat(await valuation.innerText()) : "";
    kit.check(
      "closing CL10: a valuation 100 days old warns that it was 98 days old on the allotment day",
      valuationText.includes("98 days old on the allotment day") &&
        valuationText.includes("Confirm with your CA."),
      valuationText,
    );
  }

  // ---------------------------------------------------------------- every pass: the firm's section
  const detail = await detailOf(kit);
  if (!detail.closing) {
    kit.check("closing: Walk Fund 281's closing is there", false);
    return;
  }
  if (!(await openFirm(page, kit))) return;
  const sectionText = flat(await section(page).innerText());
  kit.check(
    "closing: the firm's section shows the service's guardrails, deadlines and checklist",
    detail.guardrails.every((guardrail) => sectionText.includes(guardrail.words)) &&
      (await section(page).locator("#table-closing-checklist tbody tr").count()) >= 10 &&
      sectionText.includes("This is a record to keep, not legal advice.") &&
      !sectionText.includes("%"),
    sectionText.slice(0, 240),
  );
  const order = await page
    .locator(".record-layout__main > *")
    .evaluateAll((nodes) =>
      nodes.map(
        (node) =>
          node.getAttribute("data-section") ??
          node.querySelector("[data-section]")?.getAttribute("data-section") ??
          "",
      ),
    );
  kit.check(
    "closing: the firm's page reads Closing, then Notes, then Activity",
    order.indexOf("investor-closing") >= 0 &&
      order.indexOf("investor-closing") < order.indexOf("investor-notes") &&
      order.indexOf("investor-notes") < order.indexOf("investor-activity"),
    order.join(" "),
  );

  // ---------------------------------------------------------------- CL11: the Closing view
  await page.goto(`${kit.base}/data/investors/closing`, { waitUntil: "networkidle" });
  if (!(await shown(page, kit, "#table-closings"))) return;
  const row = flat(
    await page.locator("#table-closings tr", { hasText: "Walk Fund 281" }).first().innerText(),
  );
  const allotment = detail.closing.allotment;
  const view = flat(await kit.text());
  kit.check(
    "closing CL11: the view lists the firm with its shares and the next deadline, and no per cent sign",
    Boolean(allotment) &&
      row.includes(`1,250 shares on ${short(allotment?.on ?? "")}`) &&
      /Next|PAS-3 by|Certificates by|FC-GPR by|Register by/.test(row) &&
      !view.includes("%"),
    row,
  );
  await kit.audit("closing");
  await page.emulateMedia({ media: "print" });
  const buttons = await page.locator("main button:visible").count();
  const urls = await page.locator(".hqdata-print-url:visible").count();
  await page.emulateMedia({ media: "screen" });
  kit.check(
    "closing CL11: printed, the view shows no buttons and prints each source's address",
    buttons === 0 && urls >= 1,
    { buttons, urls },
  );

  // ---------------------------------------------------------------- CL12: the intern
  if (kit.pass.first) {
    const browser = page.context().browser();
    if (browser) {
      const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const intern = await other.newPage();
      await intern.goto(
        `${kit.base}/dev/signin?as=intern%40hq.test&next=${encodeURIComponent("/data/investors/closing")}`,
        { waitUntil: "networkidle" },
      );
      await intern.goto(`${kit.base}/data/investors/closing`, { waitUntil: "networkidle" });
      const body = await intern.locator("main").first().innerText();
      kit.check(
        "closing CL12: the intern sees “Data is for Owners and Admins.” on the Closing view, and no address",
        body.includes("Data is for Owners and Admins.") &&
          !body.includes("@") &&
          (await intern.locator("#table-closings").count()) === 0,
        body.slice(0, 160),
      );
      await other.close();
    } else kit.check("closing CL12: a second browser context", false);
  }
}
