import { chromium } from "playwright";

/**
 * Passkeys end to end, with Chromium's virtual authenticator: the code step offers a
 * passkey, My security adds one, a fresh sign-in uses it, and Remove takes it away.
 * The screenshot harness cannot drive WebAuthn, so this runs on its own:
 *
 *   npm run mock:hq   (one terminal)   npm run dev   (another)   npm run check:passkeys
 *
 * It must be reached as localhost, not 127.0.0.1: a relying-party id has to be a domain.
 * `HQ_PASSKEY_SHOTS=<dir>` also saves the code step at desktop and phone widths.
 */
const BASE = process.env.HQ_PASSKEY_BASE ?? "http://localhost:3000";
const SHOTS = process.env.HQ_PASSKEY_SHOTS ?? "";
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors: string[] = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text().slice(0, 300));
});
page.on("pageerror", (error) => errors.push(`uncaught: ${error.message.slice(0, 300)}`));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: {
    protocol: "ctap2",
    transport: "internal",
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
    automaticPresenceSimulation: true,
  },
});
await fetch("http://127.0.0.1:7071/api/v1/mock/reset", { method: "POST" });

async function passwordStep(email = "owner@hq.test") {
  await page.goto(`${BASE}/login?form=1`, { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", "password-123");
  await page.click("button[type=submit]");
  await page.waitForURL("**/login/verify**", { timeout: 30_000 });
}

await passwordStep();
await page.getByRole("button", { name: "Use your passkey" }).waitFor({ timeout: 10_000 });
console.log("1. verify page offers the passkey");
if (SHOTS) {
  await page.screenshot({ path: `${SHOTS}/verify-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 412, height: 900 });
  await page.screenshot({ path: `${SHOTS}/verify-phone.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
}
await page.fill("#totp-code", "000000");
await page.click("button[type=submit]");
await page.waitForURL("**/home", { timeout: 30_000 });

await page.goto(`${BASE}/me/security`, { waitUntil: "networkidle" });
const addButton = page.getByRole("button", { name: "Add a passkey" });
await addButton.waitFor({ timeout: 10_000 });
if (await addButton.isDisabled()) {
  console.log("   add is disabled (sudo not fresh) — html of the gate:");
  console.log((await page.locator("#passkeys").innerHTML()).slice(0, 1500));
}
await page.fill("#passkey-label", "Virtual test key");
await addButton.click();
await page.getByText("Added “Virtual test key”.").waitFor({ timeout: 20_000 });
console.log("2. passkey added");
// The list is server-rendered; the form asks the router to refresh it after a save.
await page.locator(".policy__title", { hasText: "Virtual test key" }).waitFor({ timeout: 10_000 });
console.log("   the list shows it without a reload");

await context.clearCookies();
await passwordStep();
await page.getByRole("button", { name: "Use your passkey" }).click();
await page.waitForURL("**/home", { timeout: 30_000 });
console.log("3. signed in with the passkey");

await page.goto(`${BASE}/me/security`, { waitUntil: "networkidle" });
const row = page.locator(".policy", { hasText: "Virtual test key" });
await row.getByRole("button", { name: "Remove" }).click();
await page.waitForTimeout(1500);
await page.reload({ waitUntil: "networkidle" });
const left = await page.locator(".policy__title", { hasText: "Virtual test key" }).count();
console.log(`4. removed; rows left with that name: ${left}`);

// An account without a passkey is not offered one.
await context.clearCookies();
await passwordStep("sales@hq.test");
await page.locator("#totp-code").waitFor({ timeout: 10_000 });
const offered = await page.getByRole("button", { name: "Use your passkey" }).count();
console.log(`5. account without a passkey: button count ${offered}`);
if (offered !== 0) process.exitCode = 1;
console.log("console errors:", errors.length ? errors : "none");
await browser.close();
if (left !== 0 || errors.length) process.exitCode = 1;
