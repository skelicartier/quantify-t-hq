/**
 * Sign in to the mock as a persona and screenshot a few paths, for a look while
 * designing. Not a test: the harness (`check:hq-ui`) is the gate.
 *
 *     npx tsx scripts/peek-hq.ts <outDir> <email> <path> [path...]
 */
import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

const BASE = process.env.HQ_UI_BASE ?? "http://127.0.0.1:3000";
const [outDir = "test-results/peek", email = "owner@hq.test", ...paths] = process.argv.slice(2);
const theme = process.env.HQ_PEEK_THEME ?? "dark";
const width = Number(process.env.HQ_PEEK_WIDTH ?? 1440);

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width, height: 900 } });
const page = await context.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill("#email", email);
await page.fill("#password", "password-123");
await page.click("button[type=submit]");
await page.waitForURL("**/login/verify**", { timeout: 30_000 });
await page.fill("#totp-code", "000000");
await page.click("button[type=submit]");
await page.waitForURL("**/home", { timeout: 30_000 });
if (theme === "light") {
  const button = page.locator('.theme-toggle button[title="Light theme"]');
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && r.ok());
  await button.click();
  await saved;
}
for (const path of paths.length ? paths : ["/home"]) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  const name = path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  console.log(`  ✓ ${name}`);
  if (process.env.HQ_PEEK_AXE) {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 1) console.log(`    overflow: ${overflow}px`);
    const results = await new AxeBuilder({ page }).exclude(".mail-preview__frame").analyze();
    for (const violation of results.violations) {
      if (violation.impact !== "serious" && violation.impact !== "critical") continue;
      for (const node of violation.nodes) {
        console.log(`    axe ${violation.id}: ${node.target.join(" ")}`);
        console.log(`      ${node.html.slice(0, 200)}`);
        console.log(`      ${node.failureSummary?.split("\n").slice(0, 3).join(" | ") ?? ""}`);
      }
    }
  }
}
await browser.close();
