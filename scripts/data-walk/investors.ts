/**
 * Investors, walked against the stand-in: the first visit's "Choose the investor list"
 * making one firm per domain at "Written to" for those the live mailing wrote to (I1), a
 * reply from an investor address moving the firm to Replied and leaving the waitlist
 * alone, a No reaching Mail merge's stop list, a stage moved and an amount recorded on a
 * firm's page, money shown per currency, the CSV, the "Investor" badge on a lead, and no
 * target, bar or percentage anywhere (I4).
 *
 * The raise batch (raise spec §5.10, I5–I16): the Funnel view against the service's own
 * answer, amounts per currency, Qualify, a Made introduction, "Set the wave" on a search,
 * an offer deadline in Due, the deck link, the round, "The raise" on /data, the intern
 * kept out, the CSV's new columns, and no "Add a note" of the firm page's own. The figures
 * move between passes, so every check compares the page with the service, never a number.
 *
 * The invented investor list mixes people "Walk 01" already wrote to (partner281 … 288,
 * whom no other walk uses) with firms never written to, and an angel on a personal
 * domain. Every person is invented, on `.example`.
 */

import { createHash } from "node:crypto";
import { request } from "node:http";

import type { Page } from "playwright";

import { WALKER, type Shot, type WalkKit } from "./kit";

export const INVESTOR_LIST = "Walk investors - pitch list";

const investorIdOf = (firmKey: string): string =>
  createHash("sha256").update(`investor:${firmKey}`).digest("hex").slice(0, 32);
const leadIdOf = (email: string): string =>
  createHash("sha256").update(`lead:${email}`).digest("hex").slice(0, 32);

/** Walk 01's people from 281 to 288: the live mailing wrote to every one of them. */
const WRITTEN = [281, 282, 283, 284, 285, 286, 287, 288];

function investorCsv(): string {
  const rows = ["Email,First Name,Last Name,Title,Company,Tier,Category,Email Kind"];
  for (const n of WRITTEN)
    rows.push(
      `partner${n}@fund${n}.example,Asha${n},Rao${n},${n % 7 === 0 ? "Managing partner" : "Partner"},Walk Fund ${n},${(n % 3) + 1},Seed VC,named`,
    );
  rows.push(
    "analyst281@fund281.example,Dev,Menon,Analyst,Walk Fund 281,1,Seed VC,named",
    "gp1@seedhouse.example,Isha,Bose,General partner,Seed House,1,Seed VC,named",
    "gp2@seedhouse.example,Kabir,Shah,Principal,Seed House,1,Seed VC,named",
    "gp@earlyfund.example,Nina,Iyer,General partner,Early Fund,2,Micro VC,named",
    "partner@ridgecap.example,Omar,Khan,Partner,Ridge Capital,2,Family office,named",
    "angel.one@inbox.example,Tara,Nair,Angel investor,,3,Angel,personal-domain",
  );
  return `${rows.join("\n")}\n`;
}

/** Twelve firms: the eight written to, three not, and the angel (a firm of one). */
const FIRMS = 12;
const WRITTEN_FIRMS = 8;

export const shots: Shot[] = [
  { name: "data-investors", path: "/data/investors", ready: "#table-investors" },
  {
    name: "data-investor",
    path: `/data/investors/${investorIdOf("fund281.example")}`,
    ready: '[data-section="investor-activity"]',
  },
  { name: "data-investors-funnel", path: "/data/investors?view=funnel", ready: "#table-funnel" },
  { name: "data-investors-round", path: "/data/investors?view=round", ready: ".hqdata-round" },
];

type Answer = { status: number; body: Record<string, unknown> };

