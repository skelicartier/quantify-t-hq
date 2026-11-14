/**
 * The register of members, walked against the stand-in (ws-notes/company/spec.md §7.10,
 * RM1–RM8): the empty register (RM1); a class and two invented subscribers added up in the
 * holdings view in words, never a "%" (RM2); an overlapping entry refused (RM3); a
 * certificate issued and its number refused a second time (RM4); a test allotment reversed,
 * struck through and left out of the holdings (RM5); the CSV (RM6); print (RM7); and the
 * intern (RM8). Every member is invented, on `.example` addresses.
 */

import type { Page } from "playwright";

import { WALKER, type Shot, type WalkKit } from "./kit";

export const shots: Shot[] = [
  { name: "data-company-members", path: "/data/company/members", ready: "#table-members" },
  {
    name: "data-company-members-holdings",
    path: "/data/company/members?view=holdings",
    ready: "#table-holdings-from-the-register",
  },
];

const BASE = "/data/company/members";
const CLASS = "Equity shares of ₹10 each";
const FOUNDER = { name: "Walk Founder", email: "walk.founder@walk-company.example" };
const COFOUNDER = { name: "Walk Co-founder", email: "walk.cofounder@walk-company.example" };
const SUBSCRIBED = "2025-08-14";

const flat = (text: string) => text.replace(/\s+/g, " ").trim();

async function shown(page: Page, kit: WalkKit, selector: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const found = await page
      .waitForSelector(selector, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (found) return true;
    console.log(`[walk] ${selector} was not there: ${flat(await kit.text()).slice(0, 160)}`);
    if (attempt === 0) await page.reload({ waitUntil: "networkidle" });
  }
  kit.check(`${selector} is on the page`, false, flat(await kit.text()).slice(0, 200));
  return false;
}

type Register = {
  classes: { class_id: string; name: string }[];
  members: { member_id: string; folio: string; name: string }[];
  entries: {
    entry_id: string;
    member_id: string;
    shares: number;
    reversed: unknown;
    note: string;
  }[];
  certificates: { number: string }[];
};

async function register(kit: WalkKit): Promise<Register> {
  return (await kit.socket.ask("GET", "/data/members")).body as unknown as Register;
}

