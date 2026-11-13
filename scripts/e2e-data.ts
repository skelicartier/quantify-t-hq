/**
 * Data end to end in a real browser, with nothing able to leave: invented people on
 * reserved `.example` domains, a stand-in provider, a throwaway folder and socket.
 *
 * Run it against a portal and a service of its own, never the real ones: a copy of this
 * checkout with its own `.env.local` (HQ_MAIL_MERGE_SOCKET at a throwaway socket),
 * `npx next dev -p 3100` there, then
 *
 *     npx tsx scripts/e2e-data-service.ts "$T/data" "$T/s.sock" "$T/outbox.jsonl" &
 *     HQ_UI_BASE=http://127.0.0.1:3100 npm run check:data -- "$T/outbox.jsonl"
 *
 * It refuses HQ_UI_BASE unset or on port 3000. It signs in as the Owner, then runs every
 * `scripts/data-walk/*.ts` module's `walk(page, kit)` at 1440×900 and 412×915, in dark
 * and light. For the whole walk it checks: no console errors; no response carrying the
 * service's folder, "Application Support" or the walk key; no Data page saying "demo";
 * no progress bar or meter outside the upload tray; and what each role sees.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { request } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import AxeBuilder from "@axe-core/playwright";
import { chromium, type Page } from "playwright";

import type { Pass, SocketAnswer, WalkKit, WalkModule } from "./data-walk/kit";
import { WALK_KEY } from "./mail-merge/e2e-provider";
import type { OutgoingMail } from "./mail-merge/provider";

const BASE = process.env.HQ_UI_BASE ?? "";
if (!BASE) {
  console.error("Set HQ_UI_BASE to the copy's portal, for example http://127.0.0.1:3100.");
  process.exit(1);
}
const basePort = new URL(BASE).port;
if (basePort === "3000" || basePort === "") {
  console.error(
    `Refusing ${BASE}: that is the live portal, or not a copy. Walk a copy on its own port.`,
  );
  process.exit(1);
}
const OUTBOX: string = process.argv[2] ?? "";
if (!OUTBOX) {
  console.error("usage: e2e-data.ts <the stand-in's outbox file> [socket]");
  process.exit(1);
}

/** The stand-in's socket: given, or the copy's own `.env.local`. */
function socketPath(): string {
  const given = process.env.HQ_DATA_SOCKET ?? process.argv[3];
  if (given) return given;
  if (existsSync(".env.local")) {
    const match = /^HQ_MAIL_MERGE_SOCKET=(.+)$/m.exec(readFileSync(".env.local", "utf8"));
    if (match?.[1]) return match[1].trim();
  }
  console.error(
    "Say where the stand-in's socket is: HQ_DATA_SOCKET, a second argument, or .env.local.",
  );
  process.exit(1);
}
const SOCKET = socketPath();
const FOLDER = dirname(SOCKET);
const SHOTS = "test-results/data";
mkdirSync(SHOTS, { recursive: true });

