/**
 * Investors, walked against the stand-in: the first visit's "Choose the investor list"
 * making one firm per domain at "Written to" for those the live mailing wrote to (I1), a
 * reply from an investor address moving the firm to Replied and leaving the waitlist
 * alone, a No reaching Mail merge's stop list, a stage moved and an amount recorded on a
 * firm's page, money shown per currency, the CSV, the "Investor" badge on a lead, and no
 * target, bar or percentage anywhere (I4).
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

/** I4: nothing on the page measures the raise against anything. */
async function noTarget(page: Page, kit: WalkKit, where: string): Promise<void> {
  const text = flat(await kit.text());
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
}
