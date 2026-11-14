/**
 * The legal-document register, walked against the stand-in (ws-notes/company/spec.md §7.10,
 * AG1–AG8): "What is missing" on a fresh copy (AG1); the founder's IP assignment, signed with
 * its copy, as the pinned `walk-agreement` (AG2); an NDA that renews on its own and its
 * notice-by row on Due (AG3); notice given (AG4); a one-month term worked out to its end
 * (AG5); the type tab and the search (AG6); the copies in their Files folders, each file
 * listing its agreement under "Used for" (AG7); the intern, and the Admin seeing no person's
 * name in "What is missing" (AG8). Every party is invented.
 */

import type { Page } from "playwright";

import { inventedPdf } from "../data/files/walk-seed";
import { addDays } from "../data/days";
import { dayWords } from "../../src/lib/data/labels-registers";
import { WALKER, type Shot, type WalkKit } from "./kit";

export const WALK_AGREEMENT = "walk-agreement";

export const shots: Shot[] = [
  {
    name: "data-company-agreements",
    path: "/data/company/agreements",
    ready: "#table-what-is-missing",
  },
  {
    name: "data-company-agreement",
    path: `/data/company/agreements/${WALK_AGREEMENT}`,
    ready: '[data-section="agreement-terms"]',
  },
];

const BASE = "/data/company/agreements";
const FOUNDER_IP = "Walk founder IP assignment";
const NDA = "Walk NDA";
const TRIAL = "Walk one-month trial";
const END_HINT =
  "Worked out as the day before the same date that many months on. Check it against the agreement.";

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

type Row = {
  agreement_id: string;
  title: string;
  signed_file_id: string | null;
  notice_by: string | null;
};
type Must = { key: string; state: string; found: string; missing: { name: string }[] };

async function agreements(kit: WalkKit, query = ""): Promise<Row[]> {
  const all =
    ((await kit.socket.ask("GET", `/data/agreements${query}`)).body.agreements as Row[]) ?? [];
  const ended =
    ((await kit.socket.ask("GET", `/data/agreements?ended=1`)).body.agreements as Row[]) ?? [];
  return query ? all : [...all, ...ended];
}

async function missing(kit: WalkKit): Promise<Must[]> {
  return ((await kit.socket.ask("GET", "/data/agreements")).body.missing as Must[]) ?? [];
}

async function add(page: Page, fill: () => Promise<void>): Promise<string> {
  const popover = page.locator(".pagebar__actions details.popover", {
    has: page.locator('summary:text-is("Add an agreement")'),
  });
  await popover.locator("summary.popover__trigger").click();
  await fill();
  await popover.locator("button", { hasText: "Add the agreement" }).click();
  const feedback = popover.locator(".form-sent, [role='alert']");
  await feedback
    .first()
    .waitFor({ timeout: 20_000 })
    .catch(() => undefined);
  return flat((await feedback.allInnerTexts().catch(() => [] as string[])).join(" "));
}

