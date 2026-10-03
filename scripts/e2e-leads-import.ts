/**
 * A researched list through the import page, end to end, in a real browser: choose the
 * file, let the columns map themselves, say where it came from, send it in parts, and
 * read the answer; then check the prospects list, its breakdown, a filtered view saved
 * as a segment, and that file's line in the import history.
 *
 *     npx tsx scripts/e2e-leads-import.ts [file.csv] [outDir]
 *
 * With no file it writes its own: 1,200 invented prospects on reserved `.example`
 * domains, plus the rows an import must leave out (no address, a malformed one, the same
 * address twice). Needs the dev server and the mock up, like the harness.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium } from "playwright";

const BASE = process.env.HQ_UI_BASE ?? "http://127.0.0.1:3000";
const [given, outDir = "test-results/leads-import"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

function ownFile(): { path: string; rows: number; expectCreated: number } {
  const types = ["PMS", "AIF", "Hedge fund", "Asset manager", "Family office", "Stock broker"];
  const countries = ["India", "United States", "Singapore", "United Kingdom", "Brazil", ""];
  const titles = [
    "Portfolio Manager",
    "Chief Investment Officer",
    "Analyst",
    "",
    "Compliance Officer",
  ];
  const lines = ["email,first_name,last_name,title,company,firm_type,country,source_url,Fund size"];
  const stamp = Date.now().toString(36);
  for (let index = 0; index < 1200; index += 1) {
    const role = index % 7 === 6;
    const email = role
      ? `info@firm${stamp}${index}.example`
      : `person${index}@firm${stamp}${index}.example`;
    lines.push(
      [
        email,
        role ? "" : `First${index}`,
        role ? "" : "Tester",
        role ? "" : titles[index % titles.length],
        `"Firm ${index}, ${stamp}"`,
        types[index % types.length],
        countries[index % countries.length],
        "https://regulator.example/register",
        `${(index % 9) + 1}00m`,
      ].join(","),
    );
  }
  // What an import must leave out, and say so.
  lines.push(",No,Address,,Nobody,PMS,India,,");
  lines.push("not an address,Bad,Address,,Nobody,PMS,India,,");
  lines.push(`person0@firm${stamp}0.example,Twice,Tester,,Firm 0,PMS,India,,`);
  const dir = mkdtempSync(join(tmpdir(), "hq-leads-"));
  const path = join(dir, "prospects-e2e.csv");
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
  return { path, rows: 1203, expectCreated: 1200 };
}

const file = given ? { path: given, rows: 0, expectCreated: 0 } : ownFile();
const problems: string[] = [];
const check = (ok: boolean, what: string) => {
  console.log(`  ${ok ? "✓" : "✗"} ${what}`);
  if (!ok) problems.push(what);
};
const number = (text: string | null) => Number((text ?? "").replace(/[^0-9]/g, "") || "0");

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors: string[] = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

await page.goto(`${BASE}/login?form=1`, { waitUntil: "networkidle" });
await page.fill("#email", "owner@hq.test");
await page.fill("#password", "password-123");
await page.click("button[type=submit]");
await page.waitForURL("**/login/verify**", { timeout: 30_000 });
await page.fill("#totp-code", "000000");
await page.click("button[type=submit]");
await page.waitForURL("**/home", { timeout: 30_000 });

await page.goto(`${BASE}/leads/prospects`, { waitUntil: "networkidle" });
const before = number(await page.locator(".pagebar__meta").innerText());

