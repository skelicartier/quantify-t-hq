/**
 * Regulatory profiles, walked against the stand-in (ws-notes/security/spec.md §9.8 PR1–PR4):
 * the firm page's profile section (PR1); the profile started with SEBI CSCRF and "High-severity
 * missing patches fixed within 1 week" marked in the contract, and "What this changes in HQ"
 * saying so (PR2); Assurance › Customer duties listing it (PR3); the outbox did not grow (PR4).
 * The firm is the waitlist walk's invented "Walk Capital 2000".
 */

import type { Page } from "playwright";

import { WALK_PROFILE_DUTY, WALK_PROFILE_ENTRY } from "../data/profiles/walk-seed";
import { type Shot, type WalkKit } from "./kit";

export const shots: Shot[] = [
  {
    name: "data-profile",
    path: `/data/waitlist/${WALK_PROFILE_ENTRY}/profile`,
    ready: ".hqdata-profile",
  },
  { name: "data-assurance-customers", path: "/data/assurance/customers", ready: ".hqdata-profile" },
];

const SECTION_NOTE = "Which rules the firm works under, and the duties its contract passes to you.";
const PATCH_EFFECT = "High-severity missing patches are fixed within 1 week.";

const flat = (text: string) => text.replace(/\s+/g, " ").trim();

async function until(page: Page, test: () => Promise<boolean>, tries = 150): Promise<boolean> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    if (await test()) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

async function open(page: Page, kit: WalkKit, path: string, ready: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto(`${kit.base}${path}`, { waitUntil: "networkidle" });
    const found = await page
      .waitForSelector(ready, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (found) return true;
  }
  kit.check(`profiles: ${path} shows ${ready}`, false, flat(await kit.text()).slice(0, 200));
  return false;
}

type Detail = {
  profile_id: string;
  duties: { duty_id: string; key: string | null; state: string }[];
  effects: string[];
};

async function profile(kit: WalkKit): Promise<Detail | null> {
  const answer = await kit.socket.ask("GET", `/data/profiles/for-entry/${WALK_PROFILE_ENTRY}`);
  return answer.status === 200 ? ((answer.body.profile as Detail | null) ?? null) : null;
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/profiles")).status !== 200) {
    kit.check("profiles: not loaded in this service", true);
    return;
  }
  const outbox = kit.outbox().length;
  const today = String((await kit.socket.ask("GET", "/data/_test/day")).body.day ?? "");
  const firmPage = `/data/waitlist/${WALK_PROFILE_ENTRY}`;
  const profilePage = `${firmPage}/profile`;

  // ---------------------------------------------------------------- PR1: the firm page's section
  if (!(await open(page, kit, firmPage, '[data-section="entry-profile"]'))) return;
  const section = page.locator('[data-section="entry-profile"]');
  const said = flat(await section.innerText());
  const link = await section.locator("a", { hasText: "Open the profile" }).getAttribute("href");
  const before = await profile(kit);
  kit.check(
    "profiles PR1: the firm's page has its Regulatory profile section and the link to it",
    link === profilePage &&
      (before ? said.includes("duties in the contract") : said.includes(SECTION_NOTE)),
    said,
  );

  // ---------------------------------------------------------------- PR2: start it, SEBI CSCRF, the patch duty
  if (kit.pass.first) {
    if (!(await profile(kit))) {
      await open(page, kit, profilePage, ".hqdata-profile");
      await page.locator("button", { hasText: "Start the profile" }).click();
      await until(page, async () => (await profile(kit)) !== null);
    }
    if (((await profile(kit))?.duties.length ?? 0) === 0) {
      await open(page, kit, profilePage, '[data-section="profile-rules"]');
      await page.locator("summary", { hasText: "Edit the rules" }).click();
      await page.locator("#rules-sebi").check();
      await page.locator("#rules-sebi-category").selectOption("mid");
      await page.locator("#rules-applies").fill(today);
      await page
        .locator("form", { has: page.locator("#rules-sebi") })
        .locator("button", { hasText: /^Save$/ })
        .click();
      await until(page, async () => ((await profile(kit))?.duties.length ?? 0) >= 6);
    }
    const duty = (await profile(kit))?.duties.find((item) => item.key === WALK_PROFILE_DUTY);
    if (duty && duty.state !== "in_contract") {
      await open(page, kit, profilePage, `#duty-${duty.duty_id}`);
      const row = page.locator(`#duty-${duty.duty_id}`);
      await row.locator("summary", { hasText: "Change" }).click();
      await row.locator(`#duty-${duty.duty_id}-state`).selectOption("in_contract");
      await row.locator("button", { hasText: /^Save$/ }).click();
      await until(page, async () =>
        Boolean(
          (await profile(kit))?.duties.some(
            (item) => item.key === WALK_PROFILE_DUTY && item.state === "in_contract",
          ),
        ),
      );
    }
  }
  if (!(await open(page, kit, profilePage, ".hqdata-profile"))) return;
  const text = flat(await kit.text());
  const effects = flat(
    await page
      .locator('[data-section="profile-effects"]')
      .innerText()
      .catch(() => ""),
  );
  kit.check(
    "profiles PR2: SEBI CSCRF (mid-size) with the patch duty in the contract, and What this changes in HQ says so",
    text.includes("Yes, mid-size") && effects.includes(PATCH_EFFECT) && !text.includes("%"),
    effects.slice(0, 200),
  );
  await kit.audit("profile");

  // ---------------------------------------------------------------- PR3: Customer duties lists it
  if (!(await open(page, kit, "/data/assurance/customers", ".hqdata-profile"))) return;
  const row = flat(
    await page
      .locator("#table-customer-duties tr", { hasText: "Walk Capital 2000" })
      .first()
      .innerText()
      .catch(() => ""),
  );
  kit.check(
    "profiles PR3: Assurance › Customer duties lists Walk Capital 2000 with SEBI CSCRF (mid-size)",
    row.includes("SEBI CSCRF (mid-size)") && row.includes("1 of 6"),
    row,
  );
  await kit.audit("assurance-customers");

  // ---------------------------------------------------------------- PR4: nothing sent
  kit.check(
    "profiles PR4: the outbox did not grow",
    kit.outbox().length === outbox,
    kit.outbox().length,
  );
}