function ask(
  socket: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const text = body === undefined ? undefined : JSON.stringify(body);
    const outgoing = request(
      {
        socketPath: socket,
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

type Setup = { lists: { id: string; name: string }[]; chosen: { list_ids: string[] } };

async function setup(socket: string): Promise<Setup> {
  return (await ask(socket, "GET", "/data/investors/setup")).body as unknown as Setup;
}

/** The invented list's id, once Mail merge has it and Data has seen it. */
async function investorList(socket: string): Promise<string> {
  for (let tries = 0; tries < 100; tries += 1) {
    const found = (await setup(socket)).lists?.find((list) => list.name === INVESTOR_LIST);
    if (found) return found.id;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return "";
}

/** The invented investor list into Mail merge (through Data's engine bridge), then chosen. */
export async function seed(socketPath: string): Promise<void> {
  if ((await ask(socketPath, "GET", "/data/investors/setup")).status !== 200) {
    console.log("[walk] investors: the module is not loaded here");
    return;
  }
  let id = await (async () => {
    const known = (await setup(socketPath)).lists?.find((list) => list.name === INVESTOR_LIST);
    return known?.id ?? "";
  })();
  if (!id) {
    const imported = await ask(socketPath, "POST", "/data/_test/engine", {
      call: "importList",
      args: { name: INVESTOR_LIST, file_name: "walk-investors.csv", text: investorCsv() },
      by: WALKER,
    });
    if (imported.status !== 200) {
      console.log(`[walk] investors: the list could not be imported (${imported.status})`);
      return;
    }
    id = await investorList(socketPath);
  }
  const chosen = await ask(socketPath, "POST", "/data/investors/setup", {
    list_ids: [id],
    by: WALKER,
  });
  console.log(`[walk] investors: ${JSON.stringify({ firms: chosen.body.firms })}`);
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();

function passIndex(kit: WalkKit): number {
  return (kit.pass.width === "phone" ? 2 : 0) + (kit.pass.theme === "light" ? 1 : 0);
}

/** "$50,000 · ₹2,500,000": per currency, sorted by code, as the page's `formatMoneyBy`. */
function moneyText(values: Record<string, number>): string {
  const parts = Object.entries(values)
    .filter(([, amount]) => amount > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) =>
      new Intl.NumberFormat("en", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
        minimumFractionDigits: 0,
      }).format(amount),
    );
  return parts.length ? parts.join(" · ") : "None recorded";
}

type Money = Record<string, { soft: number; signed_and_in: number }>;

/** The one sentence that names a target, to say there is none: the Investors page's About. */
const NO_TARGET = "There is no target.";

/** I4: nothing on the page measures the raise against anything. */
async function noTarget(page: Page, kit: WalkKit, where: string): Promise<void> {
  const text = flat(await kit.text()).replace(NO_TARGET, "");
  const meters = await page.evaluate(
    () =>
      document.querySelectorAll(
        'main [role="progressbar"], main [role="meter"], main progress, main meter, main .meter, main .bar-chart',
      ).length,
  );
  kit.check(
    `investors I4: no target, bar or percentage on ${where}`,
    meters === 0 && !text.includes("%") && !/\b(target|goal|of goal|raised so far)\b/i.test(text),
    `${meters} meters · ${(/.{0,40}(%|target|goal).{0,40}/i.exec(text) ?? [""])[0]}`,
  );
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  const pass = passIndex(kit);
  if ((await kit.socket.ask("GET", "/data/investors/setup")).status !== 200) {
    kit.check("investors: not loaded in this service", true);
    return;
  }
  const listId = await investorList(kit.socket.path);
  kit.check("investors: the invented investor list is in Mail merge", listId !== "", listId);

  // ---------------------------------------------------------------- I1: the first visit
  if (kit.pass.first) {
    await kit.socket.ask("POST", "/data/_test/investors/reset", { by: WALKER });
    await page.goto(`${kit.base}/data/investors`, { waitUntil: "networkidle" });
    await page.waitForSelector("#investor-list", { timeout: 30_000 });
    let text = flat(await kit.text());
    kit.check(
      "investors: the first visit asks for the investor list",
      text.includes("Choose the investor list") &&
        (await page.locator("button", { hasText: "Use this list" }).count()) === 1,
      text.slice(0, 200),
    );
    await kit.audit("investors-first-visit");
    await page.selectOption("#investor-list", listId);
    await page.locator("button", { hasText: "Use this list" }).click();
    // The chooser gives way to the list once the firms are grouped.
    await page.waitForSelector("#table-investors", { timeout: 30_000 });
    await page.goto(`${kit.base}/data/investors`, { waitUntil: "networkidle" });
    await page.waitForSelector("#table-investors", { timeout: 30_000 });
    text = flat(await kit.text());
    const book = (await kit.socket.ask("GET", "/data/investors")).body;
    const counts = book.counts as Record<string, number>;
    kit.check(
      `investors I1: choosing the list makes one firm per domain, ${WRITTEN_FIRMS} at Written to for those sent`,
      book.total === FIRMS &&
        counts.written === WRITTEN_FIRMS &&
        counts.not_written === FIRMS - WRITTEN_FIRMS &&
        text.includes(`${FIRMS} firms`) &&
        text.includes(`Written to ${WRITTEN_FIRMS}`) &&
        text.includes(`Not written to yet ${FIRMS - WRITTEN_FIRMS}`),
      `${String(book.total)} · ${JSON.stringify(counts)}`,
    );
    const angel = (
      await kit.socket.ask("GET", `/data/investors/${investorIdOf("mail:angel.one@inbox.example")}`)
    ).body.investor as { firm?: string; free_mail?: boolean } | undefined;
    kit.check(
      "investors I1: an angel on a personal domain is a firm of one",
      angel?.firm === "Tara Nair" && angel.free_mail === true,
      angel,
    );
  } else if ((await setup(kit.socket.path)).chosen.list_ids.length === 0) {
    await kit.socket.ask("POST", "/data/investors/setup", { list_ids: [listId], by: WALKER });
  }

  // ---------------------------------------------------------------- the list
  await page.goto(`${kit.base}/data/investors`, { waitUntil: "networkidle" });
  await page.waitForSelector("#table-investors", { timeout: 30_000 });
  let text = flat(await kit.text());
  kit.check(
    "investors: the readouts are counts and per-currency sums",
    ["Firms", "Written to", "Replied", "Meetings", "Soft commits", "Signed and money in"].every(
      (label) => new RegExp(label, "i").test(text),
    ),
    text.slice(0, 240),
  );
  await noTarget(page, kit, "the list");
  await kit.audit("investors");

  // ---------------------------------------------------------------- a Yes and a No (I2, E)
  const yes = `partner${281 + pass}@fund${281 + pass}.example`;
  const no = `partner${285 + pass}@fund${285 + pass}.example`;
  const record = (email: string, outcome: string) =>
    kit.socket.ask("POST", "/data/replies", {
      email,
      outcome,
      words: "Invented words for the walk.",
      subject: "Re: A note",
      received_at: new Date().toISOString(),
      add_if_missing: false,
      by: WALKER,
    });
  const waitlistBefore = (await kit.socket.ask("GET", "/data/_test/waitlist")).body.joins as
    unknown[] | undefined;
  const said = await record(yes, "replied_positive");
  const effects = ((said.body.reply as { effects?: { kind: string; to?: string }[] } | undefined)
    ?.effects ?? []) as { kind: string; to?: string }[];
  const waitlistAfter = (await kit.socket.ask("GET", "/data/_test/waitlist")).body.joins as
    unknown[] | undefined;
  kit.check(
    "investors I2: a Yes from an investor address moves the firm to Replied, not the waitlist",
    said.status === 200 &&
      String(said.body.message).includes("moves to Replied in Investors, not the waitlist") &&
      effects.some((effect) => effect.kind === "investor_stage" && effect.to === "replied") &&
      !effects.some((effect) => effect.kind === "waitlist_joined") &&
      (waitlistAfter?.length ?? 0) === (waitlistBefore?.length ?? 0),
    said.body,
  );
  const refused = await record(no, "not_interested");
  const stops =
    ((await kit.socket.ask("GET", "/stops")).body.stops as
      { email: string; reason: string }[] | undefined) ?? [];
  const passed = (await kit.socket.ask("GET", `/data/investors/${investorIdOf(no.split("@")[1]!)}`))
    .body.investor as { stage?: string; passed_reason?: string } | undefined;
  kit.check(
    "investors: a No passes the firm (No reason given) and puts the address on Mail merge's stop list",
    refused.status === 200 &&
      passed?.stage === "passed" &&
      passed.passed_reason === "none_given" &&
      stops.some((stop) => stop.email === no && stop.reason === "asked"),
    `${passed?.stage} · ${stops.length} stops`,
  );

  // ---------------------------------------------------------------- one firm's page
  const firmKey = yes.split("@")[1]!;
  const firmId = investorIdOf(firmKey);
  await page.goto(`${kit.base}/data/investors/${firmId}`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-section="investor-activity"]', { timeout: 30_000 });
  text = flat(await kit.text());
  const lower = text.toLowerCase();
  kit.check(
    "investors: the firm's page shows its stage, next step, what was sent and the reply",
    ["replied", "book a meeting", "what was sent", "walk live 01", "from the list", "tier"].every(
      (words) => lower.includes(words),
    ) && text.includes("Invented words for the walk."),
    text.slice(0, 240),
  );
  // Move it to Meeting booked through the popover, as a person would.
  await page.locator("summary", { hasText: "Move to a stage" }).click();
  const stageForm = page.locator("form", { has: page.locator('select[name="stage"]') });
  await stageForm.locator('select[name="stage"]').selectOption("meeting");
  await stageForm.locator('input[name="next_step"]').fill("Hold the first call");
  const today = String((await kit.socket.ask("GET", "/data/_test/day")).body.day ?? "");
  await stageForm.locator('input[name="next_step_on"]').fill(today);
  await stageForm.locator("button", { hasText: "Move it" }).click();
  let moved: { stage?: string; next_step?: string } | undefined;
  for (let tries = 0; tries < 100; tries += 1) {
    moved = (await kit.socket.ask("GET", `/data/investors/${firmId}`)).body
      .investor as typeof moved;
    if (moved?.stage === "meeting") break;
    await page.waitForTimeout(100);
  }
  kit.check(
    "investors: Move to a stage asks for the next step and its day, and moves it",
    moved?.stage === "meeting" && moved.next_step === "Hold the first call",
    moved,
  );
  // Record an amount: each pass in its own currency, so the sums show both, never added.
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Record an amount" }).click();
  const amountForm = page.locator("form", { has: page.locator("#amount-value") });
  await amountForm.locator("#amount-state").selectOption("soft");
  await amountForm.locator("#amount-value").fill(pass % 2 === 0 ? "50000" : "2500000");
  await amountForm.locator("#amount-currency").selectOption(pass % 2 === 0 ? "USD" : "INR");
  await amountForm.locator("#amount-instrument").selectOption("SAFE");
  await amountForm.locator("button", { hasText: "Record it" }).click();
  let amounts = 0;
  for (let tries = 0; tries < 100; tries += 1) {
    const investor = (await kit.socket.ask("GET", `/data/investors/${firmId}`)).body.investor as
      { amounts?: unknown[] } | undefined;
    amounts = investor?.amounts?.length ?? 0;
    if (amounts > 0) break;
    await page.waitForTimeout(100);
  }
  kit.check("investors: Record an amount keeps it, in its own currency", amounts === 1, amounts);
  await page.reload({ waitUntil: "networkidle" });
  await noTarget(page, kit, "a firm's page");
  await kit.audit("investor");

  // ---------------------------------------------------------------- I3 on the page
  const book = (await kit.socket.ask("GET", "/data/investors")).body;
  const money = book.money as Money;
  const soft = Object.fromEntries(Object.entries(money).map(([key, sums]) => [key, sums.soft]));
  await page.goto(`${kit.base}/data/investors`, { waitUntil: "networkidle" });
  await page.waitForSelector("#table-investors", { timeout: 30_000 });
  text = flat(await kit.text());
  kit.check(
    "investors I3: soft commits are shown per currency, never added across them",
    text.includes(moneyText(soft)) && Object.keys(money).length >= 1,
    `${moneyText(soft)} · ${text.slice(0, 200)}`,
  );
  await noTarget(page, kit, "the list with amounts");

  // ---------------------------------------------------------------- the badge and the CSV
  await page.goto(`${kit.base}/data/leads/${leadIdOf(yes)}`, { waitUntil: "networkidle" });
  text = flat(await kit.text());
  kit.check(
    "investors: the lead wears the Investor badge and links to the firm",
    text.includes("Investor") &&
      (await page.locator(`a[href="/data/investors/${firmId}"]`).count()) >= 1,
    text.slice(0, 160),
  );
  const csv = await page.request.get(`${kit.base}/data/investors/export`);
  const body = await csv.text();
  kit.check(
    "investors: Download (CSV) gives every firm, with no address in it",
    csv.status() === 200 &&
      (csv.headers()["content-type"] ?? "").startsWith("text/csv") &&
      body.startsWith("﻿firm,domain,stage") &&
      !body.includes("@") &&
      body.split("\r\n").filter(Boolean).length === Number(book.total) + 1,
    `${csv.status()} ${body.slice(0, 80)}`,
  );
  const header = body.replace(/^\ufeff/, "").split("\r\n")[0] ?? "";
  kit.check(
    "investors I15: the CSV keeps its columns and appends the raise's at the end",
    header.startsWith("firm,domain,stage,since,") &&
      header.endsWith(`,owner,${RAISE_COLUMNS.join(",")}`),
    header.slice(-160),
  );

  await raise(page, kit, pass);
}

const RAISE_COLUMNS = [
  "wave",
  "introduced",
  "intro_status",
  "introducer",
  "intro_on",
  "cheque_min",
  "cheque_max",
  "cheque_currency",
  "stage_focus",
  "sectors",
  "geography",
  "lead_or_follow",
  "conflict",
  "residency",
  "can_invest_india",
  "last_replied",
  "last_met",
  "offer_deadline",
  "deck_link",
];

const count = (value: number) => value.toLocaleString("en-GB");

type FunnelAnswer = {
  firms: number;
  days_since_first_send: number | null;
  stages: { stage: string; now: number; reached: number; of: number }[];
  money: Record<string, Record<string, { amount: number; firms: number }>>;
  by_intro: { key: string; firms: number }[];
};

async function funnelOf(kit: WalkKit): Promise<FunnelAnswer> {
  return (await kit.socket.ask("GET", "/data/raise/funnel")).body.funnel as FunnelAnswer;
}

/** The cells of a table, by its caption's id, row by row. */
async function cells(page: Page, tableId: string): Promise<string[][]> {
  return page.evaluate(
    (id) =>
      [...document.querySelectorAll(`#${id} tbody tr`)].map((row) =>
        [...row.querySelectorAll("td")].map((cell) =>
          (cell.textContent ?? "").replace(/\s+/g, " ").trim(),
        ),
      ),
    tableId,
  );
}

/** Wait until the service says what the page was asked to do. */
async function until(page: Page, condition: () => Promise<boolean>, tries = 100): Promise<boolean> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    if (await condition()) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

type Detail = {
  investor?: {
    firm?: string;
    wave?: string;
    deck_link?: string;
    offer_deadline?: string | null;
    intro?: { status?: string; introducer?: string };
    profile?: Record<string, unknown>;
  };
};

async function detailOf(kit: WalkKit, investorId: string): Promise<Detail> {
  return (await kit.socket.ask("GET", `/data/investors/${investorId}`)).body as Detail;
}

/** One inline field on the firm's side: open it, type, press Enter. */
async function inline(page: Page, label: string, name: string, value: string): Promise<void> {
  await page.getByRole("button", { name: `Edit ${label}`, exact: true }).click();
  const input = page.locator(`#inline-investor_id-${name}`);
  await input.fill(value);
  await input.press("Enter");
}

/**
 * This field's own "Saved", once the editor has closed on the new value: the action has
 * answered, so leaving the page cannot cut it off half way.
 */
async function saved(page: Page, label: string): Promise<boolean> {
  const prop = page.locator(".prop", {
    has: page.locator("dt", { hasText: new RegExp(`^${label}$`) }),
  });
  return prop
    .locator(".prop__saved")
    .waitFor({ timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
}

/** Open a page and wait for its own selector, once more after a reload when it is slow. */
async function openAt(page: Page, url: string, ready: string): Promise<void> {
  await page.goto(url, { waitUntil: "networkidle" });
  const here = await page
    .waitForSelector(ready, { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (!here) {
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(ready, { timeout: 30_000 });
  }
}

async function raise(page: Page, kit: WalkKit, pass: number): Promise<void> {
  const today = String((await kit.socket.ask("GET", "/data/_test/day")).body.day ?? "");
  const firmId = investorIdOf("fund281.example");

  // ---------------------------------------------------------------- I5, I6: the Funnel view
  await page.goto(`${kit.base}/data/investors?view=funnel`, { waitUntil: "networkidle" });
  await page.waitForSelector("#table-funnel", { timeout: 30_000 });
  let funnel = await funnelOf(kit);
  const rows = await cells(page, "table-funnel");
  kit.check(
    "investors I5: the funnel has eight stages, each “of” the stage before as the service says",
    rows.length === 8 &&
      funnel.stages.length === 8 &&
      rows.every(
        (row, index) =>
          row[1] === count(funnel.stages[index]!.now) &&
          row[2] === count(funnel.stages[index]!.reached) &&
          row[3] ===
            `${count(funnel.stages[index]!.reached)} of ${count(funnel.stages[index]!.of)}`,
      ),
    rows.map((row) => row[3]).join(" | "),
  );
  const days = await page
    .locator(".stat", {
      has: page.locator(".stat__label", { hasText: "Days since the first send" }),
    })
    .locator(".stat__value")
    .innerText();
  kit.check(
    "investors I5: days since the first send is the service's",
    days.trim() ===
      (funnel.days_since_first_send === null
        ? "Not sent yet"
        : count(funnel.days_since_first_send)),
    `${days} · ${String(funnel.days_since_first_send)}`,
  );
  const currencies = Object.keys(funnel.money).sort();
  const money = currencies.length ? await cells(page, "table-amounts-by-state") : [];
  const heads = await page.evaluate(() =>
    [...document.querySelectorAll("#table-amounts-by-state thead th")].map((cell) =>
      (cell.textContent ?? "").trim(),
    ),
  );
  const symbols = (text: string) => (text.match(/[$₹]/g) ?? []).length;
  kit.check(
    "investors I6: the amounts table keeps each currency in its own column, never added",
    currencies.length === 0
      ? flat(await kit.text()).includes("No amounts recorded yet.")
      : JSON.stringify(heads) === JSON.stringify(["State", ...currencies]) &&
          money.length === 4 &&
          money.every(
            (row) =>
              row.length === currencies.length + 1 &&
              !/total|all currencies/i.test(row[0] ?? "") &&
              row.slice(1).every((cell) => symbols(cell) <= 1),
          ),
    `${heads.join(",")} · ${money.map((row) => row.join("/")).join(" | ")}`,
  );
  await noTarget(page, kit, "the funnel view");
  await kit.audit("investors-funnel");

  // ---------------------------------------------------------------- I7: Qualify
  await page.goto(`${kit.base}/data/investors/${firmId}`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-section="investor-activity"]', { timeout: 30_000 });
  await page.locator("summary", { hasText: /^Qualify$/ }).click();
  const qualify = page.locator("form", { has: page.locator("#qualify-min") });
  await qualify.locator("#qualify-min").fill("25000");
  await qualify.locator("#qualify-max").fill("100000");
  await qualify.locator("#qualify-currency").selectOption("USD");
  await qualify.locator("#qualify-stage-seed").check();
  await qualify.locator("#qualify-sectors").fill("fintech, data");
  await qualify.locator("#qualify-geo-india").check();
  await qualify.locator("#qualify-geo-us").check();
  await qualify.locator("#qualify-lead").selectOption("lead");
  await qualify.locator("#qualify-residency").selectOption("non_resident");
  await qualify.locator("#qualify-india").selectOption("yes");
  await qualify.locator('button[type="submit"]').click();
  const wanted = {
    cheque: { min: 25_000, max: 100_000, currency: "USD" },
    sectors: ["fintech", "data"],
    lead: "lead",
    residency: "non_resident",
    india_ok: "yes",
  };
  let profile: Record<string, unknown> | undefined;
  await until(page, async () => {
    profile = (await detailOf(kit, firmId)).investor?.profile;
    return JSON.stringify(profile?.cheque) === JSON.stringify(wanted.cheque);
  });
  await page.reload({ waitUntil: "networkidle" });
  const qualification = flat(
    await page.locator('section.props[aria-label="Qualification"]').innerText(),
  );
  kit.check(
    "investors I7: Qualify keeps the cheque, stages, sectors, geography, lead, residency and India",
    JSON.stringify(profile?.cheque) === JSON.stringify(wanted.cheque) &&
      (profile?.stages as string[] | undefined)?.includes("seed") === true &&
      JSON.stringify(profile?.sectors) === JSON.stringify(wanted.sectors) &&
      ["india", "us"].every((key) => (profile?.geography as string[] | undefined)?.includes(key)) &&
      profile?.lead === "lead" &&
      profile.residency === "non_resident" &&
      profile.india_ok === "yes" &&
      [
        "$25,000–$100,000",
        "Seed",
        "fintech, data",
        "India, United States",
        "Leads rounds",
        "Not resident in India",
        "Can invest into an Indian private company Yes",
      ].every((words) => qualification.includes(words)),
    qualification.slice(0, 240),
  );

  // ---------------------------------------------------------------- I16: no note form of its own
  const ownNote = await page.evaluate(
    () =>
      [...document.querySelectorAll("main button, main summary")].filter(
        (element) =>
          /add a note/i.test(element.textContent ?? "") &&
          !element.closest(".hqdata-investor__notes"),
      ).length + document.querySelectorAll('[data-section="investor-activity"] textarea').length,
  );
  kit.check("investors I16: the firm's page has no Add a note of its own", ownNote === 0, ownNote);

  // ---------------------------------------------------------------- I11: the deck link
  await inline(page, "Deck link", "deck_link", "http://deck.example/x");
  const deckRefused = await page
    .locator(".prop__error", { hasText: "Paste the whole link, starting https://." })
    .waitFor({ timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  const deckInput = page.locator("#inline-investor_id-deck_link");
  await deckInput.fill("https://deck.example/d/walk");
  await deckInput.press("Enter");
  await saved(page, "Deck link");
  await until(page, async () => (await detailOf(kit, firmId)).investor?.deck_link !== "");
  await page.reload({ waitUntil: "networkidle" });
  const deck = page.locator('a[href="https://deck.example/d/walk"]');
  const deckTarget = (await deck.count()) === 1 ? await deck.getAttribute("target") : null;
  const deckRel = (await deck.count()) === 1 ? ((await deck.getAttribute("rel")) ?? "") : "";
  kit.check(
    "investors I11: the deck link refuses http, keeps https, and opens in a new tab",
    deckRefused &&
      (await detailOf(kit, firmId)).investor?.deck_link === "https://deck.example/d/walk" &&
      (await deck.innerText()).includes("Open the deck link") &&
      deckTarget === "_blank" &&
      deckRel.includes("noopener"),
    `${String(deckRefused)} · ${String(deckTarget)} · ${deckRel}`,
  );

  // ---------------------------------------------------------------- I10: the offer deadline
  const deadline = new Date(`${today}T12:00:00Z`);
  deadline.setUTCDate(deadline.getUTCDate() + 2);
  const deadlineDay = deadline.toISOString().slice(0, 10);
  await inline(page, "Offer deadline", "offer_deadline", deadlineDay);
  await saved(page, "Offer deadline");
  await until(
    page,
    async () => (await detailOf(kit, firmId)).investor?.offer_deadline === deadlineDay,
  );
  const firmName = (await detailOf(kit, firmId)).investor?.firm ?? "";
  await openAt(page, `${kit.base}/data`, '[data-section="data-due"]');
  const due = flat(await page.locator('[data-section="data-due"]').innerText());
  const dueService = ((await kit.socket.ask("GET", "/data/overview")).body.due ?? []) as {
    key: string;
  }[];
  kit.check(
    "investors I10: an offer deadline two days ahead is in Due on /data",
    dueService.some((item) => item.key === `investor:${firmId}:offer`) &&
      due.includes(`Offer deadline: ${firmName}`),
    due.slice(0, 240),
  );

  // ---------------------------------------------------------------- I13: The raise on /data
  const overview = (await kit.socket.ask("GET", "/data/overview")).body.raise as
    { stages: { stage: string; now: number }[]; first_meetings_this_week: number } | undefined;
  const LABELS: Record<string, string> = {
    replied: "Replied",
    meeting: "Meeting booked",
    met: "Met",
    diligence: "Diligence",
    soft: "Soft commit",
    signed: "Signed",
    money_in: "Money in",
  };
  const raiseText = flat(await page.locator('[data-section="data-raise"]').innerText());
  const expected = (overview?.stages ?? [])
    .map((row) => `${LABELS[row.stage] ?? row.stage} ${count(row.now)}`)
    .join(" · ");
  kit.check(
    "investors I13: The raise on /data has the overview's counts",
    Boolean(overview) &&
      overview!.stages.length === 7 &&
      raiseText.includes(expected) &&
      raiseText.includes(`First meetings this week ${count(overview!.first_meetings_this_week)}`) &&
      (await page
        .locator('[data-section="data-raise"] a[href="/data/investors?view=funnel"]')
        .count()) === 1,
    `${expected} · ${raiseText.slice(0, 200)}`,
  );

  // ---------------------------------------------------------------- I8: a Made introduction
  const cold = (await kit.socket.ask("GET", "/data/investors?intro=cold")).body.investors as {
    investor_id: string;
    firm: string;
  }[];
  const target = cold[pass % Math.max(1, cold.length)] ?? cold[0];
  if (target) {
    funnel = await funnelOf(kit);
    const before = funnel.by_intro.find((split) => split.key === "warm")?.firms ?? 0;
    await page.goto(`${kit.base}/data/investors/${target.investor_id}`, {
      waitUntil: "networkidle",
    });
    await page.locator("summary", { hasText: /^Introduction$/ }).click();
    const intro = page.locator("form", { has: page.locator("#intro-status") });
    await intro.locator("#intro-status").selectOption("made");
    await intro.locator("#intro-name").fill("Walk Introducer");
    await intro.locator('button[type="submit"]').click();
    await until(
      page,
      async () => (await detailOf(kit, target.investor_id)).investor?.intro?.status === "made",
    );
    funnel = await funnelOf(kit);
    const after = funnel.by_intro.find((split) => split.key === "warm")?.firms ?? 0;
    await page.goto(`${kit.base}/data/investors?intro=warm`, { waitUntil: "networkidle" });
    await page.waitForSelector("#table-investors", { timeout: 30_000 });
    const row = flat(
      await page.locator("#table-investors tr", { hasText: target.firm }).first().innerText(),
    );
    kit.check(
      "investors I8: a Made introduction reads Introduced in the list and adds one to the funnel's",
      after === before + 1 && row.includes("Introduced"),
      `${before} → ${after} · ${row.slice(0, 160)}`,
    );
  } else kit.check("investors I8: a firm not yet introduced is here", false, cold);

  // ---------------------------------------------------------------- I9: Set the wave on a search
  const search = "Walk Fund";
  const listed = (await kit.socket.ask("GET", `/data/investors?q=${encodeURIComponent(search)}`))
    .body as { total: number; investors: { investor_id: string }[] };
  await page.goto(`${kit.base}/data/investors?q=${encodeURIComponent(search)}`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector("#table-investors", { timeout: 30_000 });
  await page.locator(".pagebar__actions summary", { hasText: /^More$/ }).click();
  await page.fill("#investors-set-wave", "Wave 1");
  await page.locator("button", { hasText: "Set the wave" }).click();
  const said = `Set “Wave 1” on ${count(listed.total)} ${listed.total === 1 ? "firm" : "firms"}.`;
  const saidIt = await kit
    .says(said, 20_000)
    .then(() => true)
    .catch(() => false);
  const waved = (
    await kit.socket.ask("GET", `/data/investors?wave=${encodeURIComponent("Wave 1")}`)
  ).body as { total: number; investors: { investor_id: string }[] };
  await page.goto(`${kit.base}/data/investors?wave=${encodeURIComponent("Wave 1")}`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector("#table-investors", { timeout: 30_000 });
  const shownRows = await page.locator("#table-investors tbody tr").count();
  const ids = new Set(waved.investors.map((row) => row.investor_id));
  kit.check(
    "investors I9: Set the wave on a search says the list's count, and the Wave filter shows those firms",
    saidIt &&
      listed.total > 0 &&
      listed.investors.every((row) => ids.has(row.investor_id)) &&
      waved.total === listed.total &&
      shownRows === Math.min(100, waved.total),
    `${said} · ${String(saidIt)} · ${waved.total} · ${shownRows}`,
  );

  // ---------------------------------------------------------------- I12: the round
  await page.goto(`${kit.base}/data/investors?view=round`, { waitUntil: "networkidle" });
  await page.waitForSelector(".hqdata-round", { timeout: 30_000 });
  await page
    .locator(".hqdata-round summary", { hasText: /^(Record|Change) the round$/ })
    .first()
    .click();
  const round = page.locator("form", { has: page.locator("#round-instrument") });
  await round.locator("#round-instrument").selectOption("iSAFE");
  await round.locator("#round-cap").fill("5000000");
  await round.locator("#round-cap-currency").selectOption("USD");
  await round.locator("#round-cap-basis").selectOption("post_money");
  await round.locator("#round-discount").fill("20");
  await round.locator("#round-mfn").check();
  await round.locator("#round-minimum").fill("25000");
  await round.locator("#round-minimum-currency").selectOption("USD");
  await round.locator('input[name="lead"][value="no"]').check();
  const savedBefore = (await kit.socket.ask("GET", "/data/raise/round")).body.history as unknown[];
  await round.locator('button[type="submit"]').click();
  await until(
    page,
    async () =>
      ((await kit.socket.ask("GET", "/data/raise/round")).body.history as unknown[]).length >
      savedBefore.length,
  );
  const terms = (await kit.socket.ask("GET", "/data/raise/round")).body.round as Record<
    string,
    unknown
  > | null;
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".hqdata-round", { timeout: 30_000 });
  const roundText = flat(await kit.text());
  kit.check(
    "investors I12: the round keeps its terms and says the discount as “20 per cent”",
    terms?.instrument === "iSAFE" &&
      terms.discount_percent === 20 &&
      terms.mfn === true &&
      terms.lead === "no" &&
      !Object.keys(terms).some((key) => /target|goal|range/i.test(key)) &&
      [
        "20 per cent",
        "$5,000,000, post-money",
        "$25,000",
        "Most favoured nation Yes",
        "Lead Not yet",
      ].every((words) => roundText.includes(words)),
    roundText.slice(0, 240),
  );
  await noTarget(page, kit, "the round view");
  await kit.audit("investors-round");

  // ---------------------------------------------------------------- I14: the intern
  if (kit.pass.first) {
    const browser = page.context().browser();
    if (browser) {
      const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const intern = await other.newPage();
      await intern.goto(
        `${kit.base}/dev/signin?as=intern%40hq.test&next=${encodeURIComponent("/data/investors?view=funnel")}`,
        { waitUntil: "networkidle" },
      );
      await intern.goto(`${kit.base}/data/investors?view=funnel`, { waitUntil: "networkidle" });
      const body = await intern.locator("main").first().innerText();
      kit.check(
        "investors I14: the intern sees “Data is for Owners and Admins.” on the funnel, and no address",
        body.includes("Data is for Owners and Admins.") &&
          !body.includes("@") &&
          (await intern.locator("#table-funnel").count()) === 0,
        body.slice(0, 160),
      );
      await other.close();
    } else kit.check("investors I14: a second browser context", false);
  }
}
