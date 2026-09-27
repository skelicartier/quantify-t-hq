/**
 * Walks every HQ screen against the mock service and writes screenshots for review.
 *
 *     npm run mock:hq        (terminal 1)
 *     npm run dev            (terminal 2)
 *     npm run check:hq-ui    (this)
 *
 * Three assertions per page, not just pictures:
 *   - the page answered 200 and rendered its main landmark;
 *   - no horizontal overflow at either width (the phone is not a narrow desktop);
 *   - axe reports zero serious or critical violations.
 *
 * Output: test-results/hq/<width>/<theme>/<name>.png
 */

import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Browser, type Page } from "playwright";

const BASE = process.env.HQ_UI_BASE ?? "http://127.0.0.1:3000";
const OUT = "test-results/hq";
const WIDTHS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 412, height: 915 },
] as const;

type Shot = { name: string; path: string; ready?: string };

const SIGNED_IN_PAGES: Shot[] = [
  { name: "home", path: "/home", ready: "main#main-content" },
  { name: "support-queue", path: "/support", ready: ".data-table" },
  {
    name: "support-ticket",
    path: "/support/sup_00000000000000000004",
    ready: ".thread",
  },
  { name: "support-replies", path: "/support/replies", ready: "main#main-content" },
  { name: "me-security", path: "/me/security", ready: "main#main-content" },
];

let failures = 0;

function report(page: string, problem: string) {
  failures += 1;
  console.error(`  ✗ ${page}: ${problem}`);
}

async function assertNoOverflow(page: Page, name: string) {
  const overflow = await page.evaluate(() => {
    const html = document.documentElement;
    return html.scrollWidth - html.clientWidth;
  });
  if (overflow > 1) report(name, `horizontal overflow of ${overflow}px`);
}

async function assertAccessible(page: Page, name: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  for (const violation of serious) {
    report(name, `axe ${violation.impact}: ${violation.id} (${violation.nodes.length} nodes)`);
  }
}

async function capture(page: Page, folder: string, shot: Shot) {
  const response = await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle" });
  if (!response || response.status() !== 200) {
    report(shot.name, `status ${response?.status() ?? "none"}`);
    return;
  }
  if (shot.ready) await page.waitForSelector(shot.ready, { timeout: 10_000 });
  await assertNoOverflow(page, `${folder}/${shot.name}`);
  await assertAccessible(page, `${folder}/${shot.name}`);
  await page.screenshot({ path: `${OUT}/${folder}/${shot.name}.png`, fullPage: true });
  console.log(`  ✓ ${folder}/${shot.name}`);
}

async function toggleTheme(page: Page) {
  const toggle = page.locator("[data-theme-toggle], .appbar__tools button").first();
  await toggle.click();
  await page.waitForTimeout(400);
}

async function run(browser: Browser) {
  for (const viewport of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });
    const page = await context.newPage();

    // Signed-out surfaces first.
    mkdirSync(`${OUT}/${viewport.name}/auth`, { recursive: true });
    await capture(page, `${viewport.name}/auth`, { name: "login", path: "/login" });
    await capture(page, `${viewport.name}/auth`, {
      name: "forgot-password",
      path: "/forgot-password",
    });
    await capture(page, `${viewport.name}/auth`, {
      name: "reset-password-invalid",
      path: "/reset-password",
    });

    // The two-step and the code screen, mid-flow.
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.fill("#email", "owner@hq.test");
    await page.fill("#password", "password-123");
    await page.click("button[type=submit]");
    await page.waitForURL("**/login/verify**", { timeout: 15_000 });
    await assertNoOverflow(page, `${viewport.name}/auth/verify`);
    await assertAccessible(page, `${viewport.name}/auth/verify`);
    await page.screenshot({ path: `${OUT}/${viewport.name}/auth/verify.png`, fullPage: true });
    console.log(`  ✓ ${viewport.name}/auth/verify`);
    await page.fill("#totp-code", "000000");
    await page.click("button[type=submit]");
    await page.waitForURL("**/home", { timeout: 15_000 });

    // Signed-in pages, dark then light.
    for (const theme of ["dark", "light"] as const) {
      mkdirSync(`${OUT}/${viewport.name}/${theme}`, { recursive: true });
      if (theme === "light") await toggleTheme(page);
      for (const shot of SIGNED_IN_PAGES) {
        await capture(page, `${viewport.name}/${theme}`, shot);
      }
    }

    // First-run enrollment with the un-enrolled persona, in a fresh context.
    const enrollContext = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });
    const enrollPage = await enrollContext.newPage();
    await enrollPage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await enrollPage.fill(
      "#email",
      viewport.name === "desktop" ? "newbie@hq.test" : "newbie2@hq.test",
    );
    await enrollPage.fill("#password", "password-123");
    await enrollPage.click("button[type=submit]");
    await enrollPage.waitForURL("**/login/enroll**", { timeout: 15_000 });
    await enrollPage.click("button[type=submit]"); // begin
    await enrollPage.waitForSelector(".secret-once", { timeout: 15_000 });
    await assertNoOverflow(enrollPage, `${viewport.name}/auth/enroll`);
    await assertAccessible(enrollPage, `${viewport.name}/auth/enroll`);
    await enrollPage.screenshot({
      path: `${OUT}/${viewport.name}/auth/enroll.png`,
      fullPage: true,
    });
    console.log(`  ✓ ${viewport.name}/auth/enroll`);
    await enrollPage.fill("#enroll-code", "000000");
    await enrollPage.click("button[type=submit]");
    await enrollPage.waitForSelector(".recovery-codes", { timeout: 15_000 });
    await enrollPage.screenshot({
      path: `${OUT}/${viewport.name}/auth/recovery-codes.png`,
      fullPage: true,
    });
    console.log(`  ✓ ${viewport.name}/auth/recovery-codes`);
    await enrollContext.close();
    await context.close();
  }
}

await fetch("http://127.0.0.1:7071/api/v1/mock/reset", { method: "POST" }).catch(() => {
  console.error("mock-hq is not running; start it with `npm run mock:hq`.");
  process.exit(1);
});

const browser = await chromium.launch();
try {
  await run(browser);
} finally {
  await browser.close();
}

if (failures > 0) {
  console.error(`\n${failures} problem(s). Screenshots in ${OUT}/.`);
  process.exit(1);
}
console.log(`\nAll screens captured cleanly. Review them in ${OUT}/.`);
