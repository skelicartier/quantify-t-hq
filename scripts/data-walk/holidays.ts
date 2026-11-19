/**
 * Holidays, walked against the stand-in (duties spec §7.4, §7.7): next year's empty sentence
 * (HO1); "Add the three national holidays" for 2027, and Independence Day falling on a Sunday
 * (HO2); a company holiday on 4 Nov 2026 and the count "5 working days after 31 Oct 2026 is 9
 * Nov 2026" (HO3); a pasted list with a bad line refused, nothing added (HO4); the page at
 * 412px with no overflow (HO5). Every holiday but the three fixed national days is invented.
 */

import type { Page } from "playwright";

import { WALKER, type Shot, type WalkKit } from "./kit";

const PATH = "/data/registers/holidays";
const NEXT_YEAR = 2027;
const COMPANY_DAY = "2026-11-04";

export const shots: Shot[] = [
  {
    name: "data-registers-holidays",
    path: `${PATH}?year=${NEXT_YEAR}`,
    ready: '[data-section="holidays-week"]',
  },
];

const flat = (text: string) => text.replace(/\s+/g, " ").trim();

/** The stand-in's start: nothing recorded (safe to run twice). */
export async function seed(socketPath: string): Promise<void> {
  const { request } = await import("node:http");
  const body = JSON.stringify({ reset: true, by: WALKER });
  await new Promise<void>((resolve) => {
    const outgoing = request(
      {
        socketPath,
        path: "/data/_test/holidays/seed",
        method: "POST",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) },
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve());
      },
    );
    outgoing.on("error", () => resolve());
    outgoing.write(body);
    outgoing.end();
  });
}

type Holiday = { holiday_id: string; on: string; name: string; kind: string };

async function until(page: Page, test: () => Promise<boolean>): Promise<boolean> {
  for (let tries = 0; tries < 100; tries += 1) {
    if (await test()) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/holidays")).status !== 200) {
    kit.check("holidays: not loaded in this service", true);
    return;
  }
  const year = async (y: number) =>
    ((await kit.socket.ask("GET", `/data/holidays?year=${y}`)).body.holidays as Holiday[]) ?? [];
  const open = async (query: string) => {
    await page.goto(`${kit.base}${PATH}${query}`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-section="holidays-week"]', { timeout: 30_000 });
    return flat(await kit.text());
  };

  // HO1: next year, empty.
  if (kit.pass.first && (await year(NEXT_YEAR)).length === 0) {
    const text = await open(`?year=${NEXT_YEAR}`);
    kit.check(
      "holidays HO1: with nothing recorded for 2027, the page says how to begin and counts Monday to Friday",
      text.includes(
        "No holidays recorded for 2027. Add the three national holidays, then your state's list as your CA confirms it. Until then working days are counted Monday to Friday.",
      ) &&
        text.includes(
          "No holidays are recorded for 2027, so working days are counted Monday to Friday.",
        ) &&
        (await page.locator('a[aria-current="page"]', { hasText: "Holidays" }).count()) === 1,
      text.slice(0, 300),
    );
  }

  // HO2: the three national holidays, and Independence Day on a Sunday.
  if (kit.pass.first) {
    await open(`?year=${NEXT_YEAR}`);
    await page.locator("button", { hasText: "Add the three national holidays" }).click();
    await until(page, async () => (await year(NEXT_YEAR)).length >= 3);
  }
  const national = await open(`?year=${NEXT_YEAR}`);
  const names = (await year(NEXT_YEAR)).map((holiday) => holiday.name);
  kit.check(
    "holidays HO2: 2027 lists Republic Day, Independence Day and Gandhi Jayanti, and Independence Day falls on a Sunday",
    ["Republic Day", "Independence Day", "Gandhi Jayanti"].every(
      (name) => names.includes(name) && national.includes(name),
    ) && national.includes("Independence Day falls on a Sunday, a weekly off day."),
    national.slice(0, 300),
  );
  await kit.audit("registers-holidays");

  // HO3: a company holiday on 4 Nov 2026, and the count that skips it.
  if (kit.pass.first && !(await year(2026)).some((holiday) => holiday.on === COMPANY_DAY)) {
    await open("?year=2026");
    await page.locator("summary", { hasText: "Add a holiday" }).click();
    await page.fill("#holiday-new-on", COMPANY_DAY);
    await page.fill("#holiday-new-name", "Walk company day");
    await page.selectOption("#holiday-new-kind", "company");
    await page.locator("form button", { hasText: "Add it" }).click();
    await until(page, async () => (await year(2026)).some((holiday) => holiday.on === COMPANY_DAY));
  }
  await open("?year=2026");
  await page.fill("#holidays-from", "2026-10-31");
  await page.fill("#holidays-days", "5");
  await page.locator("form.hqdata-holidays__count button", { hasText: "Count" }).click();
  await page.waitForURL(/count=5/, { timeout: 20_000 }).catch(() => undefined);
  const counted = flat(await page.locator('[data-section="holidays-count"]').innerText());
  kit.check(
    "holidays HO3: with a company holiday on 4 Nov 2026, 5 working days after 31 Oct 2026 is 9 Nov 2026",
    counted.includes("5 working days after 31 Oct 2026 is 9 Nov 2026.") &&
      counted.includes("Walk company day, 4 Nov 2026"),
    counted.slice(0, 240),
  );

  // HO4: a paste with a bad line is refused, and nothing is added.
  if (kit.pass.first) {
    const before = (await year(NEXT_YEAR)).length;
    await open(`?year=${NEXT_YEAR}`);
    await page.locator("summary", { hasText: "Paste a list" }).click();
    await page.fill(
      "#holiday-paste",
      "2027-03-08, Walk state day one\n2027-03-09, Walk state day two\n32 Jan 2027, Walk state day three",
    );
    await page.locator("form button", { hasText: "Add them" }).click();
    const refused = await kit
      .says("Line 3: “32 Jan 2027” is not a day.")
      .then(() => true)
      .catch(() => false);
    kit.check(
      "holidays HO4: a pasted list with a bad line is refused with the line's sentence, and nothing is added",
      refused && (await year(NEXT_YEAR)).length === before,
      { before, after: (await year(NEXT_YEAR)).length },
    );
  }

  // HO5: at 412px nothing runs off the side, and no button prints.
  if (kit.pass.width === "phone") {
    await open(`?year=${NEXT_YEAR}`);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    kit.check("holidays HO5: at 412px the page does not run off the side", overflow <= 1, overflow);
  }
  await page.emulateMedia({ media: "print" });
  const printed = await page.locator("main .hqdata-holidays button:visible").count();
  await page.emulateMedia({ media: "screen" });
  kit.check("holidays: printed, no button shows", printed === 0, printed);
}
