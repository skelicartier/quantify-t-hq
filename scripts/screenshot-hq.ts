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
/** The quarter after today's, for the forecast screens (the current one may end today). */
const NEXT_QUARTER = (() => {
  const now = new Date();
  const index = now.getUTCFullYear() * 4 + Math.floor(now.getUTCMonth() / 3) + 1;
  return `${Math.floor(index / 4)}-Q${(index % 4) + 1}`;
})();
const WIDTHS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 412, height: 915 },
] as const;

type Shot = { name: string; path: string; ready?: string };

/** Records the mock seeds for mail (`MAIL_IDS` in scripts/mock-hq-api.ts). */
const MAIL = {
  september: "ea400000-0000-4000-8000-000000000001",
  october: "ea400000-0000-4000-8000-000000000002",
  webinar: "ea400000-0000-4000-8000-000000000003",
  roadmap: "ea400000-0000-4000-8000-000000000004",
  newsletter: "ea400000-0000-4000-8000-000000000005",
  releaseTemplate: "ea200000-0000-4000-8000-000000000001",
  webinarList: "ea800000-0000-4000-8000-000000000001",
  berlinList: "ea800000-0000-4000-8000-000000000002",
  followUp: "ea400000-0000-4000-8000-000000000006",
  fundIntro: "ea500000-0000-4000-8000-000000000001",
  // Three September messages whose footer links the public page is walked with: one only
  // looked at, one unsubscribed by its button, one by the mailbox's one-click POST.
  stopLooked: "ea600000-0000-4000-8000-000000000001",
  stopPressed: "ea600000-0000-4000-8000-000000000002",
  stopOneClick: "ea600000-0000-4000-8000-000000000003",
};