await page.goto(`${BASE}/leads/import`, { waitUntil: "networkidle" });
await page.setInputFiles("#lead-csv", file.path);
await page.waitForSelector("#lead-map-email", { timeout: 60_000 });
check((await page.inputValue("#lead-map-email")) !== "", "the email column mapped itself");
check((await page.inputValue("#lead-map-company")) !== "", "the firm column mapped itself");
check((await page.inputValue("#lead-map-firm_type")) !== "", "the firm type column mapped itself");
const add = page.locator("button", { hasText: /Add [0-9,]+ rows as prospects/ });
check(await add.isDisabled(), "nothing is sent before the file's origin is said");
await page.fill("#lead-import-reason", "Public registers and firms' own team pages");
await page.screenshot({ path: `${outDir}/import-mapped.png`, fullPage: true });
const started = Date.now();
await add.click();
await page.waitForSelector("#lead-import-done", { timeout: 30 * 60_000 });
const seconds = Math.round((Date.now() - started) / 1000);
const counts = await page.locator(".list-import__counts dd").allInnerTexts();
const [created = 0, updated = 0, unchanged = 0, skipped = 0] = counts.map(number);
console.log(
  `  import: ${created} added, ${updated} filled in, ${unchanged} already here, ${skipped} left out (${seconds}s)`,
);
check(created > 0, "prospects were added");
if (!given) {
  check(created === file.expectCreated, `all ${file.expectCreated} good rows were added`);
  check(skipped === 3, "the three bad rows were left out and counted");
  const reasons = await page.locator(".list-import__result tbody tr td:last-child").allInnerTexts();
  check(
    [
      "No address in the row",
      "Not a well-formed address",
      "The same address earlier in the file",
    ].every((reason) => reasons.includes(reason)),
    "each left-out row says why",
  );
}
await page.screenshot({ path: `${outDir}/import-done.png`, fullPage: true });

// The history names the file and counts what is still here.
await page.reload({ waitUntil: "networkidle" });
const firstRow = page.locator('table:has(caption:text-is("Lead imports")) tbody tr').first();
const cells = await firstRow.locator("td").allInnerTexts();
check(number(cells[3] ?? "") === created, "the history shows what this file added");
check(number(cells[6] ?? "") === created, "and all of it is still here");

// The list: paged, counted, broken down.
await page.goto(`${BASE}/leads/prospects`, { waitUntil: "networkidle" });
const after = number(await page.locator(".pagebar__meta").innerText());
check(after === before + created, `the table grew by ${created} (now ${after})`);
check(
  (await page.locator(".data-table tbody tr").count()) === 100,
  "one page of a hundred is shown",
);
check((await page.locator(".facets__group").count()) >= 5, "the view is broken down by field");
await page.screenshot({ path: `${outDir}/prospects.png`, fullPage: true });

// Narrow by a facet, then save the view as a segment.
const firstFacet = page.locator(".facets__group").first().locator(".facets__row").first();
const facetCount = number(await firstFacet.locator(".facets__count").innerText());
await firstFacet.click();
await page.waitForURL(/[?&]f=/, { timeout: 30_000 });
await page.waitForLoadState("networkidle");
const inView = number(await page.locator(".stat").first().locator(".stat__value").innerText());
check(inView === facetCount, `a facet row narrows the view to its ${facetCount} leads`);
await page.locator("summary", { hasText: "Save as a segment" }).click();
const name = `E2E ${Date.now().toString(36)}`;
await page.fill("#segment-name", name);
await page.locator("button", { hasText: /^Save segment$/ }).click();
await page.waitForSelector(".form-feedback--success, .form-sent, [role=status]:has-text('Saved')", {
  timeout: 30_000,
});
await page.goto(`${BASE}/leads/segments`, { waitUntil: "networkidle" });
const saved = page.locator('table:has(caption:text-is("Saved lead segments")) tbody tr', {
  hasText: name,
});
check((await saved.count()) === 1, "the saved view is a segment");
check(
  number(await saved.locator("td").nth(2).innerText()) === facetCount,
  "and it matches the same number of leads",
);
await page.screenshot({ path: `${outDir}/segments.png`, fullPage: true });

check(errors.length === 0, `no console errors${errors.length ? `: ${errors[0]}` : ""}`);
await browser.close();
if (problems.length) {
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log("\nThe import works end to end.");