/** Opens a header popover by its label, fills it and presses its button; what it said. */
async function submit(
  page: Page,
  label: string,
  fill: () => Promise<void>,
  button: string,
): Promise<string> {
  const popover = page.locator(".pagebar__actions details.popover", {
    has: page.locator(`summary:text-is("${label}")`),
  });
  if ((await popover.getAttribute("open")) === null)
    await popover.locator("summary.popover__trigger").click();
  await fill();
  await popover.locator("button", { hasText: button }).click();
  const feedback = popover.locator(".form-sent, [role='alert']");
  await feedback
    .first()
    .waitFor({ timeout: 20_000 })
    .catch(() => undefined);
  const said = flat((await feedback.allInnerTexts().catch(() => [] as string[])).join(" "));
  await page.reload({ waitUntil: "networkidle" });
  return said;
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/members")).status !== 200) {
    kit.check("members: not loaded in this service", true);
    return;
  }
  const today = String((await kit.socket.ask("GET", "/data/_test/day")).body.day ?? "");

  if (kit.pass.first) {
    let book = await register(kit);
    // ---------------------------------------------------------------- RM1: empty
    await page.goto(`${kit.base}${BASE}`, { waitUntil: "networkidle" });
    if (!(await shown(page, kit, ".hqdata-members"))) return;
    if (book.classes.length === 0)
      kit.check(
        "members RM1: the empty register shows No classes of shares yet",
        flat(await kit.text()).includes("No classes of shares yet"),
      );

    // ---------------------------------------------------------------- RM2: a class, two subscribers
    if (!book.classes.some((item) => item.name === CLASS))
      await submit(
        page,
        "Add a class of shares",
        async () => {
          await page.fill("#class-name", CLASS);
          await page.fill("#class-nominal", "10");
        },
        "Add the class",
      );
    for (const person of [FOUNDER, COFOUNDER])
      if (!(await register(kit)).members.some((member) => member.name === person.name))
        await submit(
          page,
          "Add a member",
          async () => {
            await page.fill("#member-name", person.name);
            await page.fill("#member-email", person.email);
            await page.fill("#member-address", "Invented: 1 Walk Street, Walk Town");
            await page.fill("#member-id-number", "ZZZPZ0000Z");
            await page.selectOption("#member-residency", "resident");
            await page.fill("#member-nationality", "Indian");
            await page.fill("#member-became", SUBSCRIBED);
          },
          "Add the member",
        );
    book = await register(kit);
    const folio = (name: string) => book.members.find((member) => member.name === name);
    // The walk's own class: after the merge the closing walk's class may be listed first.
    const classId = book.classes.find((item) => item.name === CLASS)?.class_id ?? "";
    const pickClass = async (select: string) => {
      if (classId && (await page.locator(select).count())) await page.selectOption(select, classId);
    };
    for (const [person, shares, from, to] of [
      [FOUNDER, 9_000, 1, 9_000],
      [COFOUNDER, 1_000, 9_001, 10_000],
    ] as const) {
      const member = folio(person.name);
      if (!member || book.entries.some((entry) => entry.member_id === member.member_id)) continue;
      await submit(
        page,
        "Record an entry",
        async () => {
          await page.selectOption("#entry-member", member.member_id);
          await pickClass("#entry-class");
          await page.selectOption("#entry-kind", "subscription");
          await page.fill("#entry-shares", String(shares));
          await page.fill("#entry-from", String(from));
          await page.fill("#entry-to", String(to));
          await page.fill("#entry-price", "10");
          await page.fill("#entry-paid", "10");
          await page.fill("#entry-on", SUBSCRIBED);
          await page.fill("#entry-entered", SUBSCRIBED);
          await page.fill("#entry-words", "Subscribers to the memorandum");
        },
        "Record the entry",
      );
    }
    await page.goto(`${kit.base}${BASE}?view=holdings`, { waitUntil: "networkidle" });
    if (!(await shown(page, kit, "#table-holdings-from-the-register"))) return;
    const holdings = flat(await page.locator("#table-holdings-from-the-register").innerText());
    kit.check(
      "members RM2: holdings read 9,000 of 10,000 · 90.0 per cent and 1,000 of 10,000 · 10.0 per cent, and no % on the page",
      holdings.includes("9,000 of 10,000 · 90.0 per cent") &&
        holdings.includes("1,000 of 10,000 · 10.0 per cent") &&
        !(await kit.text()).includes("%"),
      holdings.slice(0, 200),
    );

    // ---------------------------------------------------------------- RM3: an overlap refused
    await page.goto(`${kit.base}${BASE}`, { waitUntil: "networkidle" });
    const cofounder = folio(COFOUNDER.name);
    const overlap = await submit(
      page,
      "Record an entry",
      async () => {
        if (cofounder) await page.selectOption("#entry-member", cofounder.member_id);
        await pickClass("#entry-class");
        await page.selectOption("#entry-kind", "allotment");
        await page.fill("#entry-shares", "101");
        await page.fill("#entry-from", "9500");
        await page.fill("#entry-to", "9600");
      },
      "Record the entry",
    );
    // F002 on a fresh register; after the merge the closing walk's holder may come first.
    kit.check(
      "members RM3: an entry over 9,500–9,600 is refused with its sentence",
      overlap.includes(
        `Shares 9,500–9,600 of this class are already in folio ${cofounder?.folio ?? "F002"}.`,
      ),
      overlap,
    );

    // ---------------------------------------------------------------- RM4: a certificate
    const founder = folio(FOUNDER.name);
    const issue = async () =>
      submit(
        page,
        "Issue a certificate",
        async () => {
          if (founder) await page.selectOption("#certificate-member", founder.member_id);
          await pickClass("#certificate-class");
          await page.fill("#certificate-shares", "9000");
          await page.fill("#certificate-number", "SC-001");
          await page.fill("#certificate-from", "1");
          await page.fill("#certificate-to", "9000");
          await page.fill("#certificate-issued", today);
          await page.fill("#certificate-stamp", "50");
          await page.fill("#certificate-reference", "WALK-STAMP-001");
        },
        "Issue it",
      );
    if (!(await register(kit)).certificates.some((item) => item.number === "SC-001")) {
      const first = await issue();
      kit.check(
        "members RM4: Issue it says Issued SC-001.",
        first.startsWith("Issued SC-001."),
        first,
      );
    }
    const again = await issue();
    await page.goto(`${kit.base}${BASE}?view=certificates`, { waitUntil: "networkidle" });
    const certificates = flat(
      await page
        .locator("#table-share-certificates")
        .innerText()
        .catch(() => ""),
    );
    kit.check(
      "members RM4: SC-001 is listed, and SC-001 again is refused",
      certificates.includes("SC-001") && again.includes("Certificate SC-001 is already issued."),
      again,
    );

    // ---------------------------------------------------------------- RM5: reverse a test allotment
    book = await register(kit);
    let test = book.entries.find((entry) => entry.note === "Invented: a test allotment to reverse");
    const equity = book.classes.find((item) => item.name === CLASS) ?? book.classes[0];
    if (!test && founder && equity) {
      const made = await kit.socket.ask("POST", "/data/members/entries", {
        member_id: founder.member_id,
        class_id: equity.class_id,
        kind: "allotment",
        shares: 10,
        on: today,
        entered_on: today,
        note: "Invented: a test allotment to reverse",
        by: WALKER,
      });
      test = (made.body.entry as Register["entries"][number] | undefined) ?? undefined;
    }
    if (test && !test.reversed) {
      await page.goto(`${kit.base}${BASE}`, { waitUntil: "networkidle" });
      const row = page.locator(`#entry-${test.entry_id}`);
      await row.locator("summary.popover__trigger", { hasText: "Reverse it" }).click();
      await row.locator('input[name="why"]').fill("Invented: entered by mistake");
      await row.locator("button", { hasText: "Reverse the entry" }).click();
      await row
        .locator(".form-sent, [role='alert']")
        .first()
        .waitFor({ timeout: 20_000 })
        .catch(() => undefined);
    }
    await page.goto(`${kit.base}${BASE}`, { waitUntil: "networkidle" });
    const reversed = test
      ? ((await page.locator(`#entry-${test.entry_id}`).getAttribute("class")) ?? "")
      : "";
    await page.goto(`${kit.base}${BASE}?view=holdings`, { waitUntil: "networkidle" });
    const after = flat(await page.locator("#table-holdings-from-the-register").innerText());
    kit.check(
      "members RM5: the reversed allotment stays, struck through, and the holdings are as before",
      reversed.includes("hqdata-members__row--reversed") &&
        after.includes("9,000 of 10,000 · 90.0 per cent"),
      `${reversed} · ${after.slice(0, 120)}`,
    );

    // ---------------------------------------------------------------- RM6: the CSV
    const response = await page.request.get(`${kit.base}${BASE}/export`);
    const csv = await response.text();
    const lines = csv.trim().split(/\r?\n/);
    book = await register(kit);
    const withEntries = new Set(book.entries.map((entry) => entry.member_id));
    const expected =
      book.entries.length +
      book.members.filter((member) => !withEntries.has(member.member_id)).length;
    const addresses = csv.match(/[^\s,"]+@[^\s,"]+/g) ?? [];
    kit.check(
      "members RM6: Download (CSV) starts with the BOM and folio,name,kind, one line per entry, and no address but the invented ones",
      response.status() === 200 &&
        csv.startsWith("﻿folio,name,kind") &&
        lines.length - 1 === expected &&
        addresses.every((address) => address.endsWith(".example")),
      `${response.status()} · ${lines.length - 1} of ${expected} · ${addresses.join(" ")}`,
    );

    // ---------------------------------------------------------------- RM7: print
    await page.goto(`${kit.base}${BASE}`, { waitUntil: "networkidle" });
    await page.emulateMedia({ media: "print" });
    // No named helpers inside `evaluate`: the bundler would wrap them in a name it adds.
    const printed = await page.evaluate(() => ({
      table: [document.querySelector("#table-members")].some(
        (element) =>
          element !== null &&
          getComputedStyle(element).display !== "none" &&
          element.getBoundingClientRect().height > 0,
      ),
      controls: [...document.querySelectorAll("main button, main summary, main .btn")].filter(
        (element) =>
          getComputedStyle(element).display !== "none" &&
          getComputedStyle(element).visibility !== "hidden" &&
          element.getBoundingClientRect().height > 0,
      ).length,
    }));
    await page.emulateMedia({ media: "screen" });
    kit.check(
      "members RM7: printed, the register shows with no buttons",
      printed.table && printed.controls === 0,
      printed,
    );
  }

  // ---------------------------------------------------------------- every pass: the views
  await page.goto(`${kit.base}${BASE}`, { waitUntil: "networkidle" });
  if (!(await shown(page, kit, "#table-members"))) return;
  await kit.audit("company-members");
  await page.goto(`${kit.base}${BASE}?view=certificates`, { waitUntil: "networkidle" });
  if (!(await shown(page, kit, "#table-share-certificates"))) return;
  await kit.audit("company-members-certificates");
  await page.goto(`${kit.base}${BASE}?view=holdings`, { waitUntil: "networkidle" });
  if (!(await shown(page, kit, "#table-holdings-from-the-register"))) return;
  kit.check(
    "members: the holdings view says it is not a model, and has no %",
    flat(await kit.text()).includes("this is not a cap-table model") &&
      !(await kit.text()).includes("%"),
  );
  await kit.audit("company-members-holdings");

  // ---------------------------------------------------------------- RM8: the intern
  if (kit.pass.first) {
    const browser = page.context().browser();
    if (!browser) kit.check("members RM8: a browser for the intern", false);
    else {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const intern = await context.newPage();
      try {
        await intern.goto(`${kit.base}/dev/signin?as=intern%40hq.test&next=%2Fdata`, {
          waitUntil: "networkidle",
        });
        await intern.goto(`${kit.base}${BASE}`, { waitUntil: "networkidle" });
        const text = await intern.locator("main").first().innerText();
        const csv = await intern.request.get(`${kit.base}${BASE}/export`);
        kit.check(
          "members RM8: as the intern, Members says Data is for Owners and Admins., and the CSV is refused",
          text.includes("Data is for Owners and Admins.") &&
            !text.includes("@") &&
            csv.status() === 403,
          `${flat(text).slice(0, 80)} · ${csv.status()}`,
        );
      } finally {
        await context.close();
      }
    }
  }
}