const SIGNED_IN_PAGES: Shot[] = [
  { name: "home", path: "/home", ready: "main#main-content" },
  { name: "support-queue", path: "/support", ready: ".desk" },
  { name: "support-following", path: "/support?view=all&following=1", ready: ".desk" },
  { name: "companies-import", path: "/companies/import", ready: ".csv-import" },
  { name: "companies-grouped", path: "/companies?group=lifecycle", ready: ".data-table" },
  {
    name: "companies-peek",
    path: "/companies?peek=c0000000-0000-4000-8000-0000000000fe",
    ready: ".peek",
  },
  { name: "companies-duplicates", path: "/companies/duplicates", ready: "main#main-content" },
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
  { name: "revenue-renewals", path: "/revenue/renewals", ready: ".data-table" },
  {
    name: "company-history",
    path: "/companies/c0000000-0000-4000-8000-000000000002?tab=history",
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
  { name: "admin-approvals", path: "/admin/approvals", ready: "main#main-content" },
  { name: "admin-security", path: "/admin/security", ready: "main#main-content" },
  { name: "inbox", path: "/inbox", ready: ".inbox-list, .empty-state" },
  { name: "inbox-done", path: "/inbox?view=done", ready: "main#main-content" },
  { name: "me-notifications", path: "/me/notifications", ready: ".prefs-modes" },
  { name: "revenue-receivables", path: "/revenue/receivables", ready: "main#main-content" },
  {
    name: "company-billing",
    path: "/companies/c0000000-0000-4000-8000-000000000002?tab=billing",
    ready: "main#main-content",
  },
  { name: "deals-changes", path: "/deals/changes", ready: "main#main-content" },
  { name: "deals-changes-30", path: "/deals/changes?days=30", ready: "main#main-content" },
  { name: "deals-forecast", path: "/deals/forecast", ready: "main#main-content" },
  {
    name: "deals-forecast-next",
    path: `/deals/forecast?period=${NEXT_QUARTER}`,
    ready: "main#main-content",
  },
  { name: "deals-competitors", path: "/deals/competitors", ready: "main#main-content" },
  {
    name: "deals-competitor",
    path: "/deals/competitors/cf000001-0000-4000-8000-000000000000",
    ready: "main#main-content",
  },
  { name: "deals-win-loss", path: "/deals/win-loss", ready: "main#main-content" },
  {
    name: "deal-competition",
    path: "/deals/d0000000-0000-4000-8000-000000000001?tab=competition",
    ready: ".competitor-list, main#main-content",
  },
  { name: "success", path: "/success", ready: "main#main-content" },
  { name: "success-requests", path: "/success/requests", ready: "main#main-content" },
  {
    name: "success-request",
    path: "/success/requests/ce000001-0000-4000-8000-000000000000",
    ready: ".ask-list, main#main-content",
  },
  { name: "success-onboarding", path: "/success/onboarding", ready: "main#main-content" },
  { name: "privacy", path: "/privacy", ready: "main#main-content" },
  { name: "privacy-closed", path: "/privacy?scope=closed", ready: "main#main-content" },
  {
    name: "privacy-request",
    path: "/privacy/requests/ad000001-0000-4000-8000-000000000000",
    ready: ".search-list",
  },
  {
    name: "privacy-request-erasure",
    path: "/privacy/requests/ad000005-0000-4000-8000-000000000000",
    ready: ".search-list",
  },
  {
    name: "privacy-complaint",
    path: "/privacy/requests/ad000007-0000-4000-8000-000000000000",
    ready: "main#main-content",
  },
  {
    name: "privacy-incident-resolved",
    path: "/privacy/incidents/ae000002-0000-4000-8000-000000000000",
    ready: "main#main-content",
  },
  {
    name: "privacy-subprocessor-change",
    path: "/privacy/subprocessors/af000009-0000-4000-8000-000000000000",
    ready: "main#main-content",
  },
  { name: "privacy-incidents", path: "/privacy/incidents", ready: "main#main-content" },
  { name: "privacy-subprocessors", path: "/privacy/subprocessors", ready: "main#main-content" },
  { name: "privacy-commitments", path: "/privacy/commitments", ready: "main#main-content" },
  {
    name: "company-privacy",
    path: "/companies/c0000000-0000-4000-8000-000000000002?tab=privacy",
    ready: "main#main-content",
  },
  { name: "confirm-reads", path: "/confirm-reads?next=%2Fcompanies", ready: "main#main-content" },
  { name: "confirm-reads-held", path: "/confirm-reads?held=1", ready: "main#main-content" },
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
  // Outbound mail: every tab, and a campaign in each state the seed holds.
  { name: "mail", path: "/mail", ready: ".stat-grid" },
  { name: "mail-campaigns", path: "/mail/campaigns", ready: ".data-table" },
  { name: "mail-campaign-new", path: "/mail/campaigns/new", ready: ".campaign-form" },
  { name: "mail-campaign-sending", path: `/mail/campaigns/${MAIL.october}`, ready: ".rhead" },
  {
    name: "mail-campaign-recipients",
    path: `/mail/campaigns/${MAIL.october}?tab=recipients`,
    ready: ".data-table",
  },
  { name: "mail-campaign-sent", path: `/mail/campaigns/${MAIL.september}`, ready: ".rhead" },
  { name: "mail-campaign-paused", path: `/mail/campaigns/${MAIL.newsletter}`, ready: ".rhead" },
  {
    name: "mail-campaign-draft-preview",
    path: `/mail/campaigns/${MAIL.roadmap}?tab=preview`,
    ready: ".mail-preview",
  },
  { name: "mail-templates", path: "/mail/templates", ready: ".data-table" },
  {
    name: "mail-template",
    path: `/mail/templates/${MAIL.releaseTemplate}`,
    ready: ".mail-preview",
  },
  { name: "mail-template-new", path: "/mail/templates/new", ready: ".template-form" },
  { name: "mail-segments", path: "/mail/segments", ready: ".data-table" },
  { name: "mail-lists", path: "/mail/lists", ready: ".data-table" },
  { name: "mail-list", path: `/mail/lists/${MAIL.webinarList}`, ready: ".data-table" },
  { name: "mail-list-berlin", path: `/mail/lists/${MAIL.berlinList}`, ready: ".data-table" },
  {
    name: "mail-list-import",
    path: `/mail/lists/${MAIL.webinarList}?tab=import`,
    ready: ".list-import",
  },
  { name: "mail-list-add", path: `/mail/lists/${MAIL.webinarList}?tab=add`, ready: ".enrol-panel" },
  {
    name: "mail-list-settings",
    path: `/mail/lists/${MAIL.webinarList}?tab=settings`,
    ready: "main#main-content",
  },
  {
    name: "mail-list-campaign-preview",
    path: `/mail/campaigns/${MAIL.followUp}?tab=preview`,
    ready: ".mail-preview",
  },
  { name: "mail-sequences", path: "/mail/sequences", ready: ".data-table" },
  { name: "mail-sequence", path: `/mail/sequences/${MAIL.fundIntro}`, ready: ".data-table" },
  {
    name: "mail-sequence-steps",
    path: `/mail/sequences/${MAIL.fundIntro}?tab=steps`,
    ready: "main#main-content",
  },
  {
    name: "mail-sequence-results",
    path: `/mail/sequences/${MAIL.fundIntro}?tab=results`,
    ready: "main#main-content",
  },
  { name: "mail-sequence-new", path: "/mail/sequences/new", ready: ".sequence-editor" },
  { name: "mail-replies", path: "/mail/replies", ready: "main#main-content" },
  { name: "mail-suppressions", path: "/mail/suppressions", ready: ".data-table" },
  { name: "mail-reports", path: "/mail/reports", ready: ".data-table" },
  { name: "mail-settings", path: "/mail/settings", ready: ".record-layout" },
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
  // The mail preview is a sandboxed frame with no scripts allowed — by design, it holds
  // an email's HTML. axe injects itself into every frame, the sandbox refuses it, and
  // each refusal is a console error the page never caused; the frame's own title is
  // checked by the unit tests, its contents are the email and not the portal.
  const results = await new AxeBuilder({ page }).exclude(".mail-preview__frame").analyze();
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
  // With the admin persona active, the owner's key waits for them (dual control): the
  // capture is the sent-for-approval message; a lone owner would see the secret.
  await page.waitForSelector(".one-time-secret, .form-sent", { timeout: 10_000 });
  await assertNoOverflow(page, `${folder}/admin-key-minted`);
  await assertAccessible(page, `${folder}/admin-key-minted`);
  await page.screenshot({ path: `${OUT}/${folder}/admin-key-minted.png`, fullPage: true });
  console.log(`  ✓ ${folder}/admin-key-minted`);

  await captureMailFlows(page, folder);
  await captureSecurityFlows(page, folder);
  await captureInboxFlows(page, folder);
  await captureReceivableFlows(page, folder);
  await capturePrivacyFlows(page, folder);
  await captureInspectionFlows(page, folder);
  await captureSuccessFlows(page, folder);

  // A real CSV download through the route handler (the sudo window is still open).
  await page.goto(`${BASE}/reports`, { waitUntil: "networkidle" });
  await page.fill("#export-reason", "Screenshot run check");
  // A fresh dev server compiles the export route on this first request (14 s seen after a
  // cache reset); the product's answer is fast once warm, the wait covers the tool.
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
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

/**
 * Receivables, end to end: an invoice recorded from the Receivables page (it lands on its
 * own record), a dispute recorded on it, then money received against an open invoice
 * from the customer's Billing tab, allocated with "All of it".
 */
async function captureReceivableFlows(page: Page, folder: string) {
  await page.goto(`${BASE}/revenue/receivables`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Record an invoice" }).click();
  await page.selectOption("#invoice-company", { index: 1 });
  await page.fill("#invoice-number", `QT-HARNESS-${Date.now().toString(36).toUpperCase()}`);
  await page.fill("#invoice-net", "1250.00");
  await page.locator("button", { hasText: "Record the invoice" }).click();
  await page.waitForURL("**/revenue/invoices/**", { timeout: 15_000 });
  await page.fill("#dispute-reason", "Seat count differs from their PO");
  await page.locator("button", { hasText: "Record the dispute" }).click();
  await page.waitForSelector(".invoice-timeline__row:has-text('Disputed')", { timeout: 10_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await assertNoOverflow(page, `${folder}/invoice-recorded`);
  await assertAccessible(page, `${folder}/invoice-recorded`);
  await page.screenshot({ path: `${OUT}/${folder}/invoice-recorded.png`, fullPage: true });
  console.log(`  ✓ ${folder}/invoice-recorded`);

  // Money received from the customer just invoiced: the receipt settles that invoice in full.
  const customer = await page.locator('main a[href^="/companies/"]').first().getAttribute("href");
  if (!customer) throw new Error(`${folder}: the invoice page links to no customer`);
  await page.goto(`${BASE}${customer.split("?")[0]}?tab=billing`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Record money received from them" }).click();
  const all = page.locator(".receipt-allocation button", { hasText: "All of it" }).first();
  if ((await all.count()) === 0) throw new Error(`${folder}: no open invoice to settle`);
  await all.click();
  const owed = await page.locator(".receipt-allocation__input input").first().inputValue();
  await page.fill("#receipt-amount", owed);
  await page.fill("#receipt-reference", "WIRE-HARNESS");
  await page.locator("button", { hasText: "Record the receipt" }).click();
  await page.waitForSelector(".disclosure .form-sent", { timeout: 10_000 });
  await assertNoOverflow(page, `${folder}/company-billing-received`);
  await assertAccessible(page, `${folder}/company-billing-received`);
  await page.screenshot({ path: `${OUT}/${folder}/company-billing-received.png`, fullPage: true });
  console.log(`  ✓ ${folder}/company-billing-received`);
}

async function shoot(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await assertNoOverflow(page, name);
  await assertAccessible(page, name);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`  ✓ ${name}`);
}

/**
 * The privacy desk, end to end: a request logged and landed on, one system marked searched,
 * its clock stopped with the question asked; the seeded breach assessed and reported; an
 * objection to the sub-processor change settled; a customer's commitments saved.
 */
async function capturePrivacyFlows(page: Page, folder: string) {
  await page.goto(`${BASE}/privacy`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Log a request" }).click();
  await page.fill("#request-name", "Harness Person");
  await page.fill("#request-email", `harness-${Date.now().toString(36)}@example.org`);
  await page.fill("#request-description", "Please send me a copy of my data.");
  await page.locator("button", { hasText: "Log the request" }).click();
  await page.waitForURL("**/privacy/requests/**", { timeout: 15_000 });
  const firstSearch = page.locator(".search-row").first();
  await firstSearch.locator("select").selectOption("none");
  await firstSearch.locator("button", { hasText: "Save" }).click();
  await page.waitForSelector(".search-row__done", { timeout: 10_000 });
  await page.fill("#stop-question", "Which years do you mean?");
  await page.locator("button", { hasText: "Stop the clock" }).click();
  await page.waitForSelector(".event-timeline__row:has-text('Clock stopped')", { timeout: 10_000 });
  await shoot(page, `${folder}/privacy-request-worked`);

  await page.goto(`${BASE}/privacy/incidents`, { waitUntil: "networkidle" });
  const unassessed = page.locator("tr:has-text('Not assessed') a").first();
  if ((await unassessed.count()) > 0) {
    await unassessed.click();
    await page.waitForURL("**/privacy/incidents/**", { timeout: 15_000 });
    await page.selectOption("#assess-risk", "risk");
    await page.fill("#assess-reason", "Names and work emails of 38 people went to one other firm.");
    await page.locator("button", { hasText: "Record the assessment" }).click();
    await page.waitForSelector("#regulator-reference", { timeout: 10_000 });
    await page.fill("#regulator-reference", "ICO-HARNESS");
    await page.locator("button", { hasText: "Record the report" }).click();
    await page.waitForSelector(".event-timeline__row:has-text('Regulator told')", {
      timeout: 10_000,
    });
  } else {
    await page.locator("tbody tr a").first().click();
    await page.waitForURL("**/privacy/incidents/**", { timeout: 15_000 });
  }
  await shoot(page, `${folder}/privacy-incident`);

  await page.goto(`${BASE}/privacy/subprocessors`, { waitUntil: "networkidle" });
  await page.locator("tbody tr a", { hasText: "Ledgerline" }).first().click();
  await page.waitForURL("**/privacy/subprocessors/**", { timeout: 15_000 });
  if ((await page.locator("#resolve-company").count()) > 0) {
    await page.selectOption("#resolve-company", { index: 1 });
    await page.locator("button", { hasText: "Settle it" }).click();
    await page.waitForSelector(".event-timeline__row:has-text('Objection settled')", {
      timeout: 10_000,
    });
  }
  await shoot(page, `${folder}/privacy-subprocessor`);

  await page.goto(`${BASE}/companies/c0000000-0000-4000-8000-000000000002?tab=privacy`, {
    waitUntil: "networkidle",
  });
  await page.fill("#commit-contact", "dpo@northwall.ch");
  await page.fill("#commit-incident", "24");
  await page.locator("button", { hasText: "Save the commitments" }).click();
  await page.waitForSelector("form:has(#commit-contact) .form-sent", { timeout: 10_000 });
  await shoot(page, `${folder}/company-privacy-saved`);
}

/**
 * Pipeline inspection, end to end: a competitor added and its card marked reviewed; that
 * competitor put on a deal and dropped out; a call submitted for next quarter with its
 * target; a buyer interviewed after a closed deal.
 */
async function captureInspectionFlows(page: Page, folder: string) {
  await page.goto(`${BASE}/deals/competitors`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Add a competitor" }).click();
  const name = `Harness Rival ${Date.now().toString(36)}`;
  await page.fill("#card-name", name);
  await page.fill("#card-dismiss", "A day late on filings.");
  await page.locator(".objection-row input").first().fill("They are cheaper");
  await page.locator(".objection-row input").nth(1).fill("Per seat, not per desk.");
  await page.locator("button", { hasText: "Add the card" }).click();
  await page.waitForURL("**/deals/competitors/**", { timeout: 15_000 });
  await page.locator("button", { hasText: "Still true: mark reviewed" }).click();
  await page.waitForSelector("form:has(input[value=review]) .form-sent", { timeout: 10_000 });
  await shoot(page, `${folder}/deals-competitor-new`);

  await page.goto(`${BASE}/deals/d0000000-0000-4000-8000-000000000001?tab=competition`, {
    waitUntil: "networkidle",
  });
  const pick = page.locator("#deal-competitor option", { hasText: name });
  if ((await pick.count()) > 0) {
    await page.selectOption("#deal-competitor", { label: name });
    await page.fill("#deal-competitor-strengths", "Cheaper per seat");
    await page.locator("button", { hasText: "Add to the deal" }).click();
    await page.waitForSelector(`.competitor-row:has-text("${name}")`, { timeout: 10_000 });
    await page
      .locator(`.competitor-row:has-text("${name}") button`, { hasText: "They dropped out" })
      .click();
    await page.waitForSelector(`.competitor-row:has-text("${name}") :text("Dropped out")`, {
      timeout: 10_000,
    });
  }
  await shoot(page, `${folder}/deal-competition-worked`);

  await page.goto(`${BASE}/deals/forecast?period=${NEXT_QUARTER}`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Set the target" }).click();
  await page.fill("#target-amount", "8000");
  await page.locator("button", { hasText: "Set the target" }).last().click();
  await page.waitForSelector("form:has(#target-amount) .form-sent", { timeout: 10_000 });
  await page.goto(`${BASE}/deals/forecast?period=${NEXT_QUARTER}`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Submit a call" }).click();
  await page.fill("#forecast-note", "Harness call: the negotiations close in October.");
  await page.locator("button", { hasText: "Submit the call" }).click();
  await page.waitForSelector("form:has(#forecast-commit) .form-sent", { timeout: 10_000 });
  await page.goto(`${BASE}/deals/forecast?period=${NEXT_QUARTER}`, { waitUntil: "networkidle" });
  await shoot(page, `${folder}/deals-forecast-called`);

  await page.goto(`${BASE}/deals/win-loss`, { waitUntil: "networkidle" });
  const unasked = page
    .locator('table:has(caption:has-text("Closed deals without an interview")) tbody tr a')
    .first();
  if ((await unasked.count()) > 0) {
    const href = await unasked.getAttribute("href");
    await page.goto(`${BASE}${(href ?? "").split("#")[0]}?tab=competition`, {
      waitUntil: "networkidle",
    });
    await page.fill("#interview-name", "Head of research");
    await page.fill("#interview-reason", "Filings the same day decided it.");
    await page.selectOption("select[name='driver:speed']", "positive");
    await page.locator("button", { hasText: "Record the interview" }).click();
    await page.waitForSelector("form:has(#interview-reason) .form-sent", { timeout: 10_000 });
  }
  await shoot(page, `${folder}/deal-interviewed`);
}

/**
 * Customer success, end to end: a customer's Success tab opened from the signals; a feature
 * request added, asked for by a firm, and shipped with a note to the asker; an onboarding
 * step ticked; a renewal playbook put on the calendar from a contract.
 */
async function captureSuccessFlows(page: Page, folder: string) {
  await page.goto(`${BASE}/success`, { waitUntil: "networkidle" });
  const firm = page.locator("tbody tr a").nth(4);
  if ((await firm.count()) > 0) {
    await firm.click();
    await page.waitForURL("**/companies/**", { timeout: 15_000 });
    await page.waitForSelector(".signal-list, main#main-content", { timeout: 10_000 });
  }
  await shoot(page, `${folder}/company-success`);

  await page.goto(`${BASE}/success/requests`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "New request" }).click();
  await page.fill("#request-title", `Harness request ${Date.now().toString(36)}`);
  await page.fill("#request-description", "A harness walk through the request flow.");
  await page.locator("button", { hasText: "Add the request" }).click();
  await page.waitForURL("**/success/requests/**", { timeout: 15_000 });
  await page.selectOption("#ask-company", { index: 1 });
  await page.fill("#ask-quote", "We would use this every day.");
  await page.selectOption("#ask-importance", "blocker");
  await page.locator("button", { hasText: "Add the ask" }).click();
  await page.waitForSelector(".ask-list__item", { timeout: 10_000 });
  await page.selectOption("#ship-tell", "recorded");
  await page.locator("button", { hasText: "Mark shipped" }).click();
  await page.waitForSelector("form:has(#ship-on) .form-sent, .ask-list__item :text('told')", {
    timeout: 10_000,
  });
  await page.reload({ waitUntil: "networkidle" });
  await shoot(page, `${folder}/success-request-shipped`);

  await page.goto(`${BASE}/success/onboarding`, { waitUntil: "networkidle" });
  const done = page.locator(".step-list__item button", { hasText: "Done" }).first();
  if ((await done.count()) > 0) {
    const before = await page.locator(".step-list__title--done").count();
    await done.click();
    await page.waitForFunction(
      (count) => document.querySelectorAll(".step-list__title--done").length > count,
      before,
      { timeout: 10_000 },
    );
  }
  await shoot(page, `${folder}/success-onboarding-ticked`);

  await page.goto(`${BASE}/revenue/renewals`, { waitUntil: "networkidle" });
  const contract = page.locator('tbody tr a[href^="/revenue/contracts/"]').first();
  if ((await contract.count()) > 0) {
    await page.goto(`${BASE}${await contract.getAttribute("href")}`, { waitUntil: "networkidle" });
    const start = page.locator("button", { hasText: "Start the playbook" });
    if ((await start.count()) > 0) {
      await start.click();
      await page.waitForSelector(
        "form:has(input[value=start]) .form-sent, :text('Running since')",
        {
          timeout: 10_000,
        },
      );
    }
  }
  await shoot(page, `${folder}/contract-playbook`);
}

/**
 * The inbox, end to end: a line snoozed to tomorrow, a line opened (read, and the record
 * it points at opens), a company followed and a reminder set on it, mail settings saved.
 * Later passes find the work done and only look.
 */
async function captureInboxFlows(page: Page, folder: string) {
  await page.goto(`${BASE}/inbox`, { waitUntil: "networkidle" });
  const snooze = page.locator(".inbox-item .inbox-item__snooze").first();
  if ((await snooze.count()) > 0) {
    const before = await page.locator(".inbox-item").count();
    await snooze.locator("summary").click();
    await snooze.locator("button", { hasText: "Tomorrow, 09:00" }).click();
    await page.waitForFunction(
      (count) => document.querySelectorAll(".inbox-item").length < count,
      before,
      { timeout: 10_000 },
    );
  }
  await assertNoOverflow(page, `${folder}/inbox-snoozed`);
  await assertAccessible(page, `${folder}/inbox-snoozed`);
  await page.screenshot({ path: `${OUT}/${folder}/inbox-snoozed.png`, fullPage: true });
  console.log(`  ✓ ${folder}/inbox-snoozed`);

  const unread = page.locator(".inbox-item--unread .inbox-item__title").first();
  if ((await unread.count()) > 0) {
    await unread.click();
    await page.waitForURL((url) => !url.pathname.startsWith("/inbox"), { timeout: 15_000 });
    console.log(`  ✓ ${folder}/inbox-opened (${new URL(page.url()).pathname})`);
  }

  await page.goto(`${BASE}/companies/c0000000-0000-4000-8000-000000000002`, {
    waitUntil: "networkidle",
  });
  const follow = page.locator(".follow-form button");
  if ((await follow.getAttribute("aria-pressed")) !== "true") {
    await follow.click();
    await page.waitForSelector(".follow-form button[aria-pressed=true]", { timeout: 10_000 });
  }
  await page.locator("summary", { hasText: "Remind me" }).click();
  await page.locator(".popover[open] input[name=note]").fill("Ask about the second desk");
  await page.locator(".popover[open] button", { hasText: "Set reminder" }).click();
  await page.waitForSelector(".popover[open] .form-sent", { timeout: 10_000 });
  await assertAccessible(page, `${folder}/company-follow-remind`);
  await page.screenshot({ path: `${OUT}/${folder}/company-follow-remind.png` });
  console.log(`  ✓ ${folder}/company-follow-remind`);

  await page.goto(`${BASE}/me/notifications`, { waitUntil: "networkidle" });
  await page.locator("label.prefs-mode", { hasText: "One digest a day" }).click();
  await page.selectOption("#prefs-quiet-from", "22");
  await page.selectOption("#prefs-quiet-to", "7");
  await page.locator("button", { hasText: "Save" }).click();
  await page.waitForSelector(".form-sent", { timeout: 10_000 });
  // Back to the default so the next pass starts where this one did.
  await page.locator("label.prefs-mode", { hasText: "Mail me what stays unread" }).click();
  await page.selectOption("#prefs-quiet-from", "");
  await page.selectOption("#prefs-quiet-to", "");
  await page.locator("button", { hasText: "Save" }).click();
  await page.waitForSelector(".form-sent", { timeout: 10_000 });
  console.log(`  ✓ ${folder}/me-notifications-saved`);
}

/**
 * Security 2, end to end: an owner acknowledges an event in the feed; resets the desk
 * persona's authenticator and is shown the one-time link; then, in a separate browser,
 * that person's password alone is refused and the link carries them to enrolment.
 */
async function captureSecurityFlows(page: Page, folder: string) {
  await page.goto(`${BASE}/admin/security`, { waitUntil: "networkidle" });
  const acknowledge = page.locator(".security-event button", { hasText: "Acknowledge" }).first();
  if ((await acknowledge.count()) > 0) {
    const acknowledged = () =>
      page.evaluate(
        () =>
          Array.from(document.querySelectorAll(".security-event .pill")).filter(
            (pill) => pill.textContent?.trim() === "Acknowledged",
          ).length,
      );
    const before = await acknowledged();
    await acknowledge.click();
    await page.waitForFunction(
      (count) =>
        Array.from(document.querySelectorAll(".security-event .pill")).filter(
          (pill) => pill.textContent?.trim() === "Acknowledged",
        ).length > count,
      before,
      { timeout: 10_000 },
    );
  }
  await assertNoOverflow(page, `${folder}/admin-security-acknowledged`);
  await assertAccessible(page, `${folder}/admin-security-acknowledged`);
  await page.screenshot({
    path: `${OUT}/${folder}/admin-security-acknowledged.png`,
    fullPage: true,
  });
  console.log(`  ✓ ${folder}/admin-security-acknowledged`);

  // The seeded sales persona passed six hundred records this hour and is held: clear it
  // (the first pass does; later passes find nobody held and only look).
  await page.goto(`${BASE}/admin/security`, { waitUntil: "networkidle" });
  const held = page.locator(".read-watch", { hasText: "Sales Person" }).locator("form");
  if ((await held.count()) > 0) {
    await held.locator("input[name=reason]").fill("Building the renewal list for Q4");
    await held.locator("button[type=submit]").click();
    // Cleared, the row re-renders without its form: wait for the hold to be gone.
    await page.waitForFunction(
      () =>
        !Array.from(document.querySelectorAll(".read-watch")).some(
          (row) =>
            row.textContent?.includes("Sales Person") &&
            Array.from(row.querySelectorAll(".pill")).some(
              (pill) => pill.textContent?.trim() === "Held",
            ),
        ),
      undefined,
      { timeout: 10_000 },
    );
  }
  await assertNoOverflow(page, `${folder}/admin-security-cleared`);
  await assertAccessible(page, `${folder}/admin-security-cleared`);
  await page.screenshot({ path: `${OUT}/${folder}/admin-security-cleared.png`, fullPage: true });
  console.log(`  ✓ ${folder}/admin-security-cleared`);

  // A decoy key, planted: its secret is shown once.
  await page.selectOption("#decoy-kind", "api_key");
  await page.locator("button", { hasText: "Plant the decoy" }).click();
  await page.waitForSelector(".one-time-secret, form:has(#decoy-kind) [role=alert]", {
    timeout: 10_000,
  });
  const decoyKey = (await page.locator(".one-time-secret__value").first().textContent()) ?? "";
  if (!decoyKey.startsWith("qthq_")) report(`${folder}/admin-security-decoy`, "no decoy key shown");
  // A full-page capture taken scrolled draws the sticky bar halfway down the image.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  await assertAccessible(page, `${folder}/admin-security-decoy`);
  await page.screenshot({ path: `${OUT}/${folder}/admin-security-decoy.png`, fullPage: true });
  console.log(`  ✓ ${folder}/admin-security-decoy`);

  await page.goto(`${BASE}/admin/staff/aa000000-0000-4000-8000-00000000000d`, {
    waitUntil: "networkidle",
  });
  await page.fill("#reset-reason", "Phone replaced — screenshot run");
  await page.locator("form:has(#reset-reason) button[type=submit]").click();
  await page.waitForSelector(".one-time-secret, form:has(#reset-reason) [role=alert]", {
    timeout: 10_000,
  });
  const link = ((await page.locator(".one-time-secret__value").first().textContent()) ?? "").trim();
  await assertNoOverflow(page, `${folder}/staff-reset-link`);
  await assertAccessible(page, `${folder}/staff-reset-link`);
  await page.screenshot({ path: `${OUT}/${folder}/staff-reset-link.png`, fullPage: true });
  console.log(`  ✓ ${folder}/staff-reset-link`);
  if (!/\/login\?ticket=hqe_/.test(link)) {
    report(`${folder}/staff-reset-link`, `no one-time link shown (got "${link.slice(0, 60)}")`);
    return;
  }

  const browser = page.context().browser();
  if (!browser) return;
  const other = await browser.newContext({ viewport: page.viewportSize() ?? null });
  try {
    const person = await other.newPage();
    watchConsole(person);
    await person.goto(`${BASE}/login?form=1`, { waitUntil: "networkidle" });
    await person.fill("#email", "support@hq.test");
    await person.fill("#password", "password-123");
    await person.click("button[type=submit]");
    await person.waitForSelector(".auth__note", { timeout: 15_000 });
    const refusal = (await person.locator(".auth__note").textContent()) ?? "";
    if (!refusal.includes("Your authenticator was reset")) {
      report(`${folder}/login-reset-refused`, `the password alone was not refused: "${refusal}"`);
    }
    await assertAccessible(person, `${folder}/login-reset-refused`);
    await person.screenshot({ path: `${OUT}/${folder}/login-reset-refused.png`, fullPage: true });
    console.log(`  ✓ ${folder}/login-reset-refused`);

    await person.goto(link.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: "networkidle" });
    await assertAccessible(person, `${folder}/login-reset-ticket`);
    await person.screenshot({ path: `${OUT}/${folder}/login-reset-ticket.png`, fullPage: true });
    console.log(`  ✓ ${folder}/login-reset-ticket`);
    await person.fill("#email", "support@hq.test");
    await person.fill("#password", "password-123");
    await person.click("button[type=submit]");
    await person.waitForURL("**/login/enroll**", { timeout: 15_000 }).catch(() => undefined);
    if (!person.url().includes("/login/enroll")) {
      report(
        `${folder}/login-reset-enrol`,
        `the one-time link did not reach enrolment (${person.url()})`,
      );
    } else {
      console.log(`  ✓ ${folder}/login-reset-enrol`);
    }
  } finally {
    await other.close();
  }
}

/**
 * Mail, end to end through the server actions and the mock's rules: a colleague's
 * campaign approved (the sudo window is open) and started, the owner's own draft tested
 * and submitted (it then waits for someone else), a segment checked, a sequence's
 * enrolment checked. Later passes find the work done and only look.
 */
async function captureMailFlows(page: Page, folder: string) {
  await page.goto(`${BASE}/mail/campaigns/${MAIL.webinar}`, { waitUntil: "networkidle" });
  if ((await page.locator("button", { hasText: "Approve" }).count()) > 0) {
    await page.locator("button", { hasText: "Approve" }).click();
    await page.waitForSelector("button:has-text('Start sending')", { timeout: 15_000 });
  }
  if ((await page.locator("button", { hasText: "Start sending" }).count()) > 0) {
    await page.locator("button", { hasText: "Start sending" }).click();
    await page.waitForSelector("button:has-text('Pause')", { timeout: 15_000 });
  }
  const webinarState = (await page.locator(".rhead__status").innerText()).trim();
  if (!/Sending|Sent/.test(webinarState)) {
    report(`${folder}/mail-campaign-started`, `the approved campaign reads "${webinarState}"`);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await assertNoOverflow(page, `${folder}/mail-campaign-started`);
  await assertAccessible(page, `${folder}/mail-campaign-started`);
  await page.screenshot({ path: `${OUT}/${folder}/mail-campaign-started.png`, fullPage: true });
  console.log(`  ✓ ${folder}/mail-campaign-started`);

  await page.goto(`${BASE}/mail/campaigns/${MAIL.roadmap}`, { waitUntil: "networkidle" });
  if ((await page.locator("button", { hasText: "Send me a test" }).count()) > 0) {
    await page.locator("button", { hasText: "Send me a test" }).click();
    await page.waitForSelector("button:has-text('Submit'):not([disabled])", { timeout: 15_000 });
    await page.locator("button", { hasText: "Submit" }).click();
    await page.waitForSelector(".record-banners", { timeout: 15_000 });
  }
  if ((await page.locator(".callout__title", { hasText: "Waiting for approval" }).count()) === 0) {
    report(
      `${folder}/mail-campaign-submitted`,
      "the owner's own draft is not waiting for someone else",
    );
  }
  await assertAccessible(page, `${folder}/mail-campaign-submitted`);
  await page.screenshot({ path: `${OUT}/${folder}/mail-campaign-submitted.png`, fullPage: true });
  console.log(`  ✓ ${folder}/mail-campaign-submitted`);

  await page.goto(`${BASE}/mail/segments`, { waitUntil: "networkidle" });
  await page.locator("button", { hasText: "Check who matches" }).click();
  await page.waitForSelector(".segment-result", { timeout: 15_000 });
  await assertNoOverflow(page, `${folder}/mail-segment-checked`);
  await assertAccessible(page, `${folder}/mail-segment-checked`);
  await page.screenshot({ path: `${OUT}/${folder}/mail-segment-checked.png`, fullPage: true });
  console.log(`  ✓ ${folder}/mail-segment-checked`);

  // A sender ticked by hand, checked with the provider; then paused and resumed.
  await page.goto(`${BASE}/mail/settings`, { waitUntil: "networkidle" });
  const salesRow = page.locator("tr", { hasText: "sales@quantifyterminal.com" });
  if ((await salesRow.locator(".table-sub", { hasText: "Ticked by hand" }).count()) > 0) {
    await page
      .locator('button[aria-label="Check sales@quantifyterminal.com with the provider"]')
      .click();
    await salesRow
      .locator(".table-sub", { hasText: "Checked with the provider" })
      .waitFor({ timeout: 15_000 });
  }
  await page.locator('button[aria-label="Pause sales@quantifyterminal.com"]').click();
  await page
    .locator('button[aria-label="Resume sales@quantifyterminal.com"]')
    .waitFor({ timeout: 15_000 });
  await assertAccessible(page, `${folder}/mail-sender-paused`);
  await page.screenshot({ path: `${OUT}/${folder}/mail-sender-paused.png`, fullPage: true });
  await page.locator('button[aria-label="Resume sales@quantifyterminal.com"]').click();
  await page
    .locator('button[aria-label="Pause sales@quantifyterminal.com"]')
    .waitFor({ timeout: 15_000 });
  console.log(`  ✓ ${folder}/mail-sender-paused`);

  // A list, end to end: made, filled from a file (a bad address and an extra column
  // included), one person added by hand, one taken off. Later passes find it made.
  await page.goto(`${BASE}/mail/lists`, { waitUntil: "networkidle" });
  const existing = page.locator("a.table-title", { hasText: "Harness list" });
  if ((await existing.count()) > 0) {
    await existing.first().click();
    await page.waitForSelector(".rhead", { timeout: 15_000 });
  } else {
    await page.locator("summary", { hasText: "New list" }).click();
    await page.fill("#list-name", "Harness list");
    await page.locator("button", { hasText: "Create list" }).click();
    await page.waitForURL("**/mail/lists/*?tab=import", { timeout: 15_000 });
  }
  const listUrl = page.url().split("?")[0]!;
  await page.goto(`${listUrl}?tab=import`, { waitUntil: "networkidle" });
  await page.setInputFiles("#list-csv", {
    name: "harness.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      [
        "Email,First name,Last name,Company,Fund size,Region",
        "ada@harness.example,Ada,Lovelace,Analytical Capital,$2bn,EMEA",
        "grace@harness.example,Grace,Hopper,Navy Partners,$500m,Americas",
        "not-an-address,Nobody,Here,,,",
      ].join("\n"),
    ),
  });
  await page.locator("button", { hasText: /^Add \d+ rows to the list$/ }).click();
  await page.waitForSelector(".list-import__result", { timeout: 20_000 });
  // The result is below the fold; a full-page capture taken scrolled draws the sticky
  // head mid-image.
  await page.evaluate(() => window.scrollTo(0, 0));
  await assertNoOverflow(page, `${folder}/mail-list-imported`);
  await assertAccessible(page, `${folder}/mail-list-imported`);
  await page.screenshot({ path: `${OUT}/${folder}/mail-list-imported.png`, fullPage: true });
  console.log(`  ✓ ${folder}/mail-list-imported`);
  await page.goto(`${listUrl}?tab=add`, { waitUntil: "networkidle" });
  await page.fill("#add-email", `hand-${folder.replace(/\W+/g, "-")}@harness.example`);
  await page.fill("#add-first_name", "Hand");
  await page.locator("button", { hasText: "Add to the list" }).first().click();
  await page.waitForSelector(".form-sent", { timeout: 15_000 });
  await page.goto(listUrl, { waitUntil: "networkidle" });
  const before = await page
    .locator(".list-bar ~ * input[name=member_id], input[name=member_id]")
    .count();
  // A confirm the page raises; tolerant of a handler another pass left waiting.
  page.once("dialog", (dialog) => void dialog.accept().catch(() => undefined));
  await page.locator("input[name=member_id]").first().check();
  await page.locator("button", { hasText: "Remove ticked" }).click();
  await page.waitForSelector(".list-remove .form-sent", { timeout: 15_000 });
  await page.reload({ waitUntil: "networkidle" });
  const after = await page.locator("input[name=member_id]").count();
  if (after !== before - 1)
    report(`${folder}/mail-list-removed`, `${before} rows before, ${after} after`);
  await assertAccessible(page, `${folder}/mail-list-removed`);
  await page.screenshot({ path: `${OUT}/${folder}/mail-list-removed.png`, fullPage: true });
  console.log(`  ✓ ${folder}/mail-list-removed`);

  await page.goto(`${BASE}/mail/sequences/${MAIL.fundIntro}?tab=enrol`, {
    waitUntil: "networkidle",
  });
  const boxes = page.locator(".audience-pick__list input[type=checkbox]");
  for (let index = 0; index < Math.min(4, await boxes.count()); index += 1) {
    await boxes.nth(index).check();
  }
  await page.locator("button", { hasText: "Check who it takes" }).click();
  await page.waitForSelector(".verdicts", { timeout: 15_000 });
  await assertNoOverflow(page, `${folder}/mail-enrol-checked`);
  await assertAccessible(page, `${folder}/mail-enrol-checked`);
  await page.screenshot({ path: `${OUT}/${folder}/mail-enrol-checked.png`, fullPage: true });
  console.log(`  ✓ ${folder}/mail-enrol-checked`);
}

/**
 * The recipient's side, signed out: the stop page as it opens, a link that names
 * nothing, the button pressed, and the mailbox's RFC 8058 one-click POST — checked by
 * reading the stop back from the service, not by trusting the 200.
 */
async function captureUnsubscribe(page: Page, folder: string) {
  await capture(page, folder, {
    name: "unsubscribe",
    path: `/u/mock-${MAIL.stopLooked}`,
    ready: ".unsub",
  });
  await capture(page, folder, {
    name: "unsubscribe-invalid",
    path: "/u/mock-00000000-0000-4000-8000-000000000000",
  });
  await page.goto(`${BASE}/u/mock-${MAIL.stopPressed}`, { waitUntil: "networkidle" });
  if ((await page.locator("button", { hasText: "Unsubscribe from everything" }).count()) > 0) {
    await page.locator("button", { hasText: "Unsubscribe from everything" }).click();
    await page.waitForSelector("h1:has-text('You are unsubscribed'), .form-sent", {
      timeout: 15_000,
    });
  }
  await assertNoOverflow(page, `${folder}/unsubscribe-done`);
  await assertAccessible(page, `${folder}/unsubscribe-done`);
  await page.screenshot({ path: `${OUT}/${folder}/unsubscribe-done.png`, fullPage: true });
  console.log(`  ✓ ${folder}/unsubscribe-done`);

  const oneClick = await fetch(`${BASE}/u/mock-${MAIL.stopOneClick}/one-click`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "List-Unsubscribe=One-Click",
  });
  const readBack = (await fetch(
    `http://127.0.0.1:7071/api/v1/public/mail/unsubscribe/mock-${MAIL.stopOneClick}`,
  ).then((response) => response.json())) as { marketing_state?: string };
  if (oneClick.status !== 200 || readBack.marketing_state !== "unsubscribed") {
    report(
      `${folder}/unsubscribe-one-click`,
      `POST answered ${oneClick.status}; the address reads "${readBack.marketing_state}"`,
    );
  } else {
    console.log(`  ✓ ${folder}/unsubscribe-one-click`);
  }
}

/**
 * "This wasn't me", signed out: the page as the mail opens it (nothing happens yet),
 * then the press, which locks the account the link names. A second viewport finds the
 * link already used and says so.
 */
async function captureReport(page: Page, folder: string) {
  await capture(page, folder, {
    name: "report",
    path: "/report/hqr_mock_demo",
    ready: ".auth-form",
  });
  await page.locator("button", { hasText: "This wasn't me" }).click();
  await page.waitForSelector("[role=status], .auth__note", { timeout: 15_000 });
  const answer = (await page.locator("main").innerText()) ?? "";
  if (!/Done\.|already locked/.test(answer)) {
    report(`${folder}/report-done`, "pressing the lock did not say the account was locked");
  }
  await assertNoOverflow(page, `${folder}/report-done`);
  await assertAccessible(page, `${folder}/report-done`);
  await page.screenshot({ path: `${OUT}/${folder}/report-done.png`, fullPage: true });
  console.log(`  ✓ ${folder}/report-done`);
}

/**
 * Compile the sign-in routes before any timed step reaches them. On a freshly started
 * dev server the enrolment page took eighteen seconds to compile on first hit — past
 * the fifteen-second wait after the sign-in click — and the harness failed a step the
 * product had passed. A warm route is the product; a cold compile is the tool.
 */
async function warmRoutes(browser: Browser) {
  const context = await browser.newContext();
  try {
    for (const path of [
      "/login",
      "/login/verify",
      "/login/enroll",
      "/forgot-password",
      "/reset-password",
    ]) {
      await context.request.get(`${BASE}${path}`, { timeout: 120_000 }).catch(() => undefined);
    }
  } finally {
    await context.close();
  }
}

async function run(browser: Browser) {
  await warmRoutes(browser);
  for (const viewport of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });
    const page = await context.newPage();
    watchConsole(page);

    // Signed-out surfaces first.
    mkdirSync(`${OUT}/${viewport.name}/auth`, { recursive: true });
    await capture(page, `${viewport.name}/auth`, { name: "login", path: "/login?form=1" });
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
    await captureUnsubscribe(page, `${viewport.name}/auth`);
    await captureReport(page, `${viewport.name}/auth`);

    // The two-step and the code screen, mid-flow.
    await page.goto(`${BASE}/login?form=1`, { waitUntil: "networkidle" });
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
    await intern.goto(`${BASE}/login?form=1`, { waitUntil: "networkidle" });
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
    await enrollPage.goto(`${BASE}/login?form=1`, { waitUntil: "networkidle" });
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