let failures = 0;
function check(name: string, ok: boolean, detail: unknown = ""): void {
  const said =
    detail === ""
      ? ""
      : ` — ${String(typeof detail === "object" ? JSON.stringify(detail) : detail)
          .replace(/\s+/g, " ")
          .slice(0, 220)}`;
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${said}`);
  if (!ok) failures += 1;
}

function outbox(): OutgoingMail[] {
  if (!existsSync(OUTBOX)) return [];
  return readFileSync(OUTBOX, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as OutgoingMail);
}

function ask(method: "GET" | "POST", path: string, body?: unknown): Promise<SocketAnswer> {
  return new Promise((resolve, reject) => {
    const text = body === undefined ? undefined : JSON.stringify(body);
    const outgoing = request(
      {
        socketPath: SOCKET,
        path,
        method,
        headers: text
          ? { "content-type": "application/json", "content-length": Buffer.byteLength(text) }
          : {},
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
          } catch {
            parsed = {};
          }
          resolve({ status: response.statusCode ?? 0, body: parsed });
        });
      },
    );
    outgoing.on("error", reject);
    if (text) outgoing.write(text);
    outgoing.end();
  });
}

async function waitReady(timeoutMs = 30_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const status = await ask("GET", "/data/status");
      if ((status.body.data as { state?: string } | undefined)?.state === "ready") return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("the stand-in did not come back in time");
}

/** Press the named theme's own button and wait until the shell has switched (as the harness does). */
async function setTheme(page: Page, theme: "dark" | "light"): Promise<void> {
  const label = theme === "light" ? "Light theme" : "Dark theme";
  const button = page.locator(`.theme-toggle button[title="${label}"]`);
  if ((await button.getAttribute("aria-pressed")) !== "true") {
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

async function loadWalks(): Promise<{ name: string; module: WalkModule }[]> {
  const walkDir = join(dirname(fileURLToPath(import.meta.url)), "data-walk");
  const walks: { name: string; module: WalkModule }[] = [];
  for (const file of readdirSync(walkDir)
    .filter((name) => name.endsWith(".ts"))
    .sort()) {
    const loaded = (await import(`./data-walk/${file.slice(0, -3)}`)) as WalkModule;
    if (typeof loaded.walk === "function") walks.push({ name: file.slice(0, -3), module: loaded });
  }
  return walks;
}

const errors: string[] = [];
const leaked: string[] = [];
const demo: string[] = [];
const meters: string[] = [];

function watch(page: Page): void {
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text().slice(0, 240));
  });
  page.on("pageerror", (error) => errors.push(`uncaught: ${String(error).slice(0, 240)}`));
  page.on("response", (response) => {
    response
      .text()
      .then((body) => {
        if (
          body.includes("Application Support") ||
          body.includes(FOLDER) ||
          body.includes(WALK_KEY)
        )
          leaked.push(response.url());
      })
      .catch(() => undefined);
  });
}

function kitFor(page: Page, pass: Pass): WalkKit {
  const prefix = `${pass.width}-${pass.theme}`;
  return {
    base: BASE,
    pass,
    check: (name, ok, detail) => check(`${prefix} · ${name}`, ok, detail),
    audit: async (name) => {
      await page.evaluate(() => window.scrollTo(0, 0));
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      const axe = await new AxeBuilder({ page }).analyze();
      const bad = axe.violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical",
      );
      check(
        `${prefix} · ${name}: no overflow, axe clean`,
        overflow <= 1 && bad.length === 0,
        `${overflow}px ${bad.map((violation) => `${violation.id}(${violation.nodes.length})`).join(" ")}`,
      );
      const main = await page.locator("main").first().innerText();
      if (/\bdemo\b/i.test(main)) demo.push(`${prefix}/${name}`);
      const stray = await page.evaluate(
        () =>
          [...document.querySelectorAll('main [role="progressbar"], main .meter')].filter(
            (element) => !element.closest(".hqdata-tray"),
          ).length,
      );
      if (stray > 0) meters.push(`${prefix}/${name}`);
      await page.screenshot({ path: `${SHOTS}/${prefix}-${name}.png`, fullPage: true });
    },
    outbox,
    socket: { path: SOCKET, ask, waitReady },
    // `.first()`: the not-found and error pages draw a main of their own inside the shell's.
    text: () => page.locator("main").first().innerText(),
    says: (words, timeout = 20_000) =>
      page
        .waitForFunction((text) => document.body.innerText.includes(text), words, { timeout })
        .then(() => undefined),
  };
}

const walks = await loadWalks();
if (walks.length === 0) {
  console.error("No walk module under scripts/data-walk exports walk().");
  process.exit(1);
}
console.log(`Walking ${walks.map((walk) => walk.name).join(", ")} against ${BASE}`);
await waitReady(60_000);

const browser = await chromium.launch();
try {
  let first = true;
  for (const viewport of [
    { width: "desktop" as const, size: { width: 1440, height: 900 } },
    { width: "phone" as const, size: { width: 412, height: 915 } },
  ]) {
    const context = await browser.newContext({ viewport: viewport.size, acceptDownloads: true });
    const page = await context.newPage();
    watch(page);
    await page.goto(`${BASE}/dev/signin?as=owner%40hq.test&next=%2Fdata`, {
      waitUntil: "networkidle",
    });
    for (const theme of ["dark", "light"] as const) {
      await setTheme(page, theme);
      for (const walk of walks) {
        console.log(`${viewport.width} ${theme}: ${walk.name}`);
        await walk.module.walk!(page, kitFor(page, { width: viewport.width, theme, first }));
      }
      // The first pass (desktop, dark) is first for every module, as the kit says.
      first = false;
    }
    await setTheme(page, "dark");
    await context.close();
  }

  console.log("Roles");
  for (const persona of ["admin", "sales", "support", "intern"]) {
    const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const person = await other.newPage();
    watch(person);
    await person.goto(`${BASE}/dev/signin?as=${persona}%40hq.test&next=%2Fdata`, {
      waitUntil: "networkidle",
    });
    const body = await person.locator("main").first().innerText();
    check(
      `${persona} sees what the role allows`,
      persona === "admin"
        ? /Sent today/i.test(body)
        : body.includes("Data is for Owners and Admins.") && !body.includes("@"),
      body.slice(0, 120),
    );
    if (persona !== "admin") {
      const rail = await person.locator("#shell-sidebar").innerText();
      check(
        `${persona} has no Data group in the rail`,
        !/\bData\b/.test(rail.replace(/Data health/g, "")),
      );
    }
    await other.close();
  }

  check("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  check(
    "no response carried the folder, the key or Application Support",
    leaked.length === 0,
    leaked.slice(0, 3).join(" "),
  );
  check("no Data page says demo", demo.length === 0, demo.join(" "));
  check("no progress bar or meter outside the upload tray", meters.length === 0, meters.join(" "));
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
