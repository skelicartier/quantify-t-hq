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
  { name: "leads", path: "/leads", ready: ".data-table" },
  {
    name: "lead",
    path: "/leads/1e000000-0000-4000-8000-000000000001",
    ready: ".record-layout",
  },
  { name: "companies", path: "/companies", ready: ".data-table" },
  {
    name: "company",
    path: "/companies/c0000000-0000-4000-8000-000000000002",
    ready: ".record-layout",
  },
  { name: "people", path: "/people", ready: ".data-table" },
  {
    name: "person",
    path: "/people/p0000000-0000-4000-8000-000000000002",
    ready: ".record-layout",
  },
  { name: "deals-board", path: "/deals", ready: ".board" },
  { name: "deals-table", path: "/deals?view=table", ready: ".data-table" },
  {
    name: "deal",
    path: "/deals/d0000000-0000-4000-8000-000000000001",
    ready: ".stage-rail",
  },
  {
    name: "deal-stuck",
    path: "/deals/d0000000-0000-4000-8000-000000000002",
    ready: ".stage-rail",
  },
  { name: "tasks", path: "/tasks?scope=all", ready: "main#main-content" },
  { name: "meetings", path: "/meetings", ready: ".meeting-list" },
  {
    name: "meeting-owed",
    path: "/meetings/ee100000-0000-4000-8000-000000000002",
    ready: ".record-layout",
  },
  {
    name: "meeting-synced",
    path: "/meetings/ee100000-0000-4000-8000-000000000001",
    ready: ".record-layout",
  },
  { name: "revenue-contracts", path: "/revenue/contracts", ready: ".data-table" },
  {
    name: "revenue-contract",
    path: "/revenue/contracts/cc100000-0000-4000-8000-000000000001",
    ready: ".record-layout",
  },
  { name: "revenue-mrr", path: "/revenue/mrr", ready: ".bridge__svg" },
  { name: "reports", path: "/reports", ready: ".report-grid" },
  { name: "team", path: "/team", ready: ".data-table" },
  {
    name: "team-member",
    path: "/team/aa000000-0000-4000-8000-00000000000e",
    ready: ".record-layout",
  },
  {
    name: "team-member-docs-missing",
    path: "/team/aa000000-0000-4000-8000-00000000000d",
    ready: ".record-layout",
  },
  { name: "checkin", path: "/checkin", ready: ".checkin-form" },
  { name: "time-off", path: "/time-off", ready: "main#main-content" },
  { name: "certificates", path: "/certificates", ready: "main#main-content" },
  { name: "access-review", path: "/access-review", ready: "main#main-content" },
  { name: "admin-integrations", path: "/admin/integrations", ready: "main#main-content" },
  { name: "admin-pipeline", path: "/admin/settings/pipeline", ready: ".stage-editor" },
  { name: "admin-settings", path: "/admin/settings", ready: ".sla-rows" },
  { name: "admin-danger", path: "/admin/danger", ready: "main#main-content" },
  { name: "admin-staff", path: "/admin/staff", ready: ".data-table" },
  {
    name: "admin-staff-member",
    path: "/admin/staff/aa000000-0000-4000-8000-00000000000c",
    ready: ".record-layout",
  },
  { name: "admin-audit", path: "/admin/audit", ready: "main#main-content" },
  { name: "me-security", path: "/me/security", ready: "main#main-content" },
];

let failures = 0;

/**
 * Browser console errors since the last page was captured. React reports hydration
 * mismatches and invalid nesting (a list inside a paragraph) only here — the page still
 * renders, so without this the only sign is the dev overlay's badge in a screenshot.
 */
const consoleErrors: string[] = [];

function watchConsole(page: Page) {
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text().slice(0, 240));
  });
  page.on("pageerror", (error) => consoleErrors.push(`uncaught: ${error.message.slice(0, 240)}`));
}

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
  consoleErrors.length = 0;
  const response = await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle" });
  if (!response || response.status() !== 200) {
    report(shot.name, `status ${response?.status() ?? "none"}`);
    return;
  }
  if (shot.ready) await page.waitForSelector(shot.ready, { timeout: 10_000 });
  await assertNoOverflow(page, `${folder}/${shot.name}`);
  await assertAccessible(page, `${folder}/${shot.name}`);
  for (const error of consoleErrors) report(`${folder}/${shot.name}`, `console: ${error}`);
  await page.screenshot({ path: `${OUT}/${folder}/${shot.name}.png`, fullPage: true });
  console.log(`  ✓ ${folder}/${shot.name}`);
}

