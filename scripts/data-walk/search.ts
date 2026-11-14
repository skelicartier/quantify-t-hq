/**
 * Data's search, walked (raise spec §7.10, S1–S5): a lead found by its address through
 * `GET /data/search`, through ⌘K and on `/search`, Data's groups first; the kinds other
 * units add answered by stand-ins installed under test routes only where no real source is
 * (§7.7); and nothing of Data's for an intern. Every person and firm is invented.
 */

import type { Page } from "playwright";

import { WALKER, type Shot, type WalkKit } from "./kit";

export const shots: Shot[] = [
  { name: "data-search", path: "/search?q=walk", ready: ".search-results" },
];

type Body = Record<string, unknown>;
type Group = { kind: string; label: string; count: number; hits: Body[] };

const flat = (text: string) => text.replace(/\s+/g, " ").trim();

const STAND_INS = ["investors", "files", "notes", "contacts"] as const;
const DATA_SECTIONS = [
  ["investor", "Investors"],
  ["file", "Files"],
  ["note", "Notes"],
  ["faq", "Investor FAQ"],
  ["decision", "Decisions"],
  ["contact", "Contacts"],
] as const;

async function groups(kit: WalkKit, query: string): Promise<Group[]> {
  return ((await kit.socket.ask("GET", `/data/search?${query}`)).body.groups as Group[]) ?? [];
}

/**
 * The lead the walk looks for: the first of All leads' first page whose address's local
 * part finds five or fewer leads, so it shows among the first hits everywhere.
 */
async function chooseLead(
  kit: WalkKit,
): Promise<{ email: string; lead_id: string; word: string } | null> {
  const leads =
    ((await kit.socket.ask("GET", "/data/leads")).body.leads as
      { email: string; lead_id: string }[] | undefined) ?? [];
  for (const lead of leads) {
    const word = lead.email.split("@")[0] ?? "";
    if (word.length < 2) continue;
    const found = (await groups(kit, `q=${encodeURIComponent(word)}&kind=lead`))[0];
    if (found && found.count <= 5 && found.hits.some((hit) => hit.id === lead.lead_id))
      return { email: lead.email, lead_id: lead.lead_id, word };
  }
  return null;
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/search?q=walk")).status !== 200) {
    kit.check("search: not loaded in this service", true);
    return;
  }
  // The stand-ins, where no real source is (a worker restart forgets them). Where every
  // module is loaded (the merged copy) none is installed, and S4 searches the real records.
  const fakes = new Set<string>();
  for (const name of STAND_INS) {
    const answer = await kit.socket.ask("POST", "/data/_test/search/source", { name, by: WALKER });
    if (answer.body.installed === true) fakes.add(name);
  }
  const everyKind = fakes.size === STAND_INS.length ? "walk stand-in" : "walk";

  // ---------------------------------------------------------------- S1: by its address
  const first =
    (((await kit.socket.ask("GET", "/data/leads")).body.leads as { email: string }[]) ?? [])[0] ??
    null;
  const firstWord = first?.email.split("@")[0] ?? "";
  const byFirst = (await groups(kit, `q=${encodeURIComponent(firstWord)}&kind=lead`))[0];
  const chosen = await chooseLead(kit);
  kit.check(
    "search S1: the first lead of All leads is found by its address's local part, in the lead group",
    first !== null &&
      byFirst?.kind === "lead" &&
      byFirst.label === "All leads" &&
      byFirst.hits.some((hit) => String(hit.snippet) === first.email) &&
      chosen !== null,
    { word: firstWord, count: byFirst?.count, chosen: chosen?.word },
  );
  if (!chosen) return;

  // ---------------------------------------------------------------- S2: ⌘K
  await page.goto(`${kit.base}/data`, { waitUntil: "networkidle" });
  // ⌘K listens once the page has hydrated: press until the palette opens.
  const input = page.locator("dialog.palette[open] input");
  for (let tries = 0; tries < 10 && !(await input.isVisible()); tries += 1) {
    await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
    await input.waitFor({ timeout: 1_000 }).catch(() => undefined);
  }
  await input.fill(chosen.word);
  await page
    .locator(".palette__item .palette__subtitle", { hasText: /^All leads/ })
    .first()
    .waitFor({ timeout: 20_000 });
  const subtitles = await page
    .locator(".palette__section", { has: page.locator(".palette__group", { hasText: "Records" }) })
    .locator(".palette__item")
    .evaluateAll((items) =>
      items
        .filter((item) => !item.textContent?.includes("See all results for"))
        .map((item) => item.querySelector(".palette__subtitle")?.textContent ?? ""),
    );
  kit.check(
    "search S2: in ⌘K the first record found is in All leads",
    (subtitles[0] ?? "").startsWith("All leads"),
    subtitles.slice(0, 3),
  );
  await page.keyboard.press("Escape");

  // ---------------------------------------------------------------- S3: /search, Data first
  await page.goto(`${kit.base}/search?q=${encodeURIComponent(chosen.word)}`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector(".search-results", { timeout: 30_000 });
  const sections = await page
    .locator("main section.rsection h2")
    .evaluateAll((titles) => titles.map((title) => title.id));
  const leadSection = page.locator("section[aria-labelledby='search-data-lead']");
  kit.check(
    "search S3: /search shows All leads first, linking to the lead",
    sections[0] === "search-data-lead" &&
      (await leadSection.locator(`a[href="/data/leads/${chosen.lead_id}"]`).count()) === 1 &&
      flat(await leadSection.innerText()).includes(chosen.email),
    sections.slice(0, 4),
  );
  await kit.audit("search-data");

  // ---------------------------------------------------------------- S4: every kind, one kind
  await page.goto(`${kit.base}/search?q=${encodeURIComponent(everyKind)}`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector(".search-results", { timeout: 30_000 });
  const found: string[] = [];
  for (const [kind, label] of DATA_SECTIONS) {
    const section = page.locator(`section[aria-labelledby='search-data-${kind}']`);
    if ((await section.count()) === 1 && flat(await section.locator("h2").innerText()) === label)
      found.push(kind);
  }
  await page.goto(`${kit.base}/search?q=${encodeURIComponent(everyKind)}&kind=data_contact`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector(".search-results", { timeout: 30_000 });
  const only = await page
    .locator("main section.rsection h2")
    .evaluateAll((titles) => titles.map((title) => title.id));
  kit.check(
    `search S4: every kind ${fakes.size === STAND_INS.length ? "the stand-ins give" : "of the real records"} is shown for “${everyKind}”; data_contact shows only Contacts`,
    found.length === DATA_SECTIONS.length && only.length === 1 && only[0] === "search-data-contact",
    { found, only },
  );
  await kit.audit("search-data-one-kind");

  // ---------------------------------------------------------------- S5: an intern
  if (kit.pass.first) {
    const browser = page.context().browser();
    if (browser) {
      const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const intern = await other.newPage();
      const path = `/search?q=${encodeURIComponent(chosen.word)}`;
      await intern.goto(
        `${kit.base}/dev/signin?as=intern%40hq.test&next=${encodeURIComponent(path)}`,
        { waitUntil: "networkidle" },
      );
      await intern.goto(`${kit.base}${path}`, { waitUntil: "networkidle" });
      const text = await intern.locator("main").first().innerText();
      kit.check(
        "search S5: an intern's search has no All leads and not the lead's address",
        (await intern.locator("section[aria-labelledby='search-data-lead']").count()) === 0 &&
          !text.includes("All leads") &&
          !text.includes(chosen.email),
        text.slice(0, 200),
      );
      await other.close();
    }
  }
}