const pdfOf = async (words: string) => Buffer.from(await inventedPdf([words], "Walk agreement"));

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/agreements")).status !== 200) {
    kit.check("agreements: not loaded in this service", true);
    return;
  }
  const today = String((await kit.socket.ask("GET", "/data/_test/day")).body.day ?? "");

  if (kit.pass.first) {
    // ---------------------------------------------------------------- AG1: a fresh copy
    const fresh = await missing(kit);
    const founder = fresh.find((row) => row.key === "founder_ip");
    const letters = fresh.find((row) => row.key === "letters");
    const before = await agreements(kit);
    kit.check(
      "agreements AG1: on a fresh copy the founder IP assignment is Missing and the people rows are checked in People",
      before.length > 0 ||
        (founder?.state === "missing" &&
          (letters?.found === "Checked in People, by the Owner." ||
            /^\d[\d,]* of \d[\d,]* people engaged have a signed letter$/.test(
              letters?.found ?? "",
            ))),
      { founder, letters },
    );

    // ---------------------------------------------------------------- AG2: the founder's IP assignment
    await page.goto(`${kit.base}${BASE}`, { waitUntil: "networkidle" });
    if (!(await shown(page, kit, "#table-what-is-missing"))) return;
    if (!before.some((row) => row.agreement_id === WALK_AGREEMENT)) {
      await kit.socket.ask("POST", "/data/_test/agreements/pin", {
        id: WALK_AGREEMENT,
        by: WALKER,
      });
      const pdf = await pdfOf("Invented: Walk Founder assigns the code to Walk Company.");
      const said = await add(page, async () => {
        await page.fill("#agreement-new-title", FOUNDER_IP);
        await page.selectOption("#agreement-new-type", "founder_ip");
        await page.selectOption("#agreement-new-status", "signed");
        await page.selectOption("#agreement-new-party-0-kind", "director");
        const picker = page.locator("#agreement-new-party-0-ref");
        const directors = picker.locator("optgroup[label='Directors'] option");
        const director =
          (await directors.count()) > 0 ? await directors.first().getAttribute("value") : null;
        if (director) await picker.selectOption(director);
        else await page.fill("#agreement-new-party-0-name", "Walk Founder");
        await page.fill("#agreement-new-signed", today);
        await page.fill("#agreement-new-effective", today);
        await page.setInputFiles("#agreement-new-copy-file", {
          name: "walk-founder-ip.pdf",
          mimeType: "application/pdf",
          buffer: pdf,
        });
      });
      kit.check("agreements AG2: Add the agreement says Added.", said === "Added.", said);
    }
    await page.reload({ waitUntil: "networkidle" });
    const ipRow = flat(
      await page
        .locator(`#agreement-${WALK_AGREEMENT}`)
        .innerText()
        .catch(() => ""),
    );
    const afterIp = (await missing(kit)).find((row) => row.key === "founder_ip");
    kit.check(
      "agreements AG2: the row reads Signed with its Copy, and Founder IP assignment is Here",
      ipRow.includes("Signed") && ipRow.includes("Copy") && afterIp?.state === "here",
      `${ipRow} · ${afterIp?.state}`,
    );

    // ---------------------------------------------------------------- AG3: an NDA that renews
    if (!(await agreements(kit)).some((row) => row.title === NDA)) {
      const pdf = await pdfOf("Invented: a mutual NDA between Walk Company and Walk Pilot Fund.");
      const said = await add(page, async () => {
        await page.fill("#agreement-new-title", NDA);
        await page.selectOption("#agreement-new-type", "nda");
        await page.selectOption("#agreement-new-status", "signed");
        await page.selectOption("#agreement-new-party-0-kind", "other");
        await page.fill("#agreement-new-party-0-name", "Walk Pilot Fund");
        await page.fill("#agreement-new-effective", today);
        await page.fill("#agreement-new-signed", today);
        await page.fill("#agreement-new-months", "12");
        await page.check("#agreement-new-auto");
        await page.fill("#agreement-new-renews", addDays(today, 40));
        await page.fill("#agreement-new-renewal-months", "12");
        await page.fill("#agreement-new-notice-days", "30");
        await page.setInputFiles("#agreement-new-copy-file", {
          name: "walk-nda.pdf",
          mimeType: "application/pdf",
          buffer: pdf,
        });
      });
      kit.check(
        "agreements AG3: an NDA renewing in 40 days with 30 days' notice says Notice by today plus 10",
        said === `Added. Notice by ${dayWords(addDays(today, 10))}.`,
        said,
      );
    }
    const nda = (await agreements(kit)).find((row) => row.title === NDA);
    await page.goto(`${kit.base}/data`, { waitUntil: "networkidle" });
    await shown(page, kit, ".hqdata-due");
    const dueText = flat(await page.locator(".hqdata-due").first().innerText());
    kit.check(
      "agreements AG3: Data's Due has “Give notice on “Walk NDA” …”",
      dueText.includes(`Give notice on “${NDA}” by`),
      dueText.slice(0, 200),
    );

    // ---------------------------------------------------------------- AG4: notice given
    if (nda) {
      await page.goto(`${kit.base}${BASE}/${nda.agreement_id}`, { waitUntil: "networkidle" });
      if (!(await shown(page, kit, '[data-section="agreement-terms"]'))) return;
      const popover = page.locator(".rhead details.popover", {
        has: page.locator('summary:text-is("Notice given")'),
      });
      await popover.locator("summary.popover__trigger").click();
      await page.fill("#notice-on", today);
      await page.fill("#notice-note", "Invented: sent by email to the walk fund.");
      await popover.locator("button", { hasText: "Record it" }).click();
      const said = flat(
        await popover
          .locator(".form-sent, [role='alert']")
          .first()
          .innerText({ timeout: 20_000 })
          .catch(() => ""),
      );
      await page.reload({ waitUntil: "networkidle" });
      const terms = flat(await page.locator('[data-section="agreement-terms"]').innerText());
      const due =
        ((await kit.socket.ask("GET", "/data/overview")).body.due as { key: string }[]) ?? [];
      kit.check(
        "agreements AG4: Notice given takes the Due row away and the record reads It will not renew on …",
        said === `Recorded. It will not renew on ${dayWords(addDays(today, 40))}.` &&
          terms.includes(`It will not renew on ${dayWords(addDays(today, 40))}`) &&
          !due.some((row) => row.key === `agreement:${nda.agreement_id}:notice`),
        `${said} · ${terms.slice(0, 160)}`,
      );
    }

    // ---------------------------------------------------------------- AG5: 31 Jan 2027 + 1 month
    await page.goto(`${kit.base}${BASE}`, { waitUntil: "networkidle" });
    if (!(await agreements(kit)).some((row) => row.title === TRIAL)) {
      await add(page, async () => {
        await page.fill("#agreement-new-title", TRIAL);
        await page.selectOption("#agreement-new-type", "trial");
        await page.fill("#agreement-new-party-0-name", "Walk Trial Firm");
        await page.fill("#agreement-new-effective", "2027-01-31");
        await page.fill("#agreement-new-months", "1");
      });
    }
    const popover = page.locator(".pagebar__actions details.popover", {
      has: page.locator('summary:text-is("Add an agreement")'),
    });
    if ((await popover.getAttribute("open").catch(() => null)) === null)
      await popover.locator("summary.popover__trigger").click();
    const hint = flat(await popover.innerText());
    await page.reload({ waitUntil: "networkidle" });
    const trial = (await agreements(kit)).find((row) => row.title === TRIAL);
    const trialRow = trial
      ? flat(await page.locator(`#agreement-${trial.agreement_id}`).innerText())
      : "";
    kit.check(
      "agreements AG5: a one-month term from 31 Jan 2027 ends 27 Feb 2027, with the hint to check it",
      trialRow.includes("Ends 27 Feb 2027") && hint.includes(END_HINT),
      trialRow,
    );
  }

  // ---------------------------------------------------------------- AG6: the type tab and search
  await page.goto(`${kit.base}${BASE}?type=nda`, { waitUntil: "networkidle" });
  if (!(await shown(page, kit, "#table-agreements"))) return;
  const types = await page.locator("#table-agreements tbody tr td:nth-child(2)").allInnerTexts();
  await page.goto(`${kit.base}${BASE}?q=${encodeURIComponent(NDA)}`, { waitUntil: "networkidle" });
  const searched = flat(
    await page
      .locator("#table-agreements")
      .innerText()
      .catch(() => ""),
  );
  kit.check(
    "agreements AG6: the NDA tab shows NDAs only, and a search for Walk NDA finds it",
    types.length > 0 && types.every((type) => type.trim() === "NDA") && searched.includes(NDA),
    `${types.join(",")} · ${searched.slice(0, 120)}`,
  );

  // ---------------------------------------------------------------- AG7: copies in their folders
  if (kit.pass.first) {
    const all = await agreements(kit);
    const results: string[] = [];
    for (const [title, folder] of [
      [FOUNDER_IP, "05 Founders, team and ESOP"],
      [NDA, "06 Contracts and NDAs"],
    ] as const) {
      const found = all.find((row) => row.title === title);
      if (!found?.signed_file_id) {
        results.push(`${title}: no copy`);
        continue;
      }
      const file = (await kit.socket.ask("GET", `/data/files/${found.signed_file_id}`)).body;
      await page.goto(`${kit.base}/data/files/${found.signed_file_id}`, {
        waitUntil: "networkidle",
      });
      const text = flat(await kit.text());
      if (!JSON.stringify(file).includes(folder)) results.push(`${title}: not in ${folder}`);
      if (!text.includes(`Signed copy of “${title}”`)) results.push(`${title}: not under Used for`);
    }
    kit.check(
      "agreements AG7: each signed copy is in its folder and its file lists the agreement under Used for",
      results.length === 0,
      results,
    );
  }

  // ---------------------------------------------------------------- the pages, every pass
  await page.goto(`${kit.base}${BASE}`, { waitUntil: "networkidle" });
  if (!(await shown(page, kit, "#table-what-is-missing"))) return;
  await kit.audit("company-agreements");
  await page.goto(`${kit.base}${BASE}/${WALK_AGREEMENT}`, { waitUntil: "networkidle" });
  if (!(await shown(page, kit, '[data-section="agreement-terms"]'))) return;
  kit.check(
    "agreements: walk-agreement shows its terms and parties",
    flat(await kit.text()).includes(FOUNDER_IP) && flat(await kit.text()).includes("Parties"),
  );
  await kit.audit("company-agreement");

  // ---------------------------------------------------------------- AG8: the intern and the Admin
  if (kit.pass.first) {
    const browser = page.context().browser();
    if (!browser) {
      kit.check("agreements AG8: a browser for the intern and the Admin", false);
      return;
    }
    for (const persona of ["intern", "admin"] as const) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const other = await context.newPage();
      try {
        await other.goto(`${kit.base}/dev/signin?as=${persona}%40hq.test&next=%2Fdata`, {
          waitUntil: "networkidle",
        });
        await other.goto(`${kit.base}${BASE}`, { waitUntil: "networkidle" });
        const text = await other.locator("main").first().innerText();
        if (persona === "intern")
          kit.check(
            "agreements AG8: as the intern, Agreements says Data is for Owners and Admins., with no address",
            text.includes("Data is for Owners and Admins.") && !text.includes("@"),
            flat(text).slice(0, 120),
          );
        else {
          const rows = await other
            .locator("#table-what-is-missing tbody tr")
            .allInnerTexts()
            .catch(() => [] as string[]);
          const people = rows.filter((row) => /letter|interns and contractors/i.test(row));
          kit.check(
            "agreements AG8: as the Admin, What is missing names nobody: the people rows are counts or checked in People",
            rows.length === 8 &&
              people.length === 2 &&
              people.every(
                (row) =>
                  flat(row).includes("Checked in People, by the Owner.") ||
                  /\d[\d,]* of \d[\d,]* (people engaged|interns and contractors)/.test(flat(row)),
              ) &&
              !rows.join(" ").includes("@"),
            people.map(flat),
          );
        }
      } finally {
        await context.close();
      }
    }
  }
}