/**
 * Press the named theme's own button and wait until the shell has switched. (It used
 * to click the first toggle button — the already-pressed Dark one — so every "light"
 * screenshot was dark and nothing failed.)
 */
async function setTheme(page: Page, theme: "dark" | "light") {
  const label = theme === "light" ? "Light theme" : "Dark theme";
  const button = page.locator(`.theme-toggle button[title="${label}"]`);
  if ((await button.getAttribute("aria-pressed")) !== "true") {
    // The switch is optimistic; the cookie lands when the server action returns.
    // Navigating before that aborts it (and `networkidle` resolves at once on a page
    // that was already idle), so wait for the action's own response.
    const saved = page.waitForResponse(
      (response) => response.request().method() === "POST" && response.ok(),
      { timeout: 10_000 },
    );
    await button.click();
    await saved;
  }
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(`.shell[data-theme="${theme}"]`, { timeout: 10_000 });
}

/** States a static walk never reaches: an open popover, and a key minted after sudo. */
async function captureInteractions(page: Page, folder: string) {
  await page.goto(`${BASE}/leads`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Add lead" }).click();
  await page.waitForSelector(".popover[open] .popover__panel");
  await assertAccessible(page, `${folder}/leads-add-open`);
  await page.screenshot({ path: `${OUT}/${folder}/leads-add-open.png` });
  console.log(`  ✓ ${folder}/leads-add-open`);

  // Record a held meeting's outcome; the follow-up tasks appear on its page.
  await page.goto(`${BASE}/meetings/ee100000-0000-4000-8000-000000000002`, {
    waitUntil: "networkidle",
  });
  if ((await page.locator("#meeting-notes").count()) > 0) {
    await page.fill("#meeting-notes", "Second desk signed in twice this week.");
    await page.locator("button", { hasText: "Record outcome" }).click();
    await page.waitForSelector(".follow-up", { timeout: 10_000 });
  }
  await assertAccessible(page, `${folder}/meeting-recorded`);
  await page.screenshot({ path: `${OUT}/${folder}/meeting-recorded.png`, fullPage: true });
  console.log(`  ✓ ${folder}/meeting-recorded`);

  await page.goto(`${BASE}/admin/integrations`, { waitUntil: "networkidle" });
  // The window lasts ten minutes, so a later pass may find it already open.
  if ((await page.locator("#sudo-code").count()) > 0) {
    await page.fill("#sudo-code", "000000");
    await page.locator(".sudo-gate button[type=submit]").click();
  }
  await page.waitForSelector(".sudo-gate--open", { timeout: 10_000 });
  // The calendar round trip: consent is simulated by the mock, which answers with the
  // portal's own callback URL, so this walks connect → callback → connected for real.
  if ((await page.locator("button", { hasText: "Connect calendar" }).count()) > 0) {
    await page.locator("button", { hasText: "Connect calendar" }).click();
    await page.waitForURL("**/admin/integrations?calendar=connected", { timeout: 15_000 });
    await page.waitForSelector(".integration-actions");
  }
  await page.fill("#key-name", "Website contact form");
  await page.fill("#key-reason", "Screenshot run");
  await page.locator("button", { hasText: "Mint key" }).click();
  await page.waitForSelector(".one-time-secret", { timeout: 10_000 });
  await assertNoOverflow(page, `${folder}/admin-key-minted`);
  await assertAccessible(page, `${folder}/admin-key-minted`);
  await page.screenshot({ path: `${OUT}/${folder}/admin-key-minted.png`, fullPage: true });
  console.log(`  ✓ ${folder}/admin-key-minted`);

  // A real CSV download through the route handler (the sudo window is still open).
  await page.goto(`${BASE}/reports`, { waitUntil: "networkidle" });
  await page.fill("#export-reason", "Screenshot run check");
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15_000 }),
    page.locator("button", { hasText: "Download CSV" }).click(),
  ]);
  const name = download.suggestedFilename();
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const csv = Buffer.concat(chunks).toString("utf8");
  if (!name.startsWith("hq-leads-") || !csv.startsWith("id,received_at")) {
    report(`${folder}/export`, `unexpected download ${name}: ${csv.slice(0, 40)}`);
  } else {
    console.log(`  ✓ ${folder}/export (${name})`);
  }

  // Retention, run by hand: type the phrase the page shows, then open a lead it reached.
  // The first pass anonymises; later passes find nothing due and only look.
  await page.goto(`${BASE}/admin/danger`, { waitUntil: "networkidle" });
  if ((await page.locator("#retention-run-confirm").count()) > 0) {
    const phrase = (await page.locator(".typed-phrase").first().textContent()) ?? "";
    await page.fill("#retention-run-reason", "Screenshot run of the retention rules");
    await page.fill("#retention-run-confirm", phrase);
    await page.locator("button", { hasText: "Anonymise now" }).click();
    await page.waitForSelector(".form-sent", { timeout: 10_000 });
    // The form is gone, so focus must land on its result rather than fall to the page.
    const focused = await page.evaluate(
      () => document.activeElement?.classList.contains("danger-result") ?? false,
    );
    if (!focused) report(`${folder}/admin-retention-ran`, "focus did not move to the result");
  }
  // Focusing the result scrolled the page; a full-page capture taken scrolled draws the
  // sticky header, and the skip link hidden above it, halfway down the image.
  await page.evaluate(() => window.scrollTo(0, 0));
  await assertNoOverflow(page, `${folder}/admin-retention-ran`);
  await assertAccessible(page, `${folder}/admin-retention-ran`);
  await page.screenshot({ path: `${OUT}/${folder}/admin-retention-ran.png`, fullPage: true });
  console.log(`  ✓ ${folder}/admin-retention-ran`);
  await page.goto(`${BASE}/leads/1e000000-0000-4000-8000-0000000000d1`, {
    waitUntil: "networkidle",
  });
  if ((await page.locator("h1", { hasText: "Anonymised lead" }).count()) === 0) {
    report(`${folder}/lead-anonymised`, "the lead the run reached does not read as anonymised");
  }
  await assertAccessible(page, `${folder}/lead-anonymised`);
  await page.screenshot({ path: `${OUT}/${folder}/lead-anonymised.png`, fullPage: true });
  console.log(`  ✓ ${folder}/lead-anonymised`);
}

async function run(browser: Browser) {
  for (const viewport of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });
    const page = await context.newPage();
    watchConsole(page);

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
    // The public certificate check, valid and not found.
    await capture(page, `${viewport.name}/auth`, {
      name: "verify-valid",
      path: "/verify/QT-2026-0001-7KD2QX",
      ready: ".verify__card",
    });
    await capture(page, `${viewport.name}/auth`, {
      name: "verify-missing",
      path: "/verify/QT-2026-0001",
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
      await setTheme(page, theme);
      for (const shot of SIGNED_IN_PAGES) {
        await capture(page, `${viewport.name}/${theme}`, shot);
      }
      await captureInteractions(page, `${viewport.name}/${theme}`);
    }
    // Leave the persona's theme where it started, for the next viewport's walk.
    await setTheme(page, "dark");

    // The intern reads the pipeline with every money figure blanked: the four pages
    // that carry deal money must render the dash, not a crash or a zero.
    const internContext = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });
    const intern = await internContext.newPage();
    watchConsole(intern);
    await intern.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await intern.fill("#email", "intern@hq.test");
    await intern.fill("#password", "password-123");
    await intern.click("button[type=submit]");
    await intern.waitForURL("**/login/verify**", { timeout: 15_000 });
    await intern.fill("#totp-code", "000000");
    await intern.click("button[type=submit]");
    await intern.waitForURL("**/home", { timeout: 15_000 });
    mkdirSync(`${OUT}/${viewport.name}/intern`, { recursive: true });
    for (const shot of [
      { name: "home", path: "/home", ready: "main#main-content" },
      { name: "deals", path: "/deals", ready: ".board" },
      { name: "deal", path: "/deals/d0000000-0000-4000-8000-000000000001", ready: ".stage-rail" },
      { name: "companies", path: "/companies", ready: ".data-table" },
      {
        name: "company",
        path: "/companies/c0000000-0000-4000-8000-000000000002",
        ready: ".record-layout",
      },
    ]) {
      await capture(intern, `${viewport.name}/intern`, shot);
      const text = await intern.locator("main").innerText();
      if (/\$\d|\/mo/.test(text)) {
        report(`${viewport.name}/intern/${shot.name}`, "a money figure is visible to the intern");
      }
    }
    await internContext.close();

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
